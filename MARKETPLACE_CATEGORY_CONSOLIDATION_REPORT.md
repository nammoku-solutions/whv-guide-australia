# マーケット・カテゴリ統合 + 写真並び替え レポート

## 概要
公開のトップレベル・カテゴリを **求人 / 家 / 売買** の 3 つに統合し、掲載写真の
アップロード・並び替え（メイン画像の管理）を追加した。原則は
**「公開はシンプルな3カテゴリ、内部は構造化サブカテゴリ」**。

構造化データ（filtering / AI検索 / 保存検索 / 通知 / 応募 / 車両項目 / 画像順）は
一切破壊していない。**破壊的なDBスキーマ移行は不要**（下記参照）。

---

## 1. 以前のカテゴリ構造
公開のトップレベルが 6 種類あった（`listing_type`）:

`job` / `farm_job` / `housing` / `roommate` / `vehicle` / `marketplace`

- ルート: `/community/market/[type]`（type = 上記6値）
- ハブ `/community/market` に 6 枚のカードを表示
- ホーム/掲示板の導線も 求人 / 家 / シェアメイト / 車 を個別リンク

## 2. 新しい公開構造（Information Architecture）
```
マーケット
💼 求人   → 一般求人 / ファーム
🏠 家     → 部屋・シェアハウス / 部屋を探している / シェアメイト募集
🛒 売買   → 車 / 家具・家電 / 日用品 / その他
```
- ルート: `/community/market/{job|housing|marketplace}`（= 公開カテゴリ）
- 各カテゴリページ内でサブカテゴリをタブ（チップ）で切替（トップレベルは増やさない）
- ハブ `/community/market` は 3 枚のカードのみ

## 3. 正規カテゴリ/サブカテゴリ・モデル
`listing_type`（既存enum）を**内部サブタイプとして温存**し、公開カテゴリを
その上に載せる層として追加した（`lib/listingConfig.ts`）。

| 内部 listing_type | 公開カテゴリ | サブカテゴリ(value) | 公開ラベル |
|---|---|---|---|
| job | job（求人） | general | 一般求人 |
| farm_job | job（求人） | farm | ファーム |
| housing | housing（家） | room | 部屋・シェアハウス |
| roommate + `details.roomWantedOrOffered=wanted` | housing（家） | wanted | 部屋を探している |
| roommate + offered/未指定 | housing（家） | sharemate | シェアメイト募集 |
| vehicle | marketplace（売買） | vehicle | 車 |
| marketplace + `details.category=furniture` | marketplace（売買） | furniture | 家具・家電 |
| marketplace + `details.category=daily` | marketplace（売買） | daily | 日用品 |
| marketplace + その他/未知 | marketplace（売買） | other | その他 |

要求プロンプトのマッピング表（実リポジトリ値）:

| 旧 public type | 新 primary | 新 subtype |
|---|---|---|
| 求人 (`job`) | 求人 (`job`) | 一般 (`general`) |
| ファーム求人 (`farm_job`) | 求人 (`job`) | ファーム (`farm`) |
| 家 (`housing`) | 家 (`housing`) | 部屋・シェアハウス (`room`) |
| シェアメイト (`roommate`) | 家 (`housing`) | シェアメイト (`sharemate`) / 部屋を探している (`wanted`) |
| 車 (`vehicle`) | 売買 (`marketplace`) | 車 (`vehicle`) |
| 売ります (`marketplace`) | 売買 (`marketplace`) | その他/既存 (`other`/`furniture`/`daily`) |

正規定数・純粋関数は `lib/listingConfig.ts`:
`PRIMARY_CATEGORIES`, `PRIMARY_CATEGORY_ORDER`, `LISTING_TYPE_TO_CATEGORY`,
`LEGACY_TYPE_REDIRECTS`, `MARKETPLACE_ITEM_KINDS`, `matchesSubcategory`,
`resolveListingTaxonomy`, `normalizeItemKind`。

## 4. DB移行
**新規Supabase移行は不要（migration: NO）。**
- `listings.listing_type` は既存の 6 値を保持（構造化サブタイプとして温存）。公開
  カテゴリは `LISTING_TYPE_TO_CATEGORY` で導出するため、値の書き換え・enum変更なし。
- 既存の全掲載（一般求人・ファーム・住まい・シェアメイト・車・売買、委任掲載を含む）
  はそのまま存続。ID / created_at / 所有者 / 委任メタデータ / 応募 / 保存 / 画像パスは不変。
- 曖昧な既存 `marketplace` アイテムは `normalizeItemKind` により安全に **その他** へ退避
  （推測で誤分類しない）。

## 5. ルート / リダイレクト
`next.config.ts` に 308 恒久リダイレクトを追加（チェーンなし）。動的ルート側にも
`permanentRedirect` のセーフティネットを実装（`app/community/market/[type]/page.tsx`）。

| 旧ルート | 新ルート |
|---|---|
| `/community/market/farm_job` | `/community/market/job?subcategory=farm` |
| `/community/market/roommate` | `/community/market/housing?subcategory=sharemate` |
| `/community/market/vehicle` | `/community/market/marketplace?subcategory=vehicle` |

`/community/market/job|housing|marketplace` は従来URLを維持（＝カテゴリ正規ページ）。
掲載詳細URL `/community/market/listing/[id]` は不変（外部共有・保存・通知・AIアクションを保護）。

## 6. 作成 / 編集フォーム
`app/community/market/new/page.tsx` を 3 カテゴリ → サブタイプ → フォームの流れに再構成。
レガシー `?type=` は `resolveListingTaxonomy` で新カテゴリへ変換して後方互換。
`ListingForm` は `subcategory` を受け取り、`details` を初期化
（wanted/offered → `roomWantedOrOffered`、furniture/daily/other → `details.category`）。
売買のカテゴリ入力は自由記述から正規セレクト（`MARKETPLACE_ITEM_KINDS`）へ。
求人/家/車の既存フィールド（給与・車両項目 make/model/year/km/rego/roadworthy 等）は温存。

## 7. 写真データモデル
`listings.images` は `text[]`。**配列順そのものが正規（canonical）な表示順**で
Postgres が順序を永続化する。先頭 `images[0]` が **メイン画像（カバー）**。
ファイル名・アップロード時刻・ストレージ順には依存しない。→ **写真順のための移行は不要**。

純粋ユーティリティ `lib/photoOrder.ts`:
`coverPhoto` / `movePhoto` / `movePhotoBy` / `removePhotoAt` / `normalizePhotoOrder`。

## 8. 写真並び替え実装
`components/market/ListingImageUpload.tsx`:
- 複数アップロード（既存の最大6枚 / 5MB / JPEG・PNG・WebP）
- 公開前プレビュー、先頭に `メイン画像` ラベル
- **デスクトップ: ドラッグ&ドロップ**、**モバイル/キーボード: ◀ ▶ フォールバック**（aria-label付）
- 個別削除 → 残り順序を保持（配列順が正規のため正規化不要）
- 追加は末尾へ（メイン画像と既存順を保持）
- 保存時に `normalizePhotoOrder` で重複除去・順序維持
- 削除・再アップロード不要で並び替え可能。編集画面でも同一UIで並び替え可能。

## 9. メイン / カバー画像の一貫性
先頭画像 = メイン。カード（`ListingCard`）・詳細ギャラリー・ホーム新着・保存カード・
マイページ・管理/モデレーションプレビューはすべて `images[0]` を使用。
OGは掲載詳細を `noindex`（`robots.index:false`）としており、動的OG画像は未使用のため
写真なし掲載でも壊れたOGは生成しない。

## 10. 掲載ギャラリー
詳細ページは `images` を配列順でレンダリング（先頭を先頭表示）。既存の軽量 img ギャラリーを
維持し、alt を掲載順のインデックス付きに改善。新規画像ライブラリは導入していない。

## 11. 車両の安全
車のサブカテゴリは `vehicle` 型のみ。PPSR / Rego / Roadworthy 等の注意喚起
（`SAFETY_NOTICES.vehicle`）を温存。roadworthy等の検証は主張しない。

## 12. 委任 / 代理掲載
`posting_mode='delegated'` と `represented_party` を温存。公開に `掲載代行` バッジと
「運営が許可を得て代理掲載」の文言を表示（運営を雇用主/貸主/売主に見せない）。
内部の許可・監査メタデータは非公開のまま。写真並び替えは委任掲載でも同一に機能。

## 13. マーケットのランディングと件数
`app/community/market/page.tsx` は 3 カード（💼 求人 / 🏠 家 / 🛒 売買）のみ。
`countActiveListings()` が **active かつ未期限切れ** のみ集計（下書き・非公開・削除・
期限切れは除外）。各カードにサブカテゴリのチップを表示。

## 14. 検索 / フィルタ UX
`ListingFilters` はカテゴリ別（求人=業種/雇用形態/給与形態、家=部屋タイプ/家賃上限/カップル、
売買=州/メーカー/ミッション/価格上限[車]）。サブカテゴリはタブが担当し、フィルタ適用時も
`subcategory` を引き継ぐ。数値フィルタはSQL/コードで処理（AIは使わない）。

## 15. SEO / canonical / sitemap
- カテゴリページ canonical: `/community/market/{category}`
- 旧サブタイプURLは 308 で統合先へ（sitemap には元々マーケットのカテゴリURLは含まれない）
- 作成/編集ページは `noindex`
- 掲載詳細は既存方針どおり `index:false, follow:true`
- 任意フィルタ組合せは薄い indexable ページを新規に作らない（sitemap 未登録・canonical固定）

## 16. マイページ / 保存 / 保存検索 / 通知
- 保存掲載グループを新IAに合わせて再ラベル（求人 / 家 / 売買）。既存保存はサブタイプ
  バッジを保持し孤児化しない。売買グループに `marketplace` を含めるよう修正。
- `savedSearchUrl` はレガシー/新規どちらの `listing_type` も公開カテゴリURLへ正規化し、
  必要に応じて `subcategory` を補完（Gatton+Farm、Brisbane+Housing、QLD+Vehicle が機能）。
- 通知のターゲットURL・サブタイプ別文言は不変（`listing_type` を保持しているため）。

## 17. 応募（job applications）
ファーム求人も求人。応募フロー・応募者一覧・ステータス・雇用主ビュー・通知・マイページ
サマリはすべて `listing_type` ベースで不変。家/売買には応募アクションを付与しない。

## 18. AI 構造化データ
`searchActiveJobs`（job+farm_job）/ `searchActiveHousing`（housing+roommate）/
`searchActiveVehicles`（vehicle）は `listing_type` を保持しているためロジック変更不要で継続。
信頼アクションURL（`lib/ai/actions.ts` `marketTypeUrl`）を新カテゴリへ更新:
- ファーム求人 → `/community/market/job?subcategory=farm`
- 車 → `/community/market/marketplace?subcategory=vehicle`
モデルにURLは発明させない（レジストリ経由）。掲載を記事RAGへ再埋め込みしない。

## 19. RLS / セキュリティ
- `listings` の RLS・所有者トリガー・モデレーション保護は変更なし（強化も後退もなし）。
- 写真並び替えは `images` 配列の更新のみで、既存の owner-only UPDATE RLS に従う
  （他人の掲載・画像は編集不可）。画像ID/ストレージパスは保持。

## 20. テスト / ビルド
- `scripts/marketplace.test.mts`（`npm run test:marketplace`）: カテゴリ・マッピング、
  サブカテゴリ判定、レガシー安全退避、写真順（移動/削除/正規化/カバー）を検証 → 19 pass。
- `npm run test:ai` → 23 pass（trusted action URL 更新の回帰確認）。
- `npx tsc --noEmit` → エラーなし。`npx eslint` → 既存の警告のみ（新規エラーなし）。
- `npm run build` → 成功（exit 0、全マーケットルート生成）。

## 手動セットアップ（Manual setup required）
- migration: **NO**（破壊的スキーマ変更なし。`listing_type`/`images` を温存）
- Vercel env changes: **NO**
- GitHub env/secrets changes: **NO**

## 手動プロダクション確認チェックリスト
1. `/community/market` が 3 カード（求人/家/売買）のみ表示
2. `/community/market/job`、`?subcategory=farm`
3. `/community/market/housing`、`?subcategory=sharemate`
4. `/community/market/marketplace`、`?subcategory=vehicle`
5. 旧URL `/community/market/{farm_job,roommate,vehicle}` が 308 で統合先へ
6. 既存の委任住まい掲載が 家 に存続し、写真・URLが不変
7. 掲載作成（3カテゴリ→サブタイプ→フォーム）
8. 複数写真アップロード → プレビュー
9. デスクトップ: ドラッグ&ドロップ並び替え
10. モバイル: ◀ ▶ で並び替え
11. 並び替え後のメイン画像が全面（カード/詳細/マイページ/保存）で一致
12. 既存掲載の編集で写真並び替え → 保存 → 再読込で維持
13. 保存済みアイテム・保存検索（Farm/Vehicle）が解決
14. 応募フロー（一般/ファーム求人）
15. AI: 「Gattonで求人ある？」「ファーム求人」「Brisbaneで部屋」「シェアメイト募集」「6000ドル以下の車」
16. モバイルナビでの折り返し（オーバーフローなし）
