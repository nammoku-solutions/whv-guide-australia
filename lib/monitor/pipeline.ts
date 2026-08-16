/**
 * 監視パイプラインの中核。1 ソースにつき:
 *   fetch -> extract -> normalise -> hash -> compare
 *   （変更なし/取得失敗ならここで停止し、Gemini を呼ばない）
 *   -> 意味のある変更のみ: snapshot 保存 -> 変更記録 -> 関連度分類(AI)
 *   -> 関連あり: ニュース生成(AI, 供給テキストのみ) -> grounding -> dedupe
 *   -> 公開ポリシー判定 -> 記事影響分析 -> 保存 -> （自動公開時）AI インデックス更新
 *
 * 失敗は決して「変更なし」に丸めない。AI は「変わったか」を判断しない。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getIndexableArticles } from "@/lib/ai/content-source";
import { monitorConfig } from "./config";
import { getEnabledSources } from "./registry";
import { fetchSource } from "./fetch";
import { extractContent } from "./extract";
import { contentHash, diffText } from "./diff";
import { classifyRelevance } from "./classify";
import { generateNews, checkGrounding } from "./generate";
import { buildEventKey, buildSlug, isDuplicate } from "./dedupe";
import { decidePublication } from "./publish";
import { analyzeArticleImpact } from "./impact";
import { indexPublishedNews } from "./indexNews";
import {
  getMonitorAdmin,
  getSourceState,
  getLatestSnapshotText,
  markChecked,
  markFailure,
  markChanged,
  establishBaseline,
  saveSnapshot,
  insertChange,
  setChangeProcessed,
  getExistingNewsKeys,
  insertNews,
  insertArticleImpacts,
} from "./db";
import type { ModelCaller } from "./gemini";
import type { SourceDefinition } from "./types";

export type SourceOutcome =
  | "failure"
  | "unchanged"
  | "baseline"
  | "boilerplate"
  | "unrelated"
  | "review"
  | "auto_published"
  | "duplicate";

export type SourceResult = {
  sourceId: string;
  organisation: string;
  sourceName: string;
  outcome: SourceOutcome;
  detail: string;
  newsSlug?: string;
  impacts?: number;
  indexed?: boolean;
};

export type PipelineDeps = {
  /** テスト用に差し替え可能な依存。 */
  fetchImpl?: typeof fetch;
  classifyCaller?: ModelCaller;
  generateCaller?: ModelCaller;
};

/** 単一ソースを処理する。 */
export async function processSource(
  admin: SupabaseClient,
  source: SourceDefinition,
  deps: PipelineDeps = {},
): Promise<SourceResult> {
  const base = {
    sourceId: source.sourceId,
    organisation: source.organisation,
    sourceName: source.sourceName,
  };

  const state = await getSourceState(admin, source.sourceId);
  const prevFailures = state?.consecutive_failures ?? 0;

  // 1. 取得
  const url =
    source.monitoringMethod === "rss" && source.feedUrl ? source.feedUrl : source.url;
  const fetched = await fetchSource(url, deps.fetchImpl);
  if (fetched.status !== "success" || !fetched.raw) {
    await markFailure(admin, source.sourceId, fetched.status, fetched.error, prevFailures);
    return { ...base, outcome: "failure", detail: `取得失敗: ${fetched.status}` };
  }

  // 2. 抽出・正規化
  const extracted = extractContent(fetched.raw, source.monitoringMethod);
  if (!extracted.text || extracted.text.trim().length === 0) {
    await markFailure(
      admin,
      source.sourceId,
      "unexpected_structure",
      "抽出結果が空",
      prevFailures,
    );
    return { ...base, outcome: "failure", detail: "抽出結果が空（構造変化の可能性）" };
  }

  // 3. ハッシュ比較（決定的）
  const newHash = contentHash(extracted.text);
  const prevHash = state?.content_hash ?? null;

  if (prevHash && prevHash === newHash) {
    await markChecked(admin, source.sourceId, "success");
    return { ...base, outcome: "unchanged", detail: "変更なし" };
  }

  // 初回観測: ベースラインを確立（変更イベント化しない・Gemini を呼ばない）。
  if (!prevHash) {
    await saveSnapshot(
      admin,
      source.sourceId,
      newHash,
      extracted.text,
      fetched.httpStatus,
      monitorConfig.snapshotRetention,
    );
    await establishBaseline(admin, source.sourceId, newHash, "success");
    return { ...base, outcome: "baseline", detail: "初回観測（ベースライン確立）" };
  }

  // 差分（前回スナップショット本文との比較）。
  const prevText = (await getLatestSnapshotText(admin, source.sourceId)) ?? "";
  const diff = diffText(prevText, extracted.text);
  const meaningful = diff.changedChars >= monitorConfig.minMeaningfulDelta;

  // boilerplate のみの揺れ: ベースラインだけ更新して停止（Gemini を呼ばない）。
  if (!meaningful) {
    await saveSnapshot(
      admin,
      source.sourceId,
      newHash,
      extracted.text,
      fetched.httpStatus,
      monitorConfig.snapshotRetention,
    );
    await establishBaseline(admin, source.sourceId, newHash, "success");
    return { ...base, outcome: "boilerplate", detail: "軽微/体裁のみの変更" };
  }

  // 4. スナップショット保存 + 変更記録
  const snapshotId = await saveSnapshot(
    admin,
    source.sourceId,
    newHash,
    extracted.text,
    fetched.httpStatus,
    monitorConfig.snapshotRetention,
  );
  const changeId = await insertChange(admin, {
    source,
    previousHash: prevHash,
    newHash,
    diff: diff.summary,
    snapshotId,
  });

  // 5. 関連度分類（AI）
  const relevance = await classifyRelevance(
    source,
    diff.summary,
    extracted.text,
    deps.classifyCaller,
  );

  if (relevance.relevance === "unrelated") {
    if (changeId)
      await setChangeProcessed(admin, changeId, relevance.relevance, relevance.confidence, "ignored");
    await markChanged(admin, source.sourceId, newHash);
    return { ...base, outcome: "unrelated", detail: `無関係: ${relevance.reason}` };
  }

  // 6. ニュース生成（AI, 供給テキストのみ）
  const news = await generateNews(source, diff.summary, extracted.text, deps.generateCaller);
  if (!news) {
    if (changeId)
      await setChangeProcessed(admin, changeId, relevance.relevance, relevance.confidence, "processed");
    await markChanged(admin, source.sourceId, newHash);
    return { ...base, outcome: "review", detail: "生成失敗（変更のみ記録・レビュー要）" };
  }

  const groundingOk = checkGrounding(news, extracted.text);

  // 7. 重複判定（決定的）
  const eventKey = buildEventKey(source, news);
  const slug = buildSlug(source, news);
  const newsContentHash = contentHash(`${news.title}\n${news.summary}\n${news.whatChanged}`);
  const existingKeys = await getExistingNewsKeys(admin, source.url);
  const duplicate = isDuplicate(
    { eventKey, contentHash: newsContentHash, sourceUrl: source.url },
    existingKeys,
  );

  // 8. 公開ポリシー
  const decision = decidePublication({
    source,
    riskLevel: source.riskLevel,
    relevance: relevance.relevance,
    confidence: Math.min(relevance.confidence, news.confidence || relevance.confidence),
    groundingOk,
    meaningfulChange: meaningful,
    isDuplicate: duplicate,
    sourceUrl: source.url,
  });

  // 9. 記事影響分析（決定的・自動書換えはしない）
  const impacts = analyzeArticleImpact(source, getIndexableArticles());
  const relatedArticleIds = impacts
    .filter((i) => i.impactLevel !== "unaffected")
    .map((i) => i.articleId);
  const relatedGuideSlug =
    impacts.length > 0 ? impacts[0].articleUrl.replace("/guides/", "") : null;

  if (duplicate) {
    if (changeId)
      await setChangeProcessed(admin, changeId, relevance.relevance, relevance.confidence, "processed");
    await markChanged(admin, source.sourceId, newHash);
    return { ...base, outcome: "duplicate", detail: "既存ニュースと重複（スキップ）" };
  }

  const today = new Date().toISOString().slice(0, 10);
  const newsId = await insertNews(admin, {
    slug,
    news,
    source,
    riskLevel: source.riskLevel,
    changeGroup: source.changeGroup,
    category: source.category,
    detectedAt: new Date().toISOString(),
    verifiedAt: today,
    snapshotId,
    changeId,
    contentHash: newsContentHash,
    eventKey,
    relatedArticleIds,
    relatedGuideSlug,
    publicationMode: decision.mode,
    status: decision.status,
  });

  const impactCount = await insertArticleImpacts(admin, changeId, newsId, impacts);

  // 10. 自動公開時のみ AI インデックスを（変更コンテンツだけ）更新
  let indexed = false;
  if (decision.status === "published") {
    try {
      const r = await indexPublishedNews({
        slug,
        title: news.title,
        summary: news.summary,
        whatChanged: news.whatChanged,
        whoIsAffected: news.whoIsAffected,
        whatToDo: news.whatToDo,
        category: source.category,
        riskLevel: source.riskLevel,
        updatedAt: new Date().toISOString(),
      });
      indexed = r === "indexed";
    } catch {
      indexed = false;
    }
  }

  if (changeId)
    await setChangeProcessed(admin, changeId, relevance.relevance, relevance.confidence, "processed");
  await markChanged(admin, source.sourceId, newHash);

  return {
    ...base,
    outcome: decision.status === "published" ? "auto_published" : "review",
    detail:
      decision.status === "published"
        ? "自動公開"
        : `レビュー要求: ${decision.reasons.join(" / ")}`,
    newsSlug: slug,
    impacts: impactCount,
    indexed,
  };
}

/** 有効なソースをすべて処理する。 */
export async function runMonitor(deps: PipelineDeps = {}): Promise<{
  ok: boolean;
  error?: string;
  results: SourceResult[];
}> {
  const admin = getMonitorAdmin();
  if (!admin) {
    return {
      ok: false,
      error: "Supabase service-role env is not configured.",
      results: [],
    };
  }

  const results: SourceResult[] = [];
  const sources = getEnabledSources();
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    try {
      results.push(await processSource(admin, source, deps));
    } catch (err) {
      results.push({
        sourceId: source.sourceId,
        organisation: source.organisation,
        sourceName: source.sourceName,
        outcome: "failure",
        detail: `例外: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
    if (i < sources.length - 1 && monitorConfig.sourceDelayMs > 0) {
      await new Promise((r) => setTimeout(r, monitorConfig.sourceDelayMs));
    }
  }
  return { ok: true, results };
}
