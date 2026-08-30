/**
 * Provider-neutral model boundary for the retired news/monitor AI pipeline.
 *
 * The production application currently has no external model API. Callers may
 * inject a ModelCaller in tests or future explicitly enabled implementations;
 * the default caller always fails closed and performs no network I/O.
 */

export type ModelCaller = (args: {
  system: string;
  user: string;
}) => Promise<string>;

export const callModel: ModelCaller = async () => {
  throw new Error(
    "News AI automation is disabled. Configure and implement an approved external provider before enabling it.",
  );
};

/** モデル出力から JSON を頑健に取り出す。JSON fence や前後の雑音に耐える。 */
export function parseJsonLoose<T>(raw: string): T | null {
  if (!raw) return null;
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
