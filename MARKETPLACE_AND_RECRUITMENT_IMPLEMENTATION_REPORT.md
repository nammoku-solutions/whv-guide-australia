# マーケット & 求人・応募システム 実装レポート

オーストラリアワーホリコンパス（whv-guide-australia）に、ユーザー投稿型のリスティング（掲載）
および求人応募システムを追加した際の監査・実装記録。

---

## 1. サマリー

- **監査結果**: 実装前の時点で、マーケット／求人・応募機能は **一切存在しなかった**（完全に未実装）。
  掲示板（`community` フォーラム）はあったが、通常のディスカッション投稿のみで、
  リスティング・応募・保存・掲載代行といった概念は皆無だった。
- **方針**: 既存の認証（Supabase クライアント認証 + RLS）とモデレーション基盤を **置き換えず再利用** し、
  既存パターン（クライアント側 mutation を RLS で保護、サーバー側は anon で読み取り）に沿って
  新しい「マーケット」機能を垂直スライスとして追加した。
- **公開記事の URL は一切変更していない**。既存の無関係な UI／機能も再設計していない。
- **フェイクデータ（架空の求人・雇用主・応募者・車両など）は一切作成していない**。

---

## 2. 実装前に既に存在していたもの（再利用）

| 領域 | 既存資産 | 本実装での扱い |
| --- | --- | --- |
| 認証 | `useAuth()` / `AuthProvider`（Supabase, メール+電話認証, `canAct`） | そのまま再利用。掲載・応募・保存の可否判定に使用 |
| DB / RLS | Supabase + `is_moderator()` / `is_active_user()`（SECURITY DEFINER, 0001 で定義済み） | 新テーブルの RLS ポリシーとトリガーから再利用 |
| 通報 | 汎用 `reports` テーブル（`target_type` / `target_id` は text, check 制約なし）+ `/admin/reports` | `target_type = 'listing'` を追加して再利用 |
| モデレーション | `is_hidden` フラグ方式, `ReportsManager` / `ReportTable` | リスティングにも対応させて再利用 |
| 分析 | GA4 `window.gtag`（`types/analytics.d.ts`） | 新規 `lib/analytics.ts` の `trackEvent()` から利用 |
| ナビ | `lib/navigation.ts`（primary / footer nav） | 「マーケット」リンクを追加 |

**マーケット・求人・応募そのものに該当する既存実装は無し（＝完全新規）。**

---

## 3. 新規実装した機能

### 3.1 リスティング種別（listing types）
`lib/listingConfig.ts` で以下を定義。要件で必須とされた領域をすべてカバー。

| 種別 | 値 | 用途 | 応募 | 画像 | 有効期限 |
| --- | --- | --- | --- | --- | --- |
| 求人・仕事 | `job` | 一般求人・リクルート | ✅ | ✅ | 30日 |
| ファーム求人 | `farm_job` | セカンドビザ関連ファーム求人 | ✅ | ✅ | 30日 |
| シェアハウス／部屋 | `housing` | 部屋・シェアハウス募集 | ✕（問い合わせ） | ✅ | 30日 |
| ルームメイト募集 | `roommate` | シェアメイト募集 | ✕（問い合わせ） | ✅ | 30日 |
| 車両販売 | `vehicle` | 車の売買 | ✕（問い合わせ） | ✅ | 45日 |
| 一般マーケット | `marketplace` | 任意の売買（オプション） | ✕（問い合わせ） | ✅ | 30日 |

### 3.2 ワークフロー
- **掲載作成／編集／クローズ／再開／削除**: `/community/market/new`, `.../listing/[id]/edit`。
  オーナーのみ編集・状態変更可（RLS + トリガーで強制）。
- **求人応募**: `job` / `farm_job` に対して、認証済みアクティブユーザーが1回だけ応募可能
  （`unique(listing_id, applicant_id)`）。自分の掲載には応募不可。
- **応募管理（雇用主側）**: `.../listing/[id]/applicants` で応募者一覧・ステータス変更
  （applied → viewed → contacted → interview → accepted / rejected）。
- **問い合わせ（求人以外）**: 掲載者が選んだ連絡手段（email / phone / external / enquiry）で連絡。
- **保存（ブックマーク）**: `saved_listings`、本人のみ閲覧可能な完全プライベート。
- **マイダッシュボード**: `/community/market/my`（自分の掲載／応募／保存の3タブ）。

### 3.3 検索・フィルタ
- ハブ `/community/market` に種別別カード＋アクティブ件数＋最新掲載。
- 種別インデックス `/community/market/[type]` に、種別ごとのフィルタ
  （地域／州、業種、雇用形態、給与タイプ、部屋タイプ、トランスミッション等）を URL クエリで実装。

### 3.4 掲載者アイデンティティ（掲載代行・運営公式）
- `posting_mode`: `self`（本人）/ `operator`（運営公式）/ `delegated`（掲載代行）。
- `operator` / `delegated` は **モデレーターのみ設定可能**（トリガーで強制）。
- 表示: 運営公式は「運営公式」バッジ、掲載代行は「掲載代行」バッジ＋代行対象（`represented_party`）を著者名として表示。

### 3.5 モデレーション・通報
- 各リスティングに通報ボタン（理由選択式、`LISTING_REPORT_REASONS`）。
- `/admin/reports` で `listing` 種別を表示・「掲載を表示」リンク・非表示（`is_hidden`）操作に対応。
- モデレーション用フィールド（`is_hidden` / `moderation_note` / `posting_mode`）は
  トリガー `protect_listing_moderation_fields()` により、非モデレーターの更新では改変不可。

### 3.6 安全性の案内
- 種別ごとの安全上の注意（`SAFETY_NOTICES`）を詳細ページに表示し、
  既存ガイド（/jobs, /farm, /housing, /cars, /transport, /abn, /second-visa）へ誘導。

---

## 4. データベース（マイグレーション 0008）

`supabase/migrations/0008_marketplace_listings.sql`

- **テーブル**
  - `listings`（種別・状態・連絡手段・掲載モード・画像・有効期限・`is_hidden`・`details` jsonb 等）
  - `listing_applications`（応募・ステータス・雇用主返信、`unique(listing_id, applicant_id)`）
  - `saved_listings`（`unique(user_id, listing_id)`）
- **トリガー**
  - `protect_listing_moderation_fields()`: 非モデレーターによるモデレーション系フィールド改変を防止。
  - `protect_application_fields()`: 応募者は「取り下げ（withdrawn）」のみ、
    オーナー／モデレーターは「ステータス＋雇用主返信」のみ変更可。
  - `expire_listings()`: 期限切れ掲載を `expired` にするヘルパー関数。
- **RLS ポリシー（サーバー側で権限を強制）**
  - 公開読み取り: `is_hidden = false` かつ `status != 'removed'` のみ。
  - 挿入: アクティブユーザーのみ。`operator` / `delegated` はモデレーターのみ。
  - 更新: オーナーのみ（モデレーション系は上記トリガーで保護）。
  - 応募: アクティブユーザーが、自分以外の公開中 `job` / `farm_job` に1回のみ。
  - 応募閲覧: 応募者本人・掲載オーナー・モデレーターのみ。
  - `saved_listings`: 本人のみ全操作可能（完全プライベート）。

---

## 5. ストレージ

- 掲載画像は Supabase Storage の公開バケット **`listing-images`** を使用。
- `components/market/ListingImageUpload.tsx` が JPEG / PNG / WebP・5MB 以下・最大6枚を検証。
- **手動セットアップが必要**（本実装では作成していない）。詳細は §11。

---

## 6. プライバシー

`app/privacy/page.tsx` を更新:
- 「取得する情報」に、掲載データ・応募データ（連絡先・メッセージ等）を追記。
- 「利用目的」に、掲載・応募の仲介／表示のための利用を追記。

応募メッセージや連絡先は、掲載オーナー・応募者本人・モデレーターのみが閲覧可能（RLS で強制）。

---

## 7. セキュリティ検証

- **権限はすべてサーバー側（RLS + トリガー）で強制**。クライアントは表示制御のみで、
  権限判断をクライアントに依存しない。
- 公開読み取りビュー（`LISTING_PUBLIC_SELECT`）は `moderation_note` を除外。
- 掲載代行・運営公式のなりすまし防止をトリガーで担保。
- 応募の重複・自己応募をユニーク制約と RLS で防止。
- 画像アップロードは MIME / サイズ / 枚数を検証。
- PII を含む分析イベントは送信しない（`lib/analytics.ts`）。

---

## 8. 分析イベント（GA4）

`lib/analytics.ts` の `trackEvent()`（gtag 未定義時は no-op、PII なし）:
`listing_view` / `listing_create` / `job_apply` / `listing_save` / `listing_contact` / `listing_close`。

---

## 9. 変更・追加ファイル一覧

### 新規追加
- `supabase/migrations/0008_marketplace_listings.sql`
- `types/listing.ts`
- `lib/listingConfig.ts`
- `lib/listings.ts`
- `lib/analytics.ts`
- `components/market/`（ListingBadges, ListingCard, ListingFilters, ListingImageUpload,
  ListingForm, ListingDetailBody, ListingDetailActions, ApplyForm, ApplicantList,
  MyMarketDashboard, EditListingGate）
- `app/community/market/`（page, [type]/page, listing/[id]/page, listing/[id]/edit/page,
  listing/[id]/applicants/page, new/page, my/page）

### 変更（既存機能の拡張のみ、破壊的変更なし）
- `types/report.ts`（`ReportTargetType` に `listing` 追加）
- `lib/notify.ts`（通報通知の対象種別に `listing` 追加）
- `components/forum/ReportButton.tsx`（`reasons` prop・`listing` ラベル対応）
- `components/admin/ReportsManager.tsx`（`listing` 表示・非表示・リンク対応）
- `components/admin/ReportTable.tsx`（`listing` ラベル対応）
- `lib/navigation.ts`（「マーケット」リンク追加）
- `app/community/page.tsx`（マーケットへの導線セクション追加）
- `app/privacy/page.tsx`（掲載・応募データの記載追加）

---

## 10. 検証結果

| チェック | コマンド | 結果 |
| --- | --- | --- |
| Lint | `npm run lint` | ✅ 0 エラー / 0 警告 |
| 型チェック | `npx tsc --noEmit` | ✅ エラーなし |
| コンテンツテスト | `npm run test:content` | ✅ 5 pass / 0 fail |
| ツールテスト | `npm run test:tools` | ✅ 36 pass / 0 fail |
| 本番ビルド | `npm run build` | ✅ 成功（マーケット全7ルートを生成） |

生成されたマーケットルート:
`/community/market`, `/community/market/[type]`, `/community/market/listing/[id]`,
`/community/market/listing/[id]/applicants`, `/community/market/listing/[id]/edit`,
`/community/market/my`, `/community/market/new`。

---

## 11. 手動セットアップが必要な項目（本番反映前）

1. **マイグレーション適用**: `supabase/migrations/0008_marketplace_listings.sql` を本番 DB に適用。
2. **ストレージバケット作成**: Supabase Storage に公開バケット **`listing-images`** を作成し、
   認証ユーザーの書き込み・公開読み取りポリシーを設定。
3. **（任意）自動期限切れ**: `pg_cron` などで `expire_listings()` を定期実行（例: 日次）。
   未設定でも期限切れ掲載は表示ロジック側で除外される。

---

## 12. 意図的に見送った機能（今後の対応）

- **サイト内ダイレクトメッセージ（DM）**: 現状は掲載者が選んだ連絡手段
  （メール／電話／外部リンク／問い合わせ）で連絡。`enquiry` 選択時は
  「サイト内メッセージ機能は今後の対応予定」と表示。DM は将来対応として保留。
- **履歴書 / CV アップロード**: 安全なアップロード基盤が未整備のため、
  プライバシー・スコープの観点から今回は見送り（将来対応）。

---

## 13. 区分まとめ

- **維持（変更なし）**: 認証、既存の掲示板・記事・ツール・公開 URL。
- **再利用・小改修**: 通報 `reports` テーブル、モデレーション管理画面、ナビ、プライバシーページ。
- **新規実装**: 全リスティング種別、求人応募、掲載代行／運営公式、保存、マーケット UI 一式、
  マイグレーション 0008、分析イベント。
- **見送り（将来対応）**: サイト内 DM、履歴書 / CV アップロード。
