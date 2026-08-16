/**
 * Tests for the notification / saved-items pure logic.
 * Run: npm run test:notifications   (node --test)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isSavedItemType,
  isNotificationType,
  preferenceColumnFor,
  savedArticleUpdatedDedupeKey,
  importantNewsDedupeKey,
  savedArticleUpdatedTitle,
  isMeaningfulArticleUpdate,
  listingMatchesSavedSearch,
} from "../lib/notifications/logic.mjs";

test("saved item type guard accepts supported types only", () => {
  for (const t of ["article", "news", "tool"]) assert.ok(isSavedItemType(t));
  for (const t of ["listing", "job_listing", "", "foo"]) assert.ok(!isSavedItemType(t));
});

test("notification type guard matches the DB check constraint", () => {
  for (const t of [
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
  ]) {
    assert.ok(isNotificationType(t), `expected ${t} to be valid`);
  }
  assert.ok(!isNotificationType("random"));
});

test("preference column mapping gates the right types", () => {
  assert.equal(preferenceColumnFor("important_news"), "important_news");
  assert.equal(preferenceColumnFor("saved_article_updated"), "saved_article_updated");
  assert.equal(preferenceColumnFor("saved_listing_closed"), "saved_listing_updated");
  assert.equal(preferenceColumnFor("saved_listing_closing"), "saved_listing_updated");
  assert.equal(preferenceColumnFor("new_matching_listing"), "matching_listings");
  assert.equal(preferenceColumnFor("application_status_changed"), "application_updates");
  assert.equal(preferenceColumnFor("application_message"), "application_updates");
  assert.equal(preferenceColumnFor("community_reply"), "community_replies");
  // system bypasses preferences (always delivered).
  assert.equal(preferenceColumnFor("system"), null);
});

test("dedupe keys are deterministic and version-scoped", () => {
  assert.equal(
    savedArticleUpdatedDedupeKey("visa-guide", "2026-08-16"),
    "saved_article_updated:visa-guide:2026-08-16",
  );
  // A new updatedAt yields a different key => a re-notification is allowed once.
  assert.notEqual(
    savedArticleUpdatedDedupeKey("visa-guide", "2026-08-16"),
    savedArticleUpdatedDedupeKey("visa-guide", "2026-09-01"),
  );
  assert.equal(importantNewsDedupeKey("policy-change"), "important_news:policy-change");
});

test("saved-article updated title uses the required phrasing", () => {
  assert.equal(savedArticleUpdatedTitle("ビザ申請"), "保存した「ビザ申請」が更新されました");
});

test("insignificant edits do not count as meaningful updates", () => {
  const base = {
    title: "TFNの取得方法",
    description: "手順を解説します。",
    content: ["ステップ1", "ステップ2"],
    updatedAt: "2026-08-01",
    tags: ["tax"],
  };
  // typo/formatting/whitespace/case only + metadata-only changes are suppressed.
  const cosmetic = {
    ...base,
    title: "TFNの取得方法   ",
    content: ["ステップ1", "ステップ2"],
    updatedAt: "2026-08-16", // metadata only
    tags: ["tax", "tfn"], // metadata only
    verifiedAt: "2026-08-16",
  };
  assert.equal(isMeaningfulArticleUpdate(base, cosmetic), false);
});

test("real content changes count as meaningful updates", () => {
  const base = { title: "T", content: ["a", "b"], answer: "yes" };
  assert.equal(isMeaningfulArticleUpdate(base, { ...base, content: ["a", "b", "c"] }), true);
  assert.equal(isMeaningfulArticleUpdate(base, { ...base, answer: "no" }), true);
  assert.equal(isMeaningfulArticleUpdate(base, { ...base, title: "Totally new" }), true);
});

test("missing sides are never meaningful", () => {
  assert.equal(isMeaningfulArticleUpdate(null, { title: "x" }), false);
  assert.equal(isMeaningfulArticleUpdate({ title: "x" }, null), false);
});

test("saved search matching: Gatton + Farm", () => {
  const filters = { location: "Gatton", farm: "farm" };
  const match = { listingType: "farm_job", location: "Gatton QLD", details: {} };
  const miss = { listingType: "job", location: "Brisbane", details: {} };
  assert.ok(listingMatchesSavedSearch(match, filters));
  assert.ok(!listingMatchesSavedSearch(miss, filters));
});

test("saved search matching: Brisbane + Housing <= 250", () => {
  const filters = { location: "Brisbane", maxRent: 250 };
  const cheap = { listingType: "housing", location: "Brisbane", details: { weeklyRent: 240 } };
  const dear = { listingType: "housing", location: "Brisbane", details: { weeklyRent: 300 } };
  const other = { listingType: "housing", location: "Sydney", details: { weeklyRent: 200 } };
  assert.ok(listingMatchesSavedSearch(cheap, filters));
  assert.ok(!listingMatchesSavedSearch(dear, filters));
  assert.ok(!listingMatchesSavedSearch(other, filters));
});

test("saved search matching: QLD + Vehicle <= 6000", () => {
  const filters = { state: "QLD", maxPrice: 6000 };
  const cheap = { listingType: "vehicle", location: "Cairns QLD", details: { state: "QLD", price: 5500 } };
  const dear = { listingType: "vehicle", location: "Cairns QLD", details: { state: "QLD", price: 8000 } };
  assert.ok(listingMatchesSavedSearch(cheap, filters));
  assert.ok(!listingMatchesSavedSearch(dear, filters));
});
