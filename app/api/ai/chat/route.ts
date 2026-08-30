import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public runtime AI is intentionally unavailable until an external model API
 * provider is explicitly selected, implemented, reviewed, and enabled.
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
