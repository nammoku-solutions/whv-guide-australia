/**
 * サイト内AIパイプライン全体で共有する型。各モジュール（router / retriever /
 * reranker / generator / verifier）はこの安定した型に依存し、内部実装を差し替え
 * 可能にする。
 */

/**
 * ルーターが分類する質問の種別。
 *   ARTICLE        公開知識 → 記事RAG
 *   TOOL           サイト内ツールへの誘導
 *   LISTING        ライブ・マーケット（求人・住居・車）の構造化検索
 *   PERSONAL       ログイン中ユーザー本人の記録（応募・保存・通知・88日）
 *   CURRENT_UPDATE 直近の公式アップデート（公開ニュース＋監視状態＋記事）
 *   MIXED          記事＋（ツール/掲載/最新情報）の複合
 *   OUT_OF_SCOPE   サイト外
 */
export type RouteType =
  | "ARTICLE"
  | "TOOL"
  | "LISTING"
  | "PERSONAL"
  | "CURRENT_UPDATE"
  | "MIXED"
  | "OUT_OF_SCOPE";

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

/**
 * パイプライン共通の内部エビデンス表現。記事RAG・公式アップデート・ライブ掲載・
 * 個人データ・ツールを一つの型で扱い、Generator が種別と公開/非公開を認識できる
 * ようにする。private は絶対に公開出典（citation）や GA4 へ出さない。
 */
export type EvidenceKind =
  | "article"
  | "official_update"
  | "listing"
  | "personal"
  | "tool";

export type Evidence = {
  kind: EvidenceKind;
  /** public = 出典/カードとして提示可能。private = 本人にのみ、citation化しない。 */
  visibility: "public" | "private";
  title: string;
  /** モデルへ渡す本文/要約（最小化済み。個人の生データは含めない）。 */
  content: string;
  /** 公開URL（発明禁止・信頼済みレジストリ/DBメタデータ由来のみ）。private は null。 */
  url: string | null;
  /** 安定した出典ID（記事slug・listing:id・news:slug・tool:slug・capability名）。 */
  sourceId: string;
  /** 鮮度（ISO日付/日時、または "live" 等のラベル）。 */
  freshness: string | null;
  riskLevel: RiskLevel;
  /** 構造化メタ（数値フィルタ結果・件数など、非個人の補助情報）。 */
  metadata?: Record<string, string | number | boolean | null>;
};

/**
 * チャットUIが安全に描画する構造化カード（モデルにHTMLを作らせない）。
 * URLは信頼済みレジストリ/DBメタデータからのみ生成する。
 */
export type StructuredCard =
  | {
      kind: "job";
      id: string;
      title: string;
      poster: string;
      location: string;
      pay: string | null;
      employmentType: string | null;
      url: string;
      status?: string;
    }
  | {
      kind: "housing";
      id: string;
      title: string;
      poster: string;
      location: string;
      weeklyRent: string | null;
      roomType: string | null;
      url: string;
      status?: string;
    }
  | {
      kind: "vehicle";
      id: string;
      title: string;
      poster: string;
      location: string;
      price: string | null;
      make: string | null;
      model: string | null;
      transmission: string | null;
      url: string;
      status?: string;
    }
  | {
      kind: "tool";
      id: string;
      title: string;
      description: string;
      url: string;
    }
  | {
      kind: "application";
      id: string;
      title: string;
      status: string;
      appliedAt: string;
      url: string;
    }
  | {
      kind: "notification";
      id: string;
      title: string;
      notifType: string;
      createdAt: string;
      read: boolean;
      url: string | null;
    }
  | {
      kind: "saved";
      id: string;
      title: string;
      itemType: string;
      url: string;
      closed?: boolean;
    }
  | {
      kind: "news";
      id: string;
      title: string;
      date: string;
      category: string;
      url: string;
    };

/**
 * 信頼済みアクション（ボタン）。URLはモデルに発明させず、ルート/DBメタデータから
 * サーバーが生成する。
 */
export type TrustedAction = {
  id: string;
  label: string;
  url: string;
  /** UIのスタイル/意図分類。 */
  intent: "tool" | "listing" | "personal" | "news" | "article" | "login";
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
  /** 実行された構造化ケイパビリティ名（診断用）。 */
  capabilities?: string[];
  /** 各段のレイテンシ（ms）。 */
  capabilityLatencyMs?: number;
  /** 認証が必要だが未ログインで拒否したか。 */
  authRequired?: boolean;
  /** 構造化検索が0件だったか。 */
  noResult?: boolean;
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
  /** UIが描画する安全な構造化カード（求人・住居・車・ツール・応募・通知等）。 */
  cards?: StructuredCard[];
  /** 信頼済みアクション（ボタン）。URLはサーバー生成。 */
  actions?: TrustedAction[];
  /** 個人ケイパビリティで未ログインのため拒否した場合 true。 */
  authRequired?: boolean;
  /** debug かつモデレーターの場合のみ付与。 */
  diagnostics?: PipelineDiagnostics;
};

/** サイト内に十分な情報がない場合の定型応答。 */
export const UNSUPPORTED_ANSWER =
  "現在、サイト内にこの質問へ回答できる十分な情報がありません。関連しそうなカテゴリのページやサイト内検索もお試しください。";

/**
 * サーバー側で導出した認証コンテキスト。userId はクライアント/モデルからは受け取らず、
 * 必ず Bearer トークン検証から導出する（なりすまし防止）。
 */
export type AuthContext = {
  userId: string | null;
  isAuthenticated: boolean;
  isModerator: boolean;
};

/** 個人データ質問だが未ログインの場合の定型応答。 */
export const LOGIN_REQUIRED_ANSWER =
  "この質問はあなたのアカウント情報（応募状況・保存・通知・88日の記録など）に関するものです。ログインすると、あなたの記録に基づいてお答えできます。";
