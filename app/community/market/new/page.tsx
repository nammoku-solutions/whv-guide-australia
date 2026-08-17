import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { ListingForm } from "@/components/market/ListingForm";
import {
  isPrimaryCategory,
  LISTING_TYPES,
  PRIMARY_CATEGORIES,
  PRIMARY_CATEGORY_ORDER,
  resolveListingTaxonomy,
  type PrimaryCategory,
} from "@/lib/listingConfig";
import type { ListingType } from "@/types/listing";

export const metadata: Metadata = {
  title: "掲載する | コミュニティマーケット",
  description: "求人・家（シェアハウス）・売買（車ほか）を無料で掲載できます。",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isListingType(value: string | undefined): value is ListingType {
  return Boolean(value && value in LISTING_TYPES);
}

export default async function NewListingPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  let category = one(sp.category);
  let subcategory = one(sp.subcategory);

  // レガシー ?type=（旧サブタイプ含む）を新しいカテゴリ・サブカテゴリへ変換。
  const legacyType = one(sp.type);
  if (!category && isListingType(legacyType)) {
    const tax = resolveListingTaxonomy(legacyType);
    category = tax.category;
    subcategory = tax.subcategory;
  }

  // カテゴリ確定済み → サブカテゴリ選択 or フォーム。
  if (category && isPrimaryCategory(category)) {
    const cfg = PRIMARY_CATEGORIES[category];
    const sub = subcategory ? cfg.subcategories.find((s) => s.value === subcategory) : undefined;

    if (sub) {
      return (
        <Container className="py-10">
          <div className="mx-auto max-w-2xl space-y-6">
            <Link href={`/community/market/${category}`} className="text-sm text-sky-700 underline">
              ← {cfg.label}
            </Link>
            <ListingForm type={sub.listingType} subcategory={sub.value} />
          </div>
        </Container>
      );
    }

    return (
      <Container className="py-10">
        <div className="mx-auto max-w-2xl space-y-6">
          <Link href="/community/market/new" className="text-sm text-sky-700 underline">← 戻る</Link>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">
              {cfg.emoji} {cfg.label} — 種類を選ぶ
            </h1>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {cfg.subcategories.map((s) => (
                <Link
                  key={s.value}
                  href={`/community/market/new?category=${category}&subcategory=${s.value}`}
                  className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-sky-300"
                >
                  <p className="font-bold text-slate-900">{s.label}</p>
                  <p className="text-sm text-slate-500">{s.createCta}</p>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </Container>
    );
  }

  // 最初の入口: 3カテゴリを選ぶ。
  return (
    <Container className="py-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <Link href="/community/market" className="text-sm text-sky-700 underline">← マーケット</Link>
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">何を掲載しますか？</h1>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {PRIMARY_CATEGORY_ORDER.map((c: PrimaryCategory) => {
              const cfg = PRIMARY_CATEGORIES[c];
              return (
                <Link
                  key={c}
                  href={`/community/market/new?category=${c}`}
                  className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-sky-300"
                >
                  <span className="text-2xl" aria-hidden>{cfg.emoji}</span>
                  <p className="mt-2 font-bold text-slate-900">{cfg.label}</p>
                  <p className="text-sm text-slate-500">{cfg.description}</p>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </Container>
  );
}
