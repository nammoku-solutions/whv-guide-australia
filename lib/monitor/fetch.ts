/**
 * 公式ページ / フィードの取得。ドメイン全体はクロールしない。1 ソース＝1 URL のみ。
 * 失敗種別を厳密に分類する（fetch 失敗を決して「変更なし」に丸めない）。
 */

import { monitorConfig } from "./config";
import type { FetchResult } from "./types";

const USER_AGENT =
  "WHV-Guide-Australia-Monitor/1.0 (+https://whv-guide; official-source change monitor)";

/**
 * 単一 URL を取得する。タイムアウト・HTTP エラー・ブロック（403/429）を区別する。
 * @param fetchImpl テスト用に fetch を差し替え可能。
 */
export async function fetchSource(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), monitorConfig.fetchTimeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml,application/rss+xml,application/atom+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-AU,en;q=0.9",
      },
      signal: controller.signal,
    });

    if (res.status === 403 || res.status === 429) {
      return { status: "blocked", httpStatus: res.status };
    }
    if (!res.ok) {
      return { status: "http_error", httpStatus: res.status };
    }

    const contentType = res.headers.get("content-type") ?? "";
    let raw: string;
    try {
      raw = await res.text();
    } catch {
      return { status: "parse_error", httpStatus: res.status };
    }
    if (!raw || raw.trim().length === 0) {
      return { status: "unexpected_structure", httpStatus: res.status };
    }
    return { status: "success", httpStatus: res.status, raw, contentType, finalUrl: res.url };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (err instanceof Error && err.name === "AbortError") {
      return { status: "timeout", error: msg };
    }
    return { status: "http_error", error: msg };
  } finally {
    clearTimeout(timer);
  }
}
