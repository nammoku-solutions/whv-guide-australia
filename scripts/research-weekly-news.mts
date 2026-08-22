import fs from "node:fs";
import { getEnabledSources } from "../lib/monitor/registry";
import { getExternalAdmin } from "../lib/monitor/external/db";
import { submitExternalCandidate } from "../lib/monitor/external/submit";
import type { SourceDefinition } from "../lib/monitor/types";
import type { WeeklyResearchCandidate } from "../lib/monitor/external/weeklyResearch";
import {
  buildWeeklyResearchPrompt,
  candidateToSubmitInput,
  parseWeeklyResearchResponse,
} from "../lib/monitor/external/weeklyResearch";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
// Gemini 2.5 Flash keeps Google Search Grounding available on the Gemini API free tier
// and is sufficient here because downstream validation/relevance/risk remain authoritative.
const MODEL = process.env.WEEKLY_NEWS_RESEARCH_MODEL?.trim() || "gemini-2.5-flash";
const TIMEOUT_MS = Number.parseInt(process.env.WEEKLY_NEWS_RESEARCH_TIMEOUT_MS || "90000", 10);
const BATCH_SIZE = Math.max(1, Number.parseInt(process.env.WEEKLY_NEWS_RESEARCH_BATCH_SIZE || "4", 10) || 4);
const RETRIES = Math.max(0, Number.parseInt(process.env.WEEKLY_NEWS_RESEARCH_RETRIES || "1", 10) || 0);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunkSources(sources: SourceDefinition[], size: number): SourceDefinition[][] {
  const chunks: SourceDefinition[][] = [];
  for (let i = 0; i < sources.length; i += size) chunks.push(sources.slice(i, i + size));
  return chunks;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function callGeminiGroundedResearch(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");

  const response = await fetchWithTimeout(
    `${API_BASE}/models/${encodeURIComponent(MODEL)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        tools: [{ googleSearch: {} }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4500,
        },
      }),
    },
    Number.isFinite(TIMEOUT_MS) ? TIMEOUT_MS : 90000,
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Gemini weekly research failed (${response.status}): ${detail.slice(0, 500)}`);
  }

  const json = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
  };

  const text = json.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim();

  if (!text) {
    throw new Error(`Gemini weekly research returned no text (finishReason=${json.candidates?.[0]?.finishReason || "unknown"})`);
  }
  return text;
}

async function researchBatch(prompt: string, label: string): Promise<WeeklyResearchCandidate[]> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      console.log(`Research ${label}: attempt ${attempt + 1}/${RETRIES + 1}`);
      const raw = await callGeminiGroundedResearch(prompt);
      return parseWeeklyResearchResponse(raw);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Research ${label} failed on attempt ${attempt + 1}: ${message}`);
      if (attempt < RETRIES) await sleep(1500 * (attempt + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function notifyModerators(args: {
  title: string;
  body: string;
  dedupeKey: string;
}): Promise<void> {
  try {
    const admin = getExternalAdmin();
    if (!admin) return;
    const { data } = await admin.from("profiles").select("id").in("role", ["admin", "moderator"]);
    const ids = ((data as Array<{ id: string }> | null) || []).map((row) => row.id);
    for (const userId of ids) {
      await admin.rpc("create_notification", {
        p_user_id: userId,
        p_type: "system",
        p_title: args.title.slice(0, 200),
        p_body: args.body.slice(0, 500),
        p_target_type: "admin_external_candidate",
        p_target_id: null,
        p_target_url: "/admin/monitor/import",
        p_dedupe_key: args.dedupeKey,
        p_metadata: {},
      });
    }
  } catch (error) {
    console.warn("Weekly news notification failed:", error instanceof Error ? error.message : String(error));
  }
}

function appendStepSummary(lines: string[]): void {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file) return;
  fs.appendFileSync(file, `${lines.join("\n")}\n`, "utf8");
}

async function main(): Promise<void> {
  const runDate = new Date().toISOString().slice(0, 10);
  const sources = getEnabledSources();
  const batches = chunkSources(sources, BATCH_SIZE);

  console.log(
    `Weekly Gemini research: model=${MODEL}, registeredSources=${sources.length}, batches=${batches.length}, batchSize=${BATCH_SIZE}, runDate=${runDate}`,
  );

  try {
    const allCandidates: WeeklyResearchCandidate[] = [];
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const label = `batch ${i + 1}/${batches.length}`;
      const prompt = buildWeeklyResearchPrompt(batch, runDate);
      const found = await researchBatch(prompt, label);
      console.log(`${label}: ${found.length} candidate(s)`);
      allCandidates.push(...found);
      if (i < batches.length - 1) await sleep(500);
    }

    // 同一Run内の重複を先に落とす。最終的なcanonical URL/evidence dedupeは既存backendが権威。
    const unique = new Map<string, WeeklyResearchCandidate>();
    for (const candidate of allCandidates) {
      const key = `${candidate.sourceUrl}|${candidate.sourcePublishedAt}|${candidate.sourceUpdatedAt || ""}`;
      if (!unique.has(key)) unique.set(key, candidate);
    }
    const candidates = [...unique.values()];

    let inserted = 0;
    let duplicates = 0;
    const rejected: Array<{ title: string; reason: string }> = [];

    for (const candidate of candidates) {
      const result = await submitExternalCandidate(candidateToSubmitInput(candidate));
      if (!result.ok || !result.id) {
        rejected.push({
          title: candidate.sourceTitle,
          reason: `${result.errorCode || "unknown"}: ${result.error || "submission failed"}`,
        });
        console.warn(`Rejected research candidate: ${candidate.sourceTitle}: ${result.errorCode} ${result.error}`);
        continue;
      }
      if (result.deduplicated) {
        duplicates += 1;
        console.log(`Duplicate candidate skipped: ${candidate.sourceTitle}`);
      } else {
        inserted += 1;
        console.log(`Queued new candidate: ${candidate.sourceTitle} (${result.id})`);
      }
    }

    appendStepSummary([
      "## WHV Weekly News - Gemini Research",
      `- Model: ${MODEL}`,
      `- Source batches: ${batches.length}`,
      `- Gemini candidates before in-run dedupe: ${allCandidates.length}`,
      `- Gemini candidates after in-run dedupe: ${candidates.length}`,
      `- New candidates queued: ${inserted}`,
      `- Exact duplicates: ${duplicates}`,
      `- Rejected by backend validation: ${rejected.length}`,
    ]);

    if (inserted > 0) {
      await notifyModerators({
        title: "Gemini週次ニュース候補を追加しました",
        body: `${inserted}件の新しい公式ニュース候補を候補Inboxへ追加しました。既存Pipelineで順次処理します。`,
        dedupeKey: `gemini_weekly_research:${runDate}:new`,
      });
    }

    if (candidates.length > 0 && inserted === 0 && duplicates === 0 && rejected.length > 0) {
      throw new Error(`All ${rejected.length} Gemini candidates were rejected by backend validation`);
    }

    // 初回 E2E 検証用。main push で起動したときだけ、候補 0 件でも成功を確認できる通知を残す。
    // E2E 成功確認後に、このブロックと一時 push trigger は削除する。
    if (process.env.GITHUB_EVENT_NAME === "push") {
      await notifyModerators({
        title: "Gemini週次ニュースE2Eテスト成功",
        body: `Research正常終了: batches=${batches.length}, candidates=${candidates.length}, new=${inserted}, duplicate=${duplicates}, rejected=${rejected.length}`,
        dedupeKey: `gemini_weekly_e2e:${runDate}:${process.env.GITHUB_RUN_ID || "unknown"}`,
      });
    }

    console.log(`Weekly research completed: ${inserted} new, ${duplicates} duplicate, ${rejected.length} rejected.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await notifyModerators({
      title: "Gemini週次ニュース調査に失敗しました",
      body: message,
      dedupeKey: `gemini_weekly_research:${runDate}:error`,
    });
    appendStepSummary(["## WHV Weekly News - Gemini Research", `- Status: FAILED`, `- Error: ${message}`]);
    throw error;
  }
}

await main();
