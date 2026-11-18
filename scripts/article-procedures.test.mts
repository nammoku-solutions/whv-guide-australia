import assert from "node:assert/strict";
import { test } from "node:test";
import { articles } from "../lib/content/articles/index";

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

test("steps link to public guide slugs or HTTPS destinations, never arbitrary schemes", () => {
  for (const { slug, steps } of publicArticles) {
    for (const step of steps) {
      const links = step.links ?? [];
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
