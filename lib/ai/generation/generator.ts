import { aiConfig, getServerSecrets } from "../config";
import type { Evidence, EvidenceChunk, RiskLevel, RouteType } from "../types";
import {
  SYSTEM_PROMPT,
  SYSTEM_PROMPT_STRUCTURED,
  buildStructuredUserPrompt,
  buildUserPrompt,
} from "./prompts";

/**
 * 生成プロバイダの実装（Gemini REST）。プロバイダ固有の詳細をここに隔離する。
 * Supabase検索などの取得ロジックは持たず、取得済みコンテキストだけを受け取る。
 */

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export type GenerateArgs = {
  question: string;
  evidence: EvidenceChunk[];
  overallRisk: RiskLevel;
  complex?: boolean;
  history?: { role: "user" | "assistant"; content: string }[];
  structured?: { evidence: Evidence[]; route: RouteType };
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

  const history = (args.history ?? []).slice(-aiConfig.limits.maxHistoryTurns);
  const isStructured = Boolean(args.structured);
  const systemPrompt = isStructured ? SYSTEM_PROMPT_STRUCTURED : SYSTEM_PROMPT;
  const userText = isStructured
    ? buildStructuredUserPrompt(
        args.question,
        args.structured!.evidence,
        args.overallRisk,
        args.structured!.route,
      )
    : buildUserPrompt(args.question, args.evidence, args.overallRisk);

  const contents = [
    ...history.map((h) => ({
      role: h.role === "assistant" ? "model" : "user",
      parts: [{ text: h.content }],
    })),
    {
      role: "user",
      parts: [{ text: userText }],
    },
  ];

  const url = `${API_BASE}/models/${model}:generateContent?key=${geminiApiKey}`;
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
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
