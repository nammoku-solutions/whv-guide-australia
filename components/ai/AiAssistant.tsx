"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  trackAiEvent,
  aiQuestionParams,
  aiAnswerParams,
} from "@/lib/ai/analytics/events";
import {
  AiCards,
  AiActions,
  type StructuredCard,
  type TrustedAction,
} from "@/components/ai/AiCards";

type SourceLink = { title: string; url: string };
type ToolRec = { id: string; name: string; url: string; description: string };

type AssistantMessage = {
  role: "assistant";
  text: string;
  supported: boolean;
  sources: SourceLink[];
  tools: ToolRec[];
  cards: StructuredCard[];
  actions: TrustedAction[];
  riskLevel: "low" | "medium" | "high";
  error?: boolean;
  feedback?: "up" | "down" | null;
};
type UserMessage = { role: "user"; text: string };
type Message = UserMessage | AssistantMessage;

const SUGGESTED = [
  "88日について聞く",
  "仕事の探し方",
  "家の探し方",
  "TFNについて",
];

const RISK_NOTE =
  "※ ビザ・税・健康などの重要事項は制度変更が起こり得ます。最終的には各公式ソースで最新情報を必ずご確認ください。";

/**
 * サイトネイティブな AI アシスタント UI（汎用チャットボット風ではない）。
 * サイト内の情報から回答し、関連ページ・ツールへ誘導する。
 */
export function AiAssistant() {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);

  const panelId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);

  // Escape で閉じる。
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        fabRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // 開いたら入力へフォーカス。
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // 新着メッセージへスクロール。
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages, loading]);

  const send = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || loading) return;

      const history = messages
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.text }));

      setMessages((prev) => [...prev, { role: "user", text: q }]);
      setInput("");
      setLoading(true);
      trackAiEvent("ai_question", aiQuestionParams({ questionLength: q.length }));

      try {
        const token = session?.access_token;
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ question: q, history }),
        });
        const data = await res.json();

        if (!res.ok || !data.ok) {
          const message =
            res.status === 429
              ? "本日のAI利用回数の上限に達しました。時間をおいて、または会員登録してお試しください。"
              : (data.error ??
                "回答の生成中に問題が発生しました。時間をおいてお試しください。");
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              text: message,
              supported: false,
              sources: [],
              tools: [],
              cards: [],
              actions: [],
              riskLevel: "low",
              error: true,
              feedback: null,
            },
          ]);
          return;
        }

        const cards: StructuredCard[] = Array.isArray(data.cards) ? data.cards : [];
        const actions: TrustedAction[] = Array.isArray(data.actions) ? data.actions : [];
        trackAiEvent(
          data.supported ? "ai_answer" : "ai_no_answer",
          aiAnswerParams({
            route: data.route ?? "unknown",
            cardKinds: cards.map((c) => c.kind),
            cardCount: cards.length,
            noResult: cards.length === 0 && Boolean(data.supported) && !data.answer,
            authRequired: Boolean(data.authRequired),
          }),
        );

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: data.answer,
            supported: Boolean(data.supported),
            sources: Array.isArray(data.sources) ? data.sources : [],
            tools: Array.isArray(data.tools) ? data.tools : [],
            cards,
            actions,
            riskLevel: data.riskLevel ?? "low",
            feedback: null,
          },
        ]);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: "通信に失敗しました。接続を確認して、もう一度お試しください。",
            supported: false,
            sources: [],
            tools: [],
            cards: [],
            actions: [],
            riskLevel: "low",
            error: true,
            feedback: null,
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [loading, messages, session],
  );

  const sendFeedback = useCallback(
    async (index: number, value: "up" | "down") => {
      const msg = messages[index];
      if (!msg || msg.role !== "assistant") return;
      setMessages((prev) =>
        prev.map((m, i) =>
          i === index && m.role === "assistant" ? { ...m, feedback: value } : m,
        ),
      );
      trackAiEvent("ai_feedback", { helpful: value === "up" });
      try {
        await fetch("/api/ai/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            helpful: value === "up",
            supported: msg.supported,
          }),
        });
      } catch {
        // フィードバック送信失敗は無視（UX を止めない）。
      }
    },
    [messages],
  );

  return (
    <div className="fixed bottom-20 right-4 z-40 flex flex-col items-end gap-3 print:hidden">
      {open ? (
        <section
          id={panelId}
          role="dialog"
          aria-modal="false"
          aria-label="ワーホリコンパスAI"
          className="flex h-[70vh] max-h-[560px] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        >
          {/* ヘッダー */}
          <header className="flex items-center justify-between gap-2 border-b border-slate-200 bg-sky-700 px-4 py-3 text-white">
            <div>
              <p className="text-sm font-bold">🇦🇺 ワーホリコンパスAI</p>
              <p className="text-[11px] text-sky-100">
                サイト内の情報から回答します。
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                fabRef.current?.focus();
              }}
              aria-label="AIアシスタントを閉じる"
              className="rounded-full p-1 text-sky-100 transition hover:bg-sky-600 hover:text-white"
            >
              <span aria-hidden="true" className="text-lg">
                ✕
              </span>
            </button>
          </header>

          {/* 会話ログ */}
          <div
            ref={logRef}
            className="flex-1 space-y-3 overflow-y-auto px-3 py-3"
            aria-live="polite"
            aria-atomic="false"
          >
            {messages.length === 0 ? (
              <div className="space-y-3">
                <p className="text-xs text-slate-500">
                  ビザ・仕事・家探し・TFNなど、サイト内の情報についてお答えします。
                  次のような質問から試せます。
                </p>
                <ul className="flex flex-wrap gap-2">
                  {SUGGESTED.map((s) => (
                    <li key={s}>
                      <button
                        type="button"
                        onClick={() => send(s)}
                        className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800 transition hover:border-sky-300 hover:bg-sky-100"
                      >
                        {s}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-sky-700 px-3 py-2 text-sm text-white">
                    {m.text}
                  </p>
                </div>
              ) : (
                <div key={i} className="flex flex-col items-start gap-2">
                  <div
                    className={`max-w-[90%] whitespace-pre-wrap break-words rounded-2xl rounded-bl-sm px-3 py-2 text-sm ${
                      m.error
                        ? "bg-amber-50 text-amber-900"
                        : "bg-slate-100 text-slate-800"
                    }`}
                  >
                    {m.text}
                    {m.supported && m.riskLevel === "high" ? (
                      <span className="mt-2 block text-[11px] text-slate-500">
                        {RISK_NOTE}
                      </span>
                    ) : null}
                  </div>

                  {m.cards.length > 0 ? <AiCards cards={m.cards} /> : null}

                  {m.actions.length > 0 ? <AiActions actions={m.actions} /> : null}

                  {m.sources.length > 0 ? (
                    <div className="w-full">
                      <p className="mb-1 text-[11px] font-semibold text-slate-500">
                        関連ページ
                      </p>
                      <ul className="space-y-1">
                        {m.sources.map((s) => (
                          <li key={s.url}>
                            <Link
                              href={s.url}
                              onClick={() =>
                                trackAiEvent("ai_source_click", {})
                              }
                              className="text-xs font-semibold text-sky-700 underline underline-offset-2 hover:text-sky-900"
                            >
                              {s.title}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {m.tools.length > 0 ? (
                    <div className="flex w-full flex-wrap gap-2">
                      {m.tools.map((t) => (
                        <Link
                          key={t.id}
                          href={t.url}
                          onClick={() => trackAiEvent("ai_tool_click", {})}
                          className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-100"
                        >
                          🔧 {t.name}
                        </Link>
                      ))}
                    </div>
                  ) : null}

                  {!m.error ? (
                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <span>役に立ちましたか？</span>
                      <button
                        type="button"
                        aria-label="役に立った"
                        aria-pressed={m.feedback === "up"}
                        onClick={() => sendFeedback(i, "up")}
                        className={`rounded px-1.5 py-0.5 transition hover:bg-slate-100 ${
                          m.feedback === "up" ? "text-emerald-600" : ""
                        }`}
                      >
                        👍
                      </button>
                      <button
                        type="button"
                        aria-label="役に立たなかった"
                        aria-pressed={m.feedback === "down"}
                        onClick={() => sendFeedback(i, "down")}
                        className={`rounded px-1.5 py-0.5 transition hover:bg-slate-100 ${
                          m.feedback === "down" ? "text-rose-600" : ""
                        }`}
                      >
                        👎
                      </button>
                    </div>
                  ) : null}
                </div>
              ),
            )}

            {loading ? (
              <div className="flex items-center gap-1 text-slate-400" aria-label="回答を生成中">
                <span className="h-2 w-2 animate-bounce rounded-full bg-slate-300 [animation-delay:-0.3s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-slate-300 [animation-delay:-0.15s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-slate-300" />
              </div>
            ) : null}
          </div>

          {/* 入力 */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-center gap-2 border-t border-slate-200 p-2"
          >
            <label htmlFor={`${panelId}-input`} className="sr-only">
              質問を入力
            </label>
            <input
              id={`${panelId}-input`}
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={500}
              placeholder="質問を入力してください"
              className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
            />
            <button
              type="submit"
              disabled={loading || input.trim().length === 0}
              className="shrink-0 rounded-xl bg-sky-700 px-3 py-2 text-sm font-bold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              送信
            </button>
          </form>
        </section>
      ) : null}

      <button
        ref={fabRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "AIアシスタントを閉じる" : "AIに質問する"}
        className="flex items-center gap-2 rounded-full bg-sky-700 px-4 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-sky-800"
        onMouseDown={() => {
          if (!open) trackAiEvent("ai_chat_open", {});
        }}
      >
        {open ? (
          <span aria-hidden="true">✕ 閉じる</span>
        ) : (
          <>
            <span aria-hidden="true" className="text-base">
              🇦🇺
            </span>
            <span>AIに質問</span>
          </>
        )}
      </button>
    </div>
  );
}
