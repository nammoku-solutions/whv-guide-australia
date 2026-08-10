/**
 * スコープ判定ヘルパー。このAIはサイト固有アシスタントであり、汎用チャットボット
 * ではない。ワーホリ／サイトが扱う話題かどうかの軽量な事前判定を行う。
 *
 * 注意: これは補助的なシグナルであり、最終的な「情報あり/なし」判定は検索の
 * 類似度しきい値（retriever）が担う。ここで弾き切れなくても、根拠が無ければ
 * generator は呼ばれず定型の unsupported 応答になる。
 */

/** サイトが扱う中心的トピックの語彙（日本語・英語の混在に対応）。 */
const IN_SCOPE_TERMS: string[] = [
  // ビザ・制度
  "ビザ", "visa", "417", "462", "セカンド", "サード", "88日", "specified work",
  "指定業務", "移民", "immi", "eta", "subclass",
  // 税・番号
  "tfn", "abn", "tax", "税", "確定申告", "タックスリターン", "super", "スーパー",
  "dasp", "年金", "gst",
  // 仕事
  "仕事", "求人", "job", "バイト", "アルバイト", "ファーム", "farm", "収穫",
  "レジュメ", "resume", "履歴書", "カバーレター", "面接", "時給", "award", "給料",
  "uber", "doordash", "ギグ", "gig",
  // 住居
  "家", "シェアハウス", "住", "housing", "rent", "家賃", "bond", "ボンド",
  "内見", "inspection", "roommate", "ルームメイト",
  // 車・免許
  "車", "car", "rego", "登録", "ppsr", "免許", "licence", "license", "運転",
  // 生活・準備・英語・エリア・旅行
  "英語", "english", "フレーズ", "sim", "銀行", "bank", "口座", "送金", "両替",
  "保険", "health", "病院", "薬", "生活費", "予算", "貯金", "準備", "持ち物",
  "パッキング", "到着", "arrival", "空港", "エリア", "地域", "都市", "旅行",
  "travel", "帰国", "medicare", "郵便番号", "postcode",
  // サイト機能
  "ツール", "計算", "チェックリスト", "カレンダー", "テンプレート",
  "ワーホリ", "ワーキングホリデー", "working holiday", "オーストラリア", "australia",
];

/** 明らかにサイト外のトピック（弱いネガティブシグナル）。 */
const OUT_OF_SCOPE_TERMS: string[] = [
  "株価", "日本株", "米国株", "仮想通貨", "ビットコイン", "為替予想",
  "プログラミング", "python", "javascript", "コードを書いて", "エラーを直して",
  "アニメ", "映画のおすすめ", "芸能", "recipe of", "数学の問題", "宿題",
];

export function scopeSignal(question: string): {
  inScope: boolean;
  outOfScope: boolean;
} {
  const q = question.toLowerCase();
  const inScope = IN_SCOPE_TERMS.some((t) => q.includes(t.toLowerCase()));
  const outOfScope = OUT_OF_SCOPE_TERMS.some((t) => q.includes(t.toLowerCase()));
  return { inScope, outOfScope };
}
