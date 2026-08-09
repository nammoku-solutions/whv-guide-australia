"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { ListingType } from "@/types/listing";
import {
  AU_STATES,
  EMPLOYMENT_TYPES,
  JOB_INDUSTRIES,
  PAY_TYPES,
  ROOM_TYPES,
  TRANSMISSION_TYPES,
} from "@/lib/listingConfig";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";

export function ListingFilters({ type }: { type: ListingType }) {
  const router = useRouter();
  const params = useSearchParams();
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    params.forEach((value, key) => {
      initial[key] = value;
    });
    return initial;
  });

  function set(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function apply() {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value);
    }
    const qs = next.toString();
    router.push(qs ? `?${qs}` : "?");
  }

  function reset() {
    setValues({});
    router.push("?");
  }

  const isJob = type === "job" || type === "farm_job";

  return (
    <form
      className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <label className="text-xs font-medium text-slate-600">
        エリア・場所
        <input
          value={values.location ?? ""}
          onChange={(e) => set("location", e.target.value)}
          placeholder="Sydney, Cairns..."
          className={inputClass}
        />
      </label>

      {isJob ? (
        <>
          <label className="text-xs font-medium text-slate-600">
            業種
            <select value={values.industry ?? ""} onChange={(e) => set("industry", e.target.value)} className={inputClass}>
              <option value="">すべて</option>
              {JOB_INDUSTRIES.map((i) => (
                <option key={i} value={i}>{i}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            雇用形態
            <select value={values.employmentType ?? ""} onChange={(e) => set("employmentType", e.target.value)} className={inputClass}>
              <option value="">すべて</option>
              {EMPLOYMENT_TYPES.map((i) => (
                <option key={i} value={i}>{i}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            給与形態
            <select value={values.payType ?? ""} onChange={(e) => set("payType", e.target.value)} className={inputClass}>
              <option value="">すべて</option>
              {PAY_TYPES.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </label>
          {type === "job" ? (
            <label className="text-xs font-medium text-slate-600">
              ファーム
              <select value={values.farm ?? ""} onChange={(e) => set("farm", e.target.value)} className={inputClass}>
                <option value="">すべて</option>
                <option value="farm">ファームのみ</option>
                <option value="non_farm">ファーム以外</option>
              </select>
            </label>
          ) : null}
        </>
      ) : null}

      {type === "housing" ? (
        <>
          <label className="text-xs font-medium text-slate-600">
            部屋タイプ
            <select value={values.roomType ?? ""} onChange={(e) => set("roomType", e.target.value)} className={inputClass}>
              <option value="">すべて</option>
              {ROOM_TYPES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            週家賃 上限 ($)
            <input value={values.maxRent ?? ""} onChange={(e) => set("maxRent", e.target.value)} inputMode="numeric" className={inputClass} />
          </label>
          <label className="flex items-end gap-2 text-xs font-medium text-slate-600">
            <input type="checkbox" checked={values.coupleAllowed === "1"} onChange={(e) => set("coupleAllowed", e.target.checked ? "1" : "")} />
            カップル可のみ
          </label>
        </>
      ) : null}

      {type === "vehicle" ? (
        <>
          <label className="text-xs font-medium text-slate-600">
            州
            <select value={values.state ?? ""} onChange={(e) => set("state", e.target.value)} className={inputClass}>
              <option value="">すべて</option>
              {AU_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            メーカー
            <input value={values.make ?? ""} onChange={(e) => set("make", e.target.value)} placeholder="Toyota..." className={inputClass} />
          </label>
          <label className="text-xs font-medium text-slate-600">
            ミッション
            <select value={values.transmission ?? ""} onChange={(e) => set("transmission", e.target.value)} className={inputClass}>
              <option value="">すべて</option>
              {TRANSMISSION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            価格 上限 ($)
            <input value={values.maxPrice ?? ""} onChange={(e) => set("maxPrice", e.target.value)} inputMode="numeric" className={inputClass} />
          </label>
        </>
      ) : null}

      <div className="col-span-full flex gap-2">
        <button type="submit" className="rounded-full bg-sky-700 px-4 py-2 text-sm font-semibold text-white">
          絞り込む
        </button>
        <button type="button" onClick={reset} className="rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-600">
          リセット
        </button>
      </div>
    </form>
  );
}
