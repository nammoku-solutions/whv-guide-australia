/**
 * Pure, dependency-free helpers for the in-app notification + saved-items
 * system. No React/DOM/Supabase here so it can be unit-tested with
 * `node --test` and reused by both the client libs and the server API.
 */

/** Saved-item domains backed by the unified `saved_items` table. */
export const SAVED_ITEM_TYPES = ["article", "news", "tool"];

/** Notification types persisted in the `notifications` table. */
export const NOTIFICATION_TYPES = [
  "saved_article_updated",
  "important_news",
  "saved_listing_updated",
  "saved_listing_closing",
  "saved_listing_closed",
  "new_matching_listing",
  "application_status_changed",
  "application_message",
  "community_reply",
  "system",
];

/** @param {string} value */
export function isSavedItemType(value) {
  return SAVED_ITEM_TYPES.includes(value);
}

/** @param {string} value */
export function isNotificationType(value) {
  return NOTIFICATION_TYPES.includes(value);
}

/**
 * Map a notification type to the notification_preferences column that gates it.
 * `system` (and unknown types) are always delivered (returns null).
 * @param {string} type
 * @returns {string | null}
 */
export function preferenceColumnFor(type) {
  switch (type) {
    case "important_news":
      return "important_news";
    case "saved_article_updated":
      return "saved_article_updated";
    case "saved_listing_updated":
    case "saved_listing_closing":
    case "saved_listing_closed":
      return "saved_listing_updated";
    case "new_matching_listing":
      return "matching_listings";
    case "application_status_changed":
    case "application_message":
      return "application_updates";
    case "community_reply":
      return "community_replies";
    default:
      return null;
  }
}

/**
 * Build the deterministic dedupe key for a "saved article updated" notification.
 * Tying the key to the article's updatedAt means each *distinct* content version
 * notifies a saver at most once (re-runs are idempotent).
 * @param {string} slug
 * @param {string} updatedAt
 */
export function savedArticleUpdatedDedupeKey(slug, updatedAt) {
  return `saved_article_updated:${slug}:${updatedAt}`;
}

/**
 * Build the dedupe key for an important-news broadcast (one per news slug).
 * @param {string} slug
 */
export function importantNewsDedupeKey(slug) {
  return `important_news:${slug}`;
}

/** Localised title for a "saved article updated" notification. */
export function savedArticleUpdatedTitle(articleTitle) {
  return `保存した「${articleTitle}」が更新されました`;
}

/**
 * Decide whether an article change is *meaningful* enough to notify savers.
 * Typo-only / formatting-only / metadata-only edits must NOT notify. A change is
 * meaningful when the human-visible substance changes: the answer, key points,
 * step content, warnings, FAQs, or a bumped updatedAt paired with changed body
 * text. Whitespace and case are ignored.
 *
 * @param {Record<string, unknown> | null | undefined} prev
 * @param {Record<string, unknown> | null | undefined} next
 * @returns {boolean}
 */
export function isMeaningfulArticleUpdate(prev, next) {
  if (!prev || !next) return false;
  // Substantive fields whose change signals real content movement. Deliberately
  // excludes: id, slug, updatedAt, tags, searchAliases, priority, verifiedAt,
  // thumbnail/hero image, redirectFrom (metadata/formatting-only).
  const fields = [
    "title",
    "description",
    "answer",
    "content",
    "steps",
    "points",
    "warnings",
    "faqs",
    "keyFacts",
    "commonMistakes",
  ];
  for (const field of fields) {
    if (normaliseField(prev[field]) !== normaliseField(next[field])) {
      return true;
    }
  }
  return false;
}

/** Collapse a field to a normalised comparable string (ignores whitespace/case). */
function normaliseField(value) {
  if (value == null) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value, stableReplacer(value));
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function stableReplacer() {
  return (_key, val) => val;
}

/**
 * Match a marketplace listing against a stored saved-search filter set using
 * structured (non-generative) comparisons. Mirrors the browse-page filter
 * semantics so a saved search like { location:"Gatton", farm:"farm" } or
 * { listing_type:"housing", maxRent:250 } can be evaluated in code or SQL.
 *
 * @param {Record<string, any>} listing  normalised listing (with `details`)
 * @param {Record<string, any>} filters
 * @returns {boolean}
 */
export function listingMatchesSavedSearch(listing, filters) {
  if (!listing || !filters) return false;
  const d = listing.details ?? {};
  const loc = filters.location;
  if (loc) {
    const hay = `${listing.location ?? ""} ${d.suburb ?? ""} ${d.preferredArea ?? ""} ${d.state ?? ""}`.toLowerCase();
    if (!hay.includes(String(loc).toLowerCase())) return false;
  }
  if (filters.industry && d.industry !== filters.industry) return false;
  if (filters.employmentType && d.employmentType !== filters.employmentType) return false;
  if (filters.payType && d.payType !== filters.payType) return false;
  if (filters.roomType && d.roomType !== filters.roomType) return false;
  if (filters.transmission && d.transmission !== filters.transmission) return false;
  if (filters.state && d.state !== filters.state && !String(listing.location ?? "").includes(filters.state)) {
    return false;
  }
  if (filters.farm === "farm" && listing.listingType !== "farm_job" && !d.farmRelevant) return false;
  if (filters.coupleAllowed && !d.coupleAllowed) return false;
  const rent = toNum(d.weeklyRent);
  if (filters.maxRent != null && (rent == null || rent > Number(filters.maxRent))) return false;
  if (filters.minRent != null && (rent == null || rent < Number(filters.minRent))) return false;
  const price = toNum(d.price);
  if (filters.maxPrice != null && (price == null || price > Number(filters.maxPrice))) return false;
  if (filters.minPrice != null && (price == null || price < Number(filters.minPrice))) return false;
  return true;
}

function toNum(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
