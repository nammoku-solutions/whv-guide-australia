import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServerSecrets } from "../config";

/**
 * AI 用の Supabase 管理クライアント（service-role）。サーバー専用。
 * 埋め込みの保存、RPC 経由の類似検索、レート制限、フィードバック保存など、
 * RLS を跨いだ信頼済みサーバー処理にのみ使用する。クライアントへ露出させない。
 */
let cached: SupabaseClient | null = null;

export function getAiAdminClient(): SupabaseClient | null {
  if (cached) return cached;
  const { supabaseUrl, supabaseServiceRoleKey } = getServerSecrets();
  if (!supabaseUrl || !supabaseServiceRoleKey) return null;
  cached = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}
