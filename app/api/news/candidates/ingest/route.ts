/**
 * 信頼できる機械取り込み（例: 週次 ChatGPT 連携）向けの外部候補投函エンドポイント。
 *
 * セキュリティ（#9）:
 *   - サーバー専用のスコープ付きシークレット EXTERNAL_NEWS_INGEST_SECRET（Bearer）で認証。
 *     Supabase service-role キーは使わない（それを webhook secret に流用しない）。
 *   - allow-list 検証・dedupe・下流の全安全処理は必須（submitExternalCandidate 経由）。
 *   - 軽量レート制限。narrow な契約（定義済み候補フィールドのみ）。
 *   - 秘匿値はログに出さない。ここでは同期処理しない（スケジューラが処理）。
 *
 * ※ 接続済み Supabase から直接 insert する運用を選ぶ場合、本エンドポイントは不要
 *   （WEEKLY_NEWS_OPERATIONS_GUIDE.md 参照）。その場合はこのルートを無効化してよい。
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import { submitExternalCandidate } from "@/lib/monitor/external/submit";
import type { SubmitExternalInput } from "@/lib/monitor/external/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const evidenceSchema = z.union([
  z.string().max(20000),
  z.object({
    summary: z.string().max(4000).optional().default(""),
    facts: z.array(z.string().max(600)).max(40).optional(),
    numbers: z
      .array(z.object({ value: z.string().max(120), context: z.string().max(400).optional().default("") }))
      .max(40)
      .optional(),
    dates: z
      .array(z.object({ value: z.string().max(60), context: z.string().max(400).optional().default("") }))
      .max(40)
      .optional(),
    text: z.string().max(20000).optional(),
  }),
]);

const bodySchema = z.object({
  sourceUrl: z.string().min(1).max(2000),
  sourceTitle: z.string().min(1).max(400),
  sourceOrganisation: z.string().max(200).optional().nullable(),
  sourcePublishedAt: z.string().min(1).max(40),
  sourceUpdatedAt: z.string().max(40).optional().nullable(),
  evidence: evidenceSchema,
  categoryHint: z.enum(["visa", "tax", "cost", "site", "other"]).optional().nullable(),
  evidenceOrigin: z
    .enum(["official_fetch", "external_research", "operator_content"])
    .default("external_research"),
});

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// 軽量な固定ウィンドウ・レート制限（プロセス内・best-effort）。
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = Number.parseInt(process.env.EXTERNAL_NEWS_INGEST_RATE_MAX ?? "30", 10);
const hits: number[] = [];
function rateLimited(): boolean {
  const now = Date.now();
  while (hits.length && hits[0] < now - RATE_WINDOW_MS) hits.shift();
  if (hits.length >= (Number.isFinite(RATE_MAX) ? RATE_MAX : 30)) return true;
  hits.push(now);
  return false;
}

export async function POST(request: Request) {
  const secret = process.env.EXTERNAL_NEWS_INGEST_SECRET ?? "";
  if (!secret) {
    // 未設定なら機械取り込みは無効（接続済み Supabase 直接 insert 運用など）。
    return NextResponse.json({ ok: false, error: "ingestion disabled" }, { status: 503 });
  }
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  if (!token || !constantTimeEqual(token, secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (rateLimited()) {
    return NextResponse.json({ ok: false, error: "rate limited" }, { status: 429 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "invalid payload" },
      { status: 400 },
    );
  }
  const b = parsed.data;

  const input: SubmitExternalInput = {
    sourceUrl: b.sourceUrl,
    sourceTitle: b.sourceTitle,
    sourceOrganisation: b.sourceOrganisation ?? null,
    sourcePublishedAt: b.sourcePublishedAt,
    sourceUpdatedAt: b.sourceUpdatedAt ?? null,
    evidence: b.evidence,
    categoryHint: b.categoryHint ?? null,
    evidenceOrigin: b.evidenceOrigin,
    origin: "chatgpt_weekly",
    submittedBy: null,
  };

  const submit = await submitExternalCandidate(input);
  if (!submit.ok || !submit.id) {
    return NextResponse.json(
      { ok: false, errorCode: submit.errorCode, error: submit.error ?? "submission failed" },
      { status: 400 },
    );
  }

  // 同期処理はしない（スケジューラが pending をまとめて処理）。
  return NextResponse.json({ ok: true, id: submit.id, deduplicated: submit.deduplicated ?? false });
}
