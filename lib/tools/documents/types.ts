/**
 * 共有ドキュメントモデル（レジュメ／カバーレター）。
 *
 * このモデルを唯一の情報源（single source of truth）として、
 * ブラウザプレビュー・Word(.docx)・PDF・プレーンテキストのすべてを生成する。
 * これにより 4 つの出力の文言・見出し・箇条書き・順序が食い違わないようにする。
 */

/** ドキュメントを構成する 1 ブロック。 */
export type DocBlock =
  /** 先頭のヘッダー（氏名＋連絡先など）。氏名は強調表示される。 */
  | { type: "header"; name: string; contactLines: string[] }
  /** セクション見出し（例: PROFESSIONAL SUMMARY）。 */
  | { type: "heading"; text: string }
  /** 段落（自動的に折り返される流し込みテキスト）。 */
  | { type: "paragraph"; text: string }
  /** 単独行のまとまり（日付・署名など、折り返さず 1 行ずつ表示）。 */
  | { type: "lines"; lines: string[] }
  /** 箇条書き（黒丸）。 */
  | { type: "bullets"; items: string[] }
  /** 番号付きリスト。 */
  | { type: "numbered"; items: string[] };

/** 種別（分析イベントのパラメータやスタイル分岐に使用）。 */
export type DocKind = "resume" | "cover_letter";

/** 1 つの構造化ドキュメント（テンプレート）。 */
export type StructuredDoc = {
  id: string;
  /** タブ表示用の日本語ラベル。 */
  label: string;
  /** ダウンロードファイル名（拡張子なし）。 */
  fileBaseName: string;
  kind: DocKind;
  blocks: DocBlock[];
};
