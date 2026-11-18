import type { NewsItem } from "@/types/news";

/**
 * サイトのお知らせ・制度変更ニュース。
 * 新しいものを上（配列の先頭）に追加してください。日付降順で表示されます。
 */
export const newsItems: NewsItem[] = [
  {
    id: "manual-whm-application-rules-2026-11",
    slug: "whm-second-third-visa-invitation-2027",
    title: "セカンド・サードのワーホリビザが招待制へ。セカンドの指定労働は120日に",
    date: "2026-11-22",
    category: "visa",
    summary: "内務省は2026年11月17日、日本のパスポートでセカンド・サード（417）を申請する人にも関わる新制度を発表しました。登録は12月1日、招待制とセカンドの120日要件は2027年3月1日からです。",
    body: [
      "【2027年2月28日まで】指定労働を完了し、ほかの条件を満たして同日までに有効な申請を提出できれば、招待なしで直接申請できます。指定労働はセカンドが88日、サードが179日です。期限までに働き終えるだけでは移行措置の対象になりません。",
      "【2027年3月1日から】セカンド・サードは、事前に登録して招待を受け、指定労働などの要件を満たしてから申請します。セカンドは88日から120日に増え、改定前に行った適格な指定労働も算入されます。サードは179日のままです。ファースト申請の変更ではなく、英国パスポートで申請する人は新たな登録・招待の対象外です。",
      "登録受付は2026年12月1日からです。国内外から、指定労働を終える前にも登録できます。初回招待は2027年1月中旬の予定です。招待された場合、要件を満たしたうえで招待から12か月以内に申請できます。登録は招待を保証せず、招待は発給を保証せず、現在のビザも延長しません。",
      "日本のパスポートで申請する場合は、まず移行期限までに指定労働の完了と有効な申請の両方が可能か確認してください。新制度で申請する場合は登録開始日と現在のビザの満了日を別々に管理し、給与明細や勤務記録を保管しましょう。"
    ],
    source: {
      label: "Department of Home Affairs｜Working Holiday Maker visa application rules are changing（2026年11月17日）",
      url: "https://www.homeaffairs.gov.au/news-subsite/Pages/2026-Nov/working-holiday-maker-visa-application-rules-are-changing.aspx"
    },
    relatedGuide: "second-visa-guide",
    published: true
  },
  {
    id: "manual-fwo-four-seasons-penalty-2026-11",
    slug: "fair-work-blueberry-worker-penalties-2026",
    title: "日本人ワーホリを含むブルーベリー農園の賃金事案、裁判所が計75,600豪ドルの制裁金",
    date: "2026-11-15",
    category: "cost",
    summary: "Fair Work Ombudsmanが2026年11月11日、2026年8月に提訴を公表した事案の裁判結果を発表しました。園芸の歩合給ルールの改定ではありません。",
    body: [
      "NSW州コフスハーバー周辺でブルーベリーを収穫した日本人と中国人のワーキングホリデー労働者2人が対象です。裁判所は、人材派遣会社Four Seasons Workforce Pty Ltdが未払い分の精算を求める2件の是正通知に従わなかったことについて、会社に63,000豪ドル、取締役に12,600豪ドルの制裁金を科しました。",
      "労働者2人への未払い分は合計14,038豪ドルで、会社はFair Work Ombudsmanが法的措置を始めた後に支払いました。これは2026年8月の提訴に続く裁判結果で、全国の賃金制度が変わったわけではありません。",
      "Horticulture Award（園芸の労働条件を定めるアワード）が適用される歩合制では、働いた日ごとに該当時給×実働時間が最低保証です。就労前に歩合単価を書面で確認し、勤務時間と給与明細を照合してください。差額が解決しない場合はFair Work Ombudsmanに相談できます。"
    ],
    source: {
      label: "Fair Work Ombudsman｜NSW labour hire operator penalised for breaches affecting migrant fruit pickers（2026年11月11日）",
      url: "https://www.fairwork.gov.au/newsroom/media-releases/2026-media-releases/november-2026/20261111-four-seasons-workforce-penalty-media-release"
    },
    relatedGuide: "piecework-vs-hourly",
    published: true
  },
  {
    id: "manual-fwo-junior-award-pay-guides-2026-11",
    slug: "fair-work-junior-award-pay-guides-2026",
    title: "18〜20歳の一部の小売・ファストフード等で12月から賃金改定。Fair Workが新しい賃金表を案内",
    date: "2026-11-08",
    category: "cost",
    summary: "Fair Work Ombudsmanが2026年11月2日に案内を更新しました。対象のAwardと等級で、同じ雇用主に6か月を超えて雇用されている18〜20歳が、初回引き上げの主な対象です。",
    body: [
      "Fair Work Ombudsmanは、2026年4月8日に公開したガイドを11月2日に更新し、2026年12月からの新しい賃金率をPay and Conditions Toolと各Awardの賃金表で確認できると案内しました。制度自体はFair Work Commissionが3月31日に決定したものです。",
      "初回引き上げは2026年12月1日以降に始まる最初の完全な給与期間からです。Fast Food Industry Award、General Retail Industry Award（レベル1〜3）、Pharmacy Industry Award（薬局アシスタントのレベル1〜2）の対象者で、18〜20歳かつ同じ雇用主での雇用が6か月を超える場合に、成人賃金率へ段階的に近づきます。年齢・等級によって率や引き上げ時期は異なります。",
      "すべての飲食店や小売の仕事に一律で適用されるわけではありません。該当する人は、Award・等級・雇用開始日と対象の給与期間を確認し、Fair Workの計算ツールで日付を選び、給与明細と照合してください。ビザの同一雇用主での就労条件は別です。"
    ],
    source: {
      label: "Fair Work Ombudsman｜Junior wage changes to Retail, Fast Food and Pharmacy Awards（2026年11月2日更新）",
      url: "https://www.fairwork.gov.au/about-us/workplace-laws/award-changes/major-award-changes/junior-wage-changes-to-retail-fast-food-and-pharmacy-awards"
    },
    relatedGuide: "award-rates-penalty-rates",
    published: true
  },
  {
    id: "n4",
    slug: "content-update-2026-07",
    title: "ガイド記事を大幅に拡充しました（2026年7月）",
    date: "2026-07-16",
    category: "site",
    summary:
      "ビザ・到着後手続き・仕事・ファーム・税金など主要ガイドの解説を大幅に加筆し、労働者の権利・営業時間と祝日・メンタルヘルスの新記事を追加しました。",
    body: [
      "より役立つサイトを目指し、主要ガイド記事の内容を大幅に加筆・更新しました。ワーホリ完全ガイド、ビザ申請、到着後チェックリスト、TFN、確定申告、Wise送金、ローカルジョブ、ファーム、セカンドビザなどのページで、手順の背景や注意点、失敗しないコツをより詳しく解説しています。",
      "あわせて『ワーホリの労働者の権利（Fair Work）』『店の営業時間と祝日』『海外生活のメンタルヘルス』の3記事を新たに公開しました。現地で使える英語フレーズ（日本語訳つき）も、面接・家探し・体調相談などの記事に順次追加しています。",
      "今後も、実際の手続き画面のスクリーンショットや写真を加えながら、情報の正確性と分かりやすさを高めていきます。『こんな情報が欲しい』というご要望は、リクエストページからお気軽にお寄せください。",
    ],
    relatedGuide: "whv-complete-guide",
    published: true,
  },
  {
    id: "n3",
    slug: "whv-visa-fee-840",
    title: "ワーホリビザ申請料の改定｜2025年・2026年の変更",
    date: "2025-07-01",
    category: "cost",
    summary:
      "2025年7月1日の一般枠の改定はA$650からA$670でした。2026年7月1日以降の一般枠は初回A$840、セカンド・サード各A$1,000です。",
    body: [
      "訂正：当初の掲載ではA$840・A$1,000を2025年7月の改定額としていました。2025年7月1日の規則で一般枠のサブクラス417の基本申請料はA$650からA$670に変更されました。",
      "2026年7月1日の規則改定後は、一般枠のファーストの基本申請料はA$840、セカンド・サードは各A$1,000です。例外や手数料、今後の改定があるため、支払い前にHome Affairsの最新の見積もりを確認してください。",
    ],
    source: {
      label: "豪州連邦法令登録簿｜2025年の申請料改定",
      url: "https://www.legislation.gov.au/F2025L00796/latest",
    },
    relatedGuide: "visa-cost-processing-time",
    published: true,
  },
  {
    id: "n2",
    slug: "second-visa-record-keeping",
    title: "セカンドビザ：日数の証拠（Payslip等）は必ず保管を",
    date: "2025-06-15",
    category: "visa",
    summary:
      "セカンド/サードビザ申請では規定労働（Specified Work）の証拠提出が重要です。Payslip・銀行入金・雇用契約を必ず保管しましょう。",
    body: [
      "セカンドビザ・サードビザの申請では、実際に規定労働を行ったことを示す証拠が求められます。給与明細（Payslip）、銀行の入金記録、雇用契約、タイムシートは必ず保管してください。",
      "『日数をごまかして証明する』といった不正な提案には絶対に応じないでください。発覚するとビザ却下や将来の入国制限のリスクがあります。正規に課税され、記録が残る形で働くことが最も安全です。",
    ],
    relatedGuide: "second-visa-guide",
    published: true,
  },
  {
    id: "n1",
    slug: "site-launch",
    title: "WH Guide Australia を公開しました",
    date: "2025-06-01",
    category: "site",
    summary:
      "オーストラリアワーホリの準備・生活・仕事・税金・掲示板をまとめた日本語ガイドサイトを公開しました。記事は随時追加していきます。",
    body: [
      "ビザ申請から現地の家探し・仕事探し、税金・ファーム・ギグワークまで、ワーホリに必要な情報を『必要な順番』で学べる日本語ガイドサイトを公開しました。",
      "手順記事は今後、画像付きでさらに分かりやすく更新していく予定です。掲示板では現地の質問・情報交換もできます。リクエストページから『こんな記事が欲しい』という要望もお寄せください。",
    ],
    published: true,
  },
];
