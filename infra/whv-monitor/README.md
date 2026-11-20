# WHV Compass AWS週次監視

VercelのサイトとSupabaseはそのまま。AWSで、公式一次情報の取得・本文差分・定期実行の成否だけを管理する。既存の公式ソース一覧と本文抽出を再利用し、Home AffairsのWHM最新情報、ATO Media Centreの公式RSS、Fair Work Ombudsmanの公式ニュース一覧も監視する。新しい公式ページはレビューしたうえで監視対象に追加する。

## 実行と通知

- 日曜19:00（Australia/Brisbane）にEventBridge SchedulerがLambdaを起動する。初めて取得したページは比較基準として保存する。本文や転送先が変わった場合は公式URLと短い差分を通知する。
- 変更なしでもS3に記録し、通知は ① 変更候補 ② 取得失敗 ③ 21:00までに結果記録なし ④ AWSの実行・配信エラーに限る。CloudWatchにも実行結果が残る。
- 取得に失敗しても前回の正常な本文を保持する。同じ週の再実行では再取得せず、未送信の通知を再試行する。SNSへの送信後、送信済みの保存前に異常終了した場合は、同じメールが届くことがある。
- S3に本文スナップショットと最近12回分の結果を保存する。S3の古いバージョンは35日、CloudWatch Logsは30日で期限切れ。スタック削除時にもS3は保持される。
- 監視対象は登録したページの取得時点の本文。直近14日を検索してすべての発表を網羅する機能ではなく、週の途中で掲載・削除された内容やJavaScriptでしか描画されない本文は検知できない。通知は未確認の差分で、制度変更の認定や公式発表日を推定しない。
- DBは読み書きしない。AI API、旧Gemini処理、ニュース候補の登録・記事公開・AIインデックスにも接続しない。AWSの実行にChatGPTのチャットは不要。

## 本番AWSに直接配置

このジョブのためにステージング用サイト・DB・AWSスタックは作らない。東京リージョン（`ap-northeast-1`）の本番プロファイル `nammoku-prod` を使い、専用スタック `whv-official-monitor` だけを作る。初回は同じ本番スタックの定期実行を無効のまま配置する。

Node.js 22以降、npm、AWS CLI v2、Python 3、jqが必要。リポジトリのルートで実行する。プロンプトに入力する本番AWSアカウントIDはAWS Organizationsなどで事前に確認する。AWSプロファイルが返すアカウントが異なる場合、リソースは変更しない。アカウントIDはオプションで環境変数 `WHV_AWS_PROD_ACCOUNT_ID` でも指定できる。

```bash
npm ci
bash infra/whv-monitor/deploy.sh prepare
```

1. `prepare` が `weekly DISABLED` と `watchdog DISABLED` を出したことを確認する。最後に、本番Lambdaの `probe` が `succeeded`、`failures`、`missingNewsChannels` を出す。 `probe` はソース取得の確認のみで、S3への書き込みや監視通知はしない。再配置せず再確認するには `bash infra/whv-monitor/deploy.sh probe` を使う。
2. `missingNewsChannels` に機関がある場合、配置済みのスタックは削除せず、定期実行を無効のままにする。Home AffairsのWHMニュース、ATOの公式ニュースRSS、Fair Work Ombudsmanのメディアリリースは、それぞれ実際に取得できる必要がある。その他の `failures` も確認する。取得できなかった公式情報は別途確認し、既存の調査経路は止めない。
3. `missingNewsChannels` が空で、AWS SNSから届く確認メールの **Confirm subscription** で購読を確認したら、同じ本番スタックの定期実行を有効化する。 `enable` は配置済みLambdaでニュース取得を再確認してから実行する。`NotificationEmail` の既存値は引き継ぐ。

```bash
bash infra/whv-monitor/deploy.sh enable
```

成功時は `weekly ENABLED` と `watchdog ENABLED` を出す。次の日曜19:00の最初の実行後にS3またはCloudWatch Logsで実行記録を確認する。AWSの本文差分監視は、過去14日間の検索やニュース候補の登録をするChatGPTタスクの代わりにはならない。

### 初回作成がロールバックした場合

旧テンプレートの `ReservedConcurrentExecutions` がアカウントの同時実行枠の制限に当たった場合は、予約枠を指定しない修正版を取得する。CloudFormationで本番アカウントと東京リージョンを確認し、専用スタック `whv-official-monitor` が現在も `ROLLBACK_COMPLETE` の場合に限り、その失敗したスタックを削除する。この状態のスタックは更新できない。削除完了を待ってから `prepare` を再実行し、新しいSNS確認メールで購読を確認する。すでに作成済みの稼働スタックや、保持されたS3バケットはこの手順の削除対象にしない。

### 運用

- 一時停止は `bash infra/whv-monitor/deploy.sh disable`。S3の基準と履歴は残る。
- 通常運用後の再デプロイで `prepare` を使うと定期実行を停止するため、継続運用中の更新には `enable` を使う。
- 障害時はCloudWatch Logs（`/aws/lambda/whv-official-monitor-worker`）、EventBridge Schedulerの `whv-official-monitor-jobs` グループ、CloudFormationスタックの配信失敗用SQSを確認する。
- 通知経路のテストが必要な場合は確認済みの購読者に案内してから、監視専用の `whv-official-monitor-lambda-errors` アラームを一時的にテスト状態へ遷移させる。サイトやDBの動作は変化しない。
