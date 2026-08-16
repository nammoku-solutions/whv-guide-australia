/**
 * 取得した HTML / RSS から「意味のある本文」を決定的に抽出・正規化する。
 * nav / footer / cookie / script / style / ヘッダ等の boilerplate を除去し、
 * 空白を正規化する。ここが決定的であることが変更検知の信頼性の要。
 *
 * 依存を増やさないため、正規表現ベースの軽量抽出にとどめる（政府ページの本文
 * テキストの安定比較が目的で、完全な DOM 解析は不要）。
 */

import { monitorConfig } from "./config";
import type { ExtractedContent, MonitoringMethod } from "./types";

/** 除去するブロック要素（内容ごと丸ごと落とす）。 */
const STRIP_BLOCKS = [
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "nav",
  "header",
  "footer",
  "aside",
  "form",
];

/** boilerplate とみなす行（前方一致・小文字比較）。 */
const BOILERPLATE_LINE_PREFIXES = [
  "skip to",
  "cookie",
  "we use cookies",
  "accept all",
  "manage cookies",
  "print this page",
  "share this page",
  "was this page helpful",
  "back to top",
  "last updated",
  "©",
  "copyright",
];

function stripTag(html: string, tag: string): string {
  const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, "gi");
  let out = html;
  let prev: string;
  // ネストに備えて安定するまで繰り返す（上限つき）。
  let guard = 0;
  do {
    prev = out;
    out = out.replace(re, " ");
    guard++;
  } while (out !== prev && guard < 5);
  // 自己完結しない開始タグの残骸も除去。
  out = out.replace(new RegExp(`<${tag}\\b[^>]*>`, "gi"), " ");
  return out;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => {
      const code = Number.parseInt(d, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : " ";
    });
}

/** 空白・改行を正規化し、boilerplate 行を落とす。 */
export function normaliseText(text: string): string {
  const lines = decodeEntities(text)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t\u00a0]+/g, " ").trim())
    .filter((l) => l.length > 0)
    .filter((l) => {
      const lower = l.toLowerCase();
      return !BOILERPLATE_LINE_PREFIXES.some((p) => lower.startsWith(p));
    });
  // 連続重複行を折りたたむ（メニューの繰り返し等のノイズ低減）。
  const deduped: string[] = [];
  for (const l of lines) {
    if (deduped[deduped.length - 1] !== l) deduped.push(l);
  }
  return deduped.join("\n");
}

/** HTML 本文を抽出して正規化する。 */
export function extractHtml(html: string): ExtractedContent {
  let work = html;
  // <main> があれば本文候補として優先。
  const mainMatch = work.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  if (mainMatch && mainMatch[1] && mainMatch[1].length > 400) {
    work = mainMatch[1];
  }
  for (const tag of STRIP_BLOCKS) work = stripTag(work, tag);
  // コメント除去。
  work = work.replace(/<!--[\s\S]*?-->/g, " ");
  // ブロック境界を改行に、残りのタグを除去。
  work = work
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|br)\s*>/gi, "\n")
    .replace(/<br\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const text = normaliseText(work).slice(0, monitorConfig.maxContentChars);
  return { text };
}

/** RSS/Atom を抽出する。最新エントリのメタも拾う。 */
export function extractFeed(xml: string): ExtractedContent {
  const items: {
    title: string;
    link: string;
    date: string;
    summary: string;
  }[] = [];

  const blockRe = /<(item|entry)\b[\s\S]*?<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(xml)) !== null) {
    const block = m[0];
    const title = pickTag(block, "title");
    const link = pickLink(block);
    const date =
      pickTag(block, "pubDate") ||
      pickTag(block, "updated") ||
      pickTag(block, "published") ||
      "";
    const summary = pickTag(block, "description") || pickTag(block, "summary");
    items.push({ title, link, date, summary });
  }

  if (items.length === 0) {
    // フィードとして解釈できない → 呼び出し側が unexpected_structure を判断できるよう空返し。
    return { text: "" };
  }

  const text = items
    .slice(0, 20)
    .map((it) => normaliseText(`${it.title}\n${it.summary}`))
    .filter((t) => t.length > 0)
    .join("\n---\n")
    .slice(0, monitorConfig.maxContentChars);

  const first = items[0];
  const iso = toIso(first.date);
  return {
    text,
    latestTitle: normaliseText(first.title) || undefined,
    latestUrl: first.link || undefined,
    latestPublishedAt: iso,
  };
}

function pickTag(block: string, tag: string): string {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = block.match(re);
  if (!m) return "";
  let inner = m[1].trim();
  const cdata = inner.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  if (cdata) inner = cdata[1];
  return decodeEntities(inner.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function pickLink(block: string): string {
  // Atom: <link href="..."/>; RSS: <link>...</link>
  const atom = block.match(/<link\b[^>]*href=["']([^"']+)["']/i);
  if (atom) return atom[1];
  const rss = block.match(/<link\b[^>]*>([\s\S]*?)<\/link>/i);
  return rss ? rss[1].trim() : "";
}

function toIso(date: string): string | undefined {
  if (!date) return undefined;
  const t = Date.parse(date);
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
}

/** method に応じて抽出する統合エントリ。 */
export function extractContent(
  raw: string,
  method: MonitoringMethod,
): ExtractedContent {
  return method === "rss" ? extractFeed(raw) : extractHtml(raw);
}
