import { aiConfig } from "../config";
import type { RetrievalCandidate, RiskLevel } from "../types";
import { getAiAdminClient } from "../server/supabaseAdmin";

/**
 * キーワード / 全文検索（Phase 2）。
 *
 * セマンティック検索が苦手な「完全一致の語」（TFN・ABN・DASP・Rego・417・462・
 * WHV・Superannuation・myGov・Medicare・RSA・RSG・郵便番号 など）に強い。
 * Postgres の全文検索（simple 設定 tsvector）＋ pg_trgm による部分一致（日本語対応）を
 * サーバー側 RPC で実行する。埋め込みと同様、必ず service-role 経由でのみ呼ぶ。
 */

// 日本語クエリからノイズになりやすい助詞・語尾・機能語（長いものから除去）。
const JA_STOPWORDS = [
  "について", "における", "してもらう", "してもらいたい", "したいです",
  "教えてください", "教えて", "ください", "とは", "って", "です", "ます",
  "したい", "して", "する", "なる", "ため", "ので", "けど", "から", "まで",
  "より", "など", "方法", "場合", "違い", "必要", "手順", "やり方", "前に",
  "あと", "どう", "どの", "どこ", "いつ", "なに", "何", "を", "は", "が",
  "に", "で", "と", "の", "へ", "や", "も", "か", "ね", "よ", "な", "こと",
];

// ドメイン用語の相互展開（英略語⇄日本語）。ILIKE は大小無視のため表記ゆれに強い。
const SYNONYMS: Record<string, string[]> = {
  tfn: ["TFN", "タックスファイルナンバー"],
  abn: ["ABN"],
  dasp: ["DASP", "脱退一時金"],
  rego: ["Rego", "登録"],
  ppsr: ["PPSR"],
  "417": ["417"],
  "462": ["462"],
  whv: ["WHV", "ワーホリ", "ワーキングホリデー"],
  "working holiday": ["Working Holiday", "ワーホリ", "ワーキングホリデー"],
  ワーホリ: ["ワーホリ", "ワーキングホリデー", "WHV"],
  ワーキングホリデー: ["ワーキングホリデー", "ワーホリ", "WHV"],
  super: ["Super", "Superannuation", "スーパー"],
  superannuation: ["Superannuation", "スーパー", "Super"],
  スーパー: ["スーパー", "Superannuation", "Super"],
  年金: ["年金", "Superannuation", "Super"],
  mygov: ["myGov"],
  medicare: ["Medicare"],
  rsa: ["RSA"],
  rsg: ["RSG"],
  postcode: ["postcode", "郵便番号"],
  郵便番号: ["郵便番号", "postcode"],
};

const MAX_TERMS = 12;

/** ASCII 英数トークン（略語・数字・visa subclass 等）。長さ2以上。 */
function asciiTokens(query: string): string[] {
  return (query.toLowerCase().match(/[a-z0-9]{2,}/g) ?? []).filter(Boolean);
}

/** 日本語の内容語を抽出（助詞・語尾を除去して分割）。 */
function japaneseTokens(query: string): string[] {
  // ASCII と記号を空白に、続いてストップワードを空白に置換して分割。
  let s = query
    .replace(/[a-zA-Z0-9]+/g, " ")
    .replace(/[、。・「」（）()\s！？!?：:；;／/]+/g, " ");
  for (const w of JA_STOPWORDS) {
    s = s.split(w).join(" ");
  }
  return s
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && /[\u3040-\u30ff\u3400-\u9fff]/.test(t));
}

/** 同義語展開のトリガー判定。 */
function expandSynonyms(query: string, terms: Set<string>): void {
  const lower = query.toLowerCase();
  for (const [key, values] of Object.entries(SYNONYMS)) {
    if (lower.includes(key)) {
      for (const v of values) terms.add(v);
    }
  }
}

/**
 * クエリからキーワード検索用の語を抽出する（決定的・外部API不要）。
 * ASCII 英数トークン＋日本語内容語＋ドメイン同義語を統合し重複排除する。
 */
export function extractKeywordTerms(query: string): string[] {
  const terms = new Set<string>();
  for (const t of asciiTokens(query)) terms.add(t);
  for (const t of japaneseTokens(query)) terms.add(t);
  expandSynonyms(query, terms);

  // 大小無視で重複排除。
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of terms) {
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= MAX_TERMS) break;
  }
  return out;
}

/**
 * 「強い完全一致語」を含むか。ハイブリッド時の接地判定に使う。
 * ASCII 英数トークン（略語・数字）または既知ドメイン用語があれば true。
 * これにより Rego/TFN/417 等の完全一致クエリはキーワードで接地でき、
 * 一般的な日本語NLクエリはセマンティックしきい値で接地判定される。
 */
export function hasStrongKeyword(query: string): boolean {
  if (asciiTokens(query).length > 0) return true;
  const lower = query.toLowerCase();
  return Object.keys(SYNONYMS).some((k) => lower.includes(k));
}

export async function keywordSearch(
  query: string,
): Promise<RetrievalCandidate[]> {
  const admin = getAiAdminClient();
  if (!admin) return [];

  const terms = extractKeywordTerms(query);
  if (terms.length === 0) return [];

  try {
    const { data, error } = await admin.rpc("match_ai_article_chunks_keyword", {
      p_terms: terms,
      p_query: query,
      match_count: aiConfig.retrieval.keywordCandidateCount,
      p_embedding_version: aiConfig.embedding.version,
    });
    if (error) {
      // キーワードRPC未適用（マイグレーション0010前）等では縮退（セマンティックのみ）。
      console.warn("[ai] keywordSearch degraded:", error.message);
      return [];
    }
    const rows = (data ?? []) as Array<{
      chunk_id: string;
      article_id: string;
      title: string;
      slug: string;
      url: string;
      category: string;
      heading: string;
      content: string;
      risk_level: string;
      keyword_score: number;
    }>;
    return rows.map((r) => ({
      chunkId: r.chunk_id,
      articleId: r.article_id,
      title: r.title,
      slug: r.slug,
      url: r.url,
      category: r.category,
      heading: r.heading,
      content: r.content,
      riskLevel: (r.risk_level as RiskLevel) ?? "low",
      score: r.keyword_score,
      source: "keyword" as const,
    }));
  } catch (err) {
    console.warn(
      "[ai] keywordSearch error:",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}
