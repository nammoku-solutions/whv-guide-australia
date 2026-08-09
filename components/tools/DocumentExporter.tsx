"use client";

import { useEffect, useMemo, useState } from "react";
import type { StructuredDoc, DocBlock } from "@/lib/tools/documents/types";
import { documentToText, parseTextToDoc } from "@/lib/tools/documents/model.mjs";
import { downloadDocx, downloadPdf, downloadText } from "@/lib/tools/documents/download";
import { trackEvent } from "@/lib/analytics";

type DocumentExporterProps = {
  templates: StructuredDoc[];
  /** タブの aria ラベル。 */
  tabsLabel: string;
};

/**
 * レジュメ／カバーレターの「プレビュー優先」ダウンロード UI（共通コンポーネント）。
 * 1 つの構造化ドキュメントから A4 風プレビュー・Word(.docx)・PDF・テキストを生成する。
 * 生成はすべてブラウザ内で完結し、個人情報をサーバーや外部サービスへ送らない。
 */
export function DocumentExporter({ templates, tabsLabel }: DocumentExporterProps) {
  const [activeId, setActiveId] = useState(templates[0]!.id);
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<null | "docx" | "pdf">(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const template = templates.find((t) => t.id === activeId) ?? templates[0]!;

  /** 編集済みならユーザーのテキストから、未編集なら元の構造化データからドキュメントを得る。 */
  const doc = useMemo<StructuredDoc>(() => {
    const draft = drafts[activeId];
    if (typeof draft === "string") {
      return parseTextToDoc(draft, {
        id: template.id,
        label: template.label,
        fileBaseName: template.fileBaseName,
        kind: template.kind,
      }) as unknown as StructuredDoc;
    }
    return template;
  }, [drafts, activeId, template]);

  const isEdited = typeof drafts[activeId] === "string";

  // プレビュー閲覧イベント（個人情報は送らない）。
  useEffect(() => {
    trackEvent("document_preview", { document_type: template.kind, template_id: template.id });
  }, [template.kind, template.id]);

  const selectTab = (id: string) => {
    setActiveId(id);
    setEditing(false);
    setError(null);
    setCopied(false);
  };

  const startEditing = () => {
    setDrafts((prev) =>
      typeof prev[activeId] === "string" ? prev : { ...prev, [activeId]: documentToText(template) },
    );
    setEditing(true);
    setError(null);
  };

  const resetEditing = () => {
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[activeId];
      return next;
    });
    setEditing(false);
    setError(null);
  };

  const download = async (format: "docx" | "pdf" | "txt") => {
    setError(null);
    try {
      if (format === "docx") {
        setBusy("docx");
        await downloadDocx(doc);
      } else if (format === "pdf") {
        setBusy("pdf");
        await downloadPdf(doc);
      } else {
        downloadText(doc);
      }
      trackEvent("document_download", {
        document_type: template.kind,
        format,
        template_id: template.id,
      });
    } catch {
      setError("ファイルの生成に失敗しました。ブラウザを最新に更新するか、別のブラウザでお試しください。");
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(documentToText(doc));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      setError("コピーに失敗しました。テキストでダウンロードしてご利用ください。");
    }
  };

  return (
    <div className="space-y-5">
      {/* Template tabs */}
      <div role="tablist" aria-label={tabsLabel} className="flex flex-wrap gap-2">
        {templates.map((t) => {
          const selected = t.id === activeId;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => selectTab(t.id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 ${
                selected ? "bg-sky-700 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Download controls */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 print:hidden">
        <p className="text-sm font-semibold text-slate-700">
          プレビュー中：<span className="text-sky-800">{template.label}</span>
          {isEdited ? <span className="ml-2 text-xs font-normal text-amber-700">（編集済み）</span> : null}
        </p>
        <div className="mt-3 flex flex-wrap gap-2.5">
          {editing ? (
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-xl bg-slate-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
            >
              プレビューに戻る
            </button>
          ) : (
            <button
              type="button"
              onClick={startEditing}
              className="rounded-xl border border-slate-400 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
            >
              編集する
            </button>
          )}
          <button
            type="button"
            onClick={() => download("docx")}
            disabled={busy !== null}
            className="rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy === "docx" ? "生成中…" : "Word（.docx）をダウンロード"}
          </button>
          <button
            type="button"
            onClick={() => download("pdf")}
            disabled={busy !== null}
            className="rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy === "pdf" ? "生成中…" : "PDF をダウンロード"}
          </button>
          <button
            type="button"
            onClick={() => download("txt")}
            disabled={busy !== null}
            className="rounded-xl border border-sky-700 px-4 py-2.5 text-sm font-semibold text-sky-700 transition hover:bg-sky-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            テキスト（.txt）をダウンロード
          </button>
          <button
            type="button"
            onClick={copy}
            className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
          >
            {copied ? "コピーしました ✓" : "テキストをコピー"}
          </button>
          {isEdited ? (
            <button
              type="button"
              onClick={resetEditing}
              className="rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-500 underline transition hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
            >
              編集をリセット
            </button>
          ) : null}
        </div>

        <dl className="mt-3 grid gap-1.5 text-xs text-slate-500 sm:grid-cols-2">
          <div>
            <dt className="inline font-semibold text-slate-600">Word：</dt>
            <dd className="inline"> 内容を編集して応募に使いたい方におすすめ</dd>
          </div>
          <div>
            <dt className="inline font-semibold text-slate-600">PDF：</dt>
            <dd className="inline"> レイアウトを保ったまま提出したい方におすすめ</dd>
          </div>
        </dl>

        {error ? (
          <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
            {error}
          </p>
        ) : null}
      </div>

      {/* Preview / edit area */}
      {editing ? (
        <div>
          <label htmlFor="doc-edit" className="mb-1 block text-xs font-semibold text-slate-600">
            テキストを編集（この内容が Word・PDF・テキストに反映されます）
          </label>
          <textarea
            id="doc-edit"
            value={drafts[activeId] ?? ""}
            onChange={(e) => setDrafts((prev) => ({ ...prev, [activeId]: e.target.value }))}
            rows={22}
            className="w-full rounded-2xl border border-slate-200 bg-white p-4 font-mono text-xs leading-relaxed text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            aria-label={`${template.label} の内容を編集`}
          />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-slate-100 p-3 sm:p-6">
          <PreviewSheet doc={doc} />
        </div>
      )}

      <p className="text-xs text-slate-500">
        [ ] の部分は自分の情報に置き換えてください。これはひな型（記入例）であり、そのまま提出するためのものではありません。ファイルはお使いのブラウザ内で生成され、内容がサーバーや外部サービスへ送信されることはありません。
      </p>
    </div>
  );
}

/** A4 風の用紙にドキュメントを描画するプレビュー。印刷時はこの領域のみを出力する。 */
function PreviewSheet({ doc }: { doc: StructuredDoc }) {
  return (
    <div
      className="doc-print-sheet mx-auto w-full max-w-[794px] rounded-sm bg-white px-6 py-8 text-slate-800 shadow-lg ring-1 ring-slate-200 sm:px-12 sm:py-14"
      aria-label="ドキュメントのプレビュー"
    >
      {doc.blocks.map((block, index) => (
        <BlockView key={index} block={block} />
      ))}
    </div>
  );
}

function BlockView({ block }: { block: DocBlock }) {
  switch (block.type) {
    case "header":
      return (
        <header className="mb-4">
          <p className="text-2xl font-bold leading-tight text-slate-900">{block.name}</p>
          {block.contactLines.map((line, i) => (
            <p key={i} className="text-sm text-slate-500">
              {line}
            </p>
          ))}
        </header>
      );
    case "heading":
      return (
        <h3 className="mb-2 mt-5 border-b border-slate-200 pb-1 text-sm font-bold uppercase tracking-wide text-slate-700">
          {block.text}
        </h3>
      );
    case "paragraph":
      return <p className="mb-3 text-sm leading-relaxed text-slate-700">{block.text}</p>;
    case "lines":
      return (
        <div className="mb-3">
          {block.lines.map((line, i) => (
            <p key={i} className="text-sm leading-relaxed text-slate-700">
              {line}
            </p>
          ))}
        </div>
      );
    case "bullets":
      return (
        <ul className="mb-3 list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-700">
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );
    case "numbered":
      return (
        <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-slate-700">
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ol>
      );
    default:
      return null;
  }
}
