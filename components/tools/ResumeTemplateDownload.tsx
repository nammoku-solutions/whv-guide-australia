"use client";

import { RESUME_TEMPLATES } from "@/lib/tools/data/resume-templates";
import { DocumentExporter } from "@/components/tools/DocumentExporter";

/**
 * 職種別の英文レジュメのひな型を、A4 風プレビューで確認してから
 * Word(.docx) / PDF / テキストでダウンロードできる。
 * 生成はすべてブラウザ内（クライアントサイド）で完結し、サーバー送信はしない。
 */
export function ResumeTemplateDownload() {
  return <DocumentExporter templates={RESUME_TEMPLATES} tabsLabel="職種の選択（レジュメ）" />;
}
