import { NextResponse } from "next/server";
import { z } from "zod";
import { getAiAdminClient } from "@/lib/ai/server/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * AI回答へのフィードバック（👍/👎）。必要最小限のみ保存。質問本文・回答本文は
 * 保存しない（プライバシー配慮）。任意の短い理由のみ許可。
 */
const schema = z.object({
  helpful: z.boolean(),
  route: z.string().max(32).optional(),
  supported: z.boolean().optional(),
  reason: z.string().max(300).optional(),
});

export async function POST(request: Request) {
  const admin = getAiAdminClient();
  if (!admin) {
    // 未設定でも失敗にはせず no-op 扱い。
    return NextResponse.json({ ok: true, stored: false });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid payload" }, { status: 400 });
  }

  const { error } = await admin.from("ai_feedback").insert({
    helpful: parsed.data.helpful,
    route: parsed.data.route ?? null,
    supported: parsed.data.supported ?? null,
    reason: parsed.data.reason ?? null,
  });

  if (error) {
    return NextResponse.json({ ok: false, stored: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true, stored: true });
}
