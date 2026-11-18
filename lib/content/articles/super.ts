import type { Article } from "./types";

export const superArticles: Article[] = [
  {
    id: "a7",
    title: "Superannuation（退職年金）の引き出し｜DASP申請",
    slug: "super-guide",
    category: "super",
    description: "雇用主が積み立てたSuperを、ワーホリ終了後にDASPとして請求する手順と注意点を解説します。",
    content: [
      "Superannuation（スーパー）は雇用主が積み立てる退職年金です。対象の従業員への法定最低率は12%で、2026年7月1日からのPayday Superでは対象となる支払い（qualifying earnings）を基に計算します。ワーホリビザでも対象条件を満たせば適用されます。",
      "ビザが失効し出国した後、DASP（Departing Australia Superannuation Payment）として請求できます。請求にはSuper口座情報とビザの失効が必要で、WHM用DASP税率が適用される場合、課税部分に65%の源泉徴収があります。",
    ],
    keyFacts: [
      { label: "拠出率", value: "対象となる支払いの12%（法定最低率）" },
      { label: "対象", value: "対象となる従業員。年齢や雇用条件による例外はATOで確認" },
      { label: "請求条件", value: "出国済み＋ビザ失効" },
      { label: "DASP課税（WHM）", value: "WHM用DASP税率は課税部分に65%。税非課税部分は0%" },
    ],
    steps: [
      {
        title: "雇用主の書類と積立先を確認する",
        description: "新しい職場から指定されたら、ファンドの詳細を提出します。すでに持っているファンドがあるか、ATO画面やファンドで確認します。",
        links: [
          {
            label: "ATOとmyGovへ連携",
            url: "/guides/mygov-ato-linking"
          }
        ]
      },
      {
        title: "給与明細と入金を照合する",
        description: "給与明細に記載されていても実際の着金とは別です。2026年7月以降のPayday Superでは、原則としてファンドが給与日から7営業日以内に受け取る必要があり、例外はATOを確認します。",
        links: [
          {
            label: "ATO Payday Superの期限",
            url: "https://www.ato.gov.au/businesses-and-organisations/super-for-employers/paying-super-on-payday/payment-deadlines-for-payday-super"
          }
        ]
      },
      {
        title: "未納の疑いを確認する",
        description: "明細、積立記録、勤務先の情報を集め、雇用主に確認。解決しなければATOの申告手順に進みます。",
        links: [
          {
            label: "ATO Super未払いを報告",
            url: "https://www.ato.gov.au/calculators-and-tools/super-report-unpaid-super-contributions-from-my-employer"
          },
          {
            label: "帰国後のDASP",
            url: "/guides/dasp-refund"
          }
        ]
      }
    ],
    tips: [
      "勤務先が変わるたびに新しいSuper口座を作らず、最初の口座を使い回すと管理が楽です。",
      "Super口座番号（USI/メンバー番号）は給与明細やSuper会社のアプリで確認できます。",
    ],
    faqs: [
      {
        question: "帰国前に引き出せますか？",
        answer:
          "できません。DASPはビザが失効し、かつ国外に出た後にのみ請求できます。帰国直前にSuper口座情報を控えておき、帰国後に申請するのが一般的です。",
      },
    ],
    sources: [
      { label: "ATO｜Super Guaranteeの率", url: "https://www.ato.gov.au/tax-rates-and-codes/key-superannuation-rates-and-thresholds/super-guarantee" },
      { label: "ATO｜Payday Superの対象となる支払い", url: "https://www.ato.gov.au/businesses-and-organisations/super-for-employers/paying-super-on-payday/what-payments-are-qualifying-earnings" },
      { label: "ATO｜DASP", url: "https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/temporary-residents-and-superannuation/departing-australia-superannuation-payment-dasp" },
    ],
    relatedSlugs: ["tax-return-guide"],
    updatedAt: "2026-11-18",
    published: true,
    procedure: {
      preparation: [
        {
          title: "勤務開始時",
          items: [
            "口座を指定するためのファンド名・会員情報。必要に応じて雇用主の選択フォーム",
            "自分の給与明細、ファンドの入金を確認できるログイン"
          ]
        }
      ],
      completion: "給与明細にあるSuperと実際にファンドへ入った金額を、該当する納付期限を基に照合できたら完了です。"
    },
  },

  {
    id: "a40",
    title: "スーパーアニュエーション返金（DASP）｜帰国時の手続き",
    slug: "dasp-refund",
    category: "super",
    description:
      "帰国後、積み立てた退職年金（Super）は『DASP』として払い戻し申請できます。対象条件・申請手順・税率・注意点を解説します。",
    content: [
      "オーストラリアで働くと、給与とは別に雇用主が『スーパーアニュエーション（Super：退職年金）』を積み立てます。ワーホリが帰国してビザが失効すると、この積立金を『DASP（Departing Australia Superannuation Payment）』として払い戻し申請できます。",
      "申請はオンライン（ATOのDASPシステム）で行います。複数の職場で働いた場合は複数のSuperファンドに積立があることが多いため、すべて把握して申請するのがポイントです。払い戻しには税金が源泉徴収されます（ワーホリ向けの税率が適用）。",
    ],
    keyFacts: [
      { label: "対象", value: "ビザ失効・オーストラリア出国後のワーホリ等" },
      { label: "申請方法", value: "ATOのDASPオンラインシステム" },
      { label: "税率", value: "ワーホリ向けの源泉税が適用(高め)" },
      { label: "注意", value: "複数ファンドに積立がある場合は各社に申請" },
    ],
    steps: [
      {
        title: "出国前に残高・ファンドの連絡先を控える",
        description: "myGovのATO画面やSuper明細で積立先を調べ、会員番号とログインの復旧手段を保存します。",
        links: [
          {
            label: "Superの確認方法",
            url: "/guides/super-guide"
          }
        ]
      },
      {
        title: "出国後にビザ状態と申請資格を確認する",
        description: "出国しただけでは申請できません。該当ビザが残っていないか確認し、要件を満たしてから提出します。",
        links: [
          {
            label: "ATO DASPの申請資格",
            url: "https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/temporary-residents-and-superannuation/departing-australia-superannuation-payment-dasp"
          },
          {
            label: "VEVOでビザを確認",
            url: "https://immi.homeaffairs.gov.au/visas/already-have-a-visa/check-visa-details-and-conditions/check-conditions-online/visa-holders"
          }
        ]
      },
      {
        title: "ATOのオンライン申請に入力する",
        description: "公式案内にあるDASP online application systemを開き、パスポート情報とファンドを入力します。ファンドから追加資料の依頼があれば、連絡先と提出先を確認します。",
        links: [
          {
            label: "ATO DASPの申請画面へ",
            url: "https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/temporary-residents-and-superannuation/departing-australia-superannuation-payment-dasp"
          },
          {
            label: "DASP入力・再開の公式ヘルプ",
            url: "https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/temporary-residents-and-superannuation/departing-australia-superannuation-payment-dasp/help-with-the-dasp-online-application-system"
          }
        ]
      },
      {
        title: "支払と源泉徴収を照合する",
        description: "ファンドまたはATOからの連絡で処理状況と支払通知を確認します。ワーホリのDASPは税率の扱いが他の一時ビザと異なる場合があります。",
        links: [
          {
            label: "ATO DASPの税金・確認先",
            url: "https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/temporary-residents-and-superannuation/departing-australia-superannuation-payment-dasp"
          }
        ]
      }
    ],
    tips: [
      "在豪中にmyGovとATOを連携しておくと、自分のSuper口座をまとめて確認できて便利です。",
      "Payslipでスーパーがきちんと積み立てられているか定期的に確認しましょう（未払いの雇用主もいます）。",
    ],
    warnings: ["税率・申請要件は変更されることがあります。申請前にATOの最新情報を確認してください。"],
    sources: [
      { label: "ATO｜DASP（退職年金の払い戻し）", url: "https://www.ato.gov.au/" },
    ],
    relatedSlugs: ["super-guide", "tax-return-guide", "tfn-guide"],
    updatedAt: "2026-11-18",
    published: true,
    procedure: {
      preparation: [
        {
          title: "申請の条件",
          items: [
            "豪州を出国済みで、該当する一時ビザが失効または取消済みか確認",
            "豪州市民・永住者、ニュージーランド市民などの除外条件は公式ページで確認"
          ]
        },
        {
          title: "本人・積立情報",
          items: [
            "パスポート、氏名・生年月日、連絡先、各Superファンド名、会員番号やファンド情報",
            "TFNは任意。ファンドから求められた場合の本人確認書類を用意"
          ]
        }
      ],
      completion: "申請控えをファンドごとに残し、受領額と源泉徴収の通知を確認します。未受領分がATOに移っている場合は公式案内に従います。"
    },
  },

  {
    id: "a134",
    title: "Superannuation完全ガイド｜仕組み・口座選び・雇用主への提出",
    slug: "superannuation-basics",
    category: "super",
    hub: "tax",
    priority: "P0",
    searchIntent: "Superの仕組みと口座選び・提出",
    description:
      "オーストラリアのSuperannuation（退職年金）の仕組みを基礎から解説。拠出率12%、口座（ファンド）の選び方、Standard Choice Formで雇用主に提出する方法、手数料・保険、Stapled Super、帰国時のDASPまでをワーホリ向けにまとめます。",
    content: [
      "Superannuation（通称Super）は、雇用主が給与とは別に積み立てる退職年金です。ワーホリ（サブクラス417・462）も対象で、雇用主はあなたのOTE（通常の労働に対する賃金）の12%をSuperファンドに拠出します。この12%は2025年7月1日から適用されている率で、給料から引かれるものではなく雇用主が追加で負担します。結論として、Superは『もらえる権利のあるお金』であり、口座を1つに決めて正しく積み立てられているか確認するのが最初の一歩です。",
      "対象条件はシンプルで、18歳以上の従業員なら月の収入額にかかわらずSuperが支払われます（以前あった月450 AUD未満は対象外というルールは2022年7月に撤廃されました）。18歳未満の場合は週30時間超の勤務が条件です。カジュアル・パートタイム・フルタイムいずれも対象で、雇用形態は問いません。ただしABNで働く個人事業主（Sole Trader）自身にはSuperは付きません。",
      "口座（Superファンド）の選び方：手数料が低く、運用実績が安定した大手ファンドを1つ選ぶのが基本です。ワーホリは短期滞在で運用益より『手数料の低さ』と『不要な保険を付けない』ことが重要です。多くのファンドは加入時に生命保険・所得補償保険が自動付帯され、掛金が残高から引かれます。短期滞在で不要なら加入後に保険をオフにできる場合があります。",
      "雇用主への提出方法：入社時に『Superannuation Standard Choice Form』で自分のファンド（ファンド名・USI・メンバー番号）を指定して提出します。指定しない場合、雇用主はATOに照会してあなたの既存の『Stapled Super（紐づけられた既定のファンド）』に支払います。Stapledもなければ雇用主の既定ファンドが使われます。複数の職場で毎回新しい口座を作ると口座が乱立し手数料が無駄になるため、最初の1口座を使い回すのが賢明です。",
      "確認とトラブル対応：毎回のPayslipに『Super』の金額とファンド名が記載されているか確認し、実際にファンドのアプリ／myGov（ATO連携）で入金されているかをチェックしましょう。2026年7月1日以降に支払われた給与にはPayday Superが適用され、原則、Superの拠出は給与支払日ごとに行われ、ファンドに7営業日以内に着金します。新規雇用の初回など例外があります。給与明細に載っていても着金したとは限らないため、ファンドの入金明細を確認しましょう。帰国してビザが失効した後は、積み立てたSuperをDASPとして払い戻し請求できます（ワーホリの源泉税率は高め）。",
    ],
    keyFacts: [
      { label: "拠出率", value: "OTEの12%（2025年7月1日から。雇用主負担）" },
      { label: "対象", value: "18歳以上は収入額にかかわらず対象（雇用形態不問）" },
      { label: "提出書類", value: "Superannuation Standard Choice Form" },
      { label: "口座未指定時", value: "ATO照会のStapled Superまたは雇用主の既定ファンド" },
      { label: "帰国後", value: "DASPとして払い戻し請求（ビザ失効・出国後）" },
    ],
    steps: [
      { title: "ファンドを1つ選ぶ", description: "手数料の低い大手ファンドを選び、口座を開設します。" },
      { title: "不要な保険を確認", description: "自動付帯の保険が不要なら加入後にオフにできるか確認します。" },
      { title: "Standard Choice Formを提出", description: "入社時にファンド名・USI・メンバー番号を雇用主へ提出します。" },
      { title: "毎回Payslipで確認", description: "SuperがPayslipに記載され、実際に入金されているか確認します。" },
      { title: "口座を使い回す", description: "転職しても同じ口座を使い、口座の乱立と手数料の無駄を防ぎます。" },
    ],
    tips: [
      "myGovとATOを連携しておくと、自分のSuper口座と残高をまとめて確認・統合できます。",
      "短期滞在なら『低手数料・保険なし』を優先。運用益より手数料の差の方が残高に効きます。",
    ],
    warnings: [
      "拠出率・制度（Payday Super等）は改定されることがあります。最新の率はATOのSuper guaranteeページで確認してください。",
      "本記事は一般的な情報提供であり、個別の金融・税務助言ではありません。",
    ],
    faqs: [
      {
        question: "Superは給料から引かれるのですか？",
        answer:
          "いいえ。SuperはOTE（賃金）の12%を雇用主が別途負担して積み立てるもので、あなたの給料から天引きされるものではありません。時給表示が『Super込み（inclusive of super）』の求人もあるため、契約時に『時給＋Super』か『Super込み』かを確認しましょう。",
      },
      {
        question: "口座を指定しないとどうなりますか？",
        answer:
          "雇用主がATOにあなたの『Stapled Super（既存の紐づけファンド）』を照会し、そこへ支払います。過去にオーストラリアで働いたことがなければStapledは無いため、雇用主の既定ファンドが使われます。無駄な口座を増やさないためにも、最初に1つ選んで指定するのがおすすめです。",
      },
    ],
    sources: [
      { label: "Australian Taxation Office｜Payday Superの支払い・例外（2026年10月20日更新）", url: "https://www.ato.gov.au/businesses-and-organisations/super-for-employers/paying-super-on-payday/how-to-work-out-and-pay-super" },
      { label: "ATO - Super for employers（SG rate）", url: "https://www.ato.gov.au/tax-rates-and-codes/key-superannuation-rates-and-thresholds/super-guarantee" },
    ],
    verifiedAt: "2026-07-18",
    officialSources: [
      { label: "Australian Taxation Office｜Payday Superの支払い・例外（2026年10月20日更新）", url: "https://www.ato.gov.au/businesses-and-organisations/super-for-employers/paying-super-on-payday/how-to-work-out-and-pay-super", accessedAt: "2026-11-18" },
      {
        label: "ATO｜How much super to pay（SG率12%・2025–26年度）",
        url: "https://www.ato.gov.au/businesses-and-organisations/super-for-employers/paying-super-contributions/how-much-super-to-pay",
        accessedAt: "2026-07-18",
      },
      {
        label: "ATO｜Key superannuation rates and thresholds – super guarantee",
        url: "https://www.ato.gov.au/tax-rates-and-codes/key-superannuation-rates-and-thresholds/super-guarantee",
        accessedAt: "2026-07-18",
      },
    ],
    relatedSlugs: ["super-guide", "dasp-refund", "payslip-guide", "tax-return-guide", "tfn-guide"],
    updatedAt: "2026-10-25",
    published: true,
  },
];
