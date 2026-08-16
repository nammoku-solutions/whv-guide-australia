import type { Evidence, StructuredCard, TrustedAction } from "../types";

/** すべての構造化ケイパビリティが返す共通結果。 */
export type CapabilityResult = {
  /** ケイパビリティ名（診断/分析用）。 */
  name: string;
  /** Generator へ渡す最小化エビデンス。 */
  evidence: Evidence[];
  /** UI が描画する安全なカード。 */
  cards: StructuredCard[];
  /** 信頼済みアクション（ボタン）。 */
  actions: TrustedAction[];
  /** ヒット件数（0 = no-result）。 */
  count: number;
  /** 認証必須だが未ログインで拒否したか。 */
  authRequired?: boolean;
};

export function emptyResult(name: string): CapabilityResult {
  return { name, evidence: [], cards: [], actions: [], count: 0 };
}
