/**
 * 構造化された公式ソースエビデンス（DTO）を、既存の共有生成パイプラインが期待する
 * 単一の正規化テキスト（HistoricalCandidate.content）に変換する。
 *
 * これにより「別系統の生成器」を作らず、grounding・生成・dedupe をそのまま再利用できる。
 * 生成は供給されたエビデンスだけを根拠にし、モデルの事前知識で補完しない（#4/#5）。
 */

import { contentHash } from "../diff";
import { monitorConfig } from "../config";
import type { SourceEvidence } from "./types";

/** 十分なエビデンスとみなす最小の正規化本文長。 */
export const MIN_EVIDENCE_CHARS = 120;

/** 素のテキスト入力を DTO へ正規化する（text フィールドとして保持）。 */
export function normaliseEvidence(input: SourceEvidence | string): SourceEvidence {
  if (typeof input === "string") {
    return { summary: "", text: input };
  }
  return {
    summary: (input.summary ?? "").trim(),
    facts: Array.isArray(input.facts)
      ? input.facts.map((f) => String(f).trim()).filter(Boolean).slice(0, 40)
      : undefined,
    numbers: Array.isArray(input.numbers)
      ? input.numbers
          .map((n) => ({ value: String(n?.value ?? "").trim(), context: String(n?.context ?? "").trim() }))
          .filter((n) => n.value)
          .slice(0, 40)
      : undefined,
    dates: Array.isArray(input.dates)
      ? input.dates
          .map((d) => ({ value: String(d?.value ?? "").trim(), context: String(d?.context ?? "").trim() }))
          .filter((d) => d.value)
          .slice(0, 40)
      : undefined,
    text: input.text ? String(input.text).trim() : undefined,
  };
}

/**
 * DTO を、生成の唯一の根拠となる 1 つの正規化テキストへ変換する。
 * 供給された事実のみを含め、モデル知識で補完しない。
 */
export function evidenceToText(evidence: SourceEvidence): string {
  const parts: string[] = [];
  if (evidence.summary) parts.push(evidence.summary.trim());
  if (evidence.facts && evidence.facts.length > 0) {
    parts.push(evidence.facts.map((f) => `・${f}`).join("\n"));
  }
  if (evidence.numbers && evidence.numbers.length > 0) {
    parts.push(
      evidence.numbers.map((n) => `${n.value}${n.context ? `（${n.context}）` : ""}`).join("\n"),
    );
  }
  if (evidence.dates && evidence.dates.length > 0) {
    parts.push(
      evidence.dates.map((d) => `${d.value}${d.context ? `（${d.context}）` : ""}`).join("\n"),
    );
  }
  if (evidence.text) parts.push(evidence.text.trim());
  return parts
    .filter((p) => p && p.trim())
    .join("\n\n")
    .slice(0, monitorConfig.maxContentChars);
}

/** エビデンスが生成に十分か（決定的）。 */
export function hasSufficientEvidence(evidence: SourceEvidence): boolean {
  return evidenceToText(evidence).trim().length >= MIN_EVIDENCE_CHARS;
}

/**
 * 取り込み dedupe 用の決定的ハッシュ。正規化テキストのみから計算し、空白/整形差を無視する。
 */
export function evidenceHash(evidence: SourceEvidence): string {
  const canonical = evidenceToText(evidence).replace(/\s+/g, " ").trim().toLowerCase();
  return contentHash(canonical);
}
