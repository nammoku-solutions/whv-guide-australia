/**
 * 歴史的バックフィル（過去の公式ニュースの一括取り込み）で共有する型。
 *
 * 設計原則（既存 live-monitor と同じ品質・グラウンディング・重複防止・リスク・
 * AI インデックスの規則を再利用する）:
 *   - 公式一次情報のみ。日付は公式メタ/本文から取得し、絶対に推測しない。
 *   - live-monitor のベースライン状態（monitor_source_state / monitor_snapshots /
 *     monitor_changes）には一切書き込まない。
 *   - detectedAt = 取り込み日時（例: 2026-08-16）。source_published_at = 公式公開日。
 *     この 2 つを混同しない。
 */

import type {
  NewsCategory,
  RiskLevel,
  Relevance,
  SourceDefinition,
} from "../types";

/** 歴史的ソースの取得種別。 */
export type HistoricalSourceType = "rss" | "archive";

/** ソース単位の探索ステータス（失敗を「ニュースなし」に丸めない）。 */
export type DiscoveryStatus =
  | "supported" // 対応・エントリ取得成功（0 件でも supported）
  | "unsupported" // 現在状態ページのみ等で歴史的再構成が不可
  | "timeout"
  | "http_error"
  | "blocked"
  | "parse_error"
  | "malformed_date"
  | "unexpected_structure";

/**
 * 探索で見つかった 1 件の候補。構造化された公式メタデータを保持する。
 * officialPublishedAt は公式メタ/本文由来のみ。確実な日付が無ければ標準ニュース化しない。
 */
export type HistoricalCandidate = {
  sourceId: string;
  sourceOrganisation: string;
  /** 監視レジストリのソース URL（影響記事の突合・ラベル用）。 */
  registrySourceUrl: string;
  officialTitle: string;
  /** この告知の公式ページ URL（アーカイブ記事 URL 等）。 */
  officialUrl: string;
  /** 公式の公開日（ISO, 必須。無ければ候補は破棄）。 */
  officialPublishedAt: string;
  /** 公式の更新日（ISO, あれば）。 */
  officialUpdatedAt?: string;
  /** 正規化済みの公式本文（グラウンディングの唯一の根拠）。 */
  content: string;
  sourceType: HistoricalSourceType;
  /** この告知の一覧に出ていた要約（あれば, プレフィルタ用）。 */
  listSummary?: string;
  discoveredAt: string;
  historicalRangeFrom: string;
  historicalRangeTo: string;
};

/** 1 ソースの探索結果。 */
export type SourceDiscovery = {
  sourceId: string;
  organisation: string;
  sourceType: HistoricalSourceType | "none";
  status: DiscoveryStatus;
  detail: string;
  candidates: HistoricalCandidate[];
};

/**
 * 歴史的ソースアダプタ。ソース固有のパースを分離し、将来の公式ソースを
 * 安全に追加できるようにする。
 */
export type HistoricalSourceAdapter = {
  sourceId: string;
  supportsBackfill: boolean;
  /** 指定範囲の候補を探索する。失敗種別は status で厳密に返す。 */
  discoverEntries: (
    from: string,
    to: string,
    deps: AdapterDeps,
  ) => Promise<SourceDiscovery>;
};

/** アダプタ/パイプラインへ注入する依存（テスト容易性）。 */
export type AdapterDeps = {
  fetchImpl?: typeof fetch;
};

/** 1 候補の処理結果（バックフィルの監査単位）。 */
export type CandidateResult =
  | "published"
  | "review_required"
  | "duplicate"
  | "skipped_unrelated"
  | "skipped_weak"
  | "skipped_grounding"
  | "skipped_no_date"
  | "skipped_thin"
  | "error";

/** レポート/CLI 出力用の候補 1 行。 */
export type CandidateReportRow = {
  officialDate: string;
  organisation: string;
  title: string;
  category: NewsCategory;
  riskLevel: RiskLevel;
  result: CandidateResult;
  sourceUrl: string;
  detail: string;
  relevance?: Relevance;
  confidence?: number;
  slug?: string;
  impacts?: number;
  indexed?: boolean;
};

/** ソース単位のサマリ（レポート用）。 */
export type SourceReportRow = {
  sourceId: string;
  organisation: string;
  supported: boolean;
  status: DiscoveryStatus;
  discovered: number;
  detail: string;
};

/** バックフィル全体の結果。 */
export type BackfillReport = {
  from: string;
  to: string;
  mode: "dry_run" | "apply";
  sourcesChecked: number;
  sourcesSupported: number;
  sourcesUnsupported: number;
  candidatesDiscovered: number;
  candidatesRelevant: number;
  publishedCount: number;
  reviewRequiredCount: number;
  duplicateCount: number;
  skippedCount: number;
  errorCount: number;
  impactsCreated: number;
  indexedCount: number;
  /** live-monitor ベースラインに触れていないことの確認（常に true 設計）。 */
  liveMonitorBaselineUntouched: boolean;
  runId?: string | null;
  sources: SourceReportRow[];
  candidates: CandidateReportRow[];
  notes: string[];
};

export type { SourceDefinition };
