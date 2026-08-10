import type { RetrievalCandidate, SourceLink } from "../types";

/**
 * 出典（関連ページ）リンクを、検索で実際に取得したチャンクのメタデータから生成する。
 * モデルに URL/タイトルを発明させない。同一記事は重複排除し、2〜4件に絞る。
 */
export function buildSources(
  context: RetrievalCandidate[],
  max = 4,
): SourceLink[] {
  const seen = new Set<string>();
  const sources: SourceLink[] = [];
  for (const c of context) {
    if (seen.has(c.url)) continue;
    seen.add(c.url);
    sources.push({ title: c.title, url: c.url });
    if (sources.length >= max) break;
  }
  return sources;
}

/**
 * モデルの回答に混入した「取得していない出典」を除去する安全弁。
 * 実際に検索されたURL集合に含まれるリンクだけを許可する。
 */
export function filterAllowedSources(
  sources: SourceLink[],
  allowedUrls: Set<string>,
): SourceLink[] {
  return sources.filter((s) => allowedUrls.has(s.url));
}
