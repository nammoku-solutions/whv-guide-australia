# HISTORICAL_NEWS_BACKFILL_REPORT.md

オーストラリアワーホリコンパスの「歴史的公式ニュース バックフィル」システムの監査・実装・
実行結果をまとめます。既存の公式ソース監視/ニュース自動化（`OFFICIAL_SOURCE_MONITOR_AND_NEWS_AUTOMATION_REPORT.md`）を
**再利用**し、日次モニタとそのベースラインは一切変更していません。

> **追記（手動シード）:** 政府サイトのサーバー側取得が blocked/timeout になる問題に対応するため、
> オペレータが公式 URL（と必要なら公式本文）を与えて**同じ**バックフィルパイプラインへ投入する
> 「手動シード（Manual Seed）」を追加しました。詳細は本文末尾の「手動シード」節と
> [MANUAL_NEWS_SEED_GUIDE.md](MANUAL_NEWS_SEED_GUIDE.md) を参照してください。

```
2026-06-01
   ↓  歴史的公式ニュース バックフィル（本機能・一度きり）
2026-08-16
   ↓  既存の日次ソースモニタ（不変）
将来の更新（自動）
```

---

## 1. 監査（既存アーキテクチャの再利用）

以下を精査し、**別系統のニュース生成器を作らず**、欠けていた「過去分の取り込み」だけを追加しました。

| 領域 | 既存実装 | バックフィルでの扱い |
| --- | --- | --- |
| 取得/抽出 | `lib/monitor/fetch.ts` / `extract.ts` | **再利用**（`fetchSource` / `extractHtml`） |
| 変更検知(ハッシュ/差分) | `lib/monitor/diff.ts` | ハッシュを dedupe に流用 |
| 関連度分類(Gemini) | `lib/monitor/classify.ts` | **再利用**（同一しきい値） |
| ニュース生成(Gemini/grounding) | `lib/monitor/generate.ts`（`checkGrounding`） | **再利用**（供給テキストのみ根拠） |
| 重複防止 | `lib/monitor/dedupe.ts` | 再利用＋歴史用照合を追加 |
| 公開ポリシー | `lib/monitor/publish.ts` | **再利用**（`decidePublication`, 高リスク=常に review） |
| 記事影響 | `lib/monitor/impact.ts` | 再利用＋公式日考慮の抑制を追加 |
| AI インデックス | `lib/monitor/indexNews.ts` | **再利用**（公開分のみ増分 upsert） |
| DB | `news_items` / `article_impacts`（migration 0011） | 再利用（列を追加） |
| 公開 UI | `/news` `/news/[slug]` `/changes` `lib/newsAuto.ts` | 再利用（順序・ラベルを調整） |
| 管理 | `/admin/monitor` + API | 再利用（バックフィル表示を追加） |

### 歴史的ソースの実地調査（fetch で確認）
- **Department of Home Affairs ニュースアーカイブ**：`https://immi.homeaffairs.gov.au/news-media/archive`
  — 日付つき（例「22 Jun 2026」「03 Jul 2026」）の公式ニュース一覧が存在。**アーカイブ対応**。
- **Fair Work Ombudsman ニュースルーム（メディアリリース）**：`https://www.fairwork.gov.au/newsroom/media-releases`
  — 日付つき（例「13 Aug 2026」）の公式メディアリリース一覧が存在。**アーカイブ対応**（多くは個別企業の摘発で、
    関連度分類でフィルタされる想定）。
- その他の allow-list ソースは**現在の状態ページのみ**で、日付つきアーカイブ/フィードを公開しておらず、
  過去の変更を安全に再構成できないため `historical_backfill_unsupported`。

---

## 2. 実装（新規追加・既存は保全）

### 2.1 歴史的ソースアダプタ（拡張可能）
- [lib/monitor/backfill/adapters.ts](lib/monitor/backfill/adapters.ts)
  - `HistoricalSourceAdapter`（`sourceId` / `supportsBackfill` / `discoverEntries`）。
  - **RSS/Atom アダプタ**（`parseFeedEntries`：全エントリを日付つきで抽出）。
  - **アーカイブ/ニュース一覧アダプタ**（`parseArchiveEntries`：日付つきリンクのみを決定的に抽出）。
  - 既存 `fetchSource` / `extractHtml` を再利用。政府ドメインを再帰クロールしない（1 ソース=1 一覧＋範囲内エントリ本文）。
- [lib/monitor/registry.ts](lib/monitor/registry.ts) に任意の `historical` 設定
  （`method: rss | archive | unsupported`）を追加。Home Affairs / Fair Work を archive として設定、
  現在状態ページは `unsupported`（理由つき）。

### 2.2 候補モデル・日付
- [lib/monitor/backfill/types.ts](lib/monitor/backfill/types.ts)：`HistoricalCandidate`
  （sourceId / organisation / officialTitle / officialUrl / **officialPublishedAt** / officialUpdatedAt /
  content / sourceType / discoveredAt / range…）。
- [lib/monitor/backfill/dates.ts](lib/monitor/backfill/dates.ts)：範囲検証（不正日付 / `from>to` /
  過度に広い範囲を拒否・`--allow-wide-range` で override）と、各種公式日付表記の**決定的パース**
  （不明なら null＝推測しない）。

### 2.3 コスト管理・探索
- [lib/monitor/backfill/keywordPrefilter.ts](lib/monitor/backfill/keywordPrefilter.ts)：Gemini 前の
  WHV 語彙プレフィルタ（日付フィルタ→公式ソース→決定的 dedupe→キーワードの順で絞る）。
- [lib/monitor/backfill/discover.ts](lib/monitor/backfill/discover.ts)：有効ソースを逐次探索
  （ソース間に遅延・同時実行なし）。設定の無いソースは `unsupported` を**明示**（失敗を無情報化しない）。

### 2.4 パイプライン（既存の再利用）
- [lib/monitor/backfill/pipeline.ts](lib/monitor/backfill/pipeline.ts)
  - フロー：プレフィルタ → 関連度分類 → 生成 → grounding → **重複判定** → 公開ポリシー → 記事影響 →
    (apply のみ) 挿入 → 影響レコード → **公開分のみ** AI インデックス。
  - `detectedAt` = 取り込み日時（2026-08-16）、`source_published_at` = 公式公開日。**両者を区別**。
  - 高リスクは常に `review_required`（歴史的でもバイパスしない）。薄い更新は `skipped_thin`。
- [lib/monitor/backfill/dedupe.ts](lib/monitor/backfill/dedupe.ts)：手書きニュース（`lib/newsData.ts`）・
  既存 `news_items`・実行内候補の 3 系統に照合（event_key / content_hash / 公式 URL / 正規化タイトル /
  公式日 / 文字バイグラム類似）。重複は `duplicate_existing_news` として記録し、既存の良質記事を優先。
- [lib/monitor/backfill/impact.ts](lib/monitor/backfill/impact.ts)：既存 `analyzeArticleImpact` を再利用し、
  **記事が公式イベント日以降に確認/更新済みなら `unaffected`** に抑制（誤った陳腐化警告を出さない）。

### 2.5 DB 層（live-monitor ベースラインに触れない）
- [lib/monitor/backfill/db.ts](lib/monitor/backfill/db.ts)：`news_items`（＋バックフィル列）・
  `article_impacts`・`news_backfill_runs` のみに書き込む。**`monitor_source_state` /
  `monitor_snapshots` / `monitor_changes` には一切書き込まない**（テストで構造的にも検証）。

### 2.6 CLI
- [scripts/news-backfill.mts](scripts/news-backfill.mts) / `npm run news:backfill`
  - `--from` `--to`（既定 `2026-06-01`→`2026-08-16`）/ `--dry-run`（既定）/ `--apply` /
    `--allow-wide-range` / `--max-range-days`。
  - dry-run は News・AI インデックス・ベースラインに書き込まない。生の政府本文・秘匿値は出力しない。

### 2.7 スキーマ（最小追加）
- [supabase/migrations/0012_news_backfill.sql](supabase/migrations/0012_news_backfill.sql)
  - `news_backfill_runs`（実行監査：範囲・件数・状態・時刻／モデレーター読取 RLS）。
  - `news_items` に `is_backfill` / `backfill_run_id` / `source_updated_at` を追加（既存ポリシー不変）。

### 2.8 公開 UI・管理連携
- [lib/newsAuto.ts](lib/newsAuto.ts)：`is_backfill` 項目は **`source_published_at`（公式日）で並べる**
  （取り込み日の 8 月を「新着」に見せない）。既存の手書きニュース・自動ニュースの順序は保全。
- [app/api/admin/monitor/route.ts](app/api/admin/monitor/route.ts) / [app/admin/monitor/page.tsx](app/admin/monitor/page.tsx)：
  バックフィル項目に「歴史バックフィル・公式日/取り込み日」バッジを表示。既存のモデレーション動線
  （承認・却下・公式ソース・影響記事）をそのまま利用。

---

## 3. 対応 / 非対応ソース

| ソース | 歴史的取得 | 種別 |
| --- | --- | --- |
| `homeaffairs-whv-417` | 対応 | archive（`immi.homeaffairs.gov.au/news-media/archive`, 部門共通の代表窓口） |
| `fairwork-minimum-wages` | 対応 | archive（`fairwork.gov.au/newsroom/media-releases`） |
| `ato-whm-tax-rates` / `servicesaustralia-rhca` | 非対応 | 現在状態ページのみ（明示 `unsupported`） |
| その他 13 ソース | 非対応 | 現在状態ページのみ（日付つきアーカイブ/フィード未設定） |

> Home Affairs アーカイブは部門共通のため、代表として `homeaffairs-whv-417` に 1 つだけ設定し、
> 他の Home Affairs ソースへの重複探索を避けています。

---

## 4. 実行結果（2026-06-01 → 2026-08-16）

### 4.1 Dry-run
| 指標 | 値 |
| --- | --- |
| Sources scanned | 18 |
| supported / unsupported | 0 / 16（＋取得失敗 2） |
| Historical entries discovered | 0 |
| WHV relevant | 0 |
| Existing duplicates | 0 |
| Published (low/med) | 0 |
| High-risk review required | 0 |
| Skipped weak/unrelated/thin | 0 |
| Errors | 0 |
| Article impacts created | 0 |
| AI news chunks indexed | 0 |
| **Live-monitor baseline untouched** | **YES** |

ソース別の要点：
- `homeaffairs-whv-417` … **blocked**（政府サイトがサーバー側 Bot 取得＝独自 User-Agent を 403 で拒否）。
- `fairwork-minimum-wages` … **timeout**（一覧取得がタイムアウト）。
- 残り 16 … `historical_backfill_unsupported`（現在状態ページのみ）。

### 4.2 Apply
- migration 0012 未適用のため **書き込みなし**（安全に no-op）。候補 0 件のため実書き込み対象も無し。
- **Live-monitor baseline untouched: YES**。

### 4.3 処理候補テーブル
| 公式日 | 機関 | タイトル | カテゴリ | リスク | 結果 | ソース URL |
| --- | --- | --- | --- | --- | --- | --- |
| （該当なし） | — | — | — | — | — | — |

> 取得できた候補は 0 件でした。これは「過去にニュースが無かった」という意味では**ありません**。
> 2 つの対応ソースが `blocked` / `timeout` で一覧取得に失敗したためで、システムは失敗種別を明示し、
> 事実を**捏造していません**（#24 の要件どおり）。

---

## 5. 取得ブロックについて（重要な運用注記）
- 実装の `fetchSource` は既存モニタと同一の**監視用 User-Agent** を用います。政府サイト（immi / fairwork）は
  データセンター IP からのサーバー側取得を **403（blocked）/ timeout** で拒否することがあります。
- ブラウザ相当の UA へ**偽装して Bot 保護を回避することは行っていません**（敬意ある取得の原則）。
- したがって候補取得には、**ブロックされない環境/IP から再実行**するか、公式が許可する取得方法が必要です。
  アダプタ・パイプライン・dedupe・公開ポリシー・グラウンディング・AI インデックス連携はすべて実装済みで、
  一覧が取得できれば以降は既存規則どおりに処理されます（テストで実証済み）。

---

## 6. 検証（各 1 回・失敗時は 1 回の集中修正のみ）
| 検証 | 結果 |
| --- | --- |
| `npm run test:backfill`（決定的フィクスチャ 33 ケース） | ✅ 33 pass / 0 fail |
| `npm run test:monitor`（既存モニタ回帰） | ✅ pass |
| `npx tsc --noEmit` | ✅ エラーなし |
| `npm run lint` | ✅ エラー 0（既存 warning 4 件のみ・本変更外） |
| `npm run build`（prebuild 検証込み） | ✅ Compiled successfully |

テスト網羅（#25 の 30 項目に対応）：RSS 範囲内/前/後・アーカイブ一覧・非対応ソース・関連/無関係/弱関連・
手書き/自動/実行内の重複・公式日欠落・grounding 失敗・低リスク公開適格・高リスク review・取得失敗・
パーサ構造変化・**live-monitor 不変（構造/挙動）**・記事更新済みの抑制・古い記事の影響維持・
dry-run 無書き込み・apply 書き込み・公開分のみ増分インデックス・review 非インデックス・時系列順序 等。

---

## 7. 手動セットアップ（デプロイ担当者向け）
1. **Supabase**：SQL エディタで
   [supabase/migrations/0012_news_backfill.sql](supabase/migrations/0012_news_backfill.sql) を
   `0011` の後に適用（`news_backfill_runs` テーブルと `news_items` の 3 列を追加）。
2. **再実行（対応ソースがブロックされない環境で）**：
   ```
   npm run news:backfill -- --from 2026-06-01 --to 2026-08-16 --dry-run
   # 構造的な失敗が無ければ
   npm run news:backfill -- --from 2026-06-01 --to 2026-08-16 --apply
   ```
   apply は migration 0012 適用済みかを検査し、未適用なら安全に no-op します。
3. **将来の範囲**（同じコマンドで安全に指定可能）：
   ```
   npm run news:backfill -- --from YYYY-MM-DD --to YYYY-MM-DD --dry-run
   npm run news:backfill -- --from YYYY-MM-DD --to YYYY-MM-DD --apply
   ```
   これは**日次モニタの置き換えではありません**。原則としてまず dry-run を実行してください。

---

## 8. 安全性・原則の遵守
- **live-monitor ベースライン不変：YES**（`monitor_source_state.content_hash` / スナップショット /
  `last_checked` / `last_changed` / 連続失敗数に触れない。DB 層で構造的に保証・テスト済み）。
- 公式一次情報のみ。政府ドメインの再帰クロールなし。SNS/ブログ/移民エージェント/アグリゲータは対象外。
- 歴史的イベントを**捏造しない**。信頼できる公式日が無ければ標準ニュース化しない。
- 高リスク（ビザ/規定労働/税率/最低賃金/労働法/医療）は常に `review_required`。既存記事の自動書換えなし。
- グラウンディング（`checkGrounding`）を弱めない。重複は既存の良質記事を優先。
- 特権実行のみ（CLI/service-role）。匿名の公開トリガーは無し。秘匿値・生の政府スナップショットを露出しない。

---

## 9. 主要ファイル
- スキーマ：[supabase/migrations/0012_news_backfill.sql](supabase/migrations/0012_news_backfill.sql)
- ライブラリ：[lib/monitor/backfill/](lib/monitor/backfill/)（types / dates / keywordPrefilter /
  adapters / discover / dedupe / impact / db / pipeline）
- レジストリ：[lib/monitor/registry.ts](lib/monitor/registry.ts)（`historical` 設定）
- CLI：[scripts/news-backfill.mts](scripts/news-backfill.mts)（`npm run news:backfill`）
- テスト：[scripts/backfill.test.mts](scripts/backfill.test.mts)（`npm run test:backfill`）
- 公開/管理連携：[lib/newsAuto.ts](lib/newsAuto.ts) /
  [app/api/admin/monitor/route.ts](app/api/admin/monitor/route.ts) /
  [app/admin/monitor/page.tsx](app/admin/monitor/page.tsx)

---

## 10. 手動シード（Manual Seed）

政府サイトのサーバー側取得が blocked/timeout になる問題への追加取り込み経路。オペレータが公式 URL
（と必要なら公式本文）を与え、**同じ**バックフィルパイプライン（`processCandidate`）で処理する。
別系統のニュース生成器は作っていない。

### 10.1 アーキテクチャ（共有パイプラインの再利用）

```
自動アーカイブ探索 ┐
                   ├→ HistoricalCandidate → processCandidate（共有） → news_items / article_impacts / AI 索引
手動シード         ┘
```

- [lib/monitor/backfill/pipeline.ts](lib/monitor/backfill/pipeline.ts)：1 候補処理を
  `processCandidate` / `tallyStats` / `resolveWriteReadiness` として抽出し、自動探索・手動シードで共有。
- [lib/monitor/backfill/officialDomains.ts](lib/monitor/backfill/officialDomains.ts)：レジストリ由来の
  `*.gov.au` 許可リスト、URL 正規化（http→https・フラグメント/トラッキング除去・末尾スラッシュ）、
  **送信 URL と最終リダイレクト先の両方**を検証、レジストリソース解決（最長パス一致）。
- [lib/monitor/backfill/seed.ts](lib/monitor/backfill/seed.ts)：`SeedInput` の検証、公式メタデータ抽出
  （og:title / article:published_time / time / Last updated）、取得優先＋手動本文フォールバック、
  `runSeedBackfill`（バッチ耐性）。日付・タイトルは**推測しない**（不足時は明確なエラー）。
- CLI：[scripts/news-backfill-seed.mts](scripts/news-backfill-seed.mts)（`npm run news:backfill:seed`）。
  `--url`（複数）/ `--file` / `--from` / `--to` / `--dry-run`（既定）/ `--apply`。
- テンプレート：[news-backfill-seeds.example.json](news-backfill-seeds.example.json)（`.gitignore` で
  `news-backfill-seeds.local.json` を除外）。
- スキーマ：[supabase/migrations/0013_news_backfill_origin.sql](supabase/migrations/0013_news_backfill_origin.sql)
  （`news_items.backfill_origin` / `news_backfill_runs.origin`。**0011/0012 は変更しない**）。
- 管理表示：`/admin/monitor` に「手動シード・公式日・取込日」ラベル。既存の承認/却下動線をそのまま利用。
- テスト：[scripts/backfill-seed.test.mts](scripts/backfill-seed.test.mts)（`npm run test:backfill:seed`, 31 ケース）。

### 10.2 再利用した既存規則（別ルールを作らない）
関連度分類・grounded 生成・`checkGrounding`・重複防止（手書き/自動/バックフィル/実行内）・
公開ポリシー・リスク分類（高リスク=常に `review_required`）・記事影響（公式日考慮）・
公開分のみの増分 AI 索引。手動シードは「強制公開」ではない。

### 10.3 セキュリティ・隔離
- 手動シードは live-monitor のベースライン（`monitor_source_state` / snapshots / changes / `content_hash` /
  `last_checked` / `last_changed` / 失敗数）に**一切書き込まない**（構造/挙動の両方でテスト）。
- 公開の無認証取り込み API は無し（特権 CLI + service-role のみ）。Bot 保護の回避はしない。
- シードファイルの公式本文は `.gitignore` で誤コミットを防止（例テンプレートのみ追跡）。

### 10.4 検証
| 検証 | 結果 |
| --- | --- |
| `npm run test:backfill:seed`（31 ケース） | ✅ 31 pass / 0 fail |
| `npm run test:backfill`（自動探索の回帰） | ✅ 33 pass |
| `npm run test:monitor`（既存モニタ回帰） | ✅ 20 pass |
| `npx tsc --noEmit` | ✅ エラーなし |
| `npm run lint` | ✅ エラー 0（既存 warning 4 件のみ） |
| `npm run build` | ✅ Compiled successfully |

### 10.5 手動セットアップ
- Supabase：[supabase/migrations/0013_news_backfill_origin.sql](supabase/migrations/0013_news_backfill_origin.sql)
  を `0012` の後に適用（origin ラベル用。未適用でも取り込みは動作するが手動シード/アーカイブの区別ラベルは付かない）。
- 実行（オペレータが公式 URL を収集後）：
  ```
  npm run news:backfill:seed -- --file news-backfill-seeds.local.json --dry-run
  npm run news:backfill:seed -- --file news-backfill-seeds.local.json --apply
  ```

