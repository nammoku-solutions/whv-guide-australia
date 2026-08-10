import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocketImpl from "ws";
import { getServerSecrets } from "../config";

/**
 * AI 用の Supabase 管理クライアント（service-role）。サーバー専用。
 * 埋め込みの保存、RPC 経由の類似検索、レート制限、フィードバック保存など、
 * RLS を跨いだ信頼済みサーバー処理にのみ使用する。クライアントへ露出させない。
 */
let cached: SupabaseClient | null = null;

// Node < 22 はグローバル WebSocket を持たず、supabase-js のクライアント生成時に
// 失敗する。AI 用途は realtime を使わないが、生成時に必要なため ws を transport に
// 与える（Node 22+ / ブラウザではネイティブを使い ws は渡さない）。
type RealtimeTransport = NonNullable<
  NonNullable<Parameters<typeof createClient>[2]>["realtime"]
>["transport"];

const realtimeTransport: RealtimeTransport | undefined =
  typeof globalThis.WebSocket === "undefined"
    ? (WebSocketImpl as unknown as RealtimeTransport)
    : undefined;

export function getAiAdminClient(): SupabaseClient | null {
  if (cached) return cached;
  const { supabaseUrl, supabaseServiceRoleKey } = getServerSecrets();
  if (!supabaseUrl || !supabaseServiceRoleKey) return null;
  cached = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    ...(realtimeTransport
      ? { realtime: { transport: realtimeTransport } }
      : {}),
  });
  return cached;
}
