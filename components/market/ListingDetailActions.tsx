"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { hasSupabaseEnv, supabase } from "@/lib/supabaseClient";
import { ReportButton } from "@/components/forum/ReportButton";
import { ApplyForm } from "@/components/market/ApplyForm";
import { trackEvent } from "@/lib/analytics";
import { LISTING_REPORT_REASONS } from "@/lib/listingConfig";
import type { Listing } from "@/types/listing";

export function ListingDetailActions({ listing }: { listing: Listing }) {
  const { profile, isLoggedIn, canAct } = useAuth();
  const router = useRouter();
  const isOwner = isLoggedIn && profile.id === listing.userId;
  const isModerator = profile.role === "moderator" || profile.role === "admin";
  const canManage = isOwner || isModerator;
  const isJob = listing.listingType === "job" || listing.listingType === "farm_job";
  const acceptsApplications =
    isJob && listing.contactMethod === "application" && listing.status === "active";

  const [saved, setSaved] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  // 閲覧イベント（個人情報は送らない）
  useEffect(() => {
    trackEvent("listing_view", { listing_type: listing.listingType });
  }, [listing.listingType]);

  useEffect(() => {
    if (!isLoggedIn || !supabase) return;
    let active = true;
    supabase
      .from("saved_listings")
      .select("id")
      .eq("listing_id", listing.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        if (data) {
          setSaved(true);
          setSavedId(data.id as string);
        }
      });
    return () => {
      active = false;
    };
  }, [isLoggedIn, listing.id]);

  const toggleSave = useCallback(async () => {
    if (!supabase || !isLoggedIn) return;
    setBusy(true);
    if (saved && savedId) {
      await supabase.from("saved_listings").delete().eq("id", savedId);
      setSaved(false);
      setSavedId(null);
    } else {
      const { data } = await supabase
        .from("saved_listings")
        .insert({ user_id: profile.id, listing_id: listing.id })
        .select("id")
        .single();
      if (data) {
        setSaved(true);
        setSavedId(data.id as string);
        trackEvent("listing_save", { listing_type: listing.listingType });
      }
    }
    setBusy(false);
  }, [saved, savedId, isLoggedIn, profile.id, listing.id, listing.listingType]);

  const setStatus = useCallback(
    async (status: "active" | "closed") => {
      if (!supabase) return;
      setBusy(true);
      const { error } = await supabase.from("listings").update({ status }).eq("id", listing.id);
      if (!error) {
        if (status === "closed") trackEvent("listing_close", { listing_type: listing.listingType });
        router.refresh();
      } else {
        setNote("更新に失敗しました。");
      }
      setBusy(false);
    },
    [listing.id, listing.listingType, router],
  );

  const remove = useCallback(async () => {
    if (!supabase) return;
    if (!window.confirm("この掲載を削除します。よろしいですか？")) return;
    setBusy(true);
    const { error } = await supabase.from("listings").delete().eq("id", listing.id);
    if (!error) {
      router.push("/community/market");
      router.refresh();
    } else {
      setNote("削除に失敗しました。");
      setBusy(false);
    }
  }, [listing.id, router]);

  const publicContact =
    listing.contactMethod === "email" || listing.contactMethod === "phone" || listing.contactMethod === "external";

  return (
    <div className="space-y-4">
      {/* 連絡・応募 */}
      {acceptsApplications && !isOwner ? (
        <ApplyForm listing={listing} />
      ) : null}

      {publicContact && listing.contactValue ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-slate-800">連絡先（投稿者が公開）</p>
          <div className="mt-1 text-sm">
            {listing.contactMethod === "email" ? (
              <a
                href={`mailto:${listing.contactValue}`}
                className="text-sky-700 underline"
                onClick={() => trackEvent("listing_contact", { listing_type: listing.listingType })}
              >
                {listing.contactValue}
              </a>
            ) : listing.contactMethod === "phone" ? (
              <a
                href={`tel:${listing.contactValue}`}
                className="text-sky-700 underline"
                onClick={() => trackEvent("listing_contact", { listing_type: listing.listingType })}
              >
                {listing.contactValue}
              </a>
            ) : (
              <a
                href={listing.contactValue}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="break-all text-sky-700 underline"
                onClick={() => trackEvent("listing_contact", { listing_type: listing.listingType })}
              >
                {listing.contactValue}
              </a>
            )}
          </div>
        </div>
      ) : null}

      {listing.contactMethod === "enquiry" && !acceptsApplications ? (
        <p className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          投稿者は直接の連絡先を公開していません。サイト内メッセージ機能は今後の対応予定です。
        </p>
      ) : null}

      {/* 保存・通報 */}
      <div className="flex flex-wrap items-center gap-2">
        {isLoggedIn ? (
          <button
            type="button"
            onClick={() => void toggleSave()}
            disabled={busy}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              saved ? "bg-amber-100 text-amber-800" : "border border-slate-300 text-slate-700"
            }`}
          >
            {saved ? "★ 保存済み" : "☆ 保存する"}
          </button>
        ) : null}
        <ReportButton
          targetType="listing"
          targetId={listing.id}
          authorId={listing.userId}
          reasons={LISTING_REPORT_REASONS}
        />
      </div>

      {/* オーナー操作 */}
      {canManage ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-800">掲載者メニュー</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link
              href={`/community/market/listing/${listing.id}/edit`}
              className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700"
            >
              編集
            </Link>
            {isJob ? (
              <Link
                href={`/community/market/listing/${listing.id}/applicants`}
                className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700"
              >
                応募者を見る
              </Link>
            ) : null}
            {listing.status === "active" ? (
              <button
                type="button"
                onClick={() => void setStatus("closed")}
                disabled={busy || !canAct}
                className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 disabled:opacity-50"
              >
                募集終了にする
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void setStatus("active")}
                disabled={busy || !canAct}
                className="rounded-full border border-emerald-300 bg-white px-3 py-1.5 text-sm text-emerald-700 disabled:opacity-50"
              >
                再募集する
              </button>
            )}
            <button
              type="button"
              onClick={() => void remove()}
              disabled={busy}
              className="rounded-full border border-rose-300 bg-white px-3 py-1.5 text-sm text-rose-700 disabled:opacity-50"
            >
              削除
            </button>
          </div>
          {note ? <p className="mt-2 text-xs text-rose-700">{note}</p> : null}
        </div>
      ) : null}

      {!hasSupabaseEnv ? (
        <p className="text-xs text-slate-400">※ この環境ではデータベースが未設定のため操作は反映されません。</p>
      ) : null}
    </div>
  );
}
