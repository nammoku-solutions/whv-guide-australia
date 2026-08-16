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

## Phase 5 — ライブ・マーケットプレイス ✅ 実装済み（構造化データ統合に統合）
**目的**: 「Gattonで求人ある？」を記事ではなく**現在有効な掲載**で回答。

本フェーズは **Phase 7（構造化ライブデータ統合）** の一部として実装済み。詳細は
`SITE_AI_STRUCTURED_DATA_INTEGRATION_REPORT.md` を参照。要点:

1. ライブ掲載検索は `lib/ai/capabilities/listings.ts`（`searchActiveJobs` /
   `searchActiveHousing` / `searchActiveVehicles`）が、既存の型付きデータアクセス
   `lib/listings.ts` の `getListingsByType(type, ListingFilters)` を再利用して実装。
   - anon サーバークライアント経由＝RLS により **公開・非隠蔽・非削除** のみ返り、
   - `isPubliclyActive` が **status='active' かつ未期限切れ** を保証。
   - 古い掲載を埋め込まず、常に構造化クエリ（数値/ロケーション/状態フィルタ）。
2. `router.ts` の LISTING/MIXED 判定は実装済み（サブ意図 job/housing/vehicle）。
   `pipeline.ts` に listing 分岐を追加し、結果を**掲載カード**として返す。
3. `AI_MARKETPLACE_SEARCH_ENABLED` を既定 **true** に変更。
4. 掲載応答はグローバルキャッシュしない（個別・鮮度重視）。価格は投稿者記載のみ・発明しない。

**注意**: 個人・非公開の掲載データ（応募本文・連絡先・モデレーションメモ）は返さない。

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

---

## Phase 7 — 構造化ライブデータ統合 ✅ 実装済み
**目的**: 記事RAGに加え、**ライブ・マーケット掲載**・**本人の記録**・**直近の公式アップデート**を
安全に扱う。RAG は再構築せず、Router / Retriever / Generator / ツール推薦 / 出典 / レート制限 /
フィードバック / 分析を再利用する。

詳細レポート: `SITE_AI_STRUCTURED_DATA_INTEGRATION_REPORT.md`。要点:

- **中核原則**: 公開知識→記事RAG、ライブ・マーケット→構造化Supabaseクエリ、個人データ→
  認証必須のサーバー側ケイパビリティ。**私的/ライブデータはベクトルDBに入れない**。
- **ルート種別を拡張**: ARTICLE / TOOL / LISTING / PERSONAL / CURRENT_UPDATE / MIXED / OUT_OF_SCOPE（決定的）。
- **型付きケイパビリティ**（任意SQLツールなし）: `searchActiveJobs` / `searchActiveHousing` /
  `searchActiveVehicles` / `getMyApplications` / `getMySavedItems` / `getMyNotifications` /
  `getMy88DayProgress` / `getCurrentOfficialUpdates` / `findRelevantSiteTools`。
  最小化DTOのみを Gemini へ渡す。
- **認証**: `userId` はサーバー側（Bearer検証）で導出。クライアント/モデルの任意 `userId` は使わない。
- **共通エビデンスモデル**（`lib/ai/types.ts` の `Evidence`）: 種別・公開/非公開分類を持ち、
  private は出典・分析へ出さない。
- **信頼済みアクション**（`lib/ai/actions.ts`）: URLはレジストリ/DBメタデータからのみ生成。
- **読み取り専用**: 応募/取り下げ/削除/ステータス変更/88日更新/売却/送信は不可。
- フラグ: `AI_STRUCTURED_DATA_ENABLED` / `AI_PERSONAL_DATA_ENABLED` / `AI_CURRENT_UPDATES_ENABLED`
  （既定 ON）、`AI_MARKETPLACE_SEARCH_ENABLED`（既定 ON）、`AI_MUTATIONS_ENABLED`（既定 OFF・未実装）。

---

## Phase 8（将来）— 安全なミューテーション（既定 OFF・未実装）
**目的**: 「この求人に応募して」「保存して」等の**書き込み**を、明示的確認・サーバー認証・
監査可能性を伴って安全に実行する。現状は設計のみ・機能は無効。

必須要件（有効化前にすべて満たすこと）:
1. **明示的なユーザー確認**（2段階）: AI は操作を提案するのみ。実行はユーザーが UI 上で
   明示確認したときだけ、専用のミューテーションAPIを叩く。モデル出力だけでは実行しない。
2. **サーバー側認証**: `userId` は Bearer 検証で導出。RLS＋既存トリガー
   （`protect_application_fields` 等）に従い、本人権限のある操作のみ許可。
3. **監査可能性**: すべての書き込みを追記型の監査ログ（誰が/いつ/何を/どのリクエスト由来か）に記録。
4. **型付き・限定的**: 応募作成・取り下げ・保存/解除など、事前定義された最小の操作のみ。任意SQL不可。
5. **冪等性・レート制限**: 二重送信防止、書き込みにも独立したレート制限。
6. フラグ `AI_MUTATIONS_ENABLED=true` はこれらが揃うまで有効化しない。
