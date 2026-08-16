/**
 * 監視 & ニュース自動化の中央設定。モデル名・しきい値・機能フラグは必ず
 * ここ（＝環境変数）を単一の窓口として参照する。
 */

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  return raw === "true" || raw === "1";
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function envFloat(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

export const monitorConfig = {
  /** 低リスクの自動公開を許可（既定 true）。 */
  autoPublishLowRisk: envBool("NEWS_AUTO_PUBLISH_LOW_RISK", true),
  /** 高リスクの自動公開（既定 false＝常にレビュー）。 */
  autoPublishHighRisk: envBool("NEWS_AUTO_PUBLISH_HIGH_RISK", false),

  /** 取得タイムアウト（ms）。 */
  fetchTimeoutMs: envInt("MONITOR_FETCH_TIMEOUT_MS", 20000),
  /** 1 ソースあたりの本文の最大文字数（モデルコンテキスト上限）。 */
  maxContentChars: envInt("MONITOR_MAX_CONTENT_CHARS", 12000),
  /** スナップショットの保持件数（ソースごと）。 */
  snapshotRetention: envInt("MONITOR_SNAPSHOT_RETENTION", 5),
  /** ソース間の待機（ms, レート制限に配慮）。 */
  sourceDelayMs: envInt("MONITOR_SOURCE_DELAY_MS", 1500),

  /** 自動公開に必要な最小信頼度。 */
  minAutoPublishConfidence: envFloat("MONITOR_MIN_AUTOPUBLISH_CONFIDENCE", 0.7),
  /** 自動公開に必要な最小関連度（highly_relevant / relevant のみ）。 */
  /** 変更とみなす最小の正規化本文差分（文字数）。boilerplate 揺れを無視。 */
  minMeaningfulDelta: envInt("MONITOR_MIN_MEANINGFUL_DELTA", 40),

  /** 生成モデル（AI 設定を流用しつつ上書き可能）。 */
  model: process.env.MONITOR_GENERATION_MODEL ??
    process.env.AI_GENERATION_MODEL ??
    "gemini-3.5-flash-lite",
  modelTimeoutMs: envInt("MONITOR_MODEL_TIMEOUT_MS", 25000),
} as const;

export type MonitorConfig = typeof monitorConfig;
