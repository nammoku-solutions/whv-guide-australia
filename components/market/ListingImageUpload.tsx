"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { movePhotoBy, removePhotoAt } from "@/lib/photoOrder";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_IMAGES = 6;
const BUCKET = "listing-images";

type Props = {
  value: string[];
  onChange: (urls: string[]) => void;
  userId: string;
  disabled?: boolean;
};

export function ListingImageUpload({ value, onChange, userId, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0 || !supabase) return;
    setError("");

    const remaining = MAX_IMAGES - value.length;
    if (remaining <= 0) {
      setError(`画像は最大${MAX_IMAGES}枚までです。`);
      return;
    }

    const selected = Array.from(files).slice(0, remaining);
    for (const file of selected) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError("対応形式は JPEG / PNG / WebP のみです。");
        return;
      }
      if (file.size > MAX_BYTES) {
        setError("1ファイル 5MB 以下にしてください。");
        return;
      }
    }

    setUploading(true);
    const uploaded: string[] = [];
    for (const file of selected) {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (upErr) {
        setError(
          "画像のアップロードに失敗しました。ストレージ設定を確認してください（bucket: listing-images）。",
        );
        setUploading(false);
        return;
      }
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      uploaded.push(data.publicUrl);
    }
    // 新規追加は末尾へ（既存の並び順と先頭のメイン画像を保持）。
    onChange([...value, ...uploaded]);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function removeAt(index: number) {
    // 削除後は残りの順序を保持（配列順が正規なので正規化は不要）。
    onChange(removePhotoAt(value, index));
  }

  function move(index: number, delta: number) {
    onChange(movePhotoBy(value, index, delta));
  }

  // --- desktop drag-and-drop ---
  function onDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      return;
    }
    onChange(movePhotoBy(value, dragIndex, targetIndex - dragIndex));
    setDragIndex(null);
  }

  return (
    <div className="space-y-2">
      {value.length > 0 ? (
        <p className="text-xs text-slate-500">
          ドラッグ、または ◀ ▶ で並び替えできます。先頭が
          <span className="font-semibold text-slate-700">メイン画像</span>です。
        </p>
      ) : null}
      <ul className="flex flex-wrap gap-3">
        {value.map((url, i) => (
          <li
            key={url}
            draggable={!disabled}
            onDragStart={() => setDragIndex(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(i)}
            onDragEnd={() => setDragIndex(null)}
            className={`relative w-24 rounded-lg border ${
              dragIndex === i ? "border-sky-500 opacity-60" : "border-slate-200"
            } bg-white p-1`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`掲載写真 ${i + 1}`} className="h-20 w-full rounded-md object-cover" />
            {i === 0 ? (
              <span className="absolute left-1 top-1 rounded-full bg-sky-700 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                メイン画像
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => removeAt(i)}
              disabled={disabled}
              className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-xs text-white"
              aria-label={`写真 ${i + 1} を削除`}
            >
              ×
            </button>
            {/* touch / keyboard フォールバックの並び替えコントロール。 */}
            <div className="mt-1 flex items-center justify-between">
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={disabled || i === 0}
                aria-label={`写真 ${i + 1} を前へ`}
                className="rounded bg-slate-100 px-1.5 text-xs text-slate-600 disabled:opacity-30"
              >
                ◀
              </button>
              <span className="text-[10px] text-slate-400">{i + 1}</span>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={disabled || i === value.length - 1}
                aria-label={`写真 ${i + 1} を後ろへ`}
                className="rounded bg-slate-100 px-1.5 text-xs text-slate-600 disabled:opacity-30"
              >
                ▶
              </button>
            </div>
          </li>
        ))}
      </ul>
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_TYPES.join(",")}
        multiple
        disabled={disabled || uploading || value.length >= MAX_IMAGES}
        onChange={(e) => void handleFiles(e.target.files)}
        className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-full file:border-0 file:bg-slate-200 file:px-3 file:py-1.5 file:text-sm"
      />
      <p className="text-xs text-slate-400">
        JPEG / PNG / WebP・1枚5MBまで・最大{MAX_IMAGES}枚。{uploading ? "アップロード中…" : ""}
      </p>
      {error ? <p className="text-xs text-rose-700">{error}</p> : null}
    </div>
  );
}
