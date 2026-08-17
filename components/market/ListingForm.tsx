"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { hasSupabaseEnv, supabase } from "@/lib/supabaseClient";
import { ListingImageUpload } from "@/components/market/ListingImageUpload";
import { trackEvent } from "@/lib/analytics";
import {
  AU_STATES,
  CONTACT_METHODS,
  computeExpiryDate,
  EMPLOYMENT_TYPES,
  getListingTypeConfig,
  JOB_INDUSTRIES,
  MARKETPLACE_ITEM_KINDS,
  PAY_TYPES,
  ROOM_TYPES,
  SAFETY_NOTICES,
  TRANSMISSION_TYPES,
} from "@/lib/listingConfig";
import { normalizePhotoOrder } from "@/lib/photoOrder";
import type {
  ContactMethod,
  Listing,
  ListingDetails,
  ListingType,
  PostingMode,
} from "@/types/listing";

const inputClass = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
const labelClass = "block text-sm font-medium text-slate-700";

type Props = {
  // 新規作成時は type（＋任意の subcategory）、編集時は listing を渡す。
  type?: ListingType;
  subcategory?: string;
  listing?: Listing;
};

/** 新規作成時、サブカテゴリに応じた details の初期値。 */
function presetDetails(subcategory?: string): ListingDetails {
  switch (subcategory) {
    case "wanted":
      return { roomWantedOrOffered: "wanted" };
    case "sharemate":
      return { roomWantedOrOffered: "offered" };
    case "furniture":
      return { category: "furniture" };
    case "daily":
      return { category: "daily" };
    case "other":
      return { category: "other" };
    default:
      return {};
  }
}

export function ListingForm({ type, subcategory, listing }: Props) {
  const { profile, canAct, isLoggedIn } = useAuth();
  const router = useRouter();
  const isEdit = Boolean(listing);
  const listingType = (listing?.listingType ?? type) as ListingType;
  const config = getListingTypeConfig(listingType);
  const isJob = listingType === "job" || listingType === "farm_job";
  const isModerator = profile.role === "moderator" || profile.role === "admin";

  const [title, setTitle] = useState(listing?.title ?? "");
  const [description, setDescription] = useState(listing?.description ?? "");
  const [location, setLocation] = useState(listing?.location ?? "");
  const [contactMethod, setContactMethod] = useState<ContactMethod>(
    listing?.contactMethod ?? (isJob ? "application" : "enquiry"),
  );
  const [contactValue, setContactValue] = useState(listing?.contactValue ?? "");
  const [postingMode, setPostingMode] = useState<PostingMode>(listing?.postingMode ?? "self");
  const [representedParty, setRepresentedParty] = useState(listing?.representedParty ?? "");
  const [images, setImages] = useState<string[]>(listing?.images ?? []);
  const [details, setDetails] = useState<ListingDetails>(
    listing?.details ?? presetDetails(subcategory),
  );
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const notice = SAFETY_NOTICES[listingType];

  function set<K extends keyof ListingDetails>(key: K, value: ListingDetails[K]) {
    setDetails((prev) => ({ ...prev, [key]: value }));
  }

  const showContactValue = useMemo(
    () => contactMethod === "email" || contactMethod === "phone" || contactMethod === "external",
    [contactMethod],
  );

  async function onSubmit(saveAsDraft = false) {
    if (!hasSupabaseEnv || !supabase || !profile) {
      setMessage("現在この機能は利用できません。");
      return;
    }
    if (!canAct) {
      setMessage("掲載するには本人確認（メール・電話番号認証）が必要です。");
      return;
    }
    if (!title.trim() || !description.trim()) {
      setMessage("タイトルと説明を入力してください。");
      return;
    }
    if (postingMode === "delegated" && !representedParty.trim()) {
      setMessage("掲載代行の場合は代理先（掲載を依頼した相手）の名前を入力してください。");
      return;
    }

    setSubmitting(true);
    setMessage("");

    const row = {
      listing_type: listingType,
      user_id: profile.id,
      title: title.trim(),
      description: description.trim(),
      location: location.trim() || null,
      status: saveAsDraft ? "draft" : "active",
      contact_method: contactMethod,
      contact_value: showContactValue ? contactValue.trim() || null : null,
      posting_mode: isModerator ? postingMode : "self",
      represented_party: isModerator && postingMode === "delegated" ? representedParty.trim() : null,
      images: config.supportsImages ? normalizePhotoOrder(images) : [],
      details,
    };

    if (isEdit && listing) {
      const { error } = await supabase.from("listings").update(row).eq("id", listing.id);
      if (error) {
        setMessage("更新に失敗しました。時間をおいて再度お試しください。");
        setSubmitting(false);
        return;
      }
      router.push(`/community/market/listing/${listing.id}`);
      router.refresh();
      return;
    }

    const expires_at = computeExpiryDate(listingType);
    const { data, error } = await supabase
      .from("listings")
      .insert({ ...row, expires_at })
      .select("id")
      .single();

    if (error || !data) {
      setMessage("掲載に失敗しました。時間をおいて再度お試しください。");
      setSubmitting(false);
      return;
    }
    trackEvent("listing_create", { listing_type: listingType });
    router.push(`/community/market/listing/${data.id}`);
    router.refresh();
  }

  if (!isLoggedIn) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        掲載には{" "}
        <Link href="/login" className="font-semibold underline">
          ログイン
        </Link>{" "}
        が必要です。
      </div>
    );
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit(false);
      }}
    >
      {!canAct ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          掲載するにはメール・電話番号の本人確認が必要です。
        </p>
      ) : null}

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-bold text-slate-900">
          {config.emoji} {config.label}の{isEdit ? "編集" : "掲載"}
        </h2>

        <label className={labelClass}>
          タイトル<span className="text-rose-600">*</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className={inputClass} />
        </label>

        <label className={labelClass}>
          場所・エリア
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="例: Sydney CBD, NSW" className={inputClass} />
        </label>

        {renderTypeFields(listingType, details, set, isJob)}

        <label className={labelClass}>
          説明<span className="text-rose-600">*</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={6} maxLength={4000} className={inputClass} />
        </label>

        {config.supportsImages ? (
          <div>
            <span className={labelClass}>写真</span>
            <div className="mt-1">
              <ListingImageUpload value={images} onChange={setImages} userId={profile.id} disabled={!canAct} />
            </div>
          </div>
        ) : null}
      </section>

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="font-semibold text-slate-900">連絡・応募方法</h3>
        <label className={labelClass}>
          連絡方法
          <select value={contactMethod} onChange={(e) => setContactMethod(e.target.value as ContactMethod)} className={inputClass}>
            {CONTACT_METHODS.filter((m) => isJob || m.value !== "application").map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </label>
        <p className="text-xs text-slate-500">
          {CONTACT_METHODS.find((m) => m.value === contactMethod)?.hint}
        </p>
        {showContactValue ? (
          <label className={labelClass}>
            {contactMethod === "email" ? "メールアドレス" : contactMethod === "phone" ? "電話番号" : "URL"}
            <input value={contactValue} onChange={(e) => setContactValue(e.target.value)} className={inputClass} />
            <span className="mt-1 block text-xs text-amber-700">
              この情報は公開ページに表示されます。公開したくない場合は「サイト内」を選んでください。
            </span>
          </label>
        ) : null}
      </section>

      {isModerator ? (
        <section className="space-y-3 rounded-2xl border border-violet-200 bg-violet-50 p-5">
          <h3 className="font-semibold text-violet-900">掲載モード（運営者のみ）</h3>
          <label className={labelClass}>
            モード
            <select value={postingMode} onChange={(e) => setPostingMode(e.target.value as PostingMode)} className={inputClass}>
              <option value="self">通常（自分名義）</option>
              <option value="operator">運営公式</option>
              <option value="delegated">掲載代行</option>
            </select>
          </label>
          {postingMode === "delegated" ? (
            <label className={labelClass}>
              代理先（掲載を依頼した相手）の表示名
              <input value={representedParty} onChange={(e) => setRepresentedParty(e.target.value)} className={inputClass} />
              <span className="mt-1 block text-xs text-violet-700">
                許可を得た上で代理掲載していることを明示します。
              </span>
            </label>
          ) : null}
        </section>
      ) : null}

      {notice ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">{notice.title}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {notice.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {message ? <p className="text-sm text-rose-700">{message}</p> : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={!canAct || submitting}
          className="rounded-full bg-sky-700 px-6 py-2.5 text-sm font-semibold text-white disabled:bg-slate-300"
        >
          {submitting ? "送信中…" : isEdit ? "更新する" : "掲載する"}
        </button>
        {!isEdit ? (
          <button
            type="button"
            onClick={() => void onSubmit(true)}
            disabled={!canAct || submitting}
            className="rounded-full border border-slate-300 px-6 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            下書き保存
          </button>
        ) : null}
      </div>
    </form>
  );
}

type SetFn = <K extends keyof ListingDetails>(key: K, value: ListingDetails[K]) => void;

function renderTypeFields(type: ListingType, d: ListingDetails, set: SetFn, isJob: boolean) {
  if (isJob) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="事業者・店舗名">
          <input value={d.businessName ?? ""} onChange={(e) => set("businessName", e.target.value)} className={inputClass} />
        </Field>
        <Field label="業種">
          <select value={d.industry ?? ""} onChange={(e) => set("industry", e.target.value)} className={inputClass}>
            <option value="">選択してください</option>
            {JOB_INDUSTRIES.map((i) => (<option key={i} value={i}>{i}</option>))}
          </select>
        </Field>
        <Field label="雇用形態">
          <select value={d.employmentType ?? ""} onChange={(e) => set("employmentType", e.target.value)} className={inputClass}>
            <option value="">選択してください</option>
            {EMPLOYMENT_TYPES.map((i) => (<option key={i} value={i}>{i}</option>))}
          </select>
        </Field>
        <Field label="給与形態">
          <select value={d.payType ?? ""} onChange={(e) => set("payType", e.target.value)} className={inputClass}>
            <option value="">選択してください</option>
            {PAY_TYPES.map((p) => (<option key={p.value} value={p.value}>{p.label}</option>))}
          </select>
        </Field>
        <Field label="給与（投稿者記載）">
          <input value={d.payAmount ?? ""} onChange={(e) => set("payAmount", e.target.value)} placeholder="例: $28.5/h" className={inputClass} />
        </Field>
        <Field label="おおよその勤務時間">
          <input value={d.hoursApprox ?? ""} onChange={(e) => set("hoursApprox", e.target.value)} placeholder="例: 週30時間" className={inputClass} />
        </Field>
        <Field label="開始時期">
          <input value={d.startDate ?? ""} onChange={(e) => set("startDate", e.target.value)} className={inputClass} />
        </Field>
        <Field label="ビザ・就労条件（投稿者記載）">
          <input value={d.workRights ?? ""} onChange={(e) => set("workRights", e.target.value)} className={inputClass} />
        </Field>
        <Field label="応募条件・求めるスキル">
          <input value={d.requirements ?? ""} onChange={(e) => set("requirements", e.target.value)} className={inputClass} />
        </Field>
        <div className="flex flex-wrap gap-4 sm:col-span-2">
          <Checkbox label="住み込み・宿泊提供あり" checked={!!d.accommodationProvided} onChange={(v) => set("accommodationProvided", v)} />
          <Checkbox label="送迎・交通提供あり" checked={!!d.transportProvided} onChange={(v) => set("transportProvided", v)} />
          {type === "job" ? (
            <Checkbox label="Specified work（88日等）関連だと投稿者が明示" checked={!!d.farmRelevant} onChange={(v) => set("farmRelevant", v)} />
          ) : null}
        </div>
      </div>
    );
  }

  if (type === "housing") {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="サバーブ・エリア">
          <input value={d.suburb ?? ""} onChange={(e) => set("suburb", e.target.value)} className={inputClass} />
        </Field>
        <Field label="週家賃 ($)">
          <input value={d.weeklyRent ?? ""} onChange={(e) => set("weeklyRent", e.target.value)} inputMode="numeric" className={inputClass} />
        </Field>
        <Field label="ボンド (bond)">
          <input value={d.bond ?? ""} onChange={(e) => set("bond", e.target.value)} className={inputClass} />
        </Field>
        <Field label="部屋タイプ">
          <select value={d.roomType ?? ""} onChange={(e) => set("roomType", e.target.value)} className={inputClass}>
            <option value="">選択してください</option>
            {ROOM_TYPES.map((r) => (<option key={r.value} value={r.value}>{r.label}</option>))}
          </select>
        </Field>
        <Field label="入居可能日">
          <input value={d.availableDate ?? ""} onChange={(e) => set("availableDate", e.target.value)} className={inputClass} />
        </Field>
        <Field label="最短滞在期間">
          <input value={d.minStay ?? ""} onChange={(e) => set("minStay", e.target.value)} className={inputClass} />
        </Field>
        <Field label="交通アクセス">
          <input value={d.transportAccess ?? ""} onChange={(e) => set("transportAccess", e.target.value)} className={inputClass} />
        </Field>
        <Field label="ハウスルール">
          <input value={d.houseRules ?? ""} onChange={(e) => set("houseRules", e.target.value)} className={inputClass} />
        </Field>
        <div className="flex flex-wrap gap-4 sm:col-span-2">
          <Checkbox label="カップル可" checked={!!d.coupleAllowed} onChange={(v) => set("coupleAllowed", v)} />
          <Checkbox label="光熱費込み" checked={!!d.billsIncluded} onChange={(v) => set("billsIncluded", v)} />
          <Checkbox label="家具付き" checked={!!d.furnished} onChange={(v) => set("furnished", v)} />
          <Checkbox label="駐車場あり" checked={!!d.parking} onChange={(v) => set("parking", v)} />
        </div>
      </div>
    );
  }

  if (type === "roommate") {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="希望エリア">
          <input value={d.preferredArea ?? ""} onChange={(e) => set("preferredArea", e.target.value)} className={inputClass} />
        </Field>
        <Field label="希望入居時期">
          <input value={d.preferredMoveIn ?? ""} onChange={(e) => set("preferredMoveIn", e.target.value)} className={inputClass} />
        </Field>
        <Field label="おおよその予算 ($/週)">
          <input value={d.budgetApprox ?? ""} onChange={(e) => set("budgetApprox", e.target.value)} inputMode="numeric" className={inputClass} />
        </Field>
        <Field label="部屋を探している / 提供する">
          <select value={d.roomWantedOrOffered ?? ""} onChange={(e) => set("roomWantedOrOffered", e.target.value)} className={inputClass}>
            <option value="">選択してください</option>
            <option value="wanted">部屋を探している</option>
            <option value="offered">部屋を提供する</option>
          </select>
        </Field>
        <Field label="ライフスタイル・希望">
          <input value={d.lifestyle ?? ""} onChange={(e) => set("lifestyle", e.target.value)} className={inputClass} />
        </Field>
      </div>
    );
  }

  if (type === "vehicle") {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="メーカー"><input value={d.make ?? ""} onChange={(e) => set("make", e.target.value)} className={inputClass} /></Field>
        <Field label="モデル"><input value={d.model ?? ""} onChange={(e) => set("model", e.target.value)} className={inputClass} /></Field>
        <Field label="年式"><input value={d.year ?? ""} onChange={(e) => set("year", e.target.value)} inputMode="numeric" className={inputClass} /></Field>
        <Field label="価格 ($)"><input value={d.price ?? ""} onChange={(e) => set("price", e.target.value)} inputMode="numeric" className={inputClass} /></Field>
        <Field label="走行距離 (km)"><input value={d.odometer ?? ""} onChange={(e) => set("odometer", e.target.value)} inputMode="numeric" className={inputClass} /></Field>
        <Field label="ミッション">
          <select value={d.transmission ?? ""} onChange={(e) => set("transmission", e.target.value)} className={inputClass}>
            <option value="">選択してください</option>
            {TRANSMISSION_TYPES.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
          </select>
        </Field>
        <Field label="燃料"><input value={d.fuelType ?? ""} onChange={(e) => set("fuelType", e.target.value)} className={inputClass} /></Field>
        <Field label="州">
          <select value={d.state ?? ""} onChange={(e) => set("state", e.target.value)} className={inputClass}>
            <option value="">選択してください</option>
            {AU_STATES.map((s) => (<option key={s} value={s}>{s}</option>))}
          </select>
        </Field>
        <Field label="Rego（登録）状況"><input value={d.regoStatus ?? ""} onChange={(e) => set("regoStatus", e.target.value)} className={inputClass} /></Field>
        <Field label="Rego 有効期限"><input value={d.regoExpiry ?? ""} onChange={(e) => set("regoExpiry", e.target.value)} className={inputClass} /></Field>
        <Field label="Roadworthy / Safety Certificate"><input value={d.roadworthy ?? ""} onChange={(e) => set("roadworthy", e.target.value)} className={inputClass} /></Field>
        <Field label="整備履歴"><input value={d.serviceHistory ?? ""} onChange={(e) => set("serviceHistory", e.target.value)} className={inputClass} /></Field>
        <Field label="既知の不具合"><input value={d.knownIssues ?? ""} onChange={(e) => set("knownIssues", e.target.value)} className={inputClass} /></Field>
      </div>
    );
  }

  // marketplace
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="カテゴリ">
        <select value={d.category ?? ""} onChange={(e) => set("category", e.target.value)} className={inputClass}>
          <option value="">選択してください</option>
          {MARKETPLACE_ITEM_KINDS.map((k) => (
            <option key={k.value} value={k.value}>{k.label}</option>
          ))}
        </select>
      </Field>
      <Field label="価格 ($)"><input value={d.price ?? ""} onChange={(e) => set("price", e.target.value)} inputMode="numeric" className={inputClass} /></Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className={labelClass}>
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
