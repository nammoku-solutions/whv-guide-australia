import { createHash } from "node:crypto";
import { aiConfig, getServerSecrets } from "./config";
import { getAiAdminClient } from "./server/supabaseAdmin";

/**
 * サーバー側で強制する1日あたりのレート制限。クライアントのカウンタは信用しない。
 * 匿名は IP を秘密ソルトでハッシュ化して識別（生IPは保存しない＝プライバシー配慮）。
 * 認証済みはユーザーIDで識別。DB の原子的インクリメント RPC を使う。
 */

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** DB 未設定などで判定不能な場合 true（フェイルクローズ判断は呼び出し側）。 */
  degraded?: boolean;
};

/** IP をソルト付き SHA-256 でハッシュ化（生IPは保存・ログしない）。 */
function hashIp(ip: string): string {
  const { rateLimitSalt } = getServerSecrets();
  return createHash("sha256").update(`${rateLimitSalt}:${ip}`).digest("hex").slice(0, 32);
}

/** リクエストから代表 IP を推定（Vercel/プロキシ配慮）。 */
export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function checkRateLimit(params: {
  userId: string | null;
  ip: string;
}): Promise<RateLimitResult> {
  const { userId, ip } = params;
  const limit = userId
    ? aiConfig.limits.maxDailyAuthRequests
    : aiConfig.limits.maxDailyAnonRequests;

  const admin = getAiAdminClient();
  if (!admin) {
    // DB 未設定時は判定不能。安全側（許可しないほうが安全だが V1 ではローカル開発を
    // 阻害しないよう degraded を返し、呼び出し側で扱う）。
    return { allowed: false, limit, remaining: 0, degraded: true };
  }

  const key = userId ? `u:${userId}` : `ip:${hashIp(ip)}`;
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)

  const { data, error } = await admin.rpc("ai_increment_rate_limit", {
    p_key: key,
    p_day: day,
    p_limit: limit,
  });

  if (error) {
    return { allowed: false, limit, remaining: 0, degraded: true };
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { allowed: boolean; current_count: number }
    | undefined;
  const current = row?.current_count ?? limit + 1;
  return {
    allowed: row?.allowed ?? false,
    limit,
    remaining: Math.max(0, limit - current),
  };
}
