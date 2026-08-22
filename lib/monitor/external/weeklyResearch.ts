import { z } from "zod";
import type { SourceDefinition } from "../types";
import type { SubmitExternalInput } from "./types";

const evidenceSchema = z.object({
  summary: z.string().min(20).max(4000),
  facts: z.array(z.string().min(1).max(600)).max(40).default([]),
  numbers: z
    .array(
      z.object({
        value: z.string().min(1).max(120),
        context: z.string().max(400).default(""),
      }),
    )
    .max(40)
    .default([]),
  dates: z
    .array(
      z.object({
        value: z.string().min(1).max(60),
        context: z.string().max(400).default(""),
      }),
    )
    .max(40)
    .default([]),
});

export const weeklyResearchCandidateSchema = z.object({
  sourceUrl: z.string().url().max(2000),
  sourceTitle: z.string().min(1).max(400),
  sourceOrganisation: z.string().min(1).max(200),
  sourcePublishedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sourceUpdatedAt: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()]).default(null),
  evidence: evidenceSchema,
  categoryHint: z.enum(["visa", "tax", "cost", "site", "other"]).default("other"),
});

const weeklyResearchResponseSchema = z.object({
  candidates: z.array(weeklyResearchCandidateSchema).max(20),
});

export type WeeklyResearchCandidate = z.infer<typeof weeklyResearchCandidateSchema>;

/**
 * Gemini の出力を JSON として取り出す。Markdown fence が付いても受理するが、
 * 最終的な各候補は Zod で厳密に検証する。
 */
export function parseWeeklyResearchResponse(raw: string): WeeklyResearchCandidate[] {
  if (!raw.trim()) throw new Error("Gemini returned an empty research response");

  let text = raw.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();

  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first < 0 || last < first) throw new Error("Gemini research response did not contain a JSON object");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(first, last + 1));
  } catch (error) {
    throw new Error(`Gemini research JSON parse failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const checked = weeklyResearchResponseSchema.safeParse(parsed);
  if (!checked.success) {
    const issue = checked.error.issues[0];
    throw new Error(`Gemini research schema validation failed: ${issue?.path.join(".") || "root"}: ${issue?.message || "invalid output"}`);
  }
  return checked.data.candidates;
}

export function candidateToSubmitInput(candidate: WeeklyResearchCandidate): SubmitExternalInput {
  return {
    sourceUrl: candidate.sourceUrl,
    sourceTitle: candidate.sourceTitle,
    sourceOrganisation: candidate.sourceOrganisation,
    sourcePublishedAt: candidate.sourcePublishedAt,
    sourceUpdatedAt: candidate.sourceUpdatedAt,
    evidence: candidate.evidence,
    categoryHint: candidate.categoryHint,
    evidenceOrigin: "external_research",
    origin: "gemini_weekly",
    submittedBy: null,
  };
}

/**
 * Research prompt はコード内の officialSources レジストリから生成する。
 * これにより、プロンプトと実際の allow-list が時間とともに乖離しにくい。
 */
export function buildWeeklyResearchPrompt(
  sources: SourceDefinition[],
  runDateIso: string,
): string {
  const sourceList = sources
    .filter((s) => s.enabled)
    .map((s) => `- ${s.organisation} | ${s.sourceName} | ${s.url}`)
    .join("\n");

  return `You are the weekly official-news research stage for a Japanese Australia Working Holiday information site.

Run date: ${runDateIso}
Research window: inspect at least the previous 14 days, including corrections or material updates published late.
Audience: Japanese Working Holiday visa (subclass 417) holders and applicants.

Use Google Search to find genuinely new or materially updated official Australian government information that matters to this audience.

AUTHORITATIVE SOURCE BOUNDARY
The WHV Compass backend has an allow-list derived from the following official source registry. Search may discover a different page on the SAME registered government domain when that page contains the actual dated announcement, but do not return any source outside a government domain represented by this registry.

${sourceList}

SOURCE RULES
- Use Australian government primary sources only.
- Never use blogs, Reddit, social media, commercial news, migration-agent pages, aggregators, or third-party summaries as evidence.
- Prefer the actual dated official announcement or official page that explicitly shows the change.
- Include an item only when the official source itself supports an exact source URL, official title, and an explicit publication date.
- If an explicit updated date exists, include it. Never infer a date from search snippets, crawl dates, or URL patterns.
- Do not invent or infer fees, rates, thresholds, eligibility, visa rules, legal conclusions, dates, or amounts.
- Exclude generic government news that does not materially help Working Holiday users.
- A previously known page may be returned if the official source was materially updated in this research window; backend dedupe is authoritative.

OUTPUT
Return exactly one JSON object and no prose. Shape:
{
  "candidates": [
    {
      "sourceUrl": "https://official.gov.au/...",
      "sourceTitle": "Exact official page title",
      "sourceOrganisation": "Official organisation",
      "sourcePublishedAt": "YYYY-MM-DD",
      "sourceUpdatedAt": "YYYY-MM-DD or null",
      "evidence": {
        "summary": "Concise factual summary supported only by the official source",
        "facts": ["Verified fact"],
        "numbers": [{"value": "15%", "context": "What the number means"}],
        "dates": [{"value": "2026-07-01", "context": "What the date means"}]
      },
      "categoryHint": "visa|tax|cost|site|other"
    }
  ]
}

Return {"candidates":[]} when there is no qualifying update.
Do not create Japanese article copy, do not publish anything, and do not access private user data.`;
}
