import Link from "next/link";
import type { Listing, ListingDetails } from "@/types/listing";
import { PAY_TYPES, ROOM_TYPES, SAFETY_NOTICES, TRANSMISSION_TYPES } from "@/lib/listingConfig";

type Row = { label: string; value: string };

function bool(v: boolean | undefined): string | null {
  if (v === undefined) return null;
  return v ? "あり" : "なし";
}

function lookup(options: readonly { value: string; label: string }[], value: string | undefined): string | null {
  if (!value) return null;
  return options.find((o) => o.value === value)?.label ?? value;
}

function buildRows(listing: Listing): Row[] {
  const d: ListingDetails = listing.details;
  const rows: (Row | null)[] = [];
  const add = (label: string, value: string | null | undefined) => {
    if (value) rows.push({ label, value });
  };

  switch (listing.listingType) {
    case "job":
    case "farm_job":
      add("事業者・店舗", d.businessName);
      add("業種", d.industry);
      add("雇用形態", d.employmentType);
      add("給与形態", lookup(PAY_TYPES, d.payType));
      add("給与", d.payAmount);
      add("勤務時間", d.hoursApprox);
      add("開始時期", d.startDate);
      add("ビザ・就労条件", d.workRights);
      add("応募条件", d.requirements);
      add("宿泊提供", bool(d.accommodationProvided));
      add("送迎・交通", bool(d.transportProvided));
      if (listing.listingType === "job" && d.farmRelevant) add("Specified work", "投稿者が関連ありと記載");
      break;
    case "housing":
      add("サバーブ", d.suburb);
      add("週家賃", d.weeklyRent ? `$${d.weeklyRent}` : null);
      add("ボンド", d.bond);
      add("部屋タイプ", lookup(ROOM_TYPES, d.roomType));
      add("入居可能日", d.availableDate);
      add("最短滞在", d.minStay);
      add("カップル可", bool(d.coupleAllowed));
      add("光熱費込み", bool(d.billsIncluded));
      add("家具付き", bool(d.furnished));
      add("駐車場", bool(d.parking));
      add("交通アクセス", d.transportAccess);
      add("ハウスルール", d.houseRules);
      break;
    case "roommate":
      add("希望エリア", d.preferredArea);
      add("希望入居時期", d.preferredMoveIn);
      add("予算", d.budgetApprox ? `$${d.budgetApprox}/週` : null);
      add("部屋", d.roomWantedOrOffered === "wanted" ? "探している" : d.roomWantedOrOffered === "offered" ? "提供する" : null);
      add("ライフスタイル", d.lifestyle);
      break;
    case "vehicle":
      add("メーカー", d.make);
      add("モデル", d.model);
      add("年式", d.year);
      add("価格", d.price ? `$${d.price}` : null);
      add("走行距離", d.odometer ? `${d.odometer} km` : null);
      add("ミッション", lookup(TRANSMISSION_TYPES, d.transmission));
      add("燃料", d.fuelType);
      add("州", d.state);
      add("Rego状況", d.regoStatus);
      add("Rego期限", d.regoExpiry);
      add("Roadworthy/Safety", d.roadworthy);
      add("整備履歴", d.serviceHistory);
      add("既知の不具合", d.knownIssues);
      break;
    case "marketplace":
      add("カテゴリ", d.category);
      add("価格", d.price ? `$${d.price}` : null);
      break;
  }
  return rows.filter((r): r is Row => r !== null);
}

export function ListingDetailBody({ listing }: { listing: Listing }) {
  const rows = buildRows(listing);
  const notice = SAFETY_NOTICES[listing.listingType];

  return (
    <div className="space-y-6">
      {rows.length > 0 ? (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-2">
          {rows.map((row) => (
            <div key={row.label} className="flex justify-between gap-3 border-b border-slate-100 py-1 text-sm">
              <dt className="text-slate-500">{row.label}</dt>
              <dd className="text-right font-medium text-slate-800">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-500">説明</h2>
        <p className="mt-2 whitespace-pre-wrap text-slate-800">{listing.description}</p>
      </div>

      {notice ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-semibold">{notice.title}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {notice.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          {notice.links && notice.links.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {notice.links.map((l) => (
                <Link key={l.href} href={l.href} className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-800">
                  {l.label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
