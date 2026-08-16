# OFFICIAL_SOURCE_MONITOR_AND_NEWS_AUTOMATION_REPORT.md

オーストラリアワーホリコンパスの「公式情報の自動モニタリング & ニュース更新システム」の
監査結果と実装内容をまとめます。既存の Vercel + Supabase + GitHub Actions + Gemini +
サイト内 RAG/インデックス構成を踏襲し、別サーバー・CMS・クローラ SaaS・有料ワークフロー
基盤は導入していません。

---

## 1. 監査（Audit）

| 領域 | 状態 | 所見 |
| --- | --- | --- |
| `/news`・ホームニュース | 実装済（静的） | `lib/newsData.ts` の手書き配列を `lib/news.ts` が配信。SEO（NewsArticle/ItemList/Breadcrumb JSON-LD、canonical、OG）は良好。**自動更新の仕組みは無し（missing）**。 |
| 記事メタ（`verifiedAt`・`officialSources`） | 実装済 | `types/article.ts` の `Article` に `verifiedAt` / `officialSources`（`{label,url,accessedAt}`）/ `tags` / `updatedAt` を保持。YMYL 記事に公式一次情報リンク。 |
| Supabase スキーマ/RLS/マイグレーション | 実装済 | `0001`〜`0010`。`public.is_moderator()`、service-role で RLS バイパス、SECURITY DEFINER RPC の anon/authenticated revoke パターンを確認。**監視・自動ニュース用テーブルは無し（missing）**。 |
| GitHub Actions | 部分的 | `ai-index.yml`（push paths + `workflow_dispatch`）のみ。**日次スケジュール監視は無し（missing）**。 |
| Gemini 構成 | 実装済 | `lib/ai/config.ts`（モデル・しきい値・フラグを env 集中管理）、`generator.ts` / `embeddings/provider.ts`（REST v1beta）。 |
| AI インデックス | 実装済 | `scripts/ai-index.mts` が `content_hash` 差分で変更 chunk のみ再埋め込み → `ai_article_chunks`。**ニュースのインデックスは対象外だった（missing）**。 |
| Admin / Moderation | 実装済 | `app/admin/*`＋`AdminGate`（`isModerator`）。API は Bearer トークン→`profiles.role` 検証（`app/api/ai/chat`）。**監視用の管理 UI は無し（missing）**。 |
| Analytics / SEO / sitemap | 実装済 | `app/sitemap.ts`・構造化データ・OG は整備済み。 |

**結論:** 情報基盤（記事メタ・RAG・Admin・Gemini・Actions）は揃っているが、
「公式ソース監視 → 変更検知 → 関連度分類 → ニュース生成 → 公開制御 → 記事影響 →
インデックス反映」の自動化パイプラインが欠けていた。既存機能を壊さず、この欠落分のみを追加した。

---

## 2. 実装したもの（新規追加、既存は保全）

### 2.1 公式ソース許可リスト（Registry）
- [lib/monitor/registry.ts](lib/monitor/registry.ts)：政府一次情報のみの allow-list。
  詳細は [OFFICIAL_SOURCE_REGISTRY.md](OFFICIAL_SOURCE_REGISTRY.md)。
- 静的定義はコードで version 管理。可変状態は DB（`monitor_source_state`）。

### 2.2 モニタリング（決定的）
- [lib/monitor/fetch.ts](lib/monitor/fetch.ts)：単一 URL 取得。失敗種別を厳密分類
  （success / timeout / http_error / blocked / parse_error / unexpected_structure）。
- [lib/monitor/extract.ts](lib/monitor/extract.ts)：`<main>` 優先、nav/footer/script/style/
  cookie/boilerplate を除去し空白正規化。RSS/Atom パーサも同梱（優先順位 rss > html）。
- 政府ドメイン全体はクロールしない。1 ソース = 1 ページ/フィード。

### 2.3 変更検知（AI 非関与）
- [lib/monitor/diff.ts](lib/monitor/diff.ts)：正規化本文の決定的ハッシュ（`lib/ai/hash` を再利用）＋行差分。
- フロー：fetch → extract → normalise → **hash → compare**。
  - 一致 → `last_checked` 更新のみで停止（**Gemini を呼ばない**）。
  - 初回観測 → ベースライン確立のみ（ニュース化しない）。
  - `changedChars < 閾値`（boilerplate 揺れ）→ ハッシュだけ更新して停止。
  - 意味のある変更 → スナップショット保存・変更記録の後に AI 処理へ。
- **AI は「変わったか」を判断しない。**

### 2.4 関連度分類（Gemini）
- [lib/monitor/classify.ts](lib/monitor/classify.ts)：highly_relevant / relevant /
  weakly_relevant / unrelated ＋ confidence。417/462・規定労働・ビザ規則・TFN・ABN・税・
  Super・DASP・最低賃金・Award・カジュアル・Rego・免許・賃貸/Bond を対象。レイアウトのみは unrelated。

### 2.5 ニュース生成（Gemini・グラウンディング）
- [lib/monitor/generate.ts](lib/monitor/generate.ts)：構造化日本語フィールド
  （title / summary / whatChanged / whoIsAffected / whatToDo / sourcePublishedAt / confidence）。
- **供給された公式コンテンツのみを根拠**にし、日付・料率・閾値・資格・URL・政府ルールを創作しない。
- `checkGrounding()`：生成文中の金額/率/URL が供給テキストに存在するか軽量検査（自動公開の可否に反映）。

### 2.6 公開ポリシー（決定的）
- [lib/monitor/publish.ts](lib/monitor/publish.ts)：低/中リスクの自動公開は
  「allow-list 公式 ∧ 自動公開適格 ∧ 意味のある変更 ∧ 関連度(高/中) ∧ 信頼度≥閾値 ∧
  grounding 合格 ∧ URL 有効 ∧ 非重複」を**すべて**満たす場合のみ。
- 高リスク（ビザ資格・規定労働・税率/義務・最低賃金/労働法・主要法的要件・医療要件）は
  既定で常に `review_required`。**高リスク既存記事を自動書換えしない**。
- フラグ：`NEWS_AUTO_PUBLISH_LOW_RISK=true`（既定）/ `NEWS_AUTO_PUBLISH_HIGH_RISK=false`（既定）。

### 2.7 重複防止（決定的）
- [lib/monitor/dedupe.ts](lib/monitor/dedupe.ts)：ソース URL・content hash・イベント同一性
  （sourceId＋正規化タイトル＋日付）で判定。DB 側にも一意制約（`monitor_changes(source_id,new_hash)`、
  `news_items(event_key)`）。類似度は必要時のみ（過剰計算を回避）。

### 2.8 記事影響分析
- [lib/monitor/impact.ts](lib/monitor/impact.ts)：公開記事を、ソース URL 関係・カテゴリ・タグで突合。
  影響度：unaffected / review_recommended / likely_outdated / requires_update。
  `previous_verifiedAt`・推奨アクションを付与。**AI がフラグしても記事は自動書換えしない**。

### 2.9 パイプライン
- [lib/monitor/pipeline.ts](lib/monitor/pipeline.ts)：上記を統合。Gemini 呼び出しは
  テスト用に注入可能（`classifyCaller` / `generateCaller` / `fetchImpl`）。

### 2.10 AI インデックス連携（変更分のみ）
- [lib/monitor/indexNews.ts](lib/monitor/indexNews.ts)：**承認/自動公開されたニュースのみ**を
  `ai_article_chunks` に content_hash 差分で upsert。都度の全体再インデックスはしない。
  下書き・レビュー中・却下・非公開スナップショット・管理用影響レコードはインデックスしない。

### 2.11 管理ダッシュボード（管理者のみ）
- [app/admin/monitor/page.tsx](app/admin/monitor/page.tsx)（`AdminGate`）＋
  [app/api/admin/monitor/route.ts](app/api/admin/monitor/route.ts)（GET サマリ）／
  [app/api/admin/monitor/action/route.ts](app/api/admin/monitor/action/route.ts)（POST 操作）。
- 表示：検出された変更・自動公開ニュース・レビュー要求ニュース・影響記事、深刻度・ソース URL・
  検出日・記事の確認日。
- 操作：承認（公開＋インデックス）／却下／関連なし／記事「確認済み」「解決済み」／記事・公式ソースを開く。
- API は Bearer トークン→`profiles.role` でモデレーター検証（[lib/monitor/adminAuth.ts](lib/monitor/adminAuth.ts)）。

### 2.12 公開「最近の変更点」
- [app/changes/page.tsx](app/changes/page.tsx)：Visa / 仕事・Fair Work / Tax / Super /
  車・免許 / 住まい 別にグルーピング。内部ニュース・関連ガイド・公式ソースへリンク。
  ISR（1 時間）。掲載できる確認済み変更が無い場合は「重要な変更なし」と断定せず、
  検出しだい掲載する旨を表示。

### 2.13 ニュース品質 / SEO
- 自動ニュースは既存 `/news/{slug}` ページ構造を再利用（canonical・title/description・OG・
  NewsArticle/Breadcrumb JSON-LD）。`/news`・`/changes`・ホームは手書き＋自動をマージ（ISR）。
- 自明でない変更のみニュース化。boilerplate 揺れはニュース化せず、軽微な項目は「最近の変更点」フィードへ。
- `sitemap.ts` に `/changes` と自動公開ニュースを追加。

---

## 3. データモデル（Supabase）

[supabase/migrations/0011_official_source_monitor.sql](supabase/migrations/0011_official_source_monitor.sql)

| テーブル | 用途 | 公開範囲(RLS) |
| --- | --- | --- |
| `monitor_source_state` | ソースごとの可変状態（`content_hash`・`last_checked`・`last_changed`・`last_status`・失敗回数） | モデレーター読取。書込は service-role のみ |
| `monitor_snapshots` | 正規化本文スナップショット（保持 N 件、RPC で剪定） | モデレーター読取のみ |
| `monitor_changes` | 検出変更（`(source_id,new_hash)` 一意） | モデレーター読取のみ |
| `news_items` | 自動生成ニュース（status で公開制御） | **published のみ匿名可**／モデレーターは全件 |
| `article_impacts` | 記事影響レコード（`(change_id,article_id)` 一意） | モデレーター読取のみ |
| RPC `prune_monitor_snapshots` | スナップショット剪定（SECURITY DEFINER, anon/authenticated revoke） | — |

---

## 4. GitHub Actions

[.github/workflows/monitor-sources.yml](.github/workflows/monitor-sources.yml)
- 日次 `schedule`（cron）＋ `workflow_dispatch`。
- フロー：`npm ci` → monitor（fetch → detect → generate/store → 変更分インデックス → 概要出力）。
- `concurrency: monitor-sources`（`cancel-in-progress: false`）で多重実行を防止。`permissions: contents: read`。
- 秘匿値は env 経由のみでログ出力しない。
- 既存の [.github/workflows/ai-index.yml](.github/workflows/ai-index.yml) はそのまま保全。

---

## 5. 失敗処理

- 取得失敗（timeout / http_error / blocked / parse_error / unexpected_structure）は
  `consecutive_failures` を加算し、**`content_hash` を更新しない**。
- **取得失敗は決して「変更なし」にしない。** 抽出結果が空なら `unexpected_structure` として失敗扱い。
- ジョブは 1 回の巡回で完結（無限監視ループなし）。ソース単位の例外は捕捉して他ソースの処理を継続。

---

## 6. セキュリティ / コスト

- すべての特権処理（監視・承認・インデックス起動）は service-role でサーバー側実行。
  通常ユーザーは承認/却下/監視状態変更/特権インデックスを実行できない（Bearer→role 検証）。
- 匿名クライアントは **published ニュースのみ** 読取可（RLS）。スナップショット・変更・影響は非公開。
- 無変更ページでは Gemini を呼ばない。ソース本文とモデルコンテキストは上限
  （`MONITOR_MAX_CONTENT_CHARS`）でキャップ。ソース間に待機を挿入。
- 秘匿値はコード・ログ・ドキュメントに出力しない。

---

## 7. テスト / 検証

[scripts/monitor.test.mts](scripts/monitor.test.mts)（`npm run test:monitor`、決定的フィクスチャ、20 ケース）：
無変更 / 意味のある変更 / boilerplate のみ / 無関係 / 重複 / 高リスクはレビュー /
低リスク自動公開適格 / grounding 失敗で自動公開阻止 / 取得失敗（500/429）/ フィード構造変化 /
記事影響検出 / レジストリ健全性（https・.gov.au・高リスク非自動公開）。

実行済みの検証（各 1 回・失敗時のみ 1 回の集中修正）：

| 検証 | 結果 |
| --- | --- |
| `npm run test:monitor` | ✅ 20 pass |
| `npm run test:ai` / `test:content` / `test:tools` | ✅ pass |
| `npx tsc --noEmit`（typecheck） | ✅ エラーなし |
| `npm run lint` | ✅ エラー 0（既存の warning 3 件のみ・本変更外） |
| `npm run build`（本番ビルド／prebuild 検証込み） | ✅ 成功 |

モバイル対応：管理・公開ページとも Tailwind のレスポンシブクラスで対応。

---

## 8. 手動セットアップ（デプロイ担当者向け）

### 8.1 Supabase
1. SQL エディタで [supabase/migrations/0011_official_source_monitor.sql](supabase/migrations/0011_official_source_monitor.sql) を適用（`0010` の後）。

### 8.2 GitHub リポジトリ Secrets（Settings → Secrets and variables → Actions）
- `GEMINI_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`（公開ニュース読取用・任意）
- `SUPABASE_SERVICE_ROLE_KEY`
- `AI_EMBEDDING_VERSION`（任意・未設定なら `v1`）

### 8.3 GitHub リポジトリ Variables（任意・公開ポリシー）
- `NEWS_AUTO_PUBLISH_LOW_RISK`（既定 `true`）
- `NEWS_AUTO_PUBLISH_HIGH_RISK`（既定 `false`）

### 8.4 Vercel 環境変数
- 上記の Supabase / Gemini 変数（既存の AI 機能と共通）。`NEXT_PUBLIC_SUPABASE_ANON_KEY` は
  `/news`・`/changes` の公開ニュース読取に必要。

### 8.5 任意の調整用 env
`MONITOR_FETCH_TIMEOUT_MS` / `MONITOR_MAX_CONTENT_CHARS` / `MONITOR_SNAPSHOT_RETENTION` /
`MONITOR_MIN_AUTOPUBLISH_CONFIDENCE` / `MONITOR_MIN_MEANINGFUL_DELTA` /
`MONITOR_SOURCE_DELAY_MS` / `MONITOR_GENERATION_MODEL`。

### 8.6 初回運用
- 初回の監視実行は各ソースの**ベースライン確立のみ**（ニュース生成なし）。2 回目以降で差分検出。
- 手動実行：Actions → *Monitor Official Sources* → *Run workflow*、またはローカルで `npm run monitor`。

---

## 9. 主要ファイル一覧

- DB: [supabase/migrations/0011_official_source_monitor.sql](supabase/migrations/0011_official_source_monitor.sql)
- ライブラリ: [lib/monitor/](lib/monitor/)（types / config / registry / fetch / extract / diff /
  gemini / classify / generate / dedupe / publish / impact / indexNews / db / pipeline / adminAuth）
- スクリプト: [scripts/monitor-sources.mts](scripts/monitor-sources.mts) / [scripts/monitor.test.mts](scripts/monitor.test.mts)
- API: [app/api/admin/monitor/route.ts](app/api/admin/monitor/route.ts) / [app/api/admin/monitor/action/route.ts](app/api/admin/monitor/action/route.ts)
- 画面: [app/admin/monitor/page.tsx](app/admin/monitor/page.tsx) / [app/changes/page.tsx](app/changes/page.tsx)
- ニュース統合: [lib/newsAuto.ts](lib/newsAuto.ts)（`/news`・`/news/[slug]`・ホーム・sitemap にマージ）
- Actions: [.github/workflows/monitor-sources.yml](.github/workflows/monitor-sources.yml)
- 参照: [OFFICIAL_SOURCE_REGISTRY.md](OFFICIAL_SOURCE_REGISTRY.md)
