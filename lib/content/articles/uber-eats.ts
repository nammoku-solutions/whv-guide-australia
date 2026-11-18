import type { Article } from "./types";

export const uberEatsArticles: Article[] = [
  {
    id: "a8",
    title: "Uber Eats配達員の始め方｜登録から稼働・保険まで",
    slug: "uber-eats-guide",
    category: "uber-eats",
    description: "ギグワークの代表格Uber Eatsの登録手順、稼働のコツ、保険の考え方をまとめました。",
    content: [
      "Uber Eatsの配達を始めるには、利用地域・車両を選び、就労資格・本人確認・車両書類・ABNをUberの指示に従って提出します。審査が完了しアカウントが有効になってから稼働できます。",
      "報酬は配達ごとの距離・時間などに応じて変動します。ピークタイム（昼12時前後・夜18〜21時）や雨の日は需要が高くなる傾向がありますが、収入はエリアや需要によって変わります。",
      "Fair Workの対象となるフードデリバリー配達員には、対象稼働時間（engaged time）をもとにした最低報酬と不足分の補填ルールがあります。待機を含む全オンライン時間への通常時給ではありません。 2026年12月31日までは、自転車等A$31.30、燃焼式バイク等A$31.50、積載1トン以下のその他対象車両A$32.00（時給換算）。2027年1月1日からは同じ区分の順にA$31.80、A$32.00、A$32.50です。"
    ],
    keyFacts: [
      { label: "必要なもの", value: "ABN、配達手段、保温バッグ、スマホ" },
      { label: "稼ぎ時", value: "平日ランチ・週末ディナー・雨天" },
      { label: "報酬", value: "案件・距離・時間などで変動。対象者にはMinimum Standards Orderの最低報酬ルールあり" },
      { label: "最低基準（2026/8/17〜）", value: "対象のemployee-like workerはengaged timeベースで車両区分別の最低報酬安全網" },
      { label: "税金", value: "ABN収入のため確定申告が必要" },
    ],
    steps: [
      {
        title: "配達地域と車両を確認して登録を始める",
        description: "Uber Australiaの配達ページを開き、配達する都市と自転車・バイク・車の区分を選びます。既存アカウントがある場合は重複登録せずログインします。",
        links: [
          {
            label: "Uber Australia 配達登録を始める",
            url: "https://www.uber.com/au/en/deliver/"
          },
          {
            label: "車両別の公式必要書類",
            url: "https://help.uber.com/en-AU/driving-and-delivering/article/delivery-person-requirements?nodeId=8656c267-a46f-4a6c-a032-56560791254b"
          }
        ]
      },
      {
        title: "本人確認書類・ABNを提出する",
        description: "Uber Driverまたは登録画面に表示された書類を提出します。外国旅券の場合は案内に従って就労資格の確認（VEVO）を進め、犯罪歴チェックの依頼が来たら完了させます。",
        checklist: [
          "両面が指定された書類は両方を撮影し、氏名・有効期限・画像の鮮明さを確認。"
        ],
        links: [
          {
            label: "UberのバックグラウンドチェックとVEVO",
            url: "https://help.uber.com/en-AU/driving-and-delivering/article/background-check-and-vevo?nodeId=1cc4efc4-8653-4ad7-902d-62796820476f"
          },
          {
            label: "ABNがなければ公式申請の手順へ",
            url: "/guides/abn-guide"
          }
        ]
      },
      {
        title: "保温バッグ・安全装備・保険を用意する",
        description: "Uberの登録画面に装備の案内があれば先に確認し、配達用バッグを注文・購入します。車やバイクを使う人は、加入先に業務配達中の補償を確認します。",
        checklist: [
          "ヘルメット・ライト・スマホ固定具を配達手段に合わせて用意。"
        ],
        links: [
          {
            label: "Uber Australia 装備の案内",
            url: "https://www.uber.com/au/en/deliver/getting-started/"
          },
          {
            label: "配達保険の確認項目",
            url: "/guides/delivery-insurance"
          }
        ]
      },
      {
        title: "有効化を待ち、振込先を確認する",
        description: "Uber Driverの書類ステータスを開き、未提出・却下の項目を直します。有効化の通知が来たら振込先と登録車両を確認してから稼働します。",
        links: [
          {
            label: "Uber アカウントの有効化と問い合わせ",
            url: "https://help.uber.com/en-AU/driving-and-delivering/article/account-activation-status?nodeId=abe81ce7-64a9-44a6-9e1c-ec3589e386f7"
          }
        ]
      },
      {
        title: "初回配達と報酬を確認する",
        description: "配達明細、アプリ上の対象稼働時間、経費を保存します。対象の配達員にはFair Workの最低報酬基準があり、待機を含む全オンライン時間への時給ではありません。",
        links: [
          {
            label: "Fair Work 最低基準・追加支払いの確認",
            url: "https://www.fairwork.gov.au/find-help-for/regulated-workers/minimum-standards-for-on-demand-delivery-workers/rules-in-the-on-demand-delivery-order"
          },
          {
            label: "配達の税金・記録",
            url: "/guides/delivery-abn-tax"
          }
        ]
      }
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
        "question": "ワーホリビザでUber Eatsをやって問題ありませんか？",
        "answer": "Condition 8547の6か月ルールは、自営業にも適用され得ます。Home Affairsは自営業の雇用主をサービスの最終利用先（end user）として扱います。単独の提供先に6か月を超えて継続する場合は、例外または書面による許可を確認してください。アプリへの複数登録だけで例外になるとは限りません。"
      },
      {
        "question": "2026年8月からUber Eats配達は時給31.30ドル以上になったのですか？",
        "answer": "一律の通常時給ではありません。Fair Work CommissionのMinimum Standards Orderの対象となるemployee-like workerについて、engaged timeを基に最低報酬の安全網を計算します。車両区分でも基準額が異なるため、最新の対象条件・金額はFair Work Ombudsman公式情報を確認してください。"
      }
    ],
    sources: [
      {
        label: "Uber - 配達パートナー登録",
        url: "https://www.uber.com/au/en/deliver/"
      },
      {
        label: "Fair Work Ombudsman - Minimum standards for on-demand delivery workers",
        url: "https://www.fairwork.gov.au/find-help-for/regulated-workers/minimum-standards-for-on-demand-delivery-workers"
      },
      {
        label: "Fair Work Ombudsman - Rules in the on-demand delivery order",
        url: "https://www.fairwork.gov.au/find-help-for/regulated-workers/minimum-standards-for-on-demand-delivery-workers/rules-in-the-on-demand-delivery-order"
      },
      {
        label: "Uber｜車両別書類",
        url: "https://help.uber.com/en-AU/driving-and-delivering/article/delivery-person-requirements?nodeId=8656c267-a46f-4a6c-a032-56560791254b"
      },
      {
        label: "Home Affairs｜Condition 8547",
        url: "https://immi.homeaffairs.gov.au/supporting/Pages/Work/6-month-work-limitation.aspx"
      },
      
    ],
    relatedSlugs: ["abn-guide", "doordash-guide", "tax-return-guide", "gig-work-comparison"],
    examples: {
      title: "配達を始める2つの例",
      items: [
        {
          title: "自転車で市内から始める",
          summary: "車を買わずに市街地の配達を試したい場合の例です。",
          details: [
            "車両区分を自転車で登録し、公式の書類・本人確認を先に完了します。登録状態が有効になるまで依頼を受けません。",
            "レンタル店なら、業務配達に使える契約か、盗難時の自己負担、ヘルメット・ライト・鍵が含まれるかを確認。保温バッグは登録中の装備案内を先に見ます。"
          ],
          links: [
            {
              label: "Uber Australia｜登録と装備",
              url: "https://www.uber.com/au/en/deliver/getting-started/"
            },
            {
              label: "配達手段の比較",
              url: "/guides/delivery-vehicle-comparison"
            }
          ]
        },
        {
          title: "手持ちの車で配達する",
          summary: "すでに車があり、燃料代と保険を含めても続けられるか試したい場合の例です。",
          details: [
            "車の登録書類等はアプリの要求に沿って提出し、保険会社に有償のフードデリバリー中の損害が補償されるかを書面で確認します。",
            "最初の週は売上と走行距離、燃料・駐車・その他の費用を別々に記録。経費を引く前の売上を手取りと見なさないようにします。"
          ],
          links: [
            {
              label: "配達中の保険を確認する",
              url: "/guides/delivery-insurance"
            },
            {
              label: "売上・経費の記録例",
              url: "/guides/delivery-expenses-logbook"
            }
          ]
        }
      ],
      intro: "登録費用だけでなく、始めるまでの日数、装備、保険、初回の手元に残る金額を比べます。"
    },
    updatedAt: "2026-11-19",
    published: true,
    procedure: {
      preparation: [
        {
          title: "本人確認・口座",
          items: [
            "パスポート、豪州の就労資格を確認できるビザ情報、ABN",
            "連絡可能なメール・携帯番号、振込用口座情報",
            "車・バイクは車両区分ごとに求められる免許・登録書類を公式一覧で確認"
          ]
        },
        {
          title: "配達装備",
          items: [
            "スマホ・充電手段、車両に合う保温バッグ",
            "自転車・バイクはヘルメット、ライトなど法令・安全上必要な装備",
            "購入・レンタルを決める前に、Uberの装備案内・利用地域の規則・保険の補償範囲を確認"
          ]
        }
      ],
      completion: "本人確認・書類審査などを通過し、Uber Driverでアカウントが有効になり、登録した車両で安全にオンラインにできたら準備完了です。"
    },
  },
];
