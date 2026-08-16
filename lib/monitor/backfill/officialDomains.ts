/**
 * 手動シード用の公式ドメイン検証・URL 正規化・レジストリソース解決。
 *
 * 手動シードを「任意 URL の取り込み」にしないための境界。許可リストは既存の
 * 公式ソースレジストリ（lib/monitor/registry.ts）から導出する。政府（*.gov.au）以外や
 * SNS・ブログ・アグリゲータ・移民エージェント・短縮 URL は拒否する。
 */

import { officialSources } from "../registry";
import type { SourceDefinition } from "../types";

/** オーストラリアの州/準州ラベル（州ドメインの登録可能名を判定するため）。 */
const STATE_LABELS = new Set(["nsw", "vic", "qld", "sa", "wa", "tas", "act", "nt"]);

/** 除去するトラッキング系クエリパラメータ。 */
const TRACKING_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id",
  "fbclid", "gclid", "gclsrc", "dclid", "msclkid", "mc_cid", "mc_eid",
  "ref", "ref_src", "_hsenc", "_hsmi", "igshid", "ncid", "cmpid",
]);

/**
 * *.gov.au ホストの「登録可能ドメイン」を返す。
 * 例: immi.homeaffairs.gov.au -> homeaffairs.gov.au / www.service.nsw.gov.au -> nsw.gov.au
 * gov.au 以外は null。
 */
export function officialRegistrableDomain(host: string): string | null {
  const h = host.toLowerCase().replace(/\.$/, "");
  const parts = h.split(".");
  const n = parts.length;
  if (n < 3) return null;
  if (parts[n - 1] !== "au" || parts[n - 2] !== "gov") return null;
  const third = parts[n - 3];
  // 州ドメイン（例: nsw.gov.au 配下）は州名までを登録可能ドメインとみなす。
  if (STATE_LABELS.has(third)) return `${third}.gov.au`;
  // 連邦系（例: homeaffairs.gov.au）はラベル 1 つ + gov.au。
  return `${parts[n - 3]}.gov.au`;
}

/** レジストリから導出した、許可する登録可能ドメイン集合。 */
export function allowedRegistrableDomains(): Set<string> {
  const set = new Set<string>();
  for (const s of officialSources) {
    try {
      const d = officialRegistrableDomain(new URL(s.url).host);
      if (d) set.add(d);
    } catch {
      /* ignore malformed registry url */
    }
  }
  return set;
}

/** ホストが公式許可リストに属するか。 */
export function isOfficialHost(host: string): boolean {
  const d = officialRegistrableDomain(host);
  return d != null && allowedRegistrableDomains().has(d);
}

export type UrlValidation =
  | { ok: true; url: string; host: string }
  | { ok: false; error: "INVALID_URL" | "INVALID_SOURCE"; detail: string };

/**
 * URL を正規化し、公式ドメインか検証する。
 * - http/https のみ許可。公式ドメインは https に統一。
 * - フラグメント・トラッキングパラメータを除去。末尾スラッシュを正規化。
 * - 機能的パラメータ（itemId 等）は保持し、ターゲットは変えない。
 */
export function validateAndCanonicalise(raw: string): UrlValidation {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { ok: false, error: "INVALID_URL", detail: `URL を解釈できません: ${raw}` };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, error: "INVALID_URL", detail: `http/https 以外は不可: ${u.protocol}` };
  }
  const host = u.hostname.toLowerCase();
  if (!isOfficialHost(host)) {
    return {
      ok: false,
      error: "INVALID_SOURCE",
      detail: `公式ソース許可リスト（*.gov.au 由来）に含まれないドメインです: ${host}`,
    };
  }
  // 公式は https に統一。
  u.protocol = "https:";
  u.hostname = host;
  u.hash = "";
  // トラッキングパラメータを除去（機能的パラメータは保持）。
  for (const key of [...u.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) u.searchParams.delete(key);
  }
  // 末尾スラッシュを正規化（ルート以外）。
  if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
    u.pathname = u.pathname.replace(/\/+$/, "");
  }
  return { ok: true, url: u.toString(), host };
}

/** 最終リダイレクト先が公式か（fetch 後の検証）。 */
export function isOfficialFinalUrl(finalUrl: string): boolean {
  try {
    return isOfficialHost(new URL(finalUrl).hostname);
  } catch {
    return false;
  }
}

/**
 * URL に対応するレジストリソースを解決する。
 * 同一ホスト優先、次に同一登録可能ドメインで最長パス前方一致、無ければ同ドメインの先頭。
 */
export function resolveOfficialSource(url: string): SourceDefinition | null {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return null;
  }
  const host = target.hostname.toLowerCase();
  const domain = officialRegistrableDomain(host);
  if (!domain) return null;

  const enabled = officialSources.filter((s) => s.enabled);
  const sameDomain = enabled.filter((s) => {
    try {
      return officialRegistrableDomain(new URL(s.url).host) === domain;
    } catch {
      return false;
    }
  });
  if (sameDomain.length === 0) return null;

  // 最長のパス前方一致を選ぶ。
  const targetSegs = target.pathname.toLowerCase().split("/").filter(Boolean);
  let best: { source: SourceDefinition; score: number } | null = null;
  for (const s of sameDomain) {
    let score = 0;
    try {
      const segs = new URL(s.url).pathname.toLowerCase().split("/").filter(Boolean);
      const n = Math.min(segs.length, targetSegs.length);
      for (let i = 0; i < n; i++) {
        if (segs[i] === targetSegs[i]) score++;
        else break;
      }
    } catch {
      /* ignore */
    }
    if (!best || score > best.score) best = { source: s, score };
  }
  // 一致が無ければ同ドメインの先頭（＝多くの場合そのソースの高リスク定義＝安全側）。
  return best?.source ?? sameDomain[0];
}
