import { aiConfig } from "./config";
import {
  UNSUPPORTED_ANSWER,
  type ChatResponse,
  type EvidenceChunk,
  type PipelineDiagnostics,
} from "./types";
import { routeQuestion } from "./router";
import { retrieve } from "./retrieval/retriever";
import { getReranker } from "./reranking/reranker";
import { generateAnswer } from "./generation/generator";
import { getVerifier } from "./verification/verifier";
import { buildSources, filterAllowedSources } from "./recommendations/articles";
import { recommendTools } from "./recommendations/tools";
import { maxRisk } from "./safety/risk";

/**
 * AI パイプラインのオーケストレーション:
 *   質問 → Router → Retriever → (Reranker) → Generator → (Verifier)
 *        → Sources / ツール推薦 → Response
 *
 * 各段は独立モジュール。しきい値未達・スコープ外は生成を呼ばず定型応答を返す
 * （ハルシネーション・コスト・レイテンシの抑制）。
 */
export async function runChatPipeline(input: {
  question: string;
  history?: { role: "user" | "assistant"; content: string }[];
  includeDiagnostics?: boolean;
}): Promise<ChatResponse> {
  const { question } = input;
  const decision = routeQuestion(question);

  const baseDiag = (): PipelineDiagnostics => ({
    route: decision.route,
    riskLevel: "low",
    retrievedTitles: [],
    usedChunkCount: 0,
    modelUsed: null,
    fallbackTriggered: true,
    retrievalLatencyMs: 0,
    generationLatencyMs: 0,
  });

  // スコープ外は即座に定型応答（生成呼び出しなし）。
  if (decision.route === "OUT_OF_SCOPE") {
    return {
      answer: UNSUPPORTED_ANSWER,
      supported: false,
      route: "OUT_OF_SCOPE",
      riskLevel: "low",
      sources: [],
      tools: recommendTools(question),
      ...(input.includeDiagnostics ? { diagnostics: baseDiag() } : {}),
    };
  }

  // --- Retrieval ---
  const tRetr = Date.now();
  const retrieval = await retrieve(question);
  const reranker = getReranker();
  const reranked = await reranker.rerank(question, retrieval.context);
  const retrievalLatencyMs = Date.now() - tRetr;

  const categories = reranked.map((c) => c.slug);
  const tools = recommendTools(question, categories);

  // 根拠が無い / しきい値未達 → 生成を呼ばず定型応答。
  if (!retrieval.hasGrounding || reranked.length === 0) {
    const diag: PipelineDiagnostics = {
      ...baseDiag(),
      retrievedTitles: retrieval.candidates.slice(0, 5).map((c) => ({
        title: c.title,
        heading: c.heading,
        score: Number(c.score.toFixed(3)),
      })),
      retrievalLatencyMs,
    };
    return {
      answer: UNSUPPORTED_ANSWER,
      supported: false,
      route: decision.route,
      riskLevel: "low",
      sources: [],
      tools,
      ...(input.includeDiagnostics ? { diagnostics: diag } : {}),
    };
  }

  const overallRisk = maxRisk(reranked.map((c) => c.riskLevel));
  const evidence: EvidenceChunk[] = reranked.map((c) => ({
    title: c.title,
    heading: c.heading,
    url: c.url,
    content: c.content,
    riskLevel: c.riskLevel,
  }));

  // 高リスク かつ 複雑ルーティング有効時のみ複雑モデルを検討。
  const useComplex =
    aiConfig.features.complexRoutingEnabled &&
    (overallRisk === "high" || reranked.length >= aiConfig.retrieval.maxContextChunks);

  // --- Generation ---
  const tGen = Date.now();
  const generated = await generateAnswer({
    question,
    evidence,
    overallRisk,
    complex: useComplex,
    history: input.history,
  });
  const generationLatencyMs = Date.now() - tGen;

  // モデルが情報不足を宣言した場合は unsupported に倒す。
  const declaredUnsupported =
    !generated.text ||
    generated.text.includes("十分な情報がありません") ||
    generated.text.includes("十分な情報が現在ありません");

  // --- Verification（V1: Noop）---
  const verifier = getVerifier();
  const verification = await verifier.verify(generated.text, evidence);

  const supported = !declaredUnsupported && verification.supported;

  // 出典は取得済みメタデータからのみ生成（モデルに発明させない）。
  const allowedUrls = new Set(reranked.map((c) => c.url));
  const sources = supported
    ? filterAllowedSources(buildSources(reranked), allowedUrls)
    : [];

  const diagnostics: PipelineDiagnostics = {
    route: decision.route,
    riskLevel: overallRisk,
    retrievedTitles: reranked.map((c) => ({
      title: c.title,
      heading: c.heading,
      score: Number(c.score.toFixed(3)),
    })),
    usedChunkCount: reranked.length,
    modelUsed: generated.modelUsed,
    fallbackTriggered: !supported,
    retrievalLatencyMs,
    generationLatencyMs,
  };

  return {
    answer: supported ? generated.text : UNSUPPORTED_ANSWER,
    supported,
    route: decision.route,
    riskLevel: overallRisk,
    sources,
    tools,
    ...(input.includeDiagnostics ? { diagnostics } : {}),
  };
}
