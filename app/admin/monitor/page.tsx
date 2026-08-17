"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { AdminGate } from "@/components/admin/AdminGate";
import { supabase } from "@/lib/supabaseClient";

type ChangeRow = {
  id: string;
  organisation: string;
  source_name: string;
  url: string;
  category: string;
  risk_level: string;
  relevance: string | null;
  relevance_confidence: number | null;
  status: string;
  detected_at: string;
};

type NewsRow = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  change_group: string;
  risk_level: string;
  confidence: number;
  source_organisation: string | null;
  source_title: string | null;
  source_url: string | null;
  source_published_at: string | null;
  status: string;
  publication_mode: string;
  detected_at: string;
  related_guide_slug: string | null;
  is_backfill: boolean | null;
  backfill_origin: string | null;
};

type ImpactRow = {
  id: string;
  article_id: string;
  article_title: string;
  article_url: string;
  impact_level: string;
  reason: string | null;
  previous_verified_at: string | null;
  recommended_action: string | null;
  status: string;
};

type HealthRow = {
  sourceId: string;
  organisation: string;
  sourceName: string;
  url: string;
  riskLevel: string;
  health: "healthy" | "degraded" | "failing" | "never_succeeded";
  lastStatus: string | null;
  lastChecked: string | null;
  lastSuccess: string | null;
  lastChanged: string | null;
  consecutiveFailures: number;
  hasBaseline: boolean;
};

type Payload = { changes: ChangeRow[]; news: NewsRow[]; impacts: ImpactRow[]; health: HealthRow[]; external: ExternalRow[] };

type ExternalRow = {
  id: string;
  source_organisation: string | null;
  source_url: string;
  source_title: string;
  source_published_at: string | null;
  evidence_origin: string;
  origin: string;
  status: string;
  processing_attempts: number;
  last_error_code: string | null;
  news_item_id: string | null;
  submitted_at: string;
  processed_at: string | null;
};

const RISK_BADGE: Record<string, string> = {
  high: "bg-rose-50 text-rose-700",
  medium: "bg-amber-50 text-amber-700",
  low: "bg-sky-50 text-sky-700",
};

const HEALTH_BADGE: Record<string, string> = {
  healthy: "bg-emerald-50 text-emerald-700",
  degraded: "bg-amber-50 text-amber-700",
  failing: "bg-rose-50 text-rose-700",
  never_succeeded: "bg-slate-100 text-slate-600",
};

const EXTERNAL_STATUS_BADGE: Record<string, string> = {
  pending: "bg-slate-100 text-slate-600",
  processing: "bg-sky-50 text-sky-700",
  published: "bg-emerald-50 text-emerald-700",
  review_required: "bg-amber-50 text-amber-700",
  duplicate: "bg-slate-100 text-slate-500",
  irrelevant: "bg-slate-100 text-slate-500",
  skipped: "bg-slate-100 text-slate-500",
  failed: "bg-rose-50 text-rose-700",
  rejected: "bg-rose-50 text-rose-700",
};

const EXTERNAL_ORIGIN_LABEL: Record<string, string> = {
  chatgpt_weekly: "ChatGPT 週次",
  admin_mobile: "モバイル取り込み",
  manual_seed_bridge: "手動シード橋渡し",
  system: "システム",
};

function Panel() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const getToken = useCallback(async () => {
    if (!supabase) return null;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  const fetchData = useCallback(async (): Promise<Payload> => {
    const token = await getToken();
    const res = await fetch("/api/admin/monitor", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error ?? "読み込みに失敗しました。");
    return { changes: json.changes, news: json.news, impacts: json.impacts, health: json.health ?? [], external: json.external ?? [] };
  }, [getToken]);

  // setState は promise コールバック内でのみ行う（effect 内の同期 setState を避ける）。
  const reload = useCallback(() => {
    fetchData()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "読み込みに失敗しました。"),
      )
      .finally(() => setLoading(false));
  }, [fetchData]);

  useEffect(() => {
    reload();
  }, [reload]);

  const act = useCallback(
    async (action: string, id: string) => {
      setBusy(id + action);
      try {
        const token = await getToken();
        const res = await fetch("/api/admin/monitor/action", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ action, id }),
        });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error ?? "操作に失敗しました。");
        reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "操作に失敗しました。");
      } finally {
        setBusy(null);
      }
    },
    [getToken, reload],
  );

  if (loading) {
    return <p className="text-center text-sm text-slate-500">読み込み中…</p>;
  }
  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
        {error}
        <button onClick={() => reload()} className="ml-3 font-semibold underline">
          再試行
        </button>
      </div>
    );
  }
  if (!data) return null;

  const reviewNews = data.news.filter((n) => n.status === "review_required");
  const publishedNews = data.news.filter((n) => n.status === "published");
  const openImpacts = data.impacts.filter((i) => i.status === "open");
  const health = data.health ?? [];
  const unhealthy = health.filter((h) => h.health === "failing" || h.health === "never_succeeded");
  const external = data.external ?? [];
  const pendingExternal = external.filter((e) => e.status === "pending" || e.status === "processing");

  return (
    <div className="space-y-10">
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="レビュー要求" value={reviewNews.length} tone="text-amber-700" />
        <Stat label="自動公開" value={publishedNews.length} tone="text-emerald-700" />
        <Stat label="検出された変更" value={data.changes.length} tone="text-sky-700" />
        <Stat label="要確認の記事影響" value={openImpacts.length} tone="text-rose-700" />
      </div>

      {/* 外部ニュース候補（ChatGPT 週次 / モバイル取り込み） */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-bold">
            外部ニュース候補
            {pendingExternal.length > 0 ? (
              <span className="ml-2 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700">
                未処理 {pendingExternal.length}
              </span>
            ) : null}
          </h2>
          <Link
            href="/admin/monitor/import"
            className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white"
          >
            ＋ スマホで公式候補を取り込む
          </Link>
        </div>
        {external.length === 0 ? (
          <p className="text-sm text-slate-500">外部候補はまだありません（取り込みページから投函できます）。</p>
        ) : (
          <ul className="space-y-2">
            {external.slice(0, 30).map((e) => (
              <li key={e.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${EXTERNAL_STATUS_BADGE[e.status] ?? "bg-slate-100 text-slate-600"}`}>
                    {e.status}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
                    {EXTERNAL_ORIGIN_LABEL[e.origin] ?? e.origin}
                  </span>
                  <span className="text-slate-500">
                    {e.source_organisation ?? "-"}・公式日 {e.source_published_at?.slice(0, 10) ?? "?"}
                  </span>
                  {e.last_error_code ? (
                    <span className="rounded-full bg-rose-50 px-2 py-0.5 font-semibold text-rose-700">{e.last_error_code}</span>
                  ) : null}
                </div>
                <p className="mt-1 font-semibold text-slate-900">{e.source_title}</p>
                <div className="mt-1 flex flex-wrap gap-3 text-xs">
                  <a href={e.source_url} target="_blank" rel="noopener noreferrer" className="text-slate-500 underline">
                    公式ソースを開く
                  </a>
                  {e.news_item_id ? (
                    <span className="font-semibold text-emerald-700">ニュース生成済み</span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ソースヘルス（取得健全性の可視化） */}
      <section className="space-y-3">
        <h2 className="text-xl font-bold">
          ソースヘルス
          {unhealthy.length > 0 ? (
            <span className="ml-2 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">
              要注意 {unhealthy.length}
            </span>
          ) : null}
        </h2>
        {health.length === 0 ? (
          <p className="text-sm text-slate-500">監視状態はまだありません（スケジューラ実行後に表示）。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="text-slate-500">
                <tr>
                  <th className="px-2 py-1">ヘルス</th>
                  <th className="px-2 py-1">ソース</th>
                  <th className="px-2 py-1">状態</th>
                  <th className="px-2 py-1">最終確認</th>
                  <th className="px-2 py-1">最終成功</th>
                  <th className="px-2 py-1">連続失敗</th>
                  <th className="px-2 py-1">最終変更</th>
                </tr>
              </thead>
              <tbody>
                {health.map((h) => (
                  <tr key={h.sourceId} className="border-t border-slate-100">
                    <td className="px-2 py-1">
                      <span className={`rounded-full px-2 py-0.5 font-semibold ${HEALTH_BADGE[h.health] ?? ""}`}>
                        {h.health}
                      </span>
                    </td>
                    <td className="px-2 py-1">
                      <a href={h.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-slate-700 hover:text-sky-700">
                        {h.organisation}｜{h.sourceName}
                      </a>
                    </td>
                    <td className="px-2 py-1 text-slate-600">{h.lastStatus ?? "-"}</td>
                    <td className="px-2 py-1 text-slate-500">{h.lastChecked?.slice(0, 10) ?? "-"}</td>
                    <td className="px-2 py-1 text-slate-500">{h.lastSuccess?.slice(0, 10) ?? "-"}</td>
                    <td className={`px-2 py-1 ${h.consecutiveFailures > 0 ? "font-semibold text-rose-700" : "text-slate-500"}`}>
                      {h.consecutiveFailures}
                    </td>
                    <td className="px-2 py-1 text-slate-500">{h.lastChanged?.slice(0, 10) ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* レビュー要求ニュース */}
      <section className="space-y-3">
        <h2 className="text-xl font-bold">レビュー要求ニュース</h2>
        {reviewNews.length === 0 ? (
          <p className="text-sm text-slate-500">レビュー待ちはありません。</p>
        ) : (
          <ul className="space-y-3">
            {reviewNews.map((n) => (
              <li key={n.id} className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${RISK_BADGE[n.risk_level] ?? ""}`}>
                    {n.risk_level}
                  </span>
                  <span className="text-slate-500">
                    {n.change_group}・信頼度 {(n.confidence ?? 0).toFixed(2)}・{n.detected_at?.slice(0, 10)}
                  </span>
                  {n.is_backfill ? (
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700">
                      {n.backfill_origin === "external"
                        ? "外部候補"
                        : n.backfill_origin === "manual_seed"
                          ? "手動シード"
                          : "歴史バックフィル"}
                      ・公式日 {n.source_published_at?.slice(0, 10) ?? "?"}・取込 {n.detected_at?.slice(0, 10)}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 font-bold text-slate-900">{n.title}</p>
                <p className="mt-1 text-sm text-slate-600">{n.summary}</p>
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  {n.source_url ? (
                    <a href={n.source_url} target="_blank" rel="noopener noreferrer" className="font-semibold text-slate-500 underline">
                      公式ソースを開く
                    </a>
                  ) : null}
                  {n.related_guide_slug ? (
                    <Link href={`/guides/${n.related_guide_slug}`} className="font-semibold text-sky-700 underline">
                      関連ガイドを開く
                    </Link>
                  ) : null}
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    disabled={busy === n.id + "approve"}
                    onClick={() => void act("approve", n.id)}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    承認して公開
                  </button>
                  <button
                    disabled={busy === n.id + "reject"}
                    onClick={() => void act("reject", n.id)}
                    className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
                  >
                    却下
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 自動公開ニュース */}
      <section className="space-y-3">
        <h2 className="text-xl font-bold">自動公開ニュース</h2>
        {publishedNews.length === 0 ? (
          <p className="text-sm text-slate-500">自動公開はまだありません。</p>
        ) : (
          <ul className="space-y-2">
            {publishedNews.map((n) => (
              <li key={n.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/news/${n.slug}`} className="font-semibold text-slate-900 hover:text-sky-700">
                    {n.title}
                  </Link>
                  <span className="text-xs text-slate-400">{n.change_group}・{n.detected_at?.slice(0, 10)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 影響を受けうる記事 */}
      <section className="space-y-3">
        <h2 className="text-xl font-bold">影響を受けうる記事</h2>
        {openImpacts.length === 0 ? (
          <p className="text-sm text-slate-500">未対応の記事影響はありません。</p>
        ) : (
          <ul className="space-y-3">
            {openImpacts.map((im) => (
              <li key={im.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">
                    {im.impact_level}
                  </span>
                  {im.previous_verified_at ? (
                    <span className="text-slate-500">前回確認日: {im.previous_verified_at}</span>
                  ) : null}
                </div>
                <p className="mt-1 font-bold text-slate-900">{im.article_title}</p>
                {im.reason ? <p className="mt-1 text-sm text-slate-600">{im.reason}</p> : null}
                {im.recommended_action ? (
                  <p className="mt-1 text-xs text-slate-500">推奨: {im.recommended_action}</p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  <Link
                    href={im.article_url}
                    className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    記事を開く
                  </Link>
                  <button
                    disabled={busy === im.id + "mark_article_reviewed"}
                    onClick={() => void act("mark_article_reviewed", im.id)}
                    className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
                  >
                    確認済みにする
                  </button>
                  <button
                    disabled={busy === im.id + "resolve_article"}
                    onClick={() => void act("resolve_article", im.id)}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    解決済みにする
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 検出された変更 */}
      <section className="space-y-3">
        <h2 className="text-xl font-bold">検出された公式変更</h2>
        {data.changes.length === 0 ? (
          <p className="text-sm text-slate-500">検出された変更はありません。</p>
        ) : (
          <ul className="space-y-2">
            {data.changes.map((c) => (
              <li key={c.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900">
                    {c.organisation}｜{c.source_name}
                  </span>
                  <span className="text-xs text-slate-400">
                    {c.relevance ?? "未分類"}・{c.status}・{c.detected_at?.slice(0, 10)}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-3 text-xs">
                  <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-slate-500 underline">
                    公式ページ
                  </a>
                  {c.status !== "ignored" ? (
                    <button
                      disabled={busy === c.id + "mark_not_relevant"}
                      onClick={() => void act("mark_not_relevant", c.id)}
                      className="font-semibold text-slate-600 underline disabled:opacity-50"
                    >
                      関連なしにする
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}

export default function AdminMonitorPage() {
  return (
    <AdminGate>
      <Container className="space-y-8 py-10">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-extrabold">公式情報モニタリング</h1>
          <Link href="/admin" className="text-sm font-semibold text-sky-700 underline">
            ← 管理ダッシュボード
          </Link>
        </div>
        <Panel />
      </Container>
    </AdminGate>
  );
}
