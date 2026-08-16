/**
 * 手動シード（Manual Seed）の決定的テスト（外部 API・DB に接続しない）。
 *   npm run test:backfill:seed
 *
 * 網羅: 公式ドメイン検証・正規化・リダイレクト検証・取得成功/ブロック/タイムアウト・
 * 手動本文フォールバック・タイトル/日付欠落・範囲外・重複(手書き/自動/バッチ内)・
 * 関連/無関係/弱関連・低リスク公開/高リスクレビュー・grounding 失敗・増分索引・
 * review 非索引・記事影響・dry-run 無書き込み・apply 書き込み・バッチ耐性・
 * live-monitor 不変・自動アーカイブ探索の回帰・管理表示・公開順序。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import {
  validateAndCanonicalise,
  isOfficialHost,
  isOfficialFinalUrl,
  resolveOfficialSource,
  officialRegistrableDomain,
} from "../lib/monitor/backfill/officialDomains";
import {
  extractSeedMetadata,
  buildCandidateFromSeed,
  runSeedBackfill,
  type SeedInput,
} from "../lib/monitor/backfill/seed";
import { runBackfill } from "../lib/monitor/backfill/pipeline";
import { contentHash } from "../lib/monitor/diff";
import type { SourceDiscovery, HistoricalCandidate } from "../lib/monitor/backfill/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const HA_417 = "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-417";
const HA_PRICING = "https://immi.homeaffairs.gov.au/visas/getting-a-visa/fees-and-charges/current-visa-pricing";

// ---- fetch スタブ ----
function fetchOk(html: string, finalUrl?: string): typeof fetch {
  return (async () => {
    const res = new Response(html, { status: 200, headers: { "content-type": "text/html" } });
    if (finalUrl) Object.defineProperty(res, "url", { value: finalUrl });
    return res;
  }) as unknown as typeof fetch;
}
function fetchStatus(status: number): typeof fetch {
  return (async () => new Response("x", { status })) as unknown as typeof fetch;
}
const fetchTimeout: typeof fetch = (async () => {
  const e = new Error("aborted");
  e.name = "AbortError";
  throw e;
}) as unknown as typeof fetch;

const OFFICIAL_HTML = `<html><head>
<meta property="og:title" content="Working Holiday visa pricing update">
<meta property="article:published_time" content="2026-06-18T00:00:00Z">
</head><body><main><h1>Pricing</h1>
<p>The Working Holiday visa (subclass 417) pricing estimator has been updated. Working holiday makers should check the visa application charge shown on the official page before applying. This notice explains where to find the current amount.</p>
</main></body></html>`;

// ---- Gemini スタブ ----
const classifyHighly = async () => JSON.stringify({ relevance: "highly_relevant", confidence: 0.9, reason: "WHV" });
const classifyUnrelated = async () => JSON.stringify({ relevance: "unrelated", confidence: 0.9, reason: "無関係" });
const classifyWeak = async () => JSON.stringify({ relevance: "weakly_relevant", confidence: 0.5, reason: "弱" });
function genWith(over: Record<string, unknown>) {
  const base = {
    title: "ビザ費用計算ツールの表示が更新されました",
    summary: "ワーキングホリデービザの料金表示が公式に更新されました。最新額は公式ページで確認してください。",
    whatChanged: "料金表示の案内が更新されました。",
    whoIsAffected: "これから申請するワーホリ利用者",
    whatToDo: "公式ページで最新の申請料を確認してください。",
    confidence: 0.9,
  };
  return async () => JSON.stringify({ ...base, ...over });
}
const genGood = genWith({});

// ---- Fake Supabase admin ----
type Call = { table: string; op: string; payload?: unknown };
type NewsKeyRow = { event_key: string | null; content_hash: string | null; source_url: string | null; title: string | null; source_published_at: string | null };
class FB {
  private op: "select" | "insert" | "update" | null = null;
  private cols = "";
  constructor(private admin: FA, private table: string) {}
  select(cols: string) { if (this.op !== "insert") this.op = "select"; this.cols = cols; return this; }
  insert(p: unknown) { this.op = "insert"; this.admin.calls.push({ table: this.table, op: "insert", payload: p }); return this; }
  update(p: unknown) { this.op = "update"; this.admin.calls.push({ table: this.table, op: "update", payload: p }); return this; }
  eq() { return this; }
  limit() { return this.result(); }
  maybeSingle() { return this.result(); }
  then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) { return Promise.resolve(this.result()).then(res, rej); }
  private result() {
    const ready = this.admin.ready;
    if (this.op === "insert") {
      if (this.table === "news_backfill_runs") return { data: { id: "run1" }, error: null };
      if (this.table === "news_items") return { data: { id: "news1" }, error: null };
      return { data: null, error: null };
    }
    if (this.op === "update") return { data: null, error: null };
    if (this.table === "news_backfill_runs") return { data: [{ id: "run1" }], error: ready ? null : { message: "x" } };
    if (this.table === "news_items" && (this.cols === "is_backfill" || this.cols === "backfill_origin"))
      return { data: [], error: ready ? null : { message: "x" } };
    if (this.table === "news_items" && this.cols.includes("event_key"))
      return { data: this.admin.newsKeys, error: null };
    return { data: [], error: null };
  }
}
class FA {
  calls: Call[] = [];
  constructor(public ready: boolean, public newsKeys: NewsKeyRow[] = []) {}
  from(t: string) { return new FB(this, t); }
}

// =========================================================
// 1/2. 公式ドメイン検証
// =========================================================
test("1: 公式 allow-list の URL は受理", () => {
  const v = validateAndCanonicalise(HA_417);
  assert.equal(v.ok, true);
  assert.ok(isOfficialHost("immi.homeaffairs.gov.au"));
  assert.ok(isOfficialHost("www.homeaffairs.gov.au"));
  assert.ok(isOfficialHost("www.service.nsw.gov.au"));
  assert.equal(officialRegistrableDomain("immi.homeaffairs.gov.au"), "homeaffairs.gov.au");
  assert.equal(officialRegistrableDomain("www.service.nsw.gov.au"), "nsw.gov.au");
});

test("2: 非公式ドメインは拒否", () => {
  for (const u of [
    "https://www.facebook.com/x",
    "https://reddit.com/r/x",
    "https://jams.tv/news",
    "https://example.com/gov.au",
    "https://bit.ly/abc",
    "https://some-migration-agent.com.au/blog",
  ]) {
    const v = validateAndCanonicalise(u);
    assert.equal(v.ok, false, `should reject ${u}`);
    if (!v.ok) assert.equal(v.error, "INVALID_SOURCE");
  }
  assert.equal(validateAndCanonicalise("not a url").ok, false);
});

test("canonicalise: http→https, フラグメント/トラッキング除去, 末尾スラッシュ正規化", () => {
  const v = validateAndCanonicalise("http://www.ato.gov.au/rates/?utm_source=x&itemId=5#frag");
  assert.equal(v.ok, true);
  if (v.ok) {
    assert.ok(v.url.startsWith("https://"));
    assert.ok(!v.url.includes("utm_source"));
    assert.ok(!v.url.includes("#frag"));
    assert.ok(v.url.includes("itemId=5"));
  }
});

// =========================================================
// 3. リダイレクト先の非公式化を拒否
// =========================================================
test("3: 非公式ドメインへのリダイレクトは拒否", async () => {
  const build = await buildCandidateFromSeed(
    { url: HA_PRICING },
    { importedAt: new Date().toISOString() },
    { fetchImpl: fetchOk(OFFICIAL_HTML, "https://www.facebook.com/evil") },
  );
  assert.equal(build.ok, false);
  if (!build.ok) assert.equal(build.result, "invalid_source");
  assert.ok(isOfficialFinalUrl("https://immi.homeaffairs.gov.au/x"));
  assert.ok(!isOfficialFinalUrl("https://facebook.com/x"));
});

// =========================================================
// 4/5/6. 取得成功 / ブロック / タイムアウト
// =========================================================
test("4: URL 取得成功でメタデータ抽出", async () => {
  const build = await buildCandidateFromSeed(
    { url: HA_PRICING },
    { importedAt: new Date().toISOString() },
    { fetchImpl: fetchOk(OFFICIAL_HTML) },
  );
  assert.equal(build.ok, true);
  if (build.ok) {
    assert.equal(build.candidate.officialPublishedAt, "2026-06-18");
    assert.equal(build.candidate.officialTitle, "Working Holiday visa pricing update");
    assert.ok(build.candidate.content.includes("pricing estimator"));
    assert.equal(build.mode, "url_fetch");
  }
});

test("5/8: 取得ブロック（本文なし）は fetch_blocked + Manual Content 案内", async () => {
  const build = await buildCandidateFromSeed(
    { url: HA_PRICING },
    { importedAt: new Date().toISOString() },
    { fetchImpl: fetchStatus(403) },
  );
  assert.equal(build.ok, false);
  if (!build.ok) {
    assert.equal(build.result, "fetch_blocked");
    assert.ok(build.detail.includes("Manual Content Mode"));
  }
});

test("6: タイムアウトは timeout", async () => {
  const build = await buildCandidateFromSeed(
    { url: HA_PRICING },
    { importedAt: new Date().toISOString() },
    { fetchImpl: fetchTimeout },
  );
  assert.equal(build.ok, false);
  if (!build.ok) assert.equal(build.result, "timeout");
});

// =========================================================
// 7. ブロック + 手動本文で成功
// =========================================================
test("7: 取得ブロックでも手動本文で成功", async () => {
  const build = await buildCandidateFromSeed(
    {
      url: HA_PRICING,
      title: "公式: ワーホリビザ料金の案内更新",
      publishedAt: "2026-07-03",
      content: "The Working Holiday visa pricing page was updated by the Department. Working holiday makers should review the visa application charge on the official government page. This content is copied from the official source for grounding.",
    },
    { importedAt: new Date().toISOString() },
    { fetchImpl: fetchStatus(403) }, // 取得は失敗するが content があるので使わない
  );
  assert.equal(build.ok, true);
  if (build.ok) {
    assert.equal(build.mode, "manual_content");
    assert.equal(build.candidate.officialPublishedAt, "2026-07-03");
  }
});

// =========================================================
// 9/10. タイトル/日付欠落は明確なエラー（推測しない）
// =========================================================
test("9: 手動本文でタイトル欠落は missing_title", async () => {
  const build = await buildCandidateFromSeed(
    { url: HA_PRICING, publishedAt: "2026-07-03", content: "x".repeat(200) },
    { importedAt: new Date().toISOString() },
    {},
  );
  assert.equal(build.ok, false);
  if (!build.ok) assert.equal(build.result, "missing_title");
});

test("10: 手動本文で日付欠落は invalid_date（推測しない）", async () => {
  const build = await buildCandidateFromSeed(
    { url: HA_PRICING, title: "T", content: "x".repeat(200) },
    { importedAt: new Date().toISOString() },
    {},
  );
  assert.equal(build.ok, false);
  if (!build.ok) assert.equal(build.result, "invalid_date");
});

test("取得成功だが日付抽出不可 → invalid_date（推測しない）", async () => {
  const noDate = `<html><head><title>Working Holiday update</title></head><body><main><p>${"The working holiday visa page changed. ".repeat(8)}</p></main></body></html>`;
  const build = await buildCandidateFromSeed(
    { url: HA_PRICING },
    { importedAt: new Date().toISOString() },
    { fetchImpl: fetchOk(noDate) },
  );
  assert.equal(build.ok, false);
  if (!build.ok) assert.equal(build.result, "invalid_date");
});

// =========================================================
// 11/12. 有効な手動日付 / 範囲外拒否
// =========================================================
test("11: 有効な手動公式日は受理", async () => {
  const build = await buildCandidateFromSeed(
    { url: HA_PRICING, title: "T", publishedAt: "3 July 2026", content: "y".repeat(200) },
    { importedAt: new Date().toISOString() },
    {},
  );
  assert.equal(build.ok, true);
  if (build.ok) assert.equal(build.candidate.officialPublishedAt, "2026-07-03");
});

test("12: 明示範囲外の日付は out_of_range", async () => {
  const build = await buildCandidateFromSeed(
    { url: HA_PRICING, title: "T", publishedAt: "2026-09-30", content: "z".repeat(200) },
    { from: "2026-06-01", to: "2026-08-16", importedAt: new Date().toISOString() },
    {},
  );
  assert.equal(build.ok, false);
  if (!build.ok) assert.equal(build.result, "out_of_range");
});

// =========================================================
// seed 実行ヘルパー（dry-run）
// =========================================================
function contentSeed(over: Partial<SeedInput> = {}): SeedInput {
  return {
    url: HA_PRICING,
    title: "ビザ費用ページ更新の公式案内",
    publishedAt: "2026-06-18",
    content: "The Working Holiday visa pricing estimator has been updated by the Department of Home Affairs. Working holiday makers should check the official visa application charge before applying. Copied from the official page for grounding.",
    ...over,
  };
}
async function seedDry(seeds: SeedInput[], over: Record<string, unknown> = {}) {
  return runSeedBackfill({
    seeds,
    mode: "dry_run",
    deps: { admin: null, classifyCaller: classifyHighly, generateCaller: genGood, ...over },
  });
}

// =========================================================
// 16/17/18/19/20/21. 関連度・リスク・grounding
// =========================================================
test("16/19: 関連する低/中リスクは公開適格", async () => {
  const r = await seedDry([contentSeed()]);
  assert.equal(r.publishedCount, 1);
  assert.equal(r.seeds[0].result, "published");
});

test("17: 無関係はスキップ", async () => {
  const r = await seedDry([contentSeed()], { classifyCaller: classifyUnrelated });
  assert.equal(r.seeds[0].result, "skipped_unrelated");
});

test("18: 弱い関連はスキップ", async () => {
  const r = await seedDry([contentSeed()], { classifyCaller: classifyWeak });
  assert.equal(r.seeds[0].result, "skipped_weak");
});

test("20: 高リスクトピックは review_required（force publish しない）", async () => {
  const r = await seedDry([contentSeed({ url: HA_417 })]);
  assert.equal(r.publishedCount, 0);
  assert.equal(r.reviewRequiredCount, 1);
  assert.ok(r.seeds[0].detail.includes("高リスク"));
});

test("21: grounding 失敗は自動公開されず review", async () => {
  const r = await seedDry([contentSeed()], {
    generateCaller: genWith({ summary: "申請料は $99999 に変更されました。ワーキングホリデー利用者は確認してください。" }),
  });
  assert.equal(r.publishedCount, 0);
  assert.equal(r.seeds[0].result, "review_required");
  assert.ok(r.seeds[0].detail.includes("grounding"));
});

// =========================================================
// 13/14/15. 重複（手書き / 自動 / バッチ内）
// =========================================================
test("13: 手書きニュースと重複", async () => {
  const r = await seedDry([contentSeed({ url: HA_417 })], {
    generateCaller: genWith({ title: "ワーホリビザ申請料が840 AUDに値上げ" }),
  });
  assert.equal(r.duplicateCount, 1);
  assert.equal(r.seeds[0].result, "duplicate");
});

test("15: 同一バッチ内の重複を検出", async () => {
  const r = await seedDry([contentSeed(), contentSeed({ url: HA_PRICING + "?itemId=2" })]);
  assert.equal(r.publishedCount, 1);
  assert.equal(r.duplicateCount, 1);
});

test("14: 既存自動ニュースと重複（content_hash 一致・apply）", async () => {
  const title = "自動重複テスト用タイトル";
  const summary = "ワーキングホリデービザの料金案内が更新されました。公式ページで確認してください。";
  const whatChanged = "料金案内の表示が公式に更新されました。";
  const gen = genWith({ title, summary, whatChanged });
  const hash = contentHash(`${title}\n${summary}\n${whatChanged}`);
  const fake = new FA(true, [{ event_key: "other", content_hash: hash, source_url: null, title: "別", source_published_at: null }]);
  const r = await runSeedBackfill({
    seeds: [contentSeed()],
    mode: "apply",
    deps: { admin: fake as never, classifyCaller: classifyHighly, generateCaller: gen },
  });
  assert.equal(r.duplicateCount, 1);
  assert.ok(!fake.calls.some((c) => c.table === "news_items" && c.op === "insert"));
});

// =========================================================
// 22/23/24/27. apply 書き込み・増分索引・review 非索引・記事影響
// =========================================================
test("22/24/27: apply で公開ニュース挿入・記事影響・増分索引", async () => {
  const fake = new FA(true);
  let indexCalls = 0;
  const r = await runSeedBackfill({
    seeds: [contentSeed()],
    mode: "apply",
    deps: {
      admin: fake as never,
      classifyCaller: classifyHighly,
      generateCaller: genGood,
      indexNews: (async () => { indexCalls++; return "indexed"; }) as never,
    },
  });
  assert.equal(r.publishedCount, 1);
  assert.equal(indexCalls, 1);
  assert.equal(r.indexedCount, 1);
  assert.ok(fake.calls.some((c) => c.table === "news_items" && c.op === "insert"));
  assert.ok(fake.calls.some((c) => c.table === "article_impacts" && c.op === "insert"));
  // live-monitor テーブルには書き込まない。
  const allowed = new Set(["news_items", "news_backfill_runs", "article_impacts"]);
  assert.ok(fake.calls.every((c) => allowed.has(c.table)));
});

test("23: apply で高リスクは review_required・索引しない", async () => {
  const fake = new FA(true);
  let indexCalls = 0;
  const r = await runSeedBackfill({
    seeds: [contentSeed({ url: HA_417 })],
    mode: "apply",
    deps: { admin: fake as never, classifyCaller: classifyHighly, generateCaller: genGood, indexNews: (async () => { indexCalls++; return "indexed"; }) as never },
  });
  assert.equal(r.reviewRequiredCount, 1);
  assert.equal(indexCalls, 0);
  assert.equal(r.indexedCount, 0);
  assert.ok(fake.calls.some((c) => c.table === "news_items" && c.op === "insert"));
});

// =========================================================
// 26. dry-run は書き込みゼロ
// =========================================================
test("26/29: dry-run は書き込みゼロ・live-monitor 不変", async () => {
  const fake = new FA(true);
  const r = await runSeedBackfill({
    seeds: [contentSeed()],
    mode: "dry_run",
    deps: { admin: fake as never, classifyCaller: classifyHighly, generateCaller: genGood },
  });
  assert.equal(fake.calls.length, 0);
  assert.equal(r.liveMonitorBaselineUntouched, true);
});

// =========================================================
// 28. バッチ耐性: 1 件の失敗が他を止めない
// =========================================================
test("28: 無効シードが他の処理を止めない", async () => {
  const r = await seedDry([
    { url: "https://www.facebook.com/bad" },
    contentSeed(),
    { url: "not a url" },
  ]);
  assert.equal(r.invalidCount, 2);
  assert.equal(r.publishedCount, 1);
  assert.equal(r.seeds.length, 3);
});

// =========================================================
// 29(structural). live-monitor テーブルに触れない
// =========================================================
test("29(structural): seed.ts / db.ts は monitor_source_state 等に書き込まない", () => {
  for (const f of ["lib/monitor/backfill/seed.ts", "lib/monitor/backfill/db.ts"]) {
    const src = readFileSync(resolve(ROOT, f), "utf8");
    assert.ok(!src.includes('.from("monitor_source_state")'));
    assert.ok(!src.includes('.from("monitor_snapshots")'));
    assert.ok(!src.includes('.from("monitor_changes")'));
  }
});

// =========================================================
// 30. 自動アーカイブ探索の回帰（別経路が動作し続ける）
// =========================================================
test("30: 自動アーカイブ探索（runBackfill）は引き続き動作", async () => {
  const cand: HistoricalCandidate = {
    sourceId: "homeaffairs-visa-pricing",
    sourceOrganisation: "Department of Home Affairs",
    registrySourceUrl: HA_PRICING,
    officialTitle: "Working Holiday visa pricing update",
    officialUrl: HA_PRICING + "/x",
    officialPublishedAt: "2026-06-18",
    content: "Working Holiday visa pricing estimator updated. Working holiday makers should check the amount.",
    sourceType: "archive",
    discoveredAt: "2026-08-16T00:00:00Z",
    historicalRangeFrom: "2026-06-01",
    historicalRangeTo: "2026-08-16",
  };
  const disc: SourceDiscovery = {
    sourceId: "homeaffairs-visa-pricing",
    organisation: "Department of Home Affairs",
    sourceType: "archive",
    status: "supported",
    detail: "t",
    candidates: [cand],
  };
  const r = await runBackfill({
    from: "2026-06-01", to: "2026-08-16", mode: "dry_run",
    deps: { admin: null, classifyCaller: classifyHighly, generateCaller: genGood, discoveries: [disc] },
  });
  assert.equal(r.publishedCount, 1);
  assert.equal(r.liveMonitorBaselineUntouched, true);
});

// =========================================================
// 31/32. 管理表示 / 公開順序（構造確認）
// =========================================================
test("31(structural): 管理 UI が手動シードを表示できる", () => {
  const page = readFileSync(resolve(ROOT, "app/admin/monitor/page.tsx"), "utf8");
  assert.ok(page.includes("backfill_origin"));
  assert.ok(page.includes("手動シード"));
  const api = readFileSync(resolve(ROOT, "app/api/admin/monitor/route.ts"), "utf8");
  assert.ok(api.includes("backfill_origin"));
});

test("32(structural): 公開ニュースは公式日で並ぶ（is_backfill）", () => {
  const src = readFileSync(resolve(ROOT, "lib/newsAuto.ts"), "utf8");
  assert.ok(src.includes("row.is_backfill && row.source_published_at"));
});

// =========================================================
// メタデータ抽出
// =========================================================
test("extractSeedMetadata: og:title / published_time / 本文を抽出", () => {
  const m = extractSeedMetadata(OFFICIAL_HTML);
  assert.equal(m.title, "Working Holiday visa pricing update");
  assert.equal(m.publishedAt, "2026-06-18");
  assert.ok(m.content.length > 120);
});

// =========================================================
// resolveOfficialSource
// =========================================================
test("resolveOfficialSource: 最長パス一致で適切なソース", () => {
  const s1 = resolveOfficialSource(HA_PRICING);
  assert.equal(s1?.sourceId, "homeaffairs-visa-pricing");
  const s2 = resolveOfficialSource(HA_417);
  assert.equal(s2?.sourceId, "homeaffairs-whv-417");
});

// =========================================================
// contentFile サポート（Part A）
// =========================================================
const CF_BODY =
  "The Working Holiday visa pricing estimator was updated by the Department of Home Affairs. Working holiday makers should check the official visa application charge before applying. This is copied verbatim from the official page for grounding purposes.";

function tmpSeedDir(): string {
  return mkdtempSync(join(tmpdir(), "seedcf-"));
}

test("A1/A2: 有効な contentFile を読み込む", async () => {
  const dir = tmpSeedDir();
  writeFileSync(join(dir, "official.txt"), CF_BODY, "utf8");
  const build = await buildCandidateFromSeed(
    { url: HA_PRICING, title: "公式タイトル", publishedAt: "2026-07-30", contentFile: "./official.txt" },
    { importedAt: new Date().toISOString(), baseDir: dir },
    {},
  );
  assert.equal(build.ok, true);
  if (build.ok) {
    assert.ok(build.candidate.content.includes("pricing estimator"));
    assert.equal(build.candidate.officialPublishedAt, "2026-07-30");
    assert.equal(build.mode, "manual_content");
  }
});

test("A2: UTF-8（日本語）contentFile を読み込む", async () => {
  const dir = tmpSeedDir();
  const jp = "ワーキングホリデービザの申請料に関する公式ページが更新されました。".repeat(6);
  writeFileSync(join(dir, "jp.txt"), jp, "utf8");
  const build = await buildCandidateFromSeed(
    { url: HA_PRICING, title: "T", publishedAt: "2026-07-30", contentFile: "./jp.txt" },
    { importedAt: new Date().toISOString(), baseDir: dir },
    {},
  );
  assert.equal(build.ok, true);
  if (build.ok) assert.ok(build.candidate.content.includes("ワーキングホリデー"));
});

test("A7: 見つからない contentFile は CONTENT_FILE_NOT_FOUND", async () => {
  const dir = tmpSeedDir();
  const build = await buildCandidateFromSeed(
    { url: HA_PRICING, title: "T", publishedAt: "2026-07-30", contentFile: "./missing.txt" },
    { importedAt: new Date().toISOString(), baseDir: dir },
    {},
  );
  assert.equal(build.ok, false);
  if (!build.ok) {
    assert.equal(build.result, "content_file_error");
    assert.ok(build.detail.includes("CONTENT_FILE_NOT_FOUND"));
  }
});

test("A7: 空の contentFile は CONTENT_FILE_EMPTY", async () => {
  const dir = tmpSeedDir();
  writeFileSync(join(dir, "empty.txt"), "   \n  ", "utf8");
  const build = await buildCandidateFromSeed(
    { url: HA_PRICING, title: "T", publishedAt: "2026-07-30", contentFile: "./empty.txt" },
    { importedAt: new Date().toISOString(), baseDir: dir },
    {},
  );
  assert.equal(build.ok, false);
  if (!build.ok) assert.ok(build.detail.includes("CONTENT_FILE_EMPTY"));
});

test("A7: 大きすぎる contentFile は CONTENT_FILE_TOO_LARGE", async () => {
  const dir = tmpSeedDir();
  writeFileSync(join(dir, "big.txt"), "a".repeat(300 * 1024), "utf8");
  const build = await buildCandidateFromSeed(
    { url: HA_PRICING, title: "T", publishedAt: "2026-07-30", contentFile: "./big.txt" },
    { importedAt: new Date().toISOString(), baseDir: dir },
    {},
  );
  assert.equal(build.ok, false);
  if (!build.ok) assert.ok(build.detail.includes("CONTENT_FILE_TOO_LARGE"));
});

test("A3/A7: 許可ルート外（トラバーサル）は拒否", async () => {
  const dir = tmpSeedDir();
  const build = await buildCandidateFromSeed(
    { url: HA_PRICING, title: "T", publishedAt: "2026-07-30", contentFile: "../../../../etc/passwd" },
    { importedAt: new Date().toISOString(), baseDir: dir },
    {},
  );
  assert.equal(build.ok, false);
  if (!build.ok) assert.ok(build.detail.includes("CONTENT_FILE_OUTSIDE_ALLOWED_ROOT"));
});

test("A2/A7: content と contentFile の同時指定は拒否", async () => {
  const dir = tmpSeedDir();
  writeFileSync(join(dir, "x.txt"), CF_BODY, "utf8");
  const build = await buildCandidateFromSeed(
    { url: HA_PRICING, title: "T", publishedAt: "2026-07-30", content: CF_BODY, contentFile: "./x.txt" },
    { importedAt: new Date().toISOString(), baseDir: dir },
    {},
  );
  assert.equal(build.ok, false);
  if (!build.ok) {
    assert.equal(build.result, "content_conflict");
    assert.ok(build.detail.includes("CONTENT_AND_CONTENT_FILE_CONFLICT"));
  }
});

test("A6/A8: インライン content は従来どおり動作", async () => {
  const build = await buildCandidateFromSeed(
    { url: HA_PRICING, title: "T", publishedAt: "2026-07-30", content: CF_BODY },
    { importedAt: new Date().toISOString() },
    {},
  );
  assert.equal(build.ok, true);
});

test("A4: URL 取得失敗でも contentFile で成功", async () => {
  const dir = tmpSeedDir();
  writeFileSync(join(dir, "fallback.txt"), CF_BODY, "utf8");
  const build = await buildCandidateFromSeed(
    { url: HA_PRICING, title: "T", publishedAt: "2026-07-30", contentFile: "./fallback.txt" },
    { importedAt: new Date().toISOString(), baseDir: dir },
    { fetchImpl: fetchStatus(403) }, // 取得は失敗するが contentFile があるので使わない
  );
  assert.equal(build.ok, true);
});

test("A2: contentFile ありでタイトル欠落は missing_title", async () => {
  const dir = tmpSeedDir();
  writeFileSync(join(dir, "c.txt"), CF_BODY, "utf8");
  const build = await buildCandidateFromSeed(
    { url: HA_PRICING, publishedAt: "2026-07-30", contentFile: "./c.txt" },
    { importedAt: new Date().toISOString(), baseDir: dir },
    {},
  );
  assert.equal(build.ok, false);
  if (!build.ok) assert.equal(build.result, "missing_title");
});

test("A2: contentFile ありで日付欠落は invalid_date", async () => {
  const dir = tmpSeedDir();
  writeFileSync(join(dir, "c.txt"), CF_BODY, "utf8");
  const build = await buildCandidateFromSeed(
    { url: HA_PRICING, title: "T", contentFile: "./c.txt" },
    { importedAt: new Date().toISOString(), baseDir: dir },
    {},
  );
  assert.equal(build.ok, false);
  if (!build.ok) assert.equal(build.result, "invalid_date");
});

test("A4/A6: contentFile が既存パイプラインを通り公開される（dry-run）", async () => {
  const dir = tmpSeedDir();
  writeFileSync(join(dir, "pub.txt"), CF_BODY, "utf8");
  const r = await runSeedBackfill({
    seeds: [{ url: HA_PRICING, title: "公式: ビザ費用の更新", publishedAt: "2026-06-18", contentFile: "./pub.txt" }],
    mode: "dry_run",
    seedBaseDir: dir,
    deps: { admin: null, classifyCaller: classifyHighly, generateCaller: genGood },
  });
  assert.equal(r.publishedCount, 1);
  assert.equal(r.seeds[0].result, "published");
});

