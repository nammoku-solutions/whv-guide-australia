# WHV Compass AWS週次監視

VercelのサイトとSupabaseはそのまま。AWSで、公式一次情報の取得・本文差分・定期実行の成否だけを管理する。既存の公式ソース一覧とHTML本文抽出を再利用し、Home AffairsのWHM最新情報、ATO Media Centre、Fair Work等の公式ニュース一覧も監視する。新しい公式ページはレビューしたうえで監視対象に追加する。

## 実行と通知

- 日曜19:00（Australia/Brisbane）にEventBridge SchedulerがLambdaを起動する。初めて取得したページは比較基準として保存する。本文や転送先が変わった場合は公式URLと短い差分を通知する。
- 変更なしでもS3に記録し、通知は ① 変更候補 ② 取得失敗 ③ 21:00までに結果記録なし ④ AWSの実行・配信エラーに限る。CloudWatchにも実行結果が残る。
- 取得に失敗しても前回の正常な本文を保持する。同じ週の再実行では再取得せず、未送信の通知を再試行する。SNSへの送信後、送信済みの保存前に異常終了した場合は、同じメールが届くことがある。
- S3に本文スナップショットと最近12回分の結果を保存する。S3の古いバージョンは35日、CloudWatch Logsは30日で期限切れ。スタック削除時にもS3は保持される。
- 監視対象は登録したページの取得時点の本文。直近14日を検索してすべての発表を網羅する機能ではなく、週の途中で掲載・削除された内容やJavaScriptでしか描画されない本文は検知できない。通知は未確認の差分で、制度変更の認定や公式発表日を推定しない。
- DBは読み書きしない。AI API、旧Gemini処理、ニュース候補の登録・記事公開・AIインデックスにも接続しない。AWSの実行にChatGPTのチャットは不要。

## ステージングへ配置

Node.js 22以降、npm、AWS CLI v2、Python 3、jqを使う。東京リージョンの既存アカウントを使い、常時起動のサーバー、VPC、NATは作らない。以下はリポジトリのルートで実行する。まずステージング用の `nammoku-nonprod` と、検証済みのアカウントIDを指定する。本番で実行するときだけ `nammoku-prod` と本番のアカウントID、独立したスタック名を指定する。

```bash
(
  set -euo pipefail
  umask 077
  profile=nammoku-nonprod
  region=ap-northeast-1
  stack=whv-official-monitor-staging
  expected_account=262741079258

  aw() { aws --profile "$profile" --region "$region" "$@"; }
  actual="$(aw sts get-caller-identity --query Account --output text)"
  [[ "$actual" == "$expected_account" ]] || { echo "STOP: unexpected AWS account $actual"; exit 1; }

  export AWS_PAGER=""
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  read -r -p "通知を受け取るメールアドレス: " notify_email
  printf '%s' "$notify_email" | python3 -c 'import json,sys; json.dump([{"ParameterKey":"NotificationEmail","ParameterValue":sys.stdin.read()},{"ParameterKey":"EnableSchedule","ParameterValue":sys.argv[1]}], sys.stdout)' false > "$tmp/parameters.json"

  npm ci
  node --import tsx --test infra/whv-monitor/core.test.mts
  node infra/whv-monitor/build.mjs "$tmp/template.json"
  aw cloudformation validate-template --template-body "file://$tmp/template.json" >/dev/null
  aw cloudformation deploy --stack-name "$stack" --template-file "$tmp/template.json" \
    --parameter-overrides "file://$tmp/parameters.json" \
    --capabilities CAPABILITY_IAM --no-fail-on-empty-changeset

  worker="$(aw cloudformation describe-stacks --stack-name "$stack" \
    --query "Stacks[0].Outputs[?OutputKey=='FunctionName'].OutputValue | [0]" --output text)"
  aw lambda invoke --function-name "$worker" --cli-binary-format raw-in-base64-out \
    --payload '{"mode":"probe"}' --cli-read-timeout 270 "$tmp/probe.json" > "$tmp/invocation.json"
  jq -e '.FunctionError == null' "$tmp/invocation.json" >/dev/null
  jq . "$tmp/probe.json"
)
```

`probe` は実際のAWS環境から監視先を読みに行く。S3への書き込みも通知も行わない。表示される `checked` と `failures` を確認する。取得失敗は「変更なし」の扱いにせず、同じ公式機関の取得可能なページ・フィードがあるか確認する。

1. AWS SNSから届く確認メールの **Confirm subscription** を押す。通知先の確定後、ステージングで下記のアラーム通知テストを行い、受信を確認する。
2. 取得先と通知を確認してから、本番アカウントへまず `false`（停止状態）で配置する。本番の `probe` とSNS購読も確認する。
3. 同じ本番スタック名・プロファイルで上の手順を使い、パラメータ生成行の末尾の `false` を `true` に変更して更新する。最初の日曜の実行で基準を保存し、CloudWatch LogsとEventBridgeの実行結果を確認する。既存のChatGPTタスクは、この移行とは別に管理する。

停止するときは同じスタックを `EnableSchedule=false` に戻す。基準と履歴はS3に残る。障害時はCloudWatch Logsの `/aws/lambda/<stack>-worker`、EventBridgeのスケジュール、および配信失敗用SQSを確認する。

### ステージングだけで通知をテストする

SNSの購読確認後、ステージングプロファイルからCloudWatchアラームを一時的に遷移させる。CloudWatchからSNSまでの接続を実際に確認できる。実行結果を保存するLambda経路も試す場合は、ステージング関数に直近の日曜日の予定時刻（Brisbane 19:00 = 09:00 UTC）を指定し、同期呼び出しで `{"mode":"weekly","scheduledTime":"YYYY-MM-DDT09:00:00Z"}` を渡す。失敗がない初回実行は、基準保存だけ行いメールは送らない。

```bash
aws --profile nammoku-nonprod --region ap-northeast-1 cloudwatch set-alarm-state   --alarm-name whv-official-monitor-staging-lambda-errors   --state-value ALARM --state-reason "Staging notification test"
```
