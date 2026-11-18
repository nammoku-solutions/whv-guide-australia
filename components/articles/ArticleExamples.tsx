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
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">
          {section.note}
        </p>
      ) : null}
      <ol role="list" className="list-none space-y-4">
        {section.items.map(({ title, summary, facts, details, links }, index) => (
          <li key={title} className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="flex gap-2 text-base font-bold text-slate-900 sm:text-lg">
              <span aria-hidden="true" className="shrink-0 text-sky-800">{index + 1}.</span>
              <span>{title}</span>
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-700">{summary}</p>
            {facts?.length ? (
              <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                {facts.map(({ label, value }) => (
                  <div key={label} className="rounded-lg bg-sky-50 p-3">
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
