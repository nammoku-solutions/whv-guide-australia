import type { Evidence, EvidenceChunk, RiskLevel, RouteType } from "../types";

/**
 * Runtime generation boundary.
 *
 * WHV Compass currently has no external model API configured. Keeping this
 * module as the single generation boundary lets a future provider be added
 * deliberately without leaving dormant provider-specific network code in the
 * application today.
 */

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

export async function generateAnswer(_args: GenerateArgs): Promise<GenerateResult> {
  throw new Error(
    "Runtime AI generation is disabled. Configure and implement an approved external provider before enabling it.",
  );
}
