/**
 * 外部ニュース候補の共有プロセッサ。
 *
 * pending 候補を原子的に claim し、構造化エビデンスを既存の共有 HistoricalCandidate DTO に
 * 適応させて、既存の共有パイプライン（processCandidate: 分類→生成→grounding→dedupe→
 * 公開ポリシー→記事影響→保存→公開分のみ AI 索引）へ流し込む。別系統の生成器は作らない。
 *
 * 冪等性/並行性:
 *   - claim は status='pending' の行のみ processing にする原子的更新（二重処理を防ぐ）。
 *   - クラッシュで processing のまま古くなった候補は reclaimStaleCandidates で回収。
 *   - 下流 dedupe（event_key/content_hash）が公開ニュースの一意性を担保（再送で重複公開しない）。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getIndexableArticles } from "@/lib/ai/content-source";
import { newsItems as manualNews } from "@/lib/newsData";
import type { ModelCaller } from "../gemini";
import { indexPublishedNews } from "../indexNews";
import { resolveOfficialSource } from "../backfill/officialDomains";
import {
  processCandidate,
  type ProcessContext,
} from "../backfill/pipeline";
import {
  backfillColumnsReady,
  originColumnReady,
  getAllNewsKeys,
} from "../backfill/db";
import type { ManualNewsKey } from "../backfill/dedupe";
import type { CandidateResult, HistoricalCandidate } from "../backfill/types";
import {
  getExternalAdmin,
  externalTableReady,
  claimCandidate,
  reclaimStaleCandidates,
  getPendingCandidateIds,
  finalizeCandidate,
  notifyModeratorsReviewRequired,
} from "./db";
import { normaliseEvidence, evidenceToText, hasSufficientEvidence } from "./evidence";
import type {
  ExternalCandidateRow,
  ExternalStatus,
  ProcessOutcome,
} from "./types";

/** processing を stale とみなす既定時間（クラッシュ回収用）。 */
const STALE_PROCESSING_MS = 15 * 60 * 1000;

/** CandidateResult（共有パイプライン）→ 外部候補ステータスへの決定的マッピング。 */
function mapResult(result: CandidateResult): ExternalStatus {
  switch (result) {
    case "published": return "published";
    case "review_required": return "review_required";
    case "duplicate": return "duplicate";
    case "skipped_unrelated": return "irrelevant";
    case "skipped_weak":
    case "skipped_thin":
    case "skipped_grounding":
    case "skipped_no_date": return "skipped";
    case "error": return "failed";
    default: return "skipped";
  }
}

/** 候補行から共有 HistoricalCandidate を構築する（エビデンスを唯一の根拠に）。 */
function buildCandidate(row: ExternalCandidateRow, importedAt: string): HistoricalCandidate | null {
  const source = resolveOfficialSource(row.source_url);
  if (!source) return null;
  const evidence = normaliseEvidence(row.source_evidence);
  const content = evidenceToText(evidence);
  if (!hasSufficientEvidence(evidence)) return null;
  return {
    sourceId: source.sourceId,
    sourceOrganisation: row.source_organisation ?? source.organisation,
    registrySourceUrl: source.url,
    officialTitle: row.source_title,
    officialUrl: row.source_url,
    officialPublishedAt: row.source_published_at,
    officialUpdatedAt: row.source_updated_at ?? undefined,
    content,
    sourceType: "archive",
    listSummary: evidence.summary || undefined,
    discoveredAt: importedAt,
    historicalRangeFrom: row.source_published_at,
    historicalRangeTo: row.source_published_at,
  };
}

export type ProcessDeps = {
  admin?: SupabaseClient | null;
  classifyCaller?: ModelCaller;
  generateCaller?: ModelCaller;
  indexNews?: typeof indexPublishedNews;
  /** テスト用: claim 済みの行を直接与える（DB claim をバイパス）。 */
  rows?: ExternalCandidateRow[];
  staleMs?: number;
};

/**
 * 単一の claim 済み候補行を処理する。1 件の失敗が他を止めない（呼び出し側で catch）。
 * ctx.externalCandidateId は呼び出し前に設定しておくこと。
 */
export async function processExternalRow(
  row: ExternalCandidateRow,
  ctx: ProcessContext,
  admin: SupabaseClient,
): Promise<ProcessOutcome> {
  const source = resolveOfficialSource(row.source_url);
  if (!source) {
    await finalizeCandidate(admin, row.id, {
      status: "failed",
      errorCode: "invalid_source",
      errorMessage: "対応する公式ソース定義がありません。",
    });
    return { candidateId: row.id, status: "failed", detail: "invalid_source", errorCode: "invalid_source" };
  }

  const candidate = buildCandidate(row, ctx.importedAt);
  if (!candidate) {
    await finalizeCandidate(admin, row.id, {
      status: "skipped",
      errorCode: "insufficient_evidence",
      errorMessage: "エビデンスが不足しています。",
    });
    return { candidateId: row.id, status: "skipped", detail: "insufficient_evidence", errorCode: "insufficient_evidence" };
  }

  ctx.externalCandidateId = row.id;
  const { row: reportRow, generated, groundingOk, newsId } = await processCandidate(source, candidate, ctx);
  const status = mapResult(reportRow.result);

  await finalizeCandidate(admin, row.id, {
    status,
    newsItemId: newsId ?? null,
    errorCode: null,
    errorMessage: null,
  });

  // レビュー要求で終わったらモデレーターに通知（公開前に一般ユーザーには通知しない）。
  if (status === "review_required") {
    try {
      await notifyModeratorsReviewRequired(admin, { candidateId: row.id, title: reportRow.title });
    } catch {
      /* 通知失敗は処理自体を失敗にしない */
    }
  }

  return {
    candidateId: row.id,
    status,
    detail: reportRow.detail,
    relevance: reportRow.relevance,
    confidence: reportRow.confidence,
    duplicate: status === "duplicate",
    groundingOk,
    riskLevel: source.riskLevel,
    newsItemId: newsId ?? null,
    newsSlug: reportRow.slug ?? null,
    impacts: reportRow.impacts,
    indexed: reportRow.indexed,
    preview: generated
      ? {
          title: generated.title,
          summary: generated.summary,
          whatChanged: generated.whatChanged,
          whoIsAffected: generated.whoIsAffected,
          whatToDo: generated.whatToDo,
          sourcePublishedAt: candidate.officialPublishedAt,
        }
      : undefined,
  };
}

/** 共有 ProcessContext を組み立てる（バッチ内 dedupe を共有）。 */
async function buildContext(
  admin: SupabaseClient,
  deps: ProcessDeps,
): Promise<ProcessContext> {
  const manualKeys: ManualNewsKey[] = manualNews
    .filter((n) => n.published)
    .map((n) => ({ title: n.title, sourceUrl: n.source?.url, date: n.date }));
  const dbKeys = await getAllNewsKeys(admin);
  return {
    manualKeys,
    dbKeys,
    seen: [],
    seenTitles: [],
    articles: getIndexableArticles(),
    willWrite: true,
    admin,
    indexImpl: deps.indexNews ?? indexPublishedNews,
    runId: null,
    importedAt: new Date().toISOString(),
    classifyCaller: deps.classifyCaller,
    generateCaller: deps.generateCaller,
    origin: "external",
  };
}

export type ProcessBatchResult = {
  ok: boolean;
  error?: string;
  reclaimed: number;
  claimed: number;
  outcomes: ProcessOutcome[];
};

/**
 * pending 候補をバッチ処理する。0 件なら Gemini を一切呼ばない。
 * @param limit バッチ上限。
 */
export async function processPendingCandidates(
  limit: number,
  deps: ProcessDeps = {},
): Promise<ProcessBatchResult> {
  const admin = deps.admin !== undefined ? deps.admin : getExternalAdmin();
  if (!admin) return { ok: false, error: "service-role 未設定。", reclaimed: 0, claimed: 0, outcomes: [] };

  // 書き込み前提の列がすべて揃っているか（0012 + 0013 + 0014）。
  if (!(await externalTableReady(admin))) {
    return { ok: false, error: "0014 未適用（external_news_candidates なし）。", reclaimed: 0, claimed: 0, outcomes: [] };
  }
  if (!(await backfillColumnsReady(admin)) || !(await originColumnReady(admin))) {
    return { ok: false, error: "0012/0013 未適用（news_items のバックフィル列なし）。", reclaimed: 0, claimed: 0, outcomes: [] };
  }

  // 1. stale processing を回収（クラッシュ後の取りこぼしを pending に戻す）。
  const reclaimedIds = await reclaimStaleCandidates(admin, deps.staleMs ?? STALE_PROCESSING_MS);

  // 2. テスト注入があればそれを、無ければ pending を claim する。
  let claimedRows: ExternalCandidateRow[];
  if (deps.rows) {
    claimedRows = deps.rows;
  } else {
    const ids = await getPendingCandidateIds(admin, limit);
    claimedRows = [];
    for (const id of ids) {
      const row = await claimCandidate(admin, id);
      if (row) claimedRows.push(row); // claim できなければ他ワーカーが処理中（スキップ）。
    }
  }

  if (claimedRows.length === 0) {
    return { ok: true, reclaimed: reclaimedIds.length, claimed: 0, outcomes: [] };
  }

  // 3. 共有コンテキストで処理（バッチ内 dedupe を共有）。
  const ctx = await buildContext(admin, deps);
  const outcomes: ProcessOutcome[] = [];
  for (const row of claimedRows) {
    try {
      outcomes.push(await processExternalRow(row, ctx, admin));
    } catch (err) {
      await finalizeCandidate(admin, row.id, {
        status: "failed",
        errorCode: "generation_failed",
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      outcomes.push({
        candidateId: row.id,
        status: "failed",
        detail: `例外: ${err instanceof Error ? err.message : String(err)}`,
        errorCode: "generation_failed",
      });
    }
  }

  return { ok: true, reclaimed: reclaimedIds.length, claimed: claimedRows.length, outcomes };
}

/**
 * 1 候補を投函直後に即時処理する（モバイル取り込みの同期プレビュー用）。
 * claim → 処理 → 結果を返す。Vercel 上で安全に完結する。
 */
export async function processCandidateNow(
  candidateId: string,
  deps: ProcessDeps = {},
): Promise<ProcessOutcome | { candidateId: string; status: "skipped"; detail: string }> {
  const admin = deps.admin !== undefined ? deps.admin : getExternalAdmin();
  if (!admin) return { candidateId, status: "skipped", detail: "service-role 未設定。" };
  if (!(await externalTableReady(admin)) || !(await backfillColumnsReady(admin)) || !(await originColumnReady(admin))) {
    return { candidateId, status: "skipped", detail: "必要なマイグレーション（0012/0013/0014）が未適用。" };
  }

  const row = deps.rows?.[0] ?? (await claimCandidate(admin, candidateId));
  if (!row) {
    // 既に他経路で処理済み/処理中。二重処理しない。
    return { candidateId, status: "skipped", detail: "既に処理済みまたは処理中です。" };
  }
  const ctx = await buildContext(admin, deps);
  try {
    return await processExternalRow(row, ctx, admin);
  } catch (err) {
    await finalizeCandidate(admin, candidateId, {
      status: "failed",
      errorCode: "generation_failed",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return {
      candidateId,
      status: "failed",
      detail: `例外: ${err instanceof Error ? err.message : String(err)}`,
      errorCode: "generation_failed",
    } as ProcessOutcome;
  }
}
