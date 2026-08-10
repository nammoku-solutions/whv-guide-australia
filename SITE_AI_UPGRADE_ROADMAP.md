# SITE_AI_UPGRADE_ROADMAP

Version 1（セマンティックRAG）を土台に、**再設計なし**で品質を段階的に上げるための具体手順。
各フェーズは独立しており、原則「設定フラグ」＋「隔離モジュールの実装」で有効化できる。

前提: V1 のパイプラインは `質問 → Router → Retriever → Reranker → Generator → Verifier → Sources/Tools`。
各段は差し替え可能な I/F を持ち、モデルIDは `lib/ai/config.ts`（環境変数）から取得する。

---

## Phase 1（実装済み・現行）
セマンティック検索 / pgvector / 低コスト生成 / サイト内スコープ / 出典リンク / ツール推薦 /
レート制限 / フィードバック / ロギング。Reranker OFF・Verifier OFF。

---

## Phase 2 — ハイブリッド検索（日本語キーワード）
**目的**: TFN・ABN・DASP・Rego・PPSR・417・462・郵便番号・Award名など完全一致語の取りこぼし解消。

1. Postgres 全文検索を用意（`supabase/migrations/00XX_ai_keyword.sql`）:
   - `ai_article_chunks` に `content_tsv tsvector` 列を追加し GIN インデックスを作成。
   - 日本語は `simple` 設定＋二文字トークン化、または `pg_bigm`/`pgroonga` 拡張を検討（英字・数字の完全一致に強い）。
   - キーワード検索 RPC `match_ai_article_chunks_keyword(query text, match_count int, p_embedding_version text)` を追加（SECURITY DEFINER、anon revoke）。
2. `lib/ai/retrieval/keyword.ts` を実装（上記RPC呼び出し → `RetrievalCandidate[]`、`source:'keyword'`）。
3. 融合は既存の `lib/ai/retrieval/hybrid.ts`（RRF）をそのまま使用。
4. `AI_HYBRID_SEARCH_ENABLED=true` に設定（`retriever.ts` が自動的にセマンティック＋キーワード＋融合へ切替）。
5. しきい値はセマンティック単独時のみ適用のため、融合時の閾値ロジックを `retriever.ts` で調整（例: 融合上位N＋最小セマンティックスコア併用）。

**再設計不要**: chat API・UI・generator は不変。

---

## Phase 3 — Reranker
**目的**: 上位候補の並べ替え精度向上。

1. `lib/ai/reranking/reranker.ts` に実装クラスを追加（`Reranker` I/F 実装）。候補例:
   - Cohere Rerank（多言語）/ Jina Reranker / 内製クロスエンコーダ。
   - プロバイダ鍵はサーバー専用の新環境変数（例 `AI_RERANK_API_KEY`）で `config.ts` に追加。
2. `getReranker()` の分岐で、`AI_RERANK_ENABLED=true` 時に実装を返す。
3. `AI_RERANK_ENABLED=true` を設定。

**再設計不要**: `pipeline.ts` は既に `reranker.rerank(...)` を呼んでいる。

---

## Phase 4 — 生成モデルのアップグレード / 複雑クエリルーティング
**目的**: 簡単な質問は安価モデル、難問/高リスクのみ高性能モデル。

1. `AI_GENERATION_MODEL_COMPLEX` を目的のモデルに設定（既定 `gemini-2.5-flash`）。
2. `AI_COMPLEX_ROUTING_ENABLED=true`。
3. ルーティング条件は `pipeline.ts` の `useComplex` で調整可能（現状: 高リスク or chunk数が上限）。
   関連chunk数・質問複雑度・リスク・MIXED・前ターン失敗などを追加可能。
4. provider 固有の前提はルーターに持ち込まない（モデルIDは config 経由）。

**再設計不要**: `generator.ts` は `complex` フラグでモデルを選ぶだけ。

---

## Phase 5 — ライブ・マーケットプレイス
**目的**: 「Gattonで求人ある？」を記事ではなく**現在有効な掲載**で回答。

1. `lib/ai/recommendations/listings.ts` の `searchListings` を実装:
   ```ts
   getAiAdminClient().from('listings')
     .select('id,listing_type,title,location,details,created_at,expires_at')
     .eq('status','active')
     .or('expires_at.is.null,expires_at.gt.now()')
     .eq('listing_type', q.listingType)     // 任意
     .ilike('location', `%${q.location}%`)  // 任意
   ```
   古い掲載を埋め込んで「現在の空き」として扱わないこと（常に構造化クエリ）。
2. `router.ts` の LISTING/MIXED 判定は実装済み（フラグで有効化）。`pipeline.ts` に listing 分岐を追加し、
   結果を専用UIブロック（掲載カード）として返す。
3. `AI_MARKETPLACE_SEARCH_ENABLED=true`。
4. 掲載応答はグローバルキャッシュしない（個別・鮮度重視）。

**注意**: 個人・非公開の掲載データは返さない。RLS/権限を尊重（service-role でも公開相当のフィルタを適用）。

---

## Phase 6 — 高リスク回答の検証（Verifier）
**目的**: ビザ・税・雇用法・医療など高リスク回答の根拠整合性チェック。

1. `lib/ai/verification/verifier.ts` に実装クラスを追加（`AnswerVerifier` I/F 実装）。
   - 回答の主張が `EvidenceChunk` に支持されるかを軽量モデルで判定。未支持なら unsupported に倒す。
2. `getVerifier()` の分岐で `AI_VERIFY_ENABLED=true` 時に実装を返す。
3. コスト最適化のため、`pipeline.ts` で `overallRisk==='high'` のときだけ検証を走らせるよう限定。
4. `AI_VERIFY_ENABLED=true`。

**再設計不要**: `pipeline.ts` は既に `verifier.verify(...)` を呼び、結果で `supported` を決めている。

---

## 埋め込みモデルのアップグレードと安全な再インデックス
**目的**: より高性能な埋め込みへ移行しても、次元/モデル混在で検索が壊れないようにする。

1. 新モデル・次元を決める（例 3072 次元）。**同一インデックスに異なる次元を混ぜない。**
2. マイグレーションで新列/新テーブル（例 `embedding_v2 vector(3072)`）＋対応RPCを追加、
   または `AI_EMBEDDING_DIMENSIONS` に合わせ `vector(N)` を持つ新テーブルを作成。
3. 環境変数を更新: `AI_EMBEDDING_MODEL=<new>`, `AI_EMBEDDING_DIMENSIONS=<N>`, `AI_EMBEDDING_VERSION=v2`。
4. `npm run ai:reindex -- --embedding-version=v2` で全 chunk を再埋め込み（`embedding_version` で世代分離）。
5. 検索RPCが `p_embedding_version` で世代を絞るため、旧v1と新v2は互いに混在しない。
6. 動作確認後、旧世代（v1）の行を削除。

---

## 各フェーズ共通の原則
- モデルID・鍵・しきい値・フラグは必ず `config.ts`（環境変数）経由。コードにハードコードしない。
- 取得コンテンツは常に untrusted。プロンプトインジェクション防御を弱めない。
- 出典URLは取得メタデータからのみ生成し、モデルに発明させない。
- V1 の chat API・UI・型（`RetrievalCandidate` / `Reranker` / `AnswerVerifier`）を壊さない。
