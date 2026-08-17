# WEEKLY_NEWS_OPERATIONS_GUIDE.md

オーストラリアワーホリコンパスの **週次ニュース運用ガイド**。初期セットアップ後は、通常の週次ニュース運用に
**PC は不要**。狙う運用フロー:

```
週次 ChatGPT リサーチ → 候補インボックス → 自動処理 → 低リスク公開 → 高リスクはスマホでレビュー
```

背景・設計・スキーマ・セキュリティの詳細は `EXTERNAL_NEWS_CANDIDATE_INBOX_REPORT.md` を参照。

---

## 0. 初期セットアップ（1 回のみ・PC 使用）

### 0-1. Supabase マイグレーション
Supabase SQL エディタで、既存の順序どおりに以下を適用（未適用のもののみ）:
`0011 → 0012_official... / 0012_my_page... → 0012_news_backfill → 0013_news_backfill_origin →`
**`0014_external_news_candidates.sql`**

適用後:
- **セキュリティアドバイザ**を実行（Supabase Dashboard → Advisors）。`external_news_candidates` の RLS
  有効・SECURITY DEFINER 関数の search_path 固定を確認。
- RLS 確認: 匿名/通常ユーザーが `external_news_candidates` を読めないこと、モデレーターが読めること。
- 制約/インデックス確認: `(source_url, source_evidence_hash)` UNIQUE、status/origin/evidence_origin の CHECK。

### 0-2. GitHub Secrets / Variables（既存の監視ジョブと共用）
Secrets: `GEMINI_API_KEY` / `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` /（任意）`AI_EMBEDDING_VERSION`。
Variables（任意）: `NEWS_AUTO_PUBLISH_LOW_RISK`（既定 true）/ `NEWS_AUTO_PUBLISH_HIGH_RISK`（既定 false）/
`EXTERNAL_NEWS_BATCH`（既定 10）。

### 0-3. （任意）機械取り込みエンドポイントを使う場合
- Vercel 環境変数に **`EXTERNAL_NEWS_INGEST_SECRET`**（十分に長いランダム値）を設定。**service-role キーとは
  別物**にすること。未設定なら `POST /api/news/candidates/ingest` は 503 で無効。
- （任意）`EXTERNAL_NEWS_INGEST_RATE_MAX`（既定 30/分）。

> ChatGPT に「接続済み Supabase」から直接 `external_news_candidates` に insert させる運用を選ぶ場合、
> この HTTP エンドポイントは不要（`EXTERNAL_NEWS_INGEST_SECRET` 未設定で無効のままにできる）。

---

## 1. 週次 ChatGPT ワークフロー（PC 不要）

1. ChatGPT が**公式の公開ソースのみ**を週次で閲覧する（Home Affairs / ATO / Fair Work / Services Australia /
   州政府など `*.gov.au`）。
2. 新しい WHV 関連の更新を見つける。
3. 既存の公開ニュース／候補インボックスと突き合わせ、**新規のみ**に絞る。
4. 公式ソースから**構造化された事実**（要約・事実・数値・日付）を抽出する。
5. 関連候補だけを投函する（下記いずれか）。
6. サイト側パイプラインが生成/公開/レビューを行う。

### 投函の形（候補フィールドのみ）
```json
{
  "sourceUrl": "https://www.ato.gov.au/tax-rates-and-codes/tax-rates-working-holiday-makers",
  "sourceTitle": "Tax rates – working holiday makers (updated)",
  "sourceOrganisation": "Australian Taxation Office",
  "sourcePublishedAt": "2026-07-30",
  "evidence": {
    "summary": "公式ページから抽出した簡潔な事実。",
    "facts": ["事実 1", "事実 2"],
    "numbers": [{ "value": "15%", "context": "最初の所得区分の税率" }],
    "dates": [{ "value": "2026-07-01", "context": "適用開始日" }]
  },
  "evidenceOrigin": "external_research"
}
```

### 投函方法（2 択）
- **A. 接続済み Supabase（推奨・キー不要のエージェント運用）**: `external_news_candidates` に上記フィールドで
  insert。RLS により書き込みは service-role/接続権限のみ。**service キーは ChatGPT に渡さない。**
- **B. 機械取り込み HTTP**: `POST /api/news/candidates/ingest`、ヘッダ `Authorization: Bearer <EXTERNAL_NEWS_INGEST_SECRET>`。

ChatGPT は**リポジトリ書き込み・ZIP・npm CLI・ローカル PC・Supabase service キーを必要としない。**

---

## 2. 週次チェックポイント方針（#18）

- 各実行は**直近 10〜14 日**の公式更新を対象にスキャンする。
- 既に見た事象は**下流 dedupe**（event_key / content_hash / タイトル×公式日）で除外されるため、
  再送は安全。
- 任意で小さな「週次リサーチ・チェックポイント」を持ってもよいが、**チェックポイントに強く依存しない**こと。
  公式の**遅れて出る訂正・更新**を取りこぼさないため、重複は dedupe に任せて範囲を毎回スキャンする。

---

## 3. スマホ運用フロー（PC 不要）

1. スマホで `/admin/monitor/import` を開く（モデレーター/管理者ログイン）。
2. 公式ページを別タブで開き、**URL・タイトル・公開日・事実**を貼り付ける（全文コピー不要）。
3. 「検証して取り込む」をタップ。
4. 結果を確認: 関連度・重複・リスク・grounding・**生成ニュースのプレビュー**・記事影響・ステータス。
   - **低/中リスクで全条件合格** → その場で**自動公開**。
   - **高リスク/不確実/grounding 不合格** → `review_required`。承認/却下ボタンで判断（承認で公開＋AI 索引）。
5. `review_required` になると**モデレーター全員にアプリ内通知**（「公式ニュース候補の確認が必要です」）が
   届く。通知先リンクからレビューできる。

`/admin/monitor` では外部候補の一覧（origin・ステータス・公式 URL・リンク済みニュース・エラー）と、
レビュー要求ニュース・自動公開ニュース・記事影響が一望できる。

---

## 4. 公開ポリシー（要約）

- 低/中リスク + 全チェック合格 → 自動公開。
- 高リスク（ビザ資格・417/462・規定労働・ビザ費用・税率/義務・最低賃金・雇用法・主要な法的/健康要件）
  → 常に review。
- grounding 失敗 → 自動公開しない。重複 → スキップ。無関係 → スキップ。
- しきい値/フラグは `lib/monitor/config.ts`（＝環境変数）が唯一の権威。

---

## 5. スケジュール処理（retry/fallback）

- 即時（Vercel）処理が主。スケジュールは取りこぼし回収用。
- `Process External News Candidates` ワークフロー（6 時間ごと + 手動）と、日次モニタ内の候補処理ステップ。
- 手動実行: GitHub → Actions → 対象ワークフロー → *Run workflow*。
- 外部エビデンス供給時は公式 fetch をしない。pending 0 件なら Gemini を呼ばない。

---

## 6. 復旧・保持

- **stale processing**: クラッシュ等で `processing` のまま 15 分以上経過した候補は次回実行で pending に戻る。
- **再送**: 同一 (URL, エビデンスハッシュ) は冪等。下流 dedupe が重複公開を防ぐ。
- **保持**: `prune_external_news_candidates(p_keep_days)`（既定 60 日）で `duplicate/irrelevant/skipped/failed`
  を削除。`published/review_required` は provenance として保持。必要に応じて Supabase のスケジュール（cron）で
  定期実行してよい（任意）。

---

## 7. 直接モニタは維持

直接モニタ（`npm run monitor` / 日次ワークフロー）は撤去していない。取得が degraded なソースは、この外部
インボックス（または既存 Manual Seed）で公式事実を取り込む。両経路は公開前に同じパイプラインへ収束する。

---

## 8. まとめ（初期セットアップ後は PC 不要）

- 週次: ChatGPT が公式をリサーチ → 候補投函（接続済み Supabase or 取り込み HTTP）。
- 自動: 低リスクは公開・高リスクは review + 通知。
- スマホ: 通知からレビュー → 承認/却下。ZIP・JSON 手編集・ターミナル・PC は不要。
