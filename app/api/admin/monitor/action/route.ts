/**
 * 管理者向け: 監視ニュース/影響記事に対するアクション（モデレーターのみ）。
 * approve / reject / mark_not_relevant / mark_article_reviewed / resolve_article。
 * 承認公開時は、変更コンテンツのみを AI インデックスへ反映する。
 * 通常ユーザーは承認/却下/監視状態変更/特権インデックス起動を一切できない。
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getAiAdminClient } from "@/lib/ai/server/supabaseAdmin";
import { requireModerator } from "@/lib/monitor/adminAuth";
import { indexPublishedNews } from "@/lib/monitor/indexNews";
import type { RiskLevel } from "@/lib/monitor/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  action: z.enum([
    "approve",
    "reject",
    "mark_not_relevant",
    "mark_article_reviewed",
    "resolve_article",
  ]),
  id: z.string().uuid(),
});

export async function POST(request: Request) {
  const auth = await requireModerator(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: "権限がありません。" }, { status: 403 });
  }

  const admin = getAiAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "サーバー設定が未完了です。" }, { status: 503 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "リクエスト形式が不正です。" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "入力が不正です。" },
      { status: 400 },
    );
  }
  const { action, id } = parsed.data;

  if (action === "approve") {
    const now = new Date().toISOString();
    const { data: row, error: readErr } = await admin
      .from("news_items")
      .select("slug, title, summary, what_changed, who_is_affected, what_to_do, category, risk_level")
      .eq("id", id)
      .maybeSingle();
    if (readErr || !row) {
      return NextResponse.json({ ok: false, error: "ニュースが見つかりません。" }, { status: 404 });
    }
    const { error } = await admin
      .from("news_items")
      .update({ status: "published", published_at: now, updated_at: now })
      .eq("id", id);
    if (error) {
      return NextResponse.json({ ok: false, error: "更新に失敗しました。" }, { status: 500 });
    }
    // 変更コンテンツのみをインデックス（失敗しても公開自体は成功扱い）。
    let indexed = false;
    try {
      const r = await indexPublishedNews({
        slug: row.slug as string,
        title: row.title as string,
        summary: row.summary as string,
        whatChanged: row.what_changed as string | null,
        whoIsAffected: row.who_is_affected as string | null,
        whatToDo: row.what_to_do as string | null,
        category: row.category as string,
        riskLevel: (row.risk_level as RiskLevel) ?? "low",
        updatedAt: now,
      });
      indexed = r === "indexed";
    } catch {
      indexed = false;
    }
    return NextResponse.json({ ok: true, indexed });
  }

  if (action === "reject") {
    const now = new Date().toISOString();
    const { error } = await admin
      .from("news_items")
      .update({ status: "rejected", updated_at: now })
      .eq("id", id);
    if (error) {
      return NextResponse.json({ ok: false, error: "更新に失敗しました。" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "mark_not_relevant") {
    const { error } = await admin
      .from("monitor_changes")
      .update({ status: "ignored", relevance: "unrelated" })
      .eq("id", id);
    if (error) {
      return NextResponse.json({ ok: false, error: "更新に失敗しました。" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "mark_article_reviewed") {
    const { error } = await admin
      .from("article_impacts")
      .update({ status: "reviewed", reviewed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      return NextResponse.json({ ok: false, error: "更新に失敗しました。" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // resolve_article
  const { error } = await admin
    .from("article_impacts")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ ok: false, error: "更新に失敗しました。" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
