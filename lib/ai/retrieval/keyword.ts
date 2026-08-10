import type { RetrievalCandidate } from "../types";

/**
 * キーワード / 全文検索（Phase 2 用プレースホルダ）。
 *
 * TFN・ABN・DASP・Rego・PPSR・417・462・郵便番号・Award 名など「完全一致の語」を
 * 含むクエリでは、セマンティック検索よりキーワード一致が有効なことがある。
 * V1 ではセマンティックのみで launch し、ここは無効（空配列を返す）。
 *
 * 有効化時の想定実装:
 *   - Postgres の全文検索（to_tsvector/websearch_to_tsquery）または
 *     ai_article_chunks に tsvector 列＋GINインデックスを追加した RPC を呼ぶ。
 *   - 日本語は simple 設定＋トークナイズ、または pg_bigm/pgroonga を検討。
 * retriever/hybrid.ts でセマンティック結果とランク融合する。
 */
export async function keywordSearch(
  _query: string,
): Promise<RetrievalCandidate[]> {
  return [];
}
