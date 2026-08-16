/**
 * 公式ソース監視の「ヘルス」導出（読み取り専用・DB 列を増やさない）。
 *
 * 既存の monitor_source_state（last_status / last_checked / last_changed /
 * content_hash / consecutive_failures）だけからヘルスを導出する。取得の
 * blocked/timeout/parse_error 等を「変更なし」に丸めず、実行時の取得健全性を可視化する。
 *
 * これは状態の読み取りのみ。取得もベースライン変更も行わない。
 */

import type { SourceState } from "./db";
import type { SourceDefinition } from "./types";

/** 連続失敗がこの回数以上で failing。 */
const FAILING_THRESHOLD = 3;

export type SourceHealth = "healthy" | "degraded" | "failing" | "never_succeeded";

export type SourceHealthRow = {
  sourceId: string;
  organisation: string;
  sourceName: string;
  url: string;
  riskLevel: string;
  health: SourceHealth;
  lastStatus: string | null;
  lastChecked: string | null;
  /** 最後に取得成功した時刻（導出）。不明なら null。 */
  lastSuccess: string | null;
  lastChanged: string | null;
  consecutiveFailures: number;
  hasBaseline: boolean;
};

/** monitor_source_state 1 件からヘルスを導出する。 */
export function computeHealth(state: SourceState | undefined | null): SourceHealth {
  if (!state || !state.last_checked) return "never_succeeded";
  const cf = state.consecutive_failures ?? 0;
  const hasBaseline = Boolean(state.content_hash);
  const success = state.last_status === "success";
  // ベースライン未確立 = 一度も「意味のある取得成功」が無い。
  if (!hasBaseline) return cf >= FAILING_THRESHOLD ? "failing" : "never_succeeded";
  // ベースラインあり（過去に成功済み）。
  if (success && cf === 0) return "healthy";
  if (cf >= FAILING_THRESHOLD) return "failing";
  if (cf >= 1) return "degraded";
  return "healthy";
}

/** 最後に取得成功した時刻を導出する（現在成功中なら last_checked、そうでなければ last_changed）。 */
function deriveLastSuccess(state: SourceState | undefined | null): string | null {
  if (!state) return null;
  if (state.last_status === "success") return state.last_checked ?? null;
  return state.last_changed ?? null;
}

/** 1 ソースのヘルス行を作る（レジストリ定義 + DB 状態）。 */
export function toHealthRow(
  source: SourceDefinition,
  state: SourceState | undefined | null,
): SourceHealthRow {
  return {
    sourceId: source.sourceId,
    organisation: source.organisation,
    sourceName: source.sourceName,
    url: source.url,
    riskLevel: source.riskLevel,
    health: computeHealth(state),
    lastStatus: state?.last_status ?? null,
    lastChecked: state?.last_checked ?? null,
    lastSuccess: deriveLastSuccess(state),
    lastChanged: state?.last_changed ?? null,
    consecutiveFailures: state?.consecutive_failures ?? 0,
    hasBaseline: Boolean(state?.content_hash),
  };
}

export type HealthSummary = {
  total: number;
  healthy: number;
  degraded: number;
  failing: number;
  neverSucceeded: number;
  rows: SourceHealthRow[];
};

/** 有効ソース群と状態マップからヘルスサマリを構築する。 */
export function buildHealthReport(
  sources: SourceDefinition[],
  stateById: Map<string, SourceState>,
): HealthSummary {
  const rows = sources.map((s) => toHealthRow(s, stateById.get(s.sourceId)));
  return {
    total: rows.length,
    healthy: rows.filter((r) => r.health === "healthy").length,
    degraded: rows.filter((r) => r.health === "degraded").length,
    failing: rows.filter((r) => r.health === "failing").length,
    neverSucceeded: rows.filter((r) => r.health === "never_succeeded").length,
    rows,
  };
}

/** 監視 1 実行の結果（outcome + fetchStatus）から集計する。失敗を「変更なし」に丸めない。 */
export type RunSummary = {
  total: number;
  success: number;
  blocked: number;
  timeout: number;
  httpError: number;
  parseError: number;
  meaningfulChanges: number;
  newsGenerated: number;
  reviewRequired: number;
  published: number;
  failures: number;
};

export function summariseRun(
  results: { outcome: string; fetchStatus?: string | null }[],
): RunSummary {
  const countOutcome = (o: string) => results.filter((r) => r.outcome === o).length;
  const failStatus = (s: string) =>
    results.filter((r) => r.outcome === "failure" && r.fetchStatus === s).length;
  const published = countOutcome("auto_published");
  const reviewRequired = countOutcome("review");
  return {
    total: results.length,
    success: results.filter((r) => r.outcome !== "failure").length,
    blocked: failStatus("blocked"),
    timeout: failStatus("timeout"),
    httpError: failStatus("http_error"),
    parseError: failStatus("parse_error") + failStatus("unexpected_structure"),
    meaningfulChanges:
      countOutcome("review") + countOutcome("auto_published") + countOutcome("duplicate") + countOutcome("unrelated"),
    newsGenerated: published + reviewRequired,
    reviewRequired,
    published,
    failures: countOutcome("failure"),
  };
}
