/**
 * 監視パイプラインの DB アクセス層（service-role, サーバー専用）。
 * すべての特権書き込みはここを通す。クライアントへ露出させない。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAiAdminClient } from "@/lib/ai/server/supabaseAdmin";
import type {
  ArticleImpact,
  FetchStatus,
  GeneratedNews,
  RiskLevel,
  SourceDefinition,
} from "./types";
import type { ExistingNewsKey } from "./dedupe";

export function getMonitorAdmin(): SupabaseClient | null {
  return getAiAdminClient();
}

export type SourceState = {
  source_id: string;
  content_hash: string | null;
  last_checked: string | null;
  last_changed: string | null;
  last_status: string | null;
  consecutive_failures: number;
};

export async function getSourceState(
  admin: SupabaseClient,
  sourceId: string,
): Promise<SourceState | null> {
  const { data } = await admin
    .from("monitor_source_state")
    .select("source_id, content_hash, last_checked, last_changed, last_status, consecutive_failures")
    .eq("source_id", sourceId)
    .maybeSingle();
  return (data as SourceState) ?? null;
}

/** 全ソースの監視状態を取得する（ヘルス表示用・読み取り専用）。 */
export async function getAllSourceStates(
  admin: SupabaseClient,
): Promise<Map<string, SourceState>> {
  const { data } = await admin
    .from("monitor_source_state")
    .select("source_id, content_hash, last_checked, last_changed, last_status, consecutive_failures");
  const map = new Map<string, SourceState>();
  for (const row of (data as SourceState[] | null) ?? []) map.set(row.source_id, row);
  return map;
}

/** 取得成功だが変更なし: last_checked / status のみ更新。 */
export async function markChecked(
  admin: SupabaseClient,
  sourceId: string,
  status: FetchStatus,
): Promise<void> {
  await admin.from("monitor_source_state").upsert(
    {
      source_id: sourceId,
      last_checked: new Date().toISOString(),
      last_status: status,
      last_error: null,
      consecutive_failures: 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "source_id" },
  );
}

/** 取得失敗: 失敗回数を増やし、決して content_hash を更新しない。 */
export async function markFailure(
  admin: SupabaseClient,
  sourceId: string,
  status: FetchStatus,
  error: string | undefined,
  prevFailures: number,
): Promise<void> {
  await admin.from("monitor_source_state").upsert(
    {
      source_id: sourceId,
      last_checked: new Date().toISOString(),
      last_status: status,
      last_error: error ?? null,
      consecutive_failures: prevFailures + 1,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "source_id" },
  );
}

/** 直近スナップショットの本文を取得（差分計算用）。 */
export async function getLatestSnapshotText(
  admin: SupabaseClient,
  sourceId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("monitor_snapshots")
    .select("extracted_text")
    .eq("source_id", sourceId)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { extracted_text: string } | null)?.extracted_text ?? null;
}

/** 初回観測/boilerplate 揺れ: content_hash のみ更新（変更イベント扱いしない）。 */
export async function establishBaseline(
  admin: SupabaseClient,
  sourceId: string,
  newHash: string,
  status: FetchStatus,
): Promise<void> {
  const now = new Date().toISOString();
  await admin.from("monitor_source_state").upsert(
    {
      source_id: sourceId,
      last_checked: now,
      content_hash: newHash,
      last_status: status,
      last_error: null,
      consecutive_failures: 0,
      updated_at: now,
    },
    { onConflict: "source_id" },
  );
}

/** 変更確定: content_hash と last_changed を更新。 */
export async function markChanged(
  admin: SupabaseClient,
  sourceId: string,
  newHash: string,
): Promise<void> {
  const now = new Date().toISOString();
  await admin.from("monitor_source_state").upsert(
    {
      source_id: sourceId,
      last_checked: now,
      last_changed: now,
      content_hash: newHash,
      last_status: "success",
      last_error: null,
      consecutive_failures: 0,
      updated_at: now,
    },
    { onConflict: "source_id" },
  );
}

export async function saveSnapshot(
  admin: SupabaseClient,
  sourceId: string,
  contentHash: string,
  extractedText: string,
  httpStatus: number | undefined,
  retention: number,
): Promise<string | null> {
  const { data } = await admin
    .from("monitor_snapshots")
    .insert({
      source_id: sourceId,
      content_hash: contentHash,
      extracted_text: extractedText,
      http_status: httpStatus ?? null,
    })
    .select("id")
    .maybeSingle();
  await admin.rpc("prune_monitor_snapshots", {
    p_source_id: sourceId,
    p_keep: retention,
  });
  return (data as { id: string } | null)?.id ?? null;
}

export async function insertChange(
  admin: SupabaseClient,
  args: {
    source: SourceDefinition;
    previousHash: string | null;
    newHash: string;
    diff: string;
    snapshotId: string | null;
  },
): Promise<string | null> {
  // (source_id, new_hash) 一意制約で決定的にデデュープ。既存なら id を返す。
  const { data, error } = await admin
    .from("monitor_changes")
    .upsert(
      {
        source_id: args.source.sourceId,
        organisation: args.source.organisation,
        source_name: args.source.sourceName,
        url: args.source.url,
        category: args.source.category,
        risk_level: args.source.riskLevel,
        previous_hash: args.previousHash,
        new_hash: args.newHash,
        diff: args.diff,
        snapshot_id: args.snapshotId,
        status: "new",
      },
      { onConflict: "source_id,new_hash", ignoreDuplicates: false },
    )
    .select("id")
    .maybeSingle();
  if (error) return null;
  return (data as { id: string } | null)?.id ?? null;
}

export async function setChangeProcessed(
  admin: SupabaseClient,
  changeId: string,
  relevance: string,
  confidence: number,
  status: "processed" | "ignored",
): Promise<void> {
  await admin
    .from("monitor_changes")
    .update({ relevance, relevance_confidence: confidence, status })
    .eq("id", changeId);
}

/** dedupe 用の既存キーを取得（同一ソースに限定）。 */
export async function getExistingNewsKeys(
  admin: SupabaseClient,
  sourceUrl: string,
): Promise<ExistingNewsKey[]> {
  const { data } = await admin
    .from("news_items")
    .select("event_key, content_hash, source_url")
    .eq("source_url", sourceUrl);
  return (data ?? []).map((r) => ({
    eventKey: r.event_key as string | null,
    contentHash: r.content_hash as string | null,
    sourceUrl: r.source_url as string | null,
  }));
}

export async function insertNews(
  admin: SupabaseClient,
  args: {
    slug: string;
    news: GeneratedNews;
    source: SourceDefinition;
    riskLevel: RiskLevel;
    changeGroup: string;
    category: string;
    detectedAt: string;
    verifiedAt: string;
    snapshotId: string | null;
    changeId: string | null;
    contentHash: string;
    eventKey: string;
    relatedArticleIds: string[];
    relatedGuideSlug: string | null;
    publicationMode: "auto" | "review";
    status: "published" | "review_required";
  },
): Promise<string | null> {
  const now = new Date().toISOString();
  const body = [
    args.news.whatChanged,
    args.news.whoIsAffected ? `対象となる人：${args.news.whoIsAffected}` : "",
    args.news.whatToDo ? `取るべき行動：${args.news.whatToDo}` : "",
  ].filter((s) => s && s.trim());

  const { data, error } = await admin
    .from("news_items")
    .insert({
      slug: args.slug,
      title: args.news.title,
      summary: args.news.summary,
      what_changed: args.news.whatChanged || null,
      who_is_affected: args.news.whoIsAffected || null,
      what_to_do: args.news.whatToDo || null,
      body,
      category: args.category,
      change_group: args.changeGroup,
      source_organisation: args.source.organisation,
      source_title: args.source.sourceName,
      source_url: args.source.url,
      source_published_at: args.news.sourcePublishedAt
        ? new Date(args.news.sourcePublishedAt).toISOString()
        : null,
      detected_at: args.detectedAt,
      verified_at: args.verifiedAt,
      risk_level: args.riskLevel,
      confidence: args.news.confidence,
      source_snapshot_id: args.snapshotId,
      related_article_ids: args.relatedArticleIds,
      related_guide_slug: args.relatedGuideSlug,
      publication_mode: args.publicationMode,
      status: args.status,
      change_id: args.changeId,
      content_hash: args.contentHash,
      event_key: args.eventKey,
      published_at: args.status === "published" ? now : null,
    })
    .select("id")
    .maybeSingle();
  if (error) return null;
  return (data as { id: string } | null)?.id ?? null;
}

export async function insertArticleImpacts(
  admin: SupabaseClient,
  changeId: string | null,
  newsId: string | null,
  impacts: ArticleImpact[],
): Promise<number> {
  if (impacts.length === 0) return 0;
  const rows = impacts.map((im) => ({
    change_id: changeId,
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
  const { error, count } = await admin
    .from("article_impacts")
    .upsert(rows, { onConflict: "change_id,article_id", ignoreDuplicates: true, count: "exact" });
  if (error) return 0;
  return count ?? rows.length;
}
