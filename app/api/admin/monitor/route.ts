/**
 * 管理者向け: 監視サマリの取得（モデレーターのみ）。
 * 検出された変更・自動公開ニュース・レビュー要求ニュース・影響記事を返す。
 * すべて service-role で読み取り、RLS を跨いだ信頼済みサーバー処理として扱う。
 */

import { NextResponse } from "next/server";
import { getAiAdminClient } from "@/lib/ai/server/supabaseAdmin";
import { requireModerator } from "@/lib/monitor/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireModerator(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: "権限がありません。" }, { status: 403 });
  }

  const admin = getAiAdminClient();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "サーバー設定が未完了です。" },
      { status: 503 },
    );
  }

  const [changes, news, impacts] = await Promise.all([
    admin
      .from("monitor_changes")
      .select(
        "id, source_id, organisation, source_name, url, category, risk_level, relevance, relevance_confidence, diff, status, detected_at",
      )
      .order("detected_at", { ascending: false })
      .limit(100),
    admin
      .from("news_items")
      .select(
        "id, slug, title, summary, category, change_group, risk_level, confidence, source_organisation, source_title, source_url, source_published_at, status, publication_mode, detected_at, verified_at, published_at, related_guide_slug, is_backfill",
      )
      .order("created_at", { ascending: false })
      .limit(100),
    admin
      .from("article_impacts")
      .select(
        "id, change_id, news_id, article_id, article_title, article_url, impact_level, reason, previous_verified_at, recommended_action, status, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  return NextResponse.json({
    ok: true,
    changes: changes.data ?? [],
    news: news.data ?? [],
    impacts: impacts.data ?? [],
  });
}
