/**
 * 変更された公式情報の「日本人 WHV 利用者への関連度」を分類する。
 *
 * 変更検知自体は決定的処理で行い、モデルは関連度判断だけを担当する設計。
 * 現在の本番ではモデル実行は停止中で、テスト/将来実装では ModelCaller を注入できる。
 */

import type { SourceDefinition, RelevanceResult, Relevance } from "./types";
import { callModel, parseJsonLoose, type ModelCaller } from "./model";

const SYSTEM = `あなたはオーストラリアのワーキングホリデー（WHV）情報サイトの編集アシスタントです。
オーストラリア政府の公式ページの「変更点」を読み、日本人 WHV 利用者にとっての関連度だけを判定します。
対象トピック: 417/462・WHM・規定労働(specified work)・ビザ規則・TFN・ABN・税・Super・DASP・
最低賃金・Award・カジュアル労働・車の登録(Rego)・運転免許・賃貸/Bond。
レイアウト・ナビゲーション・体裁のみの変更は unrelated とします。
必ず次の JSON だけを返す: {"relevance":"highly_relevant|relevant|weakly_relevant|unrelated","confidence":0..1,"reason":"日本語で簡潔に"}
供給されたテキストに無い事実（日付・料率・URL 等）は推測しないこと。`;

const VALID: Relevance[] = [
  "highly_relevant",
  "relevant",
  "weakly_relevant",
  "unrelated",
];

export async function classifyRelevance(
  source: SourceDefinition,
  diffSummary: string,
  extractedText: string,
  caller: ModelCaller = callModel,
): Promise<RelevanceResult> {
  const user = `【ソース】${source.organisation}｜${source.sourceName}
【カテゴリ】${source.category}
【検出された差分（抜粋）】
${diffSummary.slice(0, 3000) || "(差分要約なし。現在の本文から判断)"}

【現在のページ本文（抜粋）】
${extractedText.slice(0, 4000)}`;

  const raw = await caller({ system: SYSTEM, user });
  const parsed = parseJsonLoose<{
    relevance?: string;
    confidence?: number;
    reason?: string;
  }>(raw);

  if (!parsed || !parsed.relevance) {
    return {
      relevance: "weakly_relevant",
      confidence: 0,
      reason: "モデル応答を解析できませんでした（レビュー推奨）。",
    };
  }

  const relevance = VALID.includes(parsed.relevance as Relevance)
    ? (parsed.relevance as Relevance)
    : "weakly_relevant";
  const confidence =
    typeof parsed.confidence === "number" &&
    parsed.confidence >= 0 &&
    parsed.confidence <= 1
      ? parsed.confidence
      : 0;

  return { relevance, confidence, reason: parsed.reason ?? "" };
}
