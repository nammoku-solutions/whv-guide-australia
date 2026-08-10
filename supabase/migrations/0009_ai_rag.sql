-- オーストラリアワーホリコンパス - site AI (RAG) storage, retrieval RPC,
-- rate limiting, and AI feedback.
-- Apply in the Supabase SQL editor AFTER 0008_marketplace_listings.sql.
--
-- Design:
--   * ai_article_chunks stores heading-aware semantic chunks + pgvector embeddings.
--   * Embeddings are NEVER exposed to anonymous clients. RLS denies public SELECT;
--     only moderators may read. Retrieval runs server-side via the service-role
--     key calling match_ai_article_chunks (SECURITY DEFINER).
--   * ai_rate_limits + ai_increment_rate_limit enforce per-day request caps
--     atomically on the server.
--   * ai_feedback stores minimal, non-personal 👍/👎 signals.

-- =========================================================
-- pgvector
-- =========================================================
create extension if not exists vector;

-- =========================================================
-- Indexed article chunks
-- =========================================================
-- NOTE: embedding dimension (768) MUST match AI_EMBEDDING_DIMENSIONS in the app
-- config. Changing it requires a new column/table and a full reindex.
create table if not exists ai_article_chunks (
  id uuid primary key default gen_random_uuid(),
  chunk_id text unique not null,            -- e.g. "<slug>::<index>"
  article_id text not null,
  title text not null,
  slug text not null,
  url text not null,
  category text not null,
  heading text not null,
  chunk_index integer not null,
  content text not null,
  content_hash text not null,
  updated_at timestamp with time zone,
  risk_level text not null default 'low'
    check (risk_level in ('low', 'medium', 'high')),
  embedding_provider text not null default 'gemini',
  embedding_model text not null,
  embedding_version text not null,
  embedding vector(768) not null,
  indexed_at timestamp with time zone default now()
);

create index if not exists ai_article_chunks_slug_idx on ai_article_chunks (slug);
create index if not exists ai_article_chunks_version_idx on ai_article_chunks (embedding_version);
create index if not exists ai_article_chunks_hash_idx on ai_article_chunks (content_hash);

-- V1 uses exact (sequential) cosine search: accurate and fast for a small
-- dataset. When the corpus/traffic grows, add an approximate index (HNSW):
--   create index ai_article_chunks_embedding_hnsw
--     on ai_article_chunks using hnsw (embedding vector_cosine_ops);
-- The retrieval RPC below is already HNSW-compatible (cosine <=> ordering).

alter table ai_article_chunks enable row level security;

-- No public/anon SELECT policy -> anonymous clients cannot read chunks/embeddings.
-- Only moderators may read (for the admin diagnostics panel). Writes happen only
-- through the service-role key (bypasses RLS) from the indexing pipeline.
drop policy if exists "Moderators read ai chunks" on ai_article_chunks;
create policy "Moderators read ai chunks" on ai_article_chunks
  for select
  using (public.is_moderator());

-- =========================================================
-- Retrieval RPC (semantic similarity)
-- =========================================================
-- Returns cosine similarity (1 - distance). Only chunks matching the active
-- embedding_version are searched, so incompatible embedding generations never
-- mix in the same result set.
create or replace function public.match_ai_article_chunks(
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  p_embedding_version text
)
returns table (
  chunk_id text,
  article_id text,
  title text,
  slug text,
  url text,
  category text,
  heading text,
  content text,
  risk_level text,
  similarity float
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.chunk_id,
    c.article_id,
    c.title,
    c.slug,
    c.url,
    c.category,
    c.heading,
    c.content,
    c.risk_level,
    1 - (c.embedding <=> query_embedding) as similarity
  from ai_article_chunks c
  where c.embedding_version = p_embedding_version
    and (1 - (c.embedding <=> query_embedding)) >= match_threshold
  order by c.embedding <=> query_embedding
  limit greatest(1, least(match_count, 50));
$$;

-- Retrieval is server-side only (service-role). Deny anon/authenticated direct
-- execution so embeddings cannot be probed through the public API.
revoke all on function public.match_ai_article_chunks(vector, float, int, text) from public;
revoke all on function public.match_ai_article_chunks(vector, float, int, text) from anon;
revoke all on function public.match_ai_article_chunks(vector, float, int, text) from authenticated;

-- =========================================================
-- Rate limiting
-- =========================================================
create table if not exists ai_rate_limits (
  bucket_key text not null,      -- "u:<userId>" or "ip:<saltedHash>"
  day date not null,
  count integer not null default 0,
  updated_at timestamp with time zone default now(),
  primary key (bucket_key, day)
);

create index if not exists ai_rate_limits_day_idx on ai_rate_limits (day);

alter table ai_rate_limits enable row level security;
-- No policies: only the service-role key (bypasses RLS) may touch this table.

-- Atomic increment + allow decision. Increments first, then reports whether the
-- caller is within the limit. SECURITY DEFINER so it can write under RLS.
create or replace function public.ai_increment_rate_limit(
  p_key text,
  p_day date,
  p_limit int
)
returns table (allowed boolean, current_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into ai_rate_limits (bucket_key, day, count, updated_at)
    values (p_key, p_day, 1, now())
  on conflict (bucket_key, day)
    do update set count = ai_rate_limits.count + 1, updated_at = now()
  returning count into v_count;

  return query select (v_count <= p_limit), v_count;
end;
$$;

revoke all on function public.ai_increment_rate_limit(text, date, int) from public;
revoke all on function public.ai_increment_rate_limit(text, date, int) from anon;
revoke all on function public.ai_increment_rate_limit(text, date, int) from authenticated;

-- =========================================================
-- AI feedback (minimal, non-personal)
-- =========================================================
create table if not exists ai_feedback (
  id uuid primary key default gen_random_uuid(),
  helpful boolean not null,
  route text,
  supported boolean,
  reason text,
  created_at timestamp with time zone default now()
);

create index if not exists ai_feedback_created_idx on ai_feedback (created_at desc);

alter table ai_feedback enable row level security;
-- Inserts go through the service-role key from the feedback API. Only moderators
-- may read aggregated feedback.
drop policy if exists "Moderators read ai feedback" on ai_feedback;
create policy "Moderators read ai feedback" on ai_feedback
  for select
  using (public.is_moderator());
