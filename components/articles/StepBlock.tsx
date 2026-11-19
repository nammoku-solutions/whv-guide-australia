import Image from "next/image";
import { ProcedureLinks } from "./ProcedureLinks";
import type { ArticleStep } from "@/types/article";

type StepBlockProps = {
  step: ArticleStep;
  index: number;
};

export function StepBlock({ step, index }: StepBlockProps) {
  return (
    <section
      id={`step-${index + 1}`}
      className="scroll-mt-24 border-b border-slate-200 py-5 sm:py-6"
    >
      <h3 className="flex items-baseline gap-3 text-lg font-semibold text-slate-900">
        <span className="shrink-0 font-mono text-sm tabular-nums text-sky-700">
          <span className="sr-only">手順 </span>
          {String(index + 1).padStart(2, "0")}
        </span>
        <span>{step.title}</span>
      </h3>
      <p className="mt-2 text-sm text-slate-700">{step.description}</p>

      {step.checklist?.length ? (
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-800">
          {step.checklist.map((item) => <li key={item}>{item}</li>)}
        </ul>
      ) : null}
      {step.links?.length ? <ProcedureLinks links={step.links} /> : null}

      {step.image ? (
        <figure className="mt-3">
          <Image
            src={step.image.src}
            alt={step.image.alt}
            width={1200}
            height={675}
            className="h-auto w-full rounded-xl border border-slate-200 bg-white"
          />
          {step.image.caption ? (
            <figcaption className="mt-1 text-xs text-slate-500">{step.image.caption}</figcaption>
          ) : null}
        </figure>
      ) : step.imageHint && process.env.NODE_ENV !== "production" ? (
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-dashed border-sky-200 bg-white/70 px-4 py-3 text-xs text-slate-500">
          <span aria-hidden="true" className="text-lg">
            📷
          </span>
          <span>画像準備中：{step.imageHint}</span>
        </div>
      ) : null}
    </section>
  );
}
