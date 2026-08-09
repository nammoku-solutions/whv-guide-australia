// マーケットプレイス（求人・住まい・車など）の型定義。
// DB の listings / listing_applications / saved_listings と対応する。

export type ListingType =
  | "job"
  | "farm_job"
  | "housing"
  | "roommate"
  | "vehicle"
  | "marketplace";

export type ListingStatus = "draft" | "active" | "closed" | "expired" | "removed";

export type ContactMethod = "application" | "email" | "phone" | "external" | "enquiry";

export type PostingMode = "self" | "operator" | "delegated";

export type ApplicationStatus =
  | "applied"
  | "viewed"
  | "contacted"
  | "interview"
  | "accepted"
  | "rejected"
  | "withdrawn";

/**
 * type別の詳細フィールド。DBでは `details` (jsonb) に格納する。
 * すべて任意。投稿者が明示した値のみを保持する。
 */
export type ListingDetails = {
  // --- job / farm_job ---
  businessName?: string;
  employmentType?: string; // 正社員/カジュアル/契約 など
  industry?: string;
  payType?: string; // hourly | salary | piece_rate | commission | other
  payAmount?: string; // 投稿者記載のテキスト（例: "28.5/h" "60,000/年"）
  hoursApprox?: string;
  startDate?: string;
  requirements?: string;
  workRights?: string; // visa/work-right requirements as stated by poster
  accommodationProvided?: boolean;
  transportProvided?: boolean;
  farmRelevant?: boolean; // poster explicitly marks specified-work relevance
  applicationMethod?: string;

  // --- housing / roommate ---
  suburb?: string;
  weeklyRent?: string;
  bond?: string;
  roomType?: string; // private | shared
  coupleAllowed?: boolean;
  availableDate?: string;
  minStay?: string;
  billsIncluded?: boolean;
  furnished?: boolean;
  parking?: boolean;
  transportAccess?: string;
  houseRules?: string;
  // roommate specific
  preferredMoveIn?: string;
  budgetApprox?: string;
  preferredArea?: string;
  lifestyle?: string;
  roomWantedOrOffered?: string; // wanted | offered

  // --- vehicle ---
  make?: string;
  model?: string;
  year?: string;
  price?: string;
  odometer?: string;
  transmission?: string; // automatic | manual
  fuelType?: string;
  regoStatus?: string;
  regoExpiry?: string;
  state?: string;
  roadworthy?: string;
  serviceHistory?: string;
  knownIssues?: string;

  // --- marketplace ---
  category?: string;
};

export type Listing = {
  id: string;
  listingType: ListingType;
  userId: string;
  authorName: string;
  title: string;
  description: string;
  location: string;
  status: ListingStatus;
  contactMethod: ContactMethod;
  contactValue?: string | null;
  postingMode: PostingMode;
  representedParty?: string | null;
  images: string[];
  expiresAt?: string | null;
  details: ListingDetails;
  createdAt: string;
  updatedAt: string;
  /** 投稿者ロール（operatorバッジ表示用）。公開読み取りで付与。 */
  authorRole?: string;
};

export type ListingApplication = {
  id: string;
  listingId: string;
  applicantId: string;
  applicantName: string;
  message?: string | null;
  availability?: string | null;
  contactInfo?: string | null;
  status: ApplicationStatus;
  employerResponse?: string | null;
  createdAt: string;
  updatedAt: string;
  /** applicant側の一覧で使う付随情報 */
  listingTitle?: string;
  listingType?: ListingType;
};

export type SavedListing = {
  id: string;
  listingId: string;
  createdAt: string;
};
