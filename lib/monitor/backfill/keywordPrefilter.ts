/**
 * WHV 関連の決定的キーワードプレフィルタ。Gemini を呼ぶ前に、明らかに WHV と
 * 無関係な候補を安価に落としてコストを抑える（#22 コスト管理）。
 *
 * ここは「関連あり」を最終判断しない。プレフィルタを通過した候補のみ Gemini の
 * 関連度分類にかける。判定は保守的（迷ったら通す）にし、取りこぼしを避ける。
 */

/** WHV 利用者に関わりうるトピックの語彙（英日）。 */
const KEYWORDS: string[] = [
  // ビザ / 制度
  "working holiday", "work and holiday", "whm", "417", "462",
  "specified work", "second visa", "third visa", "visa condition",
  "visa application charge", "visa pricing", "visa fee", "subclass",
  "ワーキングホリデー", "ワーホリ", "ビザ", "規定労働", "セカンドビザ",
  // 税 / Super / ABN / TFN
  "working holiday maker", "tax rate", "tax return", "tax file number",
  "tfn", "abn", "superannuation", "super ", "dasp", "gig economy",
  "税", "スーパー", "確定申告",
  // 労働 / 賃金
  "minimum wage", "national minimum wage", "award", "casual",
  "employee right", "workplace", "underpay", "underpaid", "pay rate",
  "penalty rate", "visa holder", "migrant worker", "fair work",
  "最低賃金", "賃金", "労働者", "アワード",
  // 生活（車 / 免許 / 住まい / 医療）
  "driver licence", "driver license", "vehicle registration", "rego",
  "tenancy", "rental bond", "reciprocal health", "medicare",
  "免許", "登録", "賃貸", "ボンド", "メディケア",
];

/**
 * 候補が WHV 関連の可能性があるか（プレフィルタ）。タイトル＋要約＋本文先頭を対象に、
 * いずれかのキーワードにヒットすれば通過とする。
 */
export function passesKeywordPrefilter(input: {
  title: string;
  summary?: string;
  content?: string;
}): boolean {
  const hay = `${input.title}\n${input.summary ?? ""}\n${(input.content ?? "").slice(0, 1500)}`.toLowerCase();
  return KEYWORDS.some((k) => hay.includes(k));
}
