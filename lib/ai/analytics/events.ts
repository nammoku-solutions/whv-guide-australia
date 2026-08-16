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
  | "ai_card_click"
  | "ai_action_click"
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

/**
 * 回答イベントのパラメータ（プライバシー安全）。
 * ルート種別・カード有無・no-result・認証必須・カード件数など、非個人の集計メタのみ。
 * 生の質問文・本文・掲載や本人の非公開情報は絶対に送らない。
 */
export function aiAnswerParams(input: {
  route?: string;
  cardKinds?: string[];
  cardCount?: number;
  noResult?: boolean;
  authRequired?: boolean;
}): GtagParams {
  const params: GtagParams = {
    route: input.route ?? "unknown",
    card_count: input.cardCount ?? 0,
    no_result: Boolean(input.noResult),
    auth_required: Boolean(input.authRequired),
  };
  if (input.cardKinds && input.cardKinds.length > 0) {
    // 種別集合のみ（IDや本文は送らない）。
    params.card_kinds = Array.from(new Set(input.cardKinds)).sort().join(",");
  }
  return params;
}

/** カード/アクションのクリック（種別のみ。IDやURL・本文は送らない）。 */
export function aiCardClickParams(kind: string, intent?: string): GtagParams {
  return { card_kind: kind, ...(intent ? { intent } : {}) };
}
