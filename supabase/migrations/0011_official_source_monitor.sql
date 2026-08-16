-- オーストラリアワーホリコンパス - 公式情報源の監視 & ニュース自動化。
-- Apply in the Supabase SQL editor AFTER 0010_ai_keyword_search.sql.
--
-- Design:
--   * Source *definitions* (allow-list) live in code (lib/monitor/registry.ts) so
--     they are version-controlled and reviewable. This migration stores only the
--     MUTABLE monitoring state, snapshots, detected changes, generated news, and
--     article-impact records.
--   * All privileged writes happen through the service-role key (bypasses RLS)
--     from the monitoring pipeline / admin API. Anonymous clients can read ONLY
--     published news_items (for the public /news and /changes pages).
--   * Moderators may read every table (for the admin dashboard) via is_moderator().
--   * No table exposes secrets; source content snapshots are public-published
--     government text only and are readable by moderators, not anonymous users.

-- =========================================================
-- 1. Mutable monitoring state (one row per allow-listed source)
-- =========================================================
create table if not exists monitor_source_state (
  source_id text primary key,                 -- matches registry.ts source_id
  last_checked timestamptz,
  last_changed timestamptz,
  content_hash text,                          -- last known deterministic hash
  last_status text,                           -- success | timeout | http_error | parse_error | blocked | unexpected_structure
  last_error text,
  consecutive_failures integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table monitor_source_state enable row level security;

drop policy if exists "Moderators read source state" on monitor_source_state;
create policy "Moderators read source state" on monitor_source_state
  for select using (public.is_moderator());

-- =========================================================
-- 2. Content snapshots (limited retention, moderators only)
-- =========================================================
create table if not exists monitor_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_id text not null,
  content_hash text not null,
  extracted_text text not null,               -- normalised publisher content (no nav/footer)
  http_status integer,
  fetched_at timestamptz not null default now()
);

create index if not exists monitor_snapshots_source_idx
  on monitor_snapshots (source_id, fetched_at desc);

alter table monitor_snapshots enable row level security;

drop policy if exists "Moderators read snapshots" on monitor_snapshots;
create policy "Moderators read snapshots" on monitor_snapshots
  for select using (public.is_moderator());

-- =========================================================
-- 3. Detected official-source changes
-- =========================================================
create table if not exists monitor_changes (
  id uuid primary key default gen_random_uuid(),
  source_id text not null,
  organisation text not null,
  source_name text not null,
  url text not null,
  category text not null,
  risk_level text not null default 'low'
    check (risk_level in ('low', 'medium', 'high')),
  previous_hash text,
  new_hash text not null,
  diff text,                                  -- best-effort human-readable diff
  relevance text                              -- highly_relevant | relevant | weakly_relevant | unrelated
    check (relevance is null or relevance in
      ('highly_relevant', 'relevant', 'weakly_relevant', 'unrelated')),
  relevance_confidence double precision,
  snapshot_id uuid references monitor_snapshots (id) on delete set null,
  detected_at timestamptz not null default now(),
  status text not null default 'new'          -- new | processed | ignored
    check (status in ('new', 'processed', 'ignored')),
  created_at timestamptz not null default now()
);

-- One change row per (source, new content hash): deterministic dedupe of changes.
create unique index if not exists monitor_changes_source_hash_uidx
  on monitor_changes (source_id, new_hash);
create index if not exists monitor_changes_status_idx
  on monitor_changes (status, detected_at desc);

alter table monitor_changes enable row level security;

drop policy if exists "Moderators read changes" on monitor_changes;
create policy "Moderators read changes" on monitor_changes
  for select using (public.is_moderator());

-- =========================================================
-- 4. Generated / published news items (automated)
-- =========================================================
-- Hand-authored news stays in code (lib/newsData.ts). This table holds only
-- machine-generated, source-grounded news. status gates public visibility.
create table if not exists news_items (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  summary text not null,
  what_changed text,
  who_is_affected text,
  what_to_do text,
  body jsonb not null default '[]'::jsonb,     -- string[] paragraphs for the article view
  category text not null default 'other'       -- NewsCategory: visa | tax | cost | site | other
    check (category in ('visa', 'tax', 'cost', 'site', 'other')),
  change_group text not null default 'other',  -- grouping for /changes: visa|work|tax|super|cars|housing|other
  source_organisation text,
  source_title text,
  source_url text,
  source_published_at timestamptz,
  detected_at timestamptz not null default now(),
  verified_at timestamptz,
  risk_level text not null default 'low'
    check (risk_level in ('low', 'medium', 'high')),
  confidence double precision not null default 0,
  source_snapshot_id uuid references monitor_snapshots (id) on delete set null,
  related_article_ids text[] not null default '{}',
  related_guide_slug text,
  publication_mode text not null default 'review'    -- auto | review
    check (publication_mode in ('auto', 'review')),
  status text not null default 'review_required'      -- draft | review_required | published | rejected
    check (status in ('draft', 'review_required', 'published', 'rejected')),
  change_id uuid references monitor_changes (id) on delete set null,
  content_hash text,
  event_key text,                              -- source_id + normalised event identity (dedupe)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create unique index if not exists news_items_event_key_uidx
  on news_items (event_key) where event_key is not null;
create index if not exists news_items_status_idx
  on news_items (status, published_at desc nulls last);
create index if not exists news_items_group_idx on news_items (change_group);

alter table news_items enable row level security;

-- Anonymous & authenticated clients may read ONLY published items.
drop policy if exists "Public read published news" on news_items;
create policy "Public read published news" on news_items
  for select using (status = 'published');

-- Moderators may read every item (drafts / review / rejected) for the dashboard.
drop policy if exists "Moderators read all news" on news_items;
create policy "Moderators read all news" on news_items
  for select using (public.is_moderator());

-- =========================================================
-- 5. Article impact records
-- =========================================================
create table if not exists article_impacts (
  id uuid primary key default gen_random_uuid(),
  change_id uuid references monitor_changes (id) on delete cascade,
  news_id uuid references news_items (id) on delete set null,
  article_id text not null,
  article_title text not null,
  article_url text not null,
  impact_level text not null default 'review_recommended'
    check (impact_level in
      ('unaffected', 'review_recommended', 'likely_outdated', 'requires_update')),
  reason text,
  affected_sections text[] not null default '{}',
  previous_verified_at text,
  recommended_action text,
  status text not null default 'open'          -- open | reviewed | resolved
    check (status in ('open', 'reviewed', 'resolved')),
  reviewed_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists article_impacts_change_article_uidx
  on article_impacts (change_id, article_id);
create index if not exists article_impacts_status_idx
  on article_impacts (status, created_at desc);

alter table article_impacts enable row level security;

drop policy if exists "Moderators read article impacts" on article_impacts;
create policy "Moderators read article impacts" on article_impacts
  for select using (public.is_moderator());

-- =========================================================
-- 6. Snapshot retention helper (keep the most recent N per source)
-- =========================================================
-- Called by the pipeline after inserting a new snapshot. SECURITY DEFINER so it
-- can prune under RLS. Retention keeps state small and cheap.
create or replace function public.prune_monitor_snapshots(
  p_source_id text,
  p_keep int default 5
)
returns void
language sql
security definer
set search_path = public
as $$
  delete from monitor_snapshots
  where source_id = p_source_id
    and id not in (
      select id from monitor_snapshots
      where source_id = p_source_id
      order by fetched_at desc
      limit greatest(1, p_keep)
    );
$$;

revoke all on function public.prune_monitor_snapshots(text, int) from public;
revoke all on function public.prune_monitor_snapshots(text, int) from anon;
revoke all on function public.prune_monitor_snapshots(text, int) from authenticated;
