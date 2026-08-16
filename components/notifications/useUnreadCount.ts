"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { getUnreadCount } from "@/lib/notifications";

/**
 * ヘッダーのバッジ用に未読通知数を取得する軽量フック。
 * マウント時・ウィンドウ復帰時・任意の間隔で再取得する（realtime は使わない）。
 */
export function useUnreadCount(pollMs = 60000): number {
  const { isLoggedIn, loading } = useAuth();
  const [count, setCount] = useState(0);

  const refresh = useCallback(() => {
    if (!isLoggedIn) {
      setCount(0);
      return;
    }
    void getUnreadCount().then(setCount);
  }, [isLoggedIn]);

  useEffect(() => {
    if (loading) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    if (!isLoggedIn) return;
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(refresh, pollMs);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, [loading, isLoggedIn, refresh, pollMs]);

  return count;
}
