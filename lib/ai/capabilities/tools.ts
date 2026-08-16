/**
 * サイト内ツール推薦ケイパビリティ。
 * 既存の recommendTools（信頼済みレジストリ由来・URL発明なし）を再利用し、
 * ツールカード＋エビデンス＋信頼済みアクションに整形する。
 */

import { recommendTools } from "../recommendations/tools";
import type { Evidence, StructuredCard, ToolRecommendation, TrustedAction } from "../types";
import type { CapabilityResult } from "./types";

function toToolCard(t: ToolRecommendation): StructuredCard {
  return {
    kind: "tool",
    id: t.id,
    title: t.name,
    description: t.description,
    url: t.url,
  };
}

function toToolEvidence(t: ToolRecommendation): Evidence {
  return {
    kind: "tool",
    visibility: "public",
    title: t.name,
    content: `サイト内ツール: ${t.name} — ${t.description}`,
    url: t.url,
    sourceId: `tool:${t.id}`,
    freshness: null,
    riskLevel: "low",
  };
}

export function findRelevantSiteTools(
  question: string,
  categories: string[] = [],
  max = 3,
): CapabilityResult {
  const recs = recommendTools(question, categories, max);
  const actions: TrustedAction[] = recs.map((t) => ({
    id: `action-tool-${t.id}`,
    label: t.name,
    url: t.url,
    intent: "tool",
  }));
  return {
    name: "findRelevantSiteTools",
    evidence: recs.map(toToolEvidence),
    cards: recs.map(toToolCard),
    actions,
    count: recs.length,
  };
}
