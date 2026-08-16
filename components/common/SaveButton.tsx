"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { hasSupabaseEnv } from "@/lib/supabaseClient";
import { getSavedItemId, saveItem, unsaveItem, type SavedItemType } from "@/lib/savedItems";
import { trackEvent } from "@/lib/analytics";

type SaveButtonProps = {
  itemType: SavedItemType;
  itemId: string;
  /** 任意: 保存対象の名称（アナリティクスには送らない）。 */
  className?: string;
};

/**
 * 記事 / ニュース / ツール向けの共通「保存する／保存済み」トグル。
 * ログアウト中はログイン導線を表示（安全なゲスト挙動）。
 */
export function SaveButton({ itemType, itemId, className }: SaveButtonProps) {
  const { isLoggedIn, profile, loading } = useAuth();
  const pathname = usePathname();
  const [savedId, setSavedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const saved = savedId != null;

  useEffect(() => {
    if (loading || !isLoggedIn) return;
    let active = true;
    void getSavedItemId(itemType, itemId).then((id) => {
      if (active) setSavedId(id);
    });
    return () => {
      active = false;
    };
  }, [loading, isLoggedIn, itemType, itemId]);

  const toggle = useCallback(async () => {
    if (!isLoggedIn || busy) return;
    setBusy(true);
    try {
      if (saved && savedId) {
        await unsaveItem(savedId);
        setSavedId(null);
        trackEvent("unsave_item", { item_type: itemType });
      } else {
        const id = await saveItem(profile.id, itemType, itemId);
        if (id) {
          setSavedId(id);
          trackEvent("save_item", { item_type: itemType });
        }
      }
    } finally {
      setBusy(false);
    }
  }, [isLoggedIn, busy, saved, savedId, profile.id, itemType, itemId]);

  if (!hasSupabaseEnv) return null;

  if (loading) {
    return (
      <span className={`inline-flex items-center rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-300 ${className ?? ""}`}>
        ☆ 保存
      </span>
    );
  }

  if (!isLoggedIn) {
    const next = encodeURIComponent(pathname || "/");
    return (
      <Link
        href={`/login?next=${next}`}
        className={`inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 ${className ?? ""}`}
      >
        ☆ 保存する
        <span className="text-xs font-normal text-slate-400">（ログイン）</span>
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={busy}
      aria-pressed={saved}
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold transition disabled:opacity-60 ${
        saved
          ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
          : "border border-slate-300 text-slate-700 hover:bg-slate-50"
      } ${className ?? ""}`}
    >
      {saved ? "★ 保存済み" : "☆ 保存する"}
    </button>
  );
}
