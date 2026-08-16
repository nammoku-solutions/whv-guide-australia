-- オーストラリアワーホリコンパス - 公式ニュースの「歴史的バックフィル」用の
-- 追加スキーマ。0011_official_source_monitor.sql の後に適用してください。
--
-- 設計の要点:
--   * これは「日次モニタ」を置き換えるものではない。過去（例: 2026-06-01〜2026-08-16）の
--     公式ニュースを一度だけ取り込むための、独立した監査可能な実行記録を持たせる。
--   * 既存の live-monitor 状態（monitor_source_state / monitor_snapshots /
--     monitor_changes）は一切変更しない。バックフィルは news_items（＋バックフィル用の
--     列）と article_impacts、そして本マイグレーションの news_backfill_runs のみに書き込む。
--   * すべての特権書き込みは service-role（RLS バイパス）で行う。匿名クライアントは
--     引き続き published の news_items のみ読める（0011 のポリシーを踏襲）。

-- =========================================================
-- 1. Backfill run 監査テーブル（1 回の実行 = 1 行）
-- =========================================================
create table if not exists news_backfill_runs (
  id uuid primary key default gen_random_uuid(),
  from_date date not null,
  to_date date not null,
  mode text not null default 'dry_run'          -- dry_run | apply
    check (mode in ('dry_run', 'apply')),
  status text not null default 'running'         -- running | completed | failed
    check (status in ('running', 'completed', 'failed')),
  sources_checked integer not null default 0,
  sources_supported integer not null default 0,
  sources_unsupported integer not null default 0,
  candidates_discovered integer not null default 0,
  candidates_relevant integer not null default 0,
  published_count integer not null default 0,
  review_required_count integer not null default 0,
  duplicate_count integer not null default 0,
  skipped_count integer not null default 0,
  error_count integer not null default 0,
  impacts_created integer not null default 0,
  indexed_count integer not null default 0,
  notes text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists news_backfill_runs_started_idx
  on news_backfill_runs (started_at desc);

alter table news_backfill_runs enable row level security;

drop policy if exists "Moderators read backfill runs" on news_backfill_runs;
create policy "Moderators read backfill runs" on news_backfill_runs
  for select using (public.is_moderator());

-- =========================================================
-- 2. news_items にバックフィル用の列を追加（既存ポリシーは不変）
-- =========================================================
-- is_backfill        : 歴史的バックフィルで取り込まれた項目かどうか（UI ラベル・順序制御用）。
-- backfill_run_id    : どの実行で取り込まれたかの監査リンク。
-- source_updated_at  : 公式の更新日（officialUpdatedAt, あれば）。source_published_at
--                      （officialPublishedAt）・detected_at（取り込み日時）・verified_at と
--                      意味を混同しないために別列で保持する。
alter table news_items
  add column if not exists is_backfill boolean not null default false;
alter table news_items
  add column if not exists backfill_run_id uuid
    references news_backfill_runs (id) on delete set null;
alter table news_items
  add column if not exists source_updated_at timestamptz;

create index if not exists news_items_backfill_idx
  on news_items (is_backfill, source_published_at desc nulls last);
