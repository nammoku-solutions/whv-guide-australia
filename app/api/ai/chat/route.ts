import { NextResponse } from "next/server";
import { z } from "zod";
import { aiConfig, getServerSecrets } from "@/lib/ai/config";
import { runChatPipeline } from "@/lib/ai/pipeline";
import { checkRateLimit, getClientIp } from "@/lib/ai/ratelimit";
import { getAiAdminClient } from "@/lib/ai/server/supabaseAdmin";

export const runtime = "nodejs";
// AI応答は常に動的（キャッシュしない）。
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  question: z
    .string()
    .trim()
    .min(1, "質問を入力してください。")
    .max(aiConfig.limits.maxQuestionLength, "質問が長すぎます。"),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(2000),
      }),
    )
    .max(aiConfig.limits.maxHistoryTurns * 2)
    .optional(),
  debug: z.boolean().optional(),
});

/** Bearer トークンを検証し、ユーザーIDとモデレーター判定を返す。 */
async function resolveUser(
  request: Request,
): Promise<{ userId: string | null; isModerator: boolean }> {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  if (!token) return { userId: null, isModerator: false };

  const admin = getAiAdminClient();
  if (!admin) return { userId: null, isModerator: false };

  const {
    data: { user },
    error,
  } = await admin.auth.getUser(token);
  if (error || !user) return { userId: null, isModerator: false };

  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = (profile?.role as string) ?? "user";
  return {
    userId: user.id,
    isModerator: role === "admin" || role === "moderator",
  };
}

export async function POST(request: Request) {
  const { geminiApiKey } = getServerSecrets();
  if (!geminiApiKey || !getAiAdminClient()) {
    return NextResponse.json(
      { ok: false, error: "AIアシスタントはまだ設定されていません。" },
      { status: 503 },
    );
  }

  // リクエストボディサイズの上限チェック。
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > aiConfig.limits.maxRequestBytes) {
    return NextResponse.json(
      { ok: false, error: "リクエストが大きすぎます。" },
      { status: 413 },
    );
  }

  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > aiConfig.limits.maxRequestBytes) {
      return NextResponse.json(
        { ok: false, error: "リクエストが大きすぎます。" },
        { status: 413 },
      );
    }
    raw = JSON.parse(text);
  } catch {
    return NextResponse.json(
      { ok: false, error: "リクエスト形式が不正です。" },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "入力が不正です。" },
      { status: 400 },
    );
  }

  const { userId, isModerator } = await resolveUser(request);

  // サーバー側レート制限（クライアントのカウンタは信用しない）。
  const ip = getClientIp(request);
  const rate = await checkRateLimit({ userId, ip });
  if (!rate.allowed) {
    if (rate.degraded) {
      return NextResponse.json(
        { ok: false, error: "AIアシスタントは現在利用できません。" },
        { status: 503 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error:
          "本日のAI利用回数の上限に達しました。時間をおいて、または会員登録してお試しください。",
      },
      { status: 429 },
    );
  }

  try {
    const result = await runChatPipeline({
      question: parsed.data.question,
      history: parsed.data.history,
      // 認証コンテキストはサーバー側でのみ導出（クライアント/モデルの userId は使わない）。
      auth: { userId, isAuthenticated: userId != null, isModerator },
      // 診断はモデレーターが明示要求した場合のみ。
      includeDiagnostics: Boolean(parsed.data.debug) && isModerator,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    // 詳細はサーバーログのみ。個人情報は載せない。
    console.error("[ai/chat] pipeline error:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { ok: false, error: "回答の生成中に問題が発生しました。時間をおいてお試しください。" },
      { status: 502 },
    );
  }
}
