import { aiConfig } from "./config";
import {
  LOGIN_REQUIRED_ANSWER,
  UNSUPPORTED_ANSWER,
  type AuthContext,
  type ChatResponse,
  type Evidence,
  type PipelineDiagnostics,
  type RetrievalCandidate,
  type SourceLink,
  type StructuredCard,
  type TrustedAction,
} from "./types";
import { routeQuestion, type RouteDecision } from "./router";
import { retrieve } from "./retrieval/retriever";
import { getReranker } from "./reranking/reranker";
import { generateAnswer } from "./generation/generator";
import { getVerifier } from "./verification/verifier";
import { buildSources, filterAllowedSources } from "./recommendations/articles";
import { recommendTools } from "./recommendations/tools";
import { maxRisk } from "./safety/risk";
import { actions as trustedActions, dedupeActions } from "./actions";
import {
  searchActiveJobs,
  searchActiveHousing,
  searchActiveVehicles,
  getMyApplications,
  getMySavedItems,
  getMyNotifications,
  getMy88DayProgress,
  getCurrentOfficialUpdates,
  findRelevantSiteTools,
  type CapabilityResult,
} from "./capabilities";
import { parseListingQuery } from "./capabilities/filters";

const NO_ANON: AuthContext = {
  userId: null,
  isAuthenticated: false,
  isModerator: false,
};

/** 記事検索候補を共通エビデンス表現へ変換する。 */
function toArticleEvidence(c: RetrievalCandidate): Evidence {
  return {
    kind: "article",
    visibility: "public",
    title: c.title,
    content: c.content,
    url: c.url,
    sourceId: `article:${c.slug}`,
    freshness: null,
    riskLevel: c.riskLevel,
    metadata: { heading: c.heading },
  };
}

/** 公開エビデンス（記事・公式ニュース）から出典リンクを生成する。private は除外。 */
function sourcesFromEvidence(evidence: Evidence[], max = 4): SourceLink[] {
  const seen = new Set<string>();
  const out: SourceLink[] = [];
  for (const e of evidence) {
    if (e.visibility !== "public") continue;
    if (e.kind !== "article" && e.kind !== "official_update") continue;
    if (!e.url || seen.has(e.url)) continue;
    seen.add(e.url);
    out.push({ title: e.title, url: e.url });
    if (out.length >= max) break;
  }
  return out;
}

/**
 * AI パイプラインのオーケストレーション:
 *   質問 → Router → (Retriever/構造化ケイパビリティ) → (Reranker) → Generator
 *        → Sources / カード / 信頼済みアクション / ツール推薦 → Response
 *
 * 公開知識は記事RAG、ライブ・マーケットは構造化Supabaseクエリ、個人データは
 * 認証必須のサーバー側ケイパビリティで扱う。個人/ライブデータはベクトルDBに入れない。
 */
export async function runChatPipeline(input: {
  question: string;
  history?: { role: "user" | "assistant"; content: string }[];
  includeDiagnostics?: boolean;
  /** サーバー側で導出した認証コンテキスト（未指定は匿名）。 */
  auth?: AuthContext;
}): Promise<ChatResponse> {
  const { question } = input;
  const auth = input.auth ?? NO_ANON;
  const decision = routeQuestion(question);

  const structuredOn = aiConfig.features.structuredDataEnabled;

  // スコープ外は即座に定型応答（生成呼び出しなし）。
  if (decision.route === "OUT_OF_SCOPE") {
    return finalize({
      answer: UNSUPPORTED_ANSWER,
      supported: false,
      decision,
      tools: recommendTools(question),
      includeDiagnostics: input.includeDiagnostics,
      diag: { fallbackTriggered: true },
    });
  }

  // --- 個人データ（認証必須）---
  if (structuredOn && decision.route === "PERSONAL") {
    return runPersonalRoute({ question, decision, auth, includeDiagnostics: input.includeDiagnostics });
  }

  // --- ライブ掲載のみ（LISTING）---
  if (structuredOn && decision.route === "LISTING") {
    return runListingRoute({ question, decision, includeDiagnostics: input.includeDiagnostics });
  }

  // --- 直近の公式アップデート（記事RAG併用）---
  if (structuredOn && decision.route === "CURRENT_UPDATE") {
    return runCurrentUpdateRoute({
      question,
      decision,
      history: input.history,
      includeDiagnostics: input.includeDiagnostics,
    });
  }

  // --- 純ツール・ナビゲーション ---
  if (structuredOn && decision.route === "TOOL") {
    return runToolRoute({ question, decision, history: input.history, includeDiagnostics: input.includeDiagnostics });
  }

  // --- MIXED（記事＋掲載/ツール/88日）---
  if (structuredOn && decision.route === "MIXED") {
    return runMixedRoute({
      question,
      decision,
      auth,
      history: input.history,
      includeDiagnostics: input.includeDiagnostics,
    });
  }

  // --- ARTICLE（既存の記事RAGパスをそのまま再利用）---
  return runArticleRoute({
    question,
    decision,
    history: input.history,
    includeDiagnostics: input.includeDiagnostics,
  });
}

// =====================================================================
// ルート別実装
// =====================================================================

type DiagPartial = Partial<PipelineDiagnostics>;

/** 共通の最終整形（診断・アクション重複排除）。 */
function finalize(args: {
  answer: string;
  supported: boolean;
  decision: RouteDecision;
  riskLevel?: "low" | "medium" | "high";
  sources?: SourceLink[];
  tools?: ReturnType<typeof recommendTools>;
  cards?: StructuredCard[];
  actions?: TrustedAction[];
  authRequired?: boolean;
  includeDiagnostics?: boolean;
  diag?: DiagPartial;
}): ChatResponse {
  const diagnostics: PipelineDiagnostics = {
    route: args.decision.route,
    riskLevel: args.riskLevel ?? "low",
    retrievedTitles: [],
    usedChunkCount: 0,
    modelUsed: null,
    fallbackTriggered: false,
    retrievalLatencyMs: 0,
    generationLatencyMs: 0,
    ...args.diag,
  };
  return {
    answer: args.answer,
    supported: args.supported,
    route: args.decision.route,
    riskLevel: args.riskLevel ?? "low",
    sources: args.sources ?? [],
    tools: args.tools ?? [],
    ...(args.cards && args.cards.length > 0 ? { cards: args.cards } : {}),
    ...(args.actions && args.actions.length > 0
      ? { actions: dedupeActions(args.actions) }
      : {}),
    ...(args.authRequired ? { authRequired: true } : {}),
    ...(args.includeDiagnostics ? { diagnostics } : {}),
  };
}

/** 構造化エビデンスから回答を生成し、共通整形する。 */
async function generateStructured(args: {
  question: string;
  decision: RouteDecision;
  evidence: Evidence[];
  cards: StructuredCard[];
  actions: TrustedAction[];
  capabilities: string[];
  tools: ReturnType<typeof recommendTools>;
  history?: { role: "user" | "assistant"; content: string }[];
  capabilityLatencyMs: number;
  retrievalLatencyMs?: number;
  includeDiagnostics?: boolean;
  noResult?: boolean;
}): Promise<ChatResponse> {
  const risk = maxRisk(args.evidence.map((e) => e.riskLevel));
  const tGen = Date.now();
  const generated = await generateAnswer({
    question: args.question,
    evidence: [],
    overallRisk: risk,
    complex:
      aiConfig.features.complexRoutingEnabled &&
      (risk === "high" || args.evidence.length >= aiConfig.retrieval.maxContextChunks),
    history: args.history,
    structured: { evidence: args.evidence, route: args.decision.route },
  });
  const generationLatencyMs = Date.now() - tGen;

  const declaredUnsupported =
    !generated.text ||
    generated.text.includes("十分な情報がありません") ||
    generated.text.includes("十分な情報が現在ありません");
  const supported = !declaredUnsupported;

  return finalize({
    answer: supported ? generated.text : UNSUPPORTED_ANSWER,
    supported,
    decision: args.decision,
    riskLevel: risk,
    sources: sourcesFromEvidence(args.evidence),
    tools: args.tools,
    cards: args.cards,
    actions: args.actions,
    includeDiagnostics: args.includeDiagnostics,
    diag: {
      riskLevel: risk,
      usedChunkCount: args.evidence.length,
      modelUsed: generated.modelUsed,
      fallbackTriggered: !supported,
      generationLatencyMs,
      retrievalLatencyMs: args.retrievalLatencyMs ?? 0,
      capabilityLatencyMs: args.capabilityLatencyMs,
      capabilities: args.capabilities,
      noResult: args.noResult,
    },
  });
}

// ---- PERSONAL ----
async function runPersonalRoute(args: {
  question: string;
  decision: RouteDecision;
  auth: AuthContext;
  includeDiagnostics?: boolean;
}): Promise<ChatResponse> {
  const { decision, auth } = args;
  const tools = recommendTools(args.question);

  // 未ログイン → ログイン必須のクリーンな応答（生成呼び出しなし）。
  if (!auth.isAuthenticated) {
    return finalize({
      answer: LOGIN_REQUIRED_ANSWER,
      supported: false,
      decision,
      tools,
      actions: [trustedActions.login()],
      authRequired: true,
      includeDiagnostics: args.includeDiagnostics,
      diag: { authRequired: true, fallbackTriggered: true },
    });
  }

  const t0 = Date.now();
  let result: CapabilityResult;
  switch (decision.personalIntent) {
    case "saved":
      result = await getMySavedItems(auth);
      break;
    case "notifications":
      result = await getMyNotifications(auth);
      break;
    case "applications":
    default:
      result = await getMyApplications(auth);
      break;
  }
  const capabilityLatencyMs = Date.now() - t0;

  return generateStructured({
    question: args.question,
    decision,
    evidence: result.evidence,
    cards: result.cards,
    actions: result.actions,
    capabilities: [result.name],
    tools,
    capabilityLatencyMs,
    includeDiagnostics: args.includeDiagnostics,
    noResult: result.count === 0,
  });
}

// ---- LISTING (掲載のみ) ----
async function runListingRoute(args: {
  question: string;
  decision: RouteDecision;
  includeDiagnostics?: boolean;
}): Promise<ChatResponse> {
  const { decision } = args;
  const tools = recommendTools(args.question);
  const t0 = Date.now();
  const result = await runListingCapability(args.question, decision);
  const capabilityLatencyMs = Date.now() - t0;

  // 0件は生成せず、決定的な no-result 応答（コスト/ハルシネーション抑制）。
  if (result.count === 0) {
    return finalize({
      answer:
        "現在、その条件に一致する掲載は見つかりませんでした。条件を変えるか、マーケットの一覧から探してみてください。",
      supported: true,
      decision,
      tools,
      actions: result.actions,
      includeDiagnostics: args.includeDiagnostics,
      diag: { noResult: true, capabilities: [result.name], capabilityLatencyMs },
    });
  }

  return generateStructured({
    question: args.question,
    decision,
    evidence: result.evidence,
    cards: result.cards,
    actions: result.actions,
    capabilities: [result.name],
    tools,
    capabilityLatencyMs,
    includeDiagnostics: args.includeDiagnostics,
  });
}

/** 掲載サブ意図に応じた検索。 */
async function runListingCapability(
  question: string,
  decision: RouteDecision,
): Promise<CapabilityResult> {
  const parsed = parseListingQuery(question);
  switch (decision.listingIntent) {
    case "vehicle":
      return searchActiveVehicles(question, parsed);
    case "housing":
      return searchActiveHousing(question, parsed);
    case "job":
      return searchActiveJobs(question, parsed);
    default:
      // 不明な掲載意図は求人を既定にする（最も多い問い合わせ）。
      return searchActiveJobs(question, parsed);
  }
}

// ---- CURRENT_UPDATE ----
async function runCurrentUpdateRoute(args: {
  question: string;
  decision: RouteDecision;
  history?: { role: "user" | "assistant"; content: string }[];
  includeDiagnostics?: boolean;
}): Promise<ChatResponse> {
  const { decision } = args;
  const tools = recommendTools(args.question);
  const tR = Date.now();
  const [updates, retrieval] = await Promise.all([
    getCurrentOfficialUpdates(),
    retrieve(args.question),
  ]);
  const capabilityLatencyMs = Date.now() - tR;

  const reranked = await getReranker().rerank(args.question, retrieval.context);
  const articleEvidence = retrieval.hasGrounding ? reranked.map(toArticleEvidence) : [];
  const evidence = [...updates.evidence, ...articleEvidence];

  return generateStructured({
    question: args.question,
    decision,
    evidence,
    cards: updates.cards,
    actions: updates.actions,
    capabilities: [updates.name, "articleRAG"],
    tools,
    capabilityLatencyMs,
    retrievalLatencyMs: capabilityLatencyMs,
    includeDiagnostics: args.includeDiagnostics,
    noResult: updates.count === 0 && articleEvidence.length === 0,
  });
}

// ---- TOOL (ナビゲーション) ----
async function runToolRoute(args: {
  question: string;
  decision: RouteDecision;
  history?: { role: "user" | "assistant"; content: string }[];
  includeDiagnostics?: boolean;
}): Promise<ChatResponse> {
  const { decision } = args;
  const toolResult = findRelevantSiteTools(args.question, [], 3);
  const tools = recommendTools(args.question);

  // ツールが特定できれば、生成を呼ばず決定的にツールへ案内（低コスト）。
  if (toolResult.count > 0) {
    return finalize({
      answer:
        "ご質問に関連するサイト内ツールはこちらです。ボタンから開けます。",
      supported: true,
      decision,
      tools,
      cards: toolResult.cards,
      actions: toolResult.actions,
      includeDiagnostics: args.includeDiagnostics,
      diag: { capabilities: [toolResult.name] },
    });
  }

  // ツール未特定なら記事RAGへフォールバック。
  return runArticleRoute({
    question: args.question,
    decision,
    history: args.history,
    includeDiagnostics: args.includeDiagnostics,
  });
}

// ---- MIXED ----
async function runMixedRoute(args: {
  question: string;
  decision: RouteDecision;
  auth: AuthContext;
  history?: { role: "user" | "assistant"; content: string }[];
  includeDiagnostics?: boolean;
}): Promise<ChatResponse> {
  const { decision } = args;
  const capabilities: string[] = [];
  const cards: StructuredCard[] = [];
  const actions: TrustedAction[] = [];
  const structuredEvidence: Evidence[] = [];

  const t0 = Date.now();
  // 独立した取得は並列実行（記事RAG＋掲載＋88日）。
  const listingPromise = decision.wantsListing
    ? runListingCapability(args.question, decision)
    : Promise.resolve<CapabilityResult | null>(null);
  const eightyEightPromise = decision.wantsEightyEight
    ? getMy88DayProgress(args.auth)
    : Promise.resolve<CapabilityResult | null>(null);
  const retrievalPromise = retrieve(args.question);

  const [listing, eightyEight, retrieval] = await Promise.all([
    listingPromise,
    eightyEightPromise,
    retrievalPromise,
  ]);
  const capabilityLatencyMs = Date.now() - t0;

  if (listing) {
    capabilities.push(listing.name);
    structuredEvidence.push(...listing.evidence);
    cards.push(...listing.cards);
    actions.push(...listing.actions);
  }
  if (eightyEight) {
    capabilities.push(eightyEight.name);
    structuredEvidence.push(...eightyEight.evidence);
    cards.push(...eightyEight.cards);
    actions.push(...eightyEight.actions);
  }

  const reranked = await getReranker().rerank(args.question, retrieval.context);
  const articleEvidence = retrieval.hasGrounding ? reranked.map(toArticleEvidence) : [];
  if (articleEvidence.length > 0) capabilities.push("articleRAG");
  const evidence = [...articleEvidence, ...structuredEvidence];

  const tools = recommendTools(args.question, reranked.map((c) => c.slug));

  // まったく根拠が無い（記事・掲載・88日いずれもなし）→ unsupported。
  if (evidence.length === 0) {
    return finalize({
      answer: UNSUPPORTED_ANSWER,
      supported: false,
      decision,
      tools,
      actions,
      includeDiagnostics: args.includeDiagnostics,
      diag: { fallbackTriggered: true, capabilities, capabilityLatencyMs, noResult: true },
    });
  }

  return generateStructured({
    question: args.question,
    decision,
    evidence,
    cards,
    actions,
    capabilities,
    tools,
    history: args.history,
    capabilityLatencyMs,
    retrievalLatencyMs: capabilityLatencyMs,
    includeDiagnostics: args.includeDiagnostics,
  });
}

// ---- ARTICLE（既存の記事RAGパス）----
async function runArticleRoute(args: {
  question: string;
  decision: RouteDecision;
  history?: { role: "user" | "assistant"; content: string }[];
  includeDiagnostics?: boolean;
}): Promise<ChatResponse> {
  const { decision } = args;
  const tRetr = Date.now();
  const retrieval = await retrieve(args.question);
  const reranker = getReranker();
  const reranked = await reranker.rerank(args.question, retrieval.context);
  const retrievalLatencyMs = Date.now() - tRetr;

  const categories = reranked.map((c) => c.slug);
  const tools = recommendTools(args.question, categories);

  if (!retrieval.hasGrounding || reranked.length === 0) {
    return finalize({
      answer: UNSUPPORTED_ANSWER,
      supported: false,
      decision,
      tools,
      includeDiagnostics: args.includeDiagnostics,
      diag: {
        fallbackTriggered: true,
        retrievalLatencyMs,
        retrievedTitles: retrieval.candidates.slice(0, 5).map((c) => ({
          title: c.title,
          heading: c.heading,
          score: Number(c.score.toFixed(3)),
        })),
      },
    });
  }

  const overallRisk = maxRisk(reranked.map((c) => c.riskLevel));
  const evidence = reranked.map((c) => ({
    title: c.title,
    heading: c.heading,
    url: c.url,
    content: c.content,
    riskLevel: c.riskLevel,
  }));

  const useComplex =
    aiConfig.features.complexRoutingEnabled &&
    (overallRisk === "high" || reranked.length >= aiConfig.retrieval.maxContextChunks);

  const tGen = Date.now();
  const generated = await generateAnswer({
    question: args.question,
    evidence,
    overallRisk,
    complex: useComplex,
    history: args.history,
  });
  const generationLatencyMs = Date.now() - tGen;

  const declaredUnsupported =
    !generated.text ||
    generated.text.includes("十分な情報がありません") ||
    generated.text.includes("十分な情報が現在ありません");

  const verification = await getVerifier().verify(generated.text, evidence);
  const supported = !declaredUnsupported && verification.supported;

  const allowedUrls = new Set(reranked.map((c) => c.url));
  const sources = supported
    ? filterAllowedSources(buildSources(reranked), allowedUrls)
    : [];

  return finalize({
    answer: supported ? generated.text : UNSUPPORTED_ANSWER,
    supported,
    decision,
    riskLevel: overallRisk,
    sources,
    tools,
    includeDiagnostics: args.includeDiagnostics,
    diag: {
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
    },
  });
}
