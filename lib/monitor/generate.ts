/**
 * 関連度のある公式変更から、構造化された日本語ニュースを生成するための共有ロジック。
 *
 * モデルは供給された公式コンテンツだけを根拠にする設計で、現在の本番モデル実行は停止中。
 * テスト/将来実装では ModelCaller を注入できる。grounding チェックはプロバイダ非依存。
 */

import type { SourceDefinition, GeneratedNews } from "./types";
import { callModel, parseJsonLoose, type ModelCaller } from "./model";

const SYSTEM = `あなたはオーストラリアの WHV 情報サイトの日本語ニュース編集者です。
オーストラリア政府の公式ページの変更内容を、日本人 WHV 利用者向けに分かりやすい日本語ニュースにします。
厳守事項:
- 供給された公式テキストに書かれていない事実（日付・金額・料率・閾値・資格要件・URL・政府の決定）は絶対に書かない。
- 供給テキストに数値が無ければ「最新の金額は公式ページで確認」と促す（数値を創作しない）。
- 断定を避け、重要判断は公式・専門家への確認を促す。誇張・煽りをしない。
- 出力は必ず次の JSON のみ:
{"title":"見出し(日本語,40字以内)","summary":"要約(80-140字)","whatChanged":"何が変わったか","whoIsAffected":"誰に影響するか","whatToDo":"利用者が取るべき行動","sourcePublishedAt":"YYYY-MM-DD または空文字","confidence":0..1}`;

export async function generateNews(
  source: SourceDefinition,
  diffSummary: string,
  extractedText: string,
  caller: ModelCaller = callModel,
): Promise<GeneratedNews | null> {
  const user = `【公式ソース】${source.organisation}｜${source.sourceName}
【URL】${source.url}
【検出された差分（抜粋）】
${diffSummary.slice(0, 3000) || "(差分要約なし)"}

【現在のページ本文（供給された唯一の根拠。これ以外を根拠にしない）】
${extractedText.slice(0, 6000)}`;

  const raw = await caller({ system: SYSTEM, user });
  const parsed = parseJsonLoose<{
    title?: string;
    summary?: string;
    whatChanged?: string;
    whoIsAffected?: string;
    whatToDo?: string;
    sourcePublishedAt?: string;
    confidence?: number;
  }>(raw);

  if (!parsed || !parsed.title || !parsed.summary) return null;

  const sourcePublishedAt =
    parsed.sourcePublishedAt && /^\d{4}-\d{2}-\d{2}$/.test(parsed.sourcePublishedAt)
      ? parsed.sourcePublishedAt
      : undefined;

  const confidence =
    typeof parsed.confidence === "number" &&
    parsed.confidence >= 0 &&
    parsed.confidence <= 1
      ? parsed.confidence
      : 0;

  return {
    title: parsed.title.trim(),
    summary: parsed.summary.trim(),
    whatChanged: (parsed.whatChanged ?? "").trim(),
    whoIsAffected: (parsed.whoIsAffected ?? "").trim(),
    whatToDo: (parsed.whatToDo ?? "").trim(),
    sourcePublishedAt,
    confidence,
  };
}

/**
 * 軽量 grounding チェック。生成文が供給テキストに存在しない「具体的な金額/率/URL」を
 * 主張していないか検査する。true = grounding OK。
 */
export function checkGrounding(news: GeneratedNews, sourceText: string): boolean {
  const haystack = sourceText.toLowerCase();
  const combined = `${news.summary} ${news.whatChanged} ${news.whoIsAffected} ${news.whatToDo}`;

  const claims: string[] = [];
  for (const m of combined.matchAll(/\$?\s?\d[\d,]*(?:\.\d+)?\s?(?:aud|ドル|%|％)?/gi)) {
    const token = m[0].replace(/\s/g, "");
    if (token.replace(/[^\d]/g, "").length >= 3) claims.push(token);
  }
  for (const m of combined.matchAll(/https?:\/\/[^\s、。]+/gi)) {
    claims.push(m[0]);
  }
  if (claims.length === 0) return true;

  let grounded = 0;
  for (const c of claims) {
    const digits = c.replace(/[^\d]/g, "");
    if (c.startsWith("http")) {
      if (haystack.includes(c.toLowerCase())) grounded++;
    } else if (digits.length >= 3 && haystack.replace(/[^\d]/g, "").includes(digits)) {
      grounded++;
    }
  }
  return grounded === claims.length;
}
