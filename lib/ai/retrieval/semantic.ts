import { aiConfig } from "../config";
import type { RetrievalCandidate, RiskLevel } from "../types";
import { getAiAdminClient } from "../server/supabaseAdmin";
import { embedText } from "../embeddings/provider";

/**
 * セマンティック（ベクトル）検索。クエリを埋め込み、Supabase の RPC
 * `match_ai_article_chunks` で類似度検索する。埋め込みは公開せず、必ずサーバー側
 * の信頼済みクライアント（service-role）＋ RPC 経由で実行する。
 */
export async function semanticSearch(
  query: string,
): Promise<RetrievalCandidate[]> {
  const admin = getAiAdminClient();
  if (!admin) throw new Error("Supabase admin client is not configured");

  const embedding = await embedText(query, "RETRIEVAL_QUERY");

  const { data, error } = await admin.rpc("match_ai_article_chunks", {
    // PostgREST が JSON 配列を vector にキャストする。
    query_embedding: embedding,
    match_threshold: 0, // しきい値はアプリ側（retriever）で適用し、診断用に生スコアを得る
    match_count: aiConfig.retrieval.candidateCount,
    p_embedding_version: aiConfig.embedding.version,
  });

  if (error) throw new Error(`semanticSearch RPC failed: ${error.message}`);

  const rows = (data ?? []) as Array<{
    chunk_id: string;
    article_id: string;
    title: string;
    slug: string;
    url: string;
    category: string;
    heading: string;
    content: string;
    risk_level: string;
    similarity: number;
  }>;

  return rows.map((r) => ({
    chunkId: r.chunk_id,
    articleId: r.article_id,
    title: r.title,
    slug: r.slug,
    url: r.url,
    category: r.category,
    heading: r.heading,
    content: r.content,
    riskLevel: (r.risk_level as RiskLevel) ?? "low",
    score: r.similarity,
    source: "semantic" as const,
  }));
}
