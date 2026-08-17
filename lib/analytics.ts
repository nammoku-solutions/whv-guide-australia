// GA4 へのイベント送信ヘルパー。個人情報は送らない（IDやメール等は渡さない）。
// gtag が未定義（ブロック時・未設定時）でも安全に no-op になる。

export type MarketplaceEvent =
  | "listing_view"
  | "listing_create"
  | "job_apply"
  | "listing_save"
  | "listing_contact"
  | "listing_close";

/**
 * ドキュメント（レジュメ／カバーレター）テンプレートのプレビュー・ダウンロードイベント。
 * 氏名・メール・電話・本文などの個人情報や本文は絶対に送らない（種別・形式・テンプレIDのみ）。
 */
export type DocumentEvent = "document_preview" | "document_download";

/**
 * マイページ・保存アイテム・通知まわりのイベント。
 * ユーザーID・メール・メッセージ本文・応募内容などの個人情報は絶対に送らない
 * （item_type / notification_type などの非個人的な区分値のみ）。
 */
export type PersonalisationEvent =
  | "save_item"
  | "unsave_item"
  | "dashboard_view"
  | "notification_open"
  | "notification_target_click"
  | "saved_search_create";

/**
 * 外部ニュース候補（管理）のイベント。生のエビデンス・管理者識別子・秘匿値は絶対に送らない
 * （区分値・ステータス・リスクレベルなどの非個人的な値のみ）。
 */
export type AdminNewsEvent =
  | "admin_news_candidate_submit"
  | "admin_news_candidate_review"
  | "admin_news_candidate_publish";

export function trackEvent(
  name: MarketplaceEvent | DocumentEvent | PersonalisationEvent | AdminNewsEvent,
  params: Record<string, string | number | boolean> = {},
): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", name, params);
}
