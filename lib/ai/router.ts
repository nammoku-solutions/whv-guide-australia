import { aiConfig } from "./config";
import type { RouteType } from "./types";
import { scopeSignal } from "./safety/scope";

/**
 * 軽量なクエリルーター（V1: 決定的ロジック）。
 *
 * 純粋なモデル呼び出しに頼らず、キーワードで質問種別を推定する。将来は
 * モデルベース分類器へ差し替え可能（この関数の戻り値の型を保てば呼び出し側は不変）。
 *
 * 種別:
 *   ARTICLE      記事で答える一般的な質問
 *   TOOL         サイト内ツールが役立つ（多くは ARTICLE との MIXED）
 *   LISTING      ライブ掲載検索（マーケット有効時のみ）
 *   MIXED        記事＋ツール、または記事＋掲載
 *   OUT_OF_SCOPE サイト外
 */

const TOOL_HINTS = [
  "計算", "何日", "88日", "シミュレーション", "予算", "郵便番号", "postcode",
  "チェックリスト", "テンプレート", "カレンダー", "トラッカー", "管理表",
];

const LISTING_HINTS = [
  "求人ある", "募集", "空き部屋", "空いてる", "掲載", "売ってる", "売ります",
  "explore listings", "vacancy", "今ある",
];

export type RouteDecision = {
  route: RouteType;
  wantsTool: boolean;
  wantsListing: boolean;
};

export function routeQuestion(question: string): RouteDecision {
  const q = question.toLowerCase();
  const { inScope, outOfScope } = scopeSignal(question);

  const wantsTool = TOOL_HINTS.some((h) => q.includes(h.toLowerCase()));
  const wantsListingRaw = LISTING_HINTS.some((h) => q.includes(h.toLowerCase()));
  const wantsListing =
    wantsListingRaw && aiConfig.features.marketplaceSearchEnabled;

  if (outOfScope && !inScope) {
    return { route: "OUT_OF_SCOPE", wantsTool: false, wantsListing: false };
  }

  let route: RouteType;
  if (wantsListing && (wantsTool || inScope)) {
    route = "MIXED";
  } else if (wantsListing) {
    route = "LISTING";
  } else if (wantsTool) {
    route = "MIXED"; // ツール＋記事の両方を返せるようにする
  } else {
    route = "ARTICLE";
  }

  return { route, wantsTool, wantsListing };
}
