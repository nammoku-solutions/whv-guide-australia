import { articles } from "@/lib/content/articles";
import type { Article } from "@/types/article";
import type { ArticleChunk } from "./types";
import { chunkArticle } from "./chunking";

/**
 * 公開対象の記事だけを返す。ドラフト・レビュー・アーカイブ・merged 等は除外する。
 * lib/content/registry.ts の公開判定（published かつ本文あり）と同じ原則。
 * ここに載らない記事は AI のナレッジベースにも入らない。
 */
export function getIndexableArticles(): Article[] {
  return articles.filter((a) => {
    const status = a.status ?? (a.published ? "published" : "draft");
    return a.published === true && status === "published";
  });
}

/** 公開記事すべてを chunk 化して返す（インデックス作成の入力）。 */
export function buildAllChunks(): ArticleChunk[] {
  const chunks: ArticleChunk[] = [];
  for (const article of getIndexableArticles()) {
    chunks.push(...chunkArticle(article));
  }
  return chunks;
}
