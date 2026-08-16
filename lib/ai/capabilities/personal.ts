/**
 * 本人の記録に関する認証必須ケイパビリティ（応募 / 保存 / 通知 / 88日）。
 *
 * セキュリティ方針:
 *   - userId は必ずサーバー導出（Bearerトークン検証）のものを使う。
 *     クライアント/モデルの任意 userId は受け取らない（requireAuth で確認）。
 *   - サービスロール（getAiAdminClient）で引くが、必ず本人IDで明示フィルタし、
 *     他ユーザーの行を返さない。employer 内部メモ・応募本文・連絡先などの
 *     非公開項目はモデル/カードに一切渡さない（データ最小化）。
 */

import { getAiAdminClient } from "../server/supabaseAdmin";
import { aiConfig } from "../config";
import { actions as trustedActions, listingDetailUrl, ROUTES } from "../actions";
import type { Evidence, StructuredCard } from "../types";
import { getArticleBySlug } from "@/lib/articles";
import { getNewsBySlug } from "@/lib/news";
import { getToolBySlug } from "@/lib/tools/registry";
import { requireAuth, type CapabilityContext } from "./context";
import { emptyResult, type CapabilityResult } from "./types";

const APP_STATUS_LABEL: Record<string, string> = {
  applied: "応募済み",
  viewed: "確認済み",
  contacted: "連絡済み",
  interview: "面接",
  accepted: "採用",
  rejected: "不採用",
  withdrawn: "取り下げ",
};

function authRequiredResult(name: string): CapabilityResult {
  return { ...emptyResult(name), authRequired: true };
}

// -------------------- Applications --------------------

export async function getMyApplications(
  ctx: CapabilityContext,
): Promise<CapabilityResult> {
  if (!aiConfig.features.personalDataEnabled) return emptyResult("getMyApplications");
  if (!requireAuth(ctx)) return authRequiredResult("getMyApplications");
  const admin = getAiAdminClient();
  if (!admin) return emptyResult("getMyApplications");

  // 本人が応募した行のみ。employer_response / message / contact_info は選択しない。
  const { data } = await admin
    .from("listing_applications")
    .select("id, listing_id, status, created_at, listings(title, listing_type)")
    .eq("applicant_id", ctx.userId)
    .order("created_at", { ascending: false });

  type Row = {
    id: string;
    listing_id: string;
    status: string;
    created_at: string | null;
    listings: { title: string | null; listing_type: string | null } | null;
  };
  const rows = (data as Row[] | null) ?? [];

  // 集計（ステータス別件数）。
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;

  const recent = rows.slice(0, aiConfig.structured.maxApplications);
  const cards: StructuredCard[] = recent.map((r) => ({
    kind: "application",
    id: r.id,
    title: r.listings?.title ?? "（掲載）",
    status: APP_STATUS_LABEL[r.status] ?? r.status,
    appliedAt: (r.created_at ?? "").slice(0, 10),
    url: listingDetailUrl(r.listing_id),
  }));

  const summaryLine = Object.entries(counts)
    .map(([s, n]) => `${APP_STATUS_LABEL[s] ?? s}: ${n}件`)
    .join(" / ");
  const evidence: Evidence[] = [
    {
      kind: "personal",
      visibility: "private",
      title: "あなたの応募状況（集計）",
      content:
        rows.length === 0
          ? "現在、あなたの応募記録はありません。"
          : `合計 ${rows.length} 件の応募。内訳 — ${summaryLine}。直近: ${recent
              .map((r) => `${r.listings?.title ?? "掲載"}（${APP_STATUS_LABEL[r.status] ?? r.status}）`)
              .join("、")}`,
      url: null,
      sourceId: "capability:getMyApplications",
      freshness: "live",
      riskLevel: "low",
      metadata: { total: rows.length },
    },
  ];

  return {
    name: "getMyApplications",
    evidence,
    cards,
    actions: [trustedActions.manageApplications()],
    count: rows.length,
  };
}

// -------------------- Saved items --------------------

export async function getMySavedItems(
  ctx: CapabilityContext,
): Promise<CapabilityResult> {
  if (!aiConfig.features.personalDataEnabled) return emptyResult("getMySavedItems");
  if (!requireAuth(ctx)) return authRequiredResult("getMySavedItems");
  const admin = getAiAdminClient();
  if (!admin) return emptyResult("getMySavedItems");

  const limit = aiConfig.structured.maxSavedItems;

  const [savedItemsRes, savedListingsRes] = await Promise.all([
    admin
      .from("saved_items")
      .select("id, item_type, item_id, created_at")
      .eq("user_id", ctx.userId)
      .order("created_at", { ascending: false })
      .limit(limit),
    admin
      .from("saved_listings")
      .select("id, listing_id, listings(id, title, status, listing_type, expires_at)")
      .eq("user_id", ctx.userId)
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  const cards: StructuredCard[] = [];

  type SavedItemRow = { id: string; item_type: string; item_id: string };
  for (const r of ((savedItemsRes.data as SavedItemRow[] | null) ?? [])) {
    let title = r.item_id;
    let url = "/";
    if (r.item_type === "article") {
      const a = getArticleBySlug(r.item_id);
      title = a?.title ?? r.item_id;
      url = `/guides/${r.item_id}`;
    } else if (r.item_type === "tool") {
      const t = getToolBySlug(r.item_id);
      title = t?.title ?? r.item_id;
      url = t?.path ?? ROUTES.toolsHub;
    } else if (r.item_type === "news") {
      const n = getNewsBySlug(r.item_id);
      title = n?.title ?? r.item_id;
      url = `/news/${r.item_id}`;
    }
    cards.push({ kind: "saved", id: r.id, title, itemType: r.item_type, url });
  }

  type SavedListingRow = {
    id: string;
    listing_id: string;
    listings: {
      id: string;
      title: string | null;
      status: string | null;
      expires_at: string | null;
    } | null;
  };
  let closedCount = 0;
  for (const r of ((savedListingsRes.data as SavedListingRow[] | null) ?? [])) {
    if (!r.listings) continue;
    const expired =
      r.listings.expires_at != null &&
      new Date(r.listings.expires_at).getTime() <= Date.now();
    const closed = r.listings.status !== "active" || expired;
    if (closed) closedCount += 1;
    cards.push({
      kind: "saved",
      id: r.id,
      title: r.listings.title ?? "（掲載）",
      itemType: "listing",
      url: listingDetailUrl(r.listing_id),
      closed,
    });
  }

  const total = cards.length;
  const evidence: Evidence[] = [
    {
      kind: "personal",
      visibility: "private",
      title: "あなたの保存アイテム",
      content:
        total === 0
          ? "保存済みのアイテムはありません。"
          : `保存済み ${total} 件${closedCount > 0 ? `（うち掲載 ${closedCount} 件は募集終了/期限切れ）` : ""}。` +
            cards
              .slice(0, limit)
              .map((c) =>
                c.kind === "saved"
                  ? `${c.title}（${c.itemType}${c.closed ? "・終了" : ""}）`
                  : "",
              )
              .filter(Boolean)
              .join("、"),
      url: null,
      sourceId: "capability:getMySavedItems",
      freshness: "live",
      riskLevel: "low",
      metadata: { total, closedCount },
    },
  ];

  return {
    name: "getMySavedItems",
    evidence,
    cards,
    actions: [trustedActions.savedItems()],
    count: total,
  };
}

// -------------------- Notifications --------------------

const NOTIF_TYPE_LABEL: Record<string, string> = {
  saved_article_updated: "保存記事の更新",
  important_news: "重要なお知らせ",
  saved_listing_updated: "保存掲載の更新",
  saved_listing_closing: "保存掲載の締切間近",
  saved_listing_closed: "保存掲載の終了",
  new_matching_listing: "新着マッチ掲載",
  application_status_changed: "応募ステータス変更",
  application_message: "応募メッセージ",
  community_reply: "コミュニティ返信",
  system: "システム",
};

export async function getMyNotifications(
  ctx: CapabilityContext,
): Promise<CapabilityResult> {
  if (!aiConfig.features.personalDataEnabled) return emptyResult("getMyNotifications");
  if (!requireAuth(ctx)) return authRequiredResult("getMyNotifications");
  const admin = getAiAdminClient();
  if (!admin) return emptyResult("getMyNotifications");

  const limit = aiConfig.structured.maxNotifications;
  const { data } = await admin
    .from("notifications")
    .select("id, type, title, target_url, created_at, read_at")
    .eq("user_id", ctx.userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  type Row = {
    id: string;
    type: string;
    title: string;
    target_url: string | null;
    created_at: string;
    read_at: string | null;
  };
  const rows = (data as Row[] | null) ?? [];
  const unread = rows.filter((r) => r.read_at == null).length;

  // target_url は create_notification が生成したサイト内相対URLのみ許可（発明防止）。
  const safeUrl = (u: string | null): string | null =>
    u && u.startsWith("/") ? u : null;

  const cards: StructuredCard[] = rows.map((r) => ({
    kind: "notification",
    id: r.id,
    title: r.title,
    notifType: NOTIF_TYPE_LABEL[r.type] ?? r.type,
    createdAt: (r.created_at ?? "").slice(0, 10),
    read: r.read_at != null,
    url: safeUrl(r.target_url),
  }));

  const evidence: Evidence[] = [
    {
      kind: "personal",
      visibility: "private",
      title: "あなたの通知",
      content:
        rows.length === 0
          ? "新しい通知はありません。"
          : `未読 ${unread} 件 / 直近 ${rows.length} 件。` +
            rows
              .slice(0, limit)
              .map((r) => `${NOTIF_TYPE_LABEL[r.type] ?? r.type}: ${r.title}`)
              .join("、"),
      url: null,
      sourceId: "capability:getMyNotifications",
      freshness: "live",
      riskLevel: "low",
      metadata: { unread, total: rows.length },
    },
  ];

  return {
    name: "getMyNotifications",
    evidence,
    cards,
    actions: [trustedActions.notifications()],
    count: rows.length,
  };
}

// -------------------- 88-day progress --------------------

/**
 * 88日の進捗。現状、勤務記録は端末ローカル（localStorage）にのみ保存され、
 * サーバー同期は存在しない。したがってサーバー側では本人の記録を取得できない。
 * 要件どおり「サーバー側にデータが無い」ことを明示し、必ずツールへ誘導する。
 * 88日という日数はビザ適格性を保証しない（免責を保持）。
 */
export async function getMy88DayProgress(
  _ctx: CapabilityContext,
): Promise<CapabilityResult> {
  if (!aiConfig.features.personalDataEnabled) return emptyResult("getMy88DayProgress");
  // 認証状態に関わらずサーバー側記録は無いが、個人質問の扱いは pipeline 側で制御。
  const evidence: Evidence[] = [
    {
      kind: "personal",
      visibility: "private",
      title: "88日の記録（サーバー側）",
      content:
        "現在、88日の勤務記録はお使いの端末内（88日カレンダーツール）にのみ保存され、" +
        "サーバーには同期されていません。そのため、AI からあなたの正確な残り日数を取得できません。" +
        "88日カレンダーを開くと、記録済みの勤務日・残り日数・証拠書類の有無を確認できます。" +
        "なお、この日数の集計はビザの可否や指定業務・地域の該当性を保証するものではありません（最終判断は移民局）。",
      url: null,
      sourceId: "capability:getMy88DayProgress",
      freshness: "live",
      riskLevel: "high",
      metadata: { serverDataAvailable: false },
    },
  ];
  return {
    name: "getMy88DayProgress",
    evidence,
    cards: [],
    actions: [trustedActions.eightyEightCalendar()],
    count: 0,
  };
}
