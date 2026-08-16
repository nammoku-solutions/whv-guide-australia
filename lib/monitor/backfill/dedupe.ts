/**
 * 歴史的バックフィル専用の重複判定（既存の決定的 dedupe を補強）。
 * 3 系統に対して照合する:
 *   1. 手書きニュース（lib/newsData.ts）
 *   2. 既存の自動生成 news_items
 *   3. 同一実行内で既に採用した候補
 *
 * 判定材料: 公式 URL / 正規化タイトル / 公式公開日 / event key / content hash。
 * 意味的類似は必要時のみ（文字バイグラムの Jaccard）で軽量に併用する。
 */

import type { GeneratedNews } from "../types";
import type { ExistingNewsKey } from "../dedupe";

/** 日本語/英語タイトルの正規化（比較用）。 */
export function normaliseTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[\s\u3000]+/g, "")
    .replace(/[、。,.!！?？「」『』（）()【】\-–—:：/]/g, "");
}

/** URL の host+path（末尾スラッシュ除去）。 */
function urlKey(url: string): string | null {
  try {
    const u = new URL(url);
    return `${u.host.toLowerCase()}${u.pathname.toLowerCase().replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

/** 文字バイグラム集合。 */
function bigrams(s: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
}

/** バイグラム Jaccard 類似度（0..1）。 */
export function titleSimilarity(a: string, b: string): number {
  const na = normaliseTitle(a);
  const nb = normaliseTitle(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ba = bigrams(na);
  const bb = bigrams(nb);
  if (ba.size === 0 || bb.size === 0) return 0;
  let inter = 0;
  for (const g of ba) if (bb.has(g)) inter++;
  return inter / (ba.size + bb.size - inter);
}

/** 手書きニュースの照合キー。 */
export type ManualNewsKey = {
  title: string;
  sourceUrl?: string;
  date: string; // YYYY-MM-DD
};

/** 既存 news_items の照合キー（dedupe 用に拡張）。 */
export type DbNewsKey = ExistingNewsKey & {
  title?: string | null;
  sourcePublishedAt?: string | null;
  registrySourceUrl?: string | null;
};

export type BackfillCandidateKey = {
  eventKey: string;
  contentHash: string;
  officialUrl: string;
  registrySourceUrl: string;
  officialPublishedAt: string;
};

export type DuplicateVerdict = {
  duplicate: boolean;
  against: "manual" | "auto" | "in_run" | null;
  reason: string;
};

const TITLE_STRONG = 0.72; // タイトルのみで重複とみなす閾値
const TITLE_MODERATE = 0.5; // URL 一致時に併用する閾値

function sameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

/**
 * 候補が既存/実行内の項目と重複するか判定する（決定的 + 軽量類似）。
 */
export function checkBackfillDuplicate(args: {
  candidate: BackfillCandidateKey;
  generated: GeneratedNews;
  manual: ManualNewsKey[];
  db: DbNewsKey[];
  seen: BackfillCandidateKey[];
  seenTitles: { title: string; date: string }[];
}): DuplicateVerdict {
  const { candidate, generated } = args;
  const candUrls = [urlKey(candidate.officialUrl), urlKey(candidate.registrySourceUrl)].filter(Boolean) as string[];

  // 1. 既存 news_items（決定的キー優先）。
  for (const e of args.db) {
    if (e.eventKey && e.eventKey === candidate.eventKey)
      return { duplicate: true, against: "auto", reason: "event_key 一致" };
    if (e.contentHash && e.contentHash === candidate.contentHash)
      return { duplicate: true, against: "auto", reason: "content_hash 一致" };
    const eUrl = urlKey(e.sourceUrl ?? "") ?? urlKey(e.registrySourceUrl ?? "");
    const urlMatch = eUrl != null && candUrls.includes(eUrl);
    if (e.title) {
      const sim = titleSimilarity(e.title, generated.title);
      if (sim >= TITLE_STRONG) return { duplicate: true, against: "auto", reason: `タイトル類似 ${sim.toFixed(2)}` };
      if (urlMatch && sim >= TITLE_MODERATE && e.sourcePublishedAt && sameMonth(e.sourcePublishedAt.slice(0, 10), candidate.officialPublishedAt))
        return { duplicate: true, against: "auto", reason: `同ソース・同月・タイトル類似 ${sim.toFixed(2)}` };
    }
  }

  // 2. 手書きニュース。
  for (const mn of args.manual) {
    const mUrl = urlKey(mn.sourceUrl ?? "");
    const urlMatch = mUrl != null && candUrls.includes(mUrl);
    const sim = titleSimilarity(mn.title, generated.title);
    if (sim >= TITLE_STRONG) return { duplicate: true, against: "manual", reason: `手書きニュースとタイトル類似 ${sim.toFixed(2)}` };
    if (urlMatch && (sim >= TITLE_MODERATE || sameMonth(mn.date, candidate.officialPublishedAt)))
      return { duplicate: true, against: "manual", reason: "手書きニュースと同ソース・同一イベント" };
  }

  // 3. 同一実行内で既に採用した候補。
  for (const s of args.seen) {
    if (s.eventKey === candidate.eventKey)
      return { duplicate: true, against: "in_run", reason: "実行内 event_key 一致" };
    if (s.contentHash === candidate.contentHash)
      return { duplicate: true, against: "in_run", reason: "実行内 content_hash 一致" };
  }
  for (const st of args.seenTitles) {
    if (titleSimilarity(st.title, generated.title) >= TITLE_STRONG && sameMonth(st.date, candidate.officialPublishedAt))
      return { duplicate: true, against: "in_run", reason: "実行内タイトル類似" };
  }

  return { duplicate: false, against: null, reason: "" };
}
