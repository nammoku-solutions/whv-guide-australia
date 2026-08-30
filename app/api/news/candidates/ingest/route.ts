/**
 * 外部ニュース候補の機械取り込みエンドポイント（現在は任意・既定無効）。
 *
 * `EXTERNAL_NEWS_INGEST_SECRET` が未設定なら 503 で停止する。candidate inbox の
 * スキーマ/API境界は将来の運用再設計に備えて保持しているが、現在の週次ChatGPT調査は
 * このルートを必要とせず、投函後のモデル分類・生成・自動公開もスケジュール実行しない。
 *
 * 有効化する場合のセキュリティ:
 * - 専用 `EXTERNAL_NEWS_INGEST_SECRET`（Bearer）を使用し、service-role keyを流用しない。
 * - allow-list検証とdedupeは `submitExternalCandidate` 経由で必須。
 * - narrow payload、rate limit、秘匿値非ログ化を維持する。
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

  // Inboxへの保存だけを行う。現在は下流のAI処理を自動起動しない。
  return NextResponse.json({ ok: true, id: submit.id, deduplicated: submit.deduplicated ?? false });
}
