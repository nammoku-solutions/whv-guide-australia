# OFFICIAL_SOURCE_REGISTRY.md

オーストラリアワーホリコンパスの「公式情報源モニタリング」で監視する**許可リスト（allow-list）**です。
ソースの静的定義はコード（[lib/monitor/registry.ts](lib/monitor/registry.ts)）で version 管理し、
可変な監視状態（`last_checked` / `content_hash` 等）は Supabase の `monitor_source_state` に保持します。

## 監視対象の原則

- **政府・公的機関の一次情報のみ。** ブログ・SNS・Reddit・ニュースアグリゲータ・
  移民エージェントのブログ・任意サイトは対象外。
- **ドメイン全体をクロールしない。** 1 ソース = 意味のある 1 ページ（または RSS/Atom）。
- URL は可能な限りリポジトリ内の記事（`lib/content/articles/*`）で既に引用済みの
  公式一次情報を採用。
- 追加・変更は `registry.ts` のコードレビューで管理する。

## ソース・メタデータ（各ソースが持つ項目）

| 項目 | 説明 |
| --- | --- |
| `sourceId` | 一意で安定した ID（DB の状態と対応） |
| `organisation` | 発行機関 |
| `sourceName` | ソース名（ページ名） |
| `url` | 監視対象 URL（公式一次情報） |
| `feedUrl` | RSS/Atom フィード URL（あれば優先） |
| `category` | サイト内ニュースのカテゴリ（visa/tax/cost/site/other） |
| `changeGroup` | 「最近の変更点」ページのグルーピング |
| `riskLevel` | low / medium / high（high は常にレビュー） |
| `monitoringMethod` | rss / html（優先順位 rss > html） |
| `enabled` | 監視の有効/無効 |
| `relatedCategories` | 影響記事突合に使う関連カテゴリ |
| `autoPublishEligibility` | 低/中リスク時に自動公開してよいか |
| *(DB)* `last_checked` / `last_changed` / `content_hash` / `last_status` | 可変な監視状態 |

## 現在の許可リスト

### Department of Home Affairs（移民・ビザ）

| sourceId | ページ | risk | 自動公開 |
| --- | --- | --- | --- |
| `homeaffairs-whv-417` | Working Holiday visa (subclass 417) | high | 不可 |
| `homeaffairs-whv-462` | Work and Holiday visa (subclass 462) | high | 不可 |
| `homeaffairs-specified-work` | Specified work (subclass 417) | high | 不可 |
| `homeaffairs-visa-pricing` | Visa pricing estimator | medium | 可 |
| `homeaffairs-english-language` | English language visa requirements | high | 不可 |

### Australian Taxation Office（税・Super）

| sourceId | ページ | risk | 自動公開 |
| --- | --- | --- | --- |
| `ato-whm-tax-rates` | Tax rates – working holiday makers | high | 不可 |
| `ato-tfn` | Tax file number | medium | 可 |
| `ato-dasp` | Departing Australia superannuation payment (DASP) | high | 不可 |
| `ato-gig-economy` | Gig economy and tax | medium | 可 |

### Fair Work Ombudsman（労働条件・最低賃金）

| sourceId | ページ | risk | 自動公開 |
| --- | --- | --- | --- |
| `fairwork-minimum-wages` | Minimum wages | high | 不可 |
| `fairwork-visa-holders` | Visa holders and migrants | high | 不可 |
| `fairwork-public-holidays` | Public holidays | medium | 可 |

### Services Australia（Medicare / 相互医療）

| sourceId | ページ | risk | 自動公開 |
| --- | --- | --- | --- |
| `servicesaustralia-rhca` | Reciprocal Health Care Agreements | high | 不可 |
| `servicesaustralia-medicare` | Medicare | medium | 可 |

### 州・準州（運転免許 / 登録 / 賃貸 Bond）

| sourceId | ページ | risk | 自動公開 |
| --- | --- | --- | --- |
| `servicensw-licence` | Service NSW ― Driver licences | medium | 可 |
| `vicroads-registration` | VicRoads ― Register a vehicle | medium | 可 |
| `qld-rta-bonds` | QLD RTA ― Rental bonds | medium | 可 |
| `nsw-fairtrading-renting` | NSW ― Renting and rental bonds | medium | 可 |

> **注:** 高リスク（high）ソースは `autoPublishEligibility=false` を必須とし、テスト
> （[scripts/monitor.test.mts](scripts/monitor.test.mts)）で恒久的に検証しています。
> 高リスクトピック（ビザ資格・規定労働・税率/義務・最低賃金/労働法・主要な法的要件・
> 医療要件）は既定で常にレビュー必須です。

## ソースの追加手順

1. `lib/monitor/registry.ts` にエントリを追加（公式一次情報の URL のみ）。
2. `riskLevel` を適切に設定。高リスクなら `autoPublishEligibility: false`。
3. `relatedCategories` に、影響記事突合用のカテゴリ/タグを設定。
4. `npm run test:monitor` でレジストリ健全性テストを通す。
5. 初回の監視実行では**ベースラインを確立するだけ**（ニュース生成なし）。
   2 回目以降の実行で差分が検出される。
