import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { emptyState, monitoredSources, runMonitor, type State, type Ports } from "./core";

test("deploys the worker without consuming reserved Lambda concurrency", () => {
  const template = JSON.parse(readFileSync(new URL("./template.json", import.meta.url), "utf8"));
  assert.equal(Object.hasOwn(template.Resources.Worker.Properties, "ReservedConcurrentExecutions"), false);
});

const source = monitoredSources.find((s) => s.sourceId === "homeaffairs-whv-417")!;
const times = {
  initial: "2026-11-22T09:00:00.000Z",
  next: "2026-11-29T09:00:00.000Z",
  watchdog: "2026-11-29T11:00:00.000Z",
};
const result = (s: string) => new Response(
  `<main><h1>Working Holiday visa</h1><p>${s}</p><p>${"Details and eligibility, covered in the official policy. ".repeat(9)}</p></main>`,
  { headers: { "content-type": "text/html; charset=utf-8" } },
);
function fixture() {
  let state = emptyState();
  let revision = 0;
  const sent: string[] = [];
  let fetches = 0;
  let response = () => result("The old rule is in effect.");
  let snsDown = false;
  const ports: Ports = {
    async load() { return { state: structuredClone(state), etag: revision ? String(revision) : undefined }; },
    async save(data, etag) {
      assert.equal(etag, revision ? String(revision) : undefined);
      state = structuredClone(data);
      return String(++revision);
    },
    async notify(subject, message) {
      if (snsDown) throw new Error("SNS unavailable");
      sent.push(`${subject}\n${message}`);
    },
    fetch: async (_, init) => {
      assert.equal(init?.redirect, "manual");
      fetches++;
      return response();
    },
    now: () => new Date(times.next),
  };
  return {
    ports, sent, count: () => fetches, state: (): State => state,
    page: (r: () => Response) => { response = r; },
    failNotification: (value: boolean) => { snsDown = value; },
  };
}

test("uses only reviewed sources, including the three priority news channels", () => {
  assert.ok(monitoredSources.length >= 18);
  assert.equal(new Set(monitoredSources.map((s) => s.sourceId)).size, monitoredSources.length);
  for (const url of [
    "https://immi.homeaffairs.gov.au/what-we-do/whm-program/latest-news",
    "https://www.ato.gov.au/rss.aspx?category=1837",
    "https://www.fairwork.gov.au/newsroom/media-releases",
    "https://www.service.nsw.gov.au/services/nsw-driver-licence",
    "https://www.rta.qld.gov.au/starting-a-tenancy/rental-bond",
  ]) assert.ok(monitoredSources.some((s) => s.url === url), url);
});

test("probe accepts short ATO RSS with text/xml and reports only the missing priority channels", async () => {
  const f = fixture();
  const sources = monitoredSources.filter((s) => s.newsChannel);
  const ato = sources.find((s) => s.newsChannel === "Australian Taxation Office")!;
  const fairwork = sources.find((s) => s.newsChannel === "Fair Work Ombudsman")!;
  const out = await runMonitor({ mode: "probe" }, {
    ...f.ports,
    fetch: async (url, init) => {
      if (String(url) === ato.url) {
        assert.match(new Headers(init?.headers).get("accept")!, /text\/xml/);
        return new Response(`<rss version="2.0"><channel><item><title>ATO news</title><link>https://www.ato.gov.au/notice</link></item></channel></rss>`, {
          headers: { "content-type": "text/xml; charset=utf-8" },
        });
      }
      return String(url) === fairwork.url ? new Response(null, { status: 403 }) : result("Official WHM update");
    },
  }, sources);
  assert.ok(out.succeeded && out.missingNewsChannels && Array.isArray(out.failures));
  assert.equal(out.checked, 3);
  assert.ok(out.succeeded.some((s) => s.sourceId === ato.sourceId));
  assert.deepEqual(out.missingNewsChannels, ["Fair Work Ombudsman"]);
  assert.deepEqual(out.failures, [{ title: fairwork.sourceName, url: fairwork.url, reason: "HTTP 403" }]);
  assert.deepEqual(f.state(), emptyState());
  assert.deepEqual(f.sent, []);
});

test("probe does not treat a challenged or unrelated feed as ATO news", async () => {
  const f = fixture();
  const ato = monitoredSources.find((s) => s.newsChannel === "Australian Taxation Office")!;
  for (const body of [
    "<html><title>Access Denied</title></html>",
    "<rss><channel><item><title>Unrelated news</title><link>https://example.com/news</link></item></channel></rss>",
  ]) {
    f.page(() => new Response(body, { headers: { "content-type": "text/xml" } }));
    const out = await runMonitor({ mode: "probe" }, f.ports, [ato]);
    assert.ok(out.succeeded && out.missingNewsChannels && Array.isArray(out.failures));
    assert.ok(out.missingNewsChannels.includes("Australian Taxation Office"));
    assert.equal(out.succeeded.length, 0);
    assert.equal(out.failures.length, 1);
  }
});

test("seed a baseline and record an unchanged week without sending mail", async () => {
  const f = fixture();
  const a = await runMonitor({ mode: "weekly", scheduledTime: times.initial }, f.ports, [source]);
  const b = await runMonitor({ mode: "weekly", scheduledTime: times.next }, f.ports, [source]);
  assert.equal(a.baselines, 1);
  assert.equal(b.changes, 0);
  assert.equal(f.sent.length, 0);
  assert.equal(Object.keys(f.state().runs).length, 2);
});

test("persist changed evidence, notify once, and skip a duplicate run", async () => {
  const f = fixture();
  await runMonitor({ mode: "weekly", scheduledTime: times.initial }, f.ports, [source]);
  f.page(() => result("The specified work rule now differs."));
  await runMonitor({ mode: "weekly", scheduledTime: times.next }, f.ports, [source]);
  await runMonitor({ mode: "weekly", scheduledTime: times.next }, f.ports, [source]);
  assert.equal(f.count(), 2);
  assert.equal(f.sent.length, 1);
  assert.match(f.sent[0], /\+ The specified work rule now differs/);
  assert.match(f.sent[0], /- The old rule is in effect/);
});

test("guard against off-domain redirects, protect the prior snapshot and report the failure", async () => {
  const f = fixture();
  await runMonitor({ mode: "weekly", scheduledTime: times.initial }, f.ports, [source]);
  const old = f.state().sources[source.sourceId].hash;
  f.page(() => new Response("", { status: 302, headers: { Location: "https://example.com/" } }));
  await runMonitor({ mode: "weekly", scheduledTime: times.next }, f.ports, [source]);
  assert.equal(f.state().sources[source.sourceId].hash, old);
  assert.equal(f.count(), 2);
  assert.match(f.sent[0], /redirect outside the official source allowlist/);
});

test("a blocked HTML body is an error, not a new baseline or successful probe", async () => {
  const f = fixture();
  f.page(() => new Response("<title>Access Denied</title><body>" + "Blocked. ".repeat(100) + "</body>", {headers: {"content-type":"text/html"}}));
  const outcome = await runMonitor({ mode: "probe" }, f.ports, [source]);
  assert.equal(Array.isArray(outcome.failures) ? outcome.failures.length : outcome.failures, 1);
  assert.deepEqual(f.state(), emptyState());
  assert.deepEqual(f.sent, []);
});

test("watchdog retries an unsent failure notification rather than reporting a missing run", async () => {
  const f = fixture();
  f.page(() => new Response(null, { status: 503 }));
  f.failNotification(true);
  await assert.rejects(runMonitor({ mode: "weekly", scheduledTime: times.next }, f.ports, [source]), /SNS unavailable/);
  assert.equal(f.state().runs["2026-11-29"].notified, false);
  f.failNotification(false);
  await runMonitor({ mode: "watchdog", scheduledTime: times.watchdog }, f.ports, [source]);
  assert.match(f.sent[0], /HTTP 503/);
  assert.equal(f.count(), 1);
  assert.equal(f.state().runs["2026-11-29"].notified, true);
});

test("report a missed execution once without contacting any source", async () => {
  const f = fixture();
  for (let i = 0; i < 2; i++) await runMonitor({ mode: "watchdog", scheduledTime: times.watchdog }, f.ports, [source]);
  assert.equal(f.sent.length, 1);
  assert.match(f.sent[0], /実行記録なし/);
  assert.equal(f.count(), 0);
});

test("reject a non-Sunday event and prevent stale events overwriting the baseline", async () => {
  const f = fixture();
  await assert.rejects(runMonitor({ mode: "weekly", scheduledTime: "2026-11-28T09:00:00Z" }, f.ports, [source]), /Sunday/);
  await runMonitor({ mode: "weekly", scheduledTime: times.next }, f.ports, [source]);
  assert.equal((await runMonitor({ mode: "weekly", scheduledTime: times.initial }, f.ports, [source])).status, "stale");
  assert.equal(f.count(), 1);
});
