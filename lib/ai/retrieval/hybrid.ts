import type { RetrievalCandidate } from "../types";

/**
 * ハイブリッド検索（Phase 2 用プレースホルダ）。セマンティック結果とキーワード結果を
 * Reciprocal Rank Fusion（RRF）等で融合する。V1 では未使用。
 *
 * 有効化（AI_HYBRID_SEARCH_ENABLED=true）時は retriever がこの関数を使い、
 * 呼び出し側（chat API / generator）は一切変更不要。
 */
export function rankFusion(
  semantic: RetrievalCandidate[],
  keyword: RetrievalCandidate[],
  k = 60,
): RetrievalCandidate[] {
  const scores = new Map<string, { cand: RetrievalCandidate; score: number }>();

  const add = (list: RetrievalCandidate[]) => {
    list.forEach((cand, rank) => {
      const rrf = 1 / (k + rank + 1);
      const existing = scores.get(cand.chunkId);
      if (existing) {
        existing.score += rrf;
      } else {
        scores.set(cand.chunkId, {
          cand: { ...cand, source: "hybrid" },
          score: rrf,
        });
      }
    });
  };

  add(semantic);
  add(keyword);

  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .map(({ cand, score }) => ({ ...cand, score }));
}
