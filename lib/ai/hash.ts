import { createHash } from "node:crypto";

/** 決定的なコンテンツハッシュ。内容が変わったchunkだけ再埋め込みするために使う。 */
export function contentHash(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex").slice(0, 32);
}
