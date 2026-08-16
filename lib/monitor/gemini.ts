/**
 * 監視パイプライン用の Gemini 呼び出し（JSON 応答）。分類・生成の両方で共有する。
 * lib/ai の設定・秘匿値を流用し、依存を増やさず fetch で呼ぶ。
 *
 * テスト容易性のため、実際のモデル呼び出しは `ModelCaller` 型として注入できる。
 */

import { getServerSecrets } from "@/lib/ai/config";
import { monitorConfig } from "./config";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export type ModelCaller = (args: {
  system: string;
  user: string;
}) => Promise<string>;

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

/** 既定の Gemini 呼び出し（JSON を要求）。 */
export const callGemini: ModelCaller = async ({ system, user }) => {
  const { geminiApiKey } = getServerSecrets();
  if (!geminiApiKey) throw new Error("GEMINI_API_KEY is not configured");

  const url = `${API_BASE}/models/${monitorConfig.model}:generateContent?key=${geminiApiKey}`;
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 900,
      responseMimeType: "application/json",
    },
  };

  const res = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    monitorConfig.modelTimeoutMs,
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Monitor model request failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return (
    json.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim() ?? ""
  );
};

/** モデル出力から JSON を頑健に取り出す。```json フェンスや前後の雑音に耐える。 */
export function parseJsonLoose<T>(raw: string): T | null {
  if (!raw) return null;
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
