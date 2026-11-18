import type { Article } from "./types";

export const carsArticles: Article[] = [
  {
    id: "a12",
    title: "車の購入とRego・保険｜州ごとのルールと名義変更",
    slug: "cars-guide",
    category: "cars",
    description: "ワーホリでの中古車購入、Rego（登録）、Roadworthy、CTP/任意保険の基礎を州別の注意点とともに解説します。",
    content: [
      "ファームや地方移動には車が便利です。中古車はGumtree、Facebook Marketplace、ディーラーで購入できます。州ごとにRego（登録）やRoadworthy Certificate（車検相当）のルールが異なるため、購入前に州の運輸局情報を確認しましょう。",
      "Rego費用にはCTP（強制対人保険）が含まれますが、対物・車両は任意保険が別途必要です。州をまたいで長期移動する場合はRegoの州も意識すると手続きがスムーズです。",
    ],
    keyFacts: [
      { label: "主な購入先", value: "Gumtree、Facebook Marketplace、中古車ディーラー" },
      { label: "Rego", value: "州ごとの登録。CTP（強制対人保険）を含む" },
      { label: "Roadworthy", value: "州により名義変更時に必要（例：QLD/VIC）" },
      { label: "任意保険", value: "Third Party Property以上の加入を推奨" },
    ],
    steps: [
      {
        title: "予算と必要な車種を絞る",
        description: "通勤先、道路条件、走行距離、駐車場所から選び、維持・保険・登録の予算を確保します。",
        links: [
          {
            label: "現車確認のチェックリスト",
            url: "/guides/used-car-inspection-checklist"
          }
        ]
      },
      {
        title: "車体番号・履歴・状態を確認する",
        description: "VINを照合し、PPSRで担保などを確認します。整備履歴、州の登録状態、車両の状態は別に確認します。",
        links: [
          {
            label: "PPSR公式照会",
            url: "https://www.ppsr.gov.au/carcheck"
          },
          {
            label: "照会結果の読み方",
            url: "/guides/ppsr-check-guide"
          }
        ]
      },
      {
        title: "州の名義変更と保険を確認して取引する",
        description: "州の名義変更に必要な書類と期限を確認し、売買の控えを残し、必要な保険を有効にします。",
        links: [
          {
            label: "州別の譲渡手続き",
            url: "/guides/vehicle-transfer-by-state"
          },
          {
            label: "保険の違いを確認",
            url: "/guides/car-insurance-comparison"
          }
        ]
      }
    ],
    tips: [
      "州によって名義変更の必要書類・期限が違います。購入する州の運輸局サイトを必ず確認しましょう。",
      "出国時の売却も見据え、人気車種（トヨタ等）は手放しやすくおすすめです。",
    ],
    warnings: ["Regoが切れた車の購入や、名義変更を怠ると罰金・トラブルの原因になります。"],
    faqs: [
      {
        question: "国際免許で運転できますか？",
        answer:
          "日本の免許＋国際運転免許証（IDP）で運転できます。長期滞在する場合は州によって現地免許への切り替えが必要になることがあるため、運転免許ガイドも確認してください。",
      },
    ],
    relatedSlugs: [
      "license-guide",
      "transport-payment-guide",
      "used-car-inspection-checklist",
      "ppsr-check-guide",
      "rego-ctp-rwc",
      "vehicle-transfer-by-state",
      "car-insurance-comparison",
      "roadside-assistance",
      "sell-car-before-leaving",
    ],
    updatedAt: "2026-11-18",
    published: true,
    procedure: {
      preparation: [
        {
          title: "購入前に用意",
          items: [
            "免許・翻訳書類、予算、住居・登録住所、必要な州の本人確認情報",
            "購入額だけでなく、名義変更、登録、保険、維持費も計上"
          ]
        }
      ],
      completion: "購入後の州の名義変更・必要な保険・登録の有効性を確認し、書類と領収書を保存します。"
    },
  },
];
