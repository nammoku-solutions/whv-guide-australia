# EXTERNAL_NEWS_CANDIDATE_INBOX_REPORT.md

オーストラリアワーホリコンパスに **External News Candidate Inbox（外部ニュース候補インボックス）** を
追加した実装レポート。信頼できる外部リサーチ（例: 週次 ChatGPT 調査）やスマホからの管理者取り込みを、
公式 URL に紐づく構造化エビデンスとして受け取り、**既存の共有ニュースパイプラインへ流し込む取り込み層**。

> これは取り込み（ingestion）層のみ。関連度・grounding・dedupe・リスク・公開ポリシー・記事影響・
> AI 索引はすべて **既存の共有パイプライン**（`lib/monitor/backfill/pipeline.ts` の `processCandidate`）を
> 再利用する。別系統のニュース生成器は作っていない。直接モニタも撤去していない。

---

## 1. なぜ外部取り込みが必要か（劣化した直接モニタ）

本番（データセンター相当）からの直接取得は失敗する（`OFFICIAL_SOURCE_MONITOR_HEALTH_REPORT.md`）:

| ソース | 取得結果 |
| --- | --- |
| Department of Home Affairs | **blocked（403）** |
| Australian Taxation Office | **blocked（403）** |
| Fair Work Ombudsman | **timeout** |
| production `monitor_source_state` | 全ソース `never_succeeded` |

Bot 保護の回避（UA 偽装・プロキシ・ステルス・CAPTCHA 回避）は方針として行わない。よって公式ページを
安定して取得できない。**直接モニタは撤去せず維持**したうえで、信頼できる外部リサーチが公式一次情報の
「事実」を候補として投函できる**第 2 の経路**を追加した。両経路は公開前に同じパイプラインへ収束する。

---

## 2. アーキテクチャ

```
外部リサーチ / ChatGPT / スマホ管理者
        │  （公式 URL + 構造化エビデンス）
        ▼
external_news_candidates（pending）        ← 取り込み層（本実装）
        │
        ▼  共有プロセッサ processExternalRow → processCandidate（既存）
  公式ドメイン検証 → 正規化 → 共有 DTO 適応 → 関連度分類(AI)
  → dedupe → 日本語ニュース生成(AI, 供給エビデンスのみ) → grounding
  → リスク/公開ポリシー → 記事影響 → news_items 書き込み
        │
        ├─ 低/中リスクで全条件合格 → 自動公開（published）→ 増分 AI 索引
        └─ 高リスク/不確実/grounding 不合格 → review_required
                                             → モデレーター通知 → スマホ承認
```

**A. 直接モニタ**（既存・不変）: 公式 fetch → 現行パイプライン。
**B. 外部インボックス**（本実装）: 信頼リサーチ → 候補インボックス → 共有パイプライン。

---

## 3. スキーマ（マイグレーション `0014_external_news_candidates.sql`）

`external_news_candidates`（主な列）:

| 列 | 内容 |
| --- | --- |
| `id` | UUID PK |
| `source_organisation` | 公式組織名（任意・未指定ならソース定義から補完） |
| `source_url` | 正規化済み公式 URL（allow-list 検証済み・NOT NULL） |
| `source_title` | 公式タイトル |
| `source_published_at` | 公式公開日（date, NOT NULL・推測しない） |
| `source_updated_at` | 公式更新日（任意） |
| `source_evidence` | 構造化 DTO（jsonb） |
| `source_evidence_hash` | 正規化本文の決定的ハッシュ（取り込み dedupe 用） |
| `evidence_origin` | `official_fetch` / `external_research` / `operator_content` |
| `category_hint` | `visa/tax/cost/site/other`（任意） |
| `origin` | `chatgpt_weekly` / `admin_mobile` / `manual_seed_bridge` / `system` |
| `submitted_by` | モバイル取り込み時のモデレーター user id |
| `submitted_at` | 投函時刻 |
| `status` | 状態機械（下記） |
| `processing_started_at` / `processed_at` / `processing_attempts` | 処理監査 |
| `last_error_code` / `last_error_message` | 直近エラー |
| `news_item_id` | 生成された `news_items` へのリンク |
| `metadata` | 予備 jsonb |

`status`: `pending / processing / published / review_required / duplicate / irrelevant / skipped / failed / rejected`
（すべて CHECK 制約付き）。

`news_items` への追加: `external_candidate_id`（候補への逆リンク）、`backfill_origin` の CHECK を
`archive/manual_seed/external` に拡張。

インデックス（実パターンのみ・#27）: `(status, submitted_at desc)` / `source_url` / `source_published_at desc` /
`news_item_id`（部分） / `(source_url, source_evidence_hash)` **UNIQUE**（再送の冪等化）。

---

## 4. エビデンスモデル（構造化 DTO）

```json
{
  "summary": "公式ソースからの簡潔な事実抽出。",
  "facts": ["事実 1", "事実 2"],
  "numbers": [{ "value": "$...", "context": "..." }],
  "dates":   [{ "value": "2026-...", "context": "..." }],
  "text":    "（任意）オペレータが貼り付けた公式本文フォールバック"
}
```

- 全文（著作権つき）ページの複製は要求しない。
- **エビデンス優先順位**: ① 直接公式取得（可能な場合）→ ② allow-list の公式 URL に紐づく信頼リサーチ →
  ③ オペレータ貼り付けの公式本文。
- `lib/monitor/external/evidence.ts` の `evidenceToText()` が DTO を**単一の正規化テキスト**へ変換し、
  既存の grounding/生成/dedupe をそのまま再利用する（別生成器を作らない）。**生成は供給エビデンスだけを
  根拠にし、モデルの事前知識で補完しない。**
- `evidence_origin` は追跡するが、**公開安全性を迂回しない**（高リスクは origin に関わらず review）。

---

## 5. 公式ソース検証（allow-list）

`lib/monitor/backfill/officialDomains.ts` を再利用（Manual Seed と同一境界）:

- HTTPS のみ・ホスト名検証・トラッキング除去・末尾正規化。
- `*.gov.au` から導出した公式登録可能ドメインのみ受理。
- リダイレクト最終 URL も公式か検証。
- **拒否**: Facebook / Reddit / JAMS.TV / 移民エージェント / ブログ / アグリゲータ / 短縮 URL /
  非公式へのリダイレクト / 任意サイト。
- 一般ニュース取り込みシステムではない。

---

## 6. 取り込み dedupe

- 取り込み時: `(canonical source_url, source_evidence_hash)` の UNIQUE で**再送を冪等化**（同一候補は
  既存 id を返し、重複行を作らない）。
- 下流: 既存の `event_key` / `content_hash` / タイトル×公式日 dedupe（`checkBackfillDuplicate`）が
  **公開ニュースの一意性の最終権威**。既存 `news_items` と手書きニュース（`lib/newsData.ts`）の両方に照合。

---

## 7. 投函経路（narrow な契約）

| 主体 | 経路 | 認証 |
| --- | --- | --- |
| スマホ管理者 | `POST /api/admin/monitor/import` | 既存モデレーターセッション（Bearer → `profiles.role`） |
| 信頼機械取り込み | `POST /api/news/candidates/ingest` | サーバー専用スコープシークレット `EXTERNAL_NEWS_INGEST_SECRET`（Bearer, 定数時間比較, レート制限） |
| 接続済み Supabase | `external_news_candidates` へ直接 insert（RLS: service-role のみ書き込み可） | Supabase 接続の権限 |

**決して公開しない**: 任意 SQL・汎用テーブル/カラム変更・service-role キー・任意 URL 取り込み。
受理するのは定義済みの候補フィールドのみ（`submitExternalCandidate` が唯一の検証窓口）。
service-role キーは webhook secret に流用していない。

---

## 8. 共有プロセッサ・冪等性・並行性

`lib/monitor/external/processor.ts`:

- `processPendingCandidates(limit)`: stale 回収 → pending を**原子的 claim**（`status='pending'` の行のみ
  `processing` へ）→ 共有 `processCandidate` → 候補ステータス更新 → review 時はモデレーター通知。
- `processCandidateNow(id)`: モバイル投函直後の同期処理（Vercel 上で安全に完結・プレビュー返却）。
- **二重処理防止**: claim は Postgres の行単位更新で決定的。他ワーカーが処理中なら claim は null を返しスキップ。
- **stale 回復**: `processing` のまま古くなった候補（既定 15 分）を pending に戻す。
- **クラッシュ後**: 下流 dedupe（event_key/content_hash）により再送/再処理でも**重複公開しない**。
- 0 件 pending なら **Gemini を一切呼ばない**。候補ごとにエラー分離。

---

## 9. 公開ポリシー（現行ルールを迂回しない）

`decidePublication`（`lib/monitor/publish.ts`）をそのまま使用。低/中リスクは全条件合格時のみ自動公開、
高リスクは常に review。**高リスクトピック**: ビザ資格・417/462 ルール・規定労働・ビザ費用・税率/義務・
最低賃金・雇用法・主要な法的/健康要件。フラグ/しきい値（`lib/monitor/config.ts`）が唯一の権威。
grounding 不合格 → 自動公開しない。重複/無関係 → スキップ。

---

## 10. スマホ管理 UI

`/admin/monitor/import`（`AdminGate` 保護・モバイルファースト）:
- 入力: 公式 URL / タイトル / 公開日（date picker）/ 任意の組織・更新日 / 公式エビデンス（大きな textarea）。
- 「検証して取り込む」→ 投函 + 即時処理し、**関連度・重複・リスク・grounding・生成プレビュー・記事影響・
  ステータス**を表示。承認/却下（既存 `/api/admin/monitor/action` を再利用）・公式ソースを開く・
  公開ニュースを開く。
- UX: 一列レイアウト・大きなタップ領域・モバイル日付コントロール・スティッキー主アクション・
  横スクロールなし・明確なローディング/成功/エラー。生ペイロード/秘匿値は表示しない。
- JSON 編集・ターミナル・ファイル配置・PC は不要。

`/admin/monitor` は外部候補（origin ラベル: ChatGPT 週次 / モバイル取り込み等・ステータス・公式 URL・
リンク済みニュース・エラーコード）を新セクションで表示。外部由来ニュースは「外部候補」ラベルを付す。

---

## 11. レビュー通知

`processExternalRow` が `review_required` で終了したとき、既存 `create_notification`（SECURITY DEFINER・
service-role のみ EXECUTE）を再利用し、**モデレーター/管理者全員**へアプリ内通知を作成（`type='system'`・
タイトル「公式ニュース候補の確認が必要です」・`dedupe_key='external_review:<id>'`・リンク `/admin/monitor/import`）。
**公開前に一般ユーザーへは通知しない。** → **PASS**（DEFERRED ではない）。

---

## 12. スケジュール処理

- `scripts/process-external-candidates.mts`（`npm run news:candidates`）: pending をバッチ処理。
  **外部エビデンス供給時は公式 fetch をしない**・0 件なら Gemini を呼ばない・バッチ上限・エラー分離・
  簡潔サマリ（`GITHUB_STEP_SUMMARY`）・秘匿値ログ出力なし。
- 新規ワークフロー `.github/workflows/process-external-candidates.yml`（6 時間ごと + `workflow_dispatch`）。
- 既存日次モニタ `monitor-sources.yml` にも候補処理ステップを追加（両経路が収束）。原子的 claim により
  即時（Vercel）処理との二重処理は起きない。即時処理が主・スケジュールは retry/fallback。

---

## 13. AI 索引

公開（`published`）ニュースのみ既存の増分 News 索引（`indexPublishedNews`）で索引。
pending/processing/review_required/rejected/irrelevant/duplicate/failed・生候補エビデンスは索引しない。

---

## 14. 公開挙動

公開された外部ニュースは現行ニュースと同一挙動: `/news`・`/news/[slug]`・`/changes`・ホーム・sitemap・
canonical・OG・構造化データ・関連記事・出典表記・公式日・AI 索引。**別の公開「外部ニュース」カテゴリは
作らない**（`news_items` に統合、`backfill_origin='external'` は監査ラベルのみ）。

---

## 15. RLS / セキュリティ

- `external_news_candidates`: RLS 有効。**匿名/通常認証ユーザーはアクセス不可**。モデレーター/管理者は
  SELECT のみ。**書き込みポリシーは無し = service-role 専用**。公開ユーザーは処理/承認できない。
- `prune_external_news_candidates(int)`: SECURITY DEFINER・`set search_path=public`・PUBLIC/anon/authenticated
  から REVOKE・service_role にのみ EXECUTE 付与。
- service-role キーはサーバー専用のまま（webhook secret に流用しない）。
- **Supabase セキュリティアドバイザは、マイグレーション適用後にオペレータが実行する**（本環境では
  本番 DB へ未適用のため未実行）。手順は `WEEKLY_NEWS_OPERATIONS_GUIDE.md`。

---

## 16. 保持（retention）

`prune_external_news_candidates(p_keep_days)`（既定 60 日）が `duplicate/irrelevant/skipped/failed` の
古い行を削除。`published/review_required` の provenance（origin・submitted_at・公式 URL/タイトル/日付・
エビデンスハッシュ・処理結果・`news_item_id`）は保持。chain-of-thought は保存しない。

---

## 17. 週次 ChatGPT 互換

ChatGPT は次を必要としない: リポジトリ書き込み・ZIP 作成・npm CLI・ローカル PC・Supabase service キー。
週次フローと運用は `WEEKLY_NEWS_OPERATIONS_GUIDE.md` に記載。

---

## 18. テスト / 検証

| 検証 | 結果 |
| --- | --- |
| `npm run test:external`（検証/処理/並行/回復/エビデンス適応 15 ケース） | ✅ 15 pass |
| `npm run test:monitor`（直接モニタ回帰） | ✅ 20 pass |
| `npm run test:backfill`（歴史バックフィル回帰） | ✅ 33 pass |
| `npm run test:backfill:seed`（Manual Seed / contentFile 回帰） | ✅ 43 pass |
| `npm run test:monitor:health`（ヘルス回帰） | ✅ 13 pass |
| `npx tsc --noEmit` | ✅ エラーなし |
| `npm run lint` | ✅ エラー 0（既存 warning 4 のみ） |
| `npm run build` | ✅ Compiled successfully（※ 本サンドボックスはオフラインのため Google Fonts 取得で最終段が失敗。コードは無関係） |

---

## 19. ハード要件の遵守

- 直接モニタを撤去していない（A/B の 2 経路が共存・収束）。直接モニタが健全とは主張しない。
- News パイプラインを作り直していない（`processCandidate` を再利用）。
- dedupe・grounding・リスク・RLS・AI 索引規則を弱めていない。
- 秘匿値・生の政府本文・chain-of-thought を保存/ログ出力しない。
