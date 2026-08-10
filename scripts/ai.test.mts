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
import { evalCases } from "../lib/ai/eval/dataset";
import type { RetrievalCandidate } from "../lib/ai/types";

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
