import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { Container } from "@/components/layout/Container";
import { getAutomatedNews, type AutomatedNews } from "@/lib/newsAuto";
import type { ChangeGroup } from "@/lib/monitor/types";
import { siteConfig, absoluteUrl } from "@/lib/siteConfig";

export const metadata: Metadata = {
  title: "最近の変更点",
  description:
    "オーストラリア政府の公式情報（ビザ・仕事・税金・スーパー・車/免許・住まい）で確認された最近の変更点を、分野別にまとめています。各項目は公式一次情報にリンクしています。",
  alternates: { canonical: "/changes" },
};

// 自動検出ニュースを反映するため ISR（1時間）。
export const revalidate = 3600;

const GROUP_ORDER: ChangeGroup[] = [
  "visa",
  "work",
  "tax",
  "super",
  "cars",
  "housing",
  "other",
];

const GROUP_LABELS: Record<ChangeGroup, string> = {
  visa: "ビザ",
  work: "仕事・Fair Work",
  tax: "税金",
  super: "スーパー（Super）",
  cars: "車・運転免許",
  housing: "住まい・賃貸",
  other: "その他",
};

const RISK_LABELS: Record<AutomatedNews["riskLevel"], string> = {
  high: "重要",
  medium: "注意",
  low: "情報",
};

export default async function ChangesPage() {
  const items = await getAutomatedNews();

  const grouped = new Map<ChangeGroup, AutomatedNews[]>();
  for (const g of GROUP_ORDER) grouped.set(g, []);
  for (const item of items) {
    const g = grouped.get(item.changeGroup) ?? grouped.get("other")!;
    g.push(item);
  }

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "ホーム", item: siteConfig.url },
      { "@type": "ListItem", position: 2, name: "最近の変更点", item: absoluteUrl("/changes") },
    ],
  };

  const activeGroups = GROUP_ORDER.filter((g) => (grouped.get(g) ?? []).length > 0);

  return (
    <Container className="space-y-8 py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <Breadcrumbs items={[{ label: "ホーム", href: "/" }, { label: "最近の変更点" }]} />

      <section className="rounded-3xl bg-gradient-to-r from-emerald-700 to-teal-600 p-8 text-white">
        <h1 className="text-3xl font-extrabold">最近の変更点</h1>
        <p className="mt-3 max-w-2xl text-emerald-50">
          オーストラリア政府の公式ページで確認された変更を分野別にまとめています。各項目は
          公式一次情報にリンクしています。制度は変わることがあるため、重要な判断の前に必ず
          公式ページで最新情報をご確認ください。
        </p>
      </section>

      {activeGroups.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
          <p>
            現在、この一覧に掲載できる確認済みの変更点はまだありません。公式情報の変更を検出し、
            確認できしだいここに分野別で掲載します。最新のお知らせは
            <Link href="/news" className="mx-1 font-semibold text-sky-700 underline">
              ニュース
            </Link>
            もご覧ください。
          </p>
        </div>
      ) : (
        <div className="space-y-10">
          {activeGroups.map((group) => {
            const groupItems = grouped.get(group) ?? [];
            return (
              <section key={group} className="space-y-4">
                <h2 className="border-b border-slate-200 pb-2 text-xl font-bold text-slate-900">
                  {GROUP_LABELS[group]}
                  <span className="ml-2 text-sm font-normal text-slate-400">
                    {groupItems.length} 件
                  </span>
                </h2>
                <ul className="space-y-3">
                  {groupItems.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-2xl border border-slate-200 bg-white p-5"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <time className="font-semibold text-slate-500" dateTime={item.date}>
                          {item.date}
                        </time>
                        <span
                          className={`rounded-full px-2.5 py-0.5 font-semibold ${
                            item.riskLevel === "high"
                              ? "bg-rose-50 text-rose-700"
                              : item.riskLevel === "medium"
                                ? "bg-amber-50 text-amber-700"
                                : "bg-sky-50 text-sky-700"
                          }`}
                        >
                          {RISK_LABELS[item.riskLevel]}
                        </span>
                      </div>
                      <Link
                        href={`/news/${item.slug}`}
                        className="mt-2 block text-lg font-bold text-slate-900 hover:text-sky-700"
                      >
                        {item.title}
                      </Link>
                      <p className="mt-1 text-sm text-slate-600">{item.summary}</p>
                      <div className="mt-3 flex flex-wrap gap-4 text-xs">
                        <Link href={`/news/${item.slug}`} className="font-semibold text-sky-700 underline">
                          詳細ニュースを読む
                        </Link>
                        {item.relatedGuide ? (
                          <Link
                            href={`/guides/${item.relatedGuide}`}
                            className="font-semibold text-sky-700 underline"
                          >
                            関連ガイド
                          </Link>
                        ) : null}
                        {item.source ? (
                          <a
                            href={item.source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold text-slate-500 underline"
                          >
                            公式ソース
                          </a>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <div>
        <Link href="/news" className="text-sm font-semibold text-sky-700 underline">
          ← ニュース一覧に戻る
        </Link>
      </div>
    </Container>
  );
}
