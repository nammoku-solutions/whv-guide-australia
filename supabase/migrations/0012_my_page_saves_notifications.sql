-- オーストラリアワーホリコンパス - マイページ / 保存アイテム / アプリ内通知
-- Apply in the Supabase SQL editor AFTER 0011_official_source_monitor.sql.
--
-- Adds:
--   * `saved_items`            unified favourites for article / news / tool.
--                              (Marketplace listings keep the existing
--                               `saved_listings` table from 0008 unchanged.)
--   * `notifications`          structured in-app notifications (v1: in-app only).
--   * `notification_preferences` per-user opt-outs (schema kept extensible for
--                              future email / push channels).
--   * `saved_searches`         stored marketplace filters (matching-notification
--                              activation is deferred; see report).
--   * `create_notification()`  SECURITY DEFINER writer used by the triggers and
--                              the service-role broadcast API. Client roles can
--                              NEVER insert notifications directly.
--   * Event triggers that generate notifications server-side:
--       - new job application            -> listing owner
--       - application status change      -> applicant
--       - saved listing closed / expired -> users who saved it
--       - forum reply                    -> post author
--
-- All user-specific tables enforce user isolation with RLS keyed on auth.uid().

-- =========================================================
-- 1. saved_items (article / news / tool favourites)
-- =========================================================
create table if not exists saved_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  item_type text not null check (item_type in ('article', 'news', 'tool')),
  -- Canonical identifier only (article slug / news slug / tool slug). We never
  -- copy the canonical content into the save row.
  item_id text not null,
  created_at timestamptz not null default now(),
  unique (user_id, item_type, item_id)
);

create index if not exists saved_items_user_idx on saved_items (user_id, created_at desc);
create index if not exists saved_items_user_type_idx on saved_items (user_id, item_type);
create index if not exists saved_items_lookup_idx on saved_items (item_type, item_id);

alter table saved_items enable row level security;

drop policy if exists "Users read own saved items" on saved_items;
create policy "Users read own saved items" on saved_items
  for select using (auth.uid() = user_id);

drop policy if exists "Users save items" on saved_items;
create policy "Users save items" on saved_items
  for insert with check (auth.uid() = user_id and public.is_active_user());

drop policy if exists "Users remove own saved items" on saved_items;
create policy "Users remove own saved items" on saved_items
  for delete using (auth.uid() = user_id);

-- =========================================================
-- 2. notification_preferences (per-user opt-outs)
-- =========================================================
create table if not exists notification_preferences (
  user_id uuid primary key references profiles(id) on delete cascade,
  important_news boolean not null default true,
  saved_article_updated boolean not null default true,
  saved_listing_updated boolean not null default true,
  application_updates boolean not null default true,
  community_replies boolean not null default true,
  matching_listings boolean not null default true,
  -- Reserved for future channels (kept false in v1 = in-app only).
  email_enabled boolean not null default false,
  push_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table notification_preferences enable row level security;

drop policy if exists "Users read own notification prefs" on notification_preferences;
create policy "Users read own notification prefs" on notification_preferences
  for select using (auth.uid() = user_id);

drop policy if exists "Users create own notification prefs" on notification_preferences;
create policy "Users create own notification prefs" on notification_preferences
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users update own notification prefs" on notification_preferences;
create policy "Users update own notification prefs" on notification_preferences
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =========================================================
-- 3. notifications (structured in-app notifications)
-- =========================================================
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null check (type in (
    'saved_article_updated',
    'important_news',
    'saved_listing_updated',
    'saved_listing_closing',
    'saved_listing_closed',
    'new_matching_listing',
    'application_status_changed',
    'application_message',
    'community_reply',
    'system'
  )),
  title text not null,
  body text,
  target_type text,
  target_id text,
  target_url text,
  -- Deterministic idempotency key (e.g. saved_article_updated:<slug>:<updatedAt>).
  dedupe_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists notifications_user_created_idx
  on notifications (user_id, created_at desc);
-- Fast unread-count / unread-list lookups.
create index if not exists notifications_user_unread_idx
  on notifications (user_id) where read_at is null;
-- Dedupe: at most one notification per (user, dedupe_key).
create unique index if not exists notifications_user_dedupe_uidx
  on notifications (user_id, dedupe_key) where dedupe_key is not null;

alter table notifications enable row level security;

-- Users may read their own notifications only. No client INSERT policy exists on
-- purpose: notifications are created exclusively by create_notification()
-- (SECURITY DEFINER) via triggers or the service-role broadcast API.
drop policy if exists "Users read own notifications" on notifications;
create policy "Users read own notifications" on notifications
  for select using (auth.uid() = user_id);

-- Users may mark their own notifications read/unread. A trigger prevents editing
-- any column other than read_at.
drop policy if exists "Users update own notifications" on notifications;
create policy "Users update own notifications" on notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users delete own notifications" on notifications;
create policy "Users delete own notifications" on notifications
  for delete using (auth.uid() = user_id);

-- Only allow the read_at column to change on a user UPDATE (mark read/unread).
create or replace function public.protect_notification_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_moderator() then
    return new;
  end if;
  new.user_id := old.user_id;
  new.type := old.type;
  new.title := old.title;
  new.body := old.body;
  new.target_type := old.target_type;
  new.target_id := old.target_id;
  new.target_url := old.target_url;
  new.dedupe_key := old.dedupe_key;
  new.metadata := old.metadata;
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists trg_protect_notification on notifications;
create trigger trg_protect_notification
  before update on notifications
  for each row execute function public.protect_notification_fields();

-- =========================================================
-- 4. saved_searches (stored marketplace filters)
-- =========================================================
create table if not exists saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  label text not null,
  -- Which marketplace listing_type the search targets (or null = any).
  listing_type text
    check (listing_type is null or listing_type in
      ('job', 'farm_job', 'housing', 'roommate', 'vehicle', 'marketplace')),
  -- Structured filter payload mirroring ListingFilters (SQL-matchable, no AI).
  filters jsonb not null default '{}'::jsonb,
  notify boolean not null default true,
  last_notified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, label)
);

create index if not exists saved_searches_user_idx on saved_searches (user_id, created_at desc);

alter table saved_searches enable row level security;

drop policy if exists "Users read own saved searches" on saved_searches;
create policy "Users read own saved searches" on saved_searches
  for select using (auth.uid() = user_id);

drop policy if exists "Users create own saved searches" on saved_searches;
create policy "Users create own saved searches" on saved_searches
  for insert with check (auth.uid() = user_id and public.is_active_user());

drop policy if exists "Users update own saved searches" on saved_searches;
create policy "Users update own saved searches" on saved_searches
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users delete own saved searches" on saved_searches;
create policy "Users delete own saved searches" on saved_searches
  for delete using (auth.uid() = user_id);

-- =========================================================
-- 5. create_notification() — the single trusted writer
-- =========================================================
-- Respects the recipient's notification_preferences (missing row = all enabled)
-- and dedupes on (user_id, dedupe_key). SECURITY DEFINER so triggers and the
-- service-role API can insert across users without a client-facing INSERT policy.
create or replace function public.create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text default null,
  p_target_type text default null,
  p_target_id text default null,
  p_target_url text default null,
  p_dedupe_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pref_column text;
  v_enabled boolean;
  v_id uuid;
begin
  if p_user_id is null then
    return null;
  end if;

  -- Map notification type -> preference column ('system' bypasses preferences).
  v_pref_column := case p_type
    when 'important_news' then 'important_news'
    when 'saved_article_updated' then 'saved_article_updated'
    when 'saved_listing_updated' then 'saved_listing_updated'
    when 'saved_listing_closing' then 'saved_listing_updated'
    when 'saved_listing_closed' then 'saved_listing_updated'
    when 'new_matching_listing' then 'matching_listings'
    when 'application_status_changed' then 'application_updates'
    when 'application_message' then 'application_updates'
    when 'community_reply' then 'community_replies'
    else null
  end;

  if v_pref_column is not null then
    execute format(
      'select coalesce((select %I from notification_preferences where user_id = $1), true)',
      v_pref_column
    ) into v_enabled using p_user_id;
    if not coalesce(v_enabled, true) then
      return null;
    end if;
  end if;

  insert into notifications (
    user_id, type, title, body, target_type, target_id, target_url, dedupe_key, metadata
  ) values (
    p_user_id, p_type, p_title, p_body, p_target_type, p_target_id, p_target_url,
    p_dedupe_key, coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (user_id, dedupe_key) where dedupe_key is not null
  do nothing
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_notification(
  uuid, text, text, text, text, text, text, text, jsonb
) from public, anon, authenticated;

-- The service-role broadcast API (article updates / important news) calls this
-- RPC; grant it EXECUTE explicitly. Anonymous/authenticated clients cannot.
grant execute on function public.create_notification(
  uuid, text, text, text, text, text, text, text, jsonb
) to service_role;

-- =========================================================
-- 6. Event triggers -> notifications
-- =========================================================

-- 6a. New job application -> listing owner.
create or replace function public.notify_owner_on_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_title text;
begin
  select user_id, title into v_owner, v_title from listings where id = new.listing_id;
  if v_owner is null or v_owner = new.applicant_id then
    return new;
  end if;
  perform public.create_notification(
    v_owner,
    'application_message',
    '新しい応募が届きました',
    coalesce('「' || v_title || '」に新しい応募があります。', '掲載に新しい応募があります。'),
    'listing',
    new.listing_id::text,
    '/community/market/listing/' || new.listing_id::text || '/applicants',
    'application_new:' || new.id::text,
    jsonb_build_object('application_id', new.id)
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_owner_on_application on listing_applications;
create trigger trg_notify_owner_on_application
  after insert on listing_applications
  for each row execute function public.notify_owner_on_application();

-- 6b. Application status change -> applicant.
create or replace function public.notify_applicant_on_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_label text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  -- Applicant self-actions (e.g. withdraw) should not notify the applicant.
  if auth.uid() = new.applicant_id then
    return new;
  end if;
  select title into v_title from listings where id = new.listing_id;
  v_label := case new.status
    when 'viewed' then '応募が確認されました'
    when 'contacted' then '掲載者から連絡がありました'
    when 'interview' then '面接の案内があります'
    when 'accepted' then '採用の連絡がありました'
    when 'rejected' then '今回は見送りとなりました'
    else '応募の状況が更新されました'
  end;
  perform public.create_notification(
    new.applicant_id,
    'application_status_changed',
    v_label,
    coalesce('「' || v_title || '」の応募ステータスが更新されました。', '応募ステータスが更新されました。'),
    'listing',
    new.listing_id::text,
    '/community/market/listing/' || new.listing_id::text,
    'application_status:' || new.id::text || ':' || new.status,
    jsonb_build_object('application_id', new.id, 'status', new.status)
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_applicant_on_status on listing_applications;
create trigger trg_notify_applicant_on_status
  after update of status on listing_applications
  for each row execute function public.notify_applicant_on_status();

-- 6c. Saved listing closed / expired -> users who saved it.
create or replace function public.notify_savers_on_listing_close()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saver record;
  v_type text;
  v_label text;
begin
  if new.status = old.status then
    return new;
  end if;
  if new.status not in ('closed', 'expired') then
    return new;
  end if;
  v_type := case when new.status = 'closed' then 'saved_listing_closed' else 'saved_listing_updated' end;
  v_label := case when new.status = 'closed' then '保存した掲載が募集終了しました' else '保存した掲載が期限切れになりました' end;
  for v_saver in
    select user_id from saved_listings where listing_id = new.id and user_id <> new.user_id
  loop
    perform public.create_notification(
      v_saver.user_id,
      v_type,
      v_label,
      coalesce('保存した「' || new.title || '」の募集が終了しました。', '保存した掲載の募集が終了しました。'),
      'listing',
      new.id::text,
      '/community/market/listing/' || new.id::text,
      'listing_' || new.status || ':' || new.id::text,
      jsonb_build_object('status', new.status)
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_notify_savers_on_listing_close on listings;
create trigger trg_notify_savers_on_listing_close
  after update of status on listings
  for each row execute function public.notify_savers_on_listing_close();

-- 6d. Forum reply -> post author.
create or replace function public.notify_author_on_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
  v_title text;
begin
  select user_id, title into v_author, v_title from forum_posts where id = new.post_id;
  if v_author is null or v_author = new.user_id then
    return new;
  end if;
  perform public.create_notification(
    v_author,
    'community_reply',
    'あなたの投稿に返信がありました',
    coalesce('「' || v_title || '」に新しいコメントがつきました。', '投稿に新しいコメントがつきました。'),
    'forum_post',
    new.post_id::text,
    '/community/posts/' || new.post_id::text,
    'forum_reply:' || new.id::text,
    jsonb_build_object('comment_id', new.id)
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_author_on_comment on forum_comments;
create trigger trg_notify_author_on_comment
  after insert on forum_comments
  for each row execute function public.notify_author_on_comment();

-- =========================================================
-- 7. Retention helper (optional; schedule with pg_cron)
-- =========================================================
-- Keep the notification table small: delete read notifications older than N days
-- and any notification older than a hard cap. Marking read never deletes; this
-- is a separate maintenance job.
create or replace function public.prune_notifications(
  p_read_days int default 90,
  p_max_days int default 365
)
returns void
language sql
security definer
set search_path = public
as $$
  delete from notifications
   where (read_at is not null and read_at < now() - make_interval(days => greatest(1, p_read_days)))
      or (created_at < now() - make_interval(days => greatest(1, p_max_days)));
$$;

revoke all on function public.prune_notifications(int, int) from public, anon, authenticated;
