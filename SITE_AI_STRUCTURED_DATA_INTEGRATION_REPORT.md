# SITE_AI_STRUCTURED_DATA_INTEGRATION_REPORT

サイト固有AIアシスタントの構造化ライブデータ統合レポート — オーストラリアワーホリコンパス

既存の記事RAG（Router / Hybrid Retriever / Generator / ツール推薦 / 出典 / レート制限 /
フィードバック / 分析）を**再構築せずに再利用**し、ライブ・マーケット掲載、本人の記録、
直近の公式アップデートを**安全に**扱えるように拡張した。

---

## 1. 中核原則

| データ種別 | 経路 | 実装 |
| --- | --- | --- |
| 公開知識（ビザ・税・仕事・住居の一般解説） | 記事RAG | 既存の pgvector＋日本語キーワードのハイブリッド検索 |
| ライブ・マーケット（現在有効な求人/住居/車） | 構造化 Supabase クエリ | `lib/listings.ts` の型付き `getListingsByType` を再利用 |
| 個人データ（応募/保存/通知/88日） | 認証必須のサーバー側ケイパビリティ | service-role＋サーバー導出 `userId` で本人限定 |

**私的/ライブデータはベクトルDB（`ai_article_chunks`）に一切入れない。** 記事の埋め込みは公開記事のみ。

---

## 2. 監査結果（再利用したもの）

- **AIモジュール** `lib/ai/`: config / types / router / pipeline / retrieval / generation / recommendations /
  safety / analytics / ratelimit / server(supabaseAdmin) / eval。→ すべて再利用し拡張。
- **チャットAPI** `app/api/ai/chat/route.ts`: 既に Bearer トークンから `userId`＋モデレーター判定を
  **サーバー側で導出**していた（`resolveUser`）。→ その結果を認証コンテキストとして pipeline へ受け渡すよう接続。
- **チャットUI** `components/ai/AiAssistant.tsx`: 出典・ツールを描画。→ 構造化カード/アクションの描画を追加。
- **データアクセス層（温存・再利用）**:
  - `lib/listings.ts`（`getListingsByType`, `ListingFilters`, `isPubliclyActive`, `mapListingRow`）
  - `lib/savedItems.ts` / `lib/notifications.ts` / `lib/news.ts` / `lib/tools/registry.ts`
  - `lib/tools/logic/second-visa.mjs`（88日計算ロジック）
  - `lib/monitor/db.ts`（公式ソース監視状態）
- **スキーマ/RLS**: `0008_marketplace_listings.sql`（listings / listing_applications / saved_listings、RLS＋列保護トリガー）、
  `0012_my_page_saves_notifications.sql`（saved_items / notifications）。→ **DB変更なし**（既存RLSを尊重）。

**重要な発見**: 88日の勤務記録は端末の `localStorage`（`whv-tool-88-day-records`）にのみ保存され、
サーバー同期は存在しない。→ `getMy88DayProgress` は「サーバー側にデータなし」を明示し、
88日カレンダーツールへ誘導する（後述）。

---

## 3. ルート種別（拡張）

`lib/ai/router.ts`（決定的、機能フラグ非依存＝テスト容易）。

| ルート | 例 | 説明 |
| --- | --- | --- |
| ARTICLE | Bondって何？ | 記事RAG |
| TOOL | 88日カレンダーどこ？ | サイト内ツールへ誘導（ナビゲーション寄り） |
| LISTING | Gattonで求人ある？ | ライブ掲載の構造化検索 |
| PERSONAL | 応募してる仕事どうなってる？ | 本人の記録（認証必須） |
| CURRENT_UPDATE | 最近417で変更あった？ | 公開ニュース＋公式監視＋記事RAG |
| MIXED | Gattonの求人とファーム探しの注意点 | 記事＋掲載/ツール/88日 |
| OUT_OF_SCOPE | 今日の日本株は？ | サイト外・定型応答 |

- サブ意図: LISTING は `job` / `housing` / `vehicle`、PERSONAL は `applications` / `saved` / `notifications`。
- 高リスクの適格性質問（例「この求人ならセカンドビザ取れる？」）は掲載だけで判断させないため MIXED に寄せ、
  記事ガイドを併用する。

---

## 4. 構造化ケイパビリティ

`lib/ai/capabilities/`（**任意SQLツールなし**。事前定義された型付き関数のみ）。すべて**最小化DTO**を返す。

| ケイパビリティ | 認証 | データ源 | 送信する項目（最小化） |
| --- | --- | --- | --- |
| `searchActiveJobs` | 不要 | listings(job/farm_job) | title, 公開投稿者名, location, pay（投稿者記載のみ/無ければnull）, 雇用形態, listing URL |
| `searchActiveHousing` | 不要 | listings(housing/roommate) | title, 投稿者名, location, 週家賃, 部屋タイプ, URL |
| `searchActiveVehicles` | 不要 | listings(vehicle) | title, 出品者名, location/state, price, make/model, transmission, URL |
| `getMyApplications` | **必須** | listing_applications(applicant_id=本人) | 集計＋直近数件（掲載タイトル/ステータス/応募日/URL） |
| `getMySavedItems` | **必須** | saved_items＋saved_listings | タイトル/種別/URL、終了掲載は closed ラベル |
| `getMyNotifications` | **必須** | notifications(user_id=本人) | title/種別/日付/未読/サイト内URL |
| `getMy88DayProgress` | **必須** | （サーバー同期なし） | 「取得不可」の明示＋ツール誘導＋免責 |
| `getCurrentOfficialUpdates` | 不要 | published news＋monitor_source_state | ニュース title/日付/カテゴリ/URL＋監視鮮度 |
| `findRelevantSiteTools` | 不要 | tools/registry | 既存 `recommendTools` を再利用 |

**データ最小化**: 応募では `employer_response`・`message`・`availability`・`contact_info` を **SELECT しない**。
連絡先・レジュメ・カバーレター・電話/メール・auth テーブル・モデレーションメモは一切渡さない。
価格・時給・家賃は投稿者が明示した値のみ。無ければ「記載なし」（発明しない）。

行数上限（`config.ts` の `structured`）: 掲載5 / 応募5 / 保存8 / 通知8 / ニュース5。

---

## 5. 認証（なりすまし防止）

- `userId` は **サーバー側（Bearer トークン検証）** でのみ導出（`app/api/ai/chat/route.ts` の `resolveUser`）。
- クライアント/モデルから渡された任意の `userId` は**使わない**（`AuthContext` にクライアント値を通さない）。
- 個人ケイパビリティは `requireAuth(ctx)` で認証を確認し、未認証なら `authRequired` を返す（DBに触れない）。
- service-role クライアントで引く場合も、必ず本人IDで明示フィルタ（`.eq('applicant_id', userId)` 等）し、
  他ユーザーの行を返さない。

---

## 6. 共通エビデンスモデル

`lib/ai/types.ts` の `Evidence`:

```
{ kind: 'article'|'official_update'|'listing'|'personal'|'tool',
  visibility: 'public'|'private',
  title, content(最小化), url|null, sourceId, freshness, riskLevel, metadata }
```

- Generator は種別ラベル（`[記事]` / `[ライブ掲載]` / `[公式アップデート]` / `[あなたの記録]` / `[ツール]`）付きで
  コンテキストを受け取り、静的ガイドとライブデータ・個人記録を混同しない。
- **private エビデンスは出典（citation）にも GA4 にも出さない**。出典は `article` / `official_update` かつ URL 有りのみ。

---

## 7. 信頼済みアクション（URL発明の禁止）

`lib/ai/actions.ts` が単一の窓口。ボタン/リンクの URL は**すべて**信頼済みレジストリ、または
DB の正規メタデータ（`listing.id` / `news.slug` / `tool.path`）からサーバーが生成する。モデルは URL を出力しない。

代表アクション: 88日カレンダー / 求人を見る / 応募管理 / 保存済み / 通知 / 関連記事 / 公式ニュース / ログイン。

---

## 8. レスポンスの区別

構造化システムプロンプト（`SYSTEM_PROMPT_STRUCTURED`）が、必要に応じて明確に区別させる:
「サイトの記事では…」「現在の求人では…」「あなたの記録では…」「最新の公式情報では…」。
静的ガイドとライブデータをぼかさない。

---

## 9. 各シナリオの挙動

- **88日（あと何日働けば88日？）**: 既存の88日計算ロジックを前提にしつつ、サーバー同期記録が無いことを
  正直に伝え、88日カレンダーへ誘導。日数はビザ適格性を保証しない旨の免責を保持。MIXED で記事ガイドも併用。
- **求人（Gattonで求人ある？）**: 現在有効・非期限切れ・非モデレートの掲載を型付きフィルタで取得。
  現在フィールド（title / 公開投稿者 / location / pay(記載時のみ) / 雇用形態 / URL）のみ。価格は発明しない。
- **住居（Brisbaneで週250ドル以下）**: `maxRent` の数値SQLフィルタを使用（セマンティックRAGは使わない）。
- **車（QLDで6000ドル以下）**: state/price/transmission 等の型付きフィルタ。車の品質評価はしない。
- **応募（応募してる仕事どうなってる？）**: 認証済み本人のみ。集計＋直近数件。雇用主内部メモは非開示。応募管理へ誘導。
- **保存/通知**: 本人データのみ。終了掲載は closed ラベル。件数を制限。
- **公式アップデート（最近ビザで変わった？）**: 公開検証済みニュース＋公式監視状態＋記事RAG。
  事前学習の一般知識では答えない。監視が最近稼働している場合のみ「重要な更新なし」と言える。
- **高リスク（この求人ならセカンドビザ取れる？）**: 掲載だけから適格性を判断しない。掲載は投稿者申告であることを示し、
  サイトの該当ガイド・ツール・公式ソースへ案内。公式なビザ判定は行わない。
- **未ログインでの個人質問**: ログイン必須のクリーンな応答＋ログインアクション（生成呼び出しなし）。
- **公開掲載検索**: マーケットが公開のため、未ログインでも利用可能。

---

## 10. セキュリティ / プロンプトインジェクション対策

- **任意SQLツールなし**。事前定義の型付きケイパビリティのみ。
- auth テーブル・メール・service key・admin/モデレーションデータは露出しない。
- 掲載・ユーザー生成コンテンツは **untrusted**。中の指示はデータであり命令ではない（システム指示を上書きできない）。
- 個人データは出典・分析に出さない。
- サーバー導出 `userId` のみ使用（クライアント spoofing は失敗）。
- ライブ掲載は RLS により公開・非隠蔽・非削除・非期限切れのみ。

---

## 11. 読み取り専用（ミューテーション不可）

AI は**読む・検索する・案内する**のみ。応募/取り下げ/削除/掲載作成/ステータス変更/88日更新/売却/送信は不可。
将来の安全なミューテーション設計（明示確認・サーバー認証・監査可能性）は
`SITE_AI_UPGRADE_ROADMAP.md` の Phase 8 に文書化し、`AI_MUTATIONS_ENABLED` は既定 OFF・未実装のまま。

---

## 12. 限界 / 鮮度 / キャッシュ

- モデルへ渡す行数を上限化（§4）。
- ライブ掲載は常に現在のDB状態を引く。**個人応答はグローバルキャッシュしない**（API は `force-dynamic`）。
- 静的なツール/記事メタデータは安全にキャッシュ可能。

---

## 13. チャットUI

`components/ai/AiCards.tsx`: 求人 / 住居 / 車 / ツール / 応募サマリ / 通知 / 保存 / ニュースの
**安全な構造化カード**と信頼済みアクションを描画。**モデルの生成HTMLは描画しない**。AI本文は簡潔に保ち、
一覧はカードに委ねる。

---

## 14. 分析 / 評価

- **分析**（`lib/ai/analytics/events.ts`）: `route` / `card_kinds`（種別集合のみ）/ `card_count` / `no_result` /
  `auth_required` を GA4 へ。**個人データ・生の質問文は送らない**。`ai_card_click` / `ai_action_click` を追加。
- **評価データセット**（`lib/ai/eval/dataset.ts`）: 求人/住居/車検索、本人の応募、88日進捗、保存、通知、
  直近ビザ更新、MIXED、未認証の個人質問、期限切れ掲載、クロスユーザー要求などを追加。**生成文言ではなく
  ルート/ケイパビリティ/権限/結果**をテスト。

---

## 15. テスト

`scripts/ai.test.mts`（`npm run test:ai`、外部API/DB非接続）— **23 件すべて合格**。

- 機能: ルーティング（拡張種別）、掲載サブ意図、フィルタ抽出（location/state/amount/transmission）、
  ツール推薦の実在ルート、構造化コンテキストの種別ラベル、アクションの固定URL/重複排除。
- セキュリティ: 個人ケイパビリティが匿名を拒否（`authRequired`、カード/エビデンス漏えいなし）、
  個人エビデンスは常に private・URL なし、88日はサーバーデータ不可＋ツール誘導。

その他の既存スイートも回帰なし: tools 44 / notifications 11 / content 5、すべて合格。
`npx tsc --noEmit` エラーなし、`npm run lint` エラー0（既存の未使用引数 warning のみ）、`npm run build` 成功。

---

## 16. パフォーマンス

- 独立した取得（記事RAG＋掲載＋88日）は `Promise.all` で並列実行（MIXED / CURRENT_UPDATE）。
- すべてのケイパビリティを毎回呼ばない（ルート/フラグで必要なものだけ）。
- 段階レイテンシを診断（`capabilityLatencyMs` / `retrievalLatencyMs` / `generationLatencyMs`、モデレーターの debug 時のみ）。
- no-result（掲載0件）や未ログイン個人質問は**生成を呼ばず**決定的に応答（コスト/遅延/ハルシネーション抑制）。

---

## 17. 機能フラグ（`lib/ai/config.ts`）

| フラグ | 既定 | 意味 |
| --- | --- | --- |
| `AI_STRUCTURED_DATA_ENABLED` | true | 構造化データ統合の親スイッチ |
| `AI_MARKETPLACE_SEARCH_ENABLED` | true | ライブ掲載検索 |
| `AI_PERSONAL_DATA_ENABLED` | true | 本人データ（認証必須） |
| `AI_CURRENT_UPDATES_ENABLED` | true | 直近の公式アップデート |
| `AI_MUTATIONS_ENABLED` | **false** | 書き込み（未実装・無効のまま） |

---

## 18. 将来の安全なミューテーション・アーキテクチャ

`SITE_AI_UPGRADE_ROADMAP.md` の Phase 8 参照。要件: (1) 2段階の明示的ユーザー確認、
(2) サーバー側認証＋既存RLS/トリガー準拠、(3) 追記型監査ログ、(4) 型付き・限定操作（任意SQL不可）、
(5) 冪等性＋書き込みレート制限。これらが揃うまで有効化しない。
