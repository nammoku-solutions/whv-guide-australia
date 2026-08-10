/**
 * サイト内AIパイプライン全体で共有する型。各モジュール（router / retriever /
 * reranker / generator / verifier）はこの安定した型に依存し、内部実装を差し替え
 * 可能にする。
 */

/** ルーターが分類する質問の種別。 */
export type RouteType = "ARTICLE" | "TOOL" | "LISTING" | "MIXED" | "OUT_OF_SCOPE";

/** リスクレベル。高リスク（ビザ/税/法/医療）は注意表示や将来の検証対象。 */
export type RiskLevel = "low" | "medium" | "high";

/** インデックス対象の1チャンク（埋め込み前の構造化データ）。 */
export type ArticleChunk = {
  chunkId: string;
  articleId: string;
  title: string;
  slug: string;
  url: string;
  category: string;
  heading: string;
  chunkIndex: number;
  content: string;
  contentHash: string;
  updatedAt: string;
  riskLevel: RiskLevel;
  officialSources: { label: string; url: string }[];
};

/** 検索で返る候補チャンク（メタデータ＋類似度）。 */
export type RetrievalCandidate = {
  chunkId: string;
  articleId: string;
  title: string;
  slug: string;
  url: string;
  category: string;
  heading: string;
  content: string;
  riskLevel: RiskLevel;
  /** 0〜1 の類似度（コサイン）。ハイブリッド時は融合スコア。 */
  score: number;
  /** どの検索経路で得たか（診断用）。 */
  source?: "semantic" | "keyword" | "hybrid";
};

/** 生成側へ渡す根拠チャンク（プロンプト注入対策のため content は untrusted 扱い）。 */
export type EvidenceChunk = {
  title: string;
  heading: string;
  url: string;
  content: string;
  riskLevel: RiskLevel;
};

/** レスポンスに載せる出典（検索メタデータから生成、モデルには作らせない）。 */
export type SourceLink = {
  title: string;
  url: string;
};

/** 推薦するサイト内ツール。 */
export type ToolRecommendation = {
  id: string;
  name: string;
  url: string;
  description: string;
};

/** Reranker の安定インターフェース（無効時も同一シグネチャ）。 */
export interface Reranker {
  rerank(
    query: string,
    candidates: RetrievalCandidate[],
  ): Promise<RetrievalCandidate[]>;
}

/** 検証結果。 */
export type VerificationResult = {
  supported: boolean;
  reason?: string;
};

/** AnswerVerifier の安定インターフェース（無効時も同一シグネチャ）。 */
export interface AnswerVerifier {
  verify(
    answer: string,
    evidence: EvidenceChunk[],
  ): Promise<VerificationResult>;
}

/** チャットAPIへの1リクエスト。 */
export type ChatRequest = {
  question: string;
  history?: { role: "user" | "assistant"; content: string }[];
  /** 管理者診断モード（モデレーターのみ有効）。 */
  debug?: boolean;
};

/** パイプライン診断（管理/開発のみ公開）。CoT等は含めない、運用メタのみ。 */
export type PipelineDiagnostics = {
  route: RouteType;
  riskLevel: RiskLevel;
  rewrittenQuery?: string;
  retrievedTitles: { title: string; heading: string; score: number }[];
  usedChunkCount: number;
  modelUsed: string | null;
  fallbackTriggered: boolean;
  retrievalLatencyMs: number;
  generationLatencyMs: number;
};

/** チャットAPIのレスポンス。 */
export type ChatResponse = {
  /** 回答本文。unsupported の場合は定型メッセージ。 */
  answer: string;
  /** 回答が根拠に支えられているか（false = 情報不足）。 */
  supported: boolean;
  route: RouteType;
  riskLevel: RiskLevel;
  sources: SourceLink[];
  tools: ToolRecommendation[];
  /** debug かつモデレーターの場合のみ付与。 */
  diagnostics?: PipelineDiagnostics;
};

/** サイト内に十分な情報がない場合の定型応答。 */
export const UNSUPPORTED_ANSWER =
  "現在、サイト内にこの質問へ回答できる十分な情報がありません。関連しそうなカテゴリのページやサイト内検索もお試しください。";
