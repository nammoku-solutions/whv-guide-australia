/**
 * AI パイプラインの決定的部分（ルーター・スコープ・ツール推薦・チャンク化）の
 * テスト。外部API・DBには接続しない。
 *   npm run test:ai
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { routeQuestion } from "../lib/ai/router";
import { recommendTools } from "../lib/ai/recommendations/tools";
import { buildAllChunks, getIndexableArticles } from "../lib/ai/content-source";
import { buildSources } from "../lib/ai/recommendations/articles";
import {
  extractKeywordTerms,
  hasStrongKeyword,
} from "../lib/ai/retrieval/keyword";
import { rankFusion } from "../lib/ai/retrieval/hybrid";
import { evalCases } from "../lib/ai/eval/dataset";
import type { RetrievalCandidate } from "../lib/ai/types";
import { parseListingQuery, detectListingIntent } from "../lib/ai/capabilities/filters";
import {
  getMyApplications,
  getMySavedItems,
  getMyNotifications,
  getMy88DayProgress,
  findRelevantSiteTools,
} from "../lib/ai/capabilities";
import type { AuthContext } from "../lib/ai/types";
import { buildStructuredContextBlock } from "../lib/ai/generation/prompts";
import { dedupeActions, actions as trustedActions } from "../lib/ai/actions";

test("router: out-of-scope questions are classified OUT_OF_SCOPE", () => {
  for (const c of evalCases.filter((e) => e.expectedRoute === "OUT_OF_SCOPE")) {
    assert.equal(
      routeQuestion(c.question).route,
      "OUT_OF_SCOPE",
      `expected OUT_OF_SCOPE for: ${c.question}`,
    );
  }
});

test("router: in-scope questions are never OUT_OF_SCOPE", () => {
  for (const c of evalCases.filter((e) => e.expectedRoute !== "OUT_OF_SCOPE")) {
    assert.notEqual(
      routeQuestion(c.question).route,
      "OUT_OF_SCOPE",
      `should be in-scope: ${c.question}`,
    );
  }
});

test("tools: expected tool is recommended when specified", () => {
  for (const c of evalCases) {
    if (!c.expectedToolSlug) continue;
    const recs = recommendTools(c.question);
    assert.ok(
      recs.some((r) => r.id === c.expectedToolSlug),
      `expected tool ${c.expectedToolSlug} for: ${c.question} (got ${recs
        .map((r) => r.id)
        .join(",")})`,
    );
  }
});

test("tools: recommendations only use real registry routes", () => {
  const recs = recommendTools("88日を計算して郵便番号も確認したい、レジュメも");
  for (const r of recs) {
    assert.ok(r.url.startsWith("/"), "tool url must be an internal route");
    assert.ok(r.name.length > 0);
  }
});

test("chunking: only published articles are indexed and metadata is complete", () => {
  const articles = getIndexableArticles();
  assert.ok(articles.length > 0, "expected at least one published article");
  for (const a of articles) {
    assert.equal(a.published, true);
  }

  const chunks = buildAllChunks();
  assert.ok(chunks.length >= articles.length, "expected chunks for articles");
  for (const chunk of chunks.slice(0, 50)) {
    assert.ok(chunk.chunkId.includes("::"));
    assert.ok(chunk.title.length > 0);
    assert.ok(chunk.url.startsWith("/guides/"));
    assert.ok(chunk.content.length > 0);
    assert.ok(chunk.contentHash.length > 0);
    assert.ok(["low", "medium", "high"].includes(chunk.riskLevel));
  }
});

test("chunking: content hash is stable for identical content", () => {
  const a = buildAllChunks();
  const b = buildAllChunks();
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) {
    assert.equal(a[i].contentHash, b[i].contentHash);
  }
});

test("sources: dedupe by url and cap count", () => {
  const cand: RetrievalCandidate[] = [
    { chunkId: "x::0", articleId: "1", title: "A", slug: "a", url: "/guides/a", category: "visa", heading: "h", content: "c", riskLevel: "low", score: 0.9 },
    { chunkId: "x::1", articleId: "1", title: "A", slug: "a", url: "/guides/a", category: "visa", heading: "h2", content: "c", riskLevel: "low", score: 0.8 },
    { chunkId: "y::0", articleId: "2", title: "B", slug: "b", url: "/guides/b", category: "jobs", heading: "h", content: "c", riskLevel: "low", score: 0.7 },
  ];
  const sources = buildSources(cand);
  assert.equal(sources.length, 2, "duplicate urls should be removed");
  assert.deepEqual(
    sources.map((s) => s.url),
    ["/guides/a", "/guides/b"],
  );
});

// --- Phase 2: keyword extraction / synonyms / strong-term / RRF ---

test("keyword: exact acronym & number queries extract the right terms", () => {
  const cases: Array<[string, string[]]> = [
    ["TFNとは？", ["tfn"]],
    ["417と462の違い", ["417", "462"]],
    ["ABNで働く場合", ["abn"]],
    ["Rego 更新", ["rego"]],
    ["DASP 申請", ["dasp"]],
  ];
  for (const [q, expected] of cases) {
    const terms = extractKeywordTerms(q).map((t) => t.toLowerCase());
    for (const e of expected) {
      assert.ok(
        terms.includes(e),
        `expected term "${e}" from "${q}" (got ${terms.join(",")})`,
      );
    }
  }
});

test("keyword: domain synonyms expand across languages", () => {
  const superTerms = extractKeywordTerms("スーパーを返金してもらう方法").map((t) =>
    t.toLowerCase(),
  );
  assert.ok(superTerms.includes("superannuation"), "スーパー -> Superannuation");
  assert.ok(superTerms.includes("返金"), "keeps JA content word 返金");

  const tfnTerms = extractKeywordTerms("TFNの申請方法").map((t) => t.toLowerCase());
  assert.ok(tfnTerms.includes("タックスファイルナンバー"), "TFN -> JA synonym");
});

test("keyword: strong-term detection distinguishes exact vs NL queries", () => {
  assert.equal(hasStrongKeyword("Rego 更新"), true);
  assert.equal(hasStrongKeyword("417と462の違い"), true);
  assert.equal(hasStrongKeyword("スーパーの返金"), true, "domain synonym counts");
  assert.equal(
    hasStrongKeyword("オーストラリアで仕事を始める前に必要な手続き"),
    false,
    "plain NL query has no strong exact term",
  );
});

test("keyword: natural-language query extracts meaningful content words", () => {
  const terms = extractKeywordTerms(
    "オーストラリアで仕事を始める前に必要な手続きを教えて",
  );
  assert.ok(terms.length > 0);
  assert.ok(
    terms.some((t) => t.includes("仕事")),
    `expected a work-related term (got ${terms.join(",")})`,
  );
  // particles / suffixes must be dropped
  assert.ok(!terms.includes("を"));
  assert.ok(!terms.includes("方法"));
});

test("hybrid: RRF fuses ranks and dedupes shared chunks", () => {
  const mk = (id: string, score: number): RetrievalCandidate => ({
    chunkId: id,
    articleId: id.split("::")[0],
    title: id,
    slug: id.split("::")[0],
    url: `/guides/${id.split("::")[0]}`,
    category: "visa",
    heading: "h",
    content: "c",
    riskLevel: "low",
    score,
  });
  const semantic = [mk("a::0", 0.9), mk("b::0", 0.8), mk("c::0", 0.7)];
  const keyword = [mk("c::0", 5), mk("d::0", 4)];
  const fused = rankFusion(semantic, keyword, 60);

  const ids = fused.map((f) => f.chunkId);
  assert.equal(new Set(ids).size, ids.length, "no duplicate chunks after fusion");
  // c::0 appears in both lists -> should rank at/near the top via RRF.
  assert.equal(ids[0], "c::0", "chunk present in both lists ranks first");
  assert.ok(ids.includes("d::0"), "keyword-only chunk is included");
});

// =====================================================================
// Phase 6: 構造化ライブデータ統合（ルーティング・フィルタ・ケイパビリティ・認可）
// =====================================================================

const ANON: AuthContext = { userId: null, isAuthenticated: false, isModerator: false };
const USER_A: AuthContext = { userId: "user-a", isAuthenticated: true, isModerator: false };

test("router: extended route types are classified deterministically", () => {
  const cases: Array<[string, string]> = [
    ["Bondって何？", "ARTICLE"],
    ["88日カレンダーどこ？", "TOOL"],
    ["Gattonで求人ある？", "LISTING"],
    ["Brisbaneで週250ドル以下の部屋ある？", "LISTING"],
    ["QLDで6000ドル以下の車ある？", "LISTING"],
    ["応募してる仕事どうなってる？", "PERSONAL"],
    ["保存してる求人見せて", "PERSONAL"],
    ["何か新しいお知らせある？", "PERSONAL"],
    ["最近417で変更あった？", "CURRENT_UPDATE"],
    ["Gattonの求人とファーム探しの注意点", "MIXED"],
    ["今日の日本株は？", "OUT_OF_SCOPE"],
  ];
  for (const [q, expected] of cases) {
    assert.equal(routeQuestion(q).route, expected, `route for "${q}"`);
  }
});

test("router: listing sub-intent detection", () => {
  assert.equal(routeQuestion("Gattonで求人ある？").listingIntent, "job");
  assert.equal(routeQuestion("Brisbaneで部屋ある？").listingIntent, "housing");
  assert.equal(routeQuestion("QLDで車ある？").listingIntent, "vehicle");
});

test("router: personal-intent detection maps to the right capability intent", () => {
  assert.equal(routeQuestion("応募してる仕事どうなってる？").personalIntent, "applications");
  assert.equal(routeQuestion("保存してる求人見せて").personalIntent, "saved");
  assert.equal(routeQuestion("何か新しいお知らせある？").personalIntent, "notifications");
});

test("router: eval dataset routes match expected (extended types)", () => {
  // 決定的ルーターが厳密に生成する構造化ルートのみを対象にする（レガシーの
  // ツール推薦系 MIXED はルート=ARTICLE でもツールを返す設計のため対象外）。
  const strict = evalCases.filter(
    (c) =>
      c.expectedCapability != null ||
      c.expectedListingIntent != null ||
      c.expectedPersonalIntent != null ||
      ["LISTING", "PERSONAL", "CURRENT_UPDATE", "TOOL"].includes(c.expectedRoute),
  );
  for (const c of strict) {
    const decision = routeQuestion(c.question);
    assert.equal(
      decision.route,
      c.expectedRoute,
      `expected ${c.expectedRoute} for "${c.question}" (got ${decision.route})`,
    );
    if (c.expectedListingIntent) {
      assert.equal(decision.listingIntent, c.expectedListingIntent, `listingIntent for "${c.question}"`);
    }
    if (c.expectedPersonalIntent) {
      assert.equal(decision.personalIntent, c.expectedPersonalIntent, `personalIntent for "${c.question}"`);
    }
  }
});

test("filters: parse location / state / amount / transmission from NL", () => {
  const a = parseListingQuery("Gattonで求人ある？");
  assert.equal(a.location, "Gatton");

  const b = parseListingQuery("Brisbaneで週250ドル以下の部屋ある？");
  assert.equal(b.location, "Brisbane");
  assert.equal(b.maxAmount, 250);

  const c = parseListingQuery("QLDで6000ドル以下の車ある？");
  assert.equal(c.state, "QLD");
  assert.equal(c.maxAmount, 6000);

  const d = parseListingQuery("オートマの車が欲しい");
  assert.equal(d.transmission, "automatic");
  const e = parseListingQuery("マニュアル車ある？");
  assert.equal(e.transmission, "manual");
});

test("filters: detectListingIntent classifies job/housing/vehicle", () => {
  assert.equal(detectListingIntent("Gattonで求人ある？"), "job");
  assert.equal(detectListingIntent("部屋を探してる"), "housing");
  assert.equal(detectListingIntent("中古車が欲しい"), "vehicle");
});

test("security: personal capabilities deny anonymous callers (authRequired)", async () => {
  const apps = await getMyApplications(ANON);
  assert.equal(apps.authRequired, true, "applications require auth");
  assert.equal(apps.count, 0);
  assert.equal(apps.cards.length, 0, "no cards leaked to anon");
  assert.equal(apps.evidence.length, 0, "no evidence leaked to anon");

  const saved = await getMySavedItems(ANON);
  assert.equal(saved.authRequired, true, "saved require auth");
  assert.equal(saved.evidence.length, 0);

  const notes = await getMyNotifications(ANON);
  assert.equal(notes.authRequired, true, "notifications require auth");
  assert.equal(notes.evidence.length, 0);
});

test("security: personal evidence is always marked private (never citable)", async () => {
  const progress = await getMy88DayProgress(USER_A);
  assert.ok(progress.evidence.length > 0);
  for (const e of progress.evidence) {
    assert.equal(e.visibility, "private", "88-day evidence must be private");
    assert.equal(e.url, null, "private evidence has no citable URL");
  }
  // 88-day server data is unavailable (localStorage only) -> links to the tool.
  assert.equal(progress.count, 0);
  assert.ok(
    progress.actions.some((a) => a.url === "/tools/88-day-calculator"),
    "88-day progress must link to the calendar tool",
  );
  const meta = progress.evidence[0].metadata ?? {};
  assert.equal(meta.serverDataAvailable, false);
});

test("tools: findRelevantSiteTools only emits real internal routes", () => {
  const res = findRelevantSiteTools("88日を計算したい");
  assert.ok(res.count > 0);
  for (const c of res.cards) {
    if (c.kind !== "tool") continue;
    assert.ok(c.url.startsWith("/"), "tool card url must be internal");
  }
  for (const a of res.actions) {
    assert.ok(a.url.startsWith("/"), "tool action url must be internal");
  }
});

test("actions: trusted URLs are fixed and dedupe by URL", () => {
  assert.equal(trustedActions.eightyEightCalendar().url, "/tools/88-day-calculator");
  assert.equal(trustedActions.viewJobs().url, "/community/market/job");
  assert.equal(trustedActions.login().url, "/login");
  const deduped = dedupeActions([
    trustedActions.viewJobs(),
    trustedActions.viewJobs(),
    trustedActions.notifications(),
  ]);
  assert.equal(deduped.length, 2, "duplicate action urls removed");
});

test("prompts: structured context labels evidence by kind and never invents URLs", () => {
  const block = buildStructuredContextBlock([
    {
      kind: "listing",
      visibility: "public",
      title: "Farm hand wanted",
      content: "職種: Farm hand / 勤務地: Gatton",
      url: "/community/market/listing/abc",
      sourceId: "listing:abc",
      freshness: "2026-08-01",
      riskLevel: "low",
    },
    {
      kind: "personal",
      visibility: "private",
      title: "あなたの応募状況",
      content: "合計 2 件",
      url: null,
      sourceId: "capability:getMyApplications",
      freshness: "live",
      riskLevel: "low",
    },
  ]);
  assert.ok(block.includes("[ライブ掲載]"), "listing label present");
  assert.ok(block.includes("[あなたの記録]"), "personal label present");
  // Raw URLs must not be embedded in the model context block.
  assert.ok(!block.includes("/community/market/listing/abc"), "URLs stay out of context");
});

