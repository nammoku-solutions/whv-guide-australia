-- オーストラリアワーホリコンパス - Phase 2: Japanese-aware keyword / full-text
-- retrieval for hybrid search (RRF). Additive & non-destructive.
-- Apply in the Supabase SQL editor AFTER 0009_ai_rag.sql.
--
-- Design:
--   * Adds a generated `content_tsv` tsvector ('simple' config, IMMUTABLE) for
--     exact ASCII/acronym/number matching (TFN, ABN, 417, Rego, myGov, ...).
--   * Adds a pg_trgm GIN index so ILIKE substring matching works for Japanese
--     content words (no external service; pg_trgm ships with Postgres).
--   * match_ai_article_chunks_keyword scores chunks by matched terms + full-text
--     rank. Server-side only (service-role): anon/authenticated EXECUTE revoked.
--   * Embeddings and semantic RPC from 0009 are unchanged.

-- =========================================================
-- Extensions & columns (additive)
-- =========================================================
create extension if not exists pg_trgm;

-- 'simple' config (2-arg form) is IMMUTABLE, so it is valid in a generated column.
alter table ai_article_chunks
  add column if not exists content_tsv tsvector
  generated always as (to_tsvector('simple'::regconfig, coalesce(content, ''))) stored;

-- Full-text index (ASCII tokens / acronyms / numbers).
create index if not exists ai_article_chunks_tsv_idx
  on ai_article_chunks using gin (content_tsv);

-- Trigram index for ILIKE substring matching (Japanese content words).
create index if not exists ai_article_chunks_content_trgm_idx
  on ai_article_chunks using gin (content gin_trgm_ops);

-- Trigram index on title+heading is unnecessary; matches are counted from content.

-- =========================================================
-- Keyword retrieval RPC
-- =========================================================
-- p_terms : app-extracted keyword tokens (ASCII acronyms/numbers + JA content
--           words + domain synonyms). Matched case-insensitively via ILIKE.
-- p_query : raw query, used for the 'simple' full-text rank bonus.
-- Returns a keyword_score (NOT cosine). Absolute value is irrelevant to the
-- caller: RRF fuses by rank, not by raw score.
create or replace function public.match_ai_article_chunks_keyword(
  p_terms text[],
  p_query text,
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
  keyword_score float
)
language sql
stable
security definer
set search_path = public
as $$
  with q as (
    select case
             when coalesce(p_query, '') = '' then null
             else websearch_to_tsquery('simple', p_query)
           end as tsq
  )
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
    (
      -- term matches in the chunk body
      (select count(*) from unnest(coalesce(p_terms, '{}')) t
         where c.content ilike '%' || t || '%')
      -- extra weight when a term hits the title/heading
      + 0.5 * (select count(*) from unnest(coalesce(p_terms, '{}')) t
                 where (c.title || ' ' || c.heading) ilike '%' || t || '%')
      -- small full-text rank bonus (rewards exact ASCII token matches)
      + 2 * coalesce(ts_rank_cd(c.content_tsv, (select tsq from q)), 0)
    )::float as keyword_score
  from ai_article_chunks c, q
  where c.embedding_version = p_embedding_version
    and (
      (q.tsq is not null and c.content_tsv @@ q.tsq)
      or exists (
        select 1 from unnest(coalesce(p_terms, '{}')) t
          where c.content ilike '%' || t || '%'
      )
    )
  order by keyword_score desc
  limit greatest(1, least(match_count, 50));
$$;

-- Server-side only. Deny anon/authenticated direct execution.
revoke all on function public.match_ai_article_chunks_keyword(text[], text, int, text) from public;
revoke all on function public.match_ai_article_chunks_keyword(text[], text, int, text) from anon;
revoke all on function public.match_ai_article_chunks_keyword(text[], text, int, text) from authenticated;
