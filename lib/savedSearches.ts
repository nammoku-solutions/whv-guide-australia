import { supabase } from "@/lib/supabaseClient";
import type { ListingType } from "@/types/listing";

/** Structured (SQL-matchable) marketplace filter payload. Mirrors ListingFilters. */
export type SavedSearchFilters = {
  location?: string;
  industry?: string;
  employmentType?: string;
  payType?: string;
  roomType?: string;
  transmission?: string;
  state?: string;
  farm?: "farm" | "non_farm";
  coupleAllowed?: boolean;
  minRent?: number;
  maxRent?: number;
  minPrice?: number;
  maxPrice?: number;
};

export type SavedSearch = {
  id: string;
  label: string;
  listingType: ListingType | null;
  filters: SavedSearchFilters;
  notify: boolean;
  createdAt: string;
};

type SavedSearchRow = {
  id: string;
  label: string;
  listing_type: string | null;
  filters: SavedSearchFilters;
  notify: boolean;
  created_at: string;
};

function mapRow(row: SavedSearchRow): SavedSearch {
  return {
    id: row.id,
    label: row.label,
    listingType: (row.listing_type as ListingType | null) ?? null,
    filters: row.filters ?? {},
    notify: row.notify,
    createdAt: row.created_at,
  };
}

/** Build the browse URL that re-runs a saved search. */
export function savedSearchUrl(search: SavedSearch): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search.filters)) {
    if (value == null || value === "") continue;
    params.set(key, value === true ? "1" : String(value));
  }
  const base = search.listingType
    ? `/community/market/${search.listingType}`
    : "/community/market";
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export async function listSavedSearches(): Promise<SavedSearch[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from("saved_searches")
    .select("id, label, listing_type, filters, notify, created_at")
    .order("created_at", { ascending: false });
  return ((data as SavedSearchRow[] | null) ?? []).map(mapRow);
}

export async function createSavedSearch(
  userId: string,
  label: string,
  listingType: ListingType | null,
  filters: SavedSearchFilters,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "unavailable" };
  const { error } = await supabase.from("saved_searches").insert({
    user_id: userId,
    label,
    listing_type: listingType,
    filters,
  });
  if (error) {
    return { ok: false, error: error.code === "23505" ? "同じ名前の検索条件があります。" : error.message };
  }
  return { ok: true };
}

export async function deleteSavedSearch(id: string): Promise<void> {
  if (!supabase) return;
  await supabase.from("saved_searches").delete().eq("id", id);
}
