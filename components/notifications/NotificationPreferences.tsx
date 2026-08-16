"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { hasSupabaseEnv } from "@/lib/supabaseClient";
import {
  DEFAULT_PREFERENCES,
  getPreferences,
  savePreferences,
  type NotificationPreferences,
} from "@/lib/notifications";

const FIELDS: { key: keyof NotificationPreferences; label: string; hint: string }[] = [
  { key: "importantNews", label: "重要な公式情報", hint: "ビザ・税・費用などの重要ニュース" },
  { key: "savedArticleUpdated", label: "保存した記事の更新", hint: "内容が実際に更新されたときのみ通知" },
  { key: "savedListingUpdated", label: "保存した掲載の変更・終了", hint: "募集終了・期限切れなど" },
  { key: "applicationUpdates", label: "応募のステータス", hint: "応募の確認・連絡・結果など" },
  { key: "communityReplies", label: "コミュニティの返信", hint: "自分の投稿へのコメント" },
  { key: "matchingListings", label: "条件に合う新着掲載", hint: "保存した検索条件に合う新着（提供準備中）" },
];

export function NotificationPreferencesForm() {
  const { isLoggedIn, profile, loading } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (loading || !isLoggedIn) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (!loading) setReady(true);
      return;
    }
    let active = true;
    void getPreferences().then((p) => {
      if (active) {
        setPrefs(p);
        setReady(true);
      }
    });
    return () => {
      active = false;
    };
  }, [loading, isLoggedIn]);

  if (loading || !ready || !isLoggedIn || !hasSupabaseEnv) return null;

  async function toggle(key: keyof NotificationPreferences) {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setSaving(true);
    setNote("");
    await savePreferences(profile.id, next);
    setSaving(false);
    setNote("保存しました。");
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">通知の設定</h2>
        {saving ? <span className="text-xs text-slate-400">保存中…</span> : note ? <span className="text-xs text-emerald-600">{note}</span> : null}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        受け取りたいアプリ内通知の種類を選べます（現在はアプリ内通知のみ。メール・プッシュは今後対応予定）。
      </p>
      <ul className="mt-4 space-y-3">
        {FIELDS.map((f) => (
          <li key={f.key} className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-800">{f.label}</p>
              <p className="text-xs text-slate-500">{f.hint}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={prefs[f.key]}
              aria-label={f.label}
              onClick={() => void toggle(f.key)}
              className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition ${
                prefs[f.key] ? "bg-sky-600" : "bg-slate-300"
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${
                  prefs[f.key] ? "left-[1.375rem]" : "left-0.5"
                }`}
              />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
