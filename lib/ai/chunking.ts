import type { Article } from "@/types/article";
import type { ArticleChunk } from "./types";
import { contentHash } from "./hash";
import { categoryRisk } from "./safety/risk";

/** 1chunkの目標最大文字数。極端に大きいchunkを防ぐ。 */
const MAX_CHUNK_CHARS = 1200;
/** 小さすぎるchunkは前後と結合するための下限。 */
const MIN_CHUNK_CHARS = 120;

type Section = { heading: string; body: string };

/** 段落配列を、見出し単位のまとまりを保ちつつ最大文字数で分割する。 */
function splitBySize(paragraphs: string[], max: number): string[] {
  const out: string[] = [];
  let buf = "";
  for (const p of paragraphs) {
    const piece = p.trim();
    if (!piece) continue;
    if (buf && buf.length + piece.length + 1 > max) {
      out.push(buf);
      buf = piece;
    } else {
      buf = buf ? `${buf}\n${piece}` : piece;
    }
  }
  if (buf) out.push(buf);
  return out;
}

/**
 * 記事の構造化フィールドから「見出し付きの意味的セクション」を組み立てる。
 * 固定文字数での機械的分割ではなく、要点・本文・手順・注意点・FAQ など、
 * 記事の意味的まとまりごとにchunk化する。
 */
function buildSections(article: Article): Section[] {
  const sections: Section[] = [];

  const overviewParts: string[] = [];
  if (article.answer) overviewParts.push(article.answer);
  if (article.points?.length) {
    overviewParts.push(article.points.map((p) => `・${p}`).join("\n"));
  }
  if (overviewParts.length) {
    sections.push({ heading: "概要・要点", body: overviewParts.join("\n") });
  }

  if (article.description) {
    sections.push({ heading: "この記事について", body: article.description });
  }

  if (article.keyFacts?.length) {
    sections.push({
      heading: "基本情報",
      body: article.keyFacts.map((f) => `${f.label}: ${f.value}`).join("\n"),
    });
  }

  if (article.content?.length) {
    for (const body of splitBySize(article.content, MAX_CHUNK_CHARS)) {
      sections.push({ heading: "解説", body });
    }
  }

  if (article.steps?.length) {
    const steps = article.steps.map(
      (s, i) => `${i + 1}. ${s.title}\n${s.description}`,
    );
    for (const body of splitBySize(steps, MAX_CHUNK_CHARS)) {
      sections.push({ heading: "手順", body });
    }
  }

  if (article.tips?.length) {
    for (const body of splitBySize(
      article.tips.map((t) => `・${t}`),
      MAX_CHUNK_CHARS,
    )) {
      sections.push({ heading: "ヒント・コツ", body });
    }
  }

  if (article.commonMistakes?.length) {
    sections.push({
      heading: "よくある間違い",
      body: article.commonMistakes.map((m) => `・${m}`).join("\n"),
    });
  }

  if (article.warnings?.length) {
    sections.push({
      heading: "注意点",
      body: article.warnings.map((w) => `・${w}`).join("\n"),
    });
  }

  if (article.faqs?.length) {
    const faqs = article.faqs.map((f) => `Q. ${f.question}\nA. ${f.answer}`);
    for (const body of splitBySize(faqs, MAX_CHUNK_CHARS)) {
      sections.push({ heading: "よくある質問", body });
    }
  }

  if (article.phrases?.length) {
    sections.push({
      heading: "使える英語フレーズ",
      body: article.phrases
        .map((p) => `${p.en} — ${p.ja}${p.note ? `（${p.note}）` : ""}`)
        .join("\n"),
    });
  }

  // 極端に短いセクションは直前と結合してノイズを減らす。
  const merged: Section[] = [];
  for (const s of sections) {
    const prev = merged[merged.length - 1];
    if (prev && s.body.length < MIN_CHUNK_CHARS && prev.heading === s.heading) {
      prev.body = `${prev.body}\n${s.body}`;
    } else {
      merged.push({ ...s });
    }
  }
  return merged;
}

/**
 * 記事を検索インデックス用のchunk配列へ変換する。ランタイム（未使用）と
 * インデックス作成スクリプトの両方から呼ばれる単一の実装。
 */
export function chunkArticle(article: Article): ArticleChunk[] {
  const url = `/guides/${article.slug}`;
  const risk = categoryRisk(article.category);
  const officialSources = (article.officialSources ?? []).map((s) => ({
    label: s.label,
    url: s.url,
  }));
  const sections = buildSections(article);

  return sections.map((section, index) => {
    // 検索精度のため、タイトルと見出しを本文に前置して埋め込む。
    const content = `【${article.title}｜${section.heading}】\n${section.body}`;
    return {
      chunkId: `${article.slug}::${index}`,
      articleId: article.id,
      title: article.title,
      slug: article.slug,
      url,
      category: article.category,
      heading: section.heading,
      chunkIndex: index,
      content,
      contentHash: contentHash(content),
      updatedAt: article.updatedAt,
      riskLevel: risk,
      officialSources,
    };
  });
}
