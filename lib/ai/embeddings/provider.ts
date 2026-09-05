import { aiConfig, getServerSecrets } from "../config";

/**
 * 埋め込みプロバイダの実装（Gemini REST）。プロバイダ固有の詳細はここに隔離する。
 * SDKには依存せずfetchで呼ぶため、Vercel上でも軽量に動作する。
 */

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export type EmbeddingTaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

function normalize(vec: number[]): number[] {
  let sum = 0;
  for (const v of vec) sum += v * v;
  const norm = Math.sqrt(sum);
  if (norm === 0) return vec;
  return vec.map((v) => v / norm);
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function embedTexts(
  texts: string[],
  taskType: EmbeddingTaskType,
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const { geminiApiKey } = getServerSecrets();
  if (!geminiApiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const { model, dimensions, timeoutMs } = aiConfig.embedding;
  const url = `${API_BASE}/models/${model}:batchEmbedContents?key=${geminiApiKey}`;
  const body = {
    requests: texts.map((text) => ({
      model: `models/${model}`,
      content: { parts: [{ text }] },
      taskType,
      outputDimensionality: dimensions,
    })),
  };

  const res = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    timeoutMs,
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Embedding request failed (${res.status}): ${detail.slice(0, 600)}`);
  }

  const json = (await res.json()) as {
    embeddings?: { values: number[] }[];
  };
  const embeddings = json.embeddings ?? [];
  if (embeddings.length !== texts.length) {
    throw new Error("Embedding response count mismatch");
  }

  return embeddings.map((e) =>
    dimensions < 3072 ? normalize(e.values) : e.values,
  );
}

export async function embedText(
  text: string,
  taskType: EmbeddingTaskType,
): Promise<number[]> {
  const [vec] = await embedTexts([text], taskType);
  return vec;
}
