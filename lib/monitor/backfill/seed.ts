/**
 * 手動シード（Manual Seed）取り込み。オペレータが公式 URL（と必要に応じて公式本文）を
 * 与え、既存の歴史的バックフィルパイプライン（processCandidate）に流し込む。
 *
 * 別系統のニュース生成器は作らない。関連度・grounding・dedupe・リスク・記事影響・
 * 公開ポリシー・AI 索引はすべて既存の共有規則を再利用する。live-monitor のベースライン
 * （monitor_source_state / snapshots / changes）には一切触れない。
 *
 * Bot 保護の回避（UA 偽装・CAPTCHA/Cloudflare 回避・プロキシ・ステルスブラウザ）は行わない。
 * 取得が blocked/timeout の場合は、オペレータが content を貼り付ける Manual Content Mode を案内する。
 */

import { getIndexableArticles } from "@/lib/ai/content-source";
import { newsItems as manualNews } from "@/lib/newsData";
import type { SupabaseClient } from "@supabase/supabase-js";
import { monitorConfig } from "../config";
import { fetchSource } from "../fetch";
import { extractHtml } from "../extract";
import { indexPublishedNews } from "../indexNews";
import type { ModelCaller } from "../gemini";
import type { RiskLevel, Relevance, SourceDefinition } from "../types";
import { parseOfficialDate } from "./dates";
import {
  validateAndCanonicalise,
  isOfficialFinalUrl,
  resolveOfficialSource,
} from "./officialDomains";
import {
  processCandidate,
  tallyStats,
  resolveWriteReadiness,
  emptyStats,
  type ProcessContext,
} from "./pipeline";
import {
  getBackfillAdmin,
  createRun,
  completeRun,
  getAllNewsKeys,
  type BackfillOrigin,
} from "./db";
import type { ManualNewsKey } from "./dedupe";
import type {
  AdapterDeps,
  CandidateResult,
  HistoricalCandidate,
} from "./types";

/** シードの最小本文長（意味のある根拠を要求）。 */
const SEED_MIN_CONTENT = 120;

/** オペレータが与える 1 シード。 */
export type SeedInput = {
  url: string;
  /** 取得で復元できないときの公式タイトル。 */
  title?: string | null;
  /** 取得で復元できないときの公式公開日（YYYY-MM-DD 等）。 */
  publishedAt?: string | null;
  /** 取得がブロックされたときのフォールバック公式本文。 */
  content?: string | null;
};

export type SeedMode = "url_fetch" | "manual_content" | "invalid";

/** シード 1 件の結果種別。 */
export type SeedResult =
  | CandidateResult
  | "invalid_url"
  | "invalid_source"
  | "fetch_blocked"
  | "timeout"
  | "missing_title"
  | "missing_content"
  | "invalid_date"
  | "out_of_range";

export type SeedResultRow = {
  inputUrl: string;
  canonicalUrl?: string;
  organisation?: string;
  title?: string;
  officialDate?: string;
  riskLevel?: RiskLevel;
  relevance?: Relevance;
  mode: SeedMode;
  result: SeedResult;
  detail: string;
  slug?: string;
  impacts?: number;
  indexed?: boolean;
};

export type SeedReport = {
  from?: string;
  to?: string;
  mode: "dry_run" | "apply";
  totalSeeds: number;
  publishedCount: number;
  reviewRequiredCount: number;
  duplicateCount: number;
  skippedCount: number;
  invalidCount: number;
  fetchFailedCount: number;
  errorCount: number;
  impactsCreated: number;
  indexedCount: number;
  liveMonitorBaselineUntouched: boolean;
  runId?: string | null;
  seeds: SeedResultRow[];
  notes: string[];
};

export type SeedDeps = AdapterDeps & {
  classifyCaller?: ModelCaller;
  generateCaller?: ModelCaller;
  admin?: SupabaseClient | null;
  indexNews?: typeof indexPublishedNews;
};

export type RunSeedOptions = {
  seeds: SeedInput[];
  from?: string;
  to?: string;
  mode: "dry_run" | "apply";
  deps?: SeedDeps;
};

/** 取得した HTML から公式メタデータ（タイトル・日付・本文）を best-effort で抽出する。 */
export function extractSeedMetadata(rawHtml: string): {
  title?: string;
  publishedAt?: string;
  content: string;
} {
  const content = extractHtml(rawHtml).text;

  // タイトル: og:title -> <title> -> <h1>
  let title: string | undefined;
  const og = rawHtml.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  if (og) title = decode(og[1]);
  if (!title) {
    const t = rawHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (t) title = decode(t[1].replace(/<[^>]+>/g, " "));
  }
  if (!title) {
    const h1 = rawHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1) title = decode(h1[1].replace(/<[^>]+>/g, " "));
  }
  title = title?.replace(/\s+/g, " ").trim() || undefined;

  // 日付: article:published_time -> meta[name=date] -> <time datetime> -> "Last updated"
  let publishedAt: string | undefined;
  const candidates: string[] = [];
  const pub = rawHtml.match(/<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i);
  if (pub) candidates.push(pub[1]);
  const metaDate = rawHtml.match(/<meta[^>]+name=["'](?:date|dcterms\.date|dc\.date)["'][^>]+content=["']([^"']+)["']/i);
  if (metaDate) candidates.push(metaDate[1]);
  const time = rawHtml.match(/<time[^>]+datetime=["']([^"']+)["']/i);
  if (time) candidates.push(time[1]);
  const lastUpdated = rawHtml.match(/last updated[:\s]*([0-9]{1,2}\s+[A-Za-z]{3,9}\.?\s+[0-9]{4}|[0-9]{4}-[0-9]{2}-[0-9]{2})/i);
  if (lastUpdated) candidates.push(lastUpdated[1]);
  for (const c of candidates) {
    const iso = parseOfficialDate(c);
    if (iso) {
      publishedAt = iso;
      break;
    }
  }

  return { title, publishedAt, content };
}

function decode(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#8211;|&ndash;/g, "-")
    .trim();
}

type SeedBuild =
  | {
      ok: true;
      candidate: HistoricalCandidate;
      source: SourceDefinition;
      canonicalUrl: string;
      mode: SeedMode;
    }
  | {
      ok: false;
      result: SeedResult;
      mode: SeedMode;
      canonicalUrl?: string;
      source?: SourceDefinition;
      detail: string;
    };

const FETCH_FALLBACK_HINT =
  "Manual Content Mode を使ってください（シードに title / publishedAt / content を指定）。";

/**
 * 1 シードから HistoricalCandidate を構築する。URL 検証 → 取得優先 → 失敗時は
 * オペレータ提供の content にフォールバック。日付/タイトルは決して推測しない。
 */
export async function buildCandidateFromSeed(
  seed: SeedInput,
  opts: { from?: string; to?: string; importedAt: string },
  deps: SeedDeps,
): Promise<SeedBuild> {
  // 1. URL 検証 + 正規化。
  const v = validateAndCanonicalise(seed.url ?? "");
  if (!v.ok) {
    return {
      ok: false,
      mode: "invalid",
      result: v.error === "INVALID_URL" ? "invalid_url" : "invalid_source",
      detail:
        v.error === "INVALID_URL"
          ? `INVALID_URL: ${v.detail}`
          : `INVALID_SOURCE: ${v.detail}`,
    };
  }
  const canonicalUrl = v.url;
  const source = resolveOfficialSource(canonicalUrl);
  if (!source) {
    return { ok: false, mode: "invalid", result: "invalid_source", canonicalUrl, detail: "INVALID_SOURCE: 対応するレジストリソースがありません。" };
  }

  const providedContent = (seed.content ?? "").trim();
  const providedTitle = (seed.title ?? "").trim();
  const providedDateRaw = (seed.publishedAt ?? "").trim();

  let title = providedTitle || undefined;
  let dateIso: string | undefined;
  let content = "";
  let mode: SeedMode;

  if (providedContent) {
    // --- Manual Content Mode（オペレータ提供本文を公式の書き起こしとして扱う） ---
    mode = "manual_content";
    if (!title) {
      return { ok: false, mode, result: "missing_title", canonicalUrl, source, detail: "MISSING_OFFICIAL_TITLE: content 指定時は title を必ず与えてください。" };
    }
    if (!providedDateRaw) {
      return { ok: false, mode, result: "invalid_date", canonicalUrl, source, detail: "MISSING_OFFICIAL_DATE: content 指定時は publishedAt を必ず与えてください。" };
    }
    const iso = parseOfficialDate(providedDateRaw);
    if (!iso) {
      return { ok: false, mode, result: "invalid_date", canonicalUrl, source, detail: `INVALID_DATE: publishedAt を解釈できません（${providedDateRaw}）。` };
    }
    dateIso = iso;
    if (providedContent.length < SEED_MIN_CONTENT) {
      return { ok: false, mode, result: "missing_content", canonicalUrl, source, detail: `CONTENT_TOO_SHORT: 本文が短すぎます（${providedContent.length} < ${SEED_MIN_CONTENT} 文字）。` };
    }
    content = providedContent.slice(0, monitorConfig.maxContentChars);
  } else {
    // --- URL Fetch Mode（既存 fetchSource を使用。Bot 保護の回避はしない） ---
    mode = "url_fetch";
    const fetched = await fetchSource(canonicalUrl, deps.fetchImpl);
    if (fetched.status !== "success" || !fetched.raw) {
      const result: SeedResult = fetched.status === "timeout" ? "timeout" : "fetch_blocked";
      const label = fetched.status === "timeout" ? "TIMEOUT" : "FETCH_BLOCKED";
      return {
        ok: false,
        mode,
        result,
        canonicalUrl,
        source,
        detail: `${label}: 公式ページを取得できません（${fetched.status}）。${FETCH_FALLBACK_HINT}`,
      };
    }
    // リダイレクト先が非公式ならブロック（最終 URL を検証）。
    if (fetched.finalUrl && !isOfficialFinalUrl(fetched.finalUrl)) {
      return { ok: false, mode, result: "invalid_source", canonicalUrl, source, detail: "INVALID_SOURCE: リダイレクト先が公式ドメインではありません。" };
    }
    const meta = extractSeedMetadata(fetched.raw);
    title = providedTitle || meta.title;
    if (!title) {
      return { ok: false, mode, result: "missing_title", canonicalUrl, source, detail: `MISSING_OFFICIAL_TITLE: ページからタイトルを抽出できません。シードに title を指定してください。` };
    }
    const dateRaw = providedDateRaw || meta.publishedAt || "";
    const iso = parseOfficialDate(dateRaw);
    if (!iso) {
      return { ok: false, mode, result: "invalid_date", canonicalUrl, source, detail: `MISSING_OFFICIAL_DATE: ページの日付を抽出できません。シードに publishedAt を指定してください。` };
    }
    dateIso = iso;
    if (!meta.content || meta.content.trim().length < SEED_MIN_CONTENT) {
      return { ok: false, mode, result: "missing_content", canonicalUrl, source, detail: `CONTENT_TOO_SHORT: 本文を十分に抽出できません。シードに content を指定してください。${FETCH_FALLBACK_HINT}` };
    }
    content = meta.content.slice(0, monitorConfig.maxContentChars);
  }

  // 2. 範囲チェック（明示された場合のみ）。
  if ((opts.from && dateIso < opts.from) || (opts.to && dateIso > opts.to)) {
    return { ok: false, mode, result: "out_of_range", canonicalUrl, source, detail: `OUT_OF_RANGE: 公式日 ${dateIso} は指定範囲 ${opts.from ?? "-"}〜${opts.to ?? "-"} 外です。` };
  }

  const candidate: HistoricalCandidate = {
    sourceId: source.sourceId,
    sourceOrganisation: source.organisation,
    registrySourceUrl: source.url,
    officialTitle: title,
    officialUrl: canonicalUrl,
    officialPublishedAt: dateIso,
    content,
    sourceType: "archive",
    discoveredAt: opts.importedAt,
    historicalRangeFrom: opts.from ?? dateIso,
    historicalRangeTo: opts.to ?? dateIso,
  };
  return { ok: true, candidate, source, canonicalUrl, mode };
}

/** バッチ耐性のある手動シード実行。1 件の失敗が他を止めない。 */
export async function runSeedBackfill(opts: RunSeedOptions): Promise<SeedReport> {
  const { seeds, from, to, mode } = opts;
  const deps = opts.deps ?? {};
  const notes: string[] = [];

  const admin = deps.admin !== undefined ? deps.admin : getBackfillAdmin();
  const indexImpl = deps.indexNews ?? indexPublishedNews;
  const { willWrite, hasOrigin } = await resolveWriteReadiness(mode, admin, notes);
  const origin: BackfillOrigin | undefined = hasOrigin ? "manual_seed" : undefined;

  const manualKeys: ManualNewsKey[] = manualNews
    .filter((n) => n.published)
    .map((n) => ({ title: n.title, sourceUrl: n.source?.url, date: n.date }));
  const dbKeys = willWrite && admin ? await getAllNewsKeys(admin) : [];

  const importedAt = new Date().toISOString();
  const runFrom = from ?? importedAt.slice(0, 10);
  const runTo = to ?? importedAt.slice(0, 10);
  const runId =
    willWrite && admin ? await createRun(admin, runFrom, runTo, mode, origin) : null;

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

  const stats = emptyStats();
  const rows: SeedResultRow[] = [];

  for (const seed of seeds) {
    try {
      const build = await buildCandidateFromSeed(seed, { from, to, importedAt }, deps);
      if (!build.ok) {
        rows.push({
          inputUrl: seed.url,
          canonicalUrl: build.canonicalUrl,
          organisation: build.source?.organisation,
          riskLevel: build.source?.riskLevel,
          mode: build.mode,
          result: build.result,
          detail: build.detail,
        });
        continue;
      }
      const { row, relevant } = await processCandidate(build.source, build.candidate, ctx);
      tallyStats(stats, row, relevant);
      rows.push({
        inputUrl: seed.url,
        canonicalUrl: build.canonicalUrl,
        organisation: row.organisation,
        title: row.title,
        officialDate: row.officialDate,
        riskLevel: row.riskLevel,
        relevance: row.relevance,
        mode: build.mode,
        result: row.result,
        detail: row.detail,
        slug: row.slug,
        impacts: row.impacts,
        indexed: row.indexed,
      });
    } catch (err) {
      stats.errorCount++;
      rows.push({
        inputUrl: seed.url,
        mode: "invalid",
        result: "error",
        detail: `例外: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // 集計（シード固有の失敗種別を含む）。
  const invalidCount = rows.filter((r) => r.result === "invalid_url" || r.result === "invalid_source").length;
  const fetchFailedCount = rows.filter(
    (r) =>
      r.result === "fetch_blocked" ||
      r.result === "timeout" ||
      r.result === "missing_title" ||
      r.result === "missing_content" ||
      r.result === "invalid_date" ||
      r.result === "out_of_range",
  ).length;

  if (willWrite && admin && runId) {
    // 実行監査（RunStats 形状にマッピング）。
    await completeRun(
      admin,
      runId,
      {
        sourcesChecked: seeds.length,
        sourcesSupported: rows.filter((r) => r.mode !== "invalid").length,
        sourcesUnsupported: invalidCount,
        candidatesDiscovered: rows.filter((r) => r.officialDate != null).length,
        candidatesRelevant: stats.candidatesRelevant,
        publishedCount: stats.publishedCount,
        reviewRequiredCount: stats.reviewRequiredCount,
        duplicateCount: stats.duplicateCount,
        skippedCount: stats.skippedCount + fetchFailedCount,
        errorCount: stats.errorCount,
        impactsCreated: stats.impactsCreated,
        indexedCount: stats.indexedCount,
      },
      "completed",
      notes.join(" | "),
    );
  }

  // 公式日で並べ替え（新しい順・未確定は末尾）。
  rows.sort((a, b) => {
    const da = a.officialDate ?? "";
    const db = b.officialDate ?? "";
    return da < db ? 1 : da > db ? -1 : 0;
  });

  return {
    from,
    to,
    mode,
    totalSeeds: seeds.length,
    publishedCount: stats.publishedCount,
    reviewRequiredCount: stats.reviewRequiredCount,
    duplicateCount: stats.duplicateCount,
    skippedCount: stats.skippedCount,
    invalidCount,
    fetchFailedCount,
    errorCount: stats.errorCount,
    impactsCreated: stats.impactsCreated,
    indexedCount: stats.indexedCount,
    // このパイプラインは live-monitor テーブルに書き込まないため常に true。
    liveMonitorBaselineUntouched: true,
    runId,
    seeds: rows,
    notes,
  };
}
