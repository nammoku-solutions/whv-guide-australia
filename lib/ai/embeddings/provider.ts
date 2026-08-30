/**
 * Runtime embedding boundary.
 *
 * Embedding generation is intentionally disabled while no external model API
 * provider is configured. Existing database schema and retrieval code are kept
 * for a future explicit reactivation, but this module performs no network I/O.
 */

export type EmbeddingTaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

export async function embedTexts(
  texts: string[],
  _taskType: EmbeddingTaskType,
): Promise<number[][]> {
  if (texts.length === 0) return [];
  throw new Error(
    "Runtime AI embeddings are disabled. Configure and implement an approved external provider before enabling them.",
  );
}

export async function embedText(
  text: string,
  taskType: EmbeddingTaskType,
): Promise<number[]> {
  const [vector] = await embedTexts([text], taskType);
  return vector;
}
