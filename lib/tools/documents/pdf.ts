/**
 * 構造化ドキュメントから本物の PDF を生成する（完全クライアントサイド）。
 * `jspdf`（MIT ライセンス）を動的インポートし、初期バンドルには含めない。
 * A4・適切な余白・複数ページ対応・自動折り返し・選択可能テキストに対応する。
 *
 * ドキュメント本文は英語のため標準フォント（Helvetica）を埋め込み不要で使用できる。
 * UI は日本語だが、PDF に渡すのは英語の本文のみなので生成が壊れることはない。
 */

import type { StructuredDoc } from "@/lib/tools/documents/types";

export async function buildPdfBlob(doc: StructuredDoc): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "a4" });

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 56; // 約 2cm
  const maxW = pageW - margin * 2;
  let y = margin + 6;

  const newPageIfNeeded = (need: number) => {
    if (y + need > pageH - margin) {
      pdf.addPage();
      y = margin + 6;
    }
  };

  const writeWrapped = (text: string, width: number, lineHeight: number, x: number) => {
    const lines = pdf.splitTextToSize(text, width) as string[];
    for (const line of lines) {
      newPageIfNeeded(lineHeight);
      pdf.text(line, x, y);
      y += lineHeight;
    }
  };

  for (const block of doc.blocks) {
    switch (block.type) {
      case "header": {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(18);
        pdf.setTextColor(20, 20, 20);
        writeWrapped(block.name, maxW, 22, margin);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(10.5);
        pdf.setTextColor(70, 70, 70);
        for (const line of block.contactLines) writeWrapped(line, maxW, 14, margin);
        y += 8;
        break;
      }
      case "heading": {
        y += 8;
        newPageIfNeeded(18);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(12);
        pdf.setTextColor(20, 20, 20);
        writeWrapped(block.text, maxW, 16, margin);
        pdf.setDrawColor(205, 205, 205);
        pdf.line(margin, y - 6, pageW - margin, y - 6);
        y += 4;
        break;
      }
      case "paragraph": {
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(11);
        pdf.setTextColor(30, 30, 30);
        writeWrapped(block.text, maxW, 15, margin);
        y += 6;
        break;
      }
      case "lines": {
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(11);
        pdf.setTextColor(30, 30, 30);
        for (const line of block.lines) writeWrapped(line, maxW, 15, margin);
        y += 6;
        break;
      }
      case "bullets":
      case "numbered": {
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(11);
        pdf.setTextColor(30, 30, 30);
        const indent = 16;
        block.items.forEach((item, index) => {
          const marker = block.type === "numbered" ? `${index + 1}.` : "•";
          const lines = pdf.splitTextToSize(item, maxW - indent) as string[];
          newPageIfNeeded(15);
          pdf.text(marker, margin, y);
          pdf.text(lines[0], margin + indent, y);
          y += 15;
          for (let i = 1; i < lines.length; i++) {
            newPageIfNeeded(15);
            pdf.text(lines[i], margin + indent, y);
            y += 15;
          }
        });
        y += 6;
        break;
      }
      default:
        break;
    }
  }

  return pdf.output("blob");
}
