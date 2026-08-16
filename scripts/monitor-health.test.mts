/**
 * 公式ソース監視ヘルスの決定的テスト（外部 API・DB に接続しない）。
 *   npm run test:monitor:health
 *
 * 網羅: healthy/degraded/failing/never_succeeded の導出・部分失敗の非消去・
 * 実行サマリ集計・読み取り専用性（構造）・ベースライン不変・秘匿値/生本文を出さない。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  computeHealth,
  toHealthRow,
  buildHealthReport,
  summariseRun,
} from "../lib/monitor/health";
import { getSourceById, getEnabledSources } from "../lib/monitor/registry";
import type { SourceState } from "../lib/monitor/db";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function state(over: Partial<SourceState>): SourceState {
  return {
    source_id: "s",
    content_hash: null,
    last_checked: null,
    last_changed: null,
    last_status: null,
    consecutive_failures: 0,
    ...over,
  };
}

// =========================================================
// 17-20/22. ヘルス導出
// =========================================================
test("17: 成功状態は healthy", () => {
  assert.equal(
    computeHealth(state({ last_status: "success", last_checked: "2026-08-16T00:00:00Z", content_hash: "h", consecutive_failures: 0 })),
    "healthy",
  );
});

test("18: blocked（ベースラインあり・cf1）は degraded、cf>=3 は failing", () => {
  assert.equal(computeHealth(state({ last_status: "blocked", last_checked: "2026-08-16T00:00:00Z", content_hash: "h", consecutive_failures: 1 })), "degraded");
  assert.equal(computeHealth(state({ last_status: "blocked", last_checked: "2026-08-16T00:00:00Z", content_hash: "h", consecutive_failures: 3 })), "failing");
});

test("19: timeout（ベースラインあり・cf2）は degraded", () => {
  assert.equal(computeHealth(state({ last_status: "timeout", last_checked: "2026-08-16T00:00:00Z", content_hash: "h", consecutive_failures: 2 })), "degraded");
});

test("20: parse/unexpected（ベースラインあり・cf1）は degraded", () => {
  assert.equal(computeHealth(state({ last_status: "unexpected_structure", last_checked: "2026-08-16T00:00:00Z", content_hash: "h", consecutive_failures: 1 })), "degraded");
});

test("22: ベースライン無しは never_succeeded、多数失敗は failing、未実行も never_succeeded", () => {
  assert.equal(computeHealth(state({ last_status: "blocked", last_checked: "2026-08-16T00:00:00Z", content_hash: null, consecutive_failures: 1 })), "never_succeeded");
  assert.equal(computeHealth(state({ last_status: "blocked", last_checked: "2026-08-16T00:00:00Z", content_hash: null, consecutive_failures: 5 })), "failing");
  assert.equal(computeHealth(null), "never_succeeded");
});

test("toHealthRow: last_success を導出（成功中=last_checked、失敗中=last_changed）", () => {
  const src = getSourceById("homeaffairs-visa-pricing")!;
  const ok = toHealthRow(src, state({ last_status: "success", last_checked: "2026-08-16T01:00:00Z", last_changed: "2026-08-10T00:00:00Z", content_hash: "h" }));
  assert.equal(ok.lastSuccess, "2026-08-16T01:00:00Z");
  const failing = toHealthRow(src, state({ last_status: "blocked", last_checked: "2026-08-16T01:00:00Z", last_changed: "2026-08-10T00:00:00Z", content_hash: "h", consecutive_failures: 4 }));
  assert.equal(failing.lastSuccess, "2026-08-10T00:00:00Z");
  assert.equal(failing.health, "failing");
});

// =========================================================
// 21. 1 ソースの失敗が他を消さない
// =========================================================
test("21: 部分失敗でも各ソースのヘルスが個別に得られる", () => {
  const sources = getEnabledSources().slice(0, 3);
  const map = new Map<string, SourceState>();
  map.set(sources[0].sourceId, state({ source_id: sources[0].sourceId, last_status: "success", last_checked: "2026-08-16T00:00:00Z", content_hash: "h" }));
  map.set(sources[1].sourceId, state({ source_id: sources[1].sourceId, last_status: "blocked", last_checked: "2026-08-16T00:00:00Z", content_hash: "h", consecutive_failures: 4 }));
  // sources[2] は状態なし。
  const report = buildHealthReport(sources, map);
  assert.equal(report.total, 3);
  assert.equal(report.healthy, 1);
  assert.equal(report.failing, 1);
  assert.equal(report.neverSucceeded, 1);
  assert.equal(report.rows.length, 3);
});

// =========================================================
// 23. 実行サマリ集計（失敗を「変更なし」に丸めない）
// =========================================================
test("23: summariseRun は取得状態別に正しく集計する", () => {
  const results = [
    { outcome: "unchanged" },
    { outcome: "auto_published" },
    { outcome: "review" },
    { outcome: "duplicate" },
    { outcome: "failure", fetchStatus: "blocked" },
    { outcome: "failure", fetchStatus: "timeout" },
    { outcome: "failure", fetchStatus: "unexpected_structure" },
  ];
  const s = summariseRun(results);
  assert.equal(s.total, 7);
  assert.equal(s.success, 4);
  assert.equal(s.blocked, 1);
  assert.equal(s.timeout, 1);
  assert.equal(s.parseError, 1);
  assert.equal(s.published, 1);
  assert.equal(s.reviewRequired, 1);
  assert.equal(s.newsGenerated, 2);
  assert.equal(s.meaningfulChanges, 3);
  assert.equal(s.failures, 3);
});

// =========================================================
// 24/25/26/27/28. 構造的検証
// =========================================================
test("24: 管理 UI がソースヘルスを表示する", () => {
  const page = readFileSync(resolve(ROOT, "app/admin/monitor/page.tsx"), "utf8");
  assert.ok(page.includes("ソースヘルス"));
  assert.ok(page.includes("health.map"));
  const api = readFileSync(resolve(ROOT, "app/api/admin/monitor/route.ts"), "utf8");
  assert.ok(api.includes("buildHealthReport"));
  assert.ok(api.includes("monitor_source_state"));
});

test("25: monitor:health は読み取り専用（取得/生成/変更を行わない）", () => {
  const src = readFileSync(resolve(ROOT, "scripts/monitor-health.mts"), "utf8");
  for (const forbidden of ["fetchSource", "generateNews", "callGemini", "runMonitor", "processSource", "markChanged", "markFailure", "establishBaseline"]) {
    assert.ok(!src.includes(forbidden), `monitor-health must not use ${forbidden}`);
  }
  assert.ok(src.includes("getAllSourceStates"));
});

test("26: ヘルス層は監視ベースラインへ書き込まない", () => {
  const health = readFileSync(resolve(ROOT, "lib/monitor/health.ts"), "utf8");
  assert.ok(!health.includes("insert"));
  assert.ok(!health.includes("update"));
  assert.ok(!health.includes("upsert"));
  const cli = readFileSync(resolve(ROOT, "scripts/monitor-health.mts"), "utf8");
  assert.ok(!cli.includes(".upsert("));
  assert.ok(!cli.includes("markChanged"));
});

test("27: 監視/ヘルススクリプトは秘匿値を出力しない", () => {
  for (const f of ["scripts/monitor-health.mts", "scripts/monitor-sources.mts"]) {
    const src = readFileSync(resolve(ROOT, f), "utf8");
    assert.ok(!src.includes("SERVICE_ROLE_KEY"));
    assert.ok(!src.includes("GEMINI_API_KEY"));
  }
});

test("28: 監視サマリは生の政府本文を出力しない", () => {
  const src = readFileSync(resolve(ROOT, "scripts/monitor-sources.mts"), "utf8");
  assert.ok(!src.includes("fetched.raw"));
  assert.ok(!src.includes("extracted.text"));
});
