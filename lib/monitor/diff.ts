/**
 * 正規化済み本文の決定的ハッシュと差分。
 * ハッシュが一致 = 変更なし（Gemini を呼ばない）。ここに AI は関与しない。
 */

import { contentHash } from "@/lib/ai/hash";

export { contentHash };

export type DiffResult = {
  /** 追加された行数。 */
  added: number;
  /** 削除された行数。 */
  removed: number;
  /** 人間可読の差分要約（先頭 N 行）。 */
  summary: string;
  /** 変更のあった正味文字数（追加＋削除行の合計長）。boilerplate 揺れ判定に使う。 */
  changedChars: number;
};

/**
 * 行単位の集合差分。順序変更に強く、政府ページの「一部段落の追加/削除/改定」を
 * 検出しやすい。厳密な LCS ではないが決定的で十分実用的。
 */
export function diffText(previous: string, next: string): DiffResult {
  const prevLines = previous.split("\n").filter((l) => l.trim().length > 0);
  const nextLines = next.split("\n").filter((l) => l.trim().length > 0);
  const prevSet = new Set(prevLines);
  const nextSet = new Set(nextLines);

  const addedLines = nextLines.filter((l) => !prevSet.has(l));
  const removedLines = prevLines.filter((l) => !nextSet.has(l));

  const changedChars =
    addedLines.reduce((n, l) => n + l.length, 0) +
    removedLines.reduce((n, l) => n + l.length, 0);

  const summaryParts: string[] = [];
  for (const l of removedLines.slice(0, 8)) summaryParts.push(`- ${l}`);
  for (const l of addedLines.slice(0, 8)) summaryParts.push(`+ ${l}`);
  const more =
    Math.max(0, addedLines.length - 8) + Math.max(0, removedLines.length - 8);
  if (more > 0) summaryParts.push(`… 他 ${more} 行の変更`);

  return {
    added: addedLines.length,
    removed: removedLines.length,
    summary: summaryParts.join("\n"),
    changedChars,
  };
}
