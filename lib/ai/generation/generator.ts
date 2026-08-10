import { aiConfig, getServerSecrets } from "../config";
import type { EvidenceChunk, RiskLevel } from "../types";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompts";

/**
 * 生成プロバイダの実装（Gemini REST）。プロバイダ固有の詳細をここに隔離する。
 * 重要: このモジュールは Supabase クエリ等の検索ロジックを一切持たない（責務分離）。
 * 受け取るのは「質問・取得済みコンテキスト・リスク・モデル選択」だけ。
 */

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export type GenerateArgs = {
  question: string;
  evidence: EvidenceChunk[];
  overallRisk: RiskLevel;
  /** true で複雑用モデルを使う（config で有効な場合のみ呼び出し側が指定）。 */
  complex?: boolean;
  /** 直近の会話履歴（最小限）。 */
  history?: { role: "user" | "assistant"; content: string }[];
};

export type GenerateResult = {
  text: string;
  modelUsed: string;
};

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

export async function generateAnswer(args: GenerateArgs): Promise<GenerateResult> {
  const { geminiApiKey } = getServerSecrets();
  if (!geminiApiKey) throw new Error("GEMINI_API_KEY is not configured");

  const model =
    args.complex && aiConfig.features.complexRoutingEnabled
      ? aiConfig.generation.modelComplex
      : aiConfig.generation.model;

  // 直近履歴（最小限）＋今回の質問。履歴は user/model ロールに整形する。
  const history = (args.history ?? []).slice(-aiConfig.limits.maxHistoryTurns);
  const contents = [
    ...history.map((h) => ({
      role: h.role === "assistant" ? "model" : "user",
      parts: [{ text: h.content }],
    })),
    {
      role: "user",
      parts: [
        { text: buildUserPrompt(args.question, args.evidence, args.overallRisk) },
      ],
    },
  ];

  const url = `${API_BASE}/models/${model}:generateContent?key=${geminiApiKey}`;
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents,
    generationConfig: {
      temperature: aiConfig.generation.temperature,
      maxOutputTokens: aiConfig.generation.maxOutputTokens,
    },
  };

  const res = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    aiConfig.generation.timeoutMs,
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Generation request failed (${res.status}): ${detail.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text =
    json.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim() ?? "";

  return { text, modelUsed: model };
}
