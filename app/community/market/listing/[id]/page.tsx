import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/layout/Container";
import { ListingDetailBody } from "@/components/market/ListingDetailBody";
import { ListingDetailActions } from "@/components/market/ListingDetailActions";
import { PostingIdentity, StatusBadge, TypeBadge } from "@/components/market/ListingBadges";
import { AdBanner } from "@/components/ads/AdBanner";
import { getListingById } from "@/lib/listings";
import { getListingTypeConfig, getPrimaryCategoryConfig, LISTING_TYPE_TO_CATEGORY } from "@/lib/listingConfig";

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const listing = await getListingById(id);
  if (!listing) return { title: "掲載", robots: { index: false, follow: false } };
  return {
    title: `${listing.title} | ${getListingTypeConfig(listing.listingType).label}`,
    description: listing.description.slice(0, 100),
    alternates: { canonical: `/community/market/listing/${id}` },
    robots: { index: false, follow: true },
  };
}

export const dynamic = "force-dynamic";

export default async function ListingDetailPage({ params }: PageProps) {
  const { id } = await params;
  const listing = await getListingById(id);
  if (!listing) notFound();
  const category = LISTING_TYPE_TO_CATEGORY[listing.listingType];
  const categoryConfig = getPrimaryCategoryConfig(category);

  return (
    <Container className="py-10">
      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div>
            <Link href={`/community/market/${category}`} className="text-sm text-sky-700 underline">
              ← {categoryConfig.label}一覧
            </Link>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <TypeBadge type={listing.listingType} />
              <StatusBadge status={listing.status} />
            </div>
            <h1 className="mt-2 break-words text-2xl font-extrabold text-slate-900">{listing.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-500">
              <PostingIdentity authorName={listing.authorName} postingMode={listing.postingMode} authorRole={listing.authorRole} />
              {listing.location ? <span>📍 {listing.location}</span> : null}
              <span>{listing.createdAt}</span>
            </div>
            {listing.postingMode === "delegated" ? (
              <p className="mt-2 rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-800">
                この掲載は運営が投稿者（{listing.representedParty}）の許可を得て代理で掲載しています（掲載代行）。
              </p>
            ) : null}
          </div>

          {listing.images.length > 0 ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {listing.images.map((url) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={url} src={url} alt="" className="h-40 w-full rounded-xl object-cover" loading="lazy" />
              ))}
            </div>
          ) : null}

          <ListingDetailBody listing={listing} />
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <ListingDetailActions listing={listing} />
          <AdBanner slotName="マーケット詳細サイド" />
        </aside>
      </div>
    </Container>
  );
}
