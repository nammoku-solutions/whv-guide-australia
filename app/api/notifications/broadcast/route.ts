import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  savedArticleUpdatedDedupeKey,
  savedArticleUpdatedTitle,
  importantNewsDedupeKey,
} from "@/lib/notifications/logic.mjs";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * サーバー主導の通知生成エンドポイント（モデレーター/管理者のみ）。
 *
 * - saved_article_updated: 記事を保存したユーザーへ「保存した『○○』が更新されました」。
 *   実際に内容が更新されたときにのみ手動/スクリプトから呼ぶ。誤検知（監視が
 *   「古い可能性」とフラグしただけ）では呼ばないこと。dedupe_key は updatedAt を
 *   含むため、同一バージョンで二重通知しない。
 * - important_news: 関連コンテンツ（記事/ニュース）を保存したユーザーに限定して通知。
 *   全ユーザーへの一斉配信は v1 では意図的に未実装（プライバシー・過剰通知の回避）。
 *
 * 個人情報は本文に含めない。宛先はサーバー側の saved_items から解決する。
 */
type ArticlePayload = {
  kind: "saved_article_updated";
  slug: string;
  title: string;
  updatedAt: string;
};

type NewsPayload = {
  kind: "important_news";
  slug: string;
  title: string;
  summary?: string;
  /** 関連する保存済みコンテンツで宛先を限定する（記事slug）。 */
  relatedArticleSlugs?: string[];
};

type Payload = ArticlePayload | NewsPayload;

function isPayload(value: unknown): value is Payload {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (v.kind === "saved_article_updated") {
    return (
      typeof v.slug === "string" &&
      typeof v.title === "string" &&
      typeof v.updatedAt === "string"
    );
  }
  if (v.kind === "important_news") {
    return typeof v.slug === "string" && typeof v.title === "string";
  }
  return false;
}

export async function POST(request: Request) {
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ ok: false, error: "サーバー側の設定が未完了です。" }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    return NextResponse.json({ ok: false, error: "認証が必要です。" }, { status: 401 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // トークン検証 → モデレーター/管理者のみ許可（クライアント提供のIDは信頼しない）。
  const {
    data: { user },
    error: userError,
  } = await admin.auth.getUser(token);
  if (userError || !user) {
    return NextResponse.json({ ok: false, error: "認証に失敗しました。" }, { status: 401 });
  }
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || (profile.role !== "moderator" && profile.role !== "admin")) {
    return NextResponse.json({ ok: false, error: "権限がありません。" }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  if (!isPayload(payload)) {
    return NextResponse.json({ ok: false, error: "invalid payload" }, { status: 400 });
  }

  // 宛先を saved_items から解決する。
  let recipients: string[] = [];
  if (payload.kind === "saved_article_updated") {
    const { data } = await admin
      .from("saved_items")
      .select("user_id")
      .eq("item_type", "article")
      .eq("item_id", payload.slug);
    recipients = uniqueUsers(data);
  } else {
    const slugs = new Set<string>();
    for (const s of payload.relatedArticleSlugs ?? []) slugs.add(s);
    const rows: { user_id: string }[] = [];
    if (slugs.size > 0) {
      const { data } = await admin
        .from("saved_items")
        .select("user_id")
        .eq("item_type", "article")
        .in("item_id", Array.from(slugs));
      rows.push(...((data as { user_id: string }[] | null) ?? []));
    }
    const { data: newsSavers } = await admin
      .from("saved_items")
      .select("user_id")
      .eq("item_type", "news")
      .eq("item_id", payload.slug);
    rows.push(...((newsSavers as { user_id: string }[] | null) ?? []));
    recipients = uniqueUsers(rows);
  }

  if (recipients.length === 0) {
    return NextResponse.json({ ok: true, notified: 0 });
  }

  let notified = 0;
  for (const userId of recipients) {
    const args =
      payload.kind === "saved_article_updated"
        ? {
            p_user_id: userId,
            p_type: "saved_article_updated",
            p_title: savedArticleUpdatedTitle(payload.title),
            p_body: null,
            p_target_type: "article",
            p_target_id: payload.slug,
            p_target_url: `/guides/${payload.slug}`,
            p_dedupe_key: savedArticleUpdatedDedupeKey(payload.slug, payload.updatedAt),
            p_metadata: {},
          }
        : {
            p_user_id: userId,
            p_type: "important_news",
            p_title: payload.title,
            p_body: payload.summary ?? null,
            p_target_type: "news",
            p_target_id: payload.slug,
            p_target_url: `/news/${payload.slug}`,
            p_dedupe_key: importantNewsDedupeKey(payload.slug),
            p_metadata: {},
          };
    const { data, error } = await admin.rpc("create_notification", args);
    if (!error && data) notified += 1;
  }

  return NextResponse.json({ ok: true, notified });
}

function uniqueUsers(rows: { user_id: string }[] | null | undefined): string[] {
  const set = new Set<string>();
  for (const row of rows ?? []) {
    if (row?.user_id) set.add(row.user_id);
  }
  return Array.from(set);
}
