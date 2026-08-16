-- オーストラリアワーホリコンパス - 歴史的ニュース バックフィルの「取り込み元」区別。
-- 0012_news_backfill.sql の後に適用してください。
--
-- 目的:
--   * 手動シード（Manual Seed）で取り込んだ歴史的ニュースを、自動アーカイブ探索由来と
--     区別できるようにする（管理 UI のラベル・監査用）。
--   * これは追加のみ。0011 / 0012 は変更しない。既存 RLS ポリシーも変更しない。
--   * 0013 未適用でもバックフィル自体は動作する（origin マーカーは best-effort）。

-- news_items: 取り込み元（archive | manual_seed）。null = 非バックフィル/レガシー。
alter table news_items
  add column if not exists backfill_origin text
    check (backfill_origin is null or backfill_origin in ('archive', 'manual_seed'));

-- news_backfill_runs: 実行単位の取り込み元。
alter table news_backfill_runs
  add column if not exists origin text not null default 'archive'
    check (origin in ('archive', 'manual_seed'));

create index if not exists news_items_backfill_origin_idx
  on news_items (backfill_origin) where backfill_origin is not null;
