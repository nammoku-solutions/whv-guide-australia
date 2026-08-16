/**
 * 直近の公式アップデート・ケイパビリティ。
 *
 * 方針:
 *   - 事前学習の一般知識で「最近の変更」を語らせない。公開済みの検証済みニュース
 *     （lib/news の published のみ）＋ 公式ソース監視状態（monitor_source_state）を
 *     根拠にする。記事RAGは pipeline 側で MIXED として併用する。
 *   - 「最近重要な更新はない」と言えるのは、監視が実際に稼働（最近チェック済み）
 *     している場合のみ。監視状態が不明なら断定しない。
 */

import { getAllNews } from "@/lib/news";
import { getNewsCategoryLabel } from "@/lib/news";
import { getAiAdminClient } from "../server/supabaseAdmin";
import { aiConfig } from "../config";
import { actions as trustedActions, newsDetailUrl } from "../actions";
import type { Evidence, StructuredCard } from "../types";
import { emptyResult, type CapabilityResult } from "./types";

/** 監視が最近（この日数以内）にチェックされていれば「稼働中」とみなす。 */
const MONITOR_FRESH_DAYS = 14;

async function monitorRecentlyChecked(): Promise<boolean | null> {
  const admin = getAiAdminClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from("monitor_source_state")
    .select("last_checked")
    .order("last_checked", { ascending: false })
    .limit(1);
  if (error) return null;
  const latest = (data as { last_checked: string | null }[] | null)?.[0]?.last_checked;
  if (!latest) return false;
  const ageDays = (Date.now() - new Date(latest).getTime()) / 86_400_000;
  return ageDays <= MONITOR_FRESH_DAYS;
}

export async function getCurrentOfficialUpdates(): Promise<CapabilityResult> {
  if (!aiConfig.features.currentUpdatesEnabled) return emptyResult("getCurrentOfficialUpdates");

  const limit = aiConfig.structured.maxNewsUpdates;
  // 公開済みニュースのうち、ビザ・税を優先しつつ新しい順。
  const all = getAllNews();
  const prioritized = [
    ...all.filter((n) => n.category === "visa" || n.category === "tax"),
    ...all.filter((n) => n.category !== "visa" && n.category !== "tax"),
  ].slice(0, limit);

  const monitorFresh = await monitorRecentlyChecked();

  const cards: StructuredCard[] = prioritized.map((n) => ({
    kind: "news",
    id: n.slug,
    title: n.title,
    date: n.date,
    category: getNewsCategoryLabel(n.category),
    url: newsDetailUrl(n.slug),
  }));

  const monitorNote =
    monitorFresh === true
      ? "公式ソースの自動監視は最近稼働しています。"
      : monitorFresh === false
        ? "公式ソースの自動監視状態が最新でないため、重要な更新が無いとは断定できません。"
        : "";

  const evidence: Evidence[] = prioritized.map((n) => ({
    kind: "official_update",
    visibility: "public",
    title: n.title,
    content: `[${getNewsCategoryLabel(n.category)}｜${n.date}] ${n.summary}`,
    url: newsDetailUrl(n.slug),
    sourceId: `news:${n.slug}`,
    freshness: n.date,
    riskLevel: n.category === "visa" || n.category === "tax" ? "high" : "medium",
    metadata: { category: n.category },
  }));

  // 監視状態を非公開の補助エビデンスとして添える（断定制御用）。
  evidence.push({
    kind: "official_update",
    visibility: "public",
    title: "監視状態",
    content:
      (prioritized.length === 0
        ? "現在、サイトに掲載された最近の公式アップデート記事はありません。"
        : `最近の公式アップデート（サイト掲載）は ${prioritized.length} 件あります。`) +
      (monitorNote ? ` ${monitorNote}` : ""),
    url: null,
    sourceId: "capability:monitorState",
    freshness: "live",
    riskLevel: "low",
    metadata: { monitorFresh: monitorFresh ?? "unknown", newsCount: prioritized.length },
  });

  return {
    name: "getCurrentOfficialUpdates",
    evidence,
    cards,
    actions: [trustedActions.officialNews()],
    count: prioritized.length,
  };
}
