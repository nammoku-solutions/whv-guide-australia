# SITE_AI_RAG_IMPLEMENTATION_REPORT

サイト固有AIアシスタント（RAG）Version 1 実装レポート — オーストラリアワーホリコンパス

---

## 1. リポジトリ構成（監査結果）

| 項目 | 実測 |
| --- | --- |
| フレームワーク | Next.js `^16.2.7`（App Router） / React `19.2` / TypeScript `5` |
| デプロイ | Vercel 前提（`next.config.ts`、`NEXT_PUBLIC_VERCEL_URL` 参照） |
| DB / 認証 | Supabase（`@supabase/supabase-js ^2.108`）。anon クライアント（`lib/supabaseClient.ts` / `lib/supabaseServer.ts`）＋ service-role（`app/api/account/delete`, `app/api/notify`） |
| マイグレーション | `supabase/migrations/0001`〜`0008`。RLS＋`is_moderator()` 関数運用 |
| コンテンツ | `lib/content/articles/*.ts` を集約（`articles`）。型は `types/article.ts`。公開判定は `lib/content/registry.ts`（`published && status==='published'`） |
| ツール | `lib/tools/registry.ts`（実装済みのみ）。88日カウンター・対象地域チェッカー・生活費シミュレーター・レジュメ自己チェック等 |
| マーケット | **既存**（`0008_marketplace_listings.sql`）。`listings`（job/farm_job/housing/roommate/vehicle/marketplace, status active…, location, details jsonb）＋RLS |
| GA4 | `components/analytics/GoogleAnalytics.tsx` ＋ `lib/analytics.ts`（`trackEvent`、PIIは送らない設計） |
| レート制限 | AI導入前は**存在せず**（今回サーバー側で新設） |
| 既存API | `app/api/account/delete`, `app/api/notify`（`runtime="nodejs"`, Request/Response） |
| CI | GitHub Actions は未検出（本実装でワークフロー雛形を追加、手動シークレット必要） |
| テスト | `scripts/*.test.mjs`（`node --test`）。content / tools |

### 既存AI/RAG基盤の有無
**存在しない。** ベクトル拡張・埋め込み・チャットAPI・AIモジュールはいずれも未実装。重複はなし。

---

## 2. Version 1 アーキテクチャ

独立・差し替え可能なモジュールで構成:

```
質問 → Router → Retriever → (Reranker:OFF) → Generator → (Verifier:OFF)
     → Sources / ツール推薦 → Response
```

初期構成: Router=basic（決定的）, Retriever=ON（**セマンティック＋日本語キーワードのハイブリッド／RRF, Phase 2 実装済み**）, Reranker=OFF,
Generator=ON, Verifier=OFF, 複雑ルーティング=OFF, マーケット検索=OFF。

### モジュール構成（`lib/ai/`）
```
config.ts                 環境変数由来の設定（モデルID・しきい値・フラグ）
types.ts                  共有型（RetrievalCandidate / Reranker / AnswerVerifier ほか）
router.ts                 決定的クエリルーター（ARTICLE/TOOL/LISTING/MIXED/OUT_OF_SCOPE）
pipeline.ts               全段のオーケストレーション
chunking.ts               見出し単位のセマンティックチャンク化
content-source.ts         公開記事のフィルタ＋チャンク生成
hash.ts                   コンテンツハッシュ（差分埋め込み用）
embeddings/provider.ts    Gemini 埋め込み（REST、プロバイダ隔離）
retrieval/retriever.ts    検索オーケストレーション（多様性・しきい値）
retrieval/semantic.ts     pgvector 類似検索（RPC 経由）
retrieval/keyword.ts      キーワード検索（Phase 2 プレースホルダ）
retrieval/hybrid.ts       ランク融合 RRF（Phase 2 プレースホルダ）
reranking/reranker.ts     Reranker I/F ＋ NoopReranker
generation/generator.ts   Gemini 生成（REST、Supabase非依存）
generation/prompts.ts     システムプロンプト・コンテキスト整形
verification/verifier.ts  AnswerVerifier I/F ＋ NoopVerifier
recommendations/articles  取得メタから出典生成＋許可URLフィルタ
recommendations/tools     レジストリ由来のツール推薦（URL発明なし）
recommendations/listings  ライブ掲載検索 I/F（Phase 5 プレースホルダ）
safety/scope.ts           スコープ判定
safety/risk.ts            リスク分類（low/medium/high）
analytics/events.ts       GA4 イベント（PII非送信）
ratelimit.ts              サーバー側レート制限（IPソルトハッシュ）
server/supabaseAdmin.ts   service-role クライアント（サーバー専用）
eval/dataset.ts           評価データセット（36問）
```

責務分離: `retriever` は生成モデルに非依存、`generator` は Supabase クエリを持たない、
`reranker`/`verifier` は無効時も安定 I/F、プロバイダ実装は provider 系に隔離、
モデルIDは全て `config.ts`（＝環境変数）から取得。

---

## 3. データベース変更（`0009_ai_rag.sql` / `0010_ai_keyword_search.sql`）

### 0009（Phase 1）
- `create extension vector`（pgvector）
- `ai_article_chunks`（`embedding vector(768)` ほかメタデータ、RLS: anon SELECT不可・モデレーターのみ可、書込は service-role のみ）
- `match_ai_article_chunks(...)`（SECURITY DEFINER、`embedding_version` 一致のみ検索、`anon/authenticated` へは EXECUTE を revoke）
- `ai_rate_limits` ＋ 原子的 `ai_increment_rate_limit(...)`（service-role専用）
- `ai_feedback`（最小・非個人、RLS: 挿入は service-role、閲覧はモデレーター）
- インデックス: slug / embedding_version / content_hash。**V1は完全一致（seq）コサイン検索**。HNSW は将来オプション。

### 0010（Phase 2・追加のみ／非破壊）
- `create extension pg_trgm`（Postgres 標準・無償。外部サービスなし）
- `ai_article_chunks.content_tsv`（`to_tsvector('simple', …)` の**生成カラム**）＋ GIN インデックス（ASCII略語・数字の全文一致）
- `content` への **pg_trgm GIN インデックス**（日本語の部分一致 ILIKE を高速化）
- `match_ai_article_chunks_keyword(p_terms, p_query, match_count, p_embedding_version)`（SECURITY DEFINER、`anon/authenticated` へ EXECUTE revoke）
- 0009 の埋め込み・セマンティックRPCは**無変更**。

---

## 4. チャンク化・埋め込み・生成

- **チャンク化**: 固定文字数分割ではなく、記事の構造化フィールド（要点・基本情報・解説・手順・ヒント・注意点・FAQ・英語フレーズ）を意味的セクションへ。最大約1200文字で分割、極小セクションは結合。各chunkにタイトル＋見出しを前置。
- **埋め込み**: `gemini-embedding-001`、768次元（Matryoshka、3072未満は単位長正規化）。多言語で日本語品質良好。`RETRIEVAL_DOCUMENT`（索引側）/`RETRIEVAL_QUERY`（クエリ側）を使い分け。
- **生成**: 既定 `gemini-2.5-flash-lite`（低コスト）、複雑用 `gemini-2.5-flash`（Phase 4）。SDK非依存（fetch で REST）。
- **モデルID選定理由**: いずれも 2.5 系の現行GA。flash-lite は高頻度Q&Aで最安・低遅延。埋め込みは 001 が現行の多言語モデルで日本語に強い。すべて環境変数で差し替え可能（DB/アプリ再設計不要）。

---

## 5. 検索戦略・しきい値・出典・ツール・ルーター

- **検索（ハイブリッド, Phase 2）**: セマンティック（pgvector）＋日本語キーワード（全文＋pg_trgm）を並列実行し、**Reciprocal Rank Fusion（RRF, k=60）**で融合。
  - セマンティック: クエリ埋め込み → `match_ai_article_chunks` → 類似度しきい値 `0.62`（`AI_SIMILARITY_THRESHOLD`）。
  - キーワード: クエリから ASCII 略語・数字＋日本語内容語＋ドメイン同義語を抽出（`lib/ai/retrieval/keyword.ts`）→ `match_ai_article_chunks_keyword`。TFN・ABN・DASP・Rego・417・462・WHV・Superannuation・myGov・Medicare・RSA・RSG・郵便番号などの完全一致を強化。英略語⇄日本語の相互同義語展開で言語をまたいで再現率を確保。
  - 融合後、記事あたり最大2chunkで多様性確保 → 最終3〜5chunk（`AI_MAX_CONTEXT_CHUNKS`）。
- **接地**: セマンティック類似度がしきい値以上、または「強い完全一致語（略語/数字/ドメイン用語）」があってキーワードがヒットした場合に接地。どちらも無ければ生成を呼ばず定型 unsupported（ハルシネーション・コスト・遅延を抑制）。一般的な日本語NLクエリはセマンティックしきい値で守られる。
- **縮退**: マイグレーション0010未適用時はキーワードRPCが無いため `keywordSearch` は空を返し、自動的にセマンティック相当へ縮退（launch をブロックしない）。
- **出典**: 取得済みメタデータからのみ生成。モデルにはURLを出力させない。重複排除し2〜4件。取得外URLは除去。
- **ツール推薦**: `lib/tools/registry.ts` を単一の真実として、キーワード辞書でマッチ。ルートは発明しない。
- **ルーター**: 決定的（ツール語・掲載語・スコープ語）。将来モデル分類器へ差し替え可能（戻り値型を維持）。

---

## 6. マーケット統合状況

`recommendations/listings.ts` に将来 I/F を用意。`AI_MARKETPLACE_SEARCH_ENABLED=false`（既定）。
ライブ掲載は記事埋め込みではなく `listings` の構造化クエリ（`status='active'` かつ未期限切れ・location・listing_type）で引く方針を明記。V1では launch をブロックしない。

---

## 7. レート制限・プライバシー・セキュリティ

- **レート制限**: サーバー側で強制。匿名 `AI_MAX_DAILY_ANON_REQUESTS`（既定5）、認証 `AI_MAX_DAILY_AUTH_REQUESTS`（既定20）。匿名はIPをソルト付きSHA-256でハッシュ（生IP非保存）。DBの原子的インクリメント。
- **入力制限**: 質問最大500字、ボディ最大8000バイト、履歴ターン数上限、Zodスキーマ検証、クライアントからのモデル/プロバイダ指定は受け付けない。
- **鍵管理**: `GEMINI_API_KEY` / `SUPABASE_SERVICE_ROLE_KEY` はサーバー専用（`NEXT_PUBLIC_` 無し）。埋め込み・生成・特権検索はすべてサーバー側。
- **プロンプトインジェクション**: 取得コンテンツ・ユーザー入力を untrusted として境界明示。システム指示・スコープ・ツール制限・機密（鍵/環境変数/管理データ）を上書きさせない。UGC（フォーラム等）はRAG索引に入れない。
- **診断**: モデレーター＋`debug`指定時のみ運用メタ（ルート・スコア・使用chunk・モデル・fallback）を返す。CoTや内部推論は出さない。

---

## 8. 解析・フィードバック

- GA4イベント: `ai_chat_open` / `ai_question` / `ai_answer` / `ai_no_answer` / `ai_source_click` / `ai_tool_click` / `ai_feedback`。**質問本文やPIIは送らない**（長さ・ルート等のみ）。
- フィードバック: 各回答に👍/👎（任意で短い理由）。`ai_feedback` に最小保存（本文非保存）。閲覧はモデレーターのみ。

---

## 9. インデックス・CI・環境変数

- コマンド: `npm run ai:index`（変更分のみ）/ `-- --dry-run` / `npm run ai:reindex`（全再埋め込み）/ `-- --embedding-version=v2`。content hash で差分のみ埋め込み、stale chunk を削除。
- GitHub Actions: `.github/workflows/ai-index.yml` を追加（記事/AI変更の push 時＋手動）。要シークレット: `GEMINI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AI_EMBEDDING_VERSION`。ログにシークレットは出さない。
- 環境変数: `.env.example` に追記（下記「残作業」参照）。

---

## 10. テスト・ビルド結果

| 検証 | 結果 |
| --- | --- |
| `npm run test:ai`（ルーター/スコープ/ツール/チャンク/出典/キーワード抽出/同義語/RRF） | ✅ 12/12 pass |
| `npm run test:content` / `test:tools` | ✅ pass（既存、非回帰） |
| `npx tsc --noEmit`（typecheck） | ✅ エラー0 |
| `npm run lint` | ✅ エラー0（placeholder引数の警告4のみ、`_`接頭辞・将来使用） |
| `npm run build`（本番） | ✅ 成功。`/api/ai/chat`・`/api/ai/feedback` を動的関数として出力 |
| 公開記事数 / 生成チャンク数 | **358 記事 / 2412 チャンク**（risk: high 533 / medium 750 / low 1129、平均約269字/chunk） |

**ライブ検索・生成・実インデックス投入** は Supabase/Gemini の本番シークレット設定後に実施（下記「残作業」）。決定的部分は上記で検証済み。

---

## 11. 想定運用コスト

- 一次埋め込み（2412 chunk、約24万トークン規模）: `gemini-embedding-001` で概算 **1回 <0.05 USD**。以降は差分のみ。
- 1問あたり: クエリ埋め込み＋`flash-lite` 生成で概算 **~0.0003 USD**。しきい値で無駄な生成を抑止。
- レート制限（匿名5 / 認証20 /日）とコンテキスト最小化・応答上限で、想定トラフィックでも月次コストは低〜ほぼゼロ圏。専用AIサーバー・外部ベクタDB・有償リランカーは不使用。

---

## 12. 残作業（手動設定が必要）

1. Supabase SQL エディタで `supabase/migrations/0009_ai_rag.sql` を適用（pgvector有効化含む）。
2. **Phase 2**: 続けて `supabase/migrations/0010_ai_keyword_search.sql` を適用（pg_trgm・全文/trグラム索引・キーワードRPC）。未適用でもキーワードは自動縮退しセマンティックのみで動作する。
3. 本番/ローカル環境変数を設定: `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AI_RATE_LIMIT_SALT`（ランダム値）。`AI_HYBRID_SEARCH_ENABLED` は既定 true（明示無効化する場合のみ false）。他は `.env.example` の既定でOK。
4. `npm run ai:index`（初回インデックス）。まず `-- --dry-run` で差分確認推奨。`content_tsv` は生成カラムのため upsert 時に自動更新される（再インデックス不要）。
5. GitHub Actions を使う場合はリポジトリ Secrets を登録（上記シークレット）。
6. 本番でライブ検索・unsupportedクエリ・UI動作を確認。

---

## 13. Phase 2 実装済み（日本語キーワード＋ハイブリッド RRF）

本リリースで Phase 2 を実装・有効化（`AI_HYBRID_SEARCH_ENABLED` 既定 ON）。TFN/ABN/DASP/Rego/417/462 など完全一致語の取りこぼしを RRF で補う。
chat API・UI・型（`RetrievalCandidate` / `Reranker` / `AnswerVerifier`）は未変更。キーワード抽出は決定的で 12 件のテストで検証済み（例: 「TFNとは？」→tfn / 「417と462の違い」→417,462 / 「Rego 更新」→rego,更新 / 「DASP 申請」→dasp,申請 / 「スーパーを返金…」→スーパー,Superannuation,返金）。

**次の一手（Phase 3）**: 多言語 Reranker の導入（`AI_RERANK_ENABLED=true`）。API/フロント再設計不要。詳細は `SITE_AI_UPGRADE_ROADMAP.md`。
