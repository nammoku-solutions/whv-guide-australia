"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Container } from "@/components/layout/Container";
import { AdminGate } from "@/components/admin/AdminGate";
import { supabase } from "@/lib/supabaseClient";
import { trackEvent } from "@/lib/analytics";

type Outcome = {
  candidateId: string;
  status: string;
  detail: string;
  relevance?: string;
  confidence?: number;
  duplicate?: boolean;
  groundingOk?: boolean;
  riskLevel?: string;
  newsItemId?: string | null;
  newsSlug?: string | null;
  impacts?: number;
  indexed?: boolean;
  errorCode?: string;
  preview?: {
    title: string;
    summary: string;
    whatChanged: string;
    whoIsAffected: string;
    whatToDo: string;
    sourcePublishedAt?: string;
  };
};

type SubmitResponse = {
  ok: boolean;
  id?: string;
  deduplicated?: boolean;
  canonicalUrl?: string;
  organisation?: string;
  riskLevel?: string;
  category?: string;
  outcome?: Outcome;
  error?: string;
  errorCode?: string;
};

const STATUS_LABEL: Record<string, string> = {
  published: "自動公開されました",
  review_required: "レビューが必要です",
  duplicate: "既存ニュースと重複",
  irrelevant: "WHV に無関係",
  skipped: "スキップ",
  failed: "処理に失敗",
  pending: "受理（未処理）",
  processing: "処理中",
};

const STATUS_TONE: Record<string, string> = {
  published: "border-emerald-300 bg-emerald-50 text-emerald-800",
  review_required: "border-amber-300 bg-amber-50 text-amber-800",
  duplicate: "border-slate-300 bg-slate-50 text-slate-700",
  irrelevant: "border-slate-300 bg-slate-50 text-slate-700",
  skipped: "border-slate-300 bg-slate-50 text-slate-700",
  failed: "border-rose-300 bg-rose-50 text-rose-800",
};

function Panel() {
  const [url, setUrl] = useState("");
  const [org, setOrg] = useState("");
  const [title, setTitle] = useState("");
  const [publishedAt, setPublishedAt] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [evidence, setEvidence] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resp, setResp] = useState<SubmitResponse | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const getToken = useCallback(async () => {
    if (!supabase) return null;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  const submit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    setResp(null);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/monitor/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          sourceUrl: url.trim(),
          sourceTitle: title.trim(),
          sourceOrganisation: org.trim() || null,
          sourcePublishedAt: publishedAt.trim(),
          sourceUpdatedAt: updatedAt.trim() || null,
          evidence: evidence.trim(),
          process: true,
        }),
      });
      const json: SubmitResponse = await res.json();
      if (!json.ok) throw new Error(json.error ?? "投函に失敗しました。");
      setResp(json);
      trackEvent("admin_news_candidate_submit", {
        status: json.outcome?.status ?? "pending",
        risk_level: json.riskLevel ?? "unknown",
        deduplicated: json.deduplicated ?? false,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "投函に失敗しました。");
    } finally {
      setSubmitting(false);
    }
  }, [url, title, org, publishedAt, updatedAt, evidence, getToken]);

  const act = useCallback(
    async (action: "approve" | "reject", newsId: string) => {
      setActing(action);
      try {
        const token = await getToken();
        const res = await fetch("/api/admin/monitor/action", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ action, id: newsId }),
        });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error ?? "操作に失敗しました。");
        trackEvent(action === "approve" ? "admin_news_candidate_publish" : "admin_news_candidate_review", {
          action,
        });
        setResp((prev) =>
          prev
            ? { ...prev, outcome: prev.outcome ? { ...prev.outcome, status: action === "approve" ? "published" : "rejected" } : prev.outcome }
            : prev,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "操作に失敗しました。");
      } finally {
        setActing(null);
      }
    },
    [getToken],
  );

  const outcome = resp?.outcome;
  const canReview = outcome?.status === "review_required" && outcome?.newsItemId;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-bold">公式ソースの取り込み</h2>
        <p className="mt-1 text-sm text-slate-600">
          公式（*.gov.au）ページの URL と、公式ページから抜き出した事実（要約・数値・日付）を貼り付けてください。
          全文コピーは不要です。生成は貼り付けた公式情報だけを根拠にします。
        </p>

        <div className="mt-4 space-y-4">
          <Field label="公式 URL（必須）">
            <input
              inputMode="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://immi.homeaffairs.gov.au/..."
              className="w-full rounded-xl border border-slate-300 px-3 py-3 text-base"
            />
          </Field>
          <Field label="公式タイトル（必須）">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例: Working Holiday visa pricing update"
              className="w-full rounded-xl border border-slate-300 px-3 py-3 text-base"
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="公式公開日（必須）">
              <input
                type="date"
                value={publishedAt}
                onChange={(e) => setPublishedAt(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-3 text-base"
              />
            </Field>
            <Field label="公式更新日（任意）">
              <input
                type="date"
                value={updatedAt}
                onChange={(e) => setUpdatedAt(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-3 text-base"
              />
            </Field>
          </div>
          <Field label="ソース組織（任意・未入力なら自動判定）">
            <input
              value={org}
              onChange={(e) => setOrg(e.target.value)}
              placeholder="例: Department of Home Affairs"
              className="w-full rounded-xl border border-slate-300 px-3 py-3 text-base"
            />
          </Field>
          <Field label="公式エビデンス（要約・事実・数値・日付／必須）">
            <textarea
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              rows={8}
              placeholder="公式ページから抜き出した事実を貼り付けてください（120 文字以上）。"
              className="w-full rounded-xl border border-slate-300 px-3 py-3 text-base leading-relaxed"
            />
          </Field>
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-sm font-semibold text-sky-700 underline"
            >
              入力した公式 URL を開いて確認
            </a>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>
      ) : null}

      {resp && outcome ? (
        <div className={`rounded-2xl border p-4 ${STATUS_TONE[outcome.status] ?? "border-slate-300 bg-slate-50 text-slate-700"}`}>
          <p className="text-base font-bold">{STATUS_LABEL[outcome.status] ?? outcome.status}</p>
          {resp.deduplicated ? (
            <p className="mt-1 text-sm">※ 既に投函済みの候補です（再送は安全にスキップされます）。</p>
          ) : null}
          <ul className="mt-2 space-y-1 text-sm">
            <li>関連度: {outcome.relevance ?? "-"}{outcome.confidence != null ? `（信頼度 ${outcome.confidence.toFixed(2)}）` : ""}</li>
            <li>リスク: {outcome.riskLevel ?? "-"}</li>
            <li>重複: {outcome.duplicate ? "はい" : "いいえ"}</li>
            <li>grounding: {outcome.groundingOk == null ? "-" : outcome.groundingOk ? "合格" : "不合格"}</li>
            <li>記事影響: {outcome.impacts ?? 0} 件</li>
            <li>AI 索引: {outcome.indexed ? "反映済み" : "未反映"}</li>
          </ul>
          {outcome.errorCode ? <p className="mt-1 text-sm">エラー: {outcome.errorCode}</p> : null}

          {outcome.preview ? (
            <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-slate-800">
              <p className="text-xs font-semibold text-slate-500">生成ニュースのプレビュー</p>
              <p className="mt-1 font-bold">{outcome.preview.title}</p>
              <p className="mt-1 text-sm">{outcome.preview.summary}</p>
              <p className="mt-2 text-sm"><span className="font-semibold">変更点：</span>{outcome.preview.whatChanged}</p>
              <p className="mt-1 text-sm"><span className="font-semibold">対象：</span>{outcome.preview.whoIsAffected}</p>
              <p className="mt-1 text-sm"><span className="font-semibold">対応：</span>{outcome.preview.whatToDo}</p>
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            {resp.canonicalUrl ? (
              <a
                href={resp.canonicalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
              >
                公式ソースを開く
              </a>
            ) : null}
            {outcome.newsSlug && outcome.status === "published" ? (
              <Link href={`/news/${outcome.newsSlug}`} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white">
                公開ニュースを開く
              </Link>
            ) : null}
          </div>

          {canReview ? (
            <div className="mt-3 flex gap-2">
              <button
                disabled={acting === "approve"}
                onClick={() => void act("approve", outcome.newsItemId!)}
                className="flex-1 rounded-lg bg-emerald-600 px-3 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                承認して公開
              </button>
              <button
                disabled={acting === "reject"}
                onClick={() => void act("reject", outcome.newsItemId!)}
                className="flex-1 rounded-lg bg-slate-200 px-3 py-3 text-sm font-semibold text-slate-700 disabled:opacity-50"
              >
                却下
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* スティッキーな主アクション（モバイル） */}
      <div className="sticky bottom-0 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <button
          disabled={submitting || !url.trim() || !title.trim() || !publishedAt.trim() || !evidence.trim()}
          onClick={() => void submit()}
          className="w-full rounded-xl bg-sky-600 px-4 py-3 text-base font-bold text-white disabled:opacity-50"
        >
          {submitting ? "処理中…" : "検証して取り込む"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span>
      {children}
    </label>
  );
}

export default function AdminMonitorImportPage() {
  return (
    <AdminGate>
      <Container className="max-w-2xl space-y-6 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-extrabold">公式ニュース候補の取り込み</h1>
          <Link href="/admin/monitor" className="text-sm font-semibold text-sky-700 underline">
            ← モニタへ
          </Link>
        </div>
        <Panel />
      </Container>
    </AdminGate>
  );
}
