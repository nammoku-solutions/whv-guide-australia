import type { RouteType, RiskLevel } from "../types";

/**
 * AI 品質評価用の再現可能なデータセット。
 *
 * 目的: 生成文言そのものではなく「ルーティング・スコープ・ツール推薦・リスク判定」を
 * テストする（決定的で外部API不要）。retrieval/generation の実測は本番の
 * 診断パネル・フィードバックで継続的に評価する。
 *
 * relevantSlugs はドキュメント用のヒント（将来の retrieval 評価で使用）。
 * ここに存在しない事実を発明しないこと。
 */
export type EvalCase = {
  question: string;
  expectedRoute: RouteType;
  /** ツール推薦で期待するツール slug（あれば）。 */
  expectedToolSlug?: string;
  /** サイト内で回答可能と想定されるか（in-scope）。 */
  supported: boolean;
  risk: RiskLevel;
  /** 参考: 関連しそうな記事カテゴリ/slug（retrieval 評価用ヒント）。 */
  relevantHints?: string[];
  /** 期待する構造化ケイパビリティ（ルーティング検証用、あれば）。 */
  expectedCapability?: string;
  /** 認証必須のケイパビリティか（未ログイン拒否テスト用）。 */
  requiresAuth?: boolean;
  /** 期待する掲載サブ意図（job/housing/vehicle）。 */
  expectedListingIntent?: "job" | "housing" | "vehicle" | "marketplace" | "unknown";
  /** 期待する本人データ意図。 */
  expectedPersonalIntent?: "applications" | "saved" | "notifications" | "eighty_eight";
};

export const evalCases: EvalCase[] = [
  // --- ビザ / 88日（high risk）---
  { question: "Bondって何？", expectedRoute: "ARTICLE", supported: true, risk: "medium", relevantHints: ["housing"] },
  { question: "セカンドビザの条件は？", expectedRoute: "ARTICLE", supported: true, risk: "high", relevantHints: ["second-visa"] },
  { question: "Specified Workってなに？", expectedRoute: "ARTICLE", supported: true, risk: "high", relevantHints: ["second-visa"] },
  { question: "あと何日働けば88日になる？", expectedRoute: "MIXED", expectedToolSlug: "tool-88-day-calculator", supported: true, risk: "high", relevantHints: ["88-day-calculation"] },
  { question: "88日を計算したい", expectedRoute: "MIXED", expectedToolSlug: "tool-88-day-calculator", supported: true, risk: "high" },
  { question: "ワーホリビザの申請方法", expectedRoute: "ARTICLE", supported: true, risk: "high", relevantHints: ["visa"] },
  { question: "417ビザと462ビザの違いは？", expectedRoute: "ARTICLE", supported: true, risk: "high", relevantHints: ["visa"] },
  { question: "この郵便番号は対象地域？", expectedRoute: "MIXED", expectedToolSlug: "tool-specified-work-region-checker", supported: true, risk: "low" },

  // --- ファーム ---
  { question: "ファームの収穫シーズンはいつ？", expectedRoute: "MIXED", expectedToolSlug: "tool-farm-season-calendar", supported: true, risk: "medium", relevantHints: ["farm"] },
  { question: "ファームジョブの探し方", expectedRoute: "ARTICLE", supported: true, risk: "medium", relevantHints: ["farm"] },
  { question: "Payslipは証拠として必要？", expectedRoute: "ARTICLE", supported: true, risk: "high", relevantHints: ["farm", "second-visa"] },

  // --- 仕事 / レジュメ ---
  { question: "仕事の探し方を教えて", expectedRoute: "ARTICLE", supported: true, risk: "medium", relevantHints: ["jobs"] },
  { question: "英文レジュメの書き方", expectedRoute: "MIXED", expectedToolSlug: "tool-resume-checklist", supported: true, risk: "low" },
  { question: "カバーレターのテンプレートある？", expectedRoute: "ARTICLE", supported: true, risk: "low" },
  { question: "Uber Eatsの始め方", expectedRoute: "ARTICLE", supported: true, risk: "medium", relevantHints: ["uber-eats"] },

  // --- 税 / 番号（high）---
  { question: "TFNってなに？", expectedRoute: "ARTICLE", supported: true, risk: "high", relevantHints: ["tfn"] },
  { question: "ABNの取り方", expectedRoute: "ARTICLE", supported: true, risk: "high", relevantHints: ["abn"] },
  { question: "タックスリターンのやり方", expectedRoute: "ARTICLE", supported: true, risk: "high", relevantHints: ["tax-return"] },
  { question: "Superは帰国時に返ってくる？DASP", expectedRoute: "ARTICLE", supported: true, risk: "high", relevantHints: ["super"] },

  // --- 住居 ---
  { question: "シェアハウスの探し方", expectedRoute: "ARTICLE", supported: true, risk: "low", relevantHints: ["housing"] },
  { question: "内見で確認すべきことは？", expectedRoute: "ARTICLE", supported: true, risk: "low", relevantHints: ["housing"] },

  // --- 車 / 免許 ---
  { question: "オーストラリアで車を買うには？", expectedRoute: "ARTICLE", supported: true, risk: "low", relevantHints: ["cars"] },
  { question: "Regoって何？", expectedRoute: "ARTICLE", supported: true, risk: "low", relevantHints: ["cars"] },
  { question: "日本の運転免許は使える？", expectedRoute: "ARTICLE", supported: true, risk: "medium", relevantHints: ["license"] },

  // --- お金 / 生活費 ---
  { question: "生活費はいくら必要？", expectedRoute: "MIXED", expectedToolSlug: "tool-weekly-budget-calculator", supported: true, risk: "medium" },
  { question: "銀行口座の開き方", expectedRoute: "ARTICLE", supported: true, risk: "medium", relevantHints: ["bank"] },
  { question: "日本への送金方法", expectedRoute: "ARTICLE", supported: true, risk: "medium", relevantHints: ["money"] },

  // --- 英語 / 準備 / エリア / 旅行 / 健康 ---
  { question: "仕事で使える英語フレーズ", expectedRoute: "ARTICLE", supported: true, risk: "low", relevantHints: ["english"] },
  { question: "渡航前の準備リスト", expectedRoute: "ARTICLE", supported: true, risk: "low", relevantHints: ["preparation"] },
  { question: "ケアンズはどんな街？", expectedRoute: "ARTICLE", supported: true, risk: "low", relevantHints: ["area"] },
  { question: "Medicareは使える？病院のかかり方", expectedRoute: "ARTICLE", supported: true, risk: "high", relevantHints: ["health"] },
  { question: "帰国前にやることは？", expectedRoute: "ARTICLE", supported: true, risk: "low", relevantHints: ["return-home"] },

  // --- ツール直接 ---
  { question: "持ち物チェックリストある？", expectedRoute: "ARTICLE", supported: true, risk: "low" },
  { question: "到着後にやることリスト", expectedRoute: "ARTICLE", supported: true, risk: "low" },

  // --- スコープ外（unsupported）---
  { question: "今日の日本株どう？", expectedRoute: "OUT_OF_SCOPE", supported: false, risk: "low" },
  { question: "Pythonのバグを直して", expectedRoute: "OUT_OF_SCOPE", supported: false, risk: "low" },
  { question: "おすすめのアニメ映画は？", expectedRoute: "OUT_OF_SCOPE", supported: false, risk: "low" },
  { question: "ビットコインの価格予想して", expectedRoute: "OUT_OF_SCOPE", supported: false, risk: "low" },

  // --- LISTING（ライブ掲載検索）---
  { question: "Gattonで求人ある？", expectedRoute: "LISTING", supported: true, risk: "low", expectedCapability: "searchActiveJobs", expectedListingIntent: "job" },
  { question: "Cairnsで仕事ある？", expectedRoute: "LISTING", supported: true, risk: "low", expectedCapability: "searchActiveJobs", expectedListingIntent: "job" },
  { question: "Brisbaneで週250ドル以下の部屋ある？", expectedRoute: "LISTING", supported: true, risk: "low", expectedCapability: "searchActiveHousing", expectedListingIntent: "housing" },
  { question: "QLDで6000ドル以下の車ある？", expectedRoute: "LISTING", supported: true, risk: "low", expectedCapability: "searchActiveVehicles", expectedListingIntent: "vehicle" },
  { question: "オートマの車が売ってるか見たい", expectedRoute: "LISTING", supported: true, risk: "low", expectedCapability: "searchActiveVehicles", expectedListingIntent: "vehicle" },

  // --- PERSONAL（認証必須）---
  { question: "応募してる仕事どうなってる？", expectedRoute: "PERSONAL", supported: true, risk: "low", requiresAuth: true, expectedCapability: "getMyApplications", expectedPersonalIntent: "applications" },
  { question: "保存してる求人見せて", expectedRoute: "PERSONAL", supported: true, risk: "low", requiresAuth: true, expectedCapability: "getMySavedItems", expectedPersonalIntent: "saved" },
  { question: "何か新しいお知らせある？", expectedRoute: "PERSONAL", supported: true, risk: "low", requiresAuth: true, expectedCapability: "getMyNotifications", expectedPersonalIntent: "notifications" },

  // --- CURRENT_UPDATE（直近の公式アップデート）---
  { question: "最近ビザで何か変わった？", expectedRoute: "CURRENT_UPDATE", supported: true, risk: "high", expectedCapability: "getCurrentOfficialUpdates" },
  { question: "最近417で変更あった？", expectedRoute: "CURRENT_UPDATE", supported: true, risk: "high", expectedCapability: "getCurrentOfficialUpdates" },
  { question: "税金の最新の変更点は？", expectedRoute: "CURRENT_UPDATE", supported: true, risk: "high", expectedCapability: "getCurrentOfficialUpdates" },

  // --- TOOL（ナビゲーション）---
  { question: "88日カレンダーどこ？", expectedRoute: "TOOL", expectedToolSlug: "tool-88-day-calculator", supported: true, risk: "low" },
  { question: "予算シミュレーターのページある？", expectedRoute: "TOOL", expectedToolSlug: "tool-weekly-budget-calculator", supported: true, risk: "low" },

  // --- MIXED（記事＋掲載/ツール）---
  { question: "Gattonの求人とファーム探しの注意点", expectedRoute: "MIXED", supported: true, risk: "medium", expectedListingIntent: "job", relevantHints: ["farm", "jobs"] },
  { question: "この求人ならセカンドビザ取れる？", expectedRoute: "MIXED", supported: true, risk: "high", expectedListingIntent: "job", relevantHints: ["second-visa"] },
];
