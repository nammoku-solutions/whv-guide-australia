/**
 * 公開ポリシー判定（決定的）。ここで AI に「公開してよいか」を尋ねない。
 *
 * 自動公開（low/medium リスク）は、以下すべてを満たすときのみ:
 *   - ソースが allow-list の公式（呼び出し側が保証）かつ自動公開適格
 *   - 意味のある変更が確認済み（呼び出し側が hash 差分で確認）
 *   - 関連度が highly_relevant / relevant
 *   - 信頼度がしきい値以上
 *   - grounding チェック合格
 *   - ソース URL が有効
 *   - 重複でない（呼び出し側で確認）
 * 高リスクトピックは常に review_required（既定）。高リスク既存記事は自動書換えしない。
 */

import { monitorConfig } from "./config";
import type {
  SourceDefinition,
  Relevance,
  RiskLevel,
} from "./types";

export type PublishDecision = {
  /** "auto" = 即公開, "review" = レビュー要求。 */
  mode: "auto" | "review";
  status: "published" | "review_required";
  reasons: string[];
};

function isValidHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export function decidePublication(input: {
  source: SourceDefinition;
  riskLevel: RiskLevel;
  relevance: Relevance;
  confidence: number;
  groundingOk: boolean;
  meaningfulChange: boolean;
  isDuplicate: boolean;
  sourceUrl: string;
}): PublishDecision {
  const reasons: string[] = [];

  const highRelevance =
    input.relevance === "highly_relevant" || input.relevance === "relevant";

  // 高リスクは常にレビュー（フラグで明示的に許可された場合を除く）。
  const highRiskBlocked =
    input.riskLevel === "high" && !monitorConfig.autoPublishHighRisk;

  const eligible =
    monitorConfig.autoPublishLowRisk &&
    input.source.autoPublishEligibility &&
    !highRiskBlocked &&
    input.meaningfulChange &&
    highRelevance &&
    input.confidence >= monitorConfig.minAutoPublishConfidence &&
    input.groundingOk &&
    !input.isDuplicate &&
    isValidHttpUrl(input.sourceUrl);

  if (!monitorConfig.autoPublishLowRisk) reasons.push("自動公開フラグが無効");
  if (!input.source.autoPublishEligibility) reasons.push("ソースが自動公開非適格");
  if (highRiskBlocked) reasons.push("高リスクトピック（レビュー必須）");
  if (!input.meaningfulChange) reasons.push("意味のある変更が未確認");
  if (!highRelevance) reasons.push(`関連度が不足(${input.relevance})`);
  if (input.confidence < monitorConfig.minAutoPublishConfidence)
    reasons.push(`信頼度が不足(${input.confidence.toFixed(2)})`);
  if (!input.groundingOk) reasons.push("grounding チェック不合格");
  if (input.isDuplicate) reasons.push("重複");
  if (!isValidHttpUrl(input.sourceUrl)) reasons.push("ソース URL が無効");

  if (eligible) {
    return { mode: "auto", status: "published", reasons: ["自動公開の全条件を満たす"] };
  }
  return { mode: "review", status: "review_required", reasons };
}
