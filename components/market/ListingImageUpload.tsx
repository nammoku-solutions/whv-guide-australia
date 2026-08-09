"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

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
    onChange([...value, ...uploaded]);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function removeAt(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {value.map((url, i) => (
          <div key={url} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="h-20 w-20 rounded-lg object-cover" />
            <button
              type="button"
              onClick={() => removeAt(i)}
              className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-xs text-white"
              aria-label="画像を削除"
            >
              ×
            </button>
          </div>
        ))}
      </div>
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
