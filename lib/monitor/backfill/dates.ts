/**
 * 日付ユーティリティ（歴史的バックフィル）。範囲検証と、政府ページに現れる
 * 各種日付表記の決定的パースを行う。日付は「推測」せず、パースできなければ失敗にする。
 */

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12,
};

/** YYYY-MM-DD として妥当な日付文字列か。 */
export function isValidDateString(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  if (!Number.isFinite(t)) return false;
  return new Date(t).toISOString().slice(0, 10) === s;
}

export type RangeValidation =
  | { ok: true; from: string; to: string }
  | { ok: false; error: string };

/**
 * 範囲を検証する。無効な日付・from>to・過度に広い範囲（override 無し）を拒否する。
 * @param maxDays 明示 override が無いときに許可する最大日数。
 */
export function validateRange(
  from: string,
  to: string,
  maxDays: number,
  allowWide: boolean,
): RangeValidation {
  if (!isValidDateString(from)) return { ok: false, error: `from が不正な日付です: ${from}` };
  if (!isValidDateString(to)) return { ok: false, error: `to が不正な日付です: ${to}` };
  const fromT = Date.parse(`${from}T00:00:00Z`);
  const toT = Date.parse(`${to}T00:00:00Z`);
  if (fromT > toT) return { ok: false, error: `from > to は指定できません（${from} > ${to}）。` };
  const days = Math.round((toT - fromT) / 86_400_000) + 1;
  if (days > maxDays && !allowWide) {
    return {
      ok: false,
      error: `範囲が広すぎます（${days} 日 > 上限 ${maxDays} 日）。--allow-wide-range で明示的に許可してください。`,
    };
  }
  return { ok: true, from, to };
}

/**
 * 政府ページの日付表記を ISO(YYYY-MM-DD) に決定的にパースする。
 * 対応: "22 Jun 2026", "22 June 2026", "2026-06-22", ISO タイムスタンプ,
 *       "Tue, 01 Jul 2026 00:00:00 GMT"（RSS pubDate）。
 * @returns ISO 日付文字列、またはパース不能なら null（推測しない）。
 */
export function parseOfficialDate(input: string): string | null {
  if (!input) return null;
  const raw = input.trim();

  // すでに ISO（日付 or タイムスタンプ）。
  const isoMatch = raw.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    const s = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    if (isValidDateString(s)) return s;
  }

  // "D Mon YYYY" / "D Month YYYY"（英語）。
  const dmy = raw.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})\b/);
  if (dmy) {
    const day = Number.parseInt(dmy[1], 10);
    const mon = MONTHS[dmy[2].toLowerCase()];
    const year = Number.parseInt(dmy[3], 10);
    if (mon && day >= 1 && day <= 31) {
      const s = `${year}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (isValidDateString(s)) return s;
    }
  }

  // "Mon D, YYYY"（英語）。
  const mdy = raw.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/);
  if (mdy) {
    const mon = MONTHS[mdy[1].toLowerCase()];
    const day = Number.parseInt(mdy[2], 10);
    const year = Number.parseInt(mdy[3], 10);
    if (mon && day >= 1 && day <= 31) {
      const s = `${year}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (isValidDateString(s)) return s;
    }
  }

  // 最終手段: Date.parse（RSS pubDate 等）。ただし ISO 日付に丸めて検証する。
  const t = Date.parse(raw);
  if (Number.isFinite(t)) {
    const s = new Date(t).toISOString().slice(0, 10);
    if (isValidDateString(s)) return s;
  }
  return null;
}

/** ISO 日付が [from, to]（両端含む）に入っているか。 */
export function inRange(isoDate: string, from: string, to: string): boolean {
  return isoDate >= from && isoDate <= to;
}
