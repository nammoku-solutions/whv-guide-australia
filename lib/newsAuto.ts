/**
 * 自動生成ニュース（Supabase）のサーバー読み取り。公開済み(status=published)のみを
 * 匿名クライアントで取得し、手書きニュース（lib/newsData.ts）とマージする。
 * サーバーコンポーネント専用。環境未設定・エラー時は空配列にフォールバックする。
 */

import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { newsItems } from "@/lib/newsData";
import type { NewsItem, NewsCategory } from "@/types/news";
import type { ChangeGroup, RiskLevel } from "@/lib/monitor/types";

export type AutomatedNews = NewsItem & {
  automated: true;
  changeGroup: ChangeGroup;
  riskLevel: RiskLevel;
  sourceOrganisation?: string;
  detectedAt?: string;
  verifiedAt?: string;
  /** 歴史的バックフィルで取り込まれた項目か（UI ラベル用）。 */
  isBackfill?: boolean;
  /** 公式公開日（YYYY-MM-DD, 表示・順序制御用）。 */
  sourcePublishedAt?: string;
};

type NewsRow = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: unknown;
  category: string;
  change_group: string;
  source_organisation: string | null;
  source_title: string | null;
  source_url: string | null;
  source_published_at: string | null;
  detected_at: string | null;
  verified_at: string | null;
  published_at: string | null;
  risk_level: string;
  related_guide_slug: string | null;
  is_backfill: boolean | null;
};

function toDate(row: NewsRow): string {
  // 歴史的バックフィルは公式公開日で並べる（取り込み日=8月を「新着」に見せない）。
  if (row.is_backfill && row.source_published_at) return row.source_published_at.slice(0, 10);
  const raw = row.published_at ?? row.source_published_at ?? row.detected_at ?? "";
  return raw ? raw.slice(0, 10) : new Date().toISOString().slice(0, 10);
}

function mapRow(row: NewsRow): AutomatedNews {
  const body = Array.isArray(row.body)
    ? (row.body as unknown[]).map((p) => String(p)).filter(Boolean)
    : [row.summary];
  const label = [row.source_organisation, row.source_title]
    .filter(Boolean)
    .join("｜");
  return {
    id: `auto-${row.id}`,
    slug: row.slug,
    title: row.title,
    date: toDate(row),
    category: (["visa", "tax", "cost", "site", "other"].includes(row.category)
      ? row.category
      : "other") as NewsCategory,
    summary: row.summary,
    body: body.length > 0 ? body : [row.summary],
    source:
      label && row.source_url
        ? { label, url: row.source_url }
        : undefined,
    relatedGuide: row.related_guide_slug ?? undefined,
    published: true,
    automated: true,
    changeGroup: (row.change_group as ChangeGroup) ?? "other",
    riskLevel: (row.risk_level as RiskLevel) ?? "low",
    sourceOrganisation: row.source_organisation ?? undefined,
    detectedAt: row.detected_at ?? undefined,
    verifiedAt: row.verified_at ?? undefined,
    isBackfill: row.is_backfill ?? undefined,
    sourcePublishedAt: row.source_published_at?.slice(0, 10) ?? undefined,
  };
}

/** 公開済みの自動ニュースを取得（新しい順）。 */
export async function getAutomatedNews(): Promise<AutomatedNews[]> {
  const client = getSupabaseServerClient();
  if (!client) return [];
  const { data, error } = await client
    .from("news_items")
    .select(
      "id, slug, title, summary, body, category, change_group, source_organisation, source_title, source_url, source_published_at, detected_at, verified_at, published_at, risk_level, related_guide_slug, is_backfill",
    )
    .eq("status", "published")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(200);
  if (error || !data) return [];
  return (data as NewsRow[]).map(mapRow);
}

function byDateDesc(a: NewsItem, b: NewsItem): number {
  return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
}

/** 手書き＋自動の公開ニュースをマージして新しい順に返す。 */
export async function getMergedNews(): Promise<NewsItem[]> {
  const auto = await getAutomatedNews();
  const staticNews = newsItems.filter((n) => n.published);
  // slug 衝突時は手書きを優先。
  const seen = new Set(staticNews.map((n) => n.slug));
  const merged = [...staticNews, ...auto.filter((a) => !seen.has(a.slug))];
  return merged.sort(byDateDesc);
}

/** マージ済みニュースから slug で 1 件取得。 */
export async function getMergedNewsBySlug(
  slug: string,
): Promise<NewsItem | undefined> {
  return (await getMergedNews()).find((n) => n.slug === slug);
}

/** ホーム等向けの最新ニュース。 */
export async function getLatestMergedNews(limit = 3): Promise<NewsItem[]> {
  return (await getMergedNews()).slice(0, limit);
}
