/**
 * AI アシスタント用の GA4 イベント名とプライバシー配慮のパラメータ生成（クライアント）。
 *
 * 重要: 生の質問文・氏名・メール・電話・本文・掲載の非公開情報などの個人情報は
 * 絶対に送らない。集計に必要な非個人情報（種別・件数・レイテンシ等）のみを送る。
 */

export type AiEventName =
  | "ai_chat_open"
  | "ai_question"
  | "ai_answer"
  | "ai_no_answer"
  | "ai_source_click"
  | "ai_tool_click"
  | "ai_feedback";

type GtagParams = Record<string, string | number | boolean>;

/** GA4 へ AI イベントを送る（gtag 未定義でも安全に no-op）。 */
export function trackAiEvent(name: AiEventName, params: GtagParams = {}): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", name, params);
}

/** 質問イベント（本文は送らず、長さ・ルート・件数などの非個人情報のみ）。 */
export function aiQuestionParams(input: {
  route?: string;
  questionLength: number;
}): GtagParams {
  return {
    route: input.route ?? "unknown",
    // 長さのみ（本文は送らない）
    q_len: input.questionLength,
  };
}
