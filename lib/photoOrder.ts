/**
 * 掲載写真の並び順ユーティリティ（純粋関数・テスト可能）。
 *
 * 画像は listings.images (text[]) に配列順で永続化される。配列の先頭 (index 0)
 * が「メイン画像（カバー）」。並び順は配列順そのものが正規（canonical）で、
 * ファイル名・アップロード時刻・ストレージ順には依存しない。
 */

/** 先頭 = メイン画像。無ければ null。 */
export function coverPhoto(images: string[]): string | null {
  return images.length > 0 ? images[0] : null;
}

/** from の位置の要素を to の位置へ移動した新配列を返す。 */
export function movePhoto(images: string[], from: number, to: number): string[] {
  if (from < 0 || from >= images.length) return images.slice();
  const clamped = Math.max(0, Math.min(to, images.length - 1));
  if (from === clamped) return images.slice();
  const next = images.slice();
  const [item] = next.splice(from, 1);
  next.splice(clamped, 0, item);
  return next;
}

/** index の要素を delta(±1 等)だけ移動する。 */
export function movePhotoBy(images: string[], index: number, delta: number): string[] {
  return movePhoto(images, index, index + delta);
}

/** index の要素を削除した新配列を返す（残りの順序は保持＝正規化不要）。 */
export function removePhotoAt(images: string[], index: number): string[] {
  if (index < 0 || index >= images.length) return images.slice();
  return images.filter((_, i) => i !== index);
}

/** 重複を除きつつ順序を維持する（保存直前の正規化に使用）。 */
export function normalizePhotoOrder(images: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of images) {
    if (typeof url !== "string" || url.length === 0) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}
