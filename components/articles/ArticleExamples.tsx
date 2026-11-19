import type { ArticleExampleSection } from "@/types/article";
import { ProcedureLinks } from "./ProcedureLinks";

export function ArticleExamples({ section }: { section: ArticleExampleSection }) {
  return (
    <section
      id="article-examples"
      aria-labelledby="article-examples-title"
      className="scroll-mt-24 space-y-4"
    >
      <h2 id="article-examples-title" className="text-xl font-bold text-slate-900">
        {section.title}
      </h2>
      {section.intro ? <p className="text-sm leading-relaxed text-slate-700">{section.intro}</p> : null}
      {section.note ? (
        <p className="border-l-2 border-sky-600 bg-sky-50/60 px-4 py-2 text-sm leading-relaxed text-slate-700">
          {section.note}
        </p>
      ) : null}
      <ol role="list" className="list-none divide-y divide-slate-200 border-y border-slate-200">
        {section.items.map(({ title, summary, facts, details, links }, index) => (
          <li key={title} className="py-5 sm:py-6">
            <h3 className="flex gap-2 text-base font-bold text-slate-900 sm:text-lg">
              <span aria-hidden="true" className="shrink-0 font-mono tabular-nums text-sky-800">{index + 1}.</span>
              <span>{title}</span>
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-700">{summary}</p>
            {facts?.length ? (
              <dl className="mt-3 grid gap-x-5 gap-y-2 bg-slate-100/70 px-4 py-3 sm:grid-cols-2">
                {facts.map(({ label, value }) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-xs font-semibold text-sky-800">{label}</dt>
                    <dd className="mt-1 break-words text-sm text-slate-900">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-800">
              {details.map((detail) => <li key={detail}>{detail}</li>)}
            </ul>
            {links?.length ? <ProcedureLinks links={links} ariaLabel={`${title}の関連リンク`} /> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
