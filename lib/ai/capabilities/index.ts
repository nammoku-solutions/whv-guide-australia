/**
 * 構造化ケイパビリティのバレル＋レジストリ。
 *
 * すべて「事前定義された型付きケイパビリティ」であり、任意SQLツールは存在しない。
 * 認証必須のものは requiresAuth=true。pipeline はルート種別からケイパビリティを選ぶ。
 */

export { searchActiveJobs, searchActiveHousing, searchActiveVehicles } from "./listings";
export {
  getMyApplications,
  getMySavedItems,
  getMyNotifications,
  getMy88DayProgress,
} from "./personal";
export { getCurrentOfficialUpdates } from "./updates";
export { findRelevantSiteTools } from "./tools";
export type { CapabilityResult } from "./types";
export type { CapabilityContext } from "./context";

export type CapabilityMeta = {
  name: string;
  requiresAuth: boolean;
  dataSource: "listings" | "personal" | "news+monitor" | "tool-registry";
  description: string;
};

/** 監査・ドキュメント用の宣言的レジストリ（実行はしない）。 */
export const CAPABILITY_REGISTRY: CapabilityMeta[] = [
  {
    name: "searchActiveJobs",
    requiresAuth: false,
    dataSource: "listings",
    description: "現在有効・非期限切れ・非モデレートの求人/ファーム求人を型付きフィルタで検索。",
  },
  {
    name: "searchActiveHousing",
    requiresAuth: false,
    dataSource: "listings",
    description: "住居/シェアメイトを location/rent/roomType 等の型付きフィルタで検索。",
  },
  {
    name: "searchActiveVehicles",
    requiresAuth: false,
    dataSource: "listings",
    description: "車両を state/price/make/transmission 等の型付きフィルタで検索。",
  },
  {
    name: "getMyApplications",
    requiresAuth: true,
    dataSource: "personal",
    description: "本人の応募の集計と直近数件（employer 内部メモは非送信）。",
  },
  {
    name: "getMySavedItems",
    requiresAuth: true,
    dataSource: "personal",
    description: "本人の保存アイテム（記事/ニュース/ツール/掲載）。終了掲載はラベル付け。",
  },
  {
    name: "getMyNotifications",
    requiresAuth: true,
    dataSource: "personal",
    description: "本人のアプリ内通知（最小フィールド）。",
  },
  {
    name: "getMy88DayProgress",
    requiresAuth: true,
    dataSource: "personal",
    description: "88日進捗（現状サーバー同期なし＝取得不可の明示＋ツール誘導）。",
  },
  {
    name: "getCurrentOfficialUpdates",
    requiresAuth: false,
    dataSource: "news+monitor",
    description: "公開検証済みニュース＋公式ソース監視状態による直近アップデート。",
  },
  {
    name: "findRelevantSiteTools",
    requiresAuth: false,
    dataSource: "tool-registry",
    description: "信頼済みツールレジストリからの関連ツール推薦（URL発明なし）。",
  },
];
