-- WHV Compass - Phase 4 closeout
-- Account-deletion referential actions + SECURITY DEFINER execute hardening.
-- Apply after 0015_workspace_studio_news_origin.sql.

begin;

-- =========================================================
-- 1. Make self-service account deletion match the product UI/privacy promise.
--    User-owned/community rows are deleted with the profile. Moderation ban
--    provenance is retained but detached from the deleted moderator account.
-- =========================================================

alter table public.article_feedback
  drop constraint if exists article_feedback_user_id_fkey;
alter table public.article_feedback
  add constraint article_feedback_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

alter table public.feedback_requests
  drop constraint if exists feedback_requests_user_id_fkey;
alter table public.feedback_requests
  add constraint feedback_requests_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

alter table public.forum_comments
  drop constraint if exists forum_comments_user_id_fkey;
alter table public.forum_comments
  add constraint forum_comments_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

alter table public.forum_posts
  drop constraint if exists forum_posts_user_id_fkey;
alter table public.forum_posts
  add constraint forum_posts_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

alter table public.likes
  drop constraint if exists likes_user_id_fkey;
alter table public.likes
  add constraint likes_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

alter table public.reports
  drop constraint if exists reports_reporter_id_fkey;
alter table public.reports
  add constraint reports_reporter_id_fkey
  foreign key (reporter_id) references public.profiles(id) on delete cascade;

alter table public.banned_phones
  drop constraint if exists banned_phones_banned_by_fkey;
alter table public.banned_phones
  add constraint banned_phones_banned_by_fkey
  foreign key (banned_by) references public.profiles(id) on delete set null;

-- =========================================================
-- 2. Remove direct Data API/RPC execution from SECURITY DEFINER functions that
--    exist only as triggers or privileged maintenance helpers.
--
--    Intentionally NOT revoked here:
--      * is_phone_banned(text) - public pre-registration boolean RPC.
--      * is_active_user()      - helper used by RLS policies.
--      * is_moderator()        - helper used by RLS policies.
-- =========================================================

revoke execute on function public.expire_listings() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_profile_ban() from public, anon, authenticated;
revoke execute on function public.handle_user_phone_update() from public, anon, authenticated;
revoke execute on function public.notify_applicant_on_status() from public, anon, authenticated;
revoke execute on function public.notify_author_on_comment() from public, anon, authenticated;
revoke execute on function public.notify_owner_on_application() from public, anon, authenticated;
revoke execute on function public.notify_savers_on_listing_close() from public, anon, authenticated;
revoke execute on function public.protect_application_fields() from public, anon, authenticated;
revoke execute on function public.protect_listing_moderation_fields() from public, anon, authenticated;
revoke execute on function public.protect_notification_fields() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- Keep the three intentional client/RLS helpers explicit rather than relying on
-- PostgreSQL's default PUBLIC EXECUTE grant.
revoke execute on function public.is_phone_banned(text) from public;
grant execute on function public.is_phone_banned(text) to anon, authenticated;

revoke execute on function public.is_active_user() from public;
grant execute on function public.is_active_user() to anon, authenticated;

revoke execute on function public.is_moderator() from public;
grant execute on function public.is_moderator() to anon, authenticated;

commit;
