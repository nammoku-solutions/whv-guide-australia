import type { Article } from "./types";

export const bankArticles: Article[] = [
  {
    id: "a14",
    title: "オーストラリアの銀行口座開設ガイド（CommBank・NABなど）",
    slug: "bank-account-guide",
    category: "bank",
    description:
      "渡航前のオンライン申込から到着後の本人確認まで、ワーホリの銀行口座開設の流れと主要4大銀行の特徴を解説します。",
    content: [
      "給与受け取りや家賃支払いには現地の銀行口座があると便利です。四大銀行はCommonwealth Bank（CommBank）、Westpac、ANZ、NAB。アプリの使いやすさやワーホリ向け無料口座の有無で選ぶと良いでしょう。",
      "多くの銀行は渡航前にオンラインで口座申込ができ、到着後に支店やアプリで本人確認（パスポート提示）をして有効化します。事前申込しておくと、到着後すぐに口座が使えます。",
    ],
    keyFacts: [
      { label: "四大銀行", value: "CommBank / Westpac / ANZ / NAB" },
      { label: "申込", value: "渡航前にオンライン申込→到着後に本人確認" },
      { label: "必要書類", value: "パスポート、住所、TFN（後から登録可）" },
      { label: "カード", value: "デビットカード（タッチ決済）が即日〜数日で利用可" },
    ],
    steps: [
      {
        title: "口座の条件を比較する",
        description: "月額・免除条件、カード配送、渡航前申込の可否、本人確認の方法を選んだ銀行の公式情報で確認します。",
        links: [
          {
            label: "主要銀行を比較",
            url: "/guides/bank-comparison"
          },
          {
            label: "CommBank 渡航者向け案内",
            url: "https://www.commbank.com.au/banking/moving-to-australia.html"
          }
        ]
      },
      {
        title: "銀行の公式サイトまたは支店で申し込む",
        description: "選んだ口座の申請画面を開き、本人情報と住所を記入します。渡航前申請に対応していなければ到着後に申請します。",
        checklist: [
          "検索広告の先でパスワード等を入力する前に、銀行の公式ドメインを確認。"
        ]
      },
      {
        title: "本人確認とカード設定を完了する",
        description: "必要なら旅券などを持って支店へ。アプリへログインし、カードの有効化、連絡先、振込口座情報を確認します。",
        links: [
          {
            label: "銀行口座の詐欺対策",
            url: "/guides/bank-scam-security"
          }
        ]
      }
    ],
    tips: [
      "TFNは後から口座に登録できます。未登録だと利息に高い税率がかかるため、届いたら登録を。",
      "口座維持費（monthly fee）が無料の条件（学生/ワーホリ向け、または毎月の入金条件）を確認しましょう。",
      "Wiseと現地銀行を併用すると、両替はWise・現地受け取りは銀行、と使い分けられて便利です。",
    ],
    faqs: [
      {
        question: "TFNがなくても口座は作れますか？",
        answer:
          "作れます。TFNは口座開設の必須条件ではなく、後から登録できます。ただし未登録のままだと利息に対して高い税率が適用されるため、TFNが届いたら早めに登録しましょう。",
      },
    ],
    sources: [
      { label: "Commonwealth Bank（移住者向け口座）", url: "https://www.commbank.com.au/banking/moving-to-australia.html" },
    ],
    relatedSlugs: ["money-transfer-wise", "tfn-guide", "arrival-checklist", "proof-of-address", "bank-scam-security"],
    updatedAt: "2026-11-18",
    published: true,
    procedure: {
      preparation: [
        {
          title: "銀行が求める本人確認",
          items: [
            "パスポート、連絡先、住所と開始予定日。ビザ情報や追加の身分証は銀行の指示に従う",
            "税務上の居住地・納税識別番号など、求められる自己申告情報"
          ]
        }
      ],
      completion: "口座の本人確認が完了し、アプリにログインして自分のBSB・口座番号を確認できたら、給与受取先として用意完了です。"
    },
  },

  {
    id: "a39",
    title: "オーストラリア4大銀行比較｜CommBank・NAB・ANZ・Westpac",
    slug: "bank-comparison",
    category: "bank",
    description:
      "CommBank、NAB、ANZ、Westpacの日常口座を、口座維持費と免除条件、渡航者の開設方法で比較します。",
    content: [
      "毎月の維持費を無条件で抑えたいならNAB Classic Banking、出発前に手続きを始めたいならCommBankの渡航者向け案内など、優先する条件から選びます。4行の口座例と申込先は下にまとめました。",
      "給与口座として使う場合は、本人確認が完了したらBSBと口座番号を雇用主の指定方法で伝えます。カードの暗証番号やオンラインバンキングのパスワードは不要です。"
    ],
    keyFacts: [
      {
        label: "口座維持費",
        value: "月A$0の口座と、年齢・入金などの条件で無料になる口座を区別"
      },
      {
        label: "開設前の確認",
        value: "到着日、本人確認書類、現地住所や連絡先の要件"
      },
      {
        label: "別に確認する費用",
        value: "海外利用、送金、ATM、標準外のカード"
      }
    ],
    steps: [
      {
        title: "料金と申込み条件で候補を絞る",
        description: "月額費用や免除条件、到着前に申し込めるか、本人確認の方法を上の例から比較します。"
      },
      {
        title: "銀行公式の案内から申し込む",
        description: "銀行ごとに本人確認書類・現地住所・申込経路が異なります。旅券原本を準備し、オンラインで完了しない場合は公式の案内に従い支店へ行きます。",
        links: [
          {
            label: "持ち物・本人確認・初回設定",
            url: "/guides/bank-account-guide"
          }
        ]
      },
      {
        title: "使える状態を確認する",
        description: "開設後はBSBと口座番号、デビットカードの受取先を確認。利息の税区分やTFNの登録方法は銀行に確認します。"
      }
    ],
    tips: [
      "免除条件に年齢・入金額・期間などが付く場合は、満たさなくなる月の料金も比べます。海外利用の手数料は口座維持費と別です。"
    ],
    relatedSlugs: ["bank-account-guide", "tfn-guide", "money-transfer-wise"],
    examples: {
      title: "給与受取に使える4行の口座例",
      items: [
        {
          title: "CommBank｜Everyday Smart Access",
          summary: "到着直前に申し込みを始めたい人の候補です。",
          details: [
            "渡航者向けルートでは到着前14日以内または到着後12か月以内が目安。開設後20日以内に支店で旅券原本を提示する案内があるので、到着日と来店日を確認します。"
          ],
          facts: [
            {
              label: "口座維持費",
              value: "月A$4。30歳未満や毎月A$2,000以上の対象入金などで免除条件あり"
            }
          ],
          links: [
            {
              label: "渡航者向け口座開設",
              url: "https://www.commbank.com.au/moving-to-australia.html"
            },
            {
              label: "公式の料金・免除条件",
              url: "https://www.commbank.com.au/banking/everyday-account-smart-access/rates-fees.html"
            }
          ]
        },
        {
          title: "NAB｜NAB Classic Banking",
          summary: "収入の少ない月でも、毎月の入金条件を管理したくない人が比較しやすい口座です。",
          details: [
            "Platinumカードには別の月額料金があります。標準カードで必要な機能が足りるかを見てから、公式の口座開設案内で本人確認方法を選びます。"
          ],
          facts: [
            {
              label: "口座維持費",
              value: "月A$0。標準NAB Visa Debitも月額無料"
            }
          ],
          links: [
            {
              label: "NAB公式｜日常口座・申込",
              url: "https://www.nab.com.au/personal/bank-accounts/transaction-accounts"
            },
            {
              label: "NAB公式｜手数料表",
              url: "https://www.nab.com.au/important-information/personal/transaction-savings-accounts-fee-summary"
            }
          ]
        },
        {
          title: "ANZ｜Access Advantage",
          summary: "到着後に比較したい日常口座です。",
          details: [
            "出発前に申し込めると決めつけず、海外在住者の申し込み案内と本人確認書類をチェックします。ネット手続きが使えない場合は支店の案内を確認。"
          ],
          facts: [
            {
              label: "口座維持費",
              value: "月A$5。毎月A$2,000以上の対象入金または他の条件で免除あり"
            }
          ],
          links: [
            {
              label: "ANZ公式｜口座条件",
              url: "https://www.anz.com.au/personal/bank-accounts/everyday-accounts/access-advantage/"
            },
            {
              label: "ANZ公式｜口座開設方法",
              url: "https://www.anz.com.au/personal/bank-accounts/open-account/"
            }
          ]
        },
        {
          title: "Westpac｜Choice",
          summary: "新規渡航者の免除を利用できるか確認したい人の候補です。",
          details: [
            "免除が適用されるときは終了月を控え、以降も別の免除条件を満たせるか確認します。申し込み方法と用意する本人確認書類は公式ページから確認してください。"
          ],
          facts: [
            {
              label: "口座維持費",
              value: "通常月A$5。条件を満たす新規渡航者などは開設後12か月の免除あり"
            }
          ],
          links: [
            {
              label: "Westpac公式｜Choiceの条件・申込",
              url: "https://www.westpac.com.au/bank-accounts/choice"
            }
          ]
        }
      ],
      intro: "すべて個人向けの日常口座です。月額維持費に加え、本人確認の方法、使うATM、帰国後も使うかで選びます。",
      note: "2026年11月19日確認。維持費以外のATM・海外利用・カード手数料は含みません。"
    },
    updatedAt: "2026-11-19",
    published: true,
  },
];
