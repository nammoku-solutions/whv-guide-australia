/**
 * 外部ニュース候補の投函サービス（narrow で型付けされた唯一の契約）。
 *
 * 使う主体:
 *   - スマホ管理 UI（モデレーターセッション）
 *   - 信頼できる機械取り込み（スコープ付きシークレット or 接続済み Supabase）
 *
 * 決して公開しない: 任意 SQL・汎用テーブル変更・service-role キー・任意 URL の取り込み。
 * 受理するのは定義済みの候補フィールドのみ。allow-list 検証は必須。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { validateAndCanonicalise, resolveOfficialSource } from "../backfill/officialDomains";
import { parseOfficialDate } from "../backfill/dates";
import type { SourceDefinition } from "../types";
import { getExternalAdmin, externalTableReady, insertCandidate } from "./db";
import { normaliseEvidence, evidenceToText, hasSufficientEvidence, evidenceHash } from "./evidence";
import type {
  SubmitExternalInput,
  SubmitResult,
  SourceEvidence,
  ExternalErrorCode,
} from "./types";

export type ValidatedSubmission = {
  ok: true;
  canonicalUrl: string;
  source: SourceDefinition;
  evidence: SourceEvidence;
  evidenceHashValue: string;
  publishedAt: string;
  updatedAt: string | null;
};

export type SubmissionValidationError = {
  ok: false;
  errorCode: ExternalErrorCode;
  error: string;
};

/**
 * 投函を DB なしで決定的に検証する（URL allow-list・ソース解決・日付・エビデンス十分性）。
 * テスト可能な純関数。
 */
export function validateSubmission(
  input: SubmitExternalInput,
): ValidatedSubmission | SubmissionValidationError {
  // 1. URL 検証 + 正規化（http/https・公式 *.gov.au 由来のみ）。
  const v = validateAndCanonicalise(input.sourceUrl ?? "");
  if (!v.ok) {
    return {
      ok: false,
      errorCode: v.error === "INVALID_URL" ? "invalid_url" : "invalid_source",
      error: v.detail,
    };
  }
  // 2. レジストリソース解決（対応する公式ソース定義が必須）。
  const source = resolveOfficialSource(v.url);
  if (!source) {
    return { ok: false, errorCode: "invalid_source", error: "対応する公式ソース定義がありません。" };
  }
  // 3. タイトル必須。
  const title = (input.sourceTitle ?? "").trim();
  if (!title) {
    return { ok: false, errorCode: "insufficient_evidence", error: "公式タイトルが必要です。" };
  }
  // 4. 公式公開日（推測しない）。
  const publishedAt = parseOfficialDate((input.sourcePublishedAt ?? "").trim());
  if (!publishedAt) {
    return { ok: false, errorCode: "invalid_date", error: `公式公開日を解釈できません（${input.sourcePublishedAt}）。` };
  }
  const updatedRaw = (input.sourceUpdatedAt ?? "").trim();
  const updatedAt = updatedRaw ? parseOfficialDate(updatedRaw) : null;
  if (updatedRaw && !updatedAt) {
    return { ok: false, errorCode: "invalid_date", error: `公式更新日を解釈できません（${updatedRaw}）。` };
  }
  // 5. エビデンス正規化 + 十分性。
  const evidence = normaliseEvidence(input.evidence);
  if (!hasSufficientEvidence(evidence)) {
    return {
      ok: false,
      errorCode: "insufficient_evidence",
      error: "公式エビデンスが不足しています（要約・事実・数値・日付・本文のいずれかで十分な情報を与えてください）。",
    };
  }

  return {
    ok: true,
    canonicalUrl: v.url,
    source,
    evidence,
    evidenceHashValue: evidenceHash(evidence),
    publishedAt,
    updatedAt,
  };
}

export type SubmitDeps = { admin?: SupabaseClient | null };

/**
 * 検証済みの候補を pending で永続化する（冪等）。再送は既存 id を返す。
 */
export async function submitExternalCandidate(
  input: SubmitExternalInput,
  deps: SubmitDeps = {},
): Promise<SubmitResult> {
  const validated = validateSubmission(input);
  if (!validated.ok) {
    return { ok: false, errorCode: validated.errorCode, error: validated.error };
  }

  const admin = deps.admin !== undefined ? deps.admin : getExternalAdmin();
  if (!admin) {
    return { ok: false, errorCode: "database_error", error: "サーバー設定が未完了です。" };
  }
  if (!(await externalTableReady(admin))) {
    return {
      ok: false,
      errorCode: "database_error",
      error: "0014_external_news_candidates マイグレーションが未適用です。",
    };
  }

  const { source } = validated;
  const result = await insertCandidate(admin, {
    sourceOrganisation: input.sourceOrganisation?.trim() || source.organisation,
    sourceUrl: validated.canonicalUrl,
    sourceTitle: input.sourceTitle.trim(),
    sourcePublishedAt: validated.publishedAt,
    sourceUpdatedAt: validated.updatedAt,
    evidence: validated.evidence,
    evidenceHash: validated.evidenceHashValue,
    evidenceOrigin: input.evidenceOrigin,
    categoryHint: input.categoryHint ?? null,
    origin: input.origin,
    submittedBy: input.submittedBy ?? null,
  });

  if (!result.id) {
    return { ok: false, errorCode: "database_error", error: result.error ?? "候補の保存に失敗しました。" };
  }

  return {
    ok: true,
    id: result.id,
    status: "accepted",
    deduplicated: result.deduplicated,
    canonicalUrl: validated.canonicalUrl,
    organisation: source.organisation,
    riskLevel: source.riskLevel,
    category: source.category,
  };
}

/** 検証で得られる正規化テキスト（プレビュー/デバッグ補助・UI には生ペイロードを出さない）。 */
export function evidencePreviewText(input: SubmitExternalInput): string {
  return evidenceToText(normaliseEvidence(input.evidence));
}
