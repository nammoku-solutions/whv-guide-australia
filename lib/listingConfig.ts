// マーケットプレイスの設定を一元管理する（保守しやすいように定数はここに集約）。
// 有効期限のデフォルト、カテゴリ、フィルタ選択肢、注意喚起の文言など。

import type { ContactMethod, ListingType } from "@/types/listing";

export type ListingTypeConfig = {
  type: ListingType;
  label: string;
  shortLabel: string;
  description: string;
  /** 一覧・作成の導線で使う絵文字（装飾）。 */
  emoji: string;
  /** 有効期限のデフォルト日数（0 は期限なし）。 */
  expiryDays: number;
  supportsImages: boolean;
  supportsApplications: boolean;
  createCta: string;
  emptyState: string;
};

export const LISTING_TYPES: Record<ListingType, ListingTypeConfig> = {
  job: {
    type: "job",
    label: "求人",
    shortLabel: "求人",
    description: "ローカルジョブ・アルバイトの募集。",
    emoji: "💼",
    expiryDays: 30,
    supportsImages: false,
    supportsApplications: true,
    createCta: "求人を掲載する",
    emptyState:
      "現在募集中の求人はまだありません。最初の求人を無料で掲載できます。",
  },
  farm_job: {
    type: "farm_job",
    label: "ファームジョブ",
    shortLabel: "ファーム",
    description: "農場・収穫などのファーム求人。",
    emoji: "🌾",
    expiryDays: 30,
    supportsImages: false,
    supportsApplications: true,
    createCta: "ファーム求人を掲載する",
    emptyState:
      "現在募集中のファーム求人はまだありません。最初の求人を無料で掲載できます。",
  },
  housing: {
    type: "housing",
    label: "家・シェアハウス",
    shortLabel: "住まい",
    description: "シェアハウス・部屋の募集。",
    emoji: "🏠",
    expiryDays: 30,
    supportsImages: true,
    supportsApplications: false,
    createCta: "部屋を掲載する",
    emptyState:
      "まだこのエリアの部屋募集はありません。募集を掲載しましょう。",
  },
  roommate: {
    type: "roommate",
    label: "シェアメイト",
    shortLabel: "シェアメイト",
    description: "ルームメイト・シェアメイト募集。",
    emoji: "🤝",
    expiryDays: 30,
    supportsImages: false,
    supportsApplications: false,
    createCta: "シェアメイト募集を掲載する",
    emptyState:
      "まだシェアメイト募集はありません。最初の募集を掲載できます。",
  },
  vehicle: {
    type: "vehicle",
    label: "車・売買",
    shortLabel: "車",
    description: "車の販売・購入。",
    emoji: "🚗",
    expiryDays: 45,
    supportsImages: true,
    supportsApplications: false,
    createCta: "車を掲載する",
    emptyState:
      "まだ出品されている車はありません。最初の1台を掲載できます。",
  },
  marketplace: {
    type: "marketplace",
    label: "売ります・譲ります",
    shortLabel: "売買",
    description: "家具・家電などの生活用品の売買。",
    emoji: "📦",
    expiryDays: 30,
    supportsImages: true,
    supportsApplications: false,
    createCta: "出品する",
    emptyState:
      "まだ出品はありません。最初のアイテムを掲載できます。",
  },
};

export const LISTING_TYPE_ORDER: ListingType[] = [
  "job",
  "farm_job",
  "housing",
  "roommate",
  "vehicle",
  "marketplace",
];

export function getListingTypeConfig(type: ListingType): ListingTypeConfig {
  return LISTING_TYPES[type];
}

// =====================================================================
// 公開カテゴリ（Information Architecture）
// -------------------------------------------------------------------
// 公開の入口は 3 つ（求人 / 家 / 売買）に統合する。内部の listing_type は
// 構造化サブタイプとして温存し、AI検索・フィルタ・保存検索・応募・車両項目・
// 画像順などのデータを一切破壊しない。
//   category=job        ← listing_type in (job, farm_job)
//   category=housing    ← listing_type in (housing, roommate)
//   category=marketplace← listing_type in (vehicle, marketplace)
// =====================================================================

export type PrimaryCategory = "job" | "housing" | "marketplace";

/** 売買（marketplace）アイテムの正規サブ種別（details.category に保存）。 */
export type MarketplaceItemKind = "furniture" | "daily" | "other";

export type SubcategoryDef = {
  /** URL クエリ ?subcategory= に使う正規キー。 */
  value: string;
  /** 公開ラベル。 */
  label: string;
  /** 作成時に使う内部 listing_type。 */
  listingType: ListingType;
  /** 売買アイテム種別の判別（details.category）。 */
  itemKind?: MarketplaceItemKind;
  /** 家カテゴリの wanted/offered 判別（details.roomWantedOrOffered）。 */
  roomIntent?: "wanted" | "offered";
  createCta: string;
  emptyState: string;
};

export type PrimaryCategoryConfig = {
  category: PrimaryCategory;
  label: string;
  emoji: string;
  description: string;
  createCta: string;
  /** このカテゴリに含まれる内部 listing_type。 */
  listingTypes: ListingType[];
  subcategories: SubcategoryDef[];
};

export const PRIMARY_CATEGORY_ORDER: PrimaryCategory[] = ["job", "housing", "marketplace"];

export const PRIMARY_CATEGORIES: Record<PrimaryCategory, PrimaryCategoryConfig> = {
  job: {
    category: "job",
    label: "求人",
    emoji: "💼",
    description: "一般求人・ファーム求人のローカルジョブ。",
    createCta: "求人を掲載する",
    listingTypes: ["job", "farm_job"],
    subcategories: [
      {
        value: "general",
        label: "一般求人",
        listingType: "job",
        createCta: "一般求人を掲載する",
        emptyState: "現在募集中の一般求人はまだありません。最初の求人を無料で掲載できます。",
      },
      {
        value: "farm",
        label: "ファーム",
        listingType: "farm_job",
        createCta: "ファーム求人を掲載する",
        emptyState: "現在募集中のファーム求人はまだありません。最初の求人を無料で掲載できます。",
      },
    ],
  },
  housing: {
    category: "housing",
    label: "家",
    emoji: "🏠",
    description: "部屋・シェアハウス・シェアメイト募集。",
    createCta: "家の募集を掲載する",
    listingTypes: ["housing", "roommate"],
    subcategories: [
      {
        value: "room",
        label: "部屋・シェアハウス",
        listingType: "housing",
        createCta: "部屋・シェアハウスを掲載する",
        emptyState: "まだ部屋・シェアハウスの募集はありません。募集を掲載しましょう。",
      },
      {
        value: "wanted",
        label: "部屋を探している",
        listingType: "roommate",
        roomIntent: "wanted",
        createCta: "「部屋を探している」を掲載する",
        emptyState: "まだ「部屋を探している」募集はありません。最初の募集を掲載できます。",
      },
      {
        value: "sharemate",
        label: "シェアメイト募集",
        listingType: "roommate",
        roomIntent: "offered",
        createCta: "シェアメイト募集を掲載する",
        emptyState: "まだシェアメイト募集はありません。最初の募集を掲載できます。",
      },
    ],
  },
  marketplace: {
    category: "marketplace",
    label: "売買",
    emoji: "🛒",
    description: "車・家具・家電・日用品などの売買。",
    createCta: "出品する",
    listingTypes: ["vehicle", "marketplace"],
    subcategories: [
      {
        value: "vehicle",
        label: "車",
        listingType: "vehicle",
        createCta: "車を掲載する",
        emptyState: "まだ出品されている車はありません。最初の1台を掲載できます。",
      },
      {
        value: "furniture",
        label: "家具・家電",
        listingType: "marketplace",
        itemKind: "furniture",
        createCta: "家具・家電を出品する",
        emptyState: "まだ家具・家電の出品はありません。最初のアイテムを掲載できます。",
      },
      {
        value: "daily",
        label: "日用品",
        listingType: "marketplace",
        itemKind: "daily",
        createCta: "日用品を出品する",
        emptyState: "まだ日用品の出品はありません。最初のアイテムを掲載できます。",
      },
      {
        value: "other",
        label: "その他",
        listingType: "marketplace",
        itemKind: "other",
        createCta: "出品する",
        emptyState: "まだ出品はありません。最初のアイテムを掲載できます。",
      },
    ],
  },
};

/** 内部 listing_type → 公開カテゴリ。 */
export const LISTING_TYPE_TO_CATEGORY: Record<ListingType, PrimaryCategory> = {
  job: "job",
  farm_job: "job",
  housing: "housing",
  roommate: "housing",
  vehicle: "marketplace",
  marketplace: "marketplace",
};

/** 旧サブタイプ・ルート → 統合先（恒久リダイレクト用）。 */
export const LEGACY_TYPE_REDIRECTS: Record<string, { category: PrimaryCategory; subcategory: string }> = {
  farm_job: { category: "job", subcategory: "farm" },
  roommate: { category: "housing", subcategory: "sharemate" },
  vehicle: { category: "marketplace", subcategory: "vehicle" },
};

/** 売買アイテムの選択肢（フォーム用）。 */
export const MARKETPLACE_ITEM_KINDS: { value: MarketplaceItemKind; label: string }[] = [
  { value: "furniture", label: "家具・家電" },
  { value: "daily", label: "日用品" },
  { value: "other", label: "その他" },
];

export function isPrimaryCategory(value: string): value is PrimaryCategory {
  return value === "job" || value === "housing" || value === "marketplace";
}

export function getPrimaryCategoryConfig(category: PrimaryCategory): PrimaryCategoryConfig {
  return PRIMARY_CATEGORIES[category];
}

/** 自由記述の details.category を正規のアイテム種別へ丸める（不明はその他）。 */
export function normalizeItemKind(raw: string | undefined | null): MarketplaceItemKind {
  const v = (raw ?? "").toLowerCase();
  if (!v) return "other";
  if (v === "furniture" || v.includes("家具") || v.includes("家電") || v.includes("appliance"))
    return "furniture";
  if (v === "daily" || v.includes("日用") || v.includes("生活") || v.includes("goods"))
    return "daily";
  if (v === "other" || v.includes("その他")) return "other";
  return "other";
}

/** 掲載が指定サブカテゴリに合致するか（純粋関数・テスト可能）。 */
export function matchesSubcategory(
  listingType: ListingType,
  details: { category?: string; roomWantedOrOffered?: string },
  category: PrimaryCategory,
  subcategory: string,
): boolean {
  const cfg = PRIMARY_CATEGORIES[category];
  const sub = cfg.subcategories.find((s) => s.value === subcategory);
  if (!sub) return true;
  if (listingType !== sub.listingType) return false;
  if (sub.itemKind) {
    return normalizeItemKind(details.category) === sub.itemKind;
  }
  if (sub.roomIntent) {
    const intent = details.roomWantedOrOffered;
    if (sub.roomIntent === "wanted") return intent === "wanted";
    // offered（シェアメイト募集）: offered もしくは未指定を含める。
    return intent !== "wanted";
  }
  return true;
}

/** 掲載の内部 listing_type/details から公開カテゴリ・サブカテゴリを解決する。 */
export function resolveListingTaxonomy(
  listingType: ListingType,
  details: { category?: string; roomWantedOrOffered?: string } = {},
): { category: PrimaryCategory; subcategory: string; label: string } {
  const category = LISTING_TYPE_TO_CATEGORY[listingType];
  const cfg = PRIMARY_CATEGORIES[category];
  const sub =
    cfg.subcategories.find((s) => matchesSubcategory(listingType, details, category, s.value)) ??
    cfg.subcategories[0];
  return { category, subcategory: sub.value, label: sub.label };
}

export function computeExpiryDate(type: ListingType, from: Date = new Date()): string | null {
  const days = LISTING_TYPES[type].expiryDays;
  if (!days) return null;
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

// --- 選択肢（フォーム・フィルタ共通） ---

export const JOB_INDUSTRIES = [
  "飲食・ホスピタリティ",
  "小売・販売",
  "農業・ファーム",
  "建設・土木",
  "清掃・ハウスキーピング",
  "工場・倉庫",
  "オフィス・事務",
  "美容・理容",
  "IT・エンジニア",
  "その他",
] as const;

export const EMPLOYMENT_TYPES = [
  "カジュアル",
  "パートタイム",
  "フルタイム",
  "契約・期間限定",
  "季節労働",
] as const;

export const PAY_TYPES = [
  { value: "hourly", label: "時給" },
  { value: "salary", label: "年俸・月給" },
  { value: "piece_rate", label: "出来高（ピースレート）" },
  { value: "commission", label: "歩合" },
  { value: "other", label: "その他" },
] as const;

export const ROOM_TYPES = [
  { value: "private", label: "個室（プライベート）" },
  { value: "shared", label: "相部屋（シェア）" },
] as const;

export const TRANSMISSION_TYPES = [
  { value: "automatic", label: "オートマ (AT)" },
  { value: "manual", label: "マニュアル (MT)" },
] as const;

export const AU_STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"] as const;

export const CONTACT_METHODS: { value: ContactMethod; label: string; hint: string }[] = [
  {
    value: "application",
    label: "サイト内で応募を受け付ける",
    hint: "求人向け。応募者の情報は投稿者だけが確認できます。",
  },
  {
    value: "enquiry",
    label: "サイト内の問い合わせ（連絡先は非公開）",
    hint: "掲示板コメントや通報経由での連絡を想定します。",
  },
  {
    value: "email",
    label: "メールアドレスを公開する",
    hint: "入力したメールアドレスが公開ページに表示されます。",
  },
  {
    value: "phone",
    label: "電話番号を公開する",
    hint: "入力した電話番号が公開ページに表示されます。",
  },
  {
    value: "external",
    label: "外部リンク（応募フォーム等）",
    hint: "指定したURLへ誘導します。",
  },
];

// --- 通報理由（マーケットプレイス用） ---

export const LISTING_REPORT_REASONS = [
  "詐欺・詐欺の恐れ",
  "誤解を招く情報",
  "不適切な内容",
  "差別的な内容",
  "違法な行為",
  "怪しい雇用主・事業者",
  "既に決定済み・売却済み",
  "重複投稿",
  "個人情報の掲載",
  "その他",
] as const;

// --- 注意喚起（type別）。可能な場合は既存記事・ツールへリンクする。 ---

export type SafetyNotice = {
  title: string;
  points: string[];
  links?: { href: string; label: string }[];
};

export const SAFETY_NOTICES: Partial<Record<ListingType, SafetyNotice>> = {
  job: {
    title: "求人に関する注意",
    points: [
      "掲載情報は投稿者による情報です。雇用主・給与・雇用形態・ABNの扱い・ビザ就労条件は必ずご自身で確認してください。",
      "Award（最低賃金）や労働条件は公式情報で確認しましょう。",
      "セカンド/サードビザのSpecified work該当性は当サイトが保証するものではありません。ポストコードチェッカー等で別途確認してください。",
      "当サイトは掲載内容の正当性・適合性を保証しません。",
    ],
    links: [
      { href: "/jobs", label: "仕事探しガイド" },
      { href: "/abn", label: "ABNと雇用形態" },
      { href: "/second-visa", label: "セカンド・サードビザ" },
    ],
  },
  farm_job: {
    title: "ファーム求人に関する注意",
    points: [
      "掲載情報は投稿者による情報です。雇用主・給与・労働条件・ビザ就労条件は必ずご自身で確認してください。",
      "Specified work（88日等）の該当性は当サイトが保証するものではありません。作業地の郵便番号・作業内容を公式情報で確認してください。",
      "前払いや高額な紹介料を求める募集には特に注意してください。",
    ],
    links: [
      { href: "/farm", label: "ファーム・88日ガイド" },
      { href: "/second-visa", label: "セカンド・サードビザ" },
    ],
  },
  housing: {
    title: "家探しに関する注意",
    points: [
      "内見前の送金・デポジット要求には十分注意してください。",
      "ボンド（bond）の扱い・本人確認・賃貸詐欺に注意しましょう。",
      "掲載情報は投稿者による情報です。物件・条件はご自身で確認してください。",
    ],
    links: [{ href: "/housing", label: "家探しガイド" }],
  },
  roommate: {
    title: "シェアメイト募集に関する注意",
    points: [
      "内見・面談前の送金には注意してください。",
      "個人情報の取り扱いに気をつけ、安全な場所で会いましょう。",
      "掲載情報は投稿者による情報です。",
    ],
    links: [{ href: "/housing", label: "家探しガイド" }],
  },
  vehicle: {
    title: "車の売買に関する注意",
    points: [
      "PPSR（担保・盗難・全損履歴）を必ず確認してください。",
      "Rego（登録）・Roadworthy/Safety Certificate・名義変更・保険を確認しましょう。",
      "可能であれば整備工場での点検（mechanical inspection）を受けてください。",
      "当サイトは車両状態を検証していません。",
    ],
    links: [
      { href: "/cars", label: "車・免許ガイド" },
      { href: "/transport", label: "交通・決済" },
    ],
  },
  marketplace: {
    title: "売買に関する注意",
    points: [
      "受け取り前の送金には注意してください。",
      "できるだけ対面・安全な場所で取引しましょう。",
      "掲載情報は投稿者による情報です。",
    ],
  },
};
