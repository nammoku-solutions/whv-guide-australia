import type { Article } from "@/types/article";
import { getCategoryLabel } from "@/lib/articles";
import { ArticleFigure } from "@/components/articles/ArticleFigure";

type ArticleHeaderProps = {
  article: Article;
};

export function ArticleHeader({ article }: ArticleHeaderProps) {
  return (
    <div className="space-y-4">
      <header className="border-b border-slate-200 pb-6 sm:pb-8">
        <p className="border-l-2 border-sky-700 pl-2.5 text-sm font-semibold text-sky-800">{getCategoryLabel(article.category)}</p>
        <h1 className="mt-3 text-[clamp(1.5rem,4.6vw,2.65rem)] leading-[1.28] font-extrabold tracking-tight text-slate-950 text-pretty">{article.title}</h1>
        <p className="mt-3 max-w-[44rem] text-sm leading-relaxed text-slate-700 sm:text-base">{article.description}</p>
        <p className="mt-4 text-xs text-slate-600">
          最終更新日 <time className="tabular-nums" dateTime={article.updatedAt}>{article.updatedAt}</time>
        </p>
      </header>
      {article.heroImage ? (
        <ArticleFigure image={article.heroImage} priority sizes="(max-width: 768px) 100vw, 768px" />
      ) : null}
    </div>
  );
}
