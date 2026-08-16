/**
 * ニュースの重複防止。ソース URL・content hash・イベント同一性（タイトル/日付）で判定。
 * 類似度は必要な場合のみ（ここでは決定的キーで十分。過剰な計算を避ける）。
 */

import type { SourceDefinition, GeneratedNews } from "./types";

/** 日本語/英語のタイトルを比較用に正規化する。 */
function normaliseTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[\s\u3000]+/g, "")
    .replace(/[、。,.!！?？「」『』（）()【】\-–—:：]/g, "");
}

/**
 * イベント同一性キー。ソース＋正規化タイトル＋（あれば）公開日で構成する。
 * 同じ制度改定を繰り返しニュース化しないための決定的キー。
 */
export function buildEventKey(
  source: SourceDefinition,
  news: GeneratedNews,
): string {
  const datePart = news.sourcePublishedAt ?? "";
  return `${source.sourceId}::${normaliseTitle(news.title)}::${datePart}`;
}

/** URL からニュースの slug を決定的に作る。 */
export function buildSlug(source: SourceDefinition, news: GeneratedNews): string {
  const base = normaliseTitle(news.title).replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  const datePart = news.sourcePublishedAt ?? new Date().toISOString().slice(0, 10);
  const suffix = base && /[a-z0-9]/.test(base) ? base : source.sourceId;
  return `update-${source.changeGroup}-${datePart}-${suffix}`
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export type ExistingNewsKey = {
  eventKey: string | null;
  contentHash: string | null;
  sourceUrl: string | null;
};

/**
 * 既存ニュース群に対して重複か判定する（決定的）。
 * @param existing DB から取得した既存キー集合。
 */
export function isDuplicate(
  candidate: { eventKey: string; contentHash: string; sourceUrl: string },
  existing: ExistingNewsKey[],
): boolean {
  return existing.some(
    (e) =>
      (e.eventKey && e.eventKey === candidate.eventKey) ||
      (e.contentHash && e.contentHash === candidate.contentHash),
  );
}
