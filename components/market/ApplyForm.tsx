"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/lib/supabaseClient";
import { trackEvent } from "@/lib/analytics";
import type { ApplicationStatus, Listing } from "@/types/listing";

const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  applied: "応募済み",
  viewed: "確認済み",
  contacted: "連絡済み",
  interview: "面接",
  accepted: "採用",
  rejected: "不採用",
  withdrawn: "取り下げ",
};

const inputClass = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

export function ApplyForm({ listing }: { listing: Listing }) {
  const { profile, isLoggedIn, canAct } = useAuth();
  const [existing, setExisting] = useState<{ id: string; status: ApplicationStatus; employerResponse: string | null } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("");
  const [availability, setAvailability] = useState("");
  const [contactInfo, setContactInfo] = useState("");
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!isLoggedIn || !supabase) {
        if (active) setLoaded(true);
        return;
      }
      const { data } = await supabase
        .from("listing_applications")
        .select("id, status, employer_response")
        .eq("listing_id", listing.id)
        .maybeSingle();
      if (!active) return;
      if (data) {
        setExisting({
          id: data.id as string,
          status: data.status as ApplicationStatus,
          employerResponse: (data.employer_response as string | null) ?? null,
        });
      }
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [isLoggedIn, listing.id]);

  async function submit() {
    if (!supabase || !canAct) {
      setFeedback("応募するには本人確認（メール・電話番号認証）が必要です。");
      return;
    }
    setSubmitting(true);
    setFeedback("");
    const { data, error } = await supabase
      .from("listing_applications")
      .insert({
        listing_id: listing.id,
        applicant_id: profile.id,
        message: message.trim() || null,
        availability: availability.trim() || null,
        contact_info: contactInfo.trim() || null,
      })
      .select("id, status, employer_response")
      .single();
    if (error || !data) {
      setFeedback("応募を送信できませんでした。募集が終了している可能性があります。");
      setSubmitting(false);
      return;
    }
    trackEvent("job_apply", { listing_type: listing.listingType });
    setExisting({ id: data.id as string, status: data.status as ApplicationStatus, employerResponse: null });
    setSubmitting(false);
  }

  async function withdraw() {
    if (!supabase || !existing) return;
    setSubmitting(true);
    const { error } = await supabase
      .from("listing_applications")
      .update({ status: "withdrawn" })
      .eq("id", existing.id);
    if (!error) setExisting({ ...existing, status: "withdrawn" });
    setSubmitting(false);
  }

  if (!loaded) return null;

  if (!isLoggedIn) {
    return (
      <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
        応募には{" "}
        <Link href="/login" className="font-semibold underline">ログイン</Link>{" "}
        が必要です。
      </div>
    );
  }

  if (existing) {
    return (
      <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm">
        <p className="font-semibold text-sky-900">
          応募状況: {APPLICATION_STATUS_LABEL[existing.status]}
        </p>
        {existing.employerResponse ? (
          <p className="mt-2 whitespace-pre-wrap text-slate-700">
            掲載者からの返信: {existing.employerResponse}
          </p>
        ) : null}
        {existing.status !== "withdrawn" && existing.status !== "accepted" && existing.status !== "rejected" ? (
          <button
            type="button"
            onClick={() => void withdraw()}
            disabled={submitting}
            className="mt-3 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600"
          >
            応募を取り下げる
          </button>
        ) : null}
        <p className="mt-3 text-xs text-slate-500">
          <Link href="/community/market/my" className="underline">応募した求人一覧</Link>
        </p>
      </div>
    );
  }

  return (
    <form
      className="space-y-3 rounded-2xl border border-sky-200 bg-sky-50 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <p className="text-sm font-semibold text-sky-900">この求人に応募する</p>
      <p className="text-xs text-slate-500">
        あなたのプロフィール表示名（{profile.displayName}）が掲載者に共有されます。連絡先は任意です。
      </p>
      <label className="block text-sm text-slate-700">
        メッセージ（任意）
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} maxLength={2000} className={inputClass} />
      </label>
      <label className="block text-sm text-slate-700">
        勤務可能時期・条件（任意）
        <input value={availability} onChange={(e) => setAvailability(e.target.value)} maxLength={200} className={inputClass} />
      </label>
      <label className="block text-sm text-slate-700">
        連絡先（任意・掲載者にのみ表示）
        <input value={contactInfo} onChange={(e) => setContactInfo(e.target.value)} maxLength={200} className={inputClass} />
      </label>
      {feedback ? <p className="text-sm text-rose-700">{feedback}</p> : null}
      <button
        type="submit"
        disabled={!canAct || submitting}
        className="rounded-full bg-sky-700 px-5 py-2 text-sm font-semibold text-white disabled:bg-slate-300"
      >
        {submitting ? "送信中…" : "応募する"}
      </button>
    </form>
  );
}
