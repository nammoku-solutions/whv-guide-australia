import type { Article } from "./types";

export const doordashArticles: Article[] = [
  {
    id: "a9",
    title: "DoorDash配達の基礎｜登録とエリア戦略",
    slug: "doordash-guide",
    category: "doordash",
    description: "DoorDashの登録手順と、稼ぎやすいエリア選び・評価維持のコツを解説します。",
    content: [
      "DoorDashの豪州版を開き、稼働地域と車両を選びます。就労資格とABNが必要で、登録時に本人確認とバックグラウンドチェックの指示に従います。",
      "報酬や案件数は地域・時間・案件によって変動し、登録や高評価だけでは配達の依頼が来る保証はありません。Fair Workの対象となるフードデリバリー配達員には、対象稼働時間（engaged time）をもとにした最低報酬と不足分の補填ルールがあります。待機を含む全オンライン時間への通常時給ではありません。",
      "Condition 8547の6か月ルールは、自営業にも適用され得ます。Home Affairsは自営業の雇用主をサービスの最終利用先（end user）として扱います。単独の提供先に6か月を超えて継続する場合は、例外または書面による許可を確認してください。アプリへの複数登録だけで例外になるとは限りません。"
    ],
    keyFacts: [
      { label: "必要なもの", value: "ABN、配達手段、保温バッグ、スマホ" },
      { label: "特徴", value: "地域によりUber Eatsより案件が多い場合あり" },
      { label: "報酬", value: "配達ごとの報酬＋チップ（Dasher Pay）" },
      { label: "税金", value: "ABN収入のため確定申告が必要" },
    ],
    steps: [
      {
        title: "Australia版の登録を開く",
        description: "公式Dasherページから対象エリアを確認し、登録します。同じアカウントでDasherアプリにログインします。",
        links: [
          {
            label: "DoorDash Australiaで登録",
            url: "https://dasher.doordash.com/en-au"
          }
        ]
      },
      {
        title: "必要情報を提出して審査を受ける",
        description: "画面に従って本人確認情報、就労資格、ABNを入力し、豪州版のバックグラウンドチェックに同意します。",
        links: [
          {
            label: "ABNの申請方法",
            url: "/guides/abn-guide"
          }
        ]
      },
      {
        title: "車両に合う装備をそろえる",
        description: "保温バッグとスマホの電源、安全装備を用意します。登録画面やアプリの案内で、DoorDashから受け取れる装備があるかを確認してから買い足します。",
        links: [
          {
            label: "DoorDash Australia 装備・登録のFAQ",
            url: "https://dasher.doordash.com/en-au"
          },
          {
            label: "保険の確認項目",
            url: "/guides/delivery-insurance"
          }
        ]
      },
      {
        title: "稼働と振込の準備を確認する",
        description: "審査結果、振込口座、エリア、配達車両を確認し、アプリの案内に従い稼働を開始。明細と費用を記録します。",
        links: [
          {
            label: "Fair Work 配達の最低基準",
            url: "https://www.fairwork.gov.au/find-help-for/regulated-workers/minimum-standards-for-on-demand-delivery-workers/rules-in-the-on-demand-delivery-order"
          },
          {
            label: "配達の税金と記録",
            url: "/guides/delivery-abn-tax"
          }
        ]
      }
    ],
    tips: [
      "Uber EatsとDoorDashの両方をオンラインにして、報酬の良い案件を選ぶ「ダブルアップ」が定番です。",
      "ピーク時間帯のプロモーション（追加報酬）を狙うと時給効率が上がります。",
    ],
    sources: [
      {
        label: "DoorDash Australia｜Dasher公式登録",
        url: "https://dasher.doordash.com/en-au"
      },
      {
        label: "Fair Work｜配達の最低基準",
        url: "https://www.fairwork.gov.au/find-help-for/regulated-workers/minimum-standards-for-on-demand-delivery-workers/rules-in-the-on-demand-delivery-order"
      },
      {
        label: "Home Affairs｜Condition 8547",
        url: "https://immi.homeaffairs.gov.au/supporting/Pages/Work/6-month-work-limitation.aspx"
      }
    ],
    relatedSlugs: ["uber-eats-guide", "abn-guide"],
    updatedAt: "2026-11-18",
    published: true,
    procedure: {
      preparation: [
        {
          title: "本人確認・口座",
          items: [
            "パスポートなどの身分証、豪州の就労資格、ABN",
            "携帯番号・メール、振込用口座情報。車両別に必要な免許や保険も確認"
          ]
        },
        {
          title: "配達装備",
          items: [
            "スマホと充電手段、車両に合う保温バッグ、安全装備",
            "登録案内で受け取る装備と、自分で購入するものを分ける"
          ]
        }
      ],
      completion: "Dasherアプリで本人確認・審査が完了し、振込先と稼働エリアを確認して、初回の配達を受けられる状態になれば準備完了です。"
    },
  },
];
