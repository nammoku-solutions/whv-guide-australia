/**
 * 管理者 API 向けの Bearer トークン検証（サーバー専用）。
 * app/api/ai/chat/route.ts と同じ方式で、service-role クライアントを使い
 * トークンからユーザーを解決し、profiles.role でモデレーター判定する。
 */

import { getAiAdminClient } from "@/lib/ai/server/supabaseAdmin";

export type ModeratorAuth = {
  ok: boolean;
  userId: string | null;
  isModerator: boolean;
};

export async function requireModerator(request: Request): Promise<ModeratorAuth> {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  if (!token) return { ok: false, userId: null, isModerator: false };

  const admin = getAiAdminClient();
  if (!admin) return { ok: false, userId: null, isModerator: false };

  const {
    data: { user },
    error,
  } = await admin.auth.getUser(token);
  if (error || !user) return { ok: false, userId: null, isModerator: false };

  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = (profile?.role as string) ?? "user";
  const isModerator = role === "admin" || role === "moderator";
  return { ok: isModerator, userId: user.id, isModerator };
}
