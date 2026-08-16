import { supabase } from "@/lib/supabaseClient";
import { isSavedItemType } from "@/lib/notifications/logic.mjs";

export type SavedItemType = "article" | "news" | "tool";

export type SavedItem = {
  id: string;
  itemType: SavedItemType;
  itemId: string;
  createdAt: string;
};

type SavedItemRow = {
  id: string;
  item_type: string;
  item_id: string;
  created_at: string;
};

function mapRow(row: SavedItemRow): SavedItem {
  return {
    id: row.id,
    itemType: row.item_type as SavedItemType,
    itemId: row.item_id,
    createdAt: row.created_at,
  };
}

/**
 * Check whether the current user has saved a given item. Returns the saved row
 * id when present (so the caller can delete by primary key), otherwise null.
 */
export async function getSavedItemId(
  itemType: SavedItemType,
  itemId: string,
): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase
    .from("saved_items")
    .select("id")
    .eq("item_type", itemType)
    .eq("item_id", itemId)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/** Save an item for the current user. Idempotent (unique constraint). */
export async function saveItem(
  userId: string,
  itemType: SavedItemType,
  itemId: string,
): Promise<string | null> {
  if (!supabase || !isSavedItemType(itemType)) return null;
  const { data } = await supabase
    .from("saved_items")
    .upsert(
      { user_id: userId, item_type: itemType, item_id: itemId },
      { onConflict: "user_id,item_type,item_id" },
    )
    .select("id")
    .single();
  return (data?.id as string | undefined) ?? null;
}

/** Remove a saved item by its primary key (owned by the current user via RLS). */
export async function unsaveItem(savedId: string): Promise<void> {
  if (!supabase) return;
  await supabase.from("saved_items").delete().eq("id", savedId);
}

/** List the current user's saved items, optionally filtered by type. */
export async function listSavedItems(itemType?: SavedItemType): Promise<SavedItem[]> {
  if (!supabase) return [];
  let query = supabase
    .from("saved_items")
    .select("id, item_type, item_id, created_at")
    .order("created_at", { ascending: false });
  if (itemType) query = query.eq("item_type", itemType);
  const { data } = await query;
  return ((data as SavedItemRow[] | null) ?? []).map(mapRow);
}
