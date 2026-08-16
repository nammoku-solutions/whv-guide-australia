/**
 * 自然言語クエリから「構造化フィルタ」を抽出する（掲載検索用）。
 *
 * 重要な方針:
 *   - ここで抽出した値は既存の型付きフィルタ（lib/listings.ts の ListingFilters）
 *     にのみ渡す。任意のSQL断片は作らない・実行しない。
 *   - 抽出できない項目は undefined のままにし、SQL/後段の数値フィルタに委ねる。
 */

export type ParsedListingQuery = {
  location?: string;
  state?: string;
  /** 金額の上限（"以下/未満/まで"）。rent/price は呼び出し側が用途に割り当てる。 */
  maxAmount?: number;
  /** 金額の下限（"以上/から"）。 */
  minAmount?: number;
  transmission?: "automatic" | "manual";
  make?: string;
  coupleAllowed?: boolean;
  roomType?: "private" | "shared";
};

const STATE_CODES = ["QLD", "NSW", "VIC", "SA", "WA", "TAS", "NT", "ACT"];

/** 主要都市/州のカタカナ表記 → 検索用文字列（location ilike 用）。 */
const KATAKANA_PLACE: Record<string, string> = {
  ブリスベン: "Brisbane",
  シドニー: "Sydney",
  メルボルン: "Melbourne",
  パース: "Perth",
  アデレード: "Adelaide",
  ケアンズ: "Cairns",
  ダーウィン: "Darwin",
  ゴールドコースト: "Gold Coast",
  キャンベラ: "Canberra",
  ホバート: "Hobart",
  タウンズビル: "Townsville",
  バンダバーグ: "Bundaberg",
};

const STATE_KATAKANA: Record<string, string> = {
  クイーンズランド: "QLD",
  ニューサウスウェールズ: "NSW",
  ビクトリア: "VIC",
  ヴィクトリア: "VIC",
  南オーストラリア: "SA",
  西オーストラリア: "WA",
  タスマニア: "TAS",
};

/** ロケーションとして抽出しないラテン語トークン（ノイズ抑制）。 */
const LATIN_STOPWORDS = new Set([
  "job",
  "jobs",
  "farm",
  "work",
  "rent",
  "room",
  "share",
  "house",
  "car",
  "vehicle",
  "auto",
  "automatic",
  "manual",
  "tfn",
  "abn",
  "visa",
  "whv",
  "at",
  "mt",
  "and",
  "the",
  "in",
  "for",
]);

function normalizeTransmission(q: string): "automatic" | "manual" | undefined {
  if (/(オートマ|ａｔ|\bat\b|automatic|オートマチック)/i.test(q)) return "automatic";
  if (/(マニュアル|ミッション|\bmt\b|manual)/i.test(q)) return "manual";
  return undefined;
}

function extractAmount(q: string): { maxAmount?: number; minAmount?: number } {
  // 例: "週250ドル以下" "6000ドル以下" "$8,000まで" "5000ドル以上"
  const m = q.match(/(?:\$|＄)?\s*([0-9][0-9,，]*)\s*(?:ドル|万円|万|dollars?|\$|＄|k)?/i);
  if (!m) return {};
  const raw = m[1].replace(/[,，]/g, "");
  let amount = Number.parseInt(raw, 10);
  if (!Number.isFinite(amount)) return {};
  // "万" 表記の簡易対応（例: 6万 -> 60000）。
  if (/([0-9][0-9,，]*)\s*万/.test(q)) amount = amount * 10000;
  const isMax = /(以下|未満|まで|以内|より安い|安い)/.test(q);
  const isMin = /(以上|から|より高い)/.test(q);
  if (isMax) return { maxAmount: amount };
  if (isMin) return { minAmount: amount };
  // 明示が無ければ「予算の上限」とみなす（"250ドルの部屋" 等）。
  return { maxAmount: amount };
}

function extractLocation(question: string): { location?: string; state?: string } {
  let state: string | undefined;
  let location: string | undefined;

  // 州コード（大文字の独立トークン）。
  const upper = question.toUpperCase();
  for (const code of STATE_CODES) {
    const re = new RegExp(`\\b${code}\\b`);
    if (re.test(upper)) {
      state = code;
      break;
    }
  }
  // カタカナ州名。
  if (!state) {
    for (const [kana, code] of Object.entries(STATE_KATAKANA)) {
      if (question.includes(kana)) {
        state = code;
        break;
      }
    }
  }

  // カタカナ都市名。
  for (const [kana, place] of Object.entries(KATAKANA_PLACE)) {
    if (question.includes(kana)) {
      location = place;
      break;
    }
  }

  // ラテン語の地名候補（先頭大文字・2文字以上）。州コードは除外。
  if (!location) {
    const tokens = question.match(/[A-Za-z][A-Za-z'-]{2,}(?:\s[A-Z][A-Za-z'-]+)?/g) ?? [];
    for (const t of tokens) {
      const low = t.toLowerCase().trim();
      if (LATIN_STOPWORDS.has(low)) continue;
      if (STATE_CODES.includes(t.toUpperCase())) continue;
      location = t.trim();
      break;
    }
  }

  return { location, state };
}

export function parseListingQuery(question: string): ParsedListingQuery {
  const q = question.toLowerCase();
  const { location, state } = extractLocation(question);
  const { maxAmount, minAmount } = extractAmount(question);
  const transmission = normalizeTransmission(question);

  const parsed: ParsedListingQuery = {};
  if (location) parsed.location = location;
  if (state) parsed.state = state;
  if (maxAmount != null) parsed.maxAmount = maxAmount;
  if (minAmount != null) parsed.minAmount = minAmount;
  if (transmission) parsed.transmission = transmission;

  if (/(カップル|couple|二人|ふたり)/i.test(q)) parsed.coupleAllowed = true;
  if (/(個室|private room|プライベート)/i.test(q)) parsed.roomType = "private";
  else if (/(シェアルーム|相部屋|shared room)/i.test(q)) parsed.roomType = "shared";

  return parsed;
}

/** 掲載サブ意図の判定（求人 / 住居 / 車 / 一般売買）。 */
export type ListingIntent = "job" | "housing" | "vehicle" | "marketplace" | "unknown";

export function detectListingIntent(question: string): ListingIntent {
  const q = question.toLowerCase();
  if (/(車|car|vehicle|自動車|中古車|rego|オートマ|マニュアル)/i.test(q)) return "vehicle";
  if (/(部屋|家|シェアハウス|シェア|住|room|house|rent|家賃|roommate|ルームメイト|物件)/i.test(q))
    return "housing";
  if (/(求人|仕事|バイト|アルバイト|募集|ファーム|farm|job|働ける|働き口|雇用)/i.test(q))
    return "job";
  if (/(売って|売ります|譲り|中古|marketplace|出品)/i.test(q)) return "marketplace";
  return "unknown";
}
