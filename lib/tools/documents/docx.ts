/**
 * 構造化ドキュメントから本物の Word (.docx) を生成する（完全クライアントサイド）。
 * `docx`（MIT ライセンス）を動的インポートし、初期バンドルには含めない。
 * A4・適切な余白・見出し・箇条書きに対応し、Word / Google Docs / LibreOffice で開ける。
 */

import type { StructuredDoc } from "@/lib/tools/documents/types";

/** A4（twips 単位。1cm ≈ 567 twips）。 */
const A4 = { width: 11906, height: 16838 };
const MARGIN = 1134; // 約 2cm

export async function buildDocxBlob(doc: StructuredDoc): Promise<Blob> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, LevelFormat } = await import("docx");

  const children: InstanceType<typeof Paragraph>[] = [];

  for (const block of doc.blocks) {
    switch (block.type) {
      case "header": {
        children.push(
          new Paragraph({
            spacing: { after: 60 },
            children: [new TextRun({ text: block.name, bold: true, size: 32 })],
          }),
        );
        for (const line of block.contactLines) {
          children.push(
            new Paragraph({
              spacing: { after: 40 },
              children: [new TextRun({ text: line, size: 20, color: "444444" })],
            }),
          );
        }
        break;
      }
      case "heading": {
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 220, after: 80 },
            children: [new TextRun({ text: block.text, bold: true })],
          }),
        );
        break;
      }
      case "paragraph": {
        children.push(
          new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: block.text })] }),
        );
        break;
      }
      case "lines": {
        block.lines.forEach((line, index) => {
          children.push(
            new Paragraph({
              spacing: { after: index === block.lines.length - 1 ? 120 : 40 },
              children: [new TextRun({ text: line })],
            }),
          );
        });
        break;
      }
      case "bullets": {
        for (const item of block.items) {
          children.push(new Paragraph({ text: item, bullet: { level: 0 }, spacing: { after: 40 } }));
        }
        break;
      }
      case "numbered": {
        for (const item of block.items) {
          children.push(
            new Paragraph({ text: item, numbering: { reference: "doc-numbered", level: 0 }, spacing: { after: 40 } }),
          );
        }
        break;
      }
      default:
        break;
    }
  }

  const document = new Document({
    creator: "オーストラリアワーホリコンパス",
    title: doc.fileBaseName,
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 22 } },
      },
    },
    numbering: {
      config: [
        {
          reference: "doc-numbered",
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.START,
              style: { paragraph: { indent: { left: 460, hanging: 260 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: { size: { width: A4.width, height: A4.height }, margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN } },
        },
        children,
      },
    ],
  });

  return Packer.toBlob(document);
}
