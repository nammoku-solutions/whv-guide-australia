import { createHash } from "node:crypto";
import { extractHtml } from "../../lib/monitor/extract";
import { getEnabledSources } from "../../lib/monitor/registry";
import { isOfficialHost } from "../../lib/monitor/backfill/officialDomains";

type Source = { sourceId: string; sourceName: string; url: string; fetchTimeoutMs?: number };
type Snapshot = { url: string; hash: string; text: string };
type Failure = { title: string; url: string; reason: string };
type Change = { title: string; url: string; added: string[]; removed: string[] };
type Run = {
  checkedAt: string;
  checked: number;
  baselines: number;
  changes: Change[];
  failures: Failure[];
  notified: boolean;
};
export type State = {
  version: 1;
  sources: Record<string, Snapshot>;
  runs: Record<string, Run>;
  missedNotified: Record<string, boolean>;
};
export type WeeklyEvent = { mode: "weekly" | "watchdog"; scheduledTime: string } | { mode: "probe" };
export type Ports = {
  load: () => Promise<{ state: State; etag?: string }>;
  save: (state: State, etag?: string) => Promise<string>;
  notify: (subject: string, message: string) => Promise<void>;
  fetch: typeof fetch;
  now: () => Date;
};

const sourceById = new Map<string, Source>();
for (const s of getEnabledSources()) {
  if (s.monitoringMethod !== "html") continue;
  sourceById.set(s.sourceId, s);
  if (s.historical?.method === "archive") {
    sourceById.set(`${s.sourceId}-news-index`, {
      sourceId: `${s.sourceId}-news-index`, sourceName: `${s.organisation} — news index`,
      url: s.historical.listUrl, fetchTimeoutMs: s.fetchTimeoutMs,
    });
  }
}
for (const s of [
  { sourceId: "homeaffairs-whm-news", sourceName: "Home Affairs — WHM program latest news", url: "https://immi.homeaffairs.gov.au/programs-subsite/Pages/working-holiday-maker/latest-news.aspx" },
  { sourceId: "ato-media-centre", sourceName: "ATO — media centre", url: "https://www.ato.gov.au/media-centre" },
]) sourceById.set(s.sourceId, s);
export const monitoredSources = [...sourceById.values()];

export function emptyState(): State {
  return { version: 1, sources: {}, runs: {}, missedNotified: {} };
}

const MAX_BYTES = 3 * 1024 * 1024;
const TTL_WEEKS = 12;

function officialUrl(url: URL): boolean {
  return url.protocol === "https:" && !url.username && !url.password && !url.port &&
    isOfficialHost(url.hostname);
}

async function limitedText(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("empty response body");
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return text + decoder.decode();
      size += value.byteLength;
      if (size > MAX_BYTES) throw new Error("response exceeded size limit");
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

async function capture(s: Source, fetchImpl: typeof fetch): Promise<Snapshot> {
  let url = new URL(s.url);
  const signal = AbortSignal.timeout(s.fetchTimeoutMs ?? 20_000);
  for (let hop = 0; hop <= 4; hop++) {
    if (!officialUrl(url)) throw new Error("redirect outside the official source allowlist");
    const res = await fetchImpl(url, {
      redirect: "manual", signal,
      headers: { "User-Agent": "WHV-Compass-Official-Monitor/1.0 (+https://whv-guide-australia.com/about)", "Accept-Language": "en-AU,en;q=0.9", Accept: "text/html,application/xhtml+xml" },
    });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      await res.body?.cancel();
      const location = res.headers.get("location");
      if (!location) throw new Error("redirect without a destination");
      url = new URL(location, url);
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel();
      throw new Error(`HTTP ${res.status}`);
    }
    if (!/^(text\/html|application\/xhtml\+xml)(?:;|$)/i.test(res.headers.get("content-type") ?? "")) {
      await res.body?.cancel();
      throw new Error("unexpected content type");
    }
    const html = await limitedText(res);
    if (/<title\b[^>]*>\s*(?:access denied|request rejected|just a moment|attention required|verify you are human|service unavailable|page not found|403 forbidden)/i.test(html)) {
      throw new Error("blocked or error page");
    }
    const text = extractHtml(html).text;
    if (text.length < 160) throw new Error("official page text not found");
    // Keep readable evidence, but hash the entire extracted text; late sections still trigger review.
    return { url: url.toString(), hash: createHash("sha256").update(text).digest("hex"), text };
  }
  throw new Error("too many redirects");
}

function excerpts(before: string, after: string): string[] {
  const original = new Set(before.split("\n"));
  return [...new Set(after.split("\n"))].filter((line) => !original.has(line))
    .slice(0, 3).map((line) => line.length <= 240 ? line : `${line.slice(0, 240)}…`);
}

// A single mode can be retried after midnight; key by the Scheduler's nominal invocation date.
function scheduledSunday(scheduledTime: string): string {
  const date = new Date(scheduledTime);
  if (!Number.isFinite(date.getTime())) throw new Error("invalid Scheduler timestamp");
  const local = new Intl.DateTimeFormat("sv-SE", { timeZone: "Australia/Brisbane", dateStyle: "short" }).format(date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(local) || new Date(`${local}T00:00:00Z`).getUTCDay() !== 0) {
    throw new Error("scheduled date must be Sunday in Australia/Brisbane");
  }
  return local;
}

async function inspect(sources: Source[], ports: Ports) {
  const results: ({ source: Source; snapshot: Snapshot } | { source: Source; failure: Failure })[] = [];
  for (let i = 0; i < sources.length; i += 4) {
    results.push(...await Promise.all(sources.slice(i, i + 4).map(async (source) => {
      try {
        return { source, snapshot: await capture(source, ports.fetch) };
      } catch (err) {
        return { source, failure: { title: source.sourceName, url: source.url,
          reason: err instanceof Error ? err.message.slice(0, 140) : "unknown error" } };
      }
    })));
  }
  return results;
}

function compose(week: string, run: Run): string {
  return [
    `確認日（Brisbane）: ${week}`,
    `対象 ${run.checked}件 / 変更候補 ${run.changes.length}件 / 取得エラー ${run.failures.length}件 / 初回記録 ${run.baselines}件`,
    "差分は機械検知です。制度変更・発表日は公式本文で確認してください。公開は行っていません。",
    ...run.failures.map((f) => `\n[取得エラー] ${f.title}\n${f.url}\n${f.reason}`),
    ...run.changes.map((c) => `\n[本文の差分] ${c.title}\n${c.url}\n${[
      ...c.added.map((line) => `+ ${line}`), ...c.removed.map((line) => `- ${line}`),
    ].join("\n") || "行の並び、または取得先が変わりました。"}`),
  ].join("\n");
}

export async function runMonitor(event: WeeklyEvent, ports: Ports, sources = monitoredSources) {
  if (event.mode === "probe") {
    const results = await inspect(sources, ports);
    return { checked: results.length, failures: results.flatMap((r) => "failure" in r ? [r.failure] : []) };
  }
  if (event.mode !== "weekly" && event.mode !== "watchdog") throw new Error("unknown monitor mode");
  const week = scheduledSunday(event.scheduledTime);
  const loaded = await ports.load();
  const { state } = loaded;
  let etag = loaded.etag;
  if (state.version !== 1) throw new Error("unsupported state version");
  let run = state.runs[week];
  if (event.mode === "watchdog" && !run) {
    if (state.missedNotified[week]) return { week, status: "already-reported" };
    await ports.notify("WHV週次監視: 実行記録なし", `${week}（日）19:00 Brisbaneの週次監視が21:00までに結果を記録しませんでした。AWSの実行履歴を確認してください。`);
    state.missedNotified[week] = true;
    await ports.save(state, etag);
    return { week, status: "missed" };
  }
  if (!run) {
    // A stale event must never replace baselines captured by a newer run.
    if (Object.keys(state.runs).some((key) => key > week)) return { week, status: "stale" };
    const results = await inspect(sources, ports);
    run = { checkedAt: ports.now().toISOString(), checked: results.length, baselines: 0, changes: [], failures: [], notified: false };
    for (const r of results) {
      if ("failure" in r) {
        run.failures.push(r.failure);
        continue;
      }
      const prior = state.sources[r.source.sourceId];
      if (!prior) run.baselines++;
      else if (prior.hash !== r.snapshot.hash || prior.url !== r.snapshot.url) {
        run.changes.push({
          title: r.source.sourceName, url: r.snapshot.url,
          added: excerpts(prior.text, r.snapshot.text), removed: excerpts(r.snapshot.text, prior.text),
        });
      }
      state.sources[r.source.sourceId] = r.snapshot;
    }
    run.notified = run.changes.length + run.failures.length === 0;
    state.runs[week] = run;
    for (const table of [state.runs, state.missedNotified]) {
      for (const old of Object.keys(table).sort().slice(0, -TTL_WEEKS)) delete table[old];
    }
    etag = await ports.save(state, etag);
  }
  if (!run.notified) {
    await ports.notify("WHV週次監視: 要確認", compose(week, run));
    run.notified = true;
    await ports.save(state, etag);
  }
  return { week, status: "recorded", checked: run.checked, baselines: run.baselines,
    changes: run.changes.length, failures: run.failures.length };
}
