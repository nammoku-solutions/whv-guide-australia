import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The site AI assistant is intentionally disabled while WHV Compass runs without
 * an external model API. ChatGPT Plus is used for operator-side research and does
 * not provide API credits for the public website runtime.
 */
export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "AIアシスタントは現在メンテナンス中です。",
    },
    { status: 503 },
  );
}
