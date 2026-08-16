# My Page / 保存アイテム / アプリ内通知 実装レポート

対象サイト: オーストラリアワーホリコンパス（Next.js 16 + Vercel + Supabase）
バージョン: v1（アプリ内通知のみ。メール／プッシュは将来対応のためスキーマのみ用意）

このドキュメントは、統合マイページ・保存アイテム・アプリ内通知システムの監査結果、
実装内容、データモデル、RLS、通知生成、アナリティクス、マイグレーション、検証結果、
および手動セットアップ手順をまとめたものです。

---

## 1. 監査サマリー（既存機能）

| 領域 | 状態 | 詳細 |
| --- | --- | --- |
| 認証 | 実装済み | `useAuth()`（`components/auth/AuthProvider.tsx`）がクライアント側でセッション／プロフィールを提供。サーバーは公開データ読み取り専用。→ ダッシュボードはクライアントコンポーネントで実装。 |
| プロフィール | 実装済み | `app/profile`（設定のみ）。統合ダッシュボードは存在せず → 新規 `/mypage` を追加。 |
| 掲載（マーケット） | 実装済み | `listings` / `listing_applications` / `saved_listings`（RLS＋トリガー）。`/community/market/my` に既存ダッシュボード。→ 温存し再利用。 |
| 掲載の保存 | 実装済み | `saved_listings`。`ListingDetailActions` で保存／解除。→ 温存。 |
| 応募トラッカー | 実装済み | 応募者・掲載主それぞれのビュー。→ マイページから集約参照。 |
| 記事／ニュース／ツールの保存 | 未実装 | → 新規 `saved_items` で追加。 |
| 88日ツール | 実装済み（localStorage） | `whv-tool-88-day-records` ＋ `lib/tools/logic/second-visa.mjs`。→ 計算ロジック再利用、上書きせず参照のみ。 |
| 公式情報監視 | 実装済み | `article_impacts` で「要確認」をフラグするのみ（自動更新はしない）。→ 誤って「更新済み」と通知しない設計を踏襲。 |
| ニュース | 実装済み | 手書き（`lib/newsData.ts`）＋自動（`news_items`）。 |
| アプリ内通知 | 未実装 | Discord Webhook（`lib/notify.ts`）のみ。→ 新規 `notifications` システムを追加。 |
| ヘッダー | 実装済み | コンパクトなアカウントメニュー（オーバーレイ調停）。→ はみ出しを再発させずにバッジ＋導線を追加。 |
| アナリティクス | 実装済み | GA4 `trackEvent`（PIIを送らない）。→ イベントを拡張。 |

分類: 認証/掲載/掲載保存/応募/88日/監視/ニュース/ヘッダー/アナリティクス = 実装済み。
記事・ニュース・ツールの保存 / アプリ内通知 / 統合マイページ / 通知設定 / 保存検索 = 未実装（本タスクで追加）。

---

## 2. マイページ（`/mypage`）

クライアントダッシュボード（`components/mypage/MyPageDashboard.tsx`）。実データのみ表示し、
無意味な恒久ゼロは出さず、コンテキストに応じた空状態を表示します。

セクション:
- **重要な更新** — 最近の通知プレビュー（`/notifications` へ）。
- **セカンドビザ 88日カウンター** — localStorage の記録から進捗を集計（記録がある時のみ）。
  `summarizeWorkDays()` を再利用。カレンダーへ直接リンク。「ビザの可否を保証しない」旨を明記。
- **応募した求人** — `listing_applications`（`applicant_id = 本人`）のステータス。
- **保存した掲載** — `saved_listings` を求人／住まい／車両にグループ化。
- **自分の掲載** — `listings`（`user_id = 本人`）。
- **保存した記事・ニュース・ツール** — `saved_items`（タイトルはコード側のカタログから解決）。
- **保存した検索条件** — `saved_searches`（再実行リンク＋削除）。

ログアウト時・DB未設定時・空データ時はそれぞれ明確な空状態を表示します。

---

## 3. 保存アイテム

### 3.1 データモデル
- 新規 `saved_items(user_id, item_type, item_id, created_at)`、`unique(user_id, item_type, item_id)`。
  `item_type ∈ {article, news, tool}`。`item_id` は正規の識別子（記事/ニュース/ツールの slug）のみ保持し、
  本文などの正規コンテンツは複製しません。
- 掲載（`job`/`housing`/`vehicle` 等）は既存の `saved_listings` を継続利用（実績があり温存）。
  ライブラリ層（マイページ）で両者を統合的に表示します。

### 3.2 保存UX
共通コンポーネント `components/common/SaveButton.tsx`（保存する／保存済み トグル）を
以下に設置:
- 記事詳細 `app/guides/[slug]/page.tsx`（シェアボタン横）
- ニュース詳細 `app/news/[slug]/page.tsx`（見出し下）
- 全ツール `components/tools/ToolShell.tsx`（見出し下、全ツール共通）
- 掲載は既存の `ListingDetailActions` の保存ボタンを継続利用。

ログアウト時は「保存する（ログイン）」でログインへ誘導（安全なゲスト挙動を維持）。

### 3.3 ライブラリ
- `lib/savedItems.ts`: `saveItem` / `unsaveItem` / `getSavedItemId` / `listSavedItems`。

---

## 4. 通知

### 4.1 種別（`notifications.type`）
`saved_article_updated`, `important_news`, `saved_listing_updated`,
`saved_listing_closing`, `saved_listing_closed`, `new_matching_listing`,
`application_status_changed`, `application_message`, `community_reply`, `system`。

### 4.2 スキーマ
`notifications(id, user_id, type, title, body, target_type, target_id, target_url,
dedupe_key, metadata jsonb, created_at, read_at)`
- 未読高速化: 部分インデックス `where read_at is null`。
- 重複防止: 部分ユニークインデックス `(user_id, dedupe_key)`。
- 既読は `read_at` を設定するのみ（**削除しない**）。トリガーで `read_at` 以外の列改変を防止。

### 4.3 生成（サーバー主導・イベント駆動）
すべて `create_notification()`（SECURITY DEFINER、宛先の設定を尊重し dedupe）経由。
クライアントからの `notifications` への INSERT ポリシーは意図的に存在しません。

DBトリガー（自動・テスト可能）:
- 新規応募 → 掲載主（`application_message`）
- 応募ステータス変更 → 応募者（`application_status_changed`。本人操作の取り下げは通知しない）
- 保存済み掲載が募集終了／期限切れ → 保存したユーザー（`saved_listing_closed` / `saved_listing_updated`）
- フォーラム返信 → 投稿者（`community_reply`）

サービスロールAPI（`app/api/notifications/broadcast/route.ts`、モデレーター/管理者のみ）:
- `saved_article_updated`: 記事を保存したユーザーへ通知。`dedupe_key` に `updatedAt` を含めるため、
  同一バージョンで二重通知しません。**実際に内容が更新されたときのみ**手動/スクリプトから呼びます。
- `important_news`: **関連する保存済みコンテンツ**（記事/ニュース）を保存したユーザーに限定。
  全ユーザー一斉配信は v1 では意図的に未実装（過剰通知・プライバシー配慮）。

### 4.4 記事更新通知のポリシー
- タイポ・体裁・メタデータのみの編集では通知しない（`isMeaningfulArticleUpdate()` が本文・要点・
  手順・警告・FAQ 等の実質変更のみを検出。空白/大文字小文字は無視）。
- 監視が「古い可能性」とフラグしただけでは「更新した」と主張しない（記事本文は自動更新されないため、
  ブロードキャストAPIを呼ばない限り通知は発生しません）。
- 実更新後の文言: 「保存した『○○』が更新されました」（`savedArticleUpdatedTitle()`）。

### 4.5 公式アップデート／掲載通知のポリシー
- 公式ニュース: 重要度・カテゴリ・保存コンテンツ関連性・設定で対象を限定。機微な個人推測はしない。
- 掲載: 実質的な変更（募集終了・期限切れ）のみ。些末な編集は通知しない。

### 4.6 通知センター（`/notifications`）
`components/notifications/NotificationCenter.tsx`:
未読数、1件既読、すべて既読、既読/未読の区別、ターゲットリンク、モバイル対応、空状態、
「さらに読み込む」ページング（20件/ページ、+1件取得で `hasMore` 判定）。既読化は削除しません。

### 4.7 設定（`notification_preferences`）
`components/notifications/NotificationPreferences.tsx`（`/notifications` 下部）:
重要な公式情報 / 保存記事の更新 / 保存掲載の変更 / 応募 / コミュニティ返信 / 条件一致掲載。
`create_notification()` が該当設定を尊重（設定行が無い場合は既定で有効）。
`email_enabled` / `push_enabled` 列を予約（v1 は false 固定＝アプリ内のみ）。

---

## 5. 88日ツール連携
- 既存の計算ロジック（`lib/tools/logic/second-visa.mjs` の `summarizeWorkDays`）を再利用。
- データは localStorage（`whv-tool-88-day-records`）。**上書き・移行はしない**。マイページは参照のみで、
  記録がある時だけ進捗を表示し、カレンダーへ直接リンク。
- 「記録の集計であり、ビザの可否や指定業務の該当性を保証しない」旨を常に明記。
- 安全なアカウント同期は現時点で未導入（localStorage を尊重）。将来同期する場合もローカルを優先。

---

## 6. 応募ダッシュボード連携
- マイページに応募ステータスの件数・状態・掲載リンクを集約表示（`applicant_id = 本人` のみ）。
- 他ユーザーの応募者情報は表示しない（RLS＋トリガーで列レベルまで保護、既存設計を踏襲）。
- 応募ステータス変更・新規応募は通知として配信。

---

## 7. マーケット連携・保存検索
- `saved_searches(user_id, label, listing_type, filters jsonb, notify, last_notified_at)`。
- 検索結果画面（`app/community/market/[type]`）に `SaveSearchButton` を設置。現在のクエリ条件を
  構造化して保存。マイページから再実行（`savedSearchUrl()`）・削除が可能。
- 一致マッチングは**構造化SQL/コード比較**（生成AI不使用。`listingMatchesSavedSearch()`）で、
  Gatton+Farm / Brisbane+Housing<=250 / QLD+Vehicle<=6000 等をサポート可能。
- **new_matching_listing の自動通知は延期**: 現状マーケットの絞り込みはクライアント側の
  インメモリ実装であり、定期マッチング配信には pg_cron 等のスケジュール実行が必要なため、
  スキーマ・設定・マッチングロジック・UIフックのみを用意し、有効化は将来対応とします
  （ブロックせずに安全なフックを提供）。

---

## 8. RLS / セキュリティ
すべてのユーザー固有テーブルで `auth.uid()` ベースのユーザー分離を強制:
- `saved_items` / `saved_searches` / `notification_preferences`: 本人のみ SELECT/変更。
- `notifications`: 本人のみ SELECT。UPDATE は本人のみ＋トリガーで `read_at` 以外を不変化。DELETE は本人のみ。
  **クライアントの INSERT ポリシーは無し**（生成は SECURITY DEFINER 関数／サービスロール限定）。
- クライアント提供の user_id は信頼せず、常に認証セッション／トークンから解決。
  ブロードキャストAPIはトークン検証後に `profiles.role` をサーバー側で確認（モデレーター/管理者のみ）。
- ID改ざん対策: RLS により他ユーザーの行は取得・更新不可。`create_notification` の宛先はサーバー側で
  `saved_items` から解決。

---

## 9. スケール（インデックス）
- `saved_items`: `(user_id, created_at desc)`, `(user_id, item_type)`, `(item_type, item_id)`。
- `notifications`: `(user_id, created_at desc)`, 部分 `(user_id) where read_at is null`,
  部分ユニーク `(user_id, dedupe_key)`。
- `saved_searches`: `(user_id, created_at desc)`。
- ダッシュボードは並列クエリ（`Promise.all`）で N+1 を回避。掲載保存は JOIN で1クエリ取得。

---

## 10. アナリティクス（プライバシー安全）
`lib/analytics.ts` に `PersonalisationEvent` を追加:
`save_item`, `unsave_item`, `dashboard_view`, `notification_open`,
`notification_target_click`, `saved_search_create`。
送信するのは `item_type` / `notification_type` / `listing_type` 等の**非個人的な区分値のみ**。
ユーザーID・メール・メッセージ本文・応募内容は GA4 に送りません。

---

## 11. マイグレーション
`supabase/migrations/0012_my_page_saves_notifications.sql`:
- テーブル: `saved_items`, `notifications`, `notification_preferences`, `saved_searches`。
- 関数: `create_notification()`（唯一の書き込み口）, `protect_notification_fields()`,
  `notify_owner_on_application()`, `notify_applicant_on_status()`,
  `notify_savers_on_listing_close()`, `notify_author_on_comment()`, `prune_notifications()`。
- トリガー: `listing_applications`（INSERT / UPDATE OF status）, `listings`（UPDATE OF status）,
  `forum_comments`（INSERT）, `notifications`（BEFORE UPDATE 保護）。
- 権限: `create_notification` は public/anon/authenticated から REVOKE、`service_role` にのみ GRANT。

---

## 12. 検証結果
- Lint: `npm run lint` → エラー0（既存の無関係な warning 3件のみ）。
- 型チェック／本番ビルド: `npm run build` → 成功（`/mypage`, `/notifications`,
  `/api/notifications/broadcast` を含む）。
- 単体テスト（純粋ロジック）: `npm run test:notifications` → 11 pass。
  設定マッピング、dedupe キー、実質更新判定（タイポ/体裁/メタデータのみ抑制）、
  保存検索マッチング（Gatton+Farm / Brisbane+Housing<=250 / QLD+Vehicle<=6000）を網羅。
- 既存テスト: `test:tools`（44 pass）, `test:content`（5 pass）。

RLS・ID改ざん・トリガー生成の実挙動テストは、稼働中の Supabase が必要なため手動確認項目
（下記）とします。純粋ロジックとスキーマ／ポリシーはコードで担保しています。

---

## 13. 手動セットアップ
1. Supabase SQL エディタで `supabase/migrations/0012_my_page_saves_notifications.sql` を適用
   （`0011` の後）。
2. 環境変数 `SUPABASE_SERVICE_ROLE_KEY`（既存）をサーバーに設定（ブロードキャストAPI用）。
3. 記事の実質更新を配信する場合、モデレーターのアクセストークンで
   `POST /api/notifications/broadcast`（`{ kind:"saved_article_updated", slug, title, updatedAt }`）を
   実行。重要ニュースは `{ kind:"important_news", slug, title, summary?, relatedArticleSlugs? }`。
4. （任意）`prune_notifications()` / `expire_listings()` を pg_cron 等で定期実行。
5. 動作確認（手動）: ログイン/ログアウトのダッシュボード、記事/求人/住まい/車両の保存・解除、
   重複保存防止、応募ステータス通知、掲載終了通知、既読/全既読、設定、RLS 分離、直接ID改ざん、
   88日連携、空状態、ヘッダー/通知センターのモバイル表示。

---

## 14. 将来対応（延期）
- メール／プッシュ通知（`email_enabled` / `push_enabled` 列を予約済み）。
- `new_matching_listing` の定期マッチング配信（pg_cron ＋ サーバー側の構造化SQLマッチング）。
- 88日記録の安全なアカウント同期（localStorage を尊重した上でのオプトイン）。
