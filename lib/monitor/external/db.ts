/**
 * 外部ニュース候補インボックスの DB アクセス層（service-role, サーバー専用）。
 *
 * すべての特権書き込み（insert/claim/update）はここを通す。クライアントへ露出させない。
 * live-monitor ベースライン（monitor_source_state / snapshots / changes）には触れない。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAiAdminClient } from "@/lib/ai/server/supabaseAdmin";
import type {
  ExternalCandidateRow,
  ExternalStatus,
  ExternalErrorCode,
  SourceEvidence,
  EvidenceOrigin,
  ExternalOrigin,
} from "./types";

export function getExternalAdmin(): SupabaseClient | null {
  return getAiAdminClient();
}

/** マイグレーション 0014 が適用済みか（書き込み前の安全確認）。 */
export async function externalTableReady(admin: SupabaseClient): Promise<boolean> {
  const r = await admin.from("external_news_candidates").select("id").limit(1);
  return !r.error;
}

/** 同一 (URL, エビデンスハッシュ) の既存候補を返す（取り込み dedupe / 冪等）。 */
export async function findCandidateByDedupe(
  admin: SupabaseClient,
  sourceUrl: string,
  evidenceHash: string,
): Promise<{ id: string; status: ExternalStatus } | null> {
  const { data } = await admin
    .from("external_news_candidates")
    .select("id, status")
    .eq("source_url", sourceUrl)
    .eq("source_evidence_hash", evidenceHash)
    .maybeSingle();
  return (data as { id: string; status: ExternalStatus } | null) ?? null;
}

/** 同一 URL の既存ニュースがあるか（取り込み時の早期 dedupe ヒント。下流 dedupe が権威）。 */
export async function newsExistsForUrl(admin: SupabaseClient, sourceUrl: string): Promise<boolean> {
  const { data } = await admin
    .from("news_items")
    .select("id")
    .eq("source_url", sourceUrl)
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

export type InsertCandidateArgs = {
  sourceOrganisation: string | null;
  sourceUrl: string;
  sourceTitle: string;
  sourcePublishedAt: string;
  sourceUpdatedAt: string | null;
  evidence: SourceEvidence;
  evidenceHash: string;
  evidenceOrigin: EvidenceOrigin;
  categoryHint: string | null;
  origin: ExternalOrigin;
  submittedBy: string | null;
};

/** 候補を pending で挿入する。dedupe 衝突時は既存 id を返す（冪等）。 */
export async function insertCandidate(
  admin: SupabaseClient,
  args: InsertCandidateArgs,
): Promise<{ id: string | null; deduplicated: boolean; error?: string }> {
  const { data, error } = await admin
    .from("external_news_candidates")
    .insert({
      source_organisation: args.sourceOrganisation,
      source_url: args.sourceUrl,
      source_title: args.sourceTitle,
      source_published_at: args.sourcePublishedAt,
      source_updated_at: args.sourceUpdatedAt,
      source_evidence: args.evidence,
      source_evidence_hash: args.evidenceHash,
      evidence_origin: args.evidenceOrigin,
      category_hint: args.categoryHint,
      origin: args.origin,
      submitted_by: args.submittedBy,
      status: "pending",
    })
    .select("id")
    .maybeSingle();

  if (error) {
    // unique 制約（source_url, source_evidence_hash）衝突 = 再送。既存を返す。
    const existing = await findCandidateByDedupe(admin, args.sourceUrl, args.evidenceHash);
    if (existing) return { id: existing.id, deduplicated: true };
    return { id: null, deduplicated: false, error: error.message };
  }
  return { id: (data as { id: string } | null)?.id ?? null, deduplicated: false };
}

/**
 * 1 件の pending 候補を原子的に claim する（status='pending' の行のみ processing へ）。
 * 二重処理を防ぐ（Postgres の行単位更新で決定的）。
 * @returns claim できた行、または null。
 */
export async function claimCandidate(
  admin: SupabaseClient,
  id: string,
): Promise<ExternalCandidateRow | null> {
  const now = new Date().toISOString();
  const { data } = await admin
    .from("external_news_candidates")
    .update({ status: "processing", processing_started_at: now })
    .eq("id", id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  const row = (data as ExternalCandidateRow | null) ?? null;
  if (!row) return null;
  // processing_attempts をインクリメント（claim 成功後）。
  await admin
    .from("external_news_candidates")
    .update({ processing_attempts: (row.processing_attempts ?? 0) + 1 })
    .eq("id", id);
  return { ...row, processing_attempts: (row.processing_attempts ?? 0) + 1 };
}

/**
 * 取りこぼした（クラッシュ等で processing のまま古くなった）候補を pending へ戻す。
 * @param staleMs これ以上古い processing_started_at を stale とみなす。
 * @returns 回収した候補 id の配列。
 */
export async function reclaimStaleCandidates(
  admin: SupabaseClient,
  staleMs: number,
): Promise<string[]> {
  const cutoff = new Date(Date.now() - staleMs).toISOString();
  const { data } = await admin
    .from("external_news_candidates")
    .update({ status: "pending", last_error_code: "processing_timeout", last_error_message: "stale processing reclaimed" })
    .eq("status", "processing")
    .lt("processing_started_at", cutoff)
    .select("id");
  return ((data as { id: string }[] | null) ?? []).map((r) => r.id);
}

/** pending の候補 id を（古い順に）バッチ上限まで取得する。 */
export async function getPendingCandidateIds(
  admin: SupabaseClient,
  limit: number,
): Promise<string[]> {
  const { data } = await admin
    .from("external_news_candidates")
    .select("id")
    .eq("status", "pending")
    .order("submitted_at", { ascending: true })
    .limit(limit);
  return ((data as { id: string }[] | null) ?? []).map((r) => r.id);
}

export type UpdateStatusArgs = {
  status: ExternalStatus;
  newsItemId?: string | null;
  errorCode?: ExternalErrorCode | null;
  errorMessage?: string | null;
};

/** 候補の終了状態を書き込む（processed_at を刻む）。 */
export async function finalizeCandidate(
  admin: SupabaseClient,
  id: string,
  args: UpdateStatusArgs,
): Promise<void> {
  await admin
    .from("external_news_candidates")
    .update({
      status: args.status,
      processed_at: new Date().toISOString(),
      news_item_id: args.newsItemId ?? null,
      last_error_code: args.errorCode ?? null,
      last_error_message: args.errorMessage ? args.errorMessage.slice(0, 500) : null,
    })
    .eq("id", id);
}

/** モデレーター/管理者の user id を取得する（レビュー通知の宛先）。 */
export async function getModeratorIds(admin: SupabaseClient): Promise<string[]> {
  const { data } = await admin
    .from("profiles")
    .select("id")
    .in("role", ["admin", "moderator"]);
  return ((data as { id: string }[] | null) ?? []).map((r) => r.id);
}

/**
 * モデレーター全員へレビュー要求のアプリ内通知を作成する（type='system' で prefs を迂回）。
 * create_notification RPC（SECURITY DEFINER, service-role のみ EXECUTE）を再利用する。
 * dedupe_key で候補ごとに 1 通に抑制する。公開前に一般ユーザーには通知しない。
 */
export async function notifyModeratorsReviewRequired(
  admin: SupabaseClient,
  args: { candidateId: string; title: string },
): Promise<number> {
  const ids = await getModeratorIds(admin);
  let sent = 0;
  for (const uid of ids) {
    const { error } = await admin.rpc("create_notification", {
      p_user_id: uid,
      p_type: "system",
      p_title: "公式ニュース候補の確認が必要です",
      p_body: args.title.slice(0, 200),
      p_target_type: "admin_external_candidate",
      p_target_id: args.candidateId,
      p_target_url: "/admin/monitor/import",
      p_dedupe_key: `external_review:${args.candidateId}`,
      p_metadata: {},
    });
    if (!error) sent++;
  }
  return sent;
}
