/**
 * 手動シード（Manual Seed）ランナー（CLI）。オペレータが公式 URL（と必要に応じて
 * 公式本文）を与え、既存の歴史的バックフィルパイプラインに流し込む。
 *
 *   npm run news:backfill:seed -- --url "https://immi.homeaffairs.gov.au/..." --dry-run
 *   npm run news:backfill:seed -- --url "https://..." --url "https://..." --apply
 *   npm run news:backfill:seed -- --file news-backfill-seeds.local.json --dry-run
 *   npm run news:backfill:seed -- --file news-backfill-seeds.local.json --from 2026-06-01 --to 2026-08-16 --apply
 *
 * 既定は dry-run（News・AI 索引・監視ベースラインに書き込まない）。--apply で実書き込み。
 * これは日次モニタの置き換えでも、自動アーカイブ探索（news:backfill）の置き換えでもない。
 * 生の政府本文・秘匿値はコンソールに出力しない。
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { SeedInput } from "../lib/monitor/backfill/seed";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function loadEnv(file: string) {
  const path = resolve(ROOT, file);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnv(".env.local");
loadEnv(".env");

function getArgAll(name: string): string[] {
  const out: string[] = [];
  const argv = process.argv;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === `--${name}` && i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
      out.push(argv[i + 1]);
    }
  }
  return out;
}
function getArg(name: string): string | undefined {
  return getArgAll(name)[0];
}
function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const { validateRange, isValidDateString } = await import("../lib/monitor/backfill/dates");
const { runSeedBackfill } = await import("../lib/monitor/backfill/seed");

const RESULT_LABEL: Record<string, string> = {
  published: "公開",
  review_required: "レビュー要",
  duplicate: "重複",
  skipped_unrelated: "スキップ(無関係)",
  skipped_weak: "スキップ(弱関連)",
  skipped_grounding: "スキップ(grounding)",
  skipped_no_date: "スキップ(日付なし)",
  skipped_thin: "スキップ(内容薄)",
  invalid_url: "無効URL",
  invalid_source: "非公式ソース",
  fetch_blocked: "取得ブロック",
  timeout: "タイムアウト",
  missing_title: "タイトル不足",
  missing_content: "本文不足",
  invalid_date: "日付不正",
  out_of_range: "範囲外",
  content_conflict: "content/contentFile 競合",
  content_file_error: "contentFile エラー",
  error: "エラー",
};

type RawSeed = Partial<SeedInput> & { url?: string };

function readSeedFile(file: string): SeedInput[] {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) {
    throw new Error(`シードファイルが見つかりません: ${file}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw new Error(`シードファイルの JSON を解釈できません: ${e instanceof Error ? e.message : e}`);
  }
  if (!Array.isArray(parsed)) throw new Error("シードファイルは JSON 配列である必要があります。");
  return (parsed as RawSeed[]).map((s) => ({
    url: String(s.url ?? "").trim(),
    title: s.title ?? null,
    publishedAt: s.publishedAt ?? null,
    content: s.content ?? null,
    contentFile: s.contentFile ?? null,
  }));
}

function printUsage() {
  console.log(`Manual Seed（手動シード）— 公式 URL を既存バックフィルパイプラインへ投入します。

使い方:
  npm run news:backfill:seed -- --url "<OFFICIAL_URL>" --dry-run
  npm run news:backfill:seed -- --url "<URL>" --url "<URL>" --apply
  npm run news:backfill:seed -- --file news-backfill-seeds.local.json --dry-run
  npm run news:backfill:seed -- --file <file> --from 2026-06-01 --to 2026-08-16 --apply

オプション:
  --url <URL>         公式 URL（複数指定可）
  --file <path>       シード JSON 配列（[{url,title?,publishedAt?,content?,contentFile?}]）
  --from / --to       任意の公式日レンジ（範囲外シードは拒否）
  --dry-run           既定。書き込みなし
  --apply             実書き込み（要 Supabase service-role + migration 0012/0013）
  --allow-wide-range  --from/--to が広い場合の明示許可

contentFile: 公式本文を貼り付けた UTF-8 .txt へのリポジトリルート相対パス。
  content と contentFile の同時指定は不可。長文は contentFile を推奨。

まず --dry-run を実行し、問題なければ --apply してください。`);
}

async function main() {
  if (hasFlag("help") || hasFlag("h")) {
    printUsage();
    process.exit(0);
  }

  const apply = hasFlag("apply");
  const mode: "dry_run" | "apply" = apply ? "apply" : "dry_run";
  const from = getArg("from");
  const to = getArg("to");
  const allowWide = hasFlag("allow-wide-range");

  // 範囲が指定された場合のみ検証。
  if (from || to) {
    if (!from || !to) {
      console.error("[seed] --from と --to は両方指定してください（片方だけは不可）。");
      process.exit(2);
    }
    const valid = validateRange(from, to, 400, allowWide);
    if (!valid.ok) {
      console.error(`[seed] 範囲エラー: ${valid.error}`);
      process.exit(2);
    }
  }
  if (from && !isValidDateString(from)) {
    console.error(`[seed] --from が不正: ${from}`);
    process.exit(2);
  }

  // シード収集: --file と --url を併合。
  const seeds: SeedInput[] = [];
  const file = getArg("file");
  if (file) {
    try {
      seeds.push(...readSeedFile(file));
    } catch (e) {
      console.error(`[seed] ${e instanceof Error ? e.message : e}`);
      process.exit(2);
    }
  }
  for (const u of getArgAll("url")) seeds.push({ url: u });

  if (seeds.length === 0) {
    console.log("[seed] シードが指定されていません。--url または --file を指定してください。\n");
    printUsage();
    process.exit(0); // シード未指定はエラー扱いにしない。
  }

  console.log(`[seed] mode=${mode} seeds=${seeds.length}${from ? ` range=${from}→${to}` : ""}`);
  if (mode === "dry_run") console.log("[seed] dry-run: News・AI 索引・監視ベースラインへの書き込みは行いません。");

  const report = await runSeedBackfill({ seeds, from, to, mode, seedBaseDir: ROOT, deps: {} });

  console.log("\n==== 手動シード バックフィル レポート ====");
  console.log(`Mode: ${report.mode}${report.from ? `  Range: ${report.from} → ${report.to}` : ""}`);
  console.log(`Total seeds:              ${report.totalSeeds}`);
  console.log(`Published (low/med):      ${report.publishedCount}`);
  console.log(`Review required:          ${report.reviewRequiredCount}`);
  console.log(`Duplicates:               ${report.duplicateCount}`);
  console.log(`Skipped weak/unrelated:   ${report.skippedCount}`);
  console.log(`Fetch/metadata failures:  ${report.fetchFailedCount}`);
  console.log(`Invalid source/url:       ${report.invalidCount}`);
  console.log(`Errors:                   ${report.errorCount}`);
  console.log(`Article impacts created:  ${report.impactsCreated}`);
  console.log(`AI news chunks indexed:   ${report.indexedCount}`);
  console.log(`Live-monitor baseline untouched: ${report.liveMonitorBaselineUntouched ? "YES" : "NO"}`);

  console.log("\n-- シード別 --");
  for (const s of report.seeds) {
    const label = RESULT_LABEL[s.result] ?? s.result;
    const date = s.officialDate ? `${s.officialDate} ` : "";
    const org = s.organisation ? `${s.organisation} ` : "";
    const title = s.title ? (s.title.length > 50 ? s.title.slice(0, 47) + "…" : s.title) : s.inputUrl;
    console.log(`  [${label}] ${date}${org}${title}`);
    if (s.result !== "published" && s.result !== "review_required" && s.result !== "duplicate") {
      console.log(`      → ${s.detail}`);
    }
  }

  if (report.notes.length > 0) {
    console.log("\n-- 注記 --");
    for (const n of report.notes) console.log(`  * ${n}`);
  }

  console.log("\n[seed] DONE.");
  // 期待される運用条件（非公式・取得ブロック等）は非ゼロ終了にしない。
  const hardErrors = report.seeds.filter((s) => s.result === "error").length;
  process.exit(hardErrors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("[seed] FATAL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
