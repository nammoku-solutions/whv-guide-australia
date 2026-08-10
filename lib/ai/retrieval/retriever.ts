import { aiConfig } from "../config";
import type { RetrievalCandidate } from "../types";
import { semanticSearch } from "./semantic";
import { keywordSearch, hasStrongKeyword } from "./keyword";
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
 * ハイブリッド有効時はセマンティック＋キーワードを RRF で融合する。
 *
 * 接地判定（hasGrounding）:
 *   - セマンティック類似度がしきい値以上の候補があれば接地。
 *   - もしくは「強い完全一致語」（TFN/ABN/417/Rego 等）があり、キーワード検索が
 *     ヒットした場合も接地とみなす（完全一致クエリの取りこぼし防止）。
 *   - これにより一般的な日本語NLクエリはセマンティックしきい値で守られ、
 *     ハルシネーション・無駄な生成コストを抑える。
 */
export async function retrieve(query: string): Promise<RetrievalResult> {
  const { similarityThreshold, maxContextChunks, maxChunksPerArticle, rrfK } =
    aiConfig.retrieval;

  if (aiConfig.features.hybridSearchEnabled) {
    const [semantic, keyword] = await Promise.all([
      semanticSearch(query),
      keywordSearch(query),
    ]);

    const semanticAbove = semantic.filter((c) => c.score >= similarityThreshold);
    const keywordGrounds = keyword.length > 0 && hasStrongKeyword(query);
    const grounded = semanticAbove.length > 0 || keywordGrounds;

    const fused = rankFusion(semantic, keyword, rrfK);
    const context = grounded
      ? diversify(fused, maxContextChunks, maxChunksPerArticle)
      : [];

    return { context, candidates: fused, hasGrounding: grounded };
  }

  // セマンティックのみ。
  const candidates = await semanticSearch(query);
  candidates.sort((a, b) => b.score - a.score);
  const aboveThreshold = candidates.filter(
    (c) => c.score >= similarityThreshold,
  );
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
