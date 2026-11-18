import type { Article } from "./types";

export const tfnArticles: Article[] = [
  {
    id: "a4",
    title: "TFN（タックスファイルナンバー）取得ガイド",
    slug: "tfn-guide",
    category: "tfn",
    description: "TFNは税務上の個人番号です。日本などの外国旅券で豪州に滞在中のワーホリ向けに、ATOの公式無料申請から受領・雇用主への申告までを解説します。",
    content: [
      "TFN（Tax File Number）は税務上の個人番号で、就労資格とは別です。働くには就労できるビザが必要ですが、TFNが届く前でも就労は可能です。TFNがないと源泉徴収が高くなる場合があるため、申請中なら雇用主に伝えてください。",
      "有効な就労資格で豪州にいる外国旅券保持者は、ATO公式のオンライン手続きで無料で申請できます。銀行口座開設はこの申請の前提ではありません。TFNを持っている場合は再申請しないでください。",
      "申請後の受領番号を控え、郵送でTFNを受け取れる住所を用意します。ATOは通知に最大28日を案内しています。"
    ],
    keyFacts: [
      {
        label: "費用",
        "value": "ATO公式で無料"
      },
      {
        label: "対象",
        "value": "豪州内の外国旅券保持者で有効な就労資格がある人"
      },
      {
        label: "受け取り",
        "value": "郵送。最大28日が目安"
      }
    ],
    steps: [
      {
        title: "使う申請ルートを確認する",
        description: "外国旅券で豪州にいる一時滞在者向けのオンライン申請を開きます。申請は無料です。",
        links: [
          {
            label: "ATO 外国旅券保持者向けの申請",
            url: "https://www.ato.gov.au/forms-and-instructions/tfn-application-for-permanent-migrants-and-temporary-visitors"
          }
        ]
      },
      {
        title: "フォームを記入する",
        description: "氏名と生年月日を旅券から転記し、郵便が届く住所を記入します。受取先を変える場合はATOに連絡してください。",
        checklist: [
          "就労資格とパスポートが同じ情報で確認できるようにする。",
          "画面の案内に従い、申請の受領番号を保存。"
        ]
      },
      {
        title: "郵送を確認し、受け取った番号を保管する",
        description: "ATOはTFN通知の郵送に最大28日を案内しています。届かなければ受領番号を手元に置いてATOに問い合わせます。",
        links: [
          {
            label: "ATOへの連絡方法",
            url: "https://www.ato.gov.au/about-ato/contact-us"
          }
        ]
      },
      {
        title: "雇用主にTFN申告をする",
        description: "番号がなくても就労資格があれば雇用自体は可能です。申請中なら雇用主に伝え、申告フォームの該当欄と適用期限を確認します。",
        links: [
          {
            label: "TFN申告フォームの案内",
            url: "/guides/tfn-declaration-form"
          }
        ]
      }
    ],
    tips: [
      "TFNは雇用主・銀行・myGovで使います。届いたら写真に撮ってクラウドに保管を。",
      "TFNを他人に教えるのは雇用主・銀行・ATOなど正規の相手だけ。SNSや見知らぬ相手には絶対に伝えないこと。",
    ],
    faqs: [
      {
        "question": "TFNとABNはどう違いますか？",
        "answer": "TFNは税務上の個人番号です。ABNは事業を識別する番号です。雇用として行う仕事のためだけにABNを取得する必要はありません。"
      }
    ],
    sources: [
      {
        label: "ATO｜外国旅券保持者のTFNオンライン申請",
        url: "https://www.ato.gov.au/forms-and-instructions/tfn-application-for-permanent-migrants-and-temporary-visitors"
      },
      {
        label: "ATO｜雇用主へのTFN申告",
        url: "https://www.ato.gov.au/forms-and-instructions/tfn-declaration/access-the-tfn-declaration-form"
      }
    ],
    relatedSlugs: ["abn-guide", "tax-return-guide", "bank-account-guide", "whm-tax-rates"],
    updatedAt: "2026-11-18",
    published: true,
    procedure: {
      preparation: [
        {
          title: "申請情報",
          items: [
            "オーストラリアに滞在中で、外国旅券と有効な就労資格があること",
            "パスポートの氏名・番号、生年月日、受け取れる豪州の郵送先と連絡先"
          ]
        },
        {
          title: "二重申請を防ぐ",
          items: [
            "以前にTFNを取得した人は新規申請せず、ATOで既存番号を確認する"
          ]
        }
      ],
      completion: "TFN通知を安全に保管し、雇用主へ必要な申告書で番号を提出したら完了。求人応募の段階で公開・送信する必要はありません。"
    },
  },

  {
    id: "a118",
    title: "TFN Declarationの書き方｜入社時に迷いやすい項目",
    slug: "tfn-declaration-form",
    category: "tfn",
    hub: "tax",
    priority: "P0",
    searchIntent: "TFN Declarationの記入方法",
    description:
      "入社時に提出するTFN Declaration（納税者番号申告）の記入方法を解説。オンライン提出と紙（NAT 3092）の違い、居住区分・Tax-free threshold・学資ローンなどワーホリが迷いやすい項目を整理します。",
    content: [
      "TFN Declaration（Tax file number declaration）は、雇用主があなたの給与からいくら源泉徴収（Tax）するかを決めるための申告書です。入社時に必ず提出し、これを出さないと雇用主は最も高い税率で天引きするため、手取りが大きく減ります。結論として、TFNを記入して正しい居住区分を選び、雇用主に提出することが最初のポイントです。",
      "提出方法は主に3つあります。①雇用主が使う給与システム（オンボーディング画面）で入力する、②ATOオンラインサービス（myGov経由）の「New employment」から入力して雇用主と共有する、③紙の様式（NAT 3092、ATOに注文）に記入して渡す。多くの職場は①か②で、紙をその場で書くケースは減っています。どの方法でも記入する内容（質問項目）は同じです。",
      "ワーホリ（サブクラス417・462）で特に重要なのは、雇用主が『Working Holiday Maker（WHM）employer』としてATOに登録しているかどうかです。登録済みの雇用主は、あなたの給与を年間45,000 AUDまで15%のWHM税率で源泉徴収します。未登録の雇用主は外国居住者向けの高い率で天引きするため、入社時に『ワーホリビザで働く』ことを明確に伝えましょう。",
      "迷いやすい項目を整理します。【TFN】必ず記入。未取得なら先にTFNを申請してください。【居住区分（residency for tax purposes）】税務上の居住者か非居住者かを問う項目で、ビザの種類とは別概念です。判断に迷う場合は自己判定し、必要ならATOのツールで確認します。【Tax-free threshold（免税枠）を申請するか】通常は『メインの勤務先1か所だけ』で申請します。複数の職場を掛け持ちする場合、2つ目以降では申請しないのが一般的です（申告漏れ・追徴を避けるため）。ただしWHMは最初の1ドルから15%課税のため、免税枠の扱いは通常の従業員と異なります。【HELP/学資ローン】オーストラリアの学生ローンがない人（ワーホリの大半）は『No』です。",
      "記入内容は後からタックスリターンで精算されるため、源泉徴収が多すぎた場合は還付されます。とはいえ、居住区分や免税枠の選択を誤ると毎回の手取りや年度末の追徴に影響するので、分からない項目は雇用主の経理担当かATO（電話13 28 61）に確認してから提出しましょう。",
    ],
    keyFacts: [
      { label: "目的", value: "雇用主が源泉徴収額を決めるための申告" },
      { label: "提出方法", value: "給与システム／ATOオンライン（myGov）／紙 NAT 3092" },
      { label: "提出しないと", value: "最高税率で源泉徴収され手取りが激減" },
      { label: "WHMの注意", value: "雇用主がWHM employer登録済みか確認（15%適用の条件）" },
    ],
    steps: [
      {
        title: "雇用主の案内とATOフォームを確認する",
        description: "TFN申告は本人の新規TFN申請とは別です。書面・オンラインのうち雇用主の案内を確認します。",
        links: [
          {
            label: "ATOの申告フォーム",
            url: "https://www.ato.gov.au/forms-and-instructions/tfn-declaration/access-the-tfn-declaration-form"
          }
        ]
      },
      {
        title: "必要項目を埋めて提出する",
        description: "就労区分と本人情報を確認。TFNを申請中ならその旨を申告し、届いたら雇用主に連絡します。",
        links: [
          {
            label: "TFNがない場合の申請",
            url: "/guides/tfn-guide"
          },
          {
            label: "ATO ワーホリの税務上の扱い",
            url: "https://www.ato.gov.au/individuals-and-families/coming-to-australia-or-going-overseas/coming-to-australia/working-holiday-makers"
          }
        ]
      },
      {
        title: "給与明細を確認する",
        description: "申告後の源泉徴収と給与明細を確認し、疑問があれば給与担当に確認します。",
        links: [
          {
            label: "給与明細の読み方",
            url: "/guides/payslip-guide"
          }
        ]
      }
    ],
    tips: [
      "掛け持ちで2か所以上から給与を受ける場合、免税枠の重複申請は年度末の追徴の原因になります。主たる勤務先1か所のみで申請しましょう。",
      "『ワーホリビザで働く』ことを入社時に伝え、雇用主がWHM employer登録済みか確認すると、15%の適正な源泉徴収になります。",
    ],
    faqs: [
      {
        question: "TFN DeclarationとTFNの申請は別ですか？",
        answer:
          "別です。TFNの申請は納税者番号そのものを取得する手続き（ATOで無料）。TFN Declarationは、取得したTFNを雇用主に伝え、源泉徴収の条件を申告する入社時の書類です。先にTFNを取得してからDeclarationを提出します。",
      },
      {
        question: "免税枠（Tax-free threshold）は申請すべきですか？",
        answer:
          "勤務先が1か所なら通常申請します。複数を掛け持ちする場合は、主たる1か所のみで申請し、他では申請しないのが基本です。ワーホリは最初の1ドルから15%課税されるため扱いが特殊で、迷う場合は雇用主の経理かATOに確認してください。",
      },
    ],
    sources: [
      { label: "ATO - Tax file number declaration", url: "https://www.ato.gov.au/forms-and-instructions/tfn-declaration" },
    ],
    verifiedAt: "2026-07-18",
    officialSources: [
      {
        label: "ATO｜Tax file number declaration（記入と提出方法）",
        url: "https://www.ato.gov.au/forms-and-instructions/tfn-declaration",
        accessedAt: "2026-07-18",
      },
      {
        label: "ATO｜Tax rates – working holiday maker（WHM税率）",
        url: "https://www.ato.gov.au/tax-rates-and-codes/tax-rates-working-holiday-makers",
        accessedAt: "2026-07-18",
      },
    ],
    relatedSlugs: ["tfn-guide", "whm-tax-rates", "payslip-guide", "tax-return-guide", "tax-return-multiple-jobs"],
    updatedAt: "2026-11-18",
    published: true,
    procedure: {
      preparation: [
        {
          title: "提出前",
          items: [
            "正規の雇用主、新規のTFN申告かどうか、既存のTFNまたは申請中の情報",
            "雇用主から案内されたオンライン手続きまたは公式フォーム"
          ]
        }
      ],
      completion: "雇用主に安全な方法で申告を提出し、初回給与で源泉徴収を確認できたら完了です。"
    },
  },
];
