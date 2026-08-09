import Link from "next/link";
import type { Listing } from "@/types/listing";
import { PostingIdentity, StatusBadge, TypeBadge } from "@/components/market/ListingBadges";

function primaryMeta(listing: Listing): string | null {
  const d = listing.details;
  switch (listing.listingType) {
    case "job":
    case "farm_job":
      return d.payAmount ? `💰 ${d.payAmount}` : d.employmentType ?? null;
    case "housing":
      return d.weeklyRent ? `週 $${d.weeklyRent}` : d.roomType ?? null;
    case "roommate":
      return d.budgetApprox ? `予算 $${d.budgetApprox}` : d.preferredArea ?? null;
    case "vehicle":
      return d.price ? `$${d.price}` : [d.make, d.model, d.year].filter(Boolean).join(" ") || null;
    case "marketplace":
      return d.price ? `$${d.price}` : d.category ?? null;
    default:
      return null;
  }
}

export function ListingCard({ listing }: { listing: Listing }) {
  const meta = primaryMeta(listing);
  const hasImage = listing.images.length > 0;

  return (
    <Link
      href={`/community/market/listing/${listing.id}`}
      className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:border-sky-300 hover:shadow-sm"
    >
      {hasImage ? (
        // 投稿者アップロード画像。next/image ではなく素の img（外部/ストレージURL、装飾用）。
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={listing.images[0]}
          alt=""
          className="h-40 w-full object-cover"
          loading="lazy"
        />
      ) : null}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <TypeBadge type={listing.listingType} />
          <StatusBadge status={listing.status} />
        </div>
        <h3 className="line-clamp-2 font-semibold text-slate-900">{listing.title}</h3>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-600">
          {listing.location ? <span>📍 {listing.location}</span> : null}
          {meta ? <span className="font-medium text-slate-800">{meta}</span> : null}
        </div>
        <div className="mt-auto flex items-center justify-between pt-2 text-xs text-slate-400">
          <PostingIdentity
            authorName={listing.authorName}
            postingMode={listing.postingMode}
            authorRole={listing.authorRole}
          />
          <span>{listing.createdAt}</span>
        </div>
      </div>
    </Link>
  );
}
