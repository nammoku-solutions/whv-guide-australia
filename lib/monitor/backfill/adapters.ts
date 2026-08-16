/**
 * 歴史的ソースアダプタ。ソース固有のパースをここに隔離し、既存の fetch/extract を
 * 再利用する。政府ドメインを再帰クロールしない（1 ソース = 1 一覧ページ/フィード＋
 * 範囲内エントリの本文のみ）。
 *
 * 実装:
 *   - RSS/Atom アダプタ: フィードの全エントリ（日付つき）を取得。
 *   - アーカイブ/ニュース一覧アダプタ: 公式一覧ページの「日付つきリンク」を抽出。
 */

import { monitorConfig } from "../config";
import { fetchSource } from "../fetch";
import { extractHtml } from "../extract";
import { parseOfficialDate, inRange } from "./dates";
import type {
  AdapterDeps,
  HistoricalCandidate,
  HistoricalSourceAdapter,
  SourceDiscovery,
} from "./types";
import type { SourceDefinition } from "../types";

const ENTRY_FETCH_DELAY_MS = Math.min(monitorConfig.sourceDelayMs, 1200);

/** 一覧ページで無視する（明らかに記事でない）リンクの手掛かり。 */
const NON_ARTICLE_HINTS = [
  "login", "register", "privacy", "accessibility", "copyright", "disclaimer",
  "subscribe", "facebook.com", "twitter.com", "x.com", "linkedin", "instagram",
  "youtube", "?page=", "conditions-of-use", "sitemap", "contact-us", "glossary",
  "javascript:", "mailto:", "tel:",
];

/** 英語月名を含む日付トークン（"22 Jun 2026" / "22 June 2026"）。 */
const DATE_TOKEN_RE =
  /\b\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{4}\b|\b\d{4}-\d{2}-\d{2}\b/gi;

const ANCHOR_RE = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8211;|&ndash;/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function absoluteUrl(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

type RawEntry = { title: string; url: string; iso: string; summary: string };

/**
 * 公式一覧/アーカイブ HTML から「日付つきリンク」を抽出する（決定的・best-effort）。
 * 各アンカーに、位置が最も近い日付トークンを対応づける。
 */
export function parseArchiveEntries(html: string, baseUrl: string): RawEntry[] {
  const cleaned = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ");

  // 日付トークンの位置を収集。
  const dates: { pos: number; iso: string }[] = [];
  for (const m of cleaned.matchAll(DATE_TOKEN_RE)) {
    const iso = parseOfficialDate(m[0]);
    if (iso) dates.push({ pos: m.index ?? 0, iso });
  }

  const entries: RawEntry[] = [];
  const seen = new Set<string>();
  for (const m of cleaned.matchAll(ANCHOR_RE)) {
    const href = m[1];
    const text = stripTags(m[2]);
    if (text.length < 12) continue; // ナビ・アイコン等の短いリンクを除外
    const lowHref = href.toLowerCase();
    if (NON_ARTICLE_HINTS.some((h) => lowHref.includes(h))) continue;
    const url = absoluteUrl(href, baseUrl);
    if (seen.has(url)) continue;

    // 最も近い日付トークン（600 文字以内）を対応づける。
    const pos = m.index ?? 0;
    let best: { dist: number; iso: string } | null = null;
    for (const d of dates) {
      const dist = Math.abs(d.pos - pos);
      if (dist <= 600 && (!best || dist < best.dist)) best = { dist, iso: d.iso };
    }
    if (!best) continue; // 日付が対応づかないリンクは候補にしない（推測しない）
    seen.add(url);
    entries.push({ title: text, url, iso: best.iso, summary: "" });
  }
  return entries;
}

/** RSS/Atom の全エントリを抽出する（日付つき）。 */
export function parseFeedEntries(xml: string): RawEntry[] {
  const entries: RawEntry[] = [];
  const blockRe = /<(item|entry)\b[\s\S]*?<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(xml)) !== null) {
    const block = m[0];
    const title = stripTags(pickTag(block, "title"));
    const link = pickLink(block);
    const dateRaw =
      pickTag(block, "pubDate") ||
      pickTag(block, "published") ||
      pickTag(block, "updated") ||
      pickTag(block, "dc:date") ||
      "";
    const iso = parseOfficialDate(dateRaw);
    const summary = stripTags(pickTag(block, "description") || pickTag(block, "summary") || pickTag(block, "content"));
    if (!title || !link || !iso) continue; // 日付が無いエントリは推測しない
    entries.push({ title, url: link, iso, summary });
  }
  return entries;
}

function pickTag(block: string, tag: string): string {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const mm = block.match(re);
  if (!mm) return "";
  let inner = mm[1].trim();
  const cdata = inner.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  if (cdata) inner = cdata[1];
  return inner;
}

function pickLink(block: string): string {
  const atom = block.match(/<link\b[^>]*href=["']([^"']+)["']/i);
  if (atom) return atom[1];
  const rss = block.match(/<link\b[^>]*>([\s\S]*?)<\/link>/i);
  return rss ? stripTags(rss[1]) : "";
}

/** 公式の「最終更新日」を本文から拾う（あれば, 任意）。 */
function pickUpdatedAt(rawHtml: string): string | undefined {
  const m = rawHtml.match(/last updated[:\s]*([0-9]{1,2}\s+[A-Za-z]{3,9}\.?\s+[0-9]{4}|[0-9]{4}-[0-9]{2}-[0-9]{2})/i);
  if (!m) return undefined;
  return parseOfficialDate(m[1]) ?? undefined;
}

async function sleep(ms: number): Promise<void> {
  if (ms > 0) await new Promise((r) => setTimeout(r, ms));
}

/** アーカイブ/ニュース一覧アダプタを構築する。 */
export function createArchiveAdapter(
  source: SourceDefinition,
  listUrls: string[],
  maxEntries: number,
): HistoricalSourceAdapter {
  return {
    sourceId: source.sourceId,
    supportsBackfill: true,
    async discoverEntries(from, to, deps: AdapterDeps): Promise<SourceDiscovery> {
      const base: Omit<SourceDiscovery, "status" | "detail" | "candidates"> = {
        sourceId: source.sourceId,
        organisation: source.organisation,
        sourceType: "archive",
      };
      const fetchImpl = deps.fetchImpl ?? fetch;

      // 1. 一覧ページを取得してエントリを収集。
      const rawEntries: RawEntry[] = [];
      for (const listUrl of listUrls) {
        const res = await fetchSource(listUrl, fetchImpl);
        if (res.status !== "success" || !res.raw) {
          // 一覧が取れない場合でも他の listUrl は試す。全滅なら失敗を返す。
          if (listUrls.length === 1) {
            return { ...base, status: mapFetchStatus(res.status), detail: `一覧取得失敗: ${res.status}`, candidates: [] };
          }
          continue;
        }
        rawEntries.push(...parseArchiveEntries(res.raw, listUrl));
        await sleep(ENTRY_FETCH_DELAY_MS);
      }

      if (rawEntries.length === 0) {
        return { ...base, status: "unexpected_structure", detail: "一覧から日付つきリンクを抽出できませんでした（構造変化の可能性）。", candidates: [] };
      }

      // 2. 範囲でフィルタ・上限適用（新しい順）。
      const inRangeEntries = dedupeByUrl(rawEntries)
        .filter((e) => inRange(e.iso, from, to))
        .sort((a, b) => (a.iso < b.iso ? 1 : -1))
        .slice(0, Math.max(1, maxEntries));

      // 3. 各エントリ本文を取得（範囲内のみ・遅延つき）。
      const candidates: HistoricalCandidate[] = [];
      const now = new Date().toISOString();
      for (const e of inRangeEntries) {
        const res = await fetchSource(e.url, fetchImpl);
        let content = "";
        let updatedAt: string | undefined;
        if (res.status === "success" && res.raw) {
          content = extractHtml(res.raw).text;
          updatedAt = pickUpdatedAt(res.raw);
        }
        // 本文が取れない場合でも、一覧の要約があれば最低限の根拠にする。
        const body = content || e.summary;
        if (!body || body.trim().length === 0) {
          await sleep(ENTRY_FETCH_DELAY_MS);
          continue; // 根拠本文なし → グラウンディング不能なのでスキップ
        }
        candidates.push({
          sourceId: source.sourceId,
          sourceOrganisation: source.organisation,
          registrySourceUrl: source.url,
          officialTitle: e.title,
          officialUrl: e.url,
          officialPublishedAt: e.iso,
          officialUpdatedAt: updatedAt,
          content: body,
          sourceType: "archive",
          listSummary: e.summary || undefined,
          discoveredAt: now,
          historicalRangeFrom: from,
          historicalRangeTo: to,
        });
        await sleep(ENTRY_FETCH_DELAY_MS);
      }

      return {
        ...base,
        status: "supported",
        detail: `一覧から ${inRangeEntries.length} 件（範囲内）→ 本文取得 ${candidates.length} 件。`,
        candidates,
      };
    },
  };
}

/** RSS/Atom アダプタを構築する。 */
export function createRssAdapter(
  source: SourceDefinition,
  feedUrl: string,
  maxEntries: number,
): HistoricalSourceAdapter {
  return {
    sourceId: source.sourceId,
    supportsBackfill: true,
    async discoverEntries(from, to, deps: AdapterDeps): Promise<SourceDiscovery> {
      const base: Omit<SourceDiscovery, "status" | "detail" | "candidates"> = {
        sourceId: source.sourceId,
        organisation: source.organisation,
        sourceType: "rss",
      };
      const fetchImpl = deps.fetchImpl ?? fetch;
      const res = await fetchSource(feedUrl, fetchImpl);
      if (res.status !== "success" || !res.raw) {
        return { ...base, status: mapFetchStatus(res.status), detail: `フィード取得失敗: ${res.status}`, candidates: [] };
      }
      const all = parseFeedEntries(res.raw);
      if (all.length === 0) {
        return { ...base, status: "unexpected_structure", detail: "フィードからエントリを抽出できませんでした。", candidates: [] };
      }
      const now = new Date().toISOString();
      const candidates: HistoricalCandidate[] = dedupeByUrl(all)
        .filter((e) => inRange(e.iso, from, to))
        .sort((a, b) => (a.iso < b.iso ? 1 : -1))
        .slice(0, Math.max(1, maxEntries))
        .filter((e) => e.summary && e.summary.trim().length > 0)
        .map((e) => ({
          sourceId: source.sourceId,
          sourceOrganisation: source.organisation,
          registrySourceUrl: source.url,
          officialTitle: e.title,
          officialUrl: e.url,
          officialPublishedAt: e.iso,
          content: e.summary,
          sourceType: "rss" as const,
          listSummary: e.summary,
          discoveredAt: now,
          historicalRangeFrom: from,
          historicalRangeTo: to,
        }));
      return { ...base, status: "supported", detail: `フィードから ${candidates.length} 件（範囲内）。`, candidates };
    },
  };
}

function dedupeByUrl(entries: RawEntry[]): RawEntry[] {
  const seen = new Set<string>();
  const out: RawEntry[] = [];
  for (const e of entries) {
    if (seen.has(e.url)) continue;
    seen.add(e.url);
    out.push(e);
  }
  return out;
}

function mapFetchStatus(s: string): SourceDiscovery["status"] {
  switch (s) {
    case "timeout": return "timeout";
    case "blocked": return "blocked";
    case "parse_error": return "parse_error";
    case "unexpected_structure": return "unexpected_structure";
    default: return "http_error";
  }
}

/**
 * レジストリの historical 設定からアダプタを構築する。
 * 未設定 / method=unsupported のソースは null（＝バックフィル非対応）を返す。
 */
export function buildAdapter(source: SourceDefinition): HistoricalSourceAdapter | null {
  const h = source.historical;
  if (!h || h.method === "unsupported") return null;
  if (h.method === "rss") {
    return createRssAdapter(source, h.feedUrl, h.maxEntries ?? 50);
  }
  const listUrls = [h.listUrl, ...(h.extraListUrls ?? [])];
  return createArchiveAdapter(source, listUrls, h.maxEntries ?? 50);
}
