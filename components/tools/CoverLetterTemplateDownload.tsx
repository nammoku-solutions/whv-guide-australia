"use client";

import { useState } from "react";
import {
  COVER_LETTER_TEMPLATES,
  COVER_LETTER_SHORT_MESSAGES,
} from "@/lib/tools/data/cover-letter-templates";
import { DocumentExporter } from "@/components/tools/DocumentExporter";

/**
 * 職種別の英文カバーレターのひな型を A4 風プレビューで確認してから
 * Word(.docx) / PDF / テキストでダウンロードできる。加えて応募チャネル別の
 * 短文メッセージ（コピー）を提供する。生成はすべてブラウザ内で完結し、サーバー送信はしない。
 */
export function CoverLetterTemplateDownload() {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyText = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2000);
    } catch {
      setCopiedId(null);
    }
  };

  return (
    <div className="space-y-8">
      <section className="space-y-5">
        <h2 className="text-lg font-bold text-slate-800">職種別カバーレター</h2>
        <DocumentExporter templates={COVER_LETTER_TEMPLATES} tabsLabel="職種の選択（カバーレター）" />
      </section>

      {/* Short channel messages */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-slate-800">応募チャネル別の短文</h2>
        <p className="text-sm text-slate-600">
          メール返信・店頭・SNS・応募フォームなど、場面別の短いメッセージです。コピーして使ってください。
        </p>
        <ul className="space-y-4">
          {COVER_LETTER_SHORT_MESSAGES.map((m) => (
            <li key={m.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-slate-800">{m.label}</h3>
                <button
                  type="button"
                  onClick={() => copyText(m.id, m.body)}
                  className="shrink-0 rounded-lg border border-sky-700 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
                >
                  {copiedId === m.id ? "コピー済み ✓" : "コピー"}
                </button>
              </div>
              <pre className="mt-2 whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-700">
                {m.body}
              </pre>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
