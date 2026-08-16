import type { ListingType } from "@/types/listing";
import type { TrustedAction } from "./types";

/**
 * 信頼済みルート/アクションのレジストリ。
 *
 * 重要: AI にURLを一切発明させない。ボタン/リンクのURLはすべてここ、または
 * DBの正規メタデータ（listing.id / news.slug / tool.path）から生成する。
 * ここに定義されていない静的ルートをAIから作らせないための単一の窓口。
 */

/** マーケットのタイプ別一覧ページ。 */
export function marketTypeUrl(type: ListingType): string {
  return `/community/market/${type}`;
}

/** 掲載詳細ページ（DBの listing.id からのみ生成）。 */
export function listingDetailUrl(id: string): string {
  return `/community/market/listing/${id}`;
}

/** 静的な信頼済みルート。 */
export const ROUTES = {
  eightyEightCalendar: "/tools/88-day-calculator",
  toolsHub: "/tools",
  marketHub: "/community/market",
  myApplications: "/community/market/my",
  myPage: "/mypage",
  notifications: "/notifications",
  news: "/news",
  login: "/login",
} as const;

/** ニュース詳細ページ（news.slug からのみ生成）。 */
export function newsDetailUrl(slug: string): string {
  return `/news/${slug}`;
}

/** よく使う信頼済みアクションのファクトリ。 */
export const actions = {
  eightyEightCalendar(): TrustedAction {
    return {
      id: "action-88-calendar",
      label: "88日カレンダーを開く",
      url: ROUTES.eightyEightCalendar,
      intent: "tool",
    };
  },
  viewJobs(): TrustedAction {
    return {
      id: "action-view-jobs",
      label: "求人を見る",
      url: marketTypeUrl("job"),
      intent: "listing",
    };
  },
  viewFarmJobs(): TrustedAction {
    return {
      id: "action-view-farm-jobs",
      label: "ファーム求人を見る",
      url: marketTypeUrl("farm_job"),
      intent: "listing",
    };
  },
  viewHousing(): TrustedAction {
    return {
      id: "action-view-housing",
      label: "部屋・シェアを見る",
      url: marketTypeUrl("housing"),
      intent: "listing",
    };
  },
  viewVehicles(): TrustedAction {
    return {
      id: "action-view-vehicles",
      label: "車を見る",
      url: marketTypeUrl("vehicle"),
      intent: "listing",
    };
  },
  manageApplications(): TrustedAction {
    return {
      id: "action-manage-applications",
      label: "応募管理",
      url: ROUTES.myApplications,
      intent: "personal",
    };
  },
  savedItems(): TrustedAction {
    return {
      id: "action-saved",
      label: "保存済み",
      url: ROUTES.myPage,
      intent: "personal",
    };
  },
  notifications(): TrustedAction {
    return {
      id: "action-notifications",
      label: "通知",
      url: ROUTES.notifications,
      intent: "personal",
    };
  },
  officialNews(): TrustedAction {
    return {
      id: "action-news",
      label: "公式ニュース",
      url: ROUTES.news,
      intent: "news",
    };
  },
  login(): TrustedAction {
    return {
      id: "action-login",
      label: "ログイン",
      url: ROUTES.login,
      intent: "login",
    };
  },
} as const;

/** 同一URLのアクションを重複排除する。 */
export function dedupeActions(list: TrustedAction[]): TrustedAction[] {
  const seen = new Set<string>();
  const out: TrustedAction[] = [];
  for (const a of list) {
    if (seen.has(a.url)) continue;
    seen.add(a.url);
    out.push(a);
  }
  return out;
}
