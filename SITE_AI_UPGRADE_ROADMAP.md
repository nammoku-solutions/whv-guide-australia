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

## Phase 2 — ハイブリッド検索（日本語キーワード）✅ 実装済み
**目的**: TFN・ABN・DASP・Rego・PPSR・417・462・郵便番号・Award名など完全一致語の取りこぼし解消。

実装内容（本リリース）:
1. `supabase/migrations/0010_ai_keyword_search.sql`（追加・非破壊）:
   - `pg_trgm` 拡張（無償・Postgres標準）。外部サービスなし。
   - `ai_article_chunks.content_tsv`（`to_tsvector('simple', …)` の**生成カラム**）＋ GIN 索引（ASCII略語・数字の全文一致）。
   - `content` への **pg_trgm GIN 索引**（日本語の部分一致 ILIKE を高速化）。
   - RPC `match_ai_article_chunks_keyword(p_terms text[], p_query text, match_count int, p_embedding_version text)`（SECURITY DEFINER、anon/authenticated revoke）。
2. `lib/ai/retrieval/keyword.ts`: クエリから ASCII 略語/数字＋日本語内容語＋ドメイン同義語を抽出（`extractKeywordTerms`）、RPC 呼び出し、`source:'keyword'` で返す。RPC 未適用時は空を返し縮退。`hasStrongKeyword` で接地判定を補助。
3. 融合は `lib/ai/retrieval/hybrid.ts`（RRF, k=`AI_RRF_K`）。
4. `AI_HYBRID_SEARCH_ENABLED` を既定 **true** に変更（`retriever.ts` が自動でセマンティック＋キーワード＋融合へ）。
5. 接地ロジックを更新: セマンティックしきい値超え **または**「強い完全一致語＋キーワードヒット」で接地。一般NLクエリはセマンティックしきい値で保護。

**再設計不要**: chat API・UI・generator は不変。

**再チューニングの勘所**: 同義語辞書は `keyword.ts` の `SYNONYMS`、ストップワードは `JA_STOPWORDS` を編集。より高精度な日本語形態素が必要になったら `pgroonga`（対応プランのみ）を検討可能だが、現状の trグラム＋アプリ側トークナイズで無償のまま十分。

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

1. `AI_GENERATION_MODEL_COMPLEX` を目的のモデルに設定（既定 `gemini-3.5-flash`）。
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
