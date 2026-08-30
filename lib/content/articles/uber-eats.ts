import type { Article } from "./types";

export const uberEatsArticles: Article[] = [
  {
    id: "a8",
    title: "Uber Eats配達員の始め方｜登録から稼働・保険まで",
    slug: "uber-eats-guide",
    category: "uber-eats",
    description: "ギグワークの代表格Uber Eatsの登録手順、稼働のコツ、保険の考え方をまとめました。",
    content: [
      "Uber Eatsはスキマ時間に働けるフードデリバリーで、英語にまだ自信がなくても始めやすいのが魅力です。ABN登録と本人確認を済ませれば、自転車・バイク・車で配達できます。",
      "報酬は配達ごとの距離・時間などに応じて変動します。ピークタイム（昼12時前後・夜18〜21時）や雨の日は需要が高くなる傾向がありますが、収入はエリアや需要によって変わります。",
      "2026年8月17日から、デジタルプラットフォームを通じて主に食品・飲料・食料品を即時配達する対象のemployee-like workerには、Fair Work CommissionのMinimum Standards Orderが適用されています。最低報酬の安全網はengaged time（アプリ上で配達案件を完了するために従事した対象時間）を基に計算され、2026年末までは自転車・電動自転車・電動スクーター等が時給換算31.30ドル、燃焼式バイク・スクーターが31.50ドル、積載1トン以下の車・バンが32.00ドルです。待機時間すべてに一律の時給が保証される制度ではなく、対象範囲や計算方法はFair Work Ombudsmanの最新案内で確認してください。",
    ],
    keyFacts: [
      { label: "必要なもの", value: "ABN、配達手段、保温バッグ、スマホ" },
      { label: "稼ぎ時", value: "平日ランチ・週末ディナー・雨天" },
      { label: "報酬", value: "案件・距離・時間などで変動。対象者にはMinimum Standards Orderの最低報酬ルールあり" },
      { label: "最低基準（2026/8/17〜）", value: "対象のemployee-like workerはengaged timeベースで車両区分別の最低報酬安全網" },
      { label: "税金", value: "ABN収入のため確定申告が必要" },
    ],
    steps: [
      { title: "ABNを取得", description: "Sole TraderとしてABNを取得します（ABNガイド参照）。" },
      { title: "アプリで登録", description: "本人確認書類・ビザ・配達手段を登録します。" },
      { title: "バッグと装備を準備", description: "保温バッグ、スマホホルダー、ヘルメット（バイク/自転車）を用意します。" },
      { title: "稼働を開始", description: "ピークタイムに需要の高いエリアでオンラインにします。" },
    ],
    tips: [
      "自転車配達はCBD（中心部）の短距離案件が多く、バイクは郊外も含め効率的。エリア特性で手段を選びましょう。",
      "売上・経費（自転車整備、燃料、スマホ代）を毎月記録しておくと確定申告が楽になります。",
    ],
    warnings: [
      "配達中の事故・賠償に備え、対人・対物をカバーする保険への加入を強く推奨します。",
      "2026年8月17日開始の最低基準は、対象となるemployee-like workerと対象業務に適用されます。アプリをオンラインにしている全時間へ一律の時給が保証されるという意味ではありません。",
    ],
    faqs: [
      {
        question: "ワーホリビザでUber Eatsをやって問題ありませんか？",
        answer:
          "個人事業主としての就労はワーホリビザで可能です。ただし同一雇用主6か月ルールはあくまで「雇用」に関するもので、複数のプラットフォームを掛け持ちすること自体に制限はありません。",
      },
      {
        question: "2026年8月からUber Eats配達は時給31.30ドル以上になったのですか？",
        answer:
          "一律の通常時給ではありません。Fair Work CommissionのMinimum Standards Orderの対象となるemployee-like workerについて、engaged timeを基に最低報酬の安全網を計算します。車両区分でも基準額が異なるため、最新の対象条件・金額はFair Work Ombudsman公式情報を確認してください。",
      },
    ],
    sources: [
      { label: "Uber - 配達パートナー登録", url: "https://www.uber.com/au/en/deliver/" },
      {
        label: "Fair Work Ombudsman - Minimum standards for on-demand delivery workers",
        url: "https://www.fairwork.gov.au/find-help-for/regulated-workers/minimum-standards-for-on-demand-delivery-workers",
      },
      {
        label: "Fair Work Ombudsman - Rules in the on-demand delivery order",
        url: "https://www.fairwork.gov.au/find-help-for/regulated-workers/minimum-standards-for-on-demand-delivery-workers/rules-in-the-on-demand-delivery-order",
      },
    ],
    relatedSlugs: ["abn-guide", "doordash-guide", "tax-return-guide", "gig-work-comparison"],
    updatedAt: "2026-08-30",
    published: true,
  },
];
