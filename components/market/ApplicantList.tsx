"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { hasSupabaseEnv, supabase } from "@/lib/supabaseClient";
import { mapApplicationRow } from "@/lib/listings";
import type { ApplicationStatus, ListingApplication } from "@/types/listing";

const OWNER_STATUSES: ApplicationStatus[] = ["applied", "viewed", "contacted", "interview", "accepted", "rejected"];

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  applied: "応募済み",
  viewed: "確認済み",
  contacted: "連絡済み",
  interview: "面接",
  accepted: "採用",
  rejected: "不採用",
  withdrawn: "取り下げ",
};

export function ApplicantList({ listingId }: { listingId: string }) {
  const { isLoggedIn, profile, loading } = useAuth();
  const [listingTitle, setListingTitle] = useState("");
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [applications, setApplications] = useState<ListingApplication[]>([]);
  const [ready, setReady] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    let active = true;
    (async () => {
      if (!isLoggedIn || !supabase) {
        if (active) setReady(true);
        return;
      }
      const { data: listing } = await supabase
        .from("listings")
        .select("title, user_id")
        .eq("id", listingId)
        .maybeSingle();
      if (!active) return;
      setListingTitle((listing?.title as string) ?? "");
      setOwnerId((listing?.user_id as string) ?? null);

      const { data } = await supabase
        .from("listing_applications")
        .select("id, listing_id, applicant_id, message, availability, contact_info, status, employer_response, created_at, updated_at, profiles(display_name)")
        .eq("listing_id", listingId)
        .order("created_at", { ascending: false });
      if (!active) return;
      setApplications(((data as unknown as Parameters<typeof mapApplicationRow>[0][]) ?? []).map(mapApplicationRow));
      setReady(true);
    })();
    return () => {
      active = false;
    };
  }, [isLoggedIn, listingId, loading]);

  const isOwner = ownerId && (profile.id === ownerId || profile.role === "moderator" || profile.role === "admin");

  async function updateApplication(id: string, patch: { status?: ApplicationStatus; employer_response?: string }) {
    if (!supabase) return;
    setBusyId(id);
    const { error } = await supabase.from("listing_applications").update(patch).eq("id", id);
    if (!error) {
      setApplications((prev) => prev.map((a) => (a.id === id ? { ...a, ...normalize(patch) } : a)));
    }
    setBusyId(null);
  }

  if (!ready || loading) return <p className="text-sm text-slate-500">読み込み中…</p>;

  if (!isLoggedIn) {
    return (
      <p className="text-sm text-slate-600">
        <Link href="/login" className="underline">ログイン</Link> が必要です。
      </p>
    );
  }

  if (ownerId && !isOwner) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        この掲載の応募者を閲覧する権限がありません。
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <Link href={`/community/market/listing/${listingId}`} className="text-sm text-sky-700 underline">
          ← 掲載に戻る
        </Link>
        {listingTitle ? <h2 className="mt-1 text-xl font-bold text-slate-900">{listingTitle}</h2> : null}
      </div>

      {!hasSupabaseEnv ? (
        <p className="text-sm text-slate-500">データベースが未設定です。</p>
      ) : applications.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          まだ応募はありません。
        </p>
      ) : (
        <div className="space-y-3">
          {applications.map((app) => (
            <div key={app.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-slate-900">{app.applicantName}</span>
                <span className="text-xs text-slate-400">{app.createdAt}</span>
              </div>
              {app.message ? <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{app.message}</p> : null}
              {app.availability ? <p className="mt-1 text-sm text-slate-600">勤務可能: {app.availability}</p> : null}
              {app.contactInfo ? <p className="mt-1 text-sm text-slate-600">連絡先: {app.contactInfo}</p> : null}

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <label className="text-xs font-medium text-slate-600">
                  ステータス
                  <select
                    value={app.status}
                    disabled={busyId === app.id || app.status === "withdrawn"}
                    onChange={(e) => void updateApplication(app.id, { status: e.target.value as ApplicationStatus })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    {app.status === "withdrawn" ? (
                      <option value="withdrawn">{STATUS_LABEL.withdrawn}</option>
                    ) : (
                      OWNER_STATUSES.map((s) => (
                        <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                      ))
                    )}
                  </select>
                </label>
                <label className="text-xs font-medium text-slate-600">
                  応募者への返信（任意）
                  <input
                    defaultValue={app.employerResponse ?? ""}
                    disabled={busyId === app.id}
                    onBlur={(e) => {
                      if (e.target.value !== (app.employerResponse ?? "")) {
                        void updateApplication(app.id, { employer_response: e.target.value });
                      }
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function normalize(patch: { status?: ApplicationStatus; employer_response?: string }): Partial<ListingApplication> {
  const out: Partial<ListingApplication> = {};
  if (patch.status) out.status = patch.status;
  if (patch.employer_response !== undefined) out.employerResponse = patch.employer_response;
  return out;
}
