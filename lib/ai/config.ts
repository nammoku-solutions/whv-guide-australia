/**
 * サイト内 AI 機能の中央設定。
 *
 * 現在の本番構成では外部モデル API を使用しない。RAG/生成系の実装境界は将来の
 * 再有効化に備えて保持するが、provider/model の既定値は disabled とし、環境変数
 * だけで誤って外部通信が有効にならないようにする。
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

function envStr(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw == null || raw === "" ? fallback : raw;
}

export const EMBEDDING_VERSION = envStr("AI_EMBEDDING_VERSION", "paused-v1");
export const EMBEDDING_DIMENSIONS = envInt("AI_EMBEDDING_DIMENSIONS", 768);

export const aiConfig = {
  runtimeEnabled: envBool("AI_RUNTIME_ENABLED", false),
  provider: envStr("AI_PROVIDER", "disabled"),

  generation: {
    model: envStr("AI_GENERATION_MODEL", "disabled"),
    modelComplex: envStr("AI_GENERATION_MODEL_COMPLEX", "disabled"),
    maxOutputTokens: envInt("AI_GENERATION_MAX_TOKENS", 700),
    temperature: envFloat("AI_GENERATION_TEMPERATURE", 0.2),
    timeoutMs: envInt("AI_GENERATION_TIMEOUT_MS", 20000),
  },

  embedding: {
    provider: envStr("AI_EMBEDDING_PROVIDER", "disabled"),
    model: envStr("AI_EMBEDDING_MODEL", "disabled"),
    dimensions: EMBEDDING_DIMENSIONS,
    version: EMBEDDING_VERSION,
    timeoutMs: envInt("AI_EMBEDDING_TIMEOUT_MS", 15000),
  },

  retrieval: {
    maxContextChunks: envInt("AI_MAX_CONTEXT_CHUNKS", 5),
    candidateCount: envInt("AI_RETRIEVAL_CANDIDATES", 20),
    similarityThreshold: envFloat("AI_SIMILARITY_THRESHOLD", 0.62),
    maxChunksPerArticle: envInt("AI_MAX_CHUNKS_PER_ARTICLE", 2),
    keywordCandidateCount: envInt("AI_KEYWORD_CANDIDATES", 20),
    rrfK: envInt("AI_RRF_K", 60),
  },

  features: {
    rerankEnabled: envBool("AI_RERANK_ENABLED", false),
    verifyEnabled: envBool("AI_VERIFY_ENABLED", false),
    complexRoutingEnabled: envBool("AI_COMPLEX_ROUTING_ENABLED", false),
    marketplaceSearchEnabled: envBool("AI_MARKETPLACE_SEARCH_ENABLED", false),
    hybridSearchEnabled: envBool("AI_HYBRID_SEARCH_ENABLED", false),
    structuredDataEnabled: envBool("AI_STRUCTURED_DATA_ENABLED", false),
    personalDataEnabled: envBool("AI_PERSONAL_DATA_ENABLED", false),
    currentUpdatesEnabled: envBool("AI_CURRENT_UPDATES_ENABLED", false),
    mutationsEnabled: envBool("AI_MUTATIONS_ENABLED", false),
  },

  structured: {
    maxListingResults: envInt("AI_MAX_LISTING_RESULTS", 5),
    maxApplications: envInt("AI_MAX_APPLICATIONS", 5),
    maxSavedItems: envInt("AI_MAX_SAVED_ITEMS", 8),
    maxNotifications: envInt("AI_MAX_NOTIFICATIONS", 8),
    maxNewsUpdates: envInt("AI_MAX_NEWS_UPDATES", 5),
  },

  limits: {
    maxDailyAnonRequests: envInt("AI_MAX_DAILY_ANON_REQUESTS", 5),
    maxDailyAuthRequests: envInt("AI_MAX_DAILY_AUTH_REQUESTS", 20),
    maxQuestionLength: envInt("AI_MAX_QUESTION_LENGTH", 500),
    maxRequestBytes: envInt("AI_MAX_REQUEST_BYTES", 8000),
    maxHistoryTurns: envInt("AI_MAX_HISTORY_TURNS", 4),
  },
} as const;

/** サーバー側の共有秘匿値。外部モデル用キーは現在の契約に含めない。 */
export function getServerSecrets() {
  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    // Prefer Supabase's current secret-key format while retaining the legacy
    // service_role variable during migration so existing deployments keep working.
    supabaseServiceRoleKey:
      process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    rateLimitSalt: process.env.AI_RATE_LIMIT_SALT ?? "whv-ai-paused",
  };
}

export type AiConfig = typeof aiConfig;
