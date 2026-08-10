import { aiConfig } from "../config";
import type { Reranker, RetrievalCandidate } from "../types";

/**
 * 何もしない Reranker（V1 の既定）。候補をそのまま返す。
 * インターフェースは安定しているため、将来 Cohere Rerank や多言語リランカーへ
 * 差し替えても retriever / chat API を変更する必要はない。
 */
export class NoopReranker implements Reranker {
  async rerank(
    _query: string,
    candidates: RetrievalCandidate[],
  ): Promise<RetrievalCandidate[]> {
    return candidates;
  }
}

/**
 * 設定に応じた Reranker を返す。AI_RERANK_ENABLED=true でも、実リランカー未実装の
 * 間は Noop を返す（有効化手順は SITE_AI_UPGRADE_ROADMAP.md 参照）。
 */
export function getReranker(): Reranker {
  if (!aiConfig.features.rerankEnabled) return new NoopReranker();
  // TODO(Phase 3): 外部/内部リランカー実装をここで返す。
  return new NoopReranker();
}
