"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { hasSupabaseEnv } from "@/lib/supabaseClient";
import { createSavedSearch, type SavedSearchFilters } from "@/lib/savedSearches";
import { trackEvent } from "@/lib/analytics";
import { PRIMARY_CATEGORIES, type PrimaryCategory } from "@/lib/listingConfig";

const NUMERIC_KEYS = new Set(["minRent", "maxRent", "minPrice", "maxPrice"]);
const ALLOWED_KEYS = new Set([
  "subcategory",
  "location",
  "industry",
  "employmentType",
  "payType",
  "roomType",
  "transmission",
  "state",
  "farm",
  "coupleAllowed",
  "minRent",
  "maxRent",
  "minPrice",
  "maxPrice",
]);

/**
 * 現在の検索条件（URLクエリ）を保存する導線。マーケットの絞り込み結果から
 * 「この条件を保存」でき、マイページから再実行できる。ログアウト中はログイン導線。
 */
export function SaveSearchButton({
  category,
  subcategory,
}: {
  category: PrimaryCategory;
  subcategory?: string;
}) {
  const { isLoggedIn, profile } = useAuth();
  const searchParams = useSearchParams();
  const cfg = PRIMARY_CATEGORIES[category];
  // 保存検索の listing_type は選択サブカテゴリの内部型（未選択はカテゴリ代表型）。
  const storedType =
    (subcategory && cfg.subcategories.find((s) => s.value === subcategory)?.listingType) ||
    cfg.listingTypes[0];
  const [label, setLabel] = useState("");
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const filters = useMemo<SavedSearchFilters>(() => {
    const out: Record<string, string | number | boolean> = {};
    for (const [key, value] of searchParams.entries()) {
      if (!ALLOWED_KEYS.has(key) || !value) continue;
      if (key === "coupleAllowed") out[key] = value === "1";
      else if (NUMERIC_KEYS.has(key)) {
        const n = Number(value);
        if (Number.isFinite(n)) out[key] = n;
      } else out[key] = value;
    }
    return out as SavedSearchFilters;
  }, [searchParams]);

  const activeCount = Object.keys(filters).length;
  if (!hasSupabaseEnv || activeCount === 0) return null;

  if (!isLoggedIn) {
    return (
      <p className="text-xs text-slate-500">
        <Link href="/login" className="font-semibold text-sky-700 underline">ログイン</Link> するとこの検索条件を保存できます。
      </p>
    );
  }

  async function submit() {
    const name = label.trim() || `保存した検索 (${new Date().toISOString().slice(0, 10)})`;
    setBusy(true);
    setNote("");
    const res = await createSavedSearch(profile.id, name, storedType, filters);
    setBusy(false);
    if (res.ok) {
      setSaved(true);
      setOpen(false);
      trackEvent("saved_search_create", { listing_type: storedType });
    } else {
      setNote(res.error ?? "保存に失敗しました。");
    }
  }

  if (saved) {
    return (
      <p className="text-xs font-semibold text-emerald-600">
        検索条件を保存しました。<Link href="/mypage" className="underline">マイページ</Link> で確認できます。
      </p>
    );
  }

  return (
    <div className="text-sm">
      {open ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="例: Gatton ファーム"
            maxLength={60}
            className="rounded-full border border-slate-300 px-3 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className="rounded-full bg-sky-700 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            保存
          </button>
          <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-400">
            キャンセル
          </button>
          {note ? <span className="text-xs text-rose-600">{note}</span> : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          🔎 この検索条件を保存
        </button>
      )}
    </div>
  );
}
