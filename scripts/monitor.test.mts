/**
 * 監視 & ニュース自動化の決定的部分のテスト（外部 API・DB に接続しない）。
 *   npm run test:monitor
 *
 * 網羅シナリオ: 無変更 / 意味のある変更 / boilerplate のみ / 無関係 / 重複 /
 * 高リスクはレビュー / 低リスク自動公開適格 / 取得失敗 / パーサ構造変化 /
 * 記事影響検出。Gemini 呼び出しはスタブで注入する。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { extractHtml, extractFeed, normaliseText } from "../lib/monitor/extract";
import { contentHash, diffText } from "../lib/monitor/diff";
import { fetchSource } from "../lib/monitor/fetch";
import { decidePublication } from "../lib/monitor/publish";
import { classifyRelevance } from "../lib/monitor/classify";
import { generateNews, checkGrounding } from "../lib/monitor/generate";
import { buildEventKey, buildSlug, isDuplicate } from "../lib/monitor/dedupe";
import { analyzeArticleImpact } from "../lib/monitor/impact";
import { getEnabledSources, getSourceById } from "../lib/monitor/registry";
import type { SourceDefinition } from "../lib/monitor/types";
import type { Article } from "../types/article";

const HTML_A = `<!doctype html><html><head><title>t</title><style>.x{}</style></head>
<body><nav>Home Menu Skip to content</nav><main>
<h1>Working Holiday visa</h1>
<p>The first Working Holiday visa costs 650 AUD.</p>
<p>You must be aged 18 to 30 years.</p>
</main><footer>Copyright 2026</footer></body></html>`;

// 料金だけが変わった「意味のある変更」。
const HTML_B = HTML_A.replace("650 AUD", "840 AUD");

// nav 文言だけ変わった「boilerplate のみの変更」。
const HTML_BOILER = HTML_A.replace("Home Menu Skip to content", "Home Menu About Skip to content");

function sampleSource(over: Partial<SourceDefinition> = {}): SourceDefinition {
  return {
    sourceId: "test-src",
    organisation: "Department of Home Affairs",
    sourceName: "Working Holiday visa (subclass 417)",
    url: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/work-holiday-417",
    category: "visa",
    changeGroup: "visa",
    riskLevel: "high",
    monitoringMethod: "html",
    enabled: true,
    relatedCategories: ["visa", "preparation"],
    autoPublishEligibility: false,
    ...over,
  };
}

// ---- 抽出・正規化 ----
test("extract: nav/footer/style is stripped, content kept", () => {
  const { text } = extractHtml(HTML_A);
  assert.ok(text.includes("Working Holiday visa"));
  assert.ok(text.includes("650 AUD"));
  assert.ok(!text.toLowerCase().includes("skip to content"));
  assert.ok(!text.toLowerCase().includes("copyright"));
});

test("normaliseText: whitespace normalised deterministically", () => {
  assert.equal(normaliseText("  a \n\n  a\n b  "), "a\nb");
});

// ---- ハッシュ / 差分（決定的変更検知） ----
test("unchanged source: identical extracted text => identical hash", () => {
  const a = extractHtml(HTML_A).text;
  const a2 = extractHtml(HTML_A).text;
  assert.equal(contentHash(a), contentHash(a2));
});

test("meaningful change: fee change alters hash and diff", () => {
  const a = extractHtml(HTML_A).text;
  const b = extractHtml(HTML_B).text;
  assert.notEqual(contentHash(a), contentHash(b));
  const d = diffText(a, b);
  assert.ok(d.added > 0 || d.removed > 0);
  assert.ok(d.changedChars > 0);
});

test("boilerplate-only change: main content hash is stable", () => {
  // <main> だけを見るため nav の揺れは本文ハッシュに影響しない。
  const a = extractHtml(HTML_A).text;
  const boiler = extractHtml(HTML_BOILER).text;
  assert.equal(contentHash(a), contentHash(boiler));
});

// ---- フィード抽出 / パーサ構造変化 ----
test("feed extract: rss items parsed; malformed feed yields empty text", () => {
  const rss = `<rss><channel>
    <item><title>Fee update</title><link>https://x/1</link><pubDate>Tue, 01 Jul 2025 00:00:00 GMT</pubDate><description>New fee</description></item>
  </channel></rss>`;
  const feed = extractFeed(rss);
  assert.ok(feed.text.includes("Fee update"));
  assert.equal(feed.latestUrl, "https://x/1");
  // 構造が壊れた（item が無い）場合は空 → 呼び出し側が unexpected_structure と判断できる。
  assert.equal(extractFeed("<html>not a feed</html>").text, "");
});

// ---- 取得失敗（決して「変更なし」に丸めない） ----
test("fetch failure: http 500 => http_error, not success", async () => {
  const fake = (async () =>
    new Response("err", { status: 500 })) as unknown as typeof fetch;
  const r = await fetchSource("https://example.gov.au", fake);
  assert.equal(r.status, "http_error");
});

test("fetch failure: 429 => blocked", async () => {
  const fake = (async () =>
    new Response("no", { status: 429 })) as unknown as typeof fetch;
  const r = await fetchSource("https://example.gov.au", fake);
  assert.equal(r.status, "blocked");
});

// ---- 関連度分類（Gemini スタブ注入） ----
test("classify: unrelated layout change routed to unrelated", async () => {
  const caller = async () =>
    JSON.stringify({ relevance: "unrelated", confidence: 0.9, reason: "layout" });
  const res = await classifyRelevance(sampleSource(), "layout tweak", "…", caller);
  assert.equal(res.relevance, "unrelated");
});

test("classify: unparseable model output => safe weakly_relevant/low confidence", async () => {
  const caller = async () => "not json at all";
  const res = await classifyRelevance(sampleSource(), "x", "y", caller);
  assert.equal(res.relevance, "weakly_relevant");
  assert.equal(res.confidence, 0);
});

// ---- ニュース生成 + grounding ----
test("generate: produces structured JP news from stubbed model", async () => {
  const caller = async () =>
    JSON.stringify({
      title: "ビザ申請料が改定",
      summary: "申請料が変更されました。最新額は公式で確認してください。",
      whatChanged: "申請料が変わりました。",
      whoIsAffected: "これから申請する人。",
      whatToDo: "公式ページで最新額を確認。",
      sourcePublishedAt: "2025-07-01",
      confidence: 0.8,
    });
  const news = await generateNews(sampleSource(), "diff", "official text 840", caller);
  assert.ok(news);
  assert.equal(news?.sourcePublishedAt, "2025-07-01");
});

test("grounding: hallucinated number (not in source) fails grounding", () => {
  const news = {
    title: "t",
    summary: "申請料は 840 AUD になりました。",
    whatChanged: "",
    whoIsAffected: "",
    whatToDo: "",
    confidence: 0.9,
  };
  assert.equal(checkGrounding(news, "The fee changed. Check the official page."), false);
  assert.equal(checkGrounding(news, "The fee is now 840 AUD."), true);
});

// ---- 重複検知 ----
test("dedupe: same event key => duplicate", () => {
  const src = sampleSource();
  const news = {
    title: "ビザ申請料が改定",
    summary: "s",
    whatChanged: "",
    whoIsAffected: "",
    whatToDo: "",
    sourcePublishedAt: "2025-07-01",
    confidence: 0.8,
  };
  const key = buildEventKey(src, news);
  const slug = buildSlug(src, news);
  assert.ok(slug.startsWith("update-visa-2025-07-01"));
  const dup = isDuplicate(
    { eventKey: key, contentHash: "h", sourceUrl: src.url },
    [{ eventKey: key, contentHash: null, sourceUrl: src.url }],
  );
  assert.equal(dup, true);
});

// ---- 公開ポリシー ----
test("publish: high-risk topic always routes to review by default", () => {
  const d = decidePublication({
    source: sampleSource({ riskLevel: "high", autoPublishEligibility: false }),
    riskLevel: "high",
    relevance: "highly_relevant",
    confidence: 0.95,
    groundingOk: true,
    meaningfulChange: true,
    isDuplicate: false,
    sourceUrl: "https://immi.homeaffairs.gov.au/x",
  });
  assert.equal(d.status, "review_required");
});

test("publish: low-risk eligible meaningful change auto-publishes", () => {
  const d = decidePublication({
    source: sampleSource({ riskLevel: "low", autoPublishEligibility: true }),
    riskLevel: "low",
    relevance: "relevant",
    confidence: 0.9,
    groundingOk: true,
    meaningfulChange: true,
    isDuplicate: false,
    sourceUrl: "https://www.ato.gov.au/x",
  });
  assert.equal(d.status, "published");
  assert.equal(d.mode, "auto");
});

test("publish: failing grounding blocks auto-publish", () => {
  const d = decidePublication({
    source: sampleSource({ riskLevel: "low", autoPublishEligibility: true }),
    riskLevel: "low",
    relevance: "relevant",
    confidence: 0.9,
    groundingOk: false,
    meaningfulChange: true,
    isDuplicate: false,
    sourceUrl: "https://www.ato.gov.au/x",
  });
  assert.equal(d.status, "review_required");
});

// ---- 記事影響検出 ----
test("impact: article citing the changed URL is flagged requires_update", () => {
  const src = sampleSource({ riskLevel: "high" });
  const articles: Article[] = [
    {
      id: "a1",
      title: "ワーホリビザ申請",
      slug: "visa-application",
      category: "visa",
      description: "d",
      content: ["c"],
      steps: [],
      relatedSlugs: [],
      updatedAt: "2026-01-01",
      published: true,
      verifiedAt: "2026-01-01",
      officialSources: [{ label: "HA", url: src.url }],
    } as Article,
    {
      id: "a2",
      title: "無関係な記事",
      slug: "food-guide",
      category: "food",
      description: "d",
      content: ["c"],
      steps: [],
      relatedSlugs: [],
      updatedAt: "2026-01-01",
      published: true,
    } as Article,
  ];
  const impacts = analyzeArticleImpact(src, articles);
  assert.equal(impacts.length, 1);
  assert.equal(impacts[0].articleId, "a1");
  assert.equal(impacts[0].impactLevel, "requires_update");
});

// ---- レジストリ健全性 ----
test("registry: all enabled sources have valid https official URLs", () => {
  for (const s of getEnabledSources()) {
    const u = new URL(s.url);
    assert.equal(u.protocol, "https:", `${s.sourceId} must be https`);
    assert.ok(u.host.endsWith(".gov.au"), `${s.sourceId} must be a .gov.au source`);
    assert.ok(s.relatedCategories.length > 0, `${s.sourceId} needs relatedCategories`);
  }
});

test("registry: high-risk sources are never auto-publish eligible", () => {
  for (const s of getEnabledSources()) {
    if (s.riskLevel === "high") {
      assert.equal(
        s.autoPublishEligibility,
        false,
        `${s.sourceId} high-risk must not be auto-publish eligible`,
      );
    }
  }
});

test("registry: getSourceById resolves known id", () => {
  assert.ok(getSourceById("ato-whm-tax-rates"));
  assert.equal(getSourceById("does-not-exist"), undefined);
});
