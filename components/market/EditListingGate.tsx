"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { ListingForm } from "@/components/market/ListingForm";
import type { Listing } from "@/types/listing";

export function EditListingGate({ listing }: { listing: Listing }) {
  const { loading, isLoggedIn, profile } = useAuth();
  const canEdit =
    isLoggedIn && (profile.id === listing.userId || profile.role === "moderator" || profile.role === "admin");

  if (loading) return <p className="text-sm text-slate-500">読み込み中…</p>;

  if (!canEdit) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        この掲載を編集する権限がありません。
      </div>
    );
  }

  return <ListingForm listing={listing} />;
}
