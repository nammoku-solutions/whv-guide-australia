/**
 * 歴史的公式ニュース バックフィルの決定的テスト（外部 API・DB に接続しない）。
 *   npm run test:backfill
 *
 * 網羅: RSS/アーカイブ探索・範囲フィルタ・非対応ソース・関連度・重複（手書き/自動/
 * 実行内）・日付欠落・grounding・低/高リスク公開・取得/パーサ失敗・記事影響・
 * live-monitor 不変・dry-run 無書き込み・apply 書き込み・増分インデックス・順序。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseFeedEntries,
  parseArchiveEntries,
  createRssAdapter,
  createArchiveAdapter,
  buildAdapter,
} from "../lib/monitor/backfill/adapters";
import {
  validateRange,
  parseOfficialDate,
  isValidDateString,
  inRange,
} from "../lib/monitor/backfill/dates";
import { passesKeywordPrefilter } from "../lib/monitor/backfill/keywordPrefilter";
import {
  checkBackfillDuplicate,
  titleSimilarity,
  type DbNewsKey,
  type ManualNewsKey,
} from "../lib/monitor/backfill/dedupe";
import { analyzeBackfillImpact } from "../lib/monitor/backfill/impact";
import { runBackfill } from "../lib/monitor/backfill/pipeline";
import { getSourceById } from "../lib/monitor/registry";
import type { GeneratedNews } from "../lib/monitor/types";
import type {
  HistoricalCandidate,
  SourceDiscovery,
} from "../lib/monitor/backfill/types";
import type { Article } from "../types/article";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const FROM = "2026-06-01";
const TO = "2026-08-16";

// ---- fetch スタブ ----
function fakeFetch(routes: Record<string, string>): typeof fetch {
  return (async (url: string) => {
    const key = Object.keys(routes).find((k) => String(url).includes(k));
    if (!key) return new Response("not found", { status: 404 });
    return new Response(routes[key], {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  }) as unknown as typeof fetch;
}
function failingFetch(status: number): typeof fetch {
  return (async () => new Response("err", { status })) as unknown as typeof fetch;
}

// ---- Gemini スタブ ----
const classifyHighly = async () =>
  JSON.stringify({ relevance: "highly_relevant", confidence: 0.9, reason: "WHV 制度変更" });
const classifyUnrelated = async () =>
  JSON.stringify({ relevance: "unrelated", confidence: 0.9, reason: "無関係な告知" });
const classifyWeak = async () =>
  JSON.stringify({ relevance: "weakly_relevant", confidence: 0.5, reason: "弱い関連" });

function generateWith(over: Partial<GeneratedNews>): () => Promise<string> {
  const base: GeneratedNews = {
    title: "ワーホリ規定労働の条件が更新されました",
    summary: "ワーキングホリデービザの規定労働に関する取り扱いが公式に更新されました。",
    whatChanged: "規定労働の対象や運用が更新されました。",
    whoIsAffected: "セカンドビザを目指す417ビザ保持者",
    whatToDo: "最新条件を公式ページで確認してください。",
    confidence: 0.9,
  };
  return async () => JSON.stringify({ ...base, ...over });
}
const generateGood = generateWith({});

// ---- 候補・探索ヘルパー ----
function candidate(over: Partial<HistoricalCandidate> = {}): HistoricalCandidate {
  return {
    sourceId: "homeaffairs-visa-pricing",
    sourceOrganisation: "Department of Home Affairs",
    registrySourceUrl:
      "https://immi.homeaffairs.gov.au/visas/getting-a-visa/fees-and-charges/current-visa-pricing",
    officialTitle: "Working Holiday visa pricing update",
    officialUrl: "https://immi.homeaffairs.gov.au/news-media/archive/article?itemId=500",
    officialPublishedAt: "2026-06-18",
    content:
      "Working Holiday visa (subclass 417) pricing estimator has been updated. The visa application charge is shown on the official page. Working holiday makers should check the latest amount.",
    sourceType: "archive",
    discoveredAt: "2026-08-16T00:00:00Z",
    historicalRangeFrom: FROM,
    historicalRangeTo: TO,
    ...over,
  };
}
function discovery(candidates: HistoricalCandidate[], sourceId: string): SourceDiscovery {
  const s = getSourceById(sourceId)!;
  return {
    sourceId,
    organisation: s.organisation,
    sourceType: "archive",
    status: "supported",
    detail: "test",
    candidates,
  };
}

// ---- Fake Supabase admin（apply パス検証用） ----
type Call = { table: string; op: string; payload?: unknown };
class FakeBuilder {
  private op: "select" | "insert" | "update" | null = null;
  private cols = "";
  constructor(
    private admin: FakeAdmin,
    private table: string,
  ) {}
  select(cols: string) {
    if (this.op !== "insert") this.op = "select";
    this.cols = cols;
    return this;
  }
  insert(payload: unknown) {
    this.op = "insert";
    this.admin.calls.push({ table: this.table, op: "insert", payload });
    return this;
  }
  update(payload: unknown) {
    this.op = "update";
    this.admin.calls.push({ table: this.table, op: "update", payload });
    return this;
  }
  eq() {
    return this;
  }
  limit() {
    return this.result();
  }
  maybeSingle() {
    return this.result();
  }
  then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
    return Promise.resolve(this.result()).then(res, rej);
  }
  private result() {
    const ready = this.admin.ready;
    if (this.op === "insert") {
      if (this.table === "news_backfill_runs") return { data: { id: "run1" }, error: null };
      if (this.table === "news_items") return { data: { id: "news1" }, error: null };
      return { data: null, error: null };
    }
    if (this.op === "update") return { data: null, error: null };
    // select
    if (this.table === "news_backfill_runs")
      return { data: [{ id: "run1" }], error: ready ? null : { message: "missing" } };
    if (this.table === "news_items" && this.cols === "is_backfill")
      return { data: [], error: ready ? null : { message: "missing column" } };
    return { data: [], error: null };
  }
}
class FakeAdmin {
  calls: Call[] = [];
  constructor(public ready: boolean) {}
  from(table: string) {
    return new FakeBuilder(this, table);
  }
}

// =========================================================
// 1-3. 範囲フィルタ（RSS）
// =========================================================
const RSS_FEED = `<rss><channel>
  <item><title>Working Holiday visa specified work update</title><link>https://immi.homeaffairs.gov.au/x/in</link><pubDate>Thu, 18 Jun 2026 00:00:00 GMT</pubDate><description>Specified work rules for the working holiday visa were updated.</description></item>
  <item><title>Old working holiday notice</title><link>https://immi.homeaffairs.gov.au/x/before</link><pubDate>Fri, 01 May 2026 00:00:00 GMT</pubDate><description>Working holiday change before range.</description></item>
  <item><title>Future working holiday notice</title><link>https://immi.homeaffairs.gov.au/x/after</link><pubDate>Fri, 25 Sep 2026 00:00:00 GMT</pubDate><description>Working holiday change after range.</description></item>
</channel></rss>`;

test("1/2/3: RSS 探索は範囲内のみ（前後は除外）", async () => {
  const src = getSourceById("homeaffairs-visa-pricing")!;
  const adapter = createRssAdapter(src, "https://feed.example/rss", 50);
  const d = await adapter.discoverEntries(FROM, TO, {
    fetchImpl: fakeFetch({ "feed.example/rss": RSS_FEED }),
  });
  assert.equal(d.status, "supported");
  assert.equal(d.candidates.length, 1);
  assert.equal(d.candidates[0].officialPublishedAt, "2026-06-18");
});

test("parseFeedEntries: 日付の無いエントリは推測せず除外", () => {
  const xml = `<rss><channel><item><title>No date</title><link>https://x/1</link><description>d</description></item></channel></rss>`;
  assert.equal(parseFeedEntries(xml).length, 0);
});

// =========================================================
// 4. アーカイブ一覧探索
// =========================================================
const ARCHIVE_LIST = `<html><body><main>
  <div>18 Jun 2026 <a href="/news-media/archive/article?itemId=100">Changes to Working Holiday visa specified work rules</a></div>
  <div>02 May 2026 <a href="/news-media/archive/article?itemId=101">Older working holiday item before range</a></div>
  <div>20 Sep 2026 <a href="/news-media/archive/article?itemId=102">Future working holiday item after range</a></div>
</main></body></html>`;
const ARCHIVE_ARTICLE = `<html><body><main><h1>Specified work</h1><p>The specified work rules for the Working Holiday visa subclass 417 have been updated for regional areas.</p></main></body></html>`;

test("4: アーカイブ一覧から範囲内の日付つきリンクを抽出し本文取得", async () => {
  const src = getSourceById("homeaffairs-whv-417")!;
  const adapter = createArchiveAdapter(src, ["https://immi.homeaffairs.gov.au/news-media/archive"], 50);
  const d = await adapter.discoverEntries(FROM, TO, {
    fetchImpl: fakeFetch({
      "news-media/archive/article": ARCHIVE_ARTICLE,
      "news-media/archive": ARCHIVE_LIST,
    }),
  });
  assert.equal(d.status, "supported");
  assert.equal(d.candidates.length, 1);
  assert.equal(d.candidates[0].officialPublishedAt, "2026-06-18");
  assert.ok(d.candidates[0].content.includes("specified work"));
});

test("parseArchiveEntries: 日付が対応づかないリンクは候補にしない", () => {
  const html = `<html><body><a href="/x/1">Some link without any date nearby</a></body></html>`;
  assert.equal(parseArchiveEntries(html, "https://x").length, 0);
});

// =========================================================
// 5. 非対応（現在状態ページのみ）ソース
// =========================================================
test("5: unsupported ソースはアダプタ null", () => {
  assert.equal(buildAdapter(getSourceById("ato-whm-tax-rates")!), null); // method=unsupported
  assert.equal(buildAdapter(getSourceById("homeaffairs-whv-462")!), null); // historical 未設定
  assert.notEqual(buildAdapter(getSourceById("homeaffairs-whv-417")!), null); // archive 設定あり
});

// =========================================================
// 16/17. 取得失敗・パーサ構造変化
// =========================================================
test("16: フィード取得失敗は http_error（ニュースなしに丸めない）", async () => {
  const src = getSourceById("homeaffairs-visa-pricing")!;
  const adapter = createRssAdapter(src, "https://feed.example/rss", 50);
  const d = await adapter.discoverEntries(FROM, TO, { fetchImpl: failingFetch(500) });
  assert.equal(d.status, "http_error");
  assert.equal(d.candidates.length, 0);
});

test("17: 一覧の構造変化（日付リンクなし）は unexpected_structure", async () => {
  const src = getSourceById("homeaffairs-whv-417")!;
  const adapter = createArchiveAdapter(src, ["https://immi.homeaffairs.gov.au/news-media/archive"], 50);
  const d = await adapter.discoverEntries(FROM, TO, {
    fetchImpl: fakeFetch({ "news-media/archive": "<html><body>no dated links</body></html>" }),
  });
  assert.equal(d.status, "unexpected_structure");
});

// =========================================================
// 日付ユーティリティ・範囲検証
// =========================================================
test("dates: parseOfficialDate は各種表記を ISO 化し、不明は null", () => {
  assert.equal(parseOfficialDate("22 Jun 2026"), "2026-06-22");
  assert.equal(parseOfficialDate("22 June 2026"), "2026-06-22");
  assert.equal(parseOfficialDate("2026-06-22"), "2026-06-22");
  assert.equal(parseOfficialDate("Tue, 01 Jul 2026 00:00:00 GMT"), "2026-07-01");
  assert.equal(parseOfficialDate("someday soon"), null);
  assert.ok(isValidDateString("2026-06-01"));
  assert.ok(!isValidDateString("2026-13-40"));
  assert.ok(inRange("2026-06-18", FROM, TO));
  assert.ok(!inRange("2026-05-31", FROM, TO));
});

test("validateRange: 不正日付・from>to・過度に広い範囲を拒否", () => {
  assert.equal(validateRange("2026-06-01", "2026-08-16", 400, false).ok, true);
  assert.equal(validateRange("bad", "2026-08-16", 400, false).ok, false);
  assert.equal(validateRange("2026-08-16", "2026-06-01", 400, false).ok, false);
  assert.equal(validateRange("2000-01-01", "2026-08-16", 400, false).ok, false);
  assert.equal(validateRange("2000-01-01", "2026-08-16", 400, true).ok, true); // override
});

// =========================================================
// キーワードプレフィルタ
// =========================================================
test("prefilter: WHV 語彙で通過、無関係は除外", () => {
  assert.ok(passesKeywordPrefilter({ title: "Working Holiday visa update" }));
  assert.ok(passesKeywordPrefilter({ title: "最低賃金の改定" }));
  assert.ok(!passesKeywordPrefilter({ title: "Beauty salon operators penalised in court" }));
});

// =========================================================
// 9/10/11. 重複判定（手書き / 自動 / 実行内）
// =========================================================
const candKey = {
  eventKey: "homeaffairs-whv-417::x::2026-06-18",
  contentHash: "hash-abc",
  officialUrl: "https://immi.homeaffairs.gov.au/news-media/archive/article?itemId=100",
  registrySourceUrl: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-417",
  officialPublishedAt: "2026-06-18",
};
const genForDup: GeneratedNews = {
  title: "ワーホリビザ申請料が840 AUDに値上げ",
  summary: "s", whatChanged: "w", whoIsAffected: "a", whatToDo: "d", confidence: 0.9,
};

test("9: 手書きニュースと重複（タイトル類似）", () => {
  const manual: ManualNewsKey[] = [
    { title: "ワーホリビザ申請料が840 AUDに値上げ（2025年7月〜）", sourceUrl: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-417", date: "2025-07-01" },
  ];
  const v = checkBackfillDuplicate({ candidate: candKey, generated: genForDup, manual, db: [], seen: [], seenTitles: [] });
  assert.equal(v.duplicate, true);
  assert.equal(v.against, "manual");
});

test("10: 既存自動ニュースと重複（content_hash 一致）", () => {
  const db: DbNewsKey[] = [{ eventKey: "other", contentHash: "hash-abc", sourceUrl: null, title: "別タイトル", sourcePublishedAt: null }];
  const v = checkBackfillDuplicate({ candidate: candKey, generated: genForDup, manual: [], db, seen: [], seenTitles: [] });
  assert.equal(v.duplicate, true);
  assert.equal(v.against, "auto");
});

test("11: 実行内で二重検出（event_key 一致）", () => {
  const v = checkBackfillDuplicate({ candidate: candKey, generated: genForDup, manual: [], db: [], seen: [candKey], seenTitles: [] });
  assert.equal(v.duplicate, true);
  assert.equal(v.against, "in_run");
});

test("dedupe: 無関係タイトルは重複にしない", () => {
  const v = checkBackfillDuplicate({
    candidate: candKey,
    generated: { ...genForDup, title: "メディケア窓口の受付時間について" },
    manual: [{ title: "全く別の記事タイトル", sourceUrl: "https://other.example/x", date: "2026-06-01" }],
    db: [], seen: [], seenTitles: [],
  });
  assert.equal(v.duplicate, false);
});

test("titleSimilarity: 同一=1, 無関係は低い", () => {
  assert.equal(titleSimilarity("abc", "abc"), 1);
  assert.ok(titleSimilarity("ワーホリビザ申請料の値上げ", "メディケアの受付時間") < 0.3);
});

// =========================================================
// 19/20. 記事影響（公式日考慮）
// =========================================================
function article(over: Partial<Article>): Article {
  return {
    id: "a1",
    slug: "visa-application",
    title: "ビザ申請ガイド",
    category: "visa",
    tags: ["visa"],
    updatedAt: "2026-05-01",
    verifiedAt: "2026-05-01",
    officialSources: [
      { label: "HA 417", url: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-417", accessedAt: "2026-05-01" },
    ],
    ...over,
  } as Article;
}

test("19: 公式イベント日より後に確認済みの記事は影響度を引き下げ", () => {
  const src = getSourceById("homeaffairs-whv-417")!;
  const arts = [article({ verifiedAt: "2026-08-01", updatedAt: "2026-08-01" })];
  const impacts = analyzeBackfillImpact(src, arts, "2026-06-18");
  assert.equal(impacts[0].impactLevel, "unaffected");
});

test("20: 公式イベント日より前の記事は影響を維持（requires_update）", () => {
  const src = getSourceById("homeaffairs-whv-417")!; // high risk + exact URL => requires_update
  const arts = [article({ verifiedAt: "2026-05-01", updatedAt: "2026-05-01" })];
  const impacts = analyzeBackfillImpact(src, arts, "2026-06-18");
  assert.equal(impacts[0].impactLevel, "requires_update");
});

// =========================================================
// パイプライン（dry-run, 注入探索）
// =========================================================
async function dryRun(discoveries: SourceDiscovery[], over: Partial<Parameters<typeof runBackfill>[0]["deps"]> = {}) {
  return runBackfill({
    from: FROM, to: TO, mode: "dry_run",
    deps: { admin: null, classifyCaller: classifyHighly, generateCaller: generateGood, discoveries, ...over },
  });
}

test("6/14: 関連する低/中リスク変更は公開適格（dry-run では計上のみ）", async () => {
  const r = await dryRun([discovery([candidate()], "homeaffairs-visa-pricing")]);
  assert.equal(r.candidatesRelevant, 1);
  assert.equal(r.publishedCount, 1);
  assert.equal(r.candidates[0].result, "published");
});

test("7: 無関係告知はスキップ", async () => {
  const r = await dryRun([discovery([candidate()], "homeaffairs-visa-pricing")], { classifyCaller: classifyUnrelated });
  assert.equal(r.publishedCount, 0);
  assert.equal(r.candidates[0].result, "skipped_unrelated");
});

test("8: 弱い関連はスキップ", async () => {
  const r = await dryRun([discovery([candidate()], "homeaffairs-visa-pricing")], { classifyCaller: classifyWeak });
  assert.equal(r.candidates[0].result, "skipped_weak");
});

test("prefilter 段階でのスキップ（WHV 無関係本文）", async () => {
  const c = candidate({ officialTitle: "Beauty salon penalised", content: "A beauty salon operator was penalised in court." });
  const r = await dryRun([discovery([c], "homeaffairs-visa-pricing")]);
  assert.equal(r.candidates[0].result, "skipped_unrelated");
  assert.equal(r.candidatesRelevant, 0);
});

test("12: 公式公開日が欠落した候補はスキップ", async () => {
  const r = await dryRun([discovery([candidate({ officialPublishedAt: "" })], "homeaffairs-visa-pricing")]);
  assert.equal(r.candidates[0].result, "skipped_no_date");
});

test("13: grounding 失敗（供給外の数値主張）は自動公開されず review", async () => {
  const gen = generateWith({ summary: "申請料は $99999 に変更されました。ワーキングホリデービザ利用者は確認してください。" });
  const r = await dryRun([discovery([candidate()], "homeaffairs-visa-pricing")], { generateCaller: gen });
  assert.equal(r.publishedCount, 0);
  assert.equal(r.candidates[0].result, "review_required");
  assert.ok(r.candidates[0].detail.includes("grounding"));
});

test("15: 高リスクトピックは常に review_required", async () => {
  const c = candidate({
    sourceId: "homeaffairs-whv-417",
    registrySourceUrl: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-417",
  });
  const r = await dryRun([discovery([c], "homeaffairs-whv-417")]);
  assert.equal(r.publishedCount, 0);
  assert.equal(r.reviewRequiredCount, 1);
  assert.ok(r.candidates[0].detail.includes("高リスク"));
});

test("11(pipeline): 同一実行内の二重候補は 1 件のみ採用", async () => {
  const c1 = candidate();
  const c2 = candidate({ officialUrl: "https://immi.homeaffairs.gov.au/news-media/archive/article?itemId=999" });
  const r = await dryRun([discovery([c1, c2], "homeaffairs-visa-pricing")]);
  assert.equal(r.publishedCount, 1);
  assert.equal(r.duplicateCount, 1);
});

test("9(pipeline): 手書きニュースと重複する候補は duplicate", async () => {
  const gen = generateWith({ title: "ワーホリビザ申請料が840 AUDに値上げ" });
  const c = candidate({
    sourceId: "homeaffairs-whv-417",
    registrySourceUrl: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-417",
    content: "The Working Holiday visa application charge was updated on the official page.",
  });
  const r = await dryRun([discovery([c], "homeaffairs-whv-417")], { generateCaller: gen });
  assert.equal(r.duplicateCount, 1);
  assert.equal(r.candidates[0].result, "duplicate");
});

test("18/21: dry-run は live-monitor 不変かつ一切書き込まない", async () => {
  const fake = new FakeAdmin(true);
  const r = await runBackfill({
    from: FROM, to: TO, mode: "dry_run",
    deps: { admin: fake as never, classifyCaller: classifyHighly, generateCaller: generateGood, discoveries: [discovery([candidate()], "homeaffairs-visa-pricing")] },
  });
  assert.equal(r.liveMonitorBaselineUntouched, true);
  assert.equal(fake.calls.length, 0); // 書き込みゼロ
});

// =========================================================
// 22/23/24. apply 書き込み・増分インデックス・review 非インデックス
// =========================================================
test("23: apply で公開ニュースを挿入し、公開分のみ増分インデックス", async () => {
  const fake = new FakeAdmin(true);
  let indexCalls = 0;
  const r = await runBackfill({
    from: FROM, to: TO, mode: "apply",
    deps: {
      admin: fake as never,
      classifyCaller: classifyHighly,
      generateCaller: generateWith({ title: "ビザ費用計算ツールの表示が更新されました" }),
      discoveries: [discovery([candidate()], "homeaffairs-visa-pricing")],
      indexNews: (async () => {
        indexCalls++;
        return "indexed";
      }) as never,
    },
  });
  assert.equal(r.publishedCount, 1);
  assert.equal(indexCalls, 1);
  assert.equal(r.indexedCount, 1);
  assert.ok(fake.calls.some((c) => c.table === "news_items" && c.op === "insert"));
  assert.ok(fake.calls.some((c) => c.table === "news_backfill_runs" && c.op === "update")); // completeRun
  // live-monitor テーブルには一切書き込まない（挿入/更新の対象は許可テーブルのみ）。
  const allowed = new Set(["news_items", "news_backfill_runs", "article_impacts"]);
  assert.ok(fake.calls.every((c) => allowed.has(c.table)));
});

test("22/24: apply で高リスクは review_required 挿入・インデックスしない", async () => {
  const fake = new FakeAdmin(true);
  let indexCalls = 0;
  const c = candidate({
    sourceId: "homeaffairs-whv-417",
    registrySourceUrl: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-417",
    content: "Specified work rules for the working holiday visa subclass 417 were updated for regional postcodes.",
  });
  const r = await runBackfill({
    from: FROM, to: TO, mode: "apply",
    deps: {
      admin: fake as never,
      classifyCaller: classifyHighly,
      generateCaller: generateGood,
      discoveries: [discovery([c], "homeaffairs-whv-417")],
      indexNews: (async () => {
        indexCalls++;
        return "indexed";
      }) as never,
    },
  });
  assert.equal(r.reviewRequiredCount, 1);
  assert.equal(indexCalls, 0);
  assert.equal(r.indexedCount, 0);
  assert.ok(fake.calls.some((c) => c.table === "news_items" && c.op === "insert"));
});

test("apply だが DB 未準備なら書き込みしない（安全）", async () => {
  const fake = new FakeAdmin(false); // columns not ready
  const r = await runBackfill({
    from: FROM, to: TO, mode: "apply",
    deps: { admin: fake as never, classifyCaller: classifyHighly, generateCaller: generateGood, discoveries: [discovery([candidate()], "homeaffairs-visa-pricing")] },
  });
  assert.ok(!fake.calls.some((c) => c.op === "insert"));
  assert.ok(r.notes.some((n) => n.includes("マイグレーション未適用")));
});

// =========================================================
// 18(structural). バックフィル DB 層は live-monitor テーブルに触れない
// =========================================================
test("18(structural): backfill/db.ts は monitor_source_state 等を書き込まない", () => {
  const src = readFileSync(resolve(ROOT, "lib/monitor/backfill/db.ts"), "utf8");
  // コメントでの言及は許容し、実際の .from("...") 呼び出しが無いことを確認する。
  assert.ok(!src.includes('.from("monitor_source_state")'));
  assert.ok(!src.includes('.from("monitor_snapshots")'));
  assert.ok(!src.includes('.from("monitor_changes")'));
});

// =========================================================
// 25. 公開の時系列順序（バックフィルは公式日で並ぶ）
// =========================================================
test("25: newsAuto は is_backfill 項目を source_published_at で並べる", () => {
  const src = readFileSync(resolve(ROOT, "lib/newsAuto.ts"), "utf8");
  assert.ok(src.includes("row.is_backfill && row.source_published_at"));
});

// =========================================================
// unsupported ソースは探索で unsupported として記録（discoveries 注入なしの単体）
// =========================================================
test("非対応ソースは探索でも unsupported を明示（フェイルを無情報化しない）", async () => {
  // 実ネットワークを避けるため、探索を注入して unsupported 行を確認。
  const r = await runBackfill({
    from: FROM, to: TO, mode: "dry_run",
    deps: {
      admin: null,
      discoveries: [
        { sourceId: "ato-whm-tax-rates", organisation: "ATO", sourceType: "none", status: "unsupported", detail: "historical_backfill_unsupported", candidates: [] },
      ],
    },
  });
  assert.equal(r.sourcesUnsupported, 1);
  assert.equal(r.sources[0].supported, false);
});
