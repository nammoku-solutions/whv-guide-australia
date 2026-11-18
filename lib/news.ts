import { newsItems } from "@/lib/newsData";
import type { NewsCategory, NewsItem } from "@/types/news";

const categoryLabels: Record<NewsCategory, string> = {
  visa: "ビザ",
  tax: "税金",
  cost: "費用",
  site: "サイト",
  other: "その他",
};

function byDateDesc(a: NewsItem, b: NewsItem): number {
  return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
}

// 公開日の基準は、週次ニュースの運用と同じブリスベン時間です。
const newsDateFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Australia/Brisbane",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function getAllNews(now = new Date()): NewsItem[] {
  const today = newsDateFormatter.format(now);
  return newsItems.filter((item) => item.published && item.date <= today).sort(byDateDesc);
}

export function getLatestNews(limit = 3): NewsItem[] {
  return getAllNews().slice(0, limit);
}

export function getNewsBySlug(slug: string): NewsItem | undefined {
  return getAllNews().find((item) => item.slug === slug);
}

export function getNewsCategoryLabel(category: NewsCategory): string {
  return categoryLabels[category] ?? category;
}
