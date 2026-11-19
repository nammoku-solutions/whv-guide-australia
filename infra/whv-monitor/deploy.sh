#!/usr/bin/env bash
set -euo pipefail
umask 077

phase="${1:-prepare}"
case "$phase" in
  prepare|enable|disable) ;;
  *) echo "Usage: bash infra/whv-monitor/deploy.sh [prepare|enable|disable]" >&2; exit 2 ;;
esac

profile=nammoku-prod
region=ap-northeast-1
stack=whv-official-monitor
expected_account="${WHV_AWS_PROD_ACCOUNT_ID:-}"

if [[ -z "$expected_account" ]]; then
  read -r -p "確認済みの本番AWSアカウントID（12桁）: " expected_account
fi
if [[ ! "$expected_account" =~ ^[0-9]{12}$ || "$expected_account" == 262741079258 ]]; then
  echo "STOP: enter the verified production account, not the non-production account." >&2
  exit 1
fi

export AWS_PAGER=""
aw() { aws --profile "$profile" --region "$region" "$@"; }
actual="$(aw sts get-caller-identity --query Account --output text)"
if [[ "$actual" != "$expected_account" ]]; then
  echo "STOP: AWS identity resolved to $actual, not the requested production account." >&2
  exit 1
fi
echo "AWS account=$actual profile=$profile region=$region stack=$stack mode=$phase"

cd "$(dirname "${BASH_SOURCE[0]}")/../.."
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

stack_output() {
  aw cloudformation describe-stacks --stack-name "$stack" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue | [0]" --output text
}

if [[ "$phase" == prepare ]]; then
  read -r -p "AWSからの通知を受け取るメールアドレス: " notify_email
  [[ -n "$notify_email" ]] || { echo "STOP: notification email is required." >&2; exit 1; }
  printf '%s' "$notify_email" | python3 -c 'import json,sys; json.dump(["NotificationEmail=" + sys.stdin.read(),"EnableSchedule=false"], sys.stdout)' > "$tmp/parameters.json"
  overrides=("file://$tmp/parameters.json")
else
  if [[ "$phase" == enable ]]; then
    topic="$(stack_output NotificationTopic)"
    confirmed="$(aw sns list-subscriptions-by-topic --topic-arn "$topic" \
      --query 'length(Subscriptions[?Protocol==`email` && starts_with(SubscriptionArn, `arn:`)])' --output text)"
    [[ "$confirmed" =~ ^[0-9]+$ && "$confirmed" -gt 0 ]] || {
      echo "STOP: confirm the SNS email subscription before enabling the schedules." >&2
      exit 1
    }
    overrides=("EnableSchedule=true")
  else
    overrides=("EnableSchedule=false")
  fi
fi

node infra/whv-monitor/build.mjs "$tmp/template.json"
aw cloudformation validate-template --template-body "file://$tmp/template.json" >/dev/null
aw cloudformation deploy --stack-name "$stack" --template-file "$tmp/template.json" \
  --parameter-overrides "${overrides[@]}" --capabilities CAPABILITY_IAM --no-fail-on-empty-changeset

group="$(stack_output SchedulerGroup)"
for schedule in weekly watchdog; do
  actual_state="$(aw scheduler get-schedule --group-name "$group" --name "$schedule" --query State --output text)"
  expected_state=DISABLED
  [[ "$phase" != enable ]] || expected_state=ENABLED
  [[ "$actual_state" == "$expected_state" ]] || { echo "STOP: $schedule is $actual_state (expected $expected_state)." >&2; exit 1; }
  printf '%s %s\n' "$schedule" "$actual_state"
done

if [[ "$phase" == prepare ]]; then
  worker="$(stack_output FunctionName)"
  aw lambda invoke --function-name "$worker" --cli-binary-format raw-in-base64-out \
    --payload '{"mode":"probe"}' --cli-read-timeout 270 "$tmp/probe.json" > "$tmp/invocation.json"
  jq . "$tmp/probe.json"
  jq -e '.FunctionError == null' "$tmp/invocation.json" >/dev/null
  jq -e '.checked > 0 and (.failures | type == "array")' "$tmp/probe.json" >/dev/null
fi
