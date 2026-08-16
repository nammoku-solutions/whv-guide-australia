/**
 * 記事影響分析（決定的な候補抽出）。関連する公式変更に対し、影響を受けうる
 * 公開記事を特定する。ソース URL の関係・カテゴリ・タグ・verifiedAt を用いる。
 *
 * 重要: AI がフラグを立てても記事は自動書換えしない。ここは「レビュー候補」の
 * 決定的な抽出のみを行う。セマンティック検索は必要な箇所でのみ併用できる設計。
 */

import type { Article } from "@/types/article";
import type { SourceDefinition, ArticleImpact, ImpactLevel } from "./types";

/** URL のホスト＋主要パスを取り出して比較用に正規化する。 */
function urlKey(url: string): { host: string; path: string } | null {
  try {
    const u = new URL(url);
    return { host: u.host.toLowerCase(), path: u.pathname.toLowerCase().replace(/\/+$/, "") };
  } catch {
    return null;
  }
}

function pathPrefixMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  const segA = a.split("/").filter(Boolean);
  const segB = b.split("/").filter(Boolean);
  const n = Math.min(segA.length, segB.length, 3);
  if (n === 0) return false;
  for (let i = 0; i < n; i++) if (segA[i] !== segB[i]) return false;
  return true;
}

type ArticleMatch = {
  article: Article;
  exactUrl: boolean;
  hostPathMatch: boolean;
  categoryMatch: boolean;
};

function matchArticle(article: Article, source: SourceDefinition): ArticleMatch | null {
  const srcKey = urlKey(source.url);
  let exactUrl = false;
  let hostPathMatch = false;

  for (const os of article.officialSources ?? []) {
    const k = urlKey(os.url);
    if (!k || !srcKey) continue;
    if (k.host === srcKey.host) {
      if (k.path === srcKey.path) exactUrl = true;
      else if (pathPrefixMatch(k.path, srcKey.path)) hostPathMatch = true;
    }
  }

  const categoryMatch =
    source.relatedCategories.includes(article.category) ||
    (article.tags ?? []).some((t) =>
      source.relatedCategories.includes(t.toLowerCase()),
    );

  if (!exactUrl && !hostPathMatch && !categoryMatch) return null;
  return { article, exactUrl, hostPathMatch, categoryMatch };
}

/** マッチ強度とソースのリスクから影響度を決める（決定的）。 */
function impactLevelFor(m: ArticleMatch, source: SourceDefinition): ImpactLevel {
  if (m.exactUrl) {
    return source.riskLevel === "high" ? "requires_update" : "likely_outdated";
  }
  if (m.hostPathMatch) return "likely_outdated";
  return "review_recommended";
}

function recommendedAction(level: ImpactLevel): string {
  switch (level) {
    case "requires_update":
      return "公式ページを確認し、記事内容と最終確認日(verifiedAt)を更新してください。";
    case "likely_outdated":
      return "記事の該当箇所が古い可能性があります。公式ページと照合してください。";
    case "review_recommended":
      return "念のため公式ページと記事内容を確認してください。";
    default:
      return "対応不要の可能性が高いですが、必要に応じて確認してください。";
  }
}

/**
 * 影響を受けうる記事を抽出する。
 * @param source 変更が検出された公式ソース。
 * @param articles 公開記事の一覧（呼び出し側が渡す＝テスト容易）。
 */
export function analyzeArticleImpact(
  source: SourceDefinition,
  articles: Article[],
): ArticleImpact[] {
  const impacts: ArticleImpact[] = [];
  for (const article of articles) {
    const m = matchArticle(article, source);
    if (!m) continue;
    const level = impactLevelFor(m, source);
    impacts.push({
      articleId: article.id,
      articleTitle: article.title,
      articleUrl: `/guides/${article.slug}`,
      impactLevel: level,
      reason: m.exactUrl
        ? "記事の公式出典が、変更が検出された URL と一致します。"
        : m.hostPathMatch
          ? "記事の公式出典が、変更が検出されたページと同じセクションを参照しています。"
          : "記事カテゴリ/タグが変更ソースの関連カテゴリと一致します。",
      affectedSections: [],
      previousVerifiedAt: article.verifiedAt,
      recommendedAction: recommendedAction(level),
    });
  }
  // 影響度の高い順に並べる。
  const order: Record<ImpactLevel, number> = {
    requires_update: 0,
    likely_outdated: 1,
    review_recommended: 2,
    unaffected: 3,
  };
  impacts.sort((a, b) => order[a.impactLevel] - order[b.impactLevel]);
  return impacts;
}
