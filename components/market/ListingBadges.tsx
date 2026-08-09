import type { Listing, ListingStatus, PostingMode } from "@/types/listing";
import { LISTING_TYPES } from "@/lib/listingConfig";

const STATUS_STYLES: Record<ListingStatus, { label: string; className: string }> = {
  draft: { label: "下書き", className: "bg-slate-100 text-slate-600" },
  active: { label: "募集中", className: "bg-emerald-100 text-emerald-800" },
  closed: { label: "募集終了", className: "bg-slate-200 text-slate-700" },
  expired: { label: "期限切れ", className: "bg-amber-100 text-amber-800" },
  removed: { label: "削除済み", className: "bg-rose-100 text-rose-800" },
};

export function StatusBadge({ status }: { status: ListingStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${s.className}`}>
      {s.label}
    </span>
  );
}

export function TypeBadge({ type }: { type: Listing["listingType"] }) {
  const config = LISTING_TYPES[type];
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-800">
      <span aria-hidden>{config.emoji}</span>
      {config.shortLabel}
    </span>
  );
}

/**
 * 公開ID表示。運営者(operator)は公式バッジ、委任(delegated)は「掲載代行」を表示する。
 */
export function PostingIdentity({
  authorName,
  postingMode,
  authorRole,
}: {
  authorName: string;
  postingMode: PostingMode;
  authorRole?: string;
}) {
  const isOfficialOperator =
    postingMode === "operator" && (authorRole === "admin" || authorRole === "moderator");
  return (
    <span className="inline-flex flex-wrap items-center gap-1 text-sm text-slate-500">
      <span className="font-medium text-slate-700">{authorName}</span>
      {isOfficialOperator ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-sky-700 px-2 py-0.5 text-[11px] font-semibold text-white">
          運営公式
        </span>
      ) : null}
      {postingMode === "delegated" ? (
        <span
          className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-800"
          title="運営が投稿者の許可を得て代理で掲載しています。"
        >
          掲載代行
        </span>
      ) : null}
    </span>
  );
}
