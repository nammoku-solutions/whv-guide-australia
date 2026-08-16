import { supabase } from "@/lib/supabaseClient";

export type NotificationType =
  | "saved_article_updated"
  | "important_news"
  | "saved_listing_updated"
  | "saved_listing_closing"
  | "saved_listing_closed"
  | "new_matching_listing"
  | "application_status_changed"
  | "application_message"
  | "community_reply"
  | "system";

export type AppNotification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  targetType: string | null;
  targetId: string | null;
  targetUrl: string | null;
  createdAt: string;
  readAt: string | null;
};

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  target_type: string | null;
  target_id: string | null;
  target_url: string | null;
  created_at: string;
  read_at: string | null;
};

function mapRow(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    type: row.type as NotificationType,
    title: row.title,
    body: row.body,
    targetType: row.target_type,
    targetId: row.target_id,
    targetUrl: row.target_url,
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

const NOTIFICATION_SELECT =
  "id, type, title, body, target_type, target_id, target_url, created_at, read_at";

export type NotificationPage = {
  items: AppNotification[];
  hasMore: boolean;
};

/** Fetch a page of the current user's notifications (newest first). */
export async function listNotifications(
  limit = 20,
  offset = 0,
): Promise<NotificationPage> {
  if (!supabase) return { items: [], hasMore: false };
  const { data } = await supabase
    .from("notifications")
    .select(NOTIFICATION_SELECT)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit); // fetch one extra to detect further pages
  const rows = (data as NotificationRow[] | null) ?? [];
  const hasMore = rows.length > limit;
  return { items: rows.slice(0, limit).map(mapRow), hasMore };
}

/** Count unread notifications for the current user. */
export async function getUnreadCount(): Promise<number> {
  if (!supabase) return 0;
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  return count ?? 0;
}

/** Mark a single notification read (does not delete). */
export async function markRead(id: string): Promise<void> {
  if (!supabase) return;
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .is("read_at", null);
}

/** Mark all of the current user's unread notifications read. */
export async function markAllRead(): Promise<void> {
  if (!supabase) return;
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
}

// ------------------------------------------------------------------
// Preferences
// ------------------------------------------------------------------

export type NotificationPreferences = {
  importantNews: boolean;
  savedArticleUpdated: boolean;
  savedListingUpdated: boolean;
  applicationUpdates: boolean;
  communityReplies: boolean;
  matchingListings: boolean;
};

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  importantNews: true,
  savedArticleUpdated: true,
  savedListingUpdated: true,
  applicationUpdates: true,
  communityReplies: true,
  matchingListings: true,
};

type PreferencesRow = {
  important_news: boolean;
  saved_article_updated: boolean;
  saved_listing_updated: boolean;
  application_updates: boolean;
  community_replies: boolean;
  matching_listings: boolean;
};

/** Read the current user's preferences; missing row = all enabled. */
export async function getPreferences(): Promise<NotificationPreferences> {
  if (!supabase) return DEFAULT_PREFERENCES;
  const { data } = await supabase
    .from("notification_preferences")
    .select(
      "important_news, saved_article_updated, saved_listing_updated, application_updates, community_replies, matching_listings",
    )
    .maybeSingle();
  const row = data as PreferencesRow | null;
  if (!row) return DEFAULT_PREFERENCES;
  return {
    importantNews: row.important_news,
    savedArticleUpdated: row.saved_article_updated,
    savedListingUpdated: row.saved_listing_updated,
    applicationUpdates: row.application_updates,
    communityReplies: row.community_replies,
    matchingListings: row.matching_listings,
  };
}

/** Upsert the current user's preferences. */
export async function savePreferences(
  userId: string,
  prefs: NotificationPreferences,
): Promise<void> {
  if (!supabase) return;
  await supabase.from("notification_preferences").upsert(
    {
      user_id: userId,
      important_news: prefs.importantNews,
      saved_article_updated: prefs.savedArticleUpdated,
      saved_listing_updated: prefs.savedListingUpdated,
      application_updates: prefs.applicationUpdates,
      community_replies: prefs.communityReplies,
      matching_listings: prefs.matchingListings,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
}
