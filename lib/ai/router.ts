import type { RouteType } from "./types";
import { scopeSignal } from "./safety/scope";
import { detectListingIntent, type ListingIntent } from "./capabilities/filters";

/**
 * 軽量なクエリルーター（決定的ロジック）。
 *
 * 純粋なモデル呼び出しに頼らず、キーワードで質問種別を推定する。将来は
 * モデルベース分類器へ差し替え可能（この関数の戻り値の型を保てば呼び出し側は不変）。
 *
 * 種別:
 *   ARTICLE        記事で答える公開知識
 *   TOOL           サイト内ツールへの誘導（ナビゲーション寄り）
 *   LISTING        ライブ掲載検索（求人/住居/車、マーケット有効時）
 *   PERSONAL       ログイン中ユーザー本人の記録（応募/保存/通知）
 *   CURRENT_UPDATE 直近の公式アップデート（ニュース＋監視）
 *   MIXED          記事＋（ツール/掲載/最新情報）
 *   OUT_OF_SCOPE   サイト外
 */

const TOOL_HINTS = [
  "計算", "何日", "88日", "シミュレーション", "予算", "郵便番号", "postcode",
  "チェックリスト", "テンプレート", "カレンダー", "トラッカー", "管理表",
];

/** ツールへのナビゲーション寄り（純 TOOL ルート）を示す語。 */
const TOOL_NAV_HINTS = [
  "どこ", "開き", "開く", "使いたい", "使える", "リンク", "ツールある", "ページある",
];

const LISTING_HINTS = [
  "求人ある", "募集", "空き部屋", "空いてる", "掲載", "売ってる", "売ります",
  "explore listings", "vacancy", "今ある", "求人", "物件", "中古車",
  "部屋ある", "車ある", "仕事ある", "働ける", "働き口",
];

/** 本人データ（認証必須）を示す語。 */
const PERSONAL_APPLICATION_HINTS = [
  "応募してる", "応募中", "応募した", "応募状況", "私の応募", "自分の応募",
  "応募どう", "応募はどう", "選考", "応募管理",
];
const PERSONAL_SAVED_HINTS = [
  "保存してる", "保存した", "保存済み", "保存してる求人", "ブックマーク",
  "お気に入り", "保存を見せて", "保存リスト", "保存した求人",
];
const PERSONAL_NOTIF_HINTS = [
  "お知らせある", "通知ある", "新しいお知らせ", "新着通知", "通知を見せて",
  "お知らせを見せて", "通知一覧", "通知来てる", "何か新しいお知らせ",
];

/** 直近の公式アップデートを示す語。 */
const CURRENT_UPDATE_HINTS = [
  "最近", "最新", "変わった", "変更", "更新された", "アップデート", "新制度",
  "改正", "今どうなってる", "直近",
];

/** MIXED を促す「記事側ガイド」を示す語。 */
const GUIDE_HINTS = [
  "注意点", "コツ", "探し方", "気をつける", "ポイント", "方法", "始め方",
  "書き方", "やり方", "とは", "違い", "選び方",
  // 高リスク（掲載だけで判断させない）: ビザ適格性は記事ガイドを併用させる。
  "取れる", "取得", "適格", "資格", "条件", "セカンドビザ", "サードビザ",
];

/** 88日進捗（本人記録に触れうる）を示す語。 */
const EIGHTY_EIGHT_HINTS = ["あと何日", "88日", "何日働け", "残り日数"];

export type PersonalIntent =
  | "applications"
  | "saved"
  | "notifications"
  | "eighty_eight"
  | null;

export type RouteDecision = {
  route: RouteType;
  wantsTool: boolean;
  wantsListing: boolean;
  wantsPersonal: boolean;
  wantsCurrentUpdate: boolean;
  wantsEightyEight: boolean;
  listingIntent: ListingIntent;
  personalIntent: PersonalIntent;
};

function anyHit(q: string, hints: string[]): boolean {
  return hints.some((h) => q.includes(h.toLowerCase()));
}

function detectPersonalIntent(q: string): PersonalIntent {
  if (anyHit(q, PERSONAL_APPLICATION_HINTS.map((s) => s.toLowerCase()))) return "applications";
  if (anyHit(q, PERSONAL_SAVED_HINTS.map((s) => s.toLowerCase()))) return "saved";
  if (anyHit(q, PERSONAL_NOTIF_HINTS.map((s) => s.toLowerCase()))) return "notifications";
  return null;
}

export function routeQuestion(question: string): RouteDecision {
  const q = question.toLowerCase();
  const { inScope, outOfScope } = scopeSignal(question);

  // ルーティングは「利用者の意図」を分類する。機能フラグ（実際にデータを引くか）は
  // pipeline 側で判定する（テスト容易性・決定性のためフラグに依存しない）。
  const wantsToolRaw = anyHit(q, TOOL_HINTS.map((s) => s.toLowerCase()));
  const toolNav = anyHit(q, TOOL_NAV_HINTS.map((s) => s.toLowerCase()));
  const wantsListing = anyHit(q, LISTING_HINTS.map((s) => s.toLowerCase()));
  const personalIntent = detectPersonalIntent(q);
  const wantsCurrentUpdate = anyHit(q, CURRENT_UPDATE_HINTS.map((s) => s.toLowerCase()));
  const wantsGuide = anyHit(q, GUIDE_HINTS.map((s) => s.toLowerCase()));
  const wantsEightyEight = anyHit(q, EIGHTY_EIGHT_HINTS.map((s) => s.toLowerCase()));
  const listingIntent: ListingIntent = wantsListing ? detectListingIntent(question) : "unknown";

  const base = {
    wantsTool: wantsToolRaw,
    wantsListing,
    wantsPersonal: personalIntent != null,
    wantsCurrentUpdate,
    wantsEightyEight,
    listingIntent,
    personalIntent,
  };

  // スコープ外（かつサイト内語彙・構造化意図が無い）は即 OUT_OF_SCOPE。
  if (
    outOfScope &&
    !inScope &&
    !wantsListing &&
    personalIntent == null &&
    !wantsCurrentUpdate
  ) {
    return { route: "OUT_OF_SCOPE", ...base };
  }

  // 1) 本人データ（最優先。認証は pipeline 側で確認）。
  if (personalIntent != null) {
    return { route: "PERSONAL", ...base };
  }

  // 2) 直近の公式アップデート（記事RAGも併用するが route は CURRENT_UPDATE）。
  if (wantsCurrentUpdate) {
    return { route: "CURRENT_UPDATE", ...base };
  }

  // 3) ライブ掲載。掲載＋ガイド/ツール → MIXED（記事の注意点も返す）。
  if (wantsListing) {
    const route: RouteType = wantsGuide || wantsToolRaw ? "MIXED" : "LISTING";
    return { route, ...base };
  }

  // 4) ツール。ナビゲーション寄りかつガイド質問でなければ純 TOOL。
  if (wantsToolRaw) {
    const route: RouteType = toolNav && !wantsGuide ? "TOOL" : "MIXED";
    return { route, ...base };
  }

  // 5) 既定は記事RAG。
  return { route: "ARTICLE", ...base };
}
