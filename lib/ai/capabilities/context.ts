import type { AuthContext } from "../types";

/**
 * 構造化ケイパビリティ実行コンテキスト。
 *
 * userId は必ずサーバー側（Bearerトークン検証）で導出したものを渡す。
 * クライアント/モデルから受け取った任意の userId は決して使わない。
 */
export type CapabilityContext = AuthContext;

export function requireAuth(ctx: CapabilityContext): ctx is CapabilityContext & {
  userId: string;
} {
  return ctx.isAuthenticated && typeof ctx.userId === "string" && ctx.userId.length > 0;
}
