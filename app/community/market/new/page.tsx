import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { ListingForm } from "@/components/market/ListingForm";
import { LISTING_TYPE_ORDER, LISTING_TYPES } from "@/lib/listingConfig";
import type { ListingType } from "@/types/listing";

export const metadata: Metadata = {
  title: "掲載する | コミュニティマーケット",
  description: "求人・シェアハウス・車などを無料で掲載できます。",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function isListingType(value: string | undefined): value is ListingType {
  return Boolean(value && value in LISTING_TYPES);
}

export default async function NewListingPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const typeParam = Array.isArray(sp.type) ? sp.type[0] : sp.type;

  return (
    <Container className="py-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <Link href="/community/market" className="text-sm text-sky-700 underline">← マーケット</Link>
        {isListingType(typeParam) ? (
          <ListingForm type={typeParam} />
        ) : (
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">何を掲載しますか？</h1>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {LISTING_TYPE_ORDER.map((type) => {
                const config = LISTING_TYPES[type];
                return (
                  <Link
                    key={type}
                    href={`/community/market/new?type=${type}`}
                    className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-sky-300"
                  >
                    <span className="text-2xl" aria-hidden>{config.emoji}</span>
                    <p className="mt-2 font-bold text-slate-900">{config.label}</p>
                    <p className="text-sm text-slate-500">{config.description}</p>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Container>
  );
}
