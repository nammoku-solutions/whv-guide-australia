import { tools as toolRegistry } from "@/lib/tools/registry";
import type { ToolRecommendation } from "../types";

/**
 * AI が推薦できるサイト内ツールのキーワード辞書。
 *
 * 重要: URL/名前は「実在するツールレジストリ（lib/tools/registry.ts）」から解決する。
 * ここではツール slug とマッチング用キーワードのみを定義し、ルートを一切発明しない。
 * レジストリに存在しない slug は自動的に無視される。
 */
const TOOL_KEYWORDS: Record<string, string[]> = {
  "tool-88-day-calculator": [
    "88日",
    "88 day",
    "セカンドビザ",
    "サードビザ",
    "specified work",
    "指定業務",
    "勤務日",
    "何日",
    "カウント",
    "日数",
  ],
  "tool-specified-work-region-checker": [
    "郵便番号",
    "postcode",
    "対象地域",
    "regional",
    "地域",
    "ポストコード",
    "指定地域",
  ],
  "tool-farm-season-calendar": [
    "ファーム",
    "farm",
    "収穫",
    "シーズン",
    "harvest",
    "作物",
    "繁忙期",
  ],
  "tool-weekly-budget-calculator": [
    "生活費",
    "予算",
    "貯金",
    "budget",
    "費用",
    "シミュレーション",
    "いくら必要",
    "コスト",
  ],
  "tool-resume-checklist": [
    "レジュメ",
    "resume",
    "履歴書",
    "職務経歴",
    "自己チェック",
  ],
  "tool-job-application-tracker": [
    "応募",
    "求人管理",
    "応募管理",
    "job application",
    "面接管理",
  ],
  "tool-farm-evidence-tracker": [
    "証拠書類",
    "payslip",
    "給与明細",
    "エビデンス",
    "evidence",
    "証明",
  ],
  "tool-packing-checklist": ["持ち物", "パッキング", "packing", "荷造り"],
  "tool-arrival-checklist": ["到着後", "到着", "arrival", "やることリスト"],
  "tool-return-home-checklist": ["帰国", "return home", "帰国準備"],
  "download-resume-template": [
    "レジュメテンプレート",
    "履歴書テンプレート",
    "resume template",
  ],
  "download-cover-letter-template": [
    "カバーレター",
    "cover letter",
    "志望動機",
  ],
  "download-housing-inspection-checklist": [
    "内見",
    "inspection",
    "家探しチェック",
    "シェアハウス確認",
  ],
  "download-emergency-card": ["緊急連絡先", "emergency", "緊急カード"],
};

function toRecommendation(slug: string): ToolRecommendation | null {
  const meta = toolRegistry.find(
    (t) => t.slug === slug && t.status === "published",
  );
  if (!meta) return null;
  return {
    id: meta.slug,
    name: meta.navLabel ?? meta.title,
    url: meta.path,
    description: meta.description,
  };
}

/**
 * 質問文と検索されたカテゴリから、関連するサイト内ツールを推薦する。
 * モデルにURLを生成させず、必ず信頼済みレジストリのメタデータから生成する。
 */
export function recommendTools(
  question: string,
  categories: string[] = [],
  max = 2,
): ToolRecommendation[] {
  const haystack = question.toLowerCase();
  const scored: { slug: string; score: number }[] = [];

  for (const [slug, keywords] of Object.entries(TOOL_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (haystack.includes(kw.toLowerCase())) score += 2;
    }
    // 検索で当たった記事の関連ツールも軽く加点する。
    const meta = toolRegistry.find((t) => t.slug === slug);
    if (meta?.relatedArticleSlugs?.some((s) => categories.includes(s))) {
      score += 1;
    }
    if (score > 0) scored.push({ slug, score });
  }

  scored.sort((a, b) => b.score - a.score);
  const out: ToolRecommendation[] = [];
  for (const { slug } of scored) {
    const rec = toRecommendation(slug);
    if (rec) out.push(rec);
    if (out.length >= max) break;
  }
  return out;
}
