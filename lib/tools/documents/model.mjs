/**
 * 共有ドキュメントモデルの純粋ロジック（React/DOM 非依存）。
 *
 * `node --test` で単体テストでき、クライアントコンポーネント（プレビュー・
 * .txt ダウンロード・DOCX/PDF 生成）から再利用する。ここでは構造化ドキュメント
 * （blocks）と各出力の橋渡しになる純関数のみを扱う。
 *
 * @typedef {(
 *   | { type: "header", name: string, contactLines: string[] }
 *   | { type: "heading", text: string }
 *   | { type: "paragraph", text: string }
 *   | { type: "lines", lines: string[] }
 *   | { type: "bullets", items: string[] }
 *   | { type: "numbered", items: string[] }
 * )} DocBlock
 * @typedef {{ id: string, label: string, fileBaseName: string, kind: string, blocks: DocBlock[] }} StructuredDoc
 */

/** テキスト折り返しの既定幅（半角文字数の目安）。 */
export const DEFAULT_WRAP_WIDTH = 80;

/**
 * 単純な貪欲法によるワードラップ。幅より長い単語はそのまま 1 行に残す。
 *
 * @param {string} text
 * @param {number} [width]
 * @returns {string[]} 折り返し後の行（空文字入力なら [""])
 */
export function wrapText(text, width = DEFAULT_WRAP_WIDTH) {
  const normalized = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return [""];
  const words = normalized.split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= width) {
      current += " " + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

/**
 * 構造化ドキュメントをプレーンテキストに直列化する（.txt ダウンロード／コピー用）。
 * ブロック間は空行で区切る。段落は `width` で折り返す。
 *
 * @param {StructuredDoc} doc
 * @param {{ width?: number }} [options]
 * @returns {string}
 */
export function documentToText(doc, options = {}) {
  const width = options.width ?? DEFAULT_WRAP_WIDTH;
  const out = [];
  for (const block of doc?.blocks ?? []) {
    switch (block.type) {
      case "header": {
        out.push(block.name);
        for (const line of block.contactLines ?? []) out.push(line);
        break;
      }
      case "heading": {
        out.push(block.text);
        break;
      }
      case "paragraph": {
        for (const line of wrapText(block.text, width)) out.push(line);
        break;
      }
      case "lines": {
        for (const line of block.lines ?? []) out.push(line);
        break;
      }
      case "bullets": {
        for (const item of block.items ?? []) {
          const wrapped = wrapText(item, width - 2);
          out.push(`- ${wrapped[0]}`);
          for (let i = 1; i < wrapped.length; i++) out.push(`  ${wrapped[i]}`);
        }
        break;
      }
      case "numbered": {
        (block.items ?? []).forEach((item, index) => {
          const prefix = `${index + 1}. `;
          const wrapped = wrapText(item, width - prefix.length);
          out.push(`${prefix}${wrapped[0]}`);
          for (let i = 1; i < wrapped.length; i++) {
            out.push(`${" ".repeat(prefix.length)}${wrapped[i]}`);
          }
        });
        break;
      }
      default:
        break;
    }
    out.push("");
  }
  return out.join("\n").replace(/\n+$/, "\n");
}

/**
 * 1 行がセクション見出し（英大文字主体）かどうかの判定。
 *
 * @param {string} line
 * @returns {boolean}
 */
function looksLikeHeading(line) {
  const t = line.trim();
  if (t.length < 2 || t.length > 48) return false;
  if (!/[A-Z]/.test(t)) return false;
  // 小文字を含まない（記号・数字・スペースは許容）。
  return !/[a-z]/.test(t);
}

/**
 * プレーンテキストを構造化ドキュメントへ変換する（ユーザー編集時のベストエフォート）。
 * 既定テンプレートは構造化データを直接使うため、この関数は編集後テキストにのみ用いる。
 *
 * @param {string} text
 * @param {{ id?: string, label?: string, fileBaseName?: string, kind?: string }} [meta]
 * @returns {StructuredDoc}
 */
export function parseTextToDoc(text, meta = {}) {
  const rawLines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n");
  /** @type {string[][]} */
  const segments = [];
  let current = [];
  for (const line of rawLines) {
    if (line.trim() === "") {
      if (current.length) segments.push(current);
      current = [];
    } else {
      current.push(line);
    }
  }
  if (current.length) segments.push(current);

  /** @type {DocBlock[]} */
  const blocks = [];
  segments.forEach((seg, index) => {
    const trimmed = seg.map((l) => l.trim());
    const allBullets = trimmed.every((l) => /^[-•]\s+/.test(l));
    const allNumbered = trimmed.every((l) => /^\d+[.)]\s+/.test(l));

    if (index === 0) {
      blocks.push({ type: "header", name: seg[0].trim(), contactLines: seg.slice(1).map((l) => l.trim()) });
      return;
    }
    if (allBullets) {
      blocks.push({ type: "bullets", items: trimmed.map((l) => l.replace(/^[-•]\s+/, "")) });
      return;
    }
    if (allNumbered) {
      blocks.push({ type: "numbered", items: trimmed.map((l) => l.replace(/^\d+[.)]\s+/, "")) });
      return;
    }
    if (seg.length === 1 && looksLikeHeading(seg[0])) {
      blocks.push({ type: "heading", text: seg[0].trim() });
      return;
    }
    if (seg.length === 1) {
      blocks.push({ type: "paragraph", text: seg[0].trim() });
      return;
    }
    // 複数行: 平均行長が長ければ折り返された段落とみなして結合、短ければ独立行として保持。
    const avg = trimmed.reduce((sum, l) => sum + l.length, 0) / trimmed.length;
    if (avg >= 50) {
      blocks.push({ type: "paragraph", text: trimmed.join(" ") });
    } else {
      blocks.push({ type: "lines", lines: trimmed });
    }
  });

  return {
    id: meta.id ?? "custom",
    label: meta.label ?? "編集済み",
    fileBaseName: meta.fileBaseName ?? "document",
    kind: meta.kind ?? "resume",
    blocks,
  };
}

/**
 * ドキュメントの可視テキストを正規化して返す（出力間の内容一致テスト用）。
 * ブロック種別の差異を無視し、文言・箇条書き・順序のみを比較できるようにする。
 *
 * @param {StructuredDoc} doc
 * @returns {string}
 */
export function documentPlainText(doc) {
  const parts = [];
  for (const block of doc?.blocks ?? []) {
    switch (block.type) {
      case "header":
        parts.push(block.name, ...(block.contactLines ?? []));
        break;
      case "heading":
        parts.push(block.text);
        break;
      case "paragraph":
        parts.push(block.text);
        break;
      case "lines":
        parts.push(...(block.lines ?? []));
        break;
      case "bullets":
      case "numbered":
        parts.push(...(block.items ?? []));
        break;
      default:
        break;
    }
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}
