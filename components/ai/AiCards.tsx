"use client";

import Link from "next/link";
import { trackAiEvent, aiCardClickParams } from "@/lib/ai/analytics/events";

/**
 * AI 応答の安全な構造化カード/アクション描画。
 *
 * 重要: モデルの生成した HTML は一切描画しない。ここで描画するのは、サーバーが
 * 信頼済みレジストリ/DBメタデータから組み立てた型付きカード（求人/住居/車/ツール/
 * 応募/通知/保存/ニュース）と信頼済みアクションのみ。URLはすべてサーバー生成。
 */

export type SourceLink = { title: string; url: string };
export type ToolRec = { id: string; name: string; url: string; description: string };

export type StructuredCard =
  | { kind: "job"; id: string; title: string; poster: string; location: string; pay: string | null; employmentType: string | null; url: string; status?: string }
  | { kind: "housing"; id: string; title: string; poster: string; location: string; weeklyRent: string | null; roomType: string | null; url: string; status?: string }
  | { kind: "vehicle"; id: string; title: string; poster: string; location: string; price: string | null; make: string | null; model: string | null; transmission: string | null; url: string; status?: string }
  | { kind: "tool"; id: string; title: string; description: string; url: string }
  | { kind: "application"; id: string; title: string; status: string; appliedAt: string; url: string }
  | { kind: "notification"; id: string; title: string; notifType: string; createdAt: string; read: boolean; url: string | null }
  | { kind: "saved"; id: string; title: string; itemType: string; url: string; closed?: boolean }
  | { kind: "news"; id: string; title: string; date: string; category: string; url: string };

export type TrustedAction = {
  id: string;
  label: string;
  url: string;
  intent: "tool" | "listing" | "personal" | "news" | "article" | "login";
};

function onCardClick(kind: string) {
  trackAiEvent("ai_card_click", aiCardClickParams(kind));
}

function Meta({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] text-slate-500">{children}</span>;
}

function CardShell({
  href,
  kind,
  children,
}: {
  href: string;
  kind: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={() => onCardClick(kind)}
      className="block rounded-xl border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-sky-300 hover:bg-sky-50"
    >
      {children}
    </Link>
  );
}

function CardBody({ card }: { card: StructuredCard }) {
  switch (card.kind) {
    case "job":
      return (
        <CardShell href={card.url} kind={card.kind}>
          <p className="text-xs font-bold text-slate-800">💼 {card.title}</p>
          <p className="mt-0.5 flex flex-wrap gap-x-2">
            <Meta>📍 {card.location}</Meta>
            {card.pay ? <Meta>💰 {card.pay}</Meta> : null}
            {card.employmentType ? <Meta>{card.employmentType}</Meta> : null}
          </p>
          <Meta>{card.poster}</Meta>
        </CardShell>
      );
    case "housing":
      return (
        <CardShell href={card.url} kind={card.kind}>
          <p className="text-xs font-bold text-slate-800">🏠 {card.title}</p>
          <p className="mt-0.5 flex flex-wrap gap-x-2">
            <Meta>📍 {card.location}</Meta>
            {card.weeklyRent ? <Meta>💰 週{card.weeklyRent}</Meta> : null}
            {card.roomType ? <Meta>{card.roomType}</Meta> : null}
          </p>
          <Meta>{card.poster}</Meta>
        </CardShell>
      );
    case "vehicle":
      return (
        <CardShell href={card.url} kind={card.kind}>
          <p className="text-xs font-bold text-slate-800">🚗 {card.title}</p>
          <p className="mt-0.5 flex flex-wrap gap-x-2">
            <Meta>📍 {card.location}</Meta>
            {card.price ? <Meta>💰 {card.price}</Meta> : null}
            {card.transmission ? <Meta>{card.transmission}</Meta> : null}
          </p>
          <Meta>{card.poster}</Meta>
        </CardShell>
      );
    case "tool":
      return (
        <CardShell href={card.url} kind={card.kind}>
          <p className="text-xs font-bold text-emerald-800">🔧 {card.title}</p>
          <Meta>{card.description}</Meta>
        </CardShell>
      );
    case "application":
      return (
        <CardShell href={card.url} kind={card.kind}>
          <p className="text-xs font-bold text-slate-800">📄 {card.title}</p>
          <p className="mt-0.5 flex flex-wrap gap-x-2">
            <Meta>状況: {card.status}</Meta>
            {card.appliedAt ? <Meta>応募日: {card.appliedAt}</Meta> : null}
          </p>
        </CardShell>
      );
    case "notification":
      return card.url ? (
        <CardShell href={card.url} kind={card.kind}>
          <p className="text-xs font-bold text-slate-800">
            {card.read ? "🔔" : "🔴"} {card.title}
          </p>
          <p className="mt-0.5 flex flex-wrap gap-x-2">
            <Meta>{card.notifType}</Meta>
            <Meta>{card.createdAt}</Meta>
          </p>
        </CardShell>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
          <p className="text-xs font-bold text-slate-800">
            {card.read ? "🔔" : "🔴"} {card.title}
          </p>
          <p className="mt-0.5 flex flex-wrap gap-x-2">
            <Meta>{card.notifType}</Meta>
            <Meta>{card.createdAt}</Meta>
          </p>
        </div>
      );
    case "saved":
      return (
        <CardShell href={card.url} kind={card.kind}>
          <p className="text-xs font-bold text-slate-800">
            ⭐ {card.title}
            {card.closed ? (
              <span className="ml-1 rounded bg-slate-200 px-1 text-[10px] text-slate-600">
                募集終了
              </span>
            ) : null}
          </p>
          <Meta>{card.itemType}</Meta>
        </CardShell>
      );
    case "news":
      return (
        <CardShell href={card.url} kind={card.kind}>
          <p className="text-xs font-bold text-slate-800">📰 {card.title}</p>
          <p className="mt-0.5 flex flex-wrap gap-x-2">
            <Meta>{card.category}</Meta>
            <Meta>{card.date}</Meta>
          </p>
        </CardShell>
      );
    default:
      return null;
  }
}

export function AiCards({ cards }: { cards: StructuredCard[] }) {
  if (!cards || cards.length === 0) return null;
  return (
    <div className="w-full space-y-2">
      {cards.map((c) => (
        <CardBody key={`${c.kind}-${c.id}`} card={c} />
      ))}
    </div>
  );
}

const INTENT_STYLE: Record<TrustedAction["intent"], string> = {
  tool: "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
  listing: "border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100",
  personal: "border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100",
  news: "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100",
  article: "border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100",
  login: "border-sky-300 bg-sky-600 text-white hover:bg-sky-700",
};

export function AiActions({ actions }: { actions: TrustedAction[] }) {
  if (!actions || actions.length === 0) return null;
  return (
    <div className="flex w-full flex-wrap gap-2">
      {actions.map((a) => (
        <Link
          key={a.id}
          href={a.url}
          onClick={() =>
            trackAiEvent("ai_action_click", aiCardClickParams(a.intent, a.intent))
          }
          className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${INTENT_STYLE[a.intent]}`}
        >
          {a.label}
        </Link>
      ))}
    </div>
  );
}
