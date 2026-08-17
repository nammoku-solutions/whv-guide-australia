/**
 * 歴史的バックフィルの DB アクセス層（service-role, サーバー専用）。
 *
 * 重要（#14 ハード要件）: このレイヤは live-monitor のベースライン状態
 * （monitor_source_state / monitor_snapshots / monitor_changes）に一切書き込まない。
 * 触れるのは news_items（＋バックフィル列）・article_impacts・news_backfill_runs のみ。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAiAdminClient } from "@/lib/ai/server/supabaseAdmin";
import type {
  ArticleImpact,
  GeneratedNews,
  RiskLevel,
  SourceDefinition,
} from "../types";
import type { DbNewsKey } from "./dedupe";
import type { HistoricalCandidate } from "./types";

export function getBackfillAdmin(): SupabaseClient | null {
  return getAiAdminClient();
}

/** マイグレーション 0012 が適用済みか（apply の安全確認）。 */
export async function backfillColumnsReady(admin: SupabaseClient): Promise<boolean> {
  const runs = await admin.from("news_backfill_runs").select("id").limit(1);
  if (runs.error) return false;
  const cols = await admin.from("news_items").select("is_backfill").limit(1);
  return !cols.error;
}

/** マイグレーション 0013（backfill_origin 列）が適用済みか。未適用でも書き込みは可能。 */
export async function originColumnReady(admin: SupabaseClient): Promise<boolean> {
  const cols = await admin.from("news_items").select("backfill_origin").limit(1);
  return !cols.error;
}

export type BackfillOrigin = "archive" | "manual_seed" | "external";

/** 実行レコードを作成し id を返す。 */
export async function createRun(
  admin: SupabaseClient,
  from: string,
  to: string,
  mode: "dry_run" | "apply",
  origin?: BackfillOrigin,
): Promise<string | null> {
  const row: Record<string, unknown> = {
    from_date: from,
    to_date: to,
    mode,
    status: "running",
  };
  // origin 列は 0013 でのみ存在。呼び出し側が存在を確認したときだけ含める。
  if (origin) row.origin = origin;
  const { data, error } = await admin
    .from("news_backfill_runs")
    .insert(row)
    .select("id")
    .maybeSingle();
  if (error) return null;
  return (data as { id: string } | null)?.id ?? null;
}

export type RunStats = {
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
};

export async function completeRun(
  admin: SupabaseClient,
  runId: string,
  stats: RunStats,
  status: "completed" | "failed",
  notes: string,
): Promise<void> {
  await admin
    .from("news_backfill_runs")
    .update({
      status,
      sources_checked: stats.sourcesChecked,
      sources_supported: stats.sourcesSupported,
      sources_unsupported: stats.sourcesUnsupported,
      candidates_discovered: stats.candidatesDiscovered,
      candidates_relevant: stats.candidatesRelevant,
      published_count: stats.publishedCount,
      review_required_count: stats.reviewRequiredCount,
      duplicate_count: stats.duplicateCount,
      skipped_count: stats.skippedCount,
      error_count: stats.errorCount,
      impacts_created: stats.impactsCreated,
      indexed_count: stats.indexedCount,
      notes: notes.slice(0, 2000),
      completed_at: new Date().toISOString(),
    })
    .eq("id", runId);
}

/** dedupe 用に既存 news_items のキーを全件取得（グローバル照合）。 */
export async function getAllNewsKeys(admin: SupabaseClient): Promise<DbNewsKey[]> {
  const { data } = await admin
    .from("news_items")
    .select("event_key, content_hash, source_url, title, source_published_at")
    .limit(2000);
  return (data ?? []).map((r) => ({
    eventKey: r.event_key as string | null,
    contentHash: r.content_hash as string | null,
    sourceUrl: r.source_url as string | null,
    title: r.title as string | null,
    sourcePublishedAt: r.source_published_at as string | null,
  }));
}

/** バックフィルニュースを挿入する。detected_at=取り込み日時, source_published_at=公式日。 */
export async function insertBackfillNews(
  admin: SupabaseClient,
  args: {
    slug: string;
    news: GeneratedNews;
    source: SourceDefinition;
    candidate: HistoricalCandidate;
    riskLevel: RiskLevel;
    contentHash: string;
    eventKey: string;
    relatedArticleIds: string[];
    relatedGuideSlug: string | null;
    publicationMode: "auto" | "review";
    status: "published" | "review_required";
    runId: string | null;
    importedAt: string;
    /** 0013 適用済みのときのみ設定（archive | manual_seed | external）。 */
    origin?: BackfillOrigin;
    /** 外部候補由来のとき、その external_news_candidates.id（0014 適用済みのみ）。 */
    externalCandidateId?: string | null;
  },
): Promise<string | null> {
  const c = args.candidate;
  const body = [
    args.news.whatChanged,
    args.news.whoIsAffected ? `対象となる人：${args.news.whoIsAffected}` : "",
    args.news.whatToDo ? `取るべき行動：${args.news.whatToDo}` : "",
  ].filter((s) => s && s.trim());

  const payload: Record<string, unknown> = {
    slug: args.slug,
    title: args.news.title,
    summary: args.news.summary,
    what_changed: args.news.whatChanged || null,
    who_is_affected: args.news.whoIsAffected || null,
    what_to_do: args.news.whatToDo || null,
    body,
    category: args.source.category,
    change_group: args.source.changeGroup,
    source_organisation: args.source.organisation,
    source_title: args.source.sourceName,
    // 公式の告知 URL を出典として保持（アーカイブ記事 URL 等）。
    source_url: c.officialUrl || args.source.url,
    source_published_at: `${c.officialPublishedAt}T00:00:00Z`,
    source_updated_at: c.officialUpdatedAt ? `${c.officialUpdatedAt}T00:00:00Z` : null,
    // 取り込み日時（実際にこのバックフィルが検出した日時）。公式日とは別。
    detected_at: args.importedAt,
    verified_at: args.importedAt.slice(0, 10),
    risk_level: args.riskLevel,
    confidence: args.news.confidence,
    related_article_ids: args.relatedArticleIds,
    related_guide_slug: args.relatedGuideSlug,
    publication_mode: args.publicationMode,
    status: args.status,
    content_hash: args.contentHash,
    event_key: args.eventKey,
    is_backfill: true,
    backfill_run_id: args.runId,
    published_at: args.status === "published" ? args.importedAt : null,
  };
  // backfill_origin 列は 0013 でのみ存在。存在確認済みのときだけ含める。
  if (args.origin) payload.backfill_origin = args.origin;
  // external_candidate_id 列は 0014 でのみ存在。外部候補処理で確認済みのときだけ含める。
  if (args.externalCandidateId) payload.external_candidate_id = args.externalCandidateId;

  const { data, error } = await admin
    .from("news_items")
    .insert(payload)
    .select("id")
    .maybeSingle();
  if (error) return null;
  return (data as { id: string } | null)?.id ?? null;
}

/** バックフィルの記事影響を挿入する（change_id は null）。 */
export async function insertBackfillImpacts(
  admin: SupabaseClient,
  newsId: string | null,
  impacts: ArticleImpact[],
): Promise<number> {
  const rows = impacts
    .filter((im) => im.impactLevel !== "unaffected")
    .map((im) => ({
      change_id: null,
      news_id: newsId,
      article_id: im.articleId,
      article_title: im.articleTitle,
      article_url: im.articleUrl,
      impact_level: im.impactLevel,
      reason: im.reason,
      affected_sections: im.affectedSections,
      previous_verified_at: im.previousVerifiedAt ?? null,
      recommended_action: im.recommendedAction,
      status: "open",
    }));
  if (rows.length === 0) return 0;
  const { error } = await admin.from("article_impacts").insert(rows);
  if (error) return 0;
  return rows.length;
}
