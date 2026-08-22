/**
 * 外部ニュース候補インボックス（External News Candidate Inbox）で共有する型。
 *
 * 設計原則:
 *   - これは取り込み（ingestion）層のみ。関連度・grounding・dedupe・リスク・公開ポリシー・
 *     記事影響・AI 索引はすべて既存の共有パイプライン（backfill/pipeline.ts の
 *     processCandidate）を再利用する（別系統の生成器を作らない）。
 *   - エビデンスは公式一次情報の「要約・事実・数値・日付」のみ。全文複製は要求しない。
 *   - 生成は供給されたエビデンスだけを根拠にし、モデルの事前知識で補完しない。
 */

import type { NewsCategory, RiskLevel, Relevance } from "../types";

/** 投函元。 */
export type ExternalOrigin =
  | "chatgpt_weekly"
  | "gemini_weekly"
  | "admin_mobile"
  | "manual_seed_bridge"
  | "system";

/** エビデンスの由来。origin は公開安全性を迂回しない（#5）。 */
export type EvidenceOrigin =
  | "official_fetch"
  | "external_research"
  | "operator_content";

/** 候補の状態機械（DB CHECK と一致）。 */
export type ExternalStatus =
  | "pending"
  | "processing"
  | "published"
  | "review_required"
  | "duplicate"
  | "irrelevant"
  | "skipped"
  | "failed"
  | "rejected";

/** エラーコード（#25）。 */
export type ExternalErrorCode =
  | "invalid_source"
  | "invalid_url"
  | "insufficient_evidence"
  | "invalid_date"
  | "duplicate"
  | "relevance_failed"
  | "generation_failed"
  | "grounding_failed"
  | "processing_timeout"
  | "database_error"
  | "index_error";

/**
 * 構造化された公式ソースエビデンス（DTO）。全文複製ではなく、公式ページからの
 * 事実抽出。生成の唯一の根拠になる。
 */
export type SourceEvidence = {
  /** 公式ソースからの簡潔な事実要約（必須）。 */
  summary: string;
  /** 事実の箇条書き（任意）。 */
  facts?: string[];
  /** 金額/率などの数値（任意）。 */
  numbers?: { value: string; context: string }[];
  /** 日付（任意）。 */
  dates?: { value: string; context: string }[];
  /** オペレータ貼り付けの公式本文フォールバック（任意）。 */
  text?: string;
};

/** 投函の入力（narrow で型付けされた唯一の契約）。 */
export type SubmitExternalInput = {
  sourceUrl: string;
  sourceTitle: string;
  sourceOrganisation?: string | null;
  /** 公式公開日（YYYY-MM-DD 等。推測しない）。 */
  sourcePublishedAt: string;
  /** 公式更新日（任意）。 */
  sourceUpdatedAt?: string | null;
  /** 構造化 DTO または素のテキスト（テキストは text フィールドへ正規化）。 */
  evidence: SourceEvidence | string;
  categoryHint?: NewsCategory | null;
  evidenceOrigin: EvidenceOrigin;
  origin: ExternalOrigin;
  /** モバイル取り込み時のモデレーター user id（サーバー側で導出）。 */
  submittedBy?: string | null;
};

/** 投函結果。 */
export type SubmitResult = {
  ok: boolean;
  /** 作成 or 既存（idempotent）の候補 id。 */
  id?: string;
  status?: ExternalStatus | "accepted";
  /** 既存候補と一致した（再送）場合 true。 */
  deduplicated?: boolean;
  errorCode?: ExternalErrorCode;
  error?: string;
  /** 検証済みの正規化 URL / 解決したレジストリソース情報（UI 表示用）。 */
  canonicalUrl?: string;
  organisation?: string;
  riskLevel?: RiskLevel;
  category?: NewsCategory;
};

/** external_news_candidates の行（サーバー内部で使う形）。 */
export type ExternalCandidateRow = {
  id: string;
  source_organisation: string | null;
  source_url: string;
  source_title: string;
  source_published_at: string;
  source_updated_at: string | null;
  source_evidence: SourceEvidence;
  source_evidence_hash: string;
  evidence_origin: EvidenceOrigin;
  category_hint: string | null;
  origin: ExternalOrigin;
  submitted_by: string | null;
  submitted_at: string;
  status: ExternalStatus;
  processing_started_at: string | null;
  processed_at: string | null;
  processing_attempts: number;
  last_error_code: string | null;
  last_error_message: string | null;
  news_item_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

/** 1 候補処理の結果（プレビュー/監査用）。 */
export type ProcessOutcome = {
  candidateId: string;
  status: ExternalStatus;
  detail: string;
  relevance?: Relevance;
  confidence?: number;
  duplicate?: boolean;
  groundingOk?: boolean;
  riskLevel?: RiskLevel;
  newsItemId?: string | null;
  newsSlug?: string | null;
  impacts?: number;
  indexed?: boolean;
  errorCode?: ExternalErrorCode;
  /** 生成された日本語ニュースのプレビュー（生成できた場合のみ）。 */
  preview?: {
    title: string;
    summary: string;
    whatChanged: string;
    whoIsAffected: string;
    whatToDo: string;
    sourcePublishedAt?: string;
  };
};
