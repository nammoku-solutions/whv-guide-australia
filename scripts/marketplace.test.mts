/**
 * マーケット・カテゴリ統合と写真並び順の決定的ロジックのテスト。
 * 外部API・DBには接続しない（純粋関数のみ）。
 *   npm run test:marketplace
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  LISTING_TYPE_TO_CATEGORY,
  PRIMARY_CATEGORIES,
  PRIMARY_CATEGORY_ORDER,
  matchesSubcategory,
  normalizeItemKind,
  resolveListingTaxonomy,
} from "../lib/listingConfig";
import {
  coverPhoto,
  movePhoto,
  movePhotoBy,
  normalizePhotoOrder,
  removePhotoAt,
} from "../lib/photoOrder";

// ---------- カテゴリ・マッピング ----------

test("公開カテゴリは求人/家/売買の3つに統合される", () => {
  assert.deepEqual(PRIMARY_CATEGORY_ORDER, ["job", "housing", "marketplace"]);
});

test("listing_type は3カテゴリへ集約される（データは破壊しない）", () => {
  assert.equal(LISTING_TYPE_TO_CATEGORY.job, "job");
  assert.equal(LISTING_TYPE_TO_CATEGORY.farm_job, "job");
  assert.equal(LISTING_TYPE_TO_CATEGORY.housing, "housing");
  assert.equal(LISTING_TYPE_TO_CATEGORY.roommate, "housing");
  assert.equal(LISTING_TYPE_TO_CATEGORY.vehicle, "marketplace");
  assert.equal(LISTING_TYPE_TO_CATEGORY.marketplace, "marketplace");
});

test("各カテゴリが正しい内部 listing_type を含む", () => {
  assert.deepEqual(PRIMARY_CATEGORIES.job.listingTypes, ["job", "farm_job"]);
  assert.deepEqual(PRIMARY_CATEGORIES.housing.listingTypes, ["housing", "roommate"]);
  assert.deepEqual(PRIMARY_CATEGORIES.marketplace.listingTypes, ["vehicle", "marketplace"]);
});

// ---------- サブカテゴリ・マッチング（移行マッピング test 1-7） ----------

test("既存の一般求人は 求人/一般", () => {
  const t = resolveListingTaxonomy("job", {});
  assert.equal(t.category, "job");
  assert.equal(t.subcategory, "general");
});

test("既存のファーム求人は 求人/ファーム", () => {
  const t = resolveListingTaxonomy("farm_job", {});
  assert.equal(t.category, "job");
  assert.equal(t.subcategory, "farm");
});

test("既存の住まいは 家/部屋・シェアハウス", () => {
  const t = resolveListingTaxonomy("housing", {});
  assert.equal(t.category, "housing");
  assert.equal(t.subcategory, "room");
});

test("シェアメイト（offered）は 家/シェアメイト", () => {
  const t = resolveListingTaxonomy("roommate", { roomWantedOrOffered: "offered" });
  assert.equal(t.category, "housing");
  assert.equal(t.subcategory, "sharemate");
});

test("部屋を探している（wanted）は 家/部屋を探している", () => {
  const t = resolveListingTaxonomy("roommate", { roomWantedOrOffered: "wanted" });
  assert.equal(t.category, "housing");
  assert.equal(t.subcategory, "wanted");
});

test("既存の車は 売買/車", () => {
  const t = resolveListingTaxonomy("vehicle", {});
  assert.equal(t.category, "marketplace");
  assert.equal(t.subcategory, "vehicle");
});

test("曖昧な売買アイテムは安全に 売買/その他 へ退避", () => {
  const t = resolveListingTaxonomy("marketplace", { category: "" });
  assert.equal(t.category, "marketplace");
  assert.equal(t.subcategory, "other");
});

test("正規キーの売買アイテムはサブカテゴリに一致", () => {
  assert.ok(matchesSubcategory("marketplace", { category: "furniture" }, "marketplace", "furniture"));
  assert.ok(matchesSubcategory("marketplace", { category: "daily" }, "marketplace", "daily"));
  assert.ok(!matchesSubcategory("marketplace", { category: "furniture" }, "marketplace", "daily"));
});

test("車のサブカテゴリは vehicle 型のみに一致（車固有）", () => {
  assert.ok(matchesSubcategory("vehicle", {}, "marketplace", "vehicle"));
  assert.ok(!matchesSubcategory("marketplace", {}, "marketplace", "vehicle"));
});

test("自由記述の details.category を正規種別へ丸める（不明はその他）", () => {
  assert.equal(normalizeItemKind("家具・家電"), "furniture");
  assert.equal(normalizeItemKind("日用品"), "daily");
  assert.equal(normalizeItemKind("なにか不明なもの"), "other");
  assert.equal(normalizeItemKind(""), "other");
  assert.equal(normalizeItemKind(undefined), "other");
});

// ---------- 写真並び順（test 12-16, 22-23） ----------

test("先頭がメイン画像（カバー）", () => {
  assert.equal(coverPhoto(["a", "b", "c"]), "a");
  assert.equal(coverPhoto([]), null);
});

test("並び替え（左右移動）で順序が確定的に変わる", () => {
  assert.deepEqual(movePhotoBy(["a", "b", "c"], 2, -1), ["a", "c", "b"]);
  assert.deepEqual(movePhotoBy(["a", "b", "c"], 0, 1), ["b", "a", "c"]);
});

test("任意位置への移動でメイン画像を差し替えられる", () => {
  assert.deepEqual(movePhoto(["a", "b", "c"], 2, 0), ["c", "a", "b"]);
  assert.equal(coverPhoto(movePhoto(["a", "b", "c"], 2, 0)), "c");
});

test("削除しても残りの順序は保持され破損しない", () => {
  assert.deepEqual(removePhotoAt(["a", "b", "c", "d"], 1), ["a", "c", "d"]);
  assert.deepEqual(removePhotoAt(["a"], 0), []);
});

test("保存前の正規化は重複除去し順序を維持する", () => {
  assert.deepEqual(normalizePhotoOrder(["a", "b", "a", "", "c"]), ["a", "b", "c"]);
});

test("移動は範囲外indexで元配列を壊さない", () => {
  assert.deepEqual(movePhoto(["a", "b"], 5, 0), ["a", "b"]);
  assert.deepEqual(movePhotoBy(["a", "b"], 0, -3), ["a", "b"]);
});
