/**
 * ライブ・マーケット検索ケイパビリティ（求人 / 住居 / 車）。
 *
 * 設計方針:
 *   - 「現在有効な掲載」は記事ベクトルではなく Supabase の listings テーブルを
 *     型付きフィルタで直接引く（既存 lib/listings.ts の getListingsByType を再利用）。
 *   - getListingsByType は anon サーバークライアント経由 = RLS により
 *     公開・非隠蔽・非削除の掲載のみが返り、isPubliclyActive が期限切れ/非activeを除外。
 *   - モデルへ渡すのは最小化DTOのみ（連絡先・非公開情報は渡さない）。価格は
 *     投稿者が明示した値のみ、無ければ null（発明しない）。
 */

import { getListingsByType, isPubliclyActive } from "@/lib/listings";
import type { ListingFilters } from "@/lib/listings";
import type { Listing } from "@/types/listing";
import { aiConfig } from "../config";
import { actions as trustedActions, listingDetailUrl } from "../actions";
import type { Evidence, StructuredCard } from "../types";
import { parseListingQuery, type ParsedListingQuery } from "./filters";
import { emptyResult, type CapabilityResult } from "./types";

const MAX = aiConfig.structured.maxListingResults;

/** 投稿者の公開表示名（委任掲載は代理先名、それ以外は authorName）。 */
function posterName(listing: Listing): string {
  return listing.authorName || "匿名ユーザー";
}

function jobPay(listing: Listing): string | null {
  const d = listing.details;
  if (!d.payAmount) return null;
  const unit =
    d.payType === "hourly" ? "/h" : d.payType === "salary" ? "/年" : "";
  return `${d.payAmount}${unit}`;
}

// -------------------- Jobs --------------------

function toJobCard(listing: Listing): StructuredCard {
  return {
    kind: "job",
    id: listing.id,
    title: listing.title,
    poster: posterName(listing),
    location: listing.location || "-",
    pay: jobPay(listing),
    employmentType: listing.details.employmentType ?? null,
    url: listingDetailUrl(listing.id),
  };
}

function toJobEvidence(listing: Listing): Evidence {
  const pay = jobPay(listing);
  const parts = [
    `職種: ${listing.title}`,
    `募集者: ${posterName(listing)}`,
    `勤務地: ${listing.location || "未記載"}`,
    pay ? `報酬（投稿者記載）: ${pay}` : "報酬: 記載なし",
    listing.details.employmentType ? `雇用形態: ${listing.details.employmentType}` : "",
    listing.details.industry ? `業種: ${listing.details.industry}` : "",
    listing.listingType === "farm_job" ? "ファーム求人" : "",
  ].filter(Boolean);
  return {
    kind: "listing",
    visibility: "public",
    title: listing.title,
    content: parts.join(" / "),
    url: listingDetailUrl(listing.id),
    sourceId: `listing:${listing.id}`,
    freshness: listing.createdAt || "live",
    riskLevel: "low",
    metadata: { listingType: listing.listingType },
  };
}

export async function searchActiveJobs(
  question: string,
  preset?: ParsedListingQuery,
): Promise<CapabilityResult> {
  if (!aiConfig.features.marketplaceSearchEnabled) return emptyResult("searchActiveJobs");
  const parsed = preset ?? parseListingQuery(question);
  const filters: ListingFilters = {};
  if (parsed.location) filters.location = parsed.location;
  if (parsed.state) filters.state = parsed.state;

  // job と farm_job の両方を対象（ファーム質問でも一般求人でもヒットさせる）。
  const [jobs, farmJobs] = await Promise.all([
    getListingsByType("job", filters),
    getListingsByType("farm_job", filters),
  ]);
  const all = [...jobs, ...farmJobs]
    .filter(isPubliclyActive)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, MAX);

  const actions = [trustedActions.viewJobs()];
  if (farmJobs.length > 0) actions.push(trustedActions.viewFarmJobs());

  return {
    name: "searchActiveJobs",
    evidence: all.map(toJobEvidence),
    cards: all.map(toJobCard),
    actions,
    count: all.length,
  };
}

// -------------------- Housing --------------------

function toHousingCard(listing: Listing): StructuredCard {
  return {
    kind: "housing",
    id: listing.id,
    title: listing.title,
    poster: posterName(listing),
    location: listing.location || listing.details.suburb || "-",
    weeklyRent: listing.details.weeklyRent ?? null,
    roomType: listing.details.roomType ?? null,
    url: listingDetailUrl(listing.id),
  };
}

function toHousingEvidence(listing: Listing): Evidence {
  const d = listing.details;
  const parts = [
    `物件: ${listing.title}`,
    `募集者: ${posterName(listing)}`,
    `エリア: ${listing.location || d.suburb || "未記載"}`,
    d.weeklyRent ? `週家賃（投稿者記載）: ${d.weeklyRent}` : "週家賃: 記載なし",
    d.roomType ? `部屋タイプ: ${d.roomType}` : "",
    d.coupleAllowed ? "カップル可" : "",
    d.availableDate ? `入居可能: ${d.availableDate}` : "",
  ].filter(Boolean);
  return {
    kind: "listing",
    visibility: "public",
    title: listing.title,
    content: parts.join(" / "),
    url: listingDetailUrl(listing.id),
    sourceId: `listing:${listing.id}`,
    freshness: listing.createdAt || "live",
    riskLevel: "low",
    metadata: { listingType: listing.listingType },
  };
}

export async function searchActiveHousing(
  question: string,
  preset?: ParsedListingQuery,
): Promise<CapabilityResult> {
  if (!aiConfig.features.marketplaceSearchEnabled) return emptyResult("searchActiveHousing");
  const parsed = preset ?? parseListingQuery(question);
  const filters: ListingFilters = {};
  if (parsed.location) filters.location = parsed.location;
  if (parsed.state) filters.state = parsed.state;
  if (parsed.maxAmount != null) filters.maxRent = parsed.maxAmount;
  if (parsed.minAmount != null) filters.minRent = parsed.minAmount;
  if (parsed.roomType) filters.roomType = parsed.roomType;
  if (parsed.coupleAllowed) filters.coupleAllowed = true;

  const [housing, roommate] = await Promise.all([
    getListingsByType("housing", filters),
    getListingsByType("roommate", filters),
  ]);
  const all = [...housing, ...roommate]
    .filter(isPubliclyActive)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, MAX);

  return {
    name: "searchActiveHousing",
    evidence: all.map(toHousingEvidence),
    cards: all.map(toHousingCard),
    actions: [trustedActions.viewHousing()],
    count: all.length,
  };
}

// -------------------- Vehicles --------------------

function toVehicleCard(listing: Listing): StructuredCard {
  const d = listing.details;
  return {
    kind: "vehicle",
    id: listing.id,
    title: listing.title,
    poster: posterName(listing),
    location: listing.location || d.state || "-",
    price: d.price ?? null,
    make: d.make ?? null,
    model: d.model ?? null,
    transmission: d.transmission ?? null,
    url: listingDetailUrl(listing.id),
  };
}

function toVehicleEvidence(listing: Listing): Evidence {
  const d = listing.details;
  const parts = [
    `車両: ${listing.title}`,
    `出品者: ${posterName(listing)}`,
    `地域: ${listing.location || d.state || "未記載"}`,
    d.price ? `価格（出品者記載）: ${d.price}` : "価格: 記載なし",
    d.make ? `メーカー: ${d.make}` : "",
    d.model ? `モデル: ${d.model}` : "",
    d.year ? `年式: ${d.year}` : "",
    d.transmission ? `ミッション: ${d.transmission}` : "",
    d.odometer ? `走行: ${d.odometer}` : "",
  ].filter(Boolean);
  return {
    kind: "listing",
    visibility: "public",
    title: listing.title,
    content: parts.join(" / "),
    url: listingDetailUrl(listing.id),
    sourceId: `listing:${listing.id}`,
    freshness: listing.createdAt || "live",
    riskLevel: "low",
    metadata: { listingType: listing.listingType },
  };
}

export async function searchActiveVehicles(
  question: string,
  preset?: ParsedListingQuery,
): Promise<CapabilityResult> {
  if (!aiConfig.features.marketplaceSearchEnabled) return emptyResult("searchActiveVehicles");
  const parsed = preset ?? parseListingQuery(question);
  const filters: ListingFilters = {};
  if (parsed.location) filters.location = parsed.location;
  if (parsed.state) filters.state = parsed.state;
  if (parsed.maxAmount != null) filters.maxPrice = parsed.maxAmount;
  if (parsed.minAmount != null) filters.minPrice = parsed.minAmount;
  if (parsed.transmission) filters.transmission = parsed.transmission;

  const vehicles = (await getListingsByType("vehicle", filters))
    .filter(isPubliclyActive)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, MAX);

  return {
    name: "searchActiveVehicles",
    evidence: vehicles.map(toVehicleEvidence),
    cards: vehicles.map(toVehicleCard),
    actions: [trustedActions.viewVehicles()],
    count: vehicles.length,
  };
}
