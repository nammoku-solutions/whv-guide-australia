/**
 * 公式ソース監視 / ニュース処理の中央設定。
 *
 * 決定的な fetch・差分・ヘルス処理の設定は保持する。モデルを必要とする分類・生成・
 * 自動公開パイプラインは現在停止しており、NEWS_AI_AUTOMATION_ENABLED=false が既定。
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
  aiAutomationEnabled: envBool("NEWS_AI_AUTOMATION_ENABLED", false),

  autoPublishLowRisk: envBool("NEWS_AUTO_PUBLISH_LOW_RISK", false),
  autoPublishHighRisk: envBool("NEWS_AUTO_PUBLISH_HIGH_RISK", false),

  fetchTimeoutMs: envInt("MONITOR_FETCH_TIMEOUT_MS", 20000),
  maxContentChars: envInt("MONITOR_MAX_CONTENT_CHARS", 12000),
  snapshotRetention: envInt("MONITOR_SNAPSHOT_RETENTION", 5),
  sourceDelayMs: envInt("MONITOR_SOURCE_DELAY_MS", 1500),
  minAutoPublishConfidence: envFloat("MONITOR_MIN_AUTOPUBLISH_CONFIDENCE", 0.7),
  minMeaningfulDelta: envInt("MONITOR_MIN_MEANINGFUL_DELTA", 40),

  // Compatibility fields for the archived model-backed pipeline. No provider is
  // selected and the default caller performs no network I/O.
  model: process.env.MONITOR_GENERATION_MODEL ?? "disabled",
  modelTimeoutMs: envInt("MONITOR_MODEL_TIMEOUT_MS", 25000),
} as const;

export type MonitorConfig = typeof monitorConfig;
