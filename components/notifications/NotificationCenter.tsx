"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { hasSupabaseEnv } from "@/lib/supabaseClient";
import {
  listNotifications,
  markAllRead,
  markRead,
  type AppNotification,
} from "@/lib/notifications";
import { trackEvent } from "@/lib/analytics";

const PAGE_SIZE = 20;

const TYPE_ICON: Record<string, string> = {
  saved_article_updated: "📝",
  important_news: "📣",
  saved_listing_updated: "🏷️",
  saved_listing_closing: "⏳",
  saved_listing_closed: "🔒",
  new_matching_listing: "✨",
  application_status_changed: "💼",
  application_message: "📨",
  community_reply: "💬",
  system: "🔔",
};

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "たった今";
  if (min < 60) return `${min}分前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}時間前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}日前`;
  return new Date(iso).toISOString().slice(0, 10);
}

export function NotificationCenter() {
  const { isLoggedIn, loading } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (offset: number) => {
    const page = await listNotifications(PAGE_SIZE, offset);
    setItems((prev) => (offset === 0 ? page.items : [...prev, ...page.items]));
    setHasMore(page.hasMore);
    setReady(true);
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!isLoggedIn) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReady(true);
      return;
    }
    trackEvent("notification_open");
    void load(0);
  }, [loading, isLoggedIn, load]);

  const onMarkAll = useCallback(async () => {
    setBusy(true);
    await markAllRead();
    setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })));
    setBusy(false);
  }, []);

  const onOpen = useCallback(async (n: AppNotification) => {
    if (!n.readAt) {
      await markRead(n.id);
      setItems((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)),
      );
    }
    trackEvent("notification_target_click", { notification_type: n.type });
  }, []);

  if (loading || !ready) return <p className="text-sm text-slate-500">読み込み中…</p>;

  if (!hasSupabaseEnv) {
    return (
      <p className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
        この環境ではデータベースが未設定のため、通知は表示できません。
      </p>
    );
  }

  if (!isLoggedIn) {
    return (
      <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        通知を見るには <Link href="/login" className="font-semibold text-sky-700 underline">ログイン</Link> してください。
      </p>
    );
  }

  const unread = items.filter((n) => !n.readAt).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">
          {unread > 0 ? `未読 ${unread} 件` : "未読はありません"}
        </p>
        <button
          type="button"
          onClick={() => void onMarkAll()}
          disabled={busy || unread === 0}
          className="rounded-full border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          すべて既読にする
        </button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-3xl">🔔</p>
          <p className="mt-2 text-sm text-slate-500">まだ通知はありません。</p>
          <p className="mt-1 text-xs text-slate-400">
            記事や掲載を保存すると、更新や募集終了などをここでお知らせします。
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => {
            const inner = (
              <div className="flex gap-3">
                <span aria-hidden className="text-xl leading-none">
                  {TYPE_ICON[n.type] ?? "🔔"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${n.readAt ? "font-medium text-slate-700" : "font-bold text-slate-900"}`}>
                    {n.title}
                  </p>
                  {n.body ? <p className="mt-0.5 text-sm text-slate-600">{n.body}</p> : null}
                  <p className="mt-1 text-xs text-slate-400">{relativeTime(n.createdAt)}</p>
                </div>
                {!n.readAt ? (
                  <span aria-hidden className="mt-1 h-2 w-2 shrink-0 rounded-full bg-sky-500" />
                ) : null}
              </div>
            );
            const cls = `block rounded-2xl border p-4 transition ${
              n.readAt ? "border-slate-200 bg-white" : "border-sky-200 bg-sky-50/60"
            }`;
            return (
              <li key={n.id}>
                {n.targetUrl ? (
                  <Link href={n.targetUrl} onClick={() => void onOpen(n)} className={`${cls} hover:border-sky-300`}>
                    {inner}
                  </Link>
                ) : (
                  <button type="button" onClick={() => void onOpen(n)} className={`${cls} w-full text-left`}>
                    {inner}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {hasMore ? (
        <div className="text-center">
          <button
            type="button"
            onClick={() => void load(items.length)}
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            さらに読み込む
          </button>
        </div>
      ) : null}
    </div>
  );
}
