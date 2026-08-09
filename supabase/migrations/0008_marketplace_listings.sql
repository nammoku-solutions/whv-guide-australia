-- オーストラリアワーホリコンパス - user-generated marketplace listings & job applications
-- Apply in the Supabase SQL editor AFTER 0007_article_feedback.sql.
--
-- Adds a unified `listings` model (jobs / farm jobs / housing / roommate /
-- vehicles / general marketplace), a job `listing_applications` workflow, and
-- `saved_listings` favourites. Reporting reuses the existing generic `reports`
-- table (target_type = 'listing'). Permissions are enforced with RLS plus
-- BEFORE-UPDATE triggers that protect moderation-only and applicant-only columns.

-- =========================================================
-- Tables
-- =========================================================

create table if not exists listings (
  id uuid primary key default gen_random_uuid(),
  listing_type text not null
    check (listing_type in ('job', 'farm_job', 'housing', 'roommate', 'vehicle', 'marketplace')),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  description text not null,
  location text,
  status text not null default 'active'
    check (status in ('draft', 'active', 'closed', 'expired', 'removed')),
  -- How applicants/enquirers should reach the poster.
  contact_method text not null default 'application'
    check (contact_method in ('application', 'email', 'phone', 'external', 'enquiry')),
  -- Optional contact value shown ONLY when the poster explicitly provides one.
  contact_value text,
  -- Public identity: self posting, official operator, or delegated (掲載代行).
  posting_mode text not null default 'self'
    check (posting_mode in ('self', 'operator', 'delegated')),
  -- Represented party name for delegated (掲載代行) listings.
  represented_party text,
  -- Public image URLs (Supabase Storage public bucket).
  images text[] not null default '{}',
  expires_at timestamp with time zone,
  -- Moderation fields are private and protected by a trigger below.
  is_hidden boolean not null default false,
  moderation_note text,
  -- Type-specific structured fields (wage, rent, vehicle specs, ...).
  details jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index if not exists listings_type_status_idx on listings (listing_type, status);
create index if not exists listings_user_idx on listings (user_id);
create index if not exists listings_expires_idx on listings (expires_at);
create index if not exists listings_created_idx on listings (created_at desc);

create table if not exists listing_applications (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  applicant_id uuid not null references profiles(id) on delete cascade,
  -- Applicant-supplied fields (private, never exposed publicly).
  message text,
  availability text,
  contact_info text,
  status text not null default 'applied'
    check (status in ('applied', 'viewed', 'contacted', 'interview', 'accepted', 'rejected', 'withdrawn')),
  employer_response text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique (listing_id, applicant_id)
);

create index if not exists listing_applications_listing_idx on listing_applications (listing_id);
create index if not exists listing_applications_applicant_idx on listing_applications (applicant_id);

create table if not exists saved_listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  listing_id uuid not null references listings(id) on delete cascade,
  created_at timestamp with time zone default now(),
  unique (user_id, listing_id)
);

create index if not exists saved_listings_user_idx on saved_listings (user_id);

-- =========================================================
-- Column-protection triggers
-- =========================================================

-- Reset moderation-only columns unless the caller is a moderator/admin, so a
-- normal owner editing their own listing can never unhide it or read/write the
-- private moderation note.
create or replace function public.protect_listing_moderation_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_moderator() then
    new.is_hidden := old.is_hidden;
    new.moderation_note := old.moderation_note;
    -- Only operators/admins may switch a listing into a delegated/operator mode.
    if new.posting_mode is distinct from old.posting_mode and new.posting_mode <> 'self' then
      new.posting_mode := old.posting_mode;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_protect_listing_moderation on listings;
create trigger trg_protect_listing_moderation
  before update on listings
  for each row execute function public.protect_listing_moderation_fields();

-- Enforce who may change which application columns:
--   * applicant (not owner/mod): may only withdraw; employer fields immutable.
--   * owner / moderator: may set status + employer_response only.
create or replace function public.protect_application_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select user_id into v_owner from listings where id = new.listing_id;

  if auth.uid() = new.applicant_id and auth.uid() <> v_owner and not public.is_moderator() then
    -- Applicant may only move their own application to 'withdrawn'.
    if new.status <> 'withdrawn' then
      new.status := old.status;
    end if;
    new.employer_response := old.employer_response;
    new.message := old.message;
    new.availability := old.availability;
    new.contact_info := old.contact_info;
  elsif (auth.uid() = v_owner or public.is_moderator()) and auth.uid() <> new.applicant_id then
    -- Employer/moderator may update status + response, never applicant content.
    new.message := old.message;
    new.availability := old.availability;
    new.contact_info := old.contact_info;
    new.applicant_id := old.applicant_id;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_protect_application on listing_applications;
create trigger trg_protect_application
  before update on listing_applications
  for each row execute function public.protect_application_fields();

-- Optional maintenance helper: flip active listings past their expiry date.
-- Schedule with pg_cron if available; app-side reads also filter by expiry.
create or replace function public.expire_listings()
returns void
language sql
security definer
set search_path = public
as $$
  update listings
     set status = 'expired', updated_at = now()
   where status = 'active'
     and expires_at is not null
     and expires_at <= now();
$$;

-- =========================================================
-- Enable RLS
-- =========================================================

alter table listings enable row level security;
alter table listing_applications enable row level security;
alter table saved_listings enable row level security;

-- =========================================================
-- listings policies
-- =========================================================

-- Public may read any non-hidden, non-removed listing (any lifecycle status so
-- closed/expired detail pages still resolve). Owners and moderators see all.
create policy "Listings are public" on listings
  for select using (
    (not is_hidden and status <> 'removed')
    or auth.uid() = user_id
    or public.is_moderator()
  );

-- Only verified active users may post. Operator/delegated modes require a
-- moderator/admin; normal users are limited to self posting.
create policy "Active users create listings" on listings
  for insert with check (
    auth.uid() = user_id
    and public.is_active_user()
    and (posting_mode = 'self' or public.is_moderator())
  );

create policy "Authors update own listings" on listings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Moderators manage listings" on listings
  for update using (public.is_moderator());

create policy "Authors delete own listings" on listings
  for delete using (auth.uid() = user_id or public.is_moderator());

-- =========================================================
-- listing_applications policies
-- =========================================================

-- Applicant sees own applications; the listing owner sees applications to their
-- own listing; moderators see all. Nobody else can read applicant data.
create policy "Applicants and owners read applications" on listing_applications
  for select using (
    auth.uid() = applicant_id
    or auth.uid() = (select user_id from listings where id = listing_id)
    or public.is_moderator()
  );

-- A verified active user may apply once to someone else's open, non-hidden,
-- application-based job/farm listing that has not expired.
create policy "Active users apply to open jobs" on listing_applications
  for insert with check (
    auth.uid() = applicant_id
    and public.is_active_user()
    and exists (
      select 1 from listings l
      where l.id = listing_id
        and l.user_id <> auth.uid()
        and l.status = 'active'
        and not l.is_hidden
        and l.listing_type in ('job', 'farm_job')
        and l.contact_method = 'application'
        and (l.expires_at is null or l.expires_at > now())
    )
  );

-- Row visibility for update is limited to applicant, owner, moderator; the
-- protect_application_fields trigger enforces column-level permissions.
create policy "Applicants withdraw, owners update status" on listing_applications
  for update using (
    auth.uid() = applicant_id
    or auth.uid() = (select user_id from listings where id = listing_id)
    or public.is_moderator()
  );

-- =========================================================
-- saved_listings policies (fully private to the owner)
-- =========================================================

create policy "Users read own saved listings" on saved_listings
  for select using (auth.uid() = user_id);

create policy "Users save listings" on saved_listings
  for insert with check (auth.uid() = user_id and public.is_active_user());

create policy "Users remove own saved listings" on saved_listings
  for delete using (auth.uid() = user_id);
