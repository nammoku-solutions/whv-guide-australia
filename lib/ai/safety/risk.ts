import type { ArticleCategory } from "@/types/article";
import type { RiskLevel } from "../types";

/**
 * カテゴリベースのリスク分類。ビザ・移民・税・雇用法・医療などは high。
 * 高リスクchunkには注意表示を添え、公式ソース確認を促す（サイトAIは権威的な
 * 政府/法律/医療アドバイスではない）。
 */
const HIGH_RISK: ArticleCategory[] = [
  "visa",
  "second-visa",
  "tfn",
  "abn",
  "super",
  "tax-return",
  "health",
];

const MEDIUM_RISK: ArticleCategory[] = [
  "jobs",
  "farm",
  "license",
  "bank",
  "money",
  "gig-work",
  "uber-eats",
  "doordash",
];

export function categoryRisk(category: string): RiskLevel {
  if (HIGH_RISK.includes(category as ArticleCategory)) return "high";
  if (MEDIUM_RISK.includes(category as ArticleCategory)) return "medium";
  return "low";
}

/** 複数chunkから最も高いリスクを返す。 */
export function maxRisk(levels: RiskLevel[]): RiskLevel {
  if (levels.includes("high")) return "high";
  if (levels.includes("medium")) return "medium";
  return "low";
}

const RISK_NOTICE: Record<RiskLevel, string | null> = {
  high: "※ ビザ・税・健康などの重要事項は制度変更が起こり得ます。最終的には各公式ソースで最新情報を必ずご確認ください。当サイトのAIは政府・法律・医療の公式見解ではありません。",
  medium: null,
  low: null,
};

export function riskNotice(level: RiskLevel): string | null {
  return RISK_NOTICE[level];
}
