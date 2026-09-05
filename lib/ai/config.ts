/**
 * サイト内AIアシスタントの中央設定。
 *
 * モデルIDやしきい値・機能フラグはここ（＝環境変数）を単一の窓口として参照する。
 * プロバイダ固有の値をアプリ各所に散らばせず、将来のモデル差し替えを容易にする。
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

/**
 * 既存の本番インデックスと互換の埋め込み世代。
 * モデルを変更したらこの値を上げ、全件再インデックスする。
 */
export const EMBEDDING_VERSION = envStr("AI_EMBEDDING_VERSION", "v1");

/**
 * gemini-embedding-001 は可変次元に対応。768 は日本語品質と
 * ストレージ/検索効率のバランスが良く、既存DBスキーマとも互換。
 */
export const EMBEDDING_DIMENSIONS = envInt("AI_EMBEDDING_DIMENSIONS", 768);

export const aiConfig = {
  // サイトAIのみを制御するフラグ。ニュース自動化とは独立。
  runtimeEnabled: envBool("AI_RUNTIME_ENABLED", true),
  provider: envStr("AI_PROVIDER", "gemini"),

  generation: {
    /** 高頻度Q&A向けの低コスト・低遅延モデル。 */
    model: envStr("AI_GENERATION_MODEL", "gemini-3.5-flash-lite"),
    /** 将来の複雑/高リスク質問向け。既定ではルーティングOFF。 */
    modelComplex: envStr("AI_GENERATION_MODEL_COMPLEX", "gemini-3.5-flash"),
    maxOutputTokens: envInt("AI_GENERATION_MAX_TOKENS", 700),
    temperature: envFloat("AI_GENERATION_TEMPERATURE", 0.2),
    timeoutMs: envInt("AI_GENERATION_TIMEOUT_MS", 20000),
  },

  embedding: {
    provider: envStr("AI_EMBEDDING_PROVIDER", "gemini"),
    model: envStr("AI_EMBEDDING_MODEL", "gemini-embedding-001"),
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
    marketplaceSearchEnabled: envBool("AI_MARKETPLACE_SEARCH_ENABLED", true),
    hybridSearchEnabled: envBool("AI_HYBRID_SEARCH_ENABLED", true),
    structuredDataEnabled: envBool("AI_STRUCTURED_DATA_ENABLED", true),
    personalDataEnabled: envBool("AI_PERSONAL_DATA_ENABLED", true),
    currentUpdatesEnabled: envBool("AI_CURRENT_UPDATES_ENABLED", true),
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

/** サーバー側でのみ参照する秘匿値。クライアントへ絶対に渡さない。 */
export function getServerSecrets() {
  return {
    geminiApiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "",
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    // Supabaseの新しいsecret keyを優先し、既存service_roleも互換維持。
    supabaseServiceRoleKey:
      process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    rateLimitSalt: process.env.AI_RATE_LIMIT_SALT ?? "whv-ai-default-salt",
  };
}

export type AiConfig = typeof aiConfig;
