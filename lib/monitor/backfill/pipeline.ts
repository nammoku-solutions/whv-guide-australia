/**
 * 歴史的バックフィルの中核パイプライン。既存の live-monitor コンポーネントを最大限
 * 再利用する（分類・生成・グラウンディング・重複防止・公開ポリシー・記事影響・
 * AI インデックス）。別系統のニュース生成器は作らない。
 *
 * フロー（1 候補につき）:
 *   キーワードプレフィルタ(決定的) -> 関連度分類(Gemini) -> ニュース生成(Gemini, 供給本文のみ)
 *   -> grounding -> 重複判定(手書き/自動/実行内) -> 公開ポリシー判定 -> 記事影響
 *   -> (apply のみ) news_items 挿入 -> article_impacts 挿入 -> 公開分のみ AI インデックス
 *
 * live-monitor のベースライン（monitor_source_state / snapshots / changes）には触れない。
 */

import { getIndexableArticles } from "@/lib/ai/content-source";
import { newsItems as manualNews } from "@/lib/newsData";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Article } from "@/types/article";
import { getEnabledSources } from "../registry";
import { contentHash } from "../diff";
import { classifyRelevance } from "../classify";
import { generateNews, checkGrounding } from "../generate";
import { buildEventKey, buildSlug } from "../dedupe";
import { decidePublication } from "../publish";
import { indexPublishedNews } from "../indexNews";
import type { ModelCaller } from "../gemini";
import type { GeneratedNews, SourceDefinition } from "../types";
import { discoverAll } from "./discover";
import { passesKeywordPrefilter } from "./keywordPrefilter";
import { analyzeBackfillImpact } from "./impact";
import {
  checkBackfillDuplicate,
  type BackfillCandidateKey,
  type DbNewsKey,
  type ManualNewsKey,
} from "./dedupe";
import {
  getBackfillAdmin,
  backfillColumnsReady,
  originColumnReady,
  createRun,
  completeRun,
  getAllNewsKeys,
  insertBackfillNews,
  insertBackfillImpacts,
  type BackfillOrigin,
  type RunStats,
} from "./db";
import type {
  BackfillReport,
  CandidateReportRow,
  HistoricalCandidate,
  SourceDiscovery,
  SourceReportRow,
  AdapterDeps,
} from "./types";

export type BackfillDeps = AdapterDeps & {
  classifyCaller?: ModelCaller;
  generateCaller?: ModelCaller;
  /** テスト用: 探索結果を直接注入し、ネットワークをバイパスする。 */
  discoveries?: SourceDiscovery[];
  /** テスト用: Supabase admin クライアントを差し替える（null も可）。 */
  admin?: SupabaseClient | null;
  /** テスト用: AI インデクサを差し替える。 */
  indexNews?: typeof indexPublishedNews;
};

export type RunBackfillOptions = {
  from: string;
  to: string;
  mode: "dry_run" | "apply";
  deps?: BackfillDeps;
};

/** 薄すぎる（標準ニュース化する価値がない）候補か。 */
function isThin(news: GeneratedNews): boolean {
  const hasWhat = news.whatChanged.trim().length >= 12;
  const hasContext = news.whoIsAffected.trim().length > 0 || news.whatToDo.trim().length > 0;
  const hasSummary = news.summary.trim().length >= 20;
  return !(hasWhat && hasContext && hasSummary);
}

function emptyStats(): RunStats {
  return {
    sourcesChecked: 0, sourcesSupported: 0, sourcesUnsupported: 0,
    candidatesDiscovered: 0, candidatesRelevant: 0, publishedCount: 0,
    reviewRequiredCount: 0, duplicateCount: 0, skippedCount: 0,
    errorCount: 0, impactsCreated: 0, indexedCount: 0,
  };
}

export { emptyStats };

/**
 * 1 候補を処理する共有コンテキスト。自動アーカイブ探索・手動シードの両方で使う。
 */
export type ProcessContext = {
  manualKeys: ManualNewsKey[];
  dbKeys: DbNewsKey[];
  /** 実行内 dedupe 用（呼び出し側で共有・変更される）。 */
  seen: BackfillCandidateKey[];
  seenTitles: { title: string; date: string }[];
  articles: Article[];
  willWrite: boolean;
  admin: SupabaseClient | null;
  indexImpl: typeof indexPublishedNews;
  runId: string | null;
  importedAt: string;
  classifyCaller?: ModelCaller;
  generateCaller?: ModelCaller;
  /** 0013 適用済みのときのみ設定（news_items.backfill_origin へ）。 */
  origin?: BackfillOrigin;
  /** 外部候補処理のとき、その external_news_candidates.id（news_items へリンク）。 */
  externalCandidateId?: string | null;
};

/**
 * 1 件の HistoricalCandidate を、既存の共有規則で処理する（分類→生成→grounding→dedupe→
 * 公開ポリシー→記事影響→(apply)保存→公開分のみ索引）。自動探索・手動シード共通の唯一の窓口。
 * @returns row=レポート行, relevant=関連度が highly/relevant で通過したか。
 */
export async function processCandidate(
  source: SourceDefinition,
  c: HistoricalCandidate,
  ctx: ProcessContext,
): Promise<{
  row: CandidateReportRow;
  relevant: boolean;
  /** 生成された構造化ニュース（プレビュー用。生成前に終了した場合は undefined）。 */
  generated?: GeneratedNews;
  /** grounding チェック結果（生成できた場合のみ）。 */
  groundingOk?: boolean;
  /** 挿入された news_items.id（apply かつ保存した場合のみ）。 */
  newsId?: string | null;
}> {
  const baseRow: CandidateReportRow = {
    officialDate: c.officialPublishedAt,
    organisation: c.sourceOrganisation,
    title: c.officialTitle,
    category: source.category,
    riskLevel: source.riskLevel,
    result: "skipped_unrelated",
    sourceUrl: c.officialUrl,
    detail: "",
  };

  // 公式日は必須（無ければアダプタ/シード検証で破棄済みだが二重防御）。
  if (!c.officialPublishedAt) {
    return { row: { ...baseRow, result: "skipped_no_date", detail: "公式公開日を確立できず。" }, relevant: false };
  }

  // 決定的プレフィルタ（Gemini コスト削減）。
  if (!passesKeywordPrefilter({ title: c.officialTitle, summary: c.listSummary, content: c.content })) {
    return { row: { ...baseRow, result: "skipped_unrelated", detail: "キーワードプレフィルタで除外（WHV 無関係）。" }, relevant: false };
  }

  // 関連度分類（Gemini）。
  const relevance = await classifyRelevance(source, c.listSummary ?? "", c.content, ctx.classifyCaller);
  baseRow.relevance = relevance.relevance;
  baseRow.confidence = relevance.confidence;

  if (relevance.relevance === "unrelated") {
    return { row: { ...baseRow, result: "skipped_unrelated", detail: `無関係: ${relevance.reason}` }, relevant: false };
  }
  if (relevance.relevance === "weakly_relevant") {
    return { row: { ...baseRow, result: "skipped_weak", detail: `弱い関連（スキップ）: ${relevance.reason}` }, relevant: false };
  }

  // ここから関連ありとして計上。
  // ニュース生成（Gemini, 供給本文のみ）。
  const news = await generateNews(source, c.listSummary ?? "", c.content, ctx.generateCaller);
  if (!news) {
    return { row: { ...baseRow, result: "review_required", detail: "生成失敗（レビュー要）。" }, relevant: true };
  }

  // 品質しきい値（薄すぎる更新は標準ニュース化しない）。
  if (isThin(news)) {
    return { row: { ...baseRow, result: "skipped_thin", detail: "内容が薄く標準ニュースに不適（/changes 向き）。" }, relevant: true };
  }

  // grounding（供給テキストに無い数値/URL を主張していないか）。
  const groundingOk = checkGrounding(news, c.content);

  // 公式日を権威とする（Gemini の推測日ではなく、公式一覧/シードの日付）。
  const newsForKey: GeneratedNews = { ...news, sourcePublishedAt: c.officialPublishedAt };
  const eventKey = buildEventKey(source, newsForKey);
  const slug = buildSlug(source, newsForKey);
  const newsHash = contentHash(`${news.title}\n${news.summary}\n${news.whatChanged}`);
  const candKey: BackfillCandidateKey = {
    eventKey,
    contentHash: newsHash,
    officialUrl: c.officialUrl,
    registrySourceUrl: c.registrySourceUrl,
    officialPublishedAt: c.officialPublishedAt,
  };

  // 重複判定（手書き / 自動 / 実行内）。
  const dup = checkBackfillDuplicate({
    candidate: candKey,
    generated: news,
    manual: ctx.manualKeys,
    db: ctx.dbKeys,
    seen: ctx.seen,
    seenTitles: ctx.seenTitles,
  });
  if (dup.duplicate) {
    return { row: { ...baseRow, result: "duplicate", detail: `duplicate_existing_news (${dup.against}): ${dup.reason}` }, relevant: true };
  }

  // 公開ポリシー（決定的・既存と同一）。高リスクは常に review。
  const decision = decidePublication({
    source,
    riskLevel: source.riskLevel,
    relevance: relevance.relevance,
    confidence: Math.min(relevance.confidence, news.confidence || relevance.confidence),
    groundingOk,
    meaningfulChange: true,
    isDuplicate: false,
    sourceUrl: c.officialUrl,
  });

  // 記事影響（公式日を考慮して過剰な陳腐化警告を抑制）。
  const impacts = analyzeBackfillImpact(source, ctx.articles, c.officialPublishedAt);
  const relatedArticleIds = impacts.filter((i) => i.impactLevel !== "unaffected").map((i) => i.articleId);
  const relatedGuideSlug = impacts.length > 0 ? impacts[0].articleUrl.replace("/guides/", "") : null;

  // 採用（実行内 dedupe 用に記録）。
  ctx.seen.push(candKey);
  ctx.seenTitles.push({ title: news.title, date: c.officialPublishedAt });

  let indexed = false;
  let impactCount = impacts.filter((i) => i.impactLevel !== "unaffected").length;
  let newsId: string | null = null;

  if (ctx.willWrite && ctx.admin) {
    newsId = await insertBackfillNews(ctx.admin, {
      slug, news, source, candidate: c,
      riskLevel: source.riskLevel,
      contentHash: newsHash, eventKey,
      relatedArticleIds, relatedGuideSlug,
      publicationMode: decision.mode, status: decision.status,
      runId: ctx.runId, importedAt: ctx.importedAt,
      origin: ctx.origin,
      externalCandidateId: ctx.externalCandidateId,
    });
    impactCount = await insertBackfillImpacts(ctx.admin, newsId, impacts);
    // 公開分のみ AI インデックス（変更コンテンツだけ）。review は索引しない。
    if (decision.status === "published") {
      try {
        const r = await ctx.indexImpl({
          slug, title: news.title, summary: news.summary,
          whatChanged: news.whatChanged, whoIsAffected: news.whoIsAffected,
          whatToDo: news.whatToDo, category: source.category,
          riskLevel: source.riskLevel, updatedAt: ctx.importedAt,
        });
        indexed = r === "indexed";
      } catch {
        indexed = false;
      }
    }
  }

  if (decision.status === "published") {
    return {
      row: { ...baseRow, result: "published", detail: "自動公開（低/中リスク・全条件合格）。", slug, impacts: impactCount, indexed },
      relevant: true,
      generated: news,
      groundingOk,
      newsId,
    };
  }
  return {
    row: { ...baseRow, result: "review_required", detail: `レビュー要求: ${decision.reasons.join(" / ")}`, slug, impacts: impactCount },
    relevant: true,
    generated: news,
    groundingOk,
    newsId,
  };
}

/** row の結果に応じて集計する（自動探索・手動シード共通）。 */
export function tallyStats(stats: RunStats, row: CandidateReportRow, relevant: boolean): void {
  if (relevant) stats.candidatesRelevant++;
  switch (row.result) {
    case "published": stats.publishedCount++; break;
    case "review_required": stats.reviewRequiredCount++; break;
    case "duplicate": stats.duplicateCount++; break;
    case "error": stats.errorCount++; break;
    case "skipped_no_date":
    case "skipped_unrelated":
    case "skipped_weak":
    case "skipped_thin":
    case "skipped_grounding": stats.skippedCount++; break;
  }
  if (row.impacts) stats.impactsCreated += row.impacts;
  if (row.indexed) stats.indexedCount++;
}

/** apply の DB/列準備を確認し、書き込み可否と origin 記録可否を返す。 */
export async function resolveWriteReadiness(
  mode: "dry_run" | "apply",
  admin: SupabaseClient | null,
  notes: string[],
): Promise<{ willWrite: boolean; hasOrigin: boolean }> {
  if (mode !== "apply") return { willWrite: false, hasOrigin: false };
  if (!admin) {
    notes.push("apply 要求だが Supabase service-role 未設定のため書き込みなし（dry-run として実行）。");
    return { willWrite: false, hasOrigin: false };
  }
  if (!(await backfillColumnsReady(admin))) {
    notes.push("apply 要求だが 0012_news_backfill マイグレーション未適用のため書き込みなし。先に SQL を適用してください。");
    return { willWrite: false, hasOrigin: false };
  }
  const hasOrigin = await originColumnReady(admin);
  if (!hasOrigin) {
    notes.push("0013_news_backfill_origin 未適用のため origin ラベルは付与されません（書き込みは継続）。");
  }
  return { willWrite: true, hasOrigin };
}

export async function runBackfill(opts: RunBackfillOptions): Promise<BackfillReport> {
  const { from, to, mode } = opts;
  const deps = opts.deps ?? {};
  const notes: string[] = [];

  const sources = getEnabledSources();
  const sourceById = new Map<string, SourceDefinition>(sources.map((s) => [s.sourceId, s]));

  // --- apply の安全確認（DB 準備・列存在）。未準備なら書き込みしない。 ---
  const admin = deps.admin !== undefined ? deps.admin : getBackfillAdmin();
  const indexImpl = deps.indexNews ?? indexPublishedNews;
  const { willWrite, hasOrigin } = await resolveWriteReadiness(mode, admin, notes);
  const origin: BackfillOrigin | undefined = hasOrigin ? "archive" : undefined;

  // --- 1. 探索（注入があればバイパス） ---
  const discoveries = deps.discoveries ?? (await discoverAll(from, to, deps));

  const stats = emptyStats();
  stats.sourcesChecked = discoveries.length;
  const sourceRows: SourceReportRow[] = [];
  for (const d of discoveries) {
    const supported = d.status === "supported";
    if (supported) stats.sourcesSupported++;
    else if (d.status === "unsupported") stats.sourcesUnsupported++;
    else stats.errorCount += 0; // 取得系エラーは candidate ではなく source 単位（下でノート化）
    sourceRows.push({
      sourceId: d.sourceId,
      organisation: d.organisation,
      supported,
      status: d.status,
      discovered: d.candidates.length,
      detail: d.detail,
    });
    if (!supported && d.status !== "unsupported") {
      notes.push(`ソース ${d.sourceId}: ${d.status} — ${d.detail}`);
    }
  }

  // --- 既存キー（dedupe） ---
  const manualKeys: ManualNewsKey[] = manualNews
    .filter((n) => n.published)
    .map((n) => ({ title: n.title, sourceUrl: n.source?.url, date: n.date }));
  const dbKeys = willWrite && admin ? await getAllNewsKeys(admin) : [];

  const runId = willWrite && admin ? await createRun(admin, from, to, mode, origin) : null;
  const importedAt = new Date().toISOString();

  const ctx: ProcessContext = {
    manualKeys,
    dbKeys,
    seen: [],
    seenTitles: [],
    articles: getIndexableArticles(),
    willWrite,
    admin,
    indexImpl,
    runId,
    importedAt,
    classifyCaller: deps.classifyCaller,
    generateCaller: deps.generateCaller,
    origin,
  };
  const candidateRows: CandidateReportRow[] = [];

  // --- 2. 候補処理（共有 processCandidate を再利用） ---
  const allCandidates: HistoricalCandidate[] = discoveries.flatMap((d) => d.candidates);
  stats.candidatesDiscovered = allCandidates.length;

  for (const c of allCandidates) {
    const source = sourceById.get(c.sourceId);
    if (!source) continue;
    try {
      const { row, relevant } = await processCandidate(source, c, ctx);
      tallyStats(stats, row, relevant);
      candidateRows.push(row);
    } catch (err) {
      const row: CandidateReportRow = {
        officialDate: c.officialPublishedAt,
        organisation: c.sourceOrganisation,
        title: c.officialTitle,
        category: source.category,
        riskLevel: source.riskLevel,
        result: "error",
        sourceUrl: c.officialUrl,
        detail: `例外: ${err instanceof Error ? err.message : String(err)}`,
      };
      tallyStats(stats, row, false);
      candidateRows.push(row);
    }
  }

  // 公式日でレポート候補を並べ替え（新しい順）。
  candidateRows.sort((a, b) => (a.officialDate < b.officialDate ? 1 : -1));

  if (willWrite && admin && runId) {
    await completeRun(admin, runId, stats, "completed", notes.join(" | "));
  }

  return {
    from, to, mode,
    sourcesChecked: stats.sourcesChecked,
    sourcesSupported: stats.sourcesSupported,
    sourcesUnsupported: stats.sourcesUnsupported,
    candidatesDiscovered: stats.candidatesDiscovered,
    candidatesRelevant: stats.candidatesRelevant,
    publishedCount: stats.publishedCount,
    reviewRequiredCount: stats.reviewRequiredCount,
    duplicateCount: stats.duplicateCount,
    skippedCount: stats.skippedCount,
    errorCount: stats.errorCount,
    impactsCreated: stats.impactsCreated,
    indexedCount: stats.indexedCount,
    // このパイプラインは live-monitor テーブルに書き込まないため常に true。
    liveMonitorBaselineUntouched: true,
    runId,
    sources: sourceRows,
    candidates: candidateRows,
    notes,
  };
}
