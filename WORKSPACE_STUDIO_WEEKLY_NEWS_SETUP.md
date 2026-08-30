# Workspace Studio Weekly News Setup — LEGACY / SUPERSEDED

> **Status: retired historical document.**
>
> Workspace Studio / Gemini を使う週次ニュース運用は現在使用していません。旧GitHub Actions + Gemini構成も廃止済みです。
> 現行運用は `WEEKLY_NEWS_OPERATIONS_GUIDE.md` を参照してください。

## Current replacement

- 週次公式情報調査: ChatGPT scheduled task
- 実行時刻: 毎週日曜 19:00 Australia/Brisbane
- 調査対象: Home Affairs / ATO / Fair Work Ombudsman等の一次公式情報、原則直近約14日
- 外部モデルAPI: WHV Compass runtimeでは未設定
- 公開サイトAI: 停止中
- モデルによるcandidate処理 / ニュース生成 / AI index: 停止中

## Do not reactivate this setup

以下の旧手順は現在の構成では使用しません。

- Workspace Studio の Ask Gemini
- Gemini Web Search / Search Grounding
- Workspace Studio webhookを使った週次candidate投函
- 旧Gemini用Secret / model設定
- 旧GitHub ActionsのGemini schedulerとの併用

このファイルはMigrationの経緯を残すためだけに保持しています。旧手順をそのまま再利用しないでください。

## If runtime AI is introduced again

将来、サイトAIまたはニュースAI自動処理を再導入する場合は、旧Workspace Studio構成を復元するのではなく、次を新規に設計・レビューします。

1. external runtime API providerの選定
2. データ取扱い・料金・rate limit・可用性の確認
3. provider-neutral boundaryへの実装
4. Secret管理
5. grounding / dedupe / high-risk review policyの検証
6. CI / schedule / recovery設計
7. Preview E2E
8. Google DriveのActive設計書更新
9. 明示的な本番有効化

## Historical note

このファイルに過去存在した詳細なWorkspace Studio / Gemini設定は、2026年8月の移行検討時点の実装記録でした。現在のSource of Truthではありません。Git履歴から確認できます。
