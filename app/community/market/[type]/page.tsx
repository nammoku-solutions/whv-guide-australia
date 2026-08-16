import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/layout/Container";
import { ListingCard } from "@/components/market/ListingCard";
import { ListingFilters } from "@/components/market/ListingFilters";
import { SaveSearchButton } from "@/components/market/SaveSearchButton";
import { AdBanner } from "@/components/ads/AdBanner";
import { getListingsByType, type ListingFilters as Filters } from "@/lib/listings";
import { getListingTypeConfig, LISTING_TYPES } from "@/lib/listingConfig";
import type { ListingType } from "@/types/listing";

type PageProps = {
  params: Promise<{ type: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function isListingType(value: string): value is ListingType {
  return value in LISTING_TYPES;
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { type } = await params;
  if (!isListingType(type)) return { title: "マーケット" };
  const config = getListingTypeConfig(type);
  return {
    title: `${config.label} | コミュニティマーケット`,
    description: config.description,
    alternates: { canonical: `/community/market/${type}` },
  };
}

export const dynamic = "force-dynamic";

export default async function MarketTypePage({ params, searchParams }: PageProps) {
  const { type } = await params;
  if (!isListingType(type)) notFound();
  const config = getListingTypeConfig(type);
  const sp = await searchParams;

  const filters: Filters = {
    location: one(sp.location),
    industry: one(sp.industry),
    employmentType: one(sp.employmentType),
    farm: one(sp.farm) === "farm" ? "farm" : one(sp.farm) === "non_farm" ? "non_farm" : undefined,
    payType: one(sp.payType),
    roomType: one(sp.roomType),
    coupleAllowed: one(sp.coupleAllowed) === "1",
    state: one(sp.state),
    make: one(sp.make),
    transmission: one(sp.transmission),
    maxRent: one(sp.maxRent) ? Number(one(sp.maxRent)) : undefined,
    maxPrice: one(sp.maxPrice) ? Number(one(sp.maxPrice)) : undefined,
  };

  const listings = await getListingsByType(type, filters);

  return (
    <Container className="space-y-6 py-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/community/market" className="text-sm text-sky-700 underline">← マーケット</Link>
          <h1 className="mt-1 text-2xl font-extrabold text-slate-900">
            {config.emoji} {config.label}
          </h1>
        </div>
        <Link href={`/community/market/new?type=${type}`} className="inline-flex rounded-full bg-sky-700 px-4 py-2 text-sm font-semibold text-white">
          {config.createCta}
        </Link>
      </div>

      <ListingFilters type={type} />

      <div className="flex justify-end">
        <SaveSearchButton type={type} />
      </div>

      {listings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm text-slate-500">{config.emptyState}</p>
          <Link href={`/community/market/new?type=${type}`} className="mt-4 inline-flex rounded-full bg-sky-700 px-5 py-2 text-sm font-semibold text-white">
            {config.createCta}
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((l) => <ListingCard key={l.id} listing={l} />)}
        </div>
      )}

      <AdBanner slotName={`マーケット_${type}_下部`} />
    </Container>
  );
}
