# MANUAL_NEWS_SEED_GUIDE.md

オーストラリアワーホリコンパスの「手動シード（Manual Seed）」オペレータ向けガイド。

手動シードは、政府サイトのサーバー側取得が **blocked / timeout** になる場合でも、オペレータが
ブラウザで見つけた**公式 URL**（と必要なら**公式本文**）を、既存の歴史的バックフィル
パイプラインに投入するための特権バッチです。**日本語ニュース記事を手で書く必要はありません。**

> **contentFile（長文向け・推奨）:** 長い公式本文は JSON へ直接貼ると壊れやすいので、UTF-8 の `.txt`
> ファイルへ貼り付け、シードから `contentFile` で参照できます（本ガイド末尾「contentFile」参照）。
> なぜ手動が必要かは [OFFICIAL_SOURCE_MONITOR_HEALTH_REPORT.md](OFFICIAL_SOURCE_MONITOR_HEALTH_REPORT.md)
> を参照（Home Affairs / ATO は 403、Fair Work は timeout で live 取得が degraded）。


- これは日次モニタの置き換えではありません。
- 自動アーカイブ探索（`npm run news:backfill`）の置き換えでもありません。追加の取り込み経路です。
- 生成・関連度・grounding・重複防止・リスク/公開ポリシー・記事影響・AI 索引はすべて既存規則を再利用します。
- **原則としてまず `--dry-run` を実行**し、問題なければ `--apply` してください。

---

## 1. 通常の URL ワークフロー

オペレータがブラウザで公式告知を見つけ、URL をコピーします。

```
npm run news:backfill:seed -- --url "https://immi.homeaffairs.gov.au/news-media/archive/article?itemId=1234" --dry-run
```

問題なければ apply:

```
npm run news:backfill:seed -- --url "https://immi.homeaffairs.gov.au/news-media/archive/article?itemId=1234" --apply
```

複数 URL:

```
npm run news:backfill:seed -- \
  --url "https://immi.homeaffairs.gov.au/..." \
  --url "https://www.ato.gov.au/..." \
  --dry-run
```

システムは URL を検証（公式 `*.gov.au` 由来のみ）し、取得できれば公式タイトル・公式日・
本文を抽出して候補を作り、既存パイプラインに渡します。

---

## 2. ブロックされた URL のフォールバック（Manual Content Mode）

サーバー側取得が `blocked` / `timeout` になる場合、ファイルに公式本文を貼り付けます。

`news-backfill-seeds.local.json`（このファイルは `.gitignore` 済み・コミットされません）:

```json
[
  {
    "url": "https://immi.homeaffairs.gov.au/news-media/archive/article?itemId=1234",
    "title": "Official announcement title",
    "publishedAt": "2026-07-03",
    "content": "Official page text copied verbatim from the official source..."
  }
]
```

実行:

```
npm run news:backfill:seed -- --file news-backfill-seeds.local.json --dry-run
npm run news:backfill:seed -- --file news-backfill-seeds.local.json --apply
```

> **重要:** `content` は**公式ソースからそのままコピー**してください。オペレータが要約・
> リライトしないこと。生成される日本語ニュースは、この供給テキストのみを根拠（grounding）に
> します。供給テキストに無い金額・料率・日付・資格要件・URL は生成されません。

範囲を明示する場合（範囲外シードは拒否）:

```
npm run news:backfill:seed -- --file news-backfill-seeds.local.json --from 2026-06-01 --to 2026-08-16 --apply
```

---

## 3. シードファイル形式

`[{ url, title?, publishedAt?, content? }]` の JSON 配列。テンプレートは
[news-backfill-seeds.example.json](news-backfill-seeds.example.json)。

| フィールド | 必須 | 説明 |
| --- | --- | --- |
| `url` | ✅ | 公式 URL。`*.gov.au` 由来の許可リストのみ。 |
| `title` | 取得で復元できないとき必須 | 公式タイトル。 |
| `publishedAt` | 取得で復元できないとき必須 | 公式公開日（`2026-07-03` や `3 July 2026`）。 |
| `content` | 取得がブロックされたときのフォールバック | 公式本文（そのままコピー）。 |

`--url` と `--file` は併用できます。

---

## 4. 許可される公式ソース

既存の公式ソースレジストリから導出した `*.gov.au` ドメインのみを受理します
（例: `homeaffairs.gov.au` / `ato.gov.au` / `fairwork.gov.au` / `servicesaustralia.gov.au` /
`nsw.gov.au` / `vic.gov.au` / `qld.gov.au`）。

**拒否**: Facebook・Reddit・JAMS.TV・移民エージェント・ブログ・ニュースサイト・任意ドメイン・
短縮 URL・非公式へのリダイレクト。送信 URL と**最終リダイレクト先**の両方を検証します。

Bot 保護の回避（UA 偽装・CAPTCHA/Cloudflare 回避・プロキシ・ステルスブラウザ）は行いません。
取得できない場合は Manual Content Mode を使ってください。

---

## 5. 高リスクは常にレビュー

手動シードは「強制公開」ではありません。次のような高リスクトピックは、たとえ公式 URL でも
`review_required` のまま `/admin/monitor` で承認/却下します。

- ビザ資格 / サブクラス規則 / 規定労働
- 税率・税義務 / 最低賃金 / 雇用法
- 主要な法的要件 / 医療要件

低/中リスクは、関連度・grounding・信頼度・非重複などの既存条件をすべて満たす場合のみ自動公開されます。

---

## 6. 重複

次に対して重複を照合します（既存の event-key / content-hash / URL / タイトル / 日付ロジック）。

1. 手書きニュース（`lib/newsData.ts`）
2. 自動生成 `news_items`
3. 過去にバックフィルされたニュース
4. 同一実行内の他シード

重複は `duplicate_existing_news` として記録し、新しいコピーは作りません。**このコマンドは再実行しても安全です。**

---

## 7. 管理承認

手動シードで取り込んだニュースは既存の `/admin/monitor` に表示され、「手動シード・公式日・取込日」
ラベルが付きます。`review_required` は既存 UI で承認/却下できます。公開されたものだけが AI 索引に
増分反映されます（review・重複・スキップは索引しません）。

---

## 8. live-monitor の隔離

手動シードは live-monitor のベースライン（`monitor_source_state` / `content_hash` /
`last_checked` / `last_changed` / 失敗数 / ベースラインスナップショット）に**一切書き込みません**。
日次モニタの挙動は前後で変わりません。

---

## 9. dry-run と apply

- **dry-run（既定）**: URL 検証・取得結果・手動本文フォールバックの有無・公式日・関連度・リスク・
  重複・grounding・予測される公開結果・記事影響を表示。News・記事影響・AI 索引・監視状態には書き込みません。
- **apply**: 受理された歴史的ニュースを挿入。低/中リスクは既存ポリシーで自動公開、高リスクは
  `review_required`、重複はスキップ、記事影響を作成、公開分のみ増分索引。ベースラインは保全。
  apply には Supabase service-role と migration `0012` / `0013` の適用が必要です。

---

## 10. よくあるエラー（オペレータ対応）

| コード | 意味 | 対応 |
| --- | --- | --- |
| `INVALID_SOURCE` | 公式許可リスト外のドメイン | 公式 `*.gov.au` の URL を使う |
| `INVALID_URL` | URL を解釈できない | URL を確認する |
| `FETCH_BLOCKED` | サーバー側取得が拒否された | `title` / `publishedAt` / `content` をシードに追加 |
| `TIMEOUT` | 取得がタイムアウト | 同上（Manual Content Mode） |
| `MISSING_OFFICIAL_TITLE` | タイトルを抽出できない | `title` を指定 |
| `MISSING_OFFICIAL_DATE` | 公式日を抽出できない | `publishedAt` を指定（推測しない） |
| `CONTENT_TOO_SHORT` | 本文が短すぎる/抽出不可 | 公式本文を `content` に貼り付け |
| `OUT_OF_RANGE` | 指定 `--from/--to` 範囲外 | 範囲を見直す |
| `CONTENT_AND_CONTENT_FILE_CONFLICT` | `content` と `contentFile` の同時指定 | どちらか一方に |
| `CONTENT_FILE_NOT_FOUND` | contentFile が無い/読めない | パスを確認（リポジトリルート相対） |
| `CONTENT_FILE_OUTSIDE_ALLOWED_ROOT` | 許可ルート外/トラバーサル | リポジトリ配下の `.txt` を指定 |
| `CONTENT_FILE_TOO_LARGE` | 256KB 超 | 本文だけを貼った小さい `.txt` に |
| `CONTENT_FILE_EMPTY` | 空ファイル | 公式本文を貼り付け |
| `CONTENT_FILE_ENCODING_ERROR` | UTF-8 でない | UTF-8 で保存 |
| `DUPLICATE` | 既存ニュースと同一イベント | 対応不要（重複はスキップ） |

秘匿値（service-role / Gemini キー）はサーバー側のみ。シードファイルの公式本文は
`.gitignore`（`news-backfill-seeds.local.json` / `news-seeds/*.local.txt` / `news-seeds/local/`）で
誤コミットを防ぎます。

---

## 11. contentFile（長い公式本文向け）

長文の JSON エスケープを避けるため、公式本文を UTF-8 の `.txt` に貼り付け、シードから参照します。

推奨レイアウト:

```text
news-backfill-seeds.local.json
news-seeds/
  2026-07-30-japanese-fruit-pickers.local.txt
```

シード JSON:

```json
[
  {
    "url": "OFFICIAL_URL",
    "title": "OFFICIAL_TITLE",
    "publishedAt": "2026-07-30",
    "contentFile": "./news-seeds/2026-07-30-japanese-fruit-pickers.local.txt"
  }
]
```

ルール:
- `contentFile` は**リポジトリルートからの相対パス**。ルート外・トラバーサル・シンボリックリンク脱出・
  デバイス/特殊ファイルは拒否。UTF-8 のみ・最大 256KB。
- `content` と `contentFile` の**同時指定は不可**（曖昧さを避けるため拒否）。
- `.txt` には**公式ページ本文をそのまま**貼り付け（要約・リライトしない）。生成される日本語ニュースは
  この供給テキストのみを根拠（grounding）にします。
- 取り込み後の処理（関連度・grounding・dedupe・リスク・公開・記事影響・AI 索引）はインライン `content` と同一です。

実行:

```bash
npm run news:backfill:seed -- --file news-backfill-seeds.local.json --dry-run
npm run news:backfill:seed -- --file news-backfill-seeds.local.json --apply
```

