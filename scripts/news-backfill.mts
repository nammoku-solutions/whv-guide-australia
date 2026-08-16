/**
 * 歴史的公式ニュースのバックフィル ランナー（CLI）。
 *
 *   npm run news:backfill -- --from 2026-06-01 --to 2026-08-16 --dry-run
 *   npm run news:backfill -- --from 2026-06-01 --to 2026-08-16 --apply
 *
 * これは日次モニタの置き換えではない。過去の公式ニュースを一度だけ取り込むための
 * 特権バッチ。まず --dry-run を実行し、構造的な失敗が無いことを確認してから --apply する。
 * 生の政府ページ本文はコンソールに出力しない。秘匿値も出力しない。
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// 初期バックフィル範囲（CLI 既定値のみハードコード。将来の範囲は引数で安全に指定可能）。
const DEFAULT_FROM = "2026-06-01";
const DEFAULT_TO = "2026-08-16";
const DEFAULT_MAX_RANGE_DAYS = 400;

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

function getArg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < process.argv.length && !process.argv[idx + 1].startsWith("--")) {
    return process.argv[idx + 1];
  }
  return undefined;
}
function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const { validateRange } = await import("../lib/monitor/backfill/dates");
const { runBackfill } = await import("../lib/monitor/backfill/pipeline");

const RESULT_LABEL: Record<string, string> = {
  published: "公開",
  review_required: "レビュー要",
  duplicate: "重複",
  skipped_unrelated: "スキップ(無関係)",
  skipped_weak: "スキップ(弱関連)",
  skipped_grounding: "スキップ(grounding)",
  skipped_no_date: "スキップ(日付なし)",
  skipped_thin: "スキップ(内容薄)",
  error: "エラー",
};

async function main() {
  const from = getArg("from") ?? DEFAULT_FROM;
  const to = getArg("to") ?? DEFAULT_TO;
  const apply = hasFlag("apply");
  const dryRun = hasFlag("dry-run") || !apply; // 既定は dry-run。--apply の明示が必要。
  const allowWide = hasFlag("allow-wide-range");
  const maxRangeDays = Number.parseInt(getArg("max-range-days") ?? String(DEFAULT_MAX_RANGE_DAYS), 10);

  if (apply && dryRun && hasFlag("dry-run")) {
    console.error("[backfill] --dry-run と --apply は同時指定できません。");
    process.exit(2);
  }

  const valid = validateRange(from, to, Number.isFinite(maxRangeDays) ? maxRangeDays : DEFAULT_MAX_RANGE_DAYS, allowWide);
  if (!valid.ok) {
    console.error(`[backfill] 範囲エラー: ${valid.error}`);
    process.exit(2);
  }

  const mode = apply ? "apply" : "dry_run";
  console.log(`[backfill] mode=${mode} range=${from} → ${to}`);
  if (mode === "dry_run") console.log("[backfill] dry-run: News・AI インデックス・監視ベースラインへの書き込みは行いません。");

  const report = await runBackfill({ from, to, mode, deps: {} });

  console.log("\n==== 歴史的ニュース バックフィル レポート ====");
  console.log(`Date range: ${report.from} → ${report.to}  (mode=${report.mode})`);
  console.log(`Sources scanned:                ${report.sourcesChecked}`);
  console.log(`  supported:                    ${report.sourcesSupported}`);
  console.log(`  unsupported:                  ${report.sourcesUnsupported}`);
  console.log(`Historical entries discovered:  ${report.candidatesDiscovered}`);
  console.log(`WHV relevant:                   ${report.candidatesRelevant}`);
  console.log(`Existing duplicates:            ${report.duplicateCount}`);
  console.log(`Published (low/med-risk):       ${report.publishedCount}`);
  console.log(`High-risk review required:      ${report.reviewRequiredCount}`);
  console.log(`Skipped weak/unrelated/thin:    ${report.skippedCount}`);
  console.log(`Errors:                         ${report.errorCount}`);
  console.log(`Article impacts created:        ${report.impactsCreated}`);
  console.log(`AI news chunks indexed:         ${report.indexedCount}`);
  console.log(`Live-monitor baseline untouched: ${report.liveMonitorBaselineUntouched ? "YES" : "NO"}`);

  console.log("\n-- ソース別 --");
  for (const s of report.sources) {
    console.log(`  ${s.sourceId} [${s.status}] discovered=${s.discovered} — ${s.detail}`);
  }

  if (report.candidates.length > 0) {
    console.log("\n-- 候補（公式日 / 機関 / 結果 / タイトル） --");
    for (const c of report.candidates) {
      const label = RESULT_LABEL[c.result] ?? c.result;
      const title = c.title.length > 60 ? c.title.slice(0, 57) + "…" : c.title;
      console.log(`  ${c.officialDate} | ${c.organisation} | ${label} | ${title}`);
    }
  }

  if (report.notes.length > 0) {
    console.log("\n-- 注記 --");
    for (const n of report.notes) console.log(`  * ${n}`);
  }

  console.log("\n[backfill] DONE.");
}

main().catch((err) => {
  console.error("[backfill] FATAL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
