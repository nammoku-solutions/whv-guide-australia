/**
 * サイト内AIアシスタントの中央設定。
 *
 * モデルIDやしきい値・機能フラグは必ずここ（＝環境変数）を単一の窓口として参照する。
 * アプリ各所にモデル名やプロバイダ固有の値を散らばせないこと。これにより将来の
 * モデル差し替え・段階的な機能有効化を、コード改変なし（設定変更のみ）で行える。
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
 * 現行の埋め込み世代。埋め込みモデルを変更したら必ずこの値を上げ、再インデックス
 * （scripts/ai-index.mjs --reindex）する。異なる次元・モデルの埋め込みを同じ
 * 検索インデックスに混ぜないためのバージョン管理キー。
 */
export const EMBEDDING_VERSION = envStr("AI_EMBEDDING_VERSION", "v1");

/**
 * 埋め込みの次元数。gemini-embedding-001 は Matryoshka（可変次元）対応。
 * 768 は多言語（日本語含む）品質とストレージ/インデックス効率のバランスが良い。
 * ここを変更する場合は DB マイグレーション（vector(N)）と再インデックスが必須。
 */
export const EMBEDDING_DIMENSIONS = envInt("AI_EMBEDDING_DIMENSIONS", 768);

export const aiConfig = {
  provider: envStr("AI_PROVIDER", "gemini"),

  generation: {
    /** 既定の低コスト生成モデル（高頻度Q&A向け）。 */
    model: envStr("AI_GENERATION_MODEL", "gemini-2.5-flash-lite"),
    /** 将来の複雑/高リスク質問向けの高性能モデル（既定では未使用）。 */
    modelComplex: envStr("AI_GENERATION_MODEL_COMPLEX", "gemini-2.5-flash"),
    /** 生成の最大出力トークン。応答長を抑えてコストとレイテンシを制御。 */
    maxOutputTokens: envInt("AI_GENERATION_MAX_TOKENS", 700),
    temperature: envFloat("AI_GENERATION_TEMPERATURE", 0.2),
    /** プロバイダ呼び出しのタイムアウト（ms）。 */
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
    /** 生成に渡す最終コンテキストchunk数（3〜5推奨）。 */
    maxContextChunks: envInt("AI_MAX_CONTEXT_CHUNKS", 5),
    /** 類似検索の一次候補数（多様性フィルタ前）。 */
    candidateCount: envInt("AI_RETRIEVAL_CANDIDATES", 20),
    /** これ未満の類似度しかなければ「情報なし」を返す（生成を呼ばない）。 */
    similarityThreshold: envFloat("AI_SIMILARITY_THRESHOLD", 0.62),
    /** 同一記事から採用する最大chunk数（多様性確保）。 */
    maxChunksPerArticle: envInt("AI_MAX_CHUNKS_PER_ARTICLE", 2),
  },

  /** 各段階の機能フラグ。V1 は reranker/verifier/複雑ルーティング/listing すべて OFF。 */
  features: {
    rerankEnabled: envBool("AI_RERANK_ENABLED", false),
    verifyEnabled: envBool("AI_VERIFY_ENABLED", false),
    complexRoutingEnabled: envBool("AI_COMPLEX_ROUTING_ENABLED", false),
    marketplaceSearchEnabled: envBool("AI_MARKETPLACE_SEARCH_ENABLED", false),
    hybridSearchEnabled: envBool("AI_HYBRID_SEARCH_ENABLED", false),
  },

  limits: {
    maxDailyAnonRequests: envInt("AI_MAX_DAILY_ANON_REQUESTS", 5),
    maxDailyAuthRequests: envInt("AI_MAX_DAILY_AUTH_REQUESTS", 20),
    /** 質問文の最大長（文字）。 */
    maxQuestionLength: envInt("AI_MAX_QUESTION_LENGTH", 500),
    /** リクエストボディの最大バイト数。 */
    maxRequestBytes: envInt("AI_MAX_REQUEST_BYTES", 8000),
    /** 会話履歴として送る直近ターンの最大数（無制限履歴を防ぐ）。 */
    maxHistoryTurns: envInt("AI_MAX_HISTORY_TURNS", 4),
  },
} as const;

/** サーバー側でのみ参照する秘匿値（クライアントへ絶対に渡さない）。 */
export function getServerSecrets() {
  return {
    geminiApiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "",
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    /** IPハッシュ用ソルト（プライバシー配慮のレート制限に使用）。 */
    rateLimitSalt: process.env.AI_RATE_LIMIT_SALT ?? "whv-ai-default-salt",
  };
}

export type AiConfig = typeof aiConfig;
