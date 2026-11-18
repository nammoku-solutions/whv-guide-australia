import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ArticleExamples } from "../components/articles/ArticleExamples";
import { articles } from "../lib/content/articles/index";
import type { ArticleLink } from "../types/article";

const publicArticles = articles.filter((a) => a.published && (!a.status || a.status === "published"));
const slugs = new Set(publicArticles.map((article) => article.slug));
const bySlug = new Map(publicArticles.map((article) => [article.slug, article]));
const assisted = publicArticles.filter((a) => a.procedure);

test("procedures have preparation, meaningful steps and a completion check", () => {
  assert.ok(assisted.length > 0);
  for (const { slug, procedure, steps } of assisted) {
    assert.ok(procedure, slug);
    assert.ok(procedure.completion.trim(), slug);
    assert.ok(procedure.preparation.length > 0, slug);
    assert.equal(new Set(procedure.preparation.map((group) => group.title)).size, procedure.preparation.length, slug);
    for (const { title, items } of procedure.preparation) {
      assert.ok(title.trim() && items.length && items.every((item) => item.trim()), slug);
    }
    assert.ok(steps.length >= 3, slug);
    assert.ok(steps.some((step) => step.links?.length), slug);
    assert.equal(new Set(steps.map((step) => step.title)).size, steps.length, slug);
    for (const step of steps) {
      assert.ok(step.title.trim() && step.description.trim(), slug);
      assert.ok(step.checklist?.every((item) => item.trim()) ?? true, slug);
    }
  }
});

function assertSafeLinks(links: ArticleLink[], slug: string) {
  assert.equal(new Set(links.map((link) => link.url)).size, links.length, slug);
  for (const link of links) {
    assert.ok(link.label.trim(), slug);
    const local = /^\/guides\/([a-z0-9-]+)$/.exec(link.url);
    if (local) {
      assert.ok(slugs.has(local[1]), `${slug}: ${link.url}`);
    } else {
      const parsed = new URL(link.url);
      assert.ok(parsed.protocol === "https:" && !parsed.username && !parsed.password, slug);
    }
  }
}

test("steps and examples link to public guides or HTTPS destinations", () => {
  for (const { slug, steps, examples } of publicArticles) {
    for (const step of steps) assertSafeLinks(step.links ?? [], slug);
    for (const item of examples?.items ?? []) assertSafeLinks(item.links ?? [], slug);
  }
});

test("comparison examples are independently titled and contain actionable details", () => {
  for (const slug of ["insurance-guide", "bank-comparison", "sim-guide", "housing-guide", "jobs-guide", "uber-eats-guide", "visa-application", "abn-guide", "rsa-state-guide"]) {
    assert.ok(bySlug.get(slug)?.examples, slug);
  }
  for (const { slug, examples } of publicArticles) {
    if (!examples) continue;
    assert.ok(examples.title.trim() && examples.items.length >= 2, slug);
    assert.equal(new Set(examples.items.map((item) => item.title)).size, examples.items.length, slug);
    for (const { title, summary, facts, details } of examples.items) {
      assert.ok(title.trim() && summary.trim(), slug);
      assert.ok(details.length > 0 && details.every((detail) => detail.trim()), slug);
      assert.ok(facts?.every(({ label, value }) => label.trim() && value.trim()) ?? true, slug);
    }
  }
});

test("insurance examples render as a numbered list with separate prices and source links", () => {
  const section = bySlug.get("insurance-guide")?.examples;
  assert.ok(section);
  const html = renderToStaticMarkup(createElement(ArticleExamples, { section }));
  assert.match(html, /<section id="article-examples" aria-labelledby="article-examples-title"/);
  assert.match(html, /<ol role="list"/);
  assert.equal([...html.matchAll(/<h3(?: |>)/g)].length, 3);
  for (const expected of ["Bupa Australia", "たびほ", "Allianz Care Australia", "216,660円", "現行価格ではありません", "公式見積もり"]) {
    assert.ok(html.includes(expected), expected);
  }
});

test("critical workflows have the corresponding official action links", () => {
  for (const [slug, domain, path] of [
    ["visa-application", "online.immi.gov.au", "/"],
    ["second-visa-guide", "immi.homeaffairs.gov.au", "/programs-subsite/files/whm-upcoming-changes-flow-chart.pdf"],
    ["tfn-guide", "www.ato.gov.au", "/forms-and-instructions/tfn-application-for-permanent-migrants-and-temporary-visitors"],
    ["abn-guide", "www.abr.gov.au", "/business-super-funds-charities/applying-abn"],
    ["uber-eats-guide", "www.uber.com", "/au/en/deliver/"],
    ["doordash-guide", "dasher.doordash.com", "/en-au"],
    ["jobs-guide", "www.fairwork.gov.au", "/starting-employment/unpaid-work/unpaid-trials"],
  ]) {
    const article = bySlug.get(slug);
    assert.ok(article?.procedure);
    assert.ok(article.steps.flatMap((step) => step.links ?? []).some((link) => {
      const url = new URL(link.url, "https://example.invalid");
      return url.hostname === domain && url.pathname === path;
    }), slug);
  }
});
