import { aiConfig, getServerSecrets } from "../config";

/**
 * 埋め込みプロバイダの実装（Gemini REST）。プロバイダ固有の詳細はこのファイルに
 * 隔離する。将来別プロバイダへ差し替える場合もこのモジュールだけを置き換えればよい。
 * SDK には依存せず fetch で呼ぶ（依存を増やさず Vercel 上で軽量に動かすため）。
 */

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export type EmbeddingTaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

/** 単位長に正規化（3072未満の次元では推奨。コサイン類似の一貫性を担保）。 */
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

/**
 * 複数テキストをまとめて埋め込む。dimensions は config（環境変数）由来。
 * taskType で「文書側」か「クエリ側」かを指定する。
 */
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
    throw new Error(`Embedding request failed (${res.status}): ${detail.slice(0, 200)}`);
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

/** 1テキストを埋め込む便宜関数。 */
export async function embedText(
  text: string,
  taskType: EmbeddingTaskType,
): Promise<number[]> {
  const [vec] = await embedTexts([text], taskType);
  return vec;
}
