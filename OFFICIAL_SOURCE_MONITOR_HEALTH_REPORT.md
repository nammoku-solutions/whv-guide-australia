# OFFICIAL_SOURCE_MONITOR_HEALTH_REPORT.md

オーストラリアワーホリコンパスの「公式ソース日次モニタ」の**実行時（ランタイム）健全性**監査結果。
ワークフローが存在すること・終了コードが 0 であることを「監視が機能している」と**みなさない**ための
可視化を追加した。Bot 保護の回避（UA 偽装・プロキシ・ステルスブラウザ・CAPTCHA/Cloudflare 回避）は
一切行っていない。

---

## 1. 歴史的バックフィル と ライブ監視は別問題（B8）

### historical_backfill_unsupported（過去分の再構成）
多くの公式ソースは「現在の状態ページ」しか公開せず、日付つきアーカイブ/フィードが無い。これらは
`historical_backfill_unsupported` で、**過去のニュース再構成**のみに影響する（`HISTORICAL_NEWS_BACKFILL_REPORT.md` 参照）。

### fetch/access limitation（ライブ取得の可否）
`blocked` / `timeout` は**別問題**。同じ公式ドメインがサーバー/データセンターからのリクエストを拒否/遅延
させる場合、**日次ライブ監視も degraded になり得る**。したがって本システムは「ライブ監視が動くはず」と
仮定せず、実行時の取得健全性を**可視化**する。

---

## 2. 実行時の取得ステータス（読み取り専用プローブ）

本環境（データセンター相当）から、既存 `fetchSource`（監視と同一・UA 偽装なし）で読み取り専用に取得した
現在の結果:

| ソース | 取得結果 | HTTP |
| --- | --- | --- |
| Department of Home Affairs（whv-417） | **blocked** | 403 |
| Australian Taxation Office（whm-tax-rates） | **blocked** | 403 |
| Fair Work Ombudsman（minimum-wages） | **timeout**（30s でも） | - |
| Service NSW（driver-licences） | **http_error** | 404（URL 要見直し） |

> 結論: **「自動 News 監視は正常に動作している」とは言えない。** Home Affairs / ATO はサーバー側
> リクエストを 403 で拒否し、Fair Work は 30 秒でもタイムアウトする。これらは live 監視でも degraded。

## 3. スケジュール監視が各ソースを実際に取得できているか

`monitor_source_state`（`npm run monitor:health`）の現在値: 全 18 ソースが `never_succeeded`
（このデータベースでは成功取得が 1 件も記録されていない）。すなわち、**スケジュール監視が対象ページの
取得に成功した実績は確認できない**。ワークフローの存在＝成功ではないことが、ヘルスとして明示される。

---

## 4. ソースヘルスの意味（既存状態から導出・DB 列を追加しない）

`monitor_source_state`（`last_status` / `last_checked` / `last_changed` / `content_hash` /
`consecutive_failures`）から [lib/monitor/health.ts](lib/monitor/health.ts) が導出する:

| 状態 | 導出 |
| --- | --- |
| `healthy` | ベースラインあり ∧ 直近成功 ∧ 連続失敗 0 |
| `degraded` | ベースラインあり ∧ 連続失敗 1–2 |
| `failing` | 連続失敗 ≥ 3 |
| `never_succeeded` | ベースライン未確立（＝一度も意味のある取得成功が無い） |

「最終成功時刻」は導出値（直近成功中なら `last_checked`、失敗中は `last_changed` を下限値として表示。
別カラムは追加していない）。

---

## 5. 可視化

- **CLI（読み取り専用）**: [scripts/monitor-health.mts](scripts/monitor-health.mts)（`npm run monitor:health`）。
  取得しない・Gemini を呼ばない・ベースライン/ハッシュを変更しない。ソースごとに
  organisation / status / lastChecked / lastSuccess / consecutiveFailures / lastChanged / URL を表示。
- **日次ジョブの簡潔サマリ**（[scripts/monitor-sources.mts](scripts/monitor-sources.mts)）:
  ```
  Monitor run:
  Sources / Success (fetched) / Blocked / Timeout / HTTP error /
  Parse/structure error / Meaningful changes / News generated / Review required / Published
  ```
  失敗種別（blocked/timeout/parse）は `::warning::` アノテーション＋`GITHUB_STEP_SUMMARY` に出力。
  **生の政府本文・秘匿値は出力しない。**
- **管理 UI**: `/admin/monitor` に「ソースヘルス」テーブルを追加（failing/never_succeeded を強調）。公開しない。

---

## 6. GitHub Actions 失敗ポリシー（B6）

- 個別ソースの一時的な blocked/timeout では**ジョブを落とさない**（健全なソースは処理を続行）。
- 失敗は警告アノテーション＋ステップサマリで**必ず可視化**（沈黙させない）。
- **全ソースが取得失敗（システム的障害）**の場合のみ、監視スクリプトが**非ゼロ終了**しジョブを失敗させる。
- ヘルス集計ステップ（`monitor:health`, `if: always()`）を追加し、実行後に状態を要約。

---

## 7. ソース固有タイムアウト & 限定リトライ（B10）

- 全体タイムアウトは保守的（`MONITOR_FETCH_TIMEOUT_MS`, 既定 20s）のまま。
- Fair Work は応答が遅く timeout しやすいため、`SourceDefinition.fetchTimeoutMs = 30000` を付与。
- timeout（一時的なネットワーク不調のことがある）に対して**1 回だけ**再試行（無限リトライなし・ブロックは再試行しない）。
- それでも Fair Work は 30s でタイムアウトするため、**繰り返し叩かず degraded として報告**する。

---

## 8. 安全な公式代替（B9）

- 403（blocked）はフィード不在ではなく**アクセス制御**の問題。Home Affairs / ATO について、自動監視に
  適した**公式にサポートされた RSS/Atom/API を確認できなかった**。
- Bot 保護の回避は行わない方針のため、確認できない代替を推測で追加しない。
- したがって該当ソースは **degraded のまま維持**し、オペレータ手動フォールバック（Manual Seed）を案内する。
- Service NSW の 404 は URL 陳腐化の可能性があり、レジストリ URL の見直しが必要（別タスク）。

---

## 9. degraded ソースのオペレータ・フォールバック

live 取得が degraded なソースは、オペレータがブラウザで公式ページを開き、**Manual Seed**（本文貼り付け）で
取り込める。長文は `.txt` を用いる `contentFile` を推奨:

```bash
npm run news:backfill:seed -- --file news-backfill-seeds.local.json --dry-run
npm run news:backfill:seed -- --file news-backfill-seeds.local.json --apply
```

詳細は [MANUAL_NEWS_SEED_GUIDE.md](MANUAL_NEWS_SEED_GUIDE.md)。これは既存の関連度・grounding・dedupe・
リスク・公開ポリシー・記事影響・AI 索引を再利用し、force publish ではない。

---

## 10. contentFile ワークフロー（Part A）

長い公式本文の JSON エスケープを避けるため、`contentFile`（UTF-8 .txt へのリポジトリルート相対パス）を追加:

```json
[
  { "url": "OFFICIAL_URL", "title": "OFFICIAL_TITLE", "publishedAt": "2026-07-30",
    "contentFile": "./news-seeds/2026-07-30-example.local.txt" }
]
```

- `content` と `contentFile` の**同時指定は拒否**（`CONTENT_AND_CONTENT_FILE_CONFLICT`）。
- パス安全: リポジトリルート配下のみ・トラバーサル/シンボリックリンク脱出/デバイス拒否・UTF-8・最大 256KB・
  空/未読は明確なエラー（`CONTENT_FILE_NOT_FOUND` / `_OUTSIDE_ALLOWED_ROOT` / `_TOO_LARGE` /
  `_EMPTY` / `_ENCODING_ERROR`）。
- 解決後は既存の Manual Content と同一経路（分類→grounding→dedupe→リスク→公開→影響→索引）。
- `.txt`（`news-seeds/*.local.txt` / `news-seeds/local/`）と `news-backfill-seeds.local.json` は `.gitignore` 済み。

---

## 11. 検証
| 検証 | 結果 |
| --- | --- |
| `npm run test:backfill:seed`（contentFile 含む 43 ケース） | ✅ 43 pass |
| `npm run test:monitor:health`（13 ケース） | ✅ 13 pass |
| `npm run test:backfill` / `test:monitor`（回帰） | ✅ 33 / 20 pass |
| `npx tsc --noEmit` | ✅ エラーなし |
| `npm run lint` | ✅ エラー 0（既存 warning 4 件のみ） |
| `npm run build` | ✅ Compiled successfully |
| `npm run monitor:health`（読み取り専用実行） | ✅ 全 18 = never_succeeded を可視化 |
| 読み取り専用取得プローブ | ✅ HA=403 / ATO=403 / Fair Work=timeout / ServiceNSW=404 |

---

## 12. 手動セットアップ
- Supabase migration: **NO**（ヘルスは既存 `monitor_source_state` から導出。新カラムなし）。
- Vercel env changes: **NO**。
- GitHub Secrets/Variables changes: **NO**（既存の監視用 Secrets を流用）。
- operator TXT source files（historical Manual Seed 用）: **YES**（degraded ソースは Manual Seed で取り込む）。

---

## 13. ハード要件の遵守
- **live-monitor ベースライン不変**: ヘルス導出・`monitor:health`・管理 UI・contentFile 解決はいずれも
  `monitor_source_state` に**書き込まない**（読み取りのみ・構造/挙動テストで検証）。
- Bot 保護の回避なし（UA 偽装・プロキシ・ステルス・CAPTCHA/Cloudflare 回避を実装していない）。
- 秘匿値・生の政府本文をログ/サマリに出力しない。
