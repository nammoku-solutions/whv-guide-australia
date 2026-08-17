-- オーストラリアワーホリコンパス - 外部ニュース候補インボックス（External News Candidate Inbox）。
-- 0013_news_backfill_origin.sql の後に適用してください。
--
-- 背景:
--   * 本番（データセンター相当）からの直接取得は Home Affairs / ATO で 403、Fair Work で
--     timeout し、live 監視が degraded になり得る（OFFICIAL_SOURCE_MONITOR_HEALTH_REPORT.md）。
--   * そこで「信頼できる外部リサーチ（例: ChatGPT の週次調査）」や「スマホからの管理者取り込み」が、
--     公式 URL に紐づく構造化エビデンスを候補として投函できる取り込み層を追加する。
--   * これは取り込み（ingestion）層のみ。関連度・grounding・dedupe・リスク・公開ポリシー・
--     記事影響・AI 索引はすべて既存の共有パイプライン（lib/monitor/backfill/pipeline.ts の
--     processCandidate）を再利用する。別系統のニュース生成器は作らない。
--
-- セキュリティ設計（#26）:
--   * RLS 有効。匿名/通常認証ユーザーは候補に一切アクセスできない。
--   * モデレーター/管理者は SELECT のみ（管理 UI 表示用）。
--   * すべての書き込み（insert/claim/update）は service-role（RLS バイパス）経由のサーバー処理のみ。
--     クライアント向けの insert/update/delete ポリシーは意図的に作らない。
--   * 秘匿値は保存しない。エビデンスは公式一次情報の要約/事実のみ（全文複製を要求しない）。

-- =========================================================
-- 1. external_news_candidates（取り込み候補）
-- =========================================================
create table if not exists external_news_candidates (
  id uuid primary key default gen_random_uuid(),

  -- --- 出典（公式一次情報） ---
  source_organisation text,
  source_url text not null,                    -- 正規化済みの公式 URL（allow-list 検証済み）
  source_title text not null,
  source_published_at date not null,           -- 公式の公開日（推測しない）
  source_updated_at date,                      -- 公式の更新日（あれば）

  -- --- エビデンス（生成のための唯一の根拠。全文複製は要求しない） ---
  -- 構造化 DTO {summary, facts[], numbers[], dates[], text?} を保持する。
  source_evidence jsonb not null default '{}'::jsonb,
  source_evidence_hash text not null,          -- 正規化本文の決定的ハッシュ（取り込み dedupe 用）
  evidence_origin text not null default 'external_research'
    check (evidence_origin in ('official_fetch', 'external_research', 'operator_content')),

  -- --- 分類ヒント（任意。最終的なカテゴリはレジストリのソース定義が権威） ---
  category_hint text
    check (category_hint is null or category_hint in ('visa', 'tax', 'cost', 'site', 'other')),

  -- --- 投函元・監査 ---
  origin text not null default 'system'
    check (origin in ('chatgpt_weekly', 'admin_mobile', 'manual_seed_bridge', 'system')),
  submitted_by uuid references profiles (id) on delete set null,  -- モバイル取り込み時のモデレーター
  submitted_at timestamptz not null default now(),

  -- --- 処理状態機械 ---
  status text not null default 'pending'
    check (status in (
      'pending',        -- 未処理
      'processing',     -- 処理中（claim 済み）
      'published',      -- 公開済み（low/medium リスクで全条件合格）
      'review_required',-- レビュー要求（高リスク/不確実）
      'duplicate',      -- 既存ニュース/候補と重複
      'irrelevant',     -- WHV 無関係
      'skipped',        -- 弱関連/薄い/grounding 等でスキップ
      'failed',         -- 一時的/永続的な失敗
      'rejected'        -- モデレーターが却下
    )),
  processing_started_at timestamptz,
  processed_at timestamptz,
  processing_attempts integer not null default 0,
  last_error_code text,
  last_error_message text,

  -- --- 生成結果へのリンク ---
  news_item_id uuid references news_items (id) on delete set null,

  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 実運用パターンに合わせた最小限のインデックス（#27）。
create index if not exists external_news_candidates_status_idx
  on external_news_candidates (status, submitted_at desc);
create index if not exists external_news_candidates_url_idx
  on external_news_candidates (source_url);
create index if not exists external_news_candidates_published_idx
  on external_news_candidates (source_published_at desc);
create index if not exists external_news_candidates_news_idx
  on external_news_candidates (news_item_id) where news_item_id is not null;
-- 取り込み dedupe: 同一 (URL, エビデンスハッシュ) の重複投函を防ぎ、再送を安全にする。
create unique index if not exists external_news_candidates_dedupe_uidx
  on external_news_candidates (source_url, source_evidence_hash);

alter table external_news_candidates enable row level security;

-- モデレーター/管理者のみ SELECT（管理 UI 用）。書き込みポリシーは無し = service-role 専用。
drop policy if exists "Moderators read external candidates" on external_news_candidates;
create policy "Moderators read external candidates" on external_news_candidates
  for select using (public.is_moderator());

-- =========================================================
-- 2. news_items に外部候補リンク & 'external' origin を追加（既存ポリシーは不変）
-- =========================================================
alter table news_items
  add column if not exists external_candidate_id uuid
    references external_news_candidates (id) on delete set null;

create index if not exists news_items_external_candidate_idx
  on news_items (external_candidate_id) where external_candidate_id is not null;

-- backfill_origin に 'external' を許可（0013 の CHECK を新マイグレーションで拡張）。
-- 外部候補由来のニュースは backfill_origin='external' で監査ラベル付けする。
alter table news_items
  drop constraint if exists news_items_backfill_origin_check;
alter table news_items
  add constraint news_items_backfill_origin_check
    check (backfill_origin is null or backfill_origin in ('archive', 'manual_seed', 'external'));

-- =========================================================
-- 3. 保持/クリーンアップ（#20）
-- =========================================================
-- 監査価値の低い終了状態（duplicate/irrelevant/skipped/failed）を一定期間後に削除する。
-- published / review_required は provenance として保持する。SECURITY DEFINER で RLS 下でも
-- 実行可能にし、PUBLIC からは剥奪して service-role にのみ付与する。
create or replace function public.prune_external_news_candidates(
  p_keep_days int default 60
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from external_news_candidates
  where status in ('duplicate', 'irrelevant', 'skipped', 'failed')
    and submitted_at < now() - make_interval(days => greatest(1, p_keep_days));
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.prune_external_news_candidates(int) from public;
revoke all on function public.prune_external_news_candidates(int) from anon;
revoke all on function public.prune_external_news_candidates(int) from authenticated;
grant execute on function public.prune_external_news_candidates(int) to service_role;
