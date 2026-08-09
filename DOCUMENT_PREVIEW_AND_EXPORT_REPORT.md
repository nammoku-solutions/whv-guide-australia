# DOCUMENT_PREVIEW_AND_EXPORT_REPORT

レジュメ／カバーレターのサンプルツールに「プレビュー優先」の Word(.docx)・PDF ダウンロードを実装した記録。

対象サイト: オーストラリアワーホリコンパス（Next.js 16 / React 19 / Tailwind v4）

## 1. 既存実装の監査結果

対象ツール:

- `/downloads/resume-template`（`components/tools/ResumeTemplateDownload.tsx`）
- `/downloads/cover-letter-template`（`components/tools/CoverLetterTemplateDownload.tsx`）
- テンプレートデータ: `lib/tools/data/resume-templates.ts`（4件）, `lib/tools/data/cover-letter-templates.ts`（4件 + 応募チャネル別短文）

監査時点の分類:

| 項目 | 状態（変更前） |
| --- | --- |
| ブラウザプレビュー | 部分的（読み取り専用の等幅 `textarea`、A4 表現なし） |
| 編集可能プレビュー | 未実装 |
| プレーンテキスト DL | 実装済み（Blob、クライアント側） |
| DOCX 生成 | 未実装 |
| PDF 生成 | 未実装 |
| モバイルプレビュー | 部分的（`textarea` はレスポンシブ） |
| 印刷対応 | 未実装 |
| ファイル名生成 | 実装済み（`fileBaseName`） |
| プライバシー保護 | 実装済み（完全クライアント側・サーバー送信なし） |

その他の確認:

- 個人情報の入力欄・プロフィール連携・localStorage/sessionStorage 利用は当該ツールには**なし**（静的ひな型のみ）。
- GA4（`lib/analytics.ts` の `trackEvent`）は既存。ドキュメント系イベントは未送信だった。
- 純粋ロジックは `lib/tools/logic/*.mjs` に分離し `scripts/tools.test.mjs`（`node --test`）でテストする慣行あり。本実装もこれに従った。

## 2. 実装したプレビューフロー

1. テンプレートをタブで選択（職種別）。
2. A4 風の用紙にレンダリングされた**実際の内容**を即時プレビュー（偽の Word/PDF 画像ではなく、見出し・段落・箇条書き・余白を保持）。
3. `編集する` でテキストを編集可能（編集内容が Word/PDF/テキストすべてに反映）。`プレビューに戻る`／`編集をリセット` で復帰。
4. フォーマットを選択して明示的にダウンロード（自動ダウンロードはしない）。

コントロール: `編集する` / `Word（.docx）をダウンロード` / `PDF をダウンロード` / `テキスト（.txt）をダウンロード` / `テキストをコピー`。
フォーマット別の説明を併記（Word=内容を編集して応募に使いたい方 / PDF=レイアウトを保ったまま提出したい方）。

共通 UI コンポーネント: `components/tools/DocumentExporter.tsx`（レジュメ・カバーレター両方で再利用）。

## 3. 共有ドキュメントモデル（単一の情報源）

HTML プレビュー・Word・PDF・テキストを別々に保守せず、**1 つの構造化ドキュメント**から全出力を生成する。

- 型: `lib/tools/documents/types.ts`（`StructuredDoc` / `DocBlock`）
- 純ロジック: `lib/tools/documents/model.mjs`
  - `documentToText(doc)` … テキスト直列化（.txt / コピー）
  - `wrapText(text, width)` … ワードラップ
  - `parseTextToDoc(text)` … 編集後テキスト→構造化（ベストエフォート、編集時のみ使用）
  - `documentPlainText(doc)` … 出力間の内容一致検証用
- 対応ブロック: header（氏名＋連絡先）/ heading（セクション見出し）/ paragraph / lines（日付・署名など）/ bullets / numbered。
- テンプレート実データを構造化データへ移行（`resume-templates.ts` / `cover-letter-templates.ts`）。文言は変更していない。

## 4. Word(.docx) 生成

- ライブラリ: **`docx` v9.7.1（MIT）** を動的インポート（`lib/tools/documents/docx.ts`）。
- HTML を `.docx` にリネームしたものではなく、OOXML の**本物の .docx**（ZIP/PK 署名を確認）。
- A4 用紙・約 2cm 余白・`Calibri` フォント・見出し・箇条書き（`bullet`）・番号付き（`numbering`）に対応。選択／編集可能テキスト。
- レジュメはグラフィックを使わない ATS フレンドリーなシンプル構成。
- ファイル名例: `resume-hospitality.docx`, `cover-letter-general.docx`。

## 5. PDF 生成

- ライブラリ: **`jspdf` v4.2.1（MIT）** を動的インポート（`lib/tools/documents/pdf.ts`）。
- `%PDF-` ヘッダを持つ**本物の PDF**（A4 595×842pt を確認）。
- 標準フォント Helvetica を使用（フォントファイルの埋め込み・再配布なし）。本文は英語のため日本語 UI があっても生成は壊れない。
- `splitTextToSize` による自動折り返し、`y` カーソル管理による複数ページ対応、見出し・箇条書き・番号付きのハンギングインデント。選択可能テキスト。
- ファイル名例: `resume-farm.pdf`。

## 6. プレビューと出力の一致

- プレビュー・DOCX・PDF・テキストはすべて同一の `StructuredDoc` から派生するため、文言・セクション・箇条書き・順序・ユーザー入力値が一致する。
- 一致検証テスト（`scripts/tools.test.mjs`）: `documentPlainText(parseTextToDoc(documentToText(doc))) === documentPlainText(doc)`。
- 空欄の任意項目は捏造せず、現状のテンプレート挙動どおり（`[ ]` プレースホルダのまま）出力。

## 7. 個人情報とプライバシー

- 生成はすべてブラウザ内（`docx` / `jspdf` を動的 import）で完結。**外部変換 API・SaaS は不使用**。
- 個人情報（編集内容）はサーバーや第三者サービスへ送信されない。サーバー保存もしない。
- 編集内容はコンポーネントの state のみで保持（永続化なし）。データフローは従来のプライバシー配慮アーキテクチャを維持しているため、プライバシー方針の更新は不要。

## 8. ダウンロード UX / アクセス

- ログイン不要（公開サンプルのアクセス条件は従来どおり）。広告クリックの後ろに配置していない。
- 生成失敗・コピー失敗時は日本語のエラーメッセージを表示。自動リトライはしない。
- 印刷対応: `app/globals.css` の `@media print` でプレビュー用紙（`.doc-print-sheet`）のみを A4 全幅で出力。

## 9. 対応テンプレート

- レジュメ 4種: 接客・ホスピタリティ / ファーム・農作業 / 倉庫・物流 / IT・専門職。
- カバーレター 4種: 接客・ホスピタリティ / ファーム・農作業 / 倉庫・物流 / 汎用。
- 応募チャネル別短文（コピー専用）は従来どおり維持。
- ハードコードした 1件ではなく、全テンプレートに再利用可能なエクスポート基盤を適用。

## 10. モバイル対応

- プレビュー用紙は `max-w-[794px]` かつ `w-full` でビューポートに収まるようスケール（横スクロールでサイト全体が崩れない）。
- ダウンロードボタンは折り返し表示で常にアクセス可能・重ならない。長文も読める。

## 11. エラーハンドリング

- 生成失敗／未対応ブラウザ挙動／例外を `try/catch` で捕捉し、`役立つ日本語メッセージ`を表示。
- 必須データ欠落時も `documentToText` は捏造せず空を許容。

## 12. アナリティクス（GA4）

- `lib/analytics.ts` に `document_preview` / `document_download` を追加。
- パラメータ: `document_type`（resume / cover_letter）, `format`（docx / pdf / txt）, `template_id`。
- 氏名・メール・電話・本文などの個人情報は一切送信しない。

## 13. 使用ライブラリのライセンス

| ライブラリ | バージョン | ライセンス | 用途 | 処理場所 |
| --- | --- | --- | --- | --- |
| `docx` | ^9.7.1 | MIT | .docx 生成 | クライアント（動的 import） |
| `jspdf` | ^4.2.1 | MIT | .pdf 生成 | クライアント（動的 import） |

競合する文書生成ライブラリは追加していない（DOCX=1・PDF=1）。フォントは標準の Helvetica / Calibri のみで、独自フォントファイルの同梱・再配布はなし。

## 14. 変更したファイル

追加:

- `lib/tools/documents/types.ts`
- `lib/tools/documents/model.mjs`
- `lib/tools/documents/docx.ts`
- `lib/tools/documents/pdf.ts`
- `lib/tools/documents/download.ts`
- `components/tools/DocumentExporter.tsx`

変更:

- `lib/tools/data/resume-templates.ts`（構造化データへ移行）
- `lib/tools/data/cover-letter-templates.ts`（構造化データへ移行、短文は維持）
- `components/tools/ResumeTemplateDownload.tsx`（共通エクスポーターを使用）
- `components/tools/CoverLetterTemplateDownload.tsx`（共通エクスポーターを使用）
- `lib/analytics.ts`（ドキュメントイベント追加）
- `app/globals.css`（印刷スタイル追加）
- `scripts/tools.test.mjs`（ドキュメントモデルのテスト追加）
- `package.json` / `package-lock.json`（`docx`, `jspdf`）

## 15. 検証結果

| 検証 | 結果 |
| --- | --- |
| ユニットテスト（`node --test scripts/tools.test.mjs`） | ✅ 44/44 pass（ドキュメントモデル・一致検証を含む） |
| 型チェック（`tsc --noEmit`） | ✅ エラーなし |
| Lint（`eslint`） | ✅ エラーなし |
| DOCX 生成スモーク（Node） | ✅ ZIP/PK 署名・8.6KB の本物の .docx |
| PDF 生成スモーク（Node） | ✅ `%PDF-` ヘッダ・A4 595×842pt |
| 本番ビルド（`npm run build`） | ✅ 成功（442 静的ページ、`/downloads/*` は静的プリレンダー） |

コンテンツ検証の 66 warnings は既存の同一ハブ内グルーピング（cannibalization）に関する設計上の想定内の警告で、本変更とは無関係。

## 16. クライアント／サーバーの処理区分

- プレビュー・DOCX・PDF・テキスト生成・ダウンロードは**すべてクライアントサイド**。
- サーバー処理・外部変換 API・有料 SaaS への依存は**なし**（追加コスト 0）。

## 17. 残る手動タスク（任意）

- 実ブラウザ（Chrome / Safari / Firefox / iOS Safari）での目視確認と、生成した .docx を Microsoft Word / Google Docs / LibreOffice で開く最終チェック。
- 生成 PDF を実機のモバイルで開いての最終チェック。
- 現状の編集はテキスト全体の編集（構造化フィールド単位の入力フォームは未提供）。必要に応じてフィールド別入力 UI を将来追加可能。
