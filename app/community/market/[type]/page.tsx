import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Container } from "@/components/layout/Container";
import { ListingCard } from "@/components/market/ListingCard";
import { ListingFilters } from "@/components/market/ListingFilters";
import { SaveSearchButton } from "@/components/market/SaveSearchButton";
import { AdBanner } from "@/components/ads/AdBanner";
import { getListingsByCategory, type ListingFilters as Filters } from "@/lib/listings";
import {
  getPrimaryCategoryConfig,
  isPrimaryCategory,
  LEGACY_TYPE_REDIRECTS,
  type PrimaryCategory,
} from "@/lib/listingConfig";

type PageProps = {
  params: Promise<{ type: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function activeSubcategory(category: PrimaryCategory, raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const cfg = getPrimaryCategoryConfig(category);
  return cfg.subcategories.some((s) => s.value === raw) ? raw : undefined;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { type } = await params;
  if (!isPrimaryCategory(type)) return { title: "マーケット" };
  const config = getPrimaryCategoryConfig(type);
  return {
    title: `${config.label} | コミュニティマーケット`,
    description: config.description,
    alternates: { canonical: `/community/market/${type}` },
  };
}

export const dynamic = "force-dynamic";

export default async function MarketCategoryPage({ params, searchParams }: PageProps) {
  const { type } = await params;

  // 旧サブタイプ・ルートは統合先へ恒久リダイレクト（チェーンなし）。
  const legacy = LEGACY_TYPE_REDIRECTS[type];
  if (legacy) {
    permanentRedirect(`/community/market/${legacy.category}?subcategory=${legacy.subcategory}`);
  }
  if (!isPrimaryCategory(type)) notFound();

  const config = getPrimaryCategoryConfig(type);
  const sp = await searchParams;
  const subcategory = activeSubcategory(type, one(sp.subcategory));

  const filters: Filters = {
    subcategory,
    location: one(sp.location),
    industry: one(sp.industry),
    employmentType: one(sp.employmentType),
    payType: one(sp.payType),
    roomType: one(sp.roomType),
    coupleAllowed: one(sp.coupleAllowed) === "1",
    state: one(sp.state),
    make: one(sp.make),
    transmission: one(sp.transmission),
    maxRent: one(sp.maxRent) ? Number(one(sp.maxRent)) : undefined,
    maxPrice: one(sp.maxPrice) ? Number(one(sp.maxPrice)) : undefined,
  };

  const listings = await getListingsByCategory(type, filters);
  const activeSub = subcategory
    ? config.subcategories.find((s) => s.value === subcategory)
    : undefined;
  const createHref = activeSub
    ? `/community/market/new?category=${type}&subcategory=${activeSub.value}`
    : `/community/market/new?category=${type}`;
  const createCta = activeSub?.createCta ?? config.createCta;
  const emptyState = activeSub?.emptyState ?? "この条件に合う掲載はまだありません。";

  return (
    <Container className="space-y-6 py-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/community/market" className="text-sm text-sky-700 underline">← マーケット</Link>
          <h1 className="mt-1 text-2xl font-extrabold text-slate-900">
            {config.emoji} {config.label}
          </h1>
        </div>
        <Link href={createHref} className="inline-flex rounded-full bg-sky-700 px-4 py-2 text-sm font-semibold text-white">
          {createCta}
        </Link>
      </div>

      {/* サブカテゴリのタブ（チップ）。トップレベルは増やさず、カテゴリ内で切替える。 */}
      <nav className="-mx-1 flex flex-wrap gap-2 overflow-x-auto pb-1">
        <SubTab category={type} value={undefined} current={subcategory} label="すべて" />
        {config.subcategories.map((sub) => (
          <SubTab key={sub.value} category={type} value={sub.value} current={subcategory} label={sub.label} />
        ))}
      </nav>

      <ListingFilters category={type} />

      <div className="flex justify-end">
        <SaveSearchButton category={type} subcategory={subcategory} />
      </div>

      {listings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm text-slate-500">{emptyState}</p>
          <Link href={createHref} className="mt-4 inline-flex rounded-full bg-sky-700 px-5 py-2 text-sm font-semibold text-white">
            {createCta}
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

function SubTab({
  category,
  value,
  current,
  label,
}: {
  category: PrimaryCategory;
  value: string | undefined;
  current: string | undefined;
  label: string;
}) {
  const active = (current ?? undefined) === (value ?? undefined);
  const href = value
    ? `/community/market/${category}?subcategory=${value}`
    : `/community/market/${category}`;
  return (
    <Link
      href={href}
      className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition ${
        active
          ? "border-sky-600 bg-sky-600 text-white"
          : "border-slate-300 bg-white text-slate-600 hover:border-sky-300"
      }`}
    >
      {label}
    </Link>
  );
}
