/**
 * 公式ソース監視の「ヘルス」レポート（読み取り専用）。
 *
 *   npm run monitor:health
 *
 * monitor_source_state を読み取り、レジストリと突合してソースごとの
 * healthy / degraded / failing / never_succeeded を表示する。
 *
 * これは状態の読み取りのみ。取得しない・Gemini を呼ばない・ベースライン/ハッシュを
 * 変更しない・ニュース生成しない。秘匿値・生の政府本文は出力しない。
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

const { getMonitorAdmin, getAllSourceStates } = await import("../lib/monitor/db");
const { getEnabledSources } = await import("../lib/monitor/registry");
const { buildHealthReport } = await import("../lib/monitor/health");

const HEALTH_LABEL: Record<string, string> = {
  healthy: "OK   ",
  degraded: "DEGR ",
  failing: "FAIL ",
  never_succeeded: "NEVER",
};

function fmt(ts: string | null): string {
  return ts ? ts.slice(0, 19).replace("T", " ") : "-";
}

async function main() {
  const sources = getEnabledSources();
  const admin = getMonitorAdmin();
  if (!admin) {
    console.log("[health] Supabase service-role 未設定のため監視状態を読み取れません。");
    console.log(`[health] レジストリ上の有効ソース数: ${sources.length}（DB 状態なし）。`);
    process.exit(0);
  }

  const stateById = await getAllSourceStates(admin);
  const report = buildHealthReport(sources, stateById);

  console.log("==== 公式ソース監視ヘルス（読み取り専用） ====");
  console.log(
    `Sources: ${report.total}  healthy: ${report.healthy}  degraded: ${report.degraded}  failing: ${report.failing}  never_succeeded: ${report.neverSucceeded}`,
  );
  console.log("");
  console.log("HEALTH | source                          | status   | lastChecked         | lastSuccess         | fails | changed");
  for (const r of report.rows) {
    const id = r.sourceId.padEnd(32).slice(0, 32);
    const st = (r.lastStatus ?? "-").padEnd(8).slice(0, 8);
    console.log(
      `${HEALTH_LABEL[r.health]} | ${id} | ${st} | ${fmt(r.lastChecked).padEnd(19)} | ${fmt(r.lastSuccess).padEnd(19)} | ${String(r.consecutiveFailures).padStart(5)} | ${fmt(r.lastChanged)}`,
    );
  }

  const problem = report.rows.filter((r) => r.health === "failing" || r.health === "never_succeeded");
  if (problem.length > 0) {
    console.log("\n[health] 要注意（failing / never_succeeded）:");
    for (const r of problem) {
      console.log(`  - ${r.sourceId} [${r.health}] ${r.organisation}｜${r.sourceName} — ${r.url}`);
    }
    console.log(
      "\n[health] これらは live 取得が degraded の可能性があります。Manual Seed（npm run news:backfill:seed）で公式本文を投入できます。",
    );
  }

  const stepSummary = process.env.GITHUB_STEP_SUMMARY;
  if (stepSummary) {
    const md = [
      "## Official source monitor health",
      "",
      `healthy: ${report.healthy} · degraded: ${report.degraded} · failing: ${report.failing} · never_succeeded: ${report.neverSucceeded}`,
      "",
      "| health | source | status | last checked | last success | fails |",
      "| --- | --- | --- | --- | --- | --- |",
      ...report.rows.map(
        (r) => `| ${r.health} | ${r.sourceId} | ${r.lastStatus ?? "-"} | ${fmt(r.lastChecked)} | ${fmt(r.lastSuccess)} | ${r.consecutiveFailures} |`,
      ),
      "",
    ];
    try {
      appendFileSync(stepSummary, md.join("\n"));
    } catch {
      /* non-fatal */
    }
  }

  console.log("\n[health] DONE（読み取り専用・状態は変更していません）。");
}

main().catch((err) => {
  console.error("[health] FATAL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
