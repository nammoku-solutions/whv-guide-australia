/**
 * 管理（スマホ）向け: 外部ニュース候補の投函・即時処理・一覧（モデレーターのみ）。
 *
 * GET  … 外部候補の一覧（管理 UI 表示用）。
 * POST … 候補を投函し、任意で即時処理してプレビュー/結果を返す。
 *
 * 認証はサーバー側でモデレーターセッションから導出する（通常ユーザーは投函不可）。
 * 生の秘匿値・デバッグペイロードは通常応答に出さない。
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getAiAdminClient } from "@/lib/ai/server/supabaseAdmin";
import { requireModerator } from "@/lib/monitor/adminAuth";
import { submitExternalCandidate } from "@/lib/monitor/external/submit";
import { processCandidateNow } from "@/lib/monitor/external/processor";
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
  evidenceOrigin: z.enum(["official_fetch", "external_research", "operator_content"]).default("external_research"),
  /** true なら投函後に即時処理してプレビュー/結果を返す。 */
  process: z.boolean().optional().default(true),
});

export async function GET(request: Request) {
  const auth = await requireModerator(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: "権限がありません。" }, { status: 403 });
  }
  const admin = getAiAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "サーバー設定が未完了です。" }, { status: 503 });
  }
  const { data, error } = await admin
    .from("external_news_candidates")
    .select(
      "id, source_organisation, source_url, source_title, source_published_at, evidence_origin, origin, status, processing_attempts, last_error_code, news_item_id, submitted_at, processed_at",
    )
    .order("submitted_at", { ascending: false })
    .limit(100);
  if (error) {
    return NextResponse.json({ ok: false, error: "読み込みに失敗しました。" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, candidates: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireModerator(request);
  if (!auth.ok || !auth.userId) {
    return NextResponse.json({ ok: false, error: "権限がありません。" }, { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "リクエスト形式が不正です。" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "入力が不正です。" },
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
    origin: "admin_mobile",
    submittedBy: auth.userId,
  };

  const submit = await submitExternalCandidate(input);
  if (!submit.ok || !submit.id) {
    return NextResponse.json(
      { ok: false, errorCode: submit.errorCode, error: submit.error ?? "投函に失敗しました。" },
      { status: 400 },
    );
  }

  if (!b.process) {
    return NextResponse.json({
      ok: true,
      id: submit.id,
      deduplicated: submit.deduplicated ?? false,
      canonicalUrl: submit.canonicalUrl,
      organisation: submit.organisation,
      riskLevel: submit.riskLevel,
      category: submit.category,
    });
  }

  // 即時処理（Vercel 上で安全に完結）。再送で既に処理済みならスキップ扱い。
  const outcome = await processCandidateNow(submit.id);
  return NextResponse.json({
    ok: true,
    id: submit.id,
    deduplicated: submit.deduplicated ?? false,
    canonicalUrl: submit.canonicalUrl,
    organisation: submit.organisation,
    riskLevel: submit.riskLevel,
    category: submit.category,
    outcome,
  });
}
