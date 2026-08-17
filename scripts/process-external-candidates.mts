/**
 * 外部ニュース候補の処理ランナー（pending をまとめて処理）。
 *
 *   npm run news:candidates              # pending 候補を最大 BATCH まで処理
 *
 * 要点:
 *   - 外部エビデンスが供給されているため、公式ページの取得（fetch）は行わない。
 *   - pending が 0 件なら Gemini を一切呼ばない。
 *   - バッチ上限あり・候補ごとにエラー分離・簡潔なサマリ・秘匿値は出力しない。
 *   - 即時（Vercel）処理が主・本ジョブは retry/fallback。stale processing を回収する。
 */
import { readFileSync, existsSync, appendFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

const BATCH = Number.parseInt(process.env.EXTERNAL_NEWS_BATCH ?? "10", 10);

const { processPendingCandidates } = await import("../lib/monitor/external/processor");

async function main() {
  console.log(`[candidates] start: batch=${BATCH}`);
  const res = await processPendingCandidates(Number.isFinite(BATCH) ? BATCH : 10);
  if (!res.ok) {
    console.error(`[candidates] ERROR: ${res.error}`);
    process.exit(1);
  }

  const counts: Record<string, number> = {};
  for (const o of res.outcomes) counts[o.status] = (counts[o.status] ?? 0) + 1;

  const lines = [
    "External candidate run:",
    `Reclaimed (stale): ${res.reclaimed}`,
    `Claimed: ${res.claimed}`,
    `Published: ${counts.published ?? 0}`,
    `Review required: ${counts.review_required ?? 0}`,
    `Duplicate: ${counts.duplicate ?? 0}`,
    `Irrelevant: ${counts.irrelevant ?? 0}`,
    `Skipped: ${counts.skipped ?? 0}`,
    `Failed: ${counts.failed ?? 0}`,
  ];
  console.log("\n[candidates] " + lines.join("\n[candidates] "));

  for (const o of res.outcomes) {
    if (o.status === "failed") {
      console.log(`::warning title=External candidate ${o.candidateId}::${o.errorCode ?? "failed"}`);
    }
  }

  const stepSummary = process.env.GITHUB_STEP_SUMMARY;
  if (stepSummary) {
    const md = [
      "## External news candidate processor",
      "",
      "| metric | count |",
      "| --- | --- |",
      `| Reclaimed (stale) | ${res.reclaimed} |`,
      `| Claimed | ${res.claimed} |`,
      `| Published | ${counts.published ?? 0} |`,
      `| Review required | ${counts.review_required ?? 0} |`,
      `| Duplicate | ${counts.duplicate ?? 0} |`,
      `| Irrelevant | ${counts.irrelevant ?? 0} |`,
      `| Skipped | ${counts.skipped ?? 0} |`,
      `| Failed | ${counts.failed ?? 0} |`,
      "",
    ];
    try {
      appendFileSync(stepSummary, md.join("\n"));
    } catch {
      /* サマリ書き込み失敗は致命ではない */
    }
  }

  console.log(`\n[candidates] DONE. claimed=${res.claimed} published=${counts.published ?? 0} review=${counts.review_required ?? 0} failed=${counts.failed ?? 0}`);
}

main().catch((err) => {
  console.error("[candidates] FATAL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
