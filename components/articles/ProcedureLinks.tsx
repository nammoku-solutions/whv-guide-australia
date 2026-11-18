import Link from "next/link";
import type { ArticleLink } from "@/types/article";

export function ProcedureLinks({ links }: { links: ArticleLink[] }) {
  const className =
    "inline-flex min-h-11 items-center gap-1 rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm font-semibold text-sky-900 underline underline-offset-4 hover:bg-sky-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700";
  return (
    <ul aria-label="この手順で使うリンク" className="mt-3 flex flex-wrap gap-2">
      {links.map(({ label, url }) => (
        <li key={url} className="max-w-full">
          {url.startsWith("/") ? (
            <Link href={url} className={className}>{label}</Link>
          ) : (
            <a href={url} className={className}>
              {label}<span aria-hidden="true">↗</span>
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
