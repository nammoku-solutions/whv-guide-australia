/**
 * 公式情報源の監視 & ニュース自動化で共有する型。
 *
 * 設計原則:
 *   - 変更検知は完全に決定的（fetch -> extract -> normalise -> hash -> compare）。
 *     AI は「変わったかどうか」を判断しない。
 *   - Gemini は「関連度分類」と「日本語ニュース生成」にのみ使い、供給された
 *     公式コンテンツだけを根拠にする（日付・料率・URL 等を創作しない）。
 */

import type { RiskLevel } from "@/lib/ai/types";

export type { RiskLevel };

/** 監視方式（優先順位: rss > html）。 */
export type MonitoringMethod = "rss" | "html";

/** /changes ページのグルーピング。 */
export type ChangeGroup =
  | "visa"
  | "work"
  | "tax"
  | "super"
  | "cars"
  | "housing"
  | "other";

/** サイト内ニュースのカテゴリ（types/news.ts と一致）。 */
export type NewsCategory = "visa" | "tax" | "cost" | "site" | "other";

/** 関連度分類。 */
export type Relevance =
  | "highly_relevant"
  | "relevant"
  | "weakly_relevant"
  | "unrelated";

/** 取得ステータス（失敗は決して「変更なし」として扱わない）。 */
export type FetchStatus =
  | "success"
  | "timeout"
  | "http_error"
  | "parse_error"
  | "blocked"
  | "unexpected_structure";

/** 記事への影響度。 */
export type ImpactLevel =
  | "unaffected"
  | "review_recommended"
  | "likely_outdated"
  | "requires_update";

/**
 * allow-list に載る公式情報源の静的定義（コード管理・レビュー対象）。
 * 可変な監視状態（last_checked 等）は Supabase の monitor_source_state に持つ。
 */
export type SourceDefinition = {
  /** 一意な安定 ID（DB の state と対応）。 */
  sourceId: string;
  organisation: string;
  sourceName: string;
  url: string;
  /** RSS/Atom フィード URL（あれば優先的に使う）。 */
  feedUrl?: string;
  category: NewsCategory;
  changeGroup: ChangeGroup;
  riskLevel: RiskLevel;
  monitoringMethod: MonitoringMethod;
  enabled: boolean;
  /** 影響記事の突合に使う関連カテゴリ（types/article.ts の ArticleCategory）。 */
  relatedCategories: string[];
  /**
   * 低/中リスクで、意味のある変更・十分な関連度・信頼度・grounding を満たした
   * ときに自動公開してよいか。高リスクは常に review。
   */
  autoPublishEligibility: boolean;
};

/** 取得結果（決定的処理の入力）。 */
export type FetchResult = {
  status: FetchStatus;
  httpStatus?: number;
  /** 生の本文（html または rss/atom）。 */
  raw?: string;
  contentType?: string;
  error?: string;
};

/** 抽出後の正規化コンテンツ。 */
export type ExtractedContent = {
  /** nav/footer/cookie 等を除いた意味のある本文。 */
  text: string;
  /** RSS/Atom の場合の最新エントリのタイトル（あれば）。 */
  latestTitle?: string;
  /** RSS/Atom の場合の最新エントリの公開日（ISO, あれば）。 */
  latestPublishedAt?: string;
  /** RSS/Atom の場合の最新エントリの URL（あれば）。 */
  latestUrl?: string;
};

/** 関連度分類の結果（Gemini）。 */
export type RelevanceResult = {
  relevance: Relevance;
  confidence: number;
  reason: string;
};

/** 生成された構造化ニュース（Gemini, 公式コンテンツのみを根拠）。 */
export type GeneratedNews = {
  title: string;
  summary: string;
  whatChanged: string;
  whoIsAffected: string;
  whatToDo: string;
  /** ソースが確実なときのみ（不明なら省略）。 */
  sourcePublishedAt?: string;
  confidence: number;
};

/** 記事影響の 1 件。 */
export type ArticleImpact = {
  articleId: string;
  articleTitle: string;
  articleUrl: string;
  impactLevel: ImpactLevel;
  reason: string;
  affectedSections: string[];
  previousVerifiedAt?: string;
  recommendedAction: string;
};
