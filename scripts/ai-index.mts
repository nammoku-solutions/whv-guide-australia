/**
 * 再現可能な AI ナレッジベースのインデックス作成コマンド。
 *
 *   npm run ai:index               # 変更分だけ埋め込み直して Supabase へ upsert
 *   npm run ai:index -- --dry-run  # 書き込みせず差分だけ表示
 *   npm run ai:index -- --changed  # （既定と同じ）変更分のみ
 *   npm run ai:reindex             # 全chunkを強制的に再埋め込み（埋め込みモデル更新時）
 *   npm run ai:reindex -- --embedding-version=v2
 *
 * 特徴:
 *   - content hash により、内容が変わった chunk だけ埋め込みを再生成する。
 *   - DB に存在するが現ソースに無い chunk（削除・非公開化）は取り除く。
 *   - lib/ai の実チャンク化ロジックを再利用（単一の真実の源）。
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// --- 最小限の .env.local ローダー（依存を増やさない） ---
function loadEnv(file: string) {
  const path = resolve(ROOT, file);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnv(".env.local");
loadEnv(".env");

// env を読んだ後に import（config が env を参照するため動的 import）。
const { buildAllChunks } = await import("../lib/ai/content-source");
const { embedTexts } = await import("../lib/ai/embeddings/provider");
const { getAiAdminClient } = await import("../lib/ai/server/supabaseAdmin");
const { aiConfig } = await import("../lib/ai/config");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const REINDEX = args.includes("--reindex");
const versionArg = args.find((a) => a.startsWith("--embedding-version="));
if (versionArg) {
  process.env.AI_EMBEDDING_VERSION = versionArg.split("=")[1];
}

const EMBED_BATCH = 100;
// バッチ間の待機（無償枠のレート制限を穏やかに回避）。
const BATCH_DELAY_MS = 3000;
// 429/5xx 時の再試行回数と既定の待機（分単位のクォータ回復を待つ）。
const MAX_RETRIES = 15;
const DEFAULT_BACKOFF_MS = 60000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * 埋め込みを再試行付きで生成する。429（クォータ超過）や 5xx では待機して再試行し、
 * 分単位のレート制限を跨いで完走できるようにする。既に upsert 済みの chunk は
 * content hash 差分でスキップされるため、中断・再実行しても安全（冪等）。
 */
async function embedWithRetry(texts: string[]): Promise<number[][]> {
  let attempt = 0;
  for (;;) {
    try {
      return await embedTexts(texts, "RETRIEVAL_DOCUMENT");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const is429 = msg.includes("(429)");
      const is5xx = /\(5\d\d\)/.test(msg);
      attempt++;
      if ((!is429 && !is5xx) || attempt > MAX_RETRIES) throw err;
      const m = msg.match(/retryDelay"?\s*:?\s*"?(\d+)s/);
      const waitMs = (m ? Number(m[1]) * 1000 : DEFAULT_BACKOFF_MS) + 1000;
      console.log(
        `[ai:index] rate-limited (attempt ${attempt}/${MAX_RETRIES}); waiting ${Math.round(waitMs / 1000)}s…`,
      );
      await sleep(waitMs);
    }
  }
}

async function main() {
  const version = aiConfig.embedding.version;
  console.log(
    `[ai:index] provider=${aiConfig.embedding.provider} model=${aiConfig.embedding.model} dims=${aiConfig.embedding.dimensions} version=${version}${REINDEX ? " (REINDEX)" : ""}${DRY_RUN ? " (DRY-RUN)" : ""}`,
  );

  const chunks = buildAllChunks();
  console.log(`[ai:index] built ${chunks.length} chunks from published articles`);

  const admin = getAiAdminClient();
  if (!admin) {
    console.error(
      "[ai:index] ERROR: Supabase service-role env is not configured (SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL).",
    );
    process.exit(1);
  }

  // 既存 chunk（現バージョン）の hash を取得。
  const existing = new Map<string, string>();
  {
    const { data, error } = await admin
      .from("ai_article_chunks")
      .select("chunk_id, content_hash")
      .eq("embedding_version", version);
    if (error) {
      console.error("[ai:index] ERROR reading existing chunks:", error.message);
      process.exit(1);
    }
    for (const row of data ?? []) existing.set(row.chunk_id, row.content_hash);
  }

  const sourceIds = new Set(chunks.map((c) => c.chunkId));
  const toEmbed = REINDEX
    ? chunks
    : chunks.filter((c) => existing.get(c.chunkId) !== c.contentHash);
  const staleIds = [...existing.keys()].filter((id) => !sourceIds.has(id));

  console.log(
    `[ai:index] new/changed=${toEmbed.length} unchanged=${chunks.length - toEmbed.length} stale-to-remove=${staleIds.length}`,
  );

  if (DRY_RUN) {
    for (const c of toEmbed.slice(0, 20)) {
      console.log(`  + ${c.chunkId} (${c.heading})`);
    }
    if (toEmbed.length > 20) console.log(`  … +${toEmbed.length - 20} more`);
    for (const id of staleIds.slice(0, 20)) console.log(`  - ${id}`);
    console.log("[ai:index] dry-run complete (no writes).");
    return;
  }

  // 変更分の埋め込みを生成して upsert。
  let embedded = 0;
  const batches = chunk(toEmbed, EMBED_BATCH);
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    const vectors = await embedWithRetry(batch.map((c) => c.content));
    const rows = batch.map((c, i) => ({
      chunk_id: c.chunkId,
      article_id: c.articleId,
      title: c.title,
      slug: c.slug,
      url: c.url,
      category: c.category,
      heading: c.heading,
      chunk_index: c.chunkIndex,
      content: c.content,
      content_hash: c.contentHash,
      updated_at: c.updatedAt,
      risk_level: c.riskLevel,
      embedding_provider: aiConfig.embedding.provider,
      embedding_model: aiConfig.embedding.model,
      embedding_version: version,
      embedding: vectors[i],
    }));
    const { error } = await admin
      .from("ai_article_chunks")
      .upsert(rows, { onConflict: "chunk_id" });
    if (error) {
      console.error("[ai:index] ERROR upserting batch:", error.message);
      process.exit(1);
    }
    embedded += rows.length;
    console.log(`[ai:index] upserted ${embedded}/${toEmbed.length}`);
    if (b < batches.length - 1) await sleep(BATCH_DELAY_MS);
  }

  // 古い chunk を削除。
  if (staleIds.length > 0) {
    const { error } = await admin
      .from("ai_article_chunks")
      .delete()
      .in("chunk_id", staleIds);
    if (error) {
      console.error("[ai:index] ERROR removing stale chunks:", error.message);
      process.exit(1);
    }
    console.log(`[ai:index] removed ${staleIds.length} stale chunks`);
  }

  console.log(
    `[ai:index] DONE. embedded=${embedded} removed=${staleIds.length} total-source-chunks=${chunks.length}`,
  );
}

main().catch((err) => {
  console.error("[ai:index] FATAL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
