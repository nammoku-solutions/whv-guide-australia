import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { ListingCard } from "@/components/market/ListingCard";
import { AdBanner } from "@/components/ads/AdBanner";
import { countActiveListingsByType, getLatestListings } from "@/lib/listings";
import { LISTING_TYPE_ORDER, LISTING_TYPES } from "@/lib/listingConfig";

export const metadata: Metadata = {
  title: "コミュニティマーケット",
  description: "ワーホリ向けの求人・シェアハウス・シェアメイト・車の売買など、ユーザー投稿型の掲載板。",
  alternates: { canonical: "/community/market" },
};

export const dynamic = "force-dynamic";

export default async function MarketHubPage() {
  const [counts, latest] = await Promise.all([
    countActiveListingsByType(),
    getLatestListings(6),
  ]);

  return (
    <Container className="space-y-8 py-10">
      <section className="rounded-3xl bg-slate-900 p-8 text-white">
        <p className="text-sm text-slate-400">コミュニティ</p>
        <h1 className="mt-1 text-3xl font-extrabold">マーケット・募集</h1>
        <p className="mt-2 max-w-2xl text-slate-300">
          求人・シェアハウス・シェアメイト・車の売買など、ワーホリ同士のユーザー投稿型の掲載です。掲示板（雑談・相談）とは分かれています。
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/community/market/new" className="rounded-full bg-sky-500 px-5 py-2 text-sm font-semibold text-white">
            掲載する（無料）
          </Link>
          <Link href="/community" className="rounded-full border border-slate-600 px-5 py-2 text-sm font-semibold text-slate-200">
            掲示板へ
          </Link>
          <Link href="/community/market/my" className="rounded-full border border-slate-600 px-5 py-2 text-sm font-semibold text-slate-200">
            マイページ
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {LISTING_TYPE_ORDER.map((type) => {
          const config = LISTING_TYPES[type];
          const count = counts[type];
          return (
            <Link
              key={type}
              href={`/community/market/${type}`}
              className="rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-sky-300 hover:shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="text-2xl" aria-hidden>{config.emoji}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                  {count} 件募集中
                </span>
              </div>
              <h2 className="mt-3 font-bold text-slate-900">{config.label}</h2>
              <p className="mt-1 text-sm text-slate-500">{config.description}</p>
            </Link>
          );
        })}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">新着の掲載</h2>
          <Link href="/community/market/job" className="text-sm text-sky-700 underline">求人一覧</Link>
        </div>
        {latest.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="text-sm text-slate-500">
              まだ掲載はありません。最初の掲載を無料で作成できます。
            </p>
            <Link href="/community/market/new" className="mt-3 inline-flex rounded-full bg-sky-700 px-4 py-2 text-sm font-semibold text-white">
              掲載する
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {latest.map((l) => <ListingCard key={l.id} listing={l} />)}
          </div>
        )}
      </section>

      <AdBanner slotName="マーケット一覧下部" />
    </Container>
  );
}
