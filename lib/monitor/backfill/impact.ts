/**
 * 歴史的バックフィル向けの記事影響分析。既存の決定的抽出（analyzeArticleImpact）を
 * 再利用しつつ、「公式イベント日より後に記事が確認/更新済み」の場合は影響度を
 * 下げる（古い告知を今取り込んだだけで誤った陳腐化警告を出さないため, #13）。
 */

import type { Article } from "@/types/article";
import type { SourceDefinition, ArticleImpact, ImpactLevel } from "../types";
import { analyzeArticleImpact } from "../impact";

/** 記事が公式イベント日より後に確認/更新済みか。 */
function articleAlreadyCurrent(article: Article, officialDate: string): boolean {
  const dates = [article.verifiedAt, article.updatedAt].filter(Boolean) as string[];
  return dates.some((d) => d.slice(0, 10) >= officialDate);
}

/**
 * 公式イベント日を考慮して影響を評価する。
 * @param officialDate 公式公開日（YYYY-MM-DD）。
 */
export function analyzeBackfillImpact(
  source: SourceDefinition,
  articles: Article[],
  officialDate: string,
): ArticleImpact[] {
  const base = analyzeArticleImpact(source, articles);
  const byId = new Map(articles.map((a) => [a.id, a]));

  return base.map((im) => {
    const article = byId.get(im.articleId);
    if (article && articleAlreadyCurrent(article, officialDate)) {
      // 記事が公式イベント日以降に確認/更新済みなら、既に情報を反映済みとみなし unaffected。
      return {
        ...im,
        impactLevel: "unaffected" as ImpactLevel,
        reason:
          `${im.reason}（ただし記事は公式イベント日 ${officialDate} 以降に確認/更新済みのため対応不要と判断）`,
        recommendedAction: "記事は公式イベント日以降に更新済みです。対応不要の可能性が高いです。",
      };
    }
    return im;
  });
}
