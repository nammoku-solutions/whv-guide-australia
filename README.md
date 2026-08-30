# WHV Compass / オーストラリアワーホリコンパス

日本語話者のオーストラリア・ワーキングホリデーで「次に何をすべきか」を判断しやすくする実務型情報プラットフォームです。

## Production stack

- Next.js / TypeScript / Tailwind CSS
- Vercel
- Supabase PostgreSQL / Auth / Storage
- Google Analytics / optional AdSense

## Current operating model

### Active

- 記事・ガイド / SEO
- 認証・プロフィール
- コミュニティ
- Marketplace / 募集・応募・保存
- フィードバック / 管理画面
- Supabase RLS と各種サーバー側検証
- 公式情報の人間による確認・記事更新

### Weekly official-source research

週次の公式情報調査はリポジトリ内のモデルAPIやGitHub Actionsでは実行しません。
ChatGPTのスケジュールタスクが毎週日曜 19:00（Australia/Brisbane）に、Home Affairs / ATO / Fair Work Ombudsman等の一次公式情報を中心に直近約14日を調査します。

調査結果は運営判断の入力として扱い、重要な制度・金額・条件・日付は公開前に公式ソースで確認します。

### Paused

現在、外部モデルAPIはアプリ実行環境に設定していません。以下は明示的に停止中です。

- 公開サイトのAIアシスタント
- AI Embedding / AI index更新
- モデルによるニュース関連度分類・日本語生成
- AIニュース自動公開
- モデルを使う公式ソース日次監視 / candidate自動処理

`.env.example` の `AI_RUNTIME_ENABLED=false` と `NEWS_AI_AUTOMATION_ENABLED=false` を現在の正式状態とします。
再開する場合は、外部APIプロバイダを明示的に選定し、実装・コスト・セキュリティ・テスト・運用設計をレビューしてから有効化してください。

## Local development

```bash
npm ci
npm run dev
```

環境変数は `.env.example` を参照してください。Secret値をリポジトリ、ドキュメント、Issue、ログへ保存しないでください。

## Validation

通常の変更では、変更範囲に応じて以下を実行します。

```bash
npm run lint
npm run validate:content
npm run validate:articles
npm run test:content
npm run build
```

該当機能を変更した場合は `test:marketplace`、`test:notifications`、`test:ai`、`test:monitor` 等も追加で実行します。AI/monitor系テストは停止中の設計境界と純粋ロジックを検証するために残しています。本番モデルAPIを呼ぶものではありません。

## Source of truth

優先順位は次の通りです。

1. `main` の実装とSupabase migration
2. 接続済みVercel/Supabaseの現在設定
3. Google DriveのWHV Compass公式設計・運用ドキュメント
4. リポジトリ直下の各種 `*_REPORT.md` / 過去のMigration・Implementation Report

`*_REPORT.md` は作成時点の実装記録です。現行構成と矛盾する場合、現在の `main` とGoogle DriveのActiveドキュメントを優先してください。

## AI/news compatibility code

将来の再実装に備えて、一部のRAG・ニュース処理ロジックやDBスキーマは保持しています。外部モデル境界の既定実装は fail-closed で、現在はネットワーク通信しません。旧名称を含むcompatibility shimや歴史的migrationは、履歴互換性のため残る場合がありますが、現在のプロバイダを意味しません。
