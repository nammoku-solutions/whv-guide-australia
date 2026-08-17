"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { hasSupabaseEnv, supabase } from "@/lib/supabaseClient";
import { useLocalStorageState } from "@/components/tools/useLocalStorageState";
import { summarizeWorkDays } from "@/lib/tools/logic/second-visa.mjs";
import { LISTING_PUBLIC_SELECT, mapApplicationRow, mapListingRow } from "@/lib/listings";
import { LISTING_TYPES } from "@/lib/listingConfig";
import { ListingCard } from "@/components/market/ListingCard";
import { StatusBadge } from "@/components/market/ListingBadges";
import { listSavedItems, type SavedItem } from "@/lib/savedItems";
import { listNotifications, type AppNotification } from "@/lib/notifications";
import { listSavedSearches, savedSearchUrl, deleteSavedSearch, type SavedSearch } from "@/lib/savedSearches";
import { getArticleBySlug } from "@/lib/articles";
import { getNewsBySlug } from "@/lib/news";
import { getToolBySlug } from "@/lib/tools/registry";
import { trackEvent } from "@/lib/analytics";
import type { Listing, ListingApplication } from "@/types/listing";

type WorkDayRecord = { id: string; date: string; hasEvidence: boolean; note?: string };

const APP_STATUS_LABEL: Record<ListingApplication["status"], string> = {
  applied: "応募済み",
  viewed: "確認済み",
  contacted: "連絡済み",
  interview: "面接",
  accepted: "採用",
  rejected: "不採用",
  withdrawn: "取り下げ",
};

type SavedItemView = { key: string; title: string; href: string; badge: string };

function resolveSavedItem(item: SavedItem): SavedItemView {
  if (item.itemType === "article") {
    const a = getArticleBySlug(item.itemId);
    return { key: item.id, title: a?.title ?? item.itemId, href: `/guides/${item.itemId}`, badge: "記事" };
  }
  if (item.itemType === "tool") {
    const t = getToolBySlug(item.itemId);
    return { key: item.id, title: t?.title ?? item.itemId, href: t?.path ?? "/tools", badge: "ツール" };
  }
  const n = getNewsBySlug(item.itemId);
  return { key: item.id, title: n?.title ?? item.itemId, href: `/news/${item.itemId}`, badge: "ニュース" };
}

export function MyPageDashboard() {
  const { isLoggedIn, profile, loading } = useAuth();
  const [records] = useLocalStorageState<WorkDayRecord[]>("whv-tool-88-day-records", []);
  const [myListings, setMyListings] = useState<Listing[]>([]);
  const [applications, setApplications] = useState<ListingApplication[]>([]);
  const [savedListings, setSavedListings] = useState<Listing[]>([]);
  const [savedItems, setSavedItems] = useState<SavedItem[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [ready, setReady] = useState(false);

  const eightyEight = useMemo(() => summarizeWorkDays(records), [records]);

  useEffect(() => {
    if (loading) return;
    if (!isLoggedIn || !supabase) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReady(true);
      return;
    }
    trackEvent("dashboard_view");
    let active = true;
    (async () => {
      const [listRes, appRes, savedRes] = await Promise.all([
        supabase!
          .from("listings")
          .select(LISTING_PUBLIC_SELECT)
          .eq("user_id", profile.id)
          .order("created_at", { ascending: false }),
        supabase!
          .from("listing_applications")
          .select(
            "id, listing_id, applicant_id, message, availability, contact_info, status, employer_response, created_at, updated_at, listings(title, listing_type)",
          )
          .eq("applicant_id", profile.id)
          .order("created_at", { ascending: false }),
        supabase!
          .from("saved_listings")
          .select(`id, listing_id, listings(${LISTING_PUBLIC_SELECT})`)
          .order("created_at", { ascending: false }),
      ]);
      const [items, notes, searches] = await Promise.all([
        listSavedItems(),
        listNotifications(5, 0),
        listSavedSearches(),
      ]);
      if (!active) return;
      setMyListings(((listRes.data as unknown as Parameters<typeof mapListingRow>[0][]) ?? []).map(mapListingRow));
      setApplications(((appRes.data as unknown as Parameters<typeof mapApplicationRow>[0][]) ?? []).map(mapApplicationRow));
      const savedRows = (savedRes.data as unknown as { listings: Parameters<typeof mapListingRow>[0] | null }[]) ?? [];
      setSavedListings(savedRows.filter((r) => r.listings).map((r) => mapListingRow(r.listings!)));
      setSavedItems(items);
      setNotifications(notes.items);
      setSavedSearches(searches);
      setReady(true);
    })();
    return () => {
      active = false;
    };
  }, [loading, isLoggedIn, profile.id]);

  if (loading) return <p className="text-sm text-slate-500">読み込み中…</p>;

  if (!hasSupabaseEnv) {
    return (
      <p className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
        この環境ではデータベースが未設定のため、マイページは表示できません。
      </p>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <p className="text-sm text-slate-600">
          マイページを使うには <Link href="/login" className="font-semibold text-sky-700 underline">ログイン</Link> してください。
        </p>
        <p className="mt-2 text-xs text-slate-400">
          アカウントを作成すると、記事・掲載の保存や応募状況の管理ができます。
        </p>
      </div>
    );
  }

  const savedJobs = savedListings.filter((l) => l.listingType === "job" || l.listingType === "farm_job");
  const savedHousing = savedListings.filter((l) => l.listingType === "housing" || l.listingType === "roommate");
  const savedMarket = savedListings.filter((l) => l.listingType === "vehicle" || l.listingType === "marketplace");
  const savedArticles = savedItems.filter((i) => i.itemType === "article");
  const savedNews = savedItems.filter((i) => i.itemType === "news");
  const savedTools = savedItems.filter((i) => i.itemType === "tool");
  const hasRecords = records.length > 0;

  return (
    <div className="space-y-8">
      {/* 重要な更新（最近の通知） */}
      <Section title="重要な更新" href="/notifications" hrefLabel="すべての通知">
        {!ready ? (
          <Skeleton />
        ) : notifications.length === 0 ? (
          <EmptyInline text="新しいお知らせはありません。記事や掲載を保存すると更新をお知らせします。" />
        ) : (
          <ul className="space-y-2">
            {notifications.map((n) => (
              <li key={n.id}>
                <Link
                  href={n.targetUrl ?? "/notifications"}
                  className={`block rounded-xl border p-3 text-sm transition hover:border-sky-300 ${
                    n.readAt ? "border-slate-200 bg-white" : "border-sky-200 bg-sky-50/60"
                  }`}
                >
                  <span className={n.readAt ? "text-slate-700" : "font-semibold text-slate-900"}>{n.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* 88日進捗 */}
      <Section title="セカンドビザ 88日カウンター" href="/tools/88-day-calculator" hrefLabel="カレンダーを開く">
        {hasRecords ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-end justify-between">
              <p className="text-sm text-slate-600">記録した勤務日</p>
              <p className="text-2xl font-extrabold text-sky-700">
                {eightyEight.worked}
                <span className="text-sm font-normal text-slate-400"> / {eightyEight.target} 日</span>
              </p>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.min(100, eightyEight.percent)}%` }} />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              証拠あり {eightyEight.evidenceDays} 日。この数値は記録の集計であり、ビザの可否や指定業務の該当性を保証するものではありません。
            </p>
          </div>
        ) : (
          <EmptyInline text="まだ勤務日の記録がありません。88日カウンターで記録を始めましょう。（記録はブラウザに保存されます）" />
        )}
      </Section>

      {/* 応募状況 */}
      <Section title="応募した求人" href="/community/market/my" hrefLabel="応募管理">
        {!ready ? (
          <Skeleton />
        ) : applications.length === 0 ? (
          <EmptyInline text="まだ応募した求人はありません。" href="/community/market/job" cta="求人を探す" />
        ) : (
          <ul className="space-y-2">
            {applications.slice(0, 5).map((a) => (
              <li key={a.id}>
                <Link
                  href={`/community/market/listing/${a.listingId}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm"
                >
                  <span className="min-w-0 truncate font-medium text-slate-800">
                    {a.listingType ? LISTING_TYPES[a.listingType].emoji : "💼"} {a.listingTitle ?? "求人"}
                  </span>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                    {APP_STATUS_LABEL[a.status]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* 保存した掲載 */}
      <Section title="保存した掲載">
        {!ready ? (
          <Skeleton />
        ) : savedListings.length === 0 ? (
          <EmptyInline text="保存した掲載はありません。" href="/community/market" cta="マーケットを見る" />
        ) : (
          <div className="space-y-4">
            <SavedListingGroup label="求人（一般・ファーム）" items={savedJobs} />
            <SavedListingGroup label="家（部屋・シェアメイト）" items={savedHousing} />
            <SavedListingGroup label="売買（車・その他）" items={savedMarket} />
          </div>
        )}
      </Section>

      {/* 自分の掲載 */}
      <Section title="自分の掲載" href="/community/market/new" hrefLabel="新規掲載">
        {!ready ? (
          <Skeleton />
        ) : myListings.length === 0 ? (
          <EmptyInline text="まだ掲載はありません。" href="/community/market/new" cta="掲載する" />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {myListings.map((l) => (
              <div key={l.id} className="space-y-1">
                <ListingCard listing={l} />
                <div className="pl-1"><StatusBadge status={l.status} /></div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* 保存した記事・ニュース・ツール */}
      <Section title="保存した記事・ニュース・ツール">
        {!ready ? (
          <Skeleton />
        ) : savedItems.length === 0 ? (
          <EmptyInline text="保存した記事・ニュース・ツールはありません。各ページの「保存する」から追加できます。" href="/guides" cta="記事を読む" />
        ) : (
          <div className="space-y-4">
            <SavedItemGroup label="記事" items={savedArticles} />
            <SavedItemGroup label="ニュース" items={savedNews} />
            <SavedItemGroup label="ツール" items={savedTools} />
          </div>
        )}
      </Section>

      {/* 保存した検索条件 */}
      <Section title="保存した検索条件">
        {!ready ? (
          <Skeleton />
        ) : savedSearches.length === 0 ? (
          <EmptyInline text="保存した検索条件はありません。マーケットの検索結果から条件を保存できます。" href="/community/market" cta="条件を探す" />
        ) : (
          <ul className="space-y-2">
            {savedSearches.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm">
                <Link href={savedSearchUrl(s)} className="min-w-0 flex-1 truncate font-medium text-sky-700 hover:underline">
                  🔎 {s.label}
                </Link>
                <button
                  type="button"
                  onClick={async () => {
                    await deleteSavedSearch(s.id);
                    setSavedSearches((prev) => prev.filter((x) => x.id !== s.id));
                  }}
                  className="shrink-0 text-xs text-slate-400 hover:text-rose-600"
                >
                  削除
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  href,
  hrefLabel,
  children,
}: {
  title: string;
  href?: string;
  hrefLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        {href && hrefLabel ? (
          <Link href={href} className="text-xs font-semibold text-sky-700 hover:underline">
            {hrefLabel} →
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function SavedListingGroup({ label, items }: { label: string; items: Listing[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}（{items.length}）</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {items.map((l) => (
          <div key={l.id} className="space-y-1">
            <ListingCard listing={l} />
            <div className="pl-1"><StatusBadge status={l.status} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SavedItemGroup({ label, items }: { label: string; items: SavedItem[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}（{items.length}）</p>
      <ul className="space-y-2">
        {items.map((item) => {
          const view = resolveSavedItem(item);
          return (
            <li key={view.key}>
              <Link
                href={view.href}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm transition hover:border-sky-300"
              >
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">{view.badge}</span>
                <span className="min-w-0 truncate font-medium text-slate-800">{view.title}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function EmptyInline({ text, href, cta }: { text: string; href?: string; cta?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center">
      <p className="text-sm text-slate-500">{text}</p>
      {href && cta ? (
        <Link href={href} className="mt-3 inline-flex rounded-full bg-sky-700 px-4 py-2 text-sm font-semibold text-white">
          {cta}
        </Link>
      ) : null}
    </div>
  );
}

function Skeleton() {
  return <div className="h-20 animate-pulse rounded-2xl border border-slate-200 bg-slate-50" />;
}
