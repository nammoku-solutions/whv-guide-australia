import { aiConfig } from "../config";
import type { RetrievalCandidate } from "../types";

/**
 * ライブ求人・住居・車などのマーケットプレイス検索（Phase 5 用インターフェース）。
 *
 * 重要な設計方針:
 *   - 「現在有効な掲載」は記事の埋め込みではなく、Supabase の `listings` テーブルを
 *     構造化クエリ（status='active' かつ未期限切れ、location、listing_type 等）で
 *     直接引く。古い掲載を埋め込んで「現在の空き」として扱わない。
 *   - V1 では AI_MARKETPLACE_SEARCH_ENABLED=false のため常に空配列を返す。
 *
 * 有効化時の統合ポイント（SITE_AI_UPGRADE_ROADMAP.md 参照）:
 *   getAiAdminClient().from('listings')
 *     .select('id,listing_type,title,location,details,created_at')
 *     .eq('status','active')
 *     .or('expires_at.is.null,expires_at.gt.now()')
 *     .eq('listing_type', type) / .ilike('location', `%${loc}%`)
 */
export type ListingQuery = {
  listingType?: "job" | "farm_job" | "housing" | "roommate" | "vehicle" | "marketplace";
  location?: string;
};

export async function searchListings(
  _query: ListingQuery,
): Promise<RetrievalCandidate[]> {
  if (!aiConfig.features.marketplaceSearchEnabled) return [];
  // TODO(Phase 5): 上記の構造化クエリでライブ掲載を取得して返す。
  return [];
}
