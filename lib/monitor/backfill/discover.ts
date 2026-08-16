/**
 * 歴史的候補の探索オーケストレーション。有効なソースを走査し、historical 設定を持つ
 * ソースのみアダプタで探索する。設定の無いソースは unsupported として明示的に記録する
 * （取得失敗を「ニュースなし」に丸めない）。
 *
 * 政府サイトへの敬意ある取得: ソース間に遅延を入れ、同時実行はしない（逐次）。
 */

import { monitorConfig } from "../config";
import { getEnabledSources } from "../registry";
import { buildAdapter } from "./adapters";
import type { AdapterDeps, SourceDiscovery } from "./types";

async function sleep(ms: number): Promise<void> {
  if (ms > 0) await new Promise((r) => setTimeout(r, ms));
}

/** すべての有効ソースについて歴史的候補を探索する。 */
export async function discoverAll(
  from: string,
  to: string,
  deps: AdapterDeps = {},
): Promise<SourceDiscovery[]> {
  const sources = getEnabledSources();
  const results: SourceDiscovery[] = [];

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    const adapter = buildAdapter(source);

    if (!adapter) {
      const reason =
        source.historical?.method === "unsupported"
          ? source.historical.reason
          : "現在の状態ページのみ（歴史的アーカイブ/フィード未設定）。";
      results.push({
        sourceId: source.sourceId,
        organisation: source.organisation,
        sourceType: "none",
        status: "unsupported",
        detail: `historical_backfill_unsupported: ${reason}`,
        candidates: [],
      });
      continue;
    }

    try {
      results.push(await adapter.discoverEntries(from, to, deps));
    } catch (err) {
      results.push({
        sourceId: source.sourceId,
        organisation: source.organisation,
        sourceType: "none",
        status: "unexpected_structure",
        detail: `例外: ${err instanceof Error ? err.message : String(err)}`,
        candidates: [],
      });
    }

    // 敬意ある取得のためソース間で待機（最後のソースは待たない）。
    if (i < sources.length - 1) await sleep(monitorConfig.sourceDelayMs);
  }

  return results;
}
