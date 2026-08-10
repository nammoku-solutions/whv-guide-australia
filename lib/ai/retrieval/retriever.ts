import { aiConfig } from "../config";
import type { RetrievalCandidate } from "../types";
import { semanticSearch } from "./semantic";
import { keywordSearch } from "./keyword";
import { rankFusion } from "./hybrid";

export type RetrievalResult = {
  /** しきい値・多様性フィルタ適用後の最終コンテキスト候補。 */
  context: RetrievalCandidate[];
  /** フィルタ前の全候補（診断用）。 */
  candidates: RetrievalCandidate[];
  /** 十分な根拠が見つかったか（しきい値を超える候補があるか）。 */
  hasGrounding: boolean;
};

/**
 * 同一記事の重複でコンテキストが偏らないよう多様性を確保しつつ、上位を選ぶ。
 * 記事あたりの採用数に上限を設ける。
 */
function diversify(
  candidates: RetrievalCandidate[],
  maxContext: number,
  maxPerArticle: number,
): RetrievalCandidate[] {
  const perArticle = new Map<string, number>();
  const picked: RetrievalCandidate[] = [];
  for (const c of candidates) {
    const used = perArticle.get(c.articleId) ?? 0;
    if (used >= maxPerArticle) continue;
    picked.push(c);
    perArticle.set(c.articleId, used + 1);
    if (picked.length >= maxContext) break;
  }
  return picked;
}

/**
 * 検索オーケストレーション。生成モデルには依存しない（責務分離）。
 * V1 はセマンティックのみ。AI_HYBRID_SEARCH_ENABLED でキーワード＋融合に切替。
 */
export async function retrieve(query: string): Promise<RetrievalResult> {
  const { similarityThreshold, maxContextChunks, maxChunksPerArticle } =
    aiConfig.retrieval;

  let candidates: RetrievalCandidate[];
  if (aiConfig.features.hybridSearchEnabled) {
    const [semantic, keyword] = await Promise.all([
      semanticSearch(query),
      keywordSearch(query),
    ]);
    candidates = rankFusion(semantic, keyword);
  } else {
    candidates = await semanticSearch(query);
  }

  candidates.sort((a, b) => b.score - a.score);

  // ハイブリッド時はスコアが融合スコアになるため、しきい値はセマンティック時のみ適用。
  const aboveThreshold = aiConfig.features.hybridSearchEnabled
    ? candidates
    : candidates.filter((c) => c.score >= similarityThreshold);

  const context = diversify(
    aboveThreshold,
    maxContextChunks,
    maxChunksPerArticle,
  );

  return {
    context,
    candidates,
    hasGrounding: context.length > 0,
  };
}
