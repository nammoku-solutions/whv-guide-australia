import Link from "next/link";
import type { Metadata } from "next";
import { Container } from "@/components/layout/Container";
import { getFeaturedArticles } from "@/lib/articles";
import { getLatestForumPosts } from "@/lib/forum";
import { getNewsCategoryLabel } from "@/lib/news";
import { getLatestMergedNews } from "@/lib/newsAuto";
import { ArticleList } from "@/components/articles/ArticleList";
import { PostCard } from "@/components/forum/PostCard";
import { AdBanner } from "@/components/ads/AdBanner";
import { SearchBox } from "@/components/search/SearchBox";
import { popularTopics } from "@/lib/searchConfig";
import { categoryDirectory } from "@/lib/navigation";
import { absoluteUrl } from "@/lib/siteConfig";

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
  },
};

// トップの最新投稿を定期的に更新する（ISR）
export const revalidate = 60;

export default async function Home() {
  const featuredArticles = getFeaturedArticles(4);
  const latestPosts = await getLatestForumPosts(3);
  const latestNews = await getLatestMergedNews(3);

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "人気のワーホリガイド記事",
    itemListElement: featuredArticles.map((article, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: absoluteUrl(`/guides/${article.slug}`),
      name: article.title,
    })),
  };

  return (
    <div className="space-y-12 pb-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
      <section className="border-b border-sky-100 bg-sky-50/60 py-9 sm:py-12 lg:py-16">
        <Container className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,19rem)] lg:gap-12">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold text-sky-800">
              <span aria-hidden="true" className="h-1.5 w-1.5 bg-amber-400" />
              オーストラリアワーホリコンパス
            </p>
            <h1 className="mt-3 max-w-[20em] text-[clamp(1.75rem,4.7vw,3.25rem)] leading-[1.25] font-extrabold tracking-tight text-slate-950 text-pretty">
              オーストラリアのワーホリ情報を、準備から帰国まで
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-700 sm:text-base">
              ビザ・仕事・生活・税金・帰国手続きまで、必要な情報を必要な順番で学べる日本語ガイドです。
            </p>

            <div className="mt-6 max-w-xl">
              <SearchBox placeholder="例：TFN、ボンド、セカンドビザ" />
            </div>

            <div className="mt-3 flex max-w-xl flex-wrap items-center gap-x-3 text-sm">
              <span className="text-xs font-semibold text-slate-600">人気トピック</span>
              {popularTopics.map((topic) => (
                <Link
                  key={topic.href}
                  href={topic.href}
                  className="inline-flex min-h-9 items-center font-medium text-sky-800 underline decoration-sky-200 underline-offset-4 hover:decoration-current"
                >
                  {topic.label}
                </Link>
              ))}
            </div>
          </div>

          <nav aria-labelledby="home-guide-start" className="border-t border-sky-200 pt-4 lg:mt-1 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
            <h2 id="home-guide-start" className="text-sm font-bold text-sky-900">今のステップから探す</h2>
            <ol role="list" className="mt-2 divide-y divide-sky-200/80 border-b border-sky-200/80">
              {[
                ["/preparation", "渡航前の準備"],
                ["/arrival", "到着後の手続き"],
                ["/jobs", "現地で仕事を探す"],
                ["/second-visa", "セカンドビザを検討する"],
              ].map(([href, label], index) => (
                <li key={href}>
                  <Link href={href} className="group flex min-h-11 items-center gap-3 py-2 text-sm font-semibold text-slate-900 hover:text-sky-800">
                    <span aria-hidden="true" className="font-mono text-xs font-medium tabular-nums text-sky-700">0{index + 1}</span>
                    <span className="flex-1 group-hover:underline group-hover:underline-offset-4">{label}</span>
                    <span aria-hidden="true" className="text-sky-700">→</span>
                  </Link>
                </li>
              ))}
            </ol>
          </nav>
        </Container>
      </section>

      <Container className="space-y-12">
        <section className="space-y-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">カテゴリから探す</h2>
            <p className="mt-1 text-sm text-slate-600">
              知りたいテーマから、必要なガイドにまっすぐたどり着けます。
            </p>
          </div>
          <ul className="grid grid-cols-2 gap-x-4 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-6">
            {categoryDirectory.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="group flex h-full flex-col border-t border-slate-200 px-1 py-3.5 transition hover:border-sky-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
                >
                  <span className="flex min-h-5 items-start justify-between gap-1 text-sm font-bold text-slate-900 group-hover:text-sky-800">
                    {item.label}<span aria-hidden="true" className="text-sky-700">→</span>
                  </span>
                  {item.description ? (
                    <span className="mt-1 text-xs leading-relaxed text-slate-600">
                      {item.description}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-4">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">ニュース・お知らせ</h2>
              <p className="mt-1 text-sm text-slate-600">
                ビザ申請料の改定など、ワーホリに関わる最新情報をお届けします。
              </p>
            </div>
            <Link href="/news" className="shrink-0 text-sm font-semibold text-sky-700 hover:underline">
              お知らせ一覧 →
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {latestNews.map((item) => (
              <Link
                key={item.id}
                href={`/news/${item.slug}`}
                className="group border-t border-slate-200 py-4 transition hover:border-sky-600"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <time className="font-semibold text-slate-500" dateTime={item.date}>
                    {item.date}
                  </time>
                  <span className="font-semibold text-sky-800">
                    {getNewsCategoryLabel(item.category)}
                  </span>
                </div>
                <h3 className="mt-2 text-base font-bold text-slate-900 group-hover:text-sky-800">{item.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{item.summary}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-slate-900">人気記事</h2>
          <ArticleList articles={featuredArticles} />
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">お金・生活インフラ</h2>
            <p className="mt-1 text-sm text-slate-600">
              現金を持ち歩かなくても大丈夫。両替・送金から決済・交通までスマートに。
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <Link
              href="/money"
              className="border-t border-sky-200 pt-4 transition hover:border-sky-700"
            >
              <h3 className="text-lg font-bold text-sky-900">送金・両替（Wise）</h3>
              <p className="mt-2 text-sm text-sky-800">
                日本円→豪ドルはWiseが有利。マルチカレンシー口座とデビットで現金いらず。
              </p>
            </Link>
            <Link
              href="/transport"
              className="border-t border-sky-200 pt-4 transition hover:border-sky-700"
            >
              <h3 className="text-lg font-bold text-sky-900">交通・決済</h3>
              <p className="mt-2 text-sm text-sky-800">
                OpalやmykiもOK。クレカ/スマホのタッチ決済でそのまま乗車できます。
              </p>
            </Link>
            <Link
              href="/bank"
              className="border-t border-sky-200 pt-4 transition hover:border-sky-700"
            >
              <h3 className="text-lg font-bold text-sky-900">銀行口座・運転免許</h3>
              <p className="mt-2 text-sm text-sky-800">
                渡航前の口座開設、TFN登録、国際免許や現地免許への切り替えまで。
              </p>
            </Link>
          </div>
        </section>

        <AdBanner slotName="トップページ中段" />

        <section className="grid gap-4 md:grid-cols-2">
          <Link href="/farm" className="border-l-2 border-emerald-700 bg-emerald-50 p-4 sm:p-5">
            <h3 className="text-xl font-bold text-emerald-900">ファームジョブ</h3>
            <p className="mt-2 text-sm text-emerald-800">
              セカンドビザに必要な88日間の探し方と、地域・職種の選び方を解説します。
            </p>
          </Link>
          <Link href="/uber-eats" className="border-l-2 border-amber-500 bg-amber-50 p-4 sm:p-5">
            <h3 className="text-xl font-bold text-amber-900">ギグワーク</h3>
            <p className="mt-2 text-sm text-amber-800">
              Uber EatsやDoorDashの始め方、ABN取得、税金の扱いまでまとめました。
            </p>
          </Link>
        </section>

        <section className="space-y-4">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">エリアガイド</h2>
              <p className="mt-1 text-sm text-slate-600">
                主要都市の仕事・家賃・気候を比較。自分に合った拠点を見つけましょう。
              </p>
            </div>
            <Link href="/area" className="shrink-0 text-sm font-semibold text-sky-700 hover:underline">
              すべて見る →
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {[
              { label: "Sydney", slug: "area-sydney" },
              { label: "Melbourne", slug: "area-melbourne" },
              { label: "Brisbane", slug: "area-brisbane" },
              { label: "Perth", slug: "area-perth" },
              { label: "都市の選び方", slug: "area-overview" },
            ].map((area) => (
              <Link
                key={area.slug}
                href={`/guides/${area.slug}`}
                className="inline-flex min-h-11 items-center border-b border-slate-200 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-600 hover:text-sky-800"
              >
                {area.label}
              </Link>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-slate-900">掲示板の最新投稿</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {latestPosts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        </section>

        <AdBanner slotName="トップページ下部" />
      </Container>
    </div>
  );
}
