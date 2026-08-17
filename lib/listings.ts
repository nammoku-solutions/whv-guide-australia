import { getSupabaseServerClient } from "@/lib/supabaseServer";
import {
  LISTING_TYPE_TO_CATEGORY,
  PRIMARY_CATEGORIES,
  matchesSubcategory,
  type PrimaryCategory,
} from "@/lib/listingConfig";
import type {
  Listing,
  ListingApplication,
  ListingDetails,
  ListingType,
} from "@/types/listing";

// 公開読み取りでは moderation_note を選択しない（内部フィールドは非公開）。
export const LISTING_PUBLIC_SELECT =
  "id, listing_type, user_id, title, description, location, status, contact_method, contact_value, posting_mode, represented_party, images, expires_at, details, created_at, updated_at, profiles(display_name, role)";

type ListingRow = {
  id: string;
  listing_type: ListingType;
  user_id: string | null;
  title: string;
  description: string;
  location: string | null;
  status: Listing["status"];
  contact_method: Listing["contactMethod"];
  contact_value: string | null;
  posting_mode: Listing["postingMode"];
  represented_party: string | null;
  images: string[] | null;
  expires_at: string | null;
  details: ListingDetails | null;
  created_at: string | null;
  updated_at: string | null;
  profiles: { display_name: string | null; role: string | null } | null;
};

function toDateString(value: string | null): string {
  return value ? value.slice(0, 10) : "";
}

/**
 * DB行を Listing へ変換する。委任掲載(delegated)では代理先名を表示名にする。
 */
export function mapListingRow(row: ListingRow): Listing {
  const displayName = row.profiles?.display_name ?? "匿名ユーザー";
  const authorName =
    row.posting_mode === "delegated" && row.represented_party
      ? row.represented_party
      : displayName;
  return {
    id: row.id,
    listingType: row.listing_type,
    userId: row.user_id ?? "",
    authorName,
    title: row.title,
    description: row.description,
    location: row.location ?? "",
    status: row.status,
    contactMethod: row.contact_method,
    contactValue: row.contact_value,
    postingMode: row.posting_mode,
    representedParty: row.represented_party,
    images: Array.isArray(row.images) ? row.images : [],
    expiresAt: row.expires_at,
    details: row.details ?? {},
    createdAt: toDateString(row.created_at),
    updatedAt: toDateString(row.updated_at),
    authorRole: row.profiles?.role ?? undefined,
  };
}

/** 期限切れ・非公開を除いた「公開中(active)」判定。 */
export function isPubliclyActive(listing: Listing): boolean {
  if (listing.status !== "active") return false;
  if (listing.expiresAt && new Date(listing.expiresAt).getTime() <= Date.now()) return false;
  return true;
}

export type ListingFilters = {
  location?: string;
  industry?: string;
  employmentType?: string;
  farm?: "farm" | "non_farm";
  /** 公開カテゴリ内のサブカテゴリ（general/farm/room/wanted/sharemate/vehicle/furniture/daily/other）。 */
  subcategory?: string;
  payType?: string;
  roomType?: string;
  coupleAllowed?: boolean;
  state?: string;
  make?: string;
  transmission?: string;
  minRent?: number;
  maxRent?: number;
  minPrice?: number;
  maxPrice?: number;
};

function num(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(String(value).replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function matchesFilters(listing: Listing, filters: ListingFilters): boolean {
  const d = listing.details;
  if (filters.location) {
    const hay = `${listing.location} ${d.suburb ?? ""} ${d.preferredArea ?? ""} ${d.state ?? ""}`.toLowerCase();
    if (!hay.includes(filters.location.toLowerCase())) return false;
  }
  if (filters.industry && d.industry !== filters.industry) return false;
  if (filters.employmentType && d.employmentType !== filters.employmentType) return false;
  if (filters.farm === "farm" && listing.listingType !== "farm_job" && !d.farmRelevant) return false;
  if (filters.farm === "non_farm" && (listing.listingType === "farm_job" || d.farmRelevant)) return false;
  if (filters.payType && d.payType !== filters.payType) return false;
  if (filters.roomType && d.roomType !== filters.roomType) return false;
  if (filters.coupleAllowed && !d.coupleAllowed) return false;
  if (filters.state && d.state !== filters.state && listing.location.toUpperCase().indexOf(filters.state) === -1)
    return false;
  if (filters.make && !(d.make ?? "").toLowerCase().includes(filters.make.toLowerCase())) return false;
  if (filters.transmission && d.transmission !== filters.transmission) return false;

  const rent = num(d.weeklyRent);
  if (filters.minRent != null && (rent == null || rent < filters.minRent)) return false;
  if (filters.maxRent != null && (rent == null || rent > filters.maxRent)) return false;

  const price = num(d.price);
  if (filters.minPrice != null && (price == null || price < filters.minPrice)) return false;
  if (filters.maxPrice != null && (price == null || price > filters.maxPrice)) return false;

  return true;
}

export async function getListingsByType(
  type: ListingType,
  filters: ListingFilters = {},
): Promise<Listing[]> {
  const client = getSupabaseServerClient();
  if (!client) return [];

  const { data, error } = await client
    .from("listings")
    .select(LISTING_PUBLIC_SELECT)
    .eq("listing_type", type)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  return (data as unknown as ListingRow[])
    .map(mapListingRow)
    .filter(isPubliclyActive)
    .filter((listing) => matchesFilters(listing, filters));
}

/**
 * 公開カテゴリ（求人/家/売買）単位で取得する。内部 listing_type を集約し、
 * 任意の subcategory と構造化フィルタで絞り込む。
 */
export async function getListingsByCategory(
  category: PrimaryCategory,
  filters: ListingFilters = {},
): Promise<Listing[]> {
  const client = getSupabaseServerClient();
  if (!client) return [];
  const cfg = PRIMARY_CATEGORIES[category];

  const { data, error } = await client
    .from("listings")
    .select(LISTING_PUBLIC_SELECT)
    .in("listing_type", cfg.listingTypes)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  return (data as unknown as ListingRow[])
    .map(mapListingRow)
    .filter(isPubliclyActive)
    .filter((listing) =>
      filters.subcategory
        ? matchesSubcategory(listing.listingType, listing.details, category, filters.subcategory)
        : true,
    )
    .filter((listing) => matchesFilters(listing, filters));
}

export async function getListingById(id: string): Promise<Listing | undefined> {
  const client = getSupabaseServerClient();
  if (!client) return undefined;

  const { data, error } = await client
    .from("listings")
    .select(LISTING_PUBLIC_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return undefined;

  const listing = mapListingRow(data as unknown as ListingRow);
  if (listing.status === "removed") return undefined;
  return listing;
}

export async function getLatestListings(limit = 6): Promise<Listing[]> {
  const client = getSupabaseServerClient();
  if (!client) return [];

  const { data, error } = await client
    .from("listings")
    .select(LISTING_PUBLIC_SELECT)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(limit * 3);

  if (error || !data) return [];

  return (data as unknown as ListingRow[])
    .map(mapListingRow)
    .filter(isPubliclyActive)
    .slice(0, limit);
}

export async function countActiveListingsByType(): Promise<Record<ListingType, number>> {
  const counts: Record<ListingType, number> = {
    job: 0,
    farm_job: 0,
    housing: 0,
    roommate: 0,
    vehicle: 0,
    marketplace: 0,
  };
  const client = getSupabaseServerClient();
  if (!client) return counts;

  const { data, error } = await client
    .from("listings")
    .select("listing_type, status, expires_at")
    .eq("status", "active");

  if (error || !data) return counts;

  const now = Date.now();
  for (const row of data as { listing_type: ListingType; expires_at: string | null }[]) {
    if (row.expires_at && new Date(row.expires_at).getTime() <= now) continue;
    counts[row.listing_type] += 1;
  }
  return counts;
}

/**
 * 公開カテゴリ別の件数と、内部 listing_type 別の件数を同時に返す。
 * ドラフト・非公開・削除・期限切れは countActiveListingsByType 側で除外済み。
 */
export async function countActiveListings(): Promise<{
  byType: Record<ListingType, number>;
  byCategory: Record<PrimaryCategory, number>;
}> {
  const byType = await countActiveListingsByType();
  const byCategory: Record<PrimaryCategory, number> = { job: 0, housing: 0, marketplace: 0 };
  (Object.keys(byType) as ListingType[]).forEach((t) => {
    byCategory[LISTING_TYPE_TO_CATEGORY[t]] += byType[t];
  });
  return { byType, byCategory };
}

/** applicant側の一覧マッピング（クライアントからも利用）。 */
export function mapApplicationRow(row: {
  id: string;
  listing_id: string;
  applicant_id: string;
  message: string | null;
  availability: string | null;
  contact_info: string | null;
  status: ListingApplication["status"];
  employer_response: string | null;
  created_at: string | null;
  updated_at: string | null;
  profiles?: { display_name: string | null } | null;
  listings?: { title: string | null; listing_type: ListingType | null } | null;
}): ListingApplication {
  return {
    id: row.id,
    listingId: row.listing_id,
    applicantId: row.applicant_id,
    applicantName: row.profiles?.display_name ?? "匿名ユーザー",
    message: row.message,
    availability: row.availability,
    contactInfo: row.contact_info,
    status: row.status,
    employerResponse: row.employer_response,
    createdAt: toDateString(row.created_at),
    updatedAt: toDateString(row.updated_at),
    listingTitle: row.listings?.title ?? undefined,
    listingType: row.listings?.listing_type ?? undefined,
  };
}
