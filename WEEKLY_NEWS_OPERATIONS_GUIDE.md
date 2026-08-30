# WHV Compass Weekly Official-Source Research Guide

WHV Compassの現行の週次公式情報調査・コンテンツ保守手順です。

## 1. Current operating model

現在の週次調査は、アプリの外部モデルAPIやGitHub Actionsではなく、**ChatGPTのスケジュールタスク**で行います。

- 実行: 毎週日曜 19:00 Australia/Brisbane
- 対象期間: 原則として直近約14日
- 優先ソース: Department of Home Affairs / Australian Taxation Office / Fair Work Ombudsman / その他関連するオーストラリア政府一次情報
- 対象: 日本語話者のWorking Holiday subclass 417利用者・申請者に実質的な影響がある変更
- 通知: 新しい重要変更または対応が必要な調査エラーがある場合のみ

ChatGPTは、変更内容、公開日または適用日、影響対象、WHV Compassで更新候補となるページを整理します。

## 2. What is intentionally NOT automated

現在、以下は自動化しません。

- 外部モデルAPIを使った公式ソース監視
- `external_news_candidates` の自動AI処理
- モデルによる関連度分類・日本語ニュース生成
- AIによる低リスク自動公開
- AI index / embedding更新
- GitHub ActionsによるモデルAPI呼び出し

旧Gemini系workflowは廃止済みです。`AI_RUNTIME_ENABLED=false`、`NEWS_AI_AUTOMATION_ENABLED=false` が正式な本番状態です。

## 3. Weekly review procedure

重要な更新が通知された場合は、次の順序で確認します。

1. 通知された一次公式ページを開く。
2. タイトル、公開/更新日、適用日、金額、条件、対象者を公式本文と照合する。
3. 既存のWHV Compass記事・ニュースと重複していないか確認する。
4. 影響を受ける記事の `sources` / `officialSources` / `verifiedAt` / 本文を確認する。
5. YMYL情報は、AI要約だけを根拠にせず一次公式情報で再確認する。
6. コード変更後はcontent validation、関連テスト、buildを実行する。
7. Preview/本番でモバイル表示、リンク、metadataを確認する。

## 4. Candidate inbox / historical automation infrastructure

Supabaseの `external_news_candidates`、`news_items`、monitor/backfill関連migrationおよび一部の処理コードは、履歴・将来の再利用可能性のため保持しています。

これらが存在することは、現在自動処理が動いていることを意味しません。candidate ingest endpointも `EXTERNAL_NEWS_INGEST_SECRET` が空なら無効で、現在は下流のモデル処理を自動実行しません。

過去の候補を手動で確認する場合は、公式ソースを再確認し、現在の運用ポリシーに従って判断してください。

## 5. Source and accuracy policy

- 政府・公式一次ソースを優先する。
- ブログ、SNS、Reddit、移民エージェント、ニュース記事は制度変更の最終根拠にしない。
- 金額・日付・税率・資格条件・指定労働要件等を推測しない。
- 州差・時点差がある事項は明記する。
- 更新が見つからない週は、不要なニュースを作らない。
- 既存記事の言い換えだけで低価値ページを増やさない。

## 6. Failure handling

### ChatGPT scheduled research fails

次回実行を待つだけで取りこぼす可能性がある重要期間は、運営者が同じ一次ソースを手動確認します。継続的なエラーがある場合はスケジュールタスク設定とアクセス可能な公式ソースを確認します。

### Official source blocked or unavailable

別の第三者ソースを事実根拠として代用せず、同一政府機関の公式ページ・公式リリース等を確認します。確認できない情報は公開しません。

### Existing content may be stale

該当記事を更新するまで、必要に応じて警告・確認日を見直します。高リスク情報は特に優先します。

## 7. Reactivating runtime AI in the future

サイトAIやニュースAI自動化を再開する場合は、単に環境変数を変更しないでください。少なくとも以下が必要です。

1. runtime API providerの選定
2. 料金・rate limit・データ取扱いの確認
3. generation / embedding / monitor model boundaryの実装
4. Secret管理
5. embedding互換性と必要な再index計画
6. grounding・dedupe・risk policy・high-risk reviewのテスト
7. CI / workflowの新規設計
8. Google DriveのArchitecture / Runbook / Test Plan更新
9. PreviewでのE2E検証
10. 明示的な本番有効化

旧プロバイダ固有コードや旧workflowをそのまま復活させる運用はしません。

## 8. Source of truth

現行運用については、`main`、このガイド、Google DriveのActiveなWHV Compass設計/運用文書を優先します。
過去の `*_REPORT.md`、旧Migration Guide、旧Workspace Studio/Gem関連文書は歴史的記録として扱います。
