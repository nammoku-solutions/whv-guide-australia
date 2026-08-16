/**
 * 公式情報源の監視ランナー（決定的取得 → 変更検知 → 生成 → 保存 → 索引更新）。
 *
 *   npm run monitor              # 有効な全ソースを 1 回チェック
 *
 * GitHub Actions（日次 cron / 手動）と、ローカル実行の両方で使う単一エントリ。
 * 秘匿値はログに出力しない。無変更ページでは Gemini を呼ばない。
 */
import { readFileSync, existsSync, appendFileSync } from "node:fs";
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

  console.log("\n[monitor] per-source results:");
  for (const r of results) {
    const extra = r.newsSlug ? ` slug=${r.newsSlug}` : "";
    const imp = r.impacts ? ` impacts=${r.impacts}` : "";
    const idx = r.indexed ? " indexed=yes" : "";
    console.log(`  - ${r.sourceId} [${r.outcome}] ${r.detail}${extra}${imp}${idx}`);
  }

  // 取得健全性の集計（失敗を「変更なし」に丸めない）。fetchStatus 由来。
  const { summariseRun } = await import("../lib/monitor/health");
  const s = summariseRun(results);
  const summaryLines = [
    "Monitor run:",
    `Sources: ${s.total}`,
    `Success (fetched): ${s.success}`,
    `Blocked: ${s.blocked}`,
    `Timeout: ${s.timeout}`,
    `HTTP error: ${s.httpError}`,
    `Parse/structure error: ${s.parseError}`,
    `Meaningful changes: ${s.meaningfulChanges}`,
    `News generated: ${s.newsGenerated}`,
    `Review required: ${s.reviewRequired}`,
    `Published: ${s.published}`,
  ];
  console.log("\n[monitor] " + summaryLines.join("\n[monitor] "));

  // 永続的なブロック/タイムアウトを可視化（GitHub アノテーション。本文・秘匿値は出さない）。
  for (const r of results) {
    if (r.outcome === "failure") {
      console.log(`::warning title=Monitor source ${r.sourceId}::fetch ${r.fetchStatus ?? "failed"} (${r.organisation})`);
    }
  }

  // GitHub Actions のステップサマリに簡潔なヘルスを書き出す（存在すれば）。
  const stepSummary = process.env.GITHUB_STEP_SUMMARY;
  if (stepSummary) {
    const md = [
      "## Official source monitor",
      "",
      `| metric | count |`,
      `| --- | --- |`,
      `| Sources | ${s.total} |`,
      `| Success (fetched) | ${s.success} |`,
      `| Blocked | ${s.blocked} |`,
      `| Timeout | ${s.timeout} |`,
      `| HTTP error | ${s.httpError} |`,
      `| Parse/structure error | ${s.parseError} |`,
      `| Meaningful changes | ${s.meaningfulChanges} |`,
      `| News generated | ${s.newsGenerated} |`,
      `| Review required | ${s.reviewRequired} |`,
      `| Published | ${s.published} |`,
      "",
    ];
    if (s.success < s.total) {
      md.push("> ⚠️ 一部の公式ソースが取得できていません（blocked/timeout/parse）。`npm run monitor:health` で詳細を確認してください。", "");
    }
    try {
      appendFileSync(stepSummary, md.join("\n"));
    } catch {
      /* サマリ書き込み失敗は致命ではない */
    }
  }

  console.log(
    `\n[monitor] DONE. total=${s.total} success=${s.success} failures=${s.failures} published=${s.published} review=${s.reviewRequired}`,
  );

  // 失敗ポリシー: 個別ソースの一時的失敗ではジョブを落とさない。ただし全ソースが
  // 取得失敗（＝システム的障害）の場合は非ゼロ終了で強く可視化する。
  if (s.total > 0 && s.success === 0) {
    console.error("[monitor] SYSTEMIC FAILURE: すべての公式ソースの取得に失敗しました。");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[monitor] FATAL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
