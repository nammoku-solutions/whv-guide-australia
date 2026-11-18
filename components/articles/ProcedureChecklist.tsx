import type { ArticleProcedure } from "@/types/article";

export function ProcedureChecklist({ procedure }: { procedure: ArticleProcedure }) {
  return (
    <section aria-labelledby="procedure-checklist" className="rounded-2xl border border-sky-200 bg-white p-5 sm:p-6">
      <h2 id="procedure-checklist" className="text-xl font-semibold text-slate-900">始める前のチェックリスト</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {procedure.preparation.map(({ title, items }) => (
          <div key={title} className="rounded-xl bg-sky-50 p-4">
            <h3 className="font-semibold text-slate-900">{title}</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-800">
              {items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
