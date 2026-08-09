// GA4 へのイベント送信ヘルパー。個人情報は送らない（IDやメール等は渡さない）。
// gtag が未定義（ブロック時・未設定時）でも安全に no-op になる。

export type MarketplaceEvent =
  | "listing_view"
  | "listing_create"
  | "job_apply"
  | "listing_save"
  | "listing_contact"
  | "listing_close";

export function trackEvent(
  name: MarketplaceEvent,
  params: Record<string, string | number | boolean> = {},
): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", name, params);
}
