/**
 * 公式情報源の監視ランナー（決定的取得 → 変更検知 → 生成 → 保存 → 索引更新）。
 *
 *   npm run monitor              # 有効な全ソースを 1 回チェック
 *
 * GitHub Actions（日次 cron / 手動）と、ローカル実行の両方で使う単一エントリ。
 * 秘匿値はログに出力しない。無変更ページでは Gemini を呼ばない。
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

// env を読んでから import（config が env を参照するため動的 import）。
const { runMonitor } = await import("../lib/monitor/pipeline");
const { getEnabledSources } = await import("../lib/monitor/registry");
const { monitorConfig } = await import("../lib/monitor/config");

async function main() {
  const sources = getEnabledSources();
  console.log(
    `[monitor] start: ${sources.length} enabled sources | autoPublishLowRisk=${monitorConfig.autoPublishLowRisk} autoPublishHighRisk=${monitorConfig.autoPublishHighRisk}`,
  );

  const { ok, error, results } = await runMonitor();
  if (!ok) {
    console.error(`[monitor] ERROR: ${error}`);
    process.exit(1);
  }

  const counts: Record<string, number> = {};
  for (const r of results) counts[r.outcome] = (counts[r.outcome] ?? 0) + 1;

  console.log("\n[monitor] per-source results:");
  for (const r of results) {
    const extra = r.newsSlug ? ` slug=${r.newsSlug}` : "";
    const imp = r.impacts ? ` impacts=${r.impacts}` : "";
    const idx = r.indexed ? " indexed=yes" : "";
    console.log(`  - ${r.sourceId} [${r.outcome}] ${r.detail}${extra}${imp}${idx}`);
  }

  console.log("\n[monitor] summary:");
  for (const [k, v] of Object.entries(counts).sort()) {
    console.log(`  ${k}: ${v}`);
  }

  const failures = results.filter((r) => r.outcome === "failure").length;
  console.log(
    `\n[monitor] DONE. total=${results.length} failures=${failures} autoPublished=${counts["auto_published"] ?? 0} review=${counts["review"] ?? 0}`,
  );
  // 取得失敗があっても「変更なし」とは扱わない。ジョブは成功終了しつつ失敗件数を明示。
}

main().catch((err) => {
  console.error("[monitor] FATAL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
