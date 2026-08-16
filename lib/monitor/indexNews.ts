/**
 * 承認/自動公開されたニュース本文を AI インデックス（ai_article_chunks）へ反映する。
 * 変更コンテンツのみを対象にし、都度の全体再インデックスは行わない。
 * 下書き・レビュー中・却下・非公開スナップショットはインデックスしない。
 */

import { getAiAdminClient } from "@/lib/ai/server/supabaseAdmin";
import { embedTexts } from "@/lib/ai/embeddings/provider";
import { aiConfig } from "@/lib/ai/config";
import { contentHash } from "@/lib/ai/hash";
import type { RiskLevel } from "./types";

export type IndexableNews = {
  slug: string;
  title: string;
  summary: string;
  whatChanged?: string | null;
  whoIsAffected?: string | null;
  whatToDo?: string | null;
  category: string;
  riskLevel: RiskLevel;
  updatedAt: string;
};

/**
 * 1 件の公開ニュースをインデックスへ upsert する。content hash が一致すればスキップ。
 * @returns "indexed" | "unchanged" | "skipped"（未設定）。
 */
export async function indexPublishedNews(
  news: IndexableNews,
): Promise<"indexed" | "unchanged" | "skipped"> {
  const admin = getAiAdminClient();
  if (!admin) return "skipped";

  const version = aiConfig.embedding.version;
  const chunkId = `news-${news.slug}::0`;
  const body = [news.whatChanged, news.whoIsAffected, news.whatToDo]
    .filter((s): s is string => Boolean(s && s.trim()))
    .join("\n");
  const content = `【ニュース｜${news.title}】\n${news.summary}\n${body}`.trim();
  const hash = contentHash(content);

  const { data: existing } = await admin
    .from("ai_article_chunks")
    .select("content_hash")
    .eq("chunk_id", chunkId)
    .eq("embedding_version", version)
    .maybeSingle();

  if (existing?.content_hash === hash) return "unchanged";

  const [vector] = await embedTexts([content], "RETRIEVAL_DOCUMENT");
  const { error } = await admin.from("ai_article_chunks").upsert(
    {
      chunk_id: chunkId,
      article_id: `news-${news.slug}`,
      title: news.title,
      slug: `news/${news.slug}`,
      url: `/news/${news.slug}`,
      category: news.category,
      heading: "ニュース",
      chunk_index: 0,
      content,
      content_hash: hash,
      updated_at: news.updatedAt,
      risk_level: news.riskLevel,
      embedding_provider: aiConfig.embedding.provider,
      embedding_model: aiConfig.embedding.model,
      embedding_version: version,
      embedding: vector,
    },
    { onConflict: "chunk_id" },
  );
  if (error) throw new Error(`indexPublishedNews upsert failed: ${error.message}`);
  return "indexed";
}
