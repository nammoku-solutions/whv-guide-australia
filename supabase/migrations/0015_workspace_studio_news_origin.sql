-- Allow weekly news candidates submitted from the Gemini / Google Workspace Studio workflow.
-- This keeps provenance explicit while preserving the existing external candidate pipeline.

alter table public.external_news_candidates
  drop constraint if exists external_news_candidates_origin_check;

alter table public.external_news_candidates
  add constraint external_news_candidates_origin_check
    check (origin in (
      'chatgpt_weekly',
      'gemini_weekly',
      'admin_mobile',
      'manual_seed_bridge',
      'system'
    ));
