/**
 * ドキュメントのダウンロード実行ヘルパー（ブラウザ内で完結、サーバー送信なし）。
 * DOCX / PDF ライブラリは各生成関数の中で動的インポートするため、初期バンドルには含まれない。
 */

import type { StructuredDoc } from "@/lib/tools/documents/types";
import { documentToText } from "@/lib/tools/documents/model.mjs";

/** Blob をブラウザのダウンロードとして保存する。 */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function downloadDocx(doc: StructuredDoc): Promise<void> {
  const { buildDocxBlob } = await import("@/lib/tools/documents/docx");
  const blob = await buildDocxBlob(doc);
  triggerBlobDownload(blob, `${doc.fileBaseName}.docx`);
}

export async function downloadPdf(doc: StructuredDoc): Promise<void> {
  const { buildPdfBlob } = await import("@/lib/tools/documents/pdf");
  const blob = await buildPdfBlob(doc);
  triggerBlobDownload(blob, `${doc.fileBaseName}.pdf`);
}

export function downloadText(doc: StructuredDoc): void {
  const text = documentToText(doc);
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  triggerBlobDownload(blob, `${doc.fileBaseName}.txt`);
}
