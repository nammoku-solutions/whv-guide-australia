import test from "node:test";
import assert from "node:assert/strict";

import {
  buildWeeklyResearchPrompt,
  candidateToSubmitInput,
  parseWeeklyResearchResponse,
} from "../lib/monitor/external/weeklyResearch";
import { getEnabledSources } from "../lib/monitor/registry";

const VALID = {
  candidates: [
    {
      sourceUrl: "https://www.ato.gov.au/tax-rates-and-codes/tax-rates-working-holiday-makers",
      sourceTitle: "Tax rates – working holiday makers",
      sourceOrganisation: "Australian Taxation Office",
      sourcePublishedAt: "2026-08-20",
      sourceUpdatedAt: null,
      evidence: {
        summary: "The official ATO working holiday maker tax-rate page was materially updated.",
        facts: ["The page contains working holiday maker tax-rate information."],
        numbers: [],
        dates: [{ value: "2026-08-20", context: "Official publication date" }],
      },
      categoryHint: "tax",
    },
  ],
};

test("weekly research parser accepts valid JSON", () => {
  const parsed = parseWeeklyResearchResponse(JSON.stringify(VALID));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].categoryHint, "tax");
});

test("weekly research parser tolerates markdown JSON fence", () => {
  const parsed = parseWeeklyResearchResponse(`\`\`\`json\n${JSON.stringify(VALID)}\n\`\`\``);
  assert.equal(parsed[0].sourceOrganisation, "Australian Taxation Office");
});

test("weekly research parser rejects inferred/non-ISO date shape", () => {
  const bad = structuredClone(VALID);
  bad.candidates[0].sourcePublishedAt = "20 August 2026";
  assert.throws(() => parseWeeklyResearchResponse(JSON.stringify(bad)), /schema validation failed/);
});

test("candidate conversion forces Gemini provenance", () => {
  const parsed = parseWeeklyResearchResponse(JSON.stringify(VALID));
  const input = candidateToSubmitInput(parsed[0]);
  assert.equal(input.origin, "gemini_weekly");
  assert.equal(input.evidenceOrigin, "external_research");
});

test("prompt is generated from the live official source registry", () => {
  const prompt = buildWeeklyResearchPrompt(getEnabledSources(), "2026-08-22");
  assert.match(prompt, /Department of Home Affairs/);
  assert.match(prompt, /Australian Taxation Office/);
  assert.match(prompt, /Fair Work Ombudsman/);
  assert.match(prompt, /2026-08-22/);
});
