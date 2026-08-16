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
  type ManualNewsKey,
} from "./dedupe";
import {
  getBackfillAdmin,
  backfillColumnsReady,
  createRun,
  completeRun,
  getAllNewsKeys,
  insertBackfillNews,
  insertBackfillImpacts,
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

export async function runBackfill(opts: RunBackfillOptions): Promise<BackfillReport> {
  const { from, to, mode } = opts;
  const deps = opts.deps ?? {};
  const notes: string[] = [];

  const sources = getEnabledSources();
  const sourceById = new Map<string, SourceDefinition>(sources.map((s) => [s.sourceId, s]));

  // --- apply の安全確認（DB 準備・列存在）。未準備なら書き込みしない。 ---
  const admin = deps.admin !== undefined ? deps.admin : getBackfillAdmin();
  const indexImpl = deps.indexNews ?? indexPublishedNews;
  let willWrite = mode === "apply";
  if (mode === "apply") {
    if (!admin) {
      willWrite = false;
      notes.push("apply 要求だが Supabase service-role 未設定のため書き込みなし（dry-run として実行）。");
    } else if (!(await backfillColumnsReady(admin))) {
      willWrite = false;
      notes.push("apply 要求だが 0012_news_backfill マイグレーション未適用のため書き込みなし。先に SQL を適用してください。");
    }
  }

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

  const runId = willWrite && admin ? await createRun(admin, from, to, mode) : null;
  const importedAt = new Date().toISOString();
  const articles = getIndexableArticles();

  const seen: BackfillCandidateKey[] = [];
  const seenTitles: { title: string; date: string }[] = [];
  const candidateRows: CandidateReportRow[] = [];

  // --- 2. 候補処理（決定的プレフィルタ → 必要時のみ Gemini） ---
  const allCandidates: HistoricalCandidate[] = discoveries.flatMap((d) => d.candidates);
  stats.candidatesDiscovered = allCandidates.length;

  for (const c of allCandidates) {
    const source = sourceById.get(c.sourceId);
    if (!source) continue;

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

    // 公式日は必須（無ければアダプタが破棄済みだが二重防御）。
    if (!c.officialPublishedAt) {
      stats.skippedCount++;
      candidateRows.push({ ...baseRow, result: "skipped_no_date", detail: "公式公開日を確立できず。" });
      continue;
    }

    // 決定的プレフィルタ（Gemini コスト削減）。
    if (!passesKeywordPrefilter({ title: c.officialTitle, summary: c.listSummary, content: c.content })) {
      stats.skippedCount++;
      candidateRows.push({ ...baseRow, result: "skipped_unrelated", detail: "キーワードプレフィルタで除外（WHV 無関係）。" });
      continue;
    }

    try {
      // 関連度分類（Gemini）。
      const relevance = await classifyRelevance(source, c.listSummary ?? "", c.content, deps.classifyCaller);
      baseRow.relevance = relevance.relevance;
      baseRow.confidence = relevance.confidence;

      if (relevance.relevance === "unrelated") {
        stats.skippedCount++;
        candidateRows.push({ ...baseRow, result: "skipped_unrelated", detail: `無関係: ${relevance.reason}` });
        continue;
      }
      if (relevance.relevance === "weakly_relevant") {
        stats.skippedCount++;
        candidateRows.push({ ...baseRow, result: "skipped_weak", detail: `弱い関連（スキップ）: ${relevance.reason}` });
        continue;
      }

      stats.candidatesRelevant++;

      // ニュース生成（Gemini, 供給本文のみ）。
      const news = await generateNews(source, c.listSummary ?? "", c.content, deps.generateCaller);
      if (!news) {
        stats.reviewRequiredCount++;
        candidateRows.push({ ...baseRow, result: "review_required", detail: "生成失敗（レビュー要）。" });
        continue;
      }

      // 品質しきい値（薄すぎる更新は標準ニュース化しない）。
      if (isThin(news)) {
        stats.skippedCount++;
        candidateRows.push({ ...baseRow, result: "skipped_thin", detail: "内容が薄く標準ニュースに不適（/changes 向き）。" });
        continue;
      }

      // grounding（供給テキストに無い数値/URL を主張していないか）。
      const groundingOk = checkGrounding(news, c.content);

      // 公式日を権威とする（Gemini の推測日ではなく、公式一覧の日付）。
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
        manual: manualKeys,
        db: dbKeys,
        seen,
        seenTitles,
      });
      if (dup.duplicate) {
        stats.duplicateCount++;
        candidateRows.push({ ...baseRow, result: "duplicate", detail: `duplicate_existing_news (${dup.against}): ${dup.reason}` });
        continue;
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
      const impacts = analyzeBackfillImpact(source, articles, c.officialPublishedAt);
      const relatedArticleIds = impacts.filter((i) => i.impactLevel !== "unaffected").map((i) => i.articleId);
      const relatedGuideSlug = impacts.length > 0 ? impacts[0].articleUrl.replace("/guides/", "") : null;

      // 採用（実行内 dedupe 用に記録）。
      seen.push(candKey);
      seenTitles.push({ title: news.title, date: c.officialPublishedAt });

      let indexed = false;
      let impactCount = impacts.filter((i) => i.impactLevel !== "unaffected").length;

      if (willWrite && admin) {
        const newsId = await insertBackfillNews(admin, {
          slug, news, source, candidate: c,
          riskLevel: source.riskLevel,
          contentHash: newsHash, eventKey,
          relatedArticleIds, relatedGuideSlug,
          publicationMode: decision.mode, status: decision.status,
          runId, importedAt,
        });
        impactCount = await insertBackfillImpacts(admin, newsId, impacts);
        // 公開分のみ AI インデックス（変更コンテンツだけ）。review は索引しない。
        if (decision.status === "published") {
          try {
            const r = await indexImpl({
              slug, title: news.title, summary: news.summary,
              whatChanged: news.whatChanged, whoIsAffected: news.whoIsAffected,
              whatToDo: news.whatToDo, category: source.category,
              riskLevel: source.riskLevel, updatedAt: importedAt,
            });
            indexed = r === "indexed";
          } catch {
            indexed = false;
          }
        }
      }

      stats.impactsCreated += impactCount;
      if (indexed) stats.indexedCount++;

      if (decision.status === "published") {
        stats.publishedCount++;
        candidateRows.push({ ...baseRow, result: "published", detail: "自動公開（低/中リスク・全条件合格）。", slug, impacts: impactCount, indexed });
      } else {
        stats.reviewRequiredCount++;
        candidateRows.push({ ...baseRow, result: "review_required", detail: `レビュー要求: ${decision.reasons.join(" / ")}`, slug, impacts: impactCount });
      }
    } catch (err) {
      stats.errorCount++;
      candidateRows.push({ ...baseRow, result: "error", detail: `例外: ${err instanceof Error ? err.message : String(err)}` });
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
