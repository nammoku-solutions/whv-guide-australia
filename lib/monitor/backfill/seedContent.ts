/**
 * 手動シードの contentFile 解決（パス安全）。オペレータが公式ページ本文を .txt に
 * 貼り付けられるようにする。任意ファイル読み取りにならないよう厳格に検証する。
 *
 * ルール:
 *   - 相対パスは baseDir（既定: リポジトリルート）から解決する。
 *   - baseDir の外・ディレクトリトラバーサル・シンボリックリンク脱出・デバイス/特殊ファイルを拒否。
 *   - UTF-8 テキストのみ。最大バイト数を制限。空/未読は明確なエラー。
 */

import { readFileSync, statSync, realpathSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";

/** contentFile の最大バイト数（本文はこの後さらに文字数上限で丸められる）。 */
export const SEED_MAX_CONTENT_BYTES = 256 * 1024;

export type ContentFileCode =
  | "CONTENT_FILE_NOT_FOUND"
  | "CONTENT_FILE_OUTSIDE_ALLOWED_ROOT"
  | "CONTENT_FILE_TOO_LARGE"
  | "CONTENT_FILE_EMPTY"
  | "CONTENT_FILE_ENCODING_ERROR";

export type ContentFileResult =
  | { ok: true; content: string }
  | { ok: false; code: ContentFileCode; detail: string };

/**
 * contentFile を安全に読み取り、UTF-8 本文を返す。
 * @param contentFile シードの contentFile（baseDir からの相対パス推奨）。
 * @param baseDir 許可された作業領域のルート（既定はリポジトリルート）。
 */
export function resolveContentFile(
  contentFile: string,
  baseDir: string,
): ContentFileResult {
  const rel = (contentFile ?? "").trim();
  if (!rel) {
    return { ok: false, code: "CONTENT_FILE_NOT_FOUND", detail: "contentFile が空です。" };
  }

  const base = resolve(baseDir);
  const target = resolve(base, rel);

  // 解決後パスが baseDir 配下かを検証（トラバーサル・絶対パス脱出を拒否）。
  const within = (root: string, p: string): boolean => {
    const r = relative(root, p);
    return r !== "" && !r.startsWith("..") && !isAbsolute(r);
  };
  if (!within(base, target)) {
    return { ok: false, code: "CONTENT_FILE_OUTSIDE_ALLOWED_ROOT", detail: `許可された作業領域の外です: ${contentFile}` };
  }

  let st;
  try {
    st = statSync(target);
  } catch {
    return { ok: false, code: "CONTENT_FILE_NOT_FOUND", detail: `ファイルが見つかりません: ${contentFile}` };
  }
  // 通常ファイルのみ（ディレクトリ・デバイス・FIFO 等を拒否）。
  if (!st.isFile()) {
    return { ok: false, code: "CONTENT_FILE_NOT_FOUND", detail: `通常ファイルではありません: ${contentFile}` };
  }
  if (st.size > SEED_MAX_CONTENT_BYTES) {
    return { ok: false, code: "CONTENT_FILE_TOO_LARGE", detail: `ファイルが大きすぎます（${st.size} bytes > ${SEED_MAX_CONTENT_BYTES}）。` };
  }
  // シンボリックリンク脱出を realpath で再検証。
  try {
    const realBase = realpathSync(base);
    const realTarget = realpathSync(target);
    if (!within(realBase, realTarget)) {
      return { ok: false, code: "CONTENT_FILE_OUTSIDE_ALLOWED_ROOT", detail: `シンボリックリンクが作業領域の外を指しています: ${contentFile}` };
    }
  } catch {
    return { ok: false, code: "CONTENT_FILE_NOT_FOUND", detail: `ファイルを解決できません: ${contentFile}` };
  }

  let raw: Buffer;
  try {
    raw = readFileSync(target);
  } catch {
    return { ok: false, code: "CONTENT_FILE_NOT_FOUND", detail: `ファイルを読み取れません: ${contentFile}` };
  }
  // UTF-8 妥当性（不正バイトは拒否）。
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch {
    return { ok: false, code: "CONTENT_FILE_ENCODING_ERROR", detail: `UTF-8 テキストとして読み取れません: ${contentFile}` };
  }
  if (text.trim().length === 0) {
    return { ok: false, code: "CONTENT_FILE_EMPTY", detail: `ファイルが空です: ${contentFile}` };
  }
  return { ok: true, content: text };
}
