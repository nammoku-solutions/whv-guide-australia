"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/lib/supabaseClient";
import { LISTING_PUBLIC_SELECT, mapApplicationRow, mapListingRow } from "@/lib/listings";
import { ListingCard } from "@/components/market/ListingCard";
import { StatusBadge } from "@/components/market/ListingBadges";
import { LISTING_TYPES } from "@/lib/listingConfig";
import type { Listing, ListingApplication } from "@/types/listing";

type Tab = "listings" | "applications" | "saved";

const APP_STATUS_LABEL: Record<ListingApplication["status"], string> = {
  applied: "応募済み",
  viewed: "確認済み",
  contacted: "連絡済み",
  interview: "面接",
  accepted: "採用",
  rejected: "不採用",
  withdrawn: "取り下げ",
};

export function MyMarketDashboard() {
  const { isLoggedIn, loading } = useAuth();
  const [tab, setTab] = useState<Tab>("listings");
  const [listings, setListings] = useState<Listing[]>([]);
  const [applications, setApplications] = useState<ListingApplication[]>([]);
  const [saved, setSaved] = useState<Listing[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (loading) return;
    let active = true;
    (async () => {
      if (!isLoggedIn || !supabase) {
        if (active) setReady(true);
        return;
      }
      const [myListings, myApps, mySaved] = await Promise.all([
        supabase!.from("listings").select(LISTING_PUBLIC_SELECT).order("created_at", { ascending: false }),
        supabase!
          .from("listing_applications")
          .select("id, listing_id, applicant_id, message, availability, contact_info, status, employer_response, created_at, updated_at, listings(title, listing_type)")
          .order("created_at", { ascending: false }),
        supabase!
          .from("saved_listings")
          .select(`id, listing_id, listings(${LISTING_PUBLIC_SELECT})`)
          .order("created_at", { ascending: false }),
      ]);
      if (!active) return;
      setListings(((myListings.data as unknown as Parameters<typeof mapListingRow>[0][]) ?? []).map(mapListingRow));
      setApplications(((myApps.data as unknown as Parameters<typeof mapApplicationRow>[0][]) ?? []).map(mapApplicationRow));
      const savedRows = (mySaved.data as unknown as { listings: Parameters<typeof mapListingRow>[0] | null }[]) ?? [];
      setSaved(savedRows.filter((r) => r.listings).map((r) => mapListingRow(r.listings!)));
      setReady(true);
    })();
    return () => {
      active = false;
    };
  }, [isLoggedIn, loading]);

  if (loading || !ready) return <p className="text-sm text-slate-500">読み込み中…</p>;

  if (!isLoggedIn) {
    return (
      <p className="text-sm text-slate-600">
        <Link href="/login" className="underline">ログイン</Link> が必要です。
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <TabButton active={tab === "listings"} onClick={() => setTab("listings")} label={`掲載中 (${listings.length})`} />
        <TabButton active={tab === "applications"} onClick={() => setTab("applications")} label={`応募した求人 (${applications.length})`} />
        <TabButton active={tab === "saved"} onClick={() => setTab("saved")} label={`保存 (${saved.length})`} />
      </div>

      {tab === "listings" ? (
        listings.length === 0 ? (
          <Empty message="まだ掲載はありません。" href="/community/market/new" cta="掲載する" />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {listings.map((l) => <ListingCard key={l.id} listing={l} />)}
          </div>
        )
      ) : null}

      {tab === "applications" ? (
        applications.length === 0 ? (
          <Empty message="まだ応募した求人はありません。" href="/community/market/job" cta="求人を探す" />
        ) : (
          <div className="space-y-2">
            {applications.map((a) => (
              <Link
                key={a.id}
                href={`/community/market/listing/${a.listingId}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm"
              >
                <div>
                  <p className="font-semibold text-slate-900">
                    {a.listingType ? LISTING_TYPES[a.listingType].emoji : "💼"} {a.listingTitle ?? "求人"}
                  </p>
                  <p className="text-xs text-slate-400">応募日: {a.createdAt}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                  {APP_STATUS_LABEL[a.status]}
                </span>
              </Link>
            ))}
          </div>
        )
      ) : null}

      {tab === "saved" ? (
        saved.length === 0 ? (
          <Empty message="保存した掲載はありません。" href="/community/market" cta="マーケットを見る" />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {saved.map((l) => (
              <div key={l.id} className="space-y-1">
                <ListingCard listing={l} />
                <div className="pl-1"><StatusBadge status={l.status} /></div>
              </div>
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
        active ? "bg-sky-700 text-white" : "border border-slate-300 text-slate-600"
      }`}
    >
      {label}
    </button>
  );
}

function Empty({ message, href, cta }: { message: string; href: string; cta: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <p className="text-sm text-slate-500">{message}</p>
      <Link href={href} className="mt-3 inline-flex rounded-full bg-sky-700 px-4 py-2 text-sm font-semibold text-white">
        {cta}
      </Link>
    </div>
  );
}
