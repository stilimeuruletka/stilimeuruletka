-- -----------------------------------------------------------------------------
-- 014_preview_ads.sql
-- Рекламные ролики 2-го экрана ("Preview") + статистика просмотров.
--
-- Экранная механика: 1-й ролик — наш (всегда), 2-й — реклама заказчика,
-- показывается только в активный период публикации, иначе пропускается.
-- -----------------------------------------------------------------------------

-- Заказы рекламных роликов
create table if not exists public.preview_ads (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,              -- заказчик
  video_url text not null,                -- ссылка на ролик (storage)
  publish_date date not null,             -- день выхода (дата публикации)
  end_date date not null,                 -- день окончания (дата удаления рекламы)
  active boolean not null default true,   -- ручное вкл/выкл
  created_at timestamptz not null default now()
);

create index if not exists preview_ads_active_idx
  on public.preview_ads (active, publish_date, end_date);

-- Просмотры (точный счётчик). kind: own = наш ролик, ad = реклама заказчика.
create table if not exists public.preview_views (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('own', 'ad')),
  ad_id uuid references public.preview_ads(id) on delete set null,
  tg_user_id bigint,
  created_at timestamptz not null default now()
);

create index if not exists preview_views_kind_idx
  on public.preview_views (kind, created_at);
create index if not exists preview_views_ad_idx
  on public.preview_views (ad_id, created_at);

-- -----------------------------------------------------------------------------
-- Активный рекламный ролик на текущий момент (не более одного).
-- Приоритет: сначала ручной active=true, затем период (publish <= сегодня <= end).
-- -----------------------------------------------------------------------------
create or replace function public.preview_active_ad()
returns table (
  id uuid,
  client_name text,
  video_url text,
  publish_date date,
  end_date date,
  views bigint
)
language plpgsql
stable
as $$
declare
  v_today date := current_date;
begin
  return query
  select
    a.id,
    a.client_name,
    a.video_url,
    a.publish_date,
    a.end_date,
    (select count(*) from public.preview_views v where v.ad_id = a.id)::bigint as views
  from public.preview_ads a
  where a.active = true
    and a.publish_date <= v_today
    and a.end_date >= v_today
  order by a.publish_date asc, a.created_at asc
  limit 1;
end;
$$;

-- -----------------------------------------------------------------------------
-- Статистика заказов для админки: по каждому заказу кол-во просмотров.
-- -----------------------------------------------------------------------------
create or replace function public.preview_ads_stats()
returns table (
  id uuid,
  client_name text,
  video_url text,
  publish_date date,
  end_date date,
  active boolean,
  views bigint,
  created_at timestamptz
)
language sql
stable
as $$
  select
    a.id,
    a.client_name,
    a.video_url,
    a.publish_date,
    a.end_date,
    a.active,
    (select count(*) from public.preview_views v where v.ad_id = a.id)::bigint as views,
    a.created_at
  from public.preview_ads a
  order by a.publish_date desc, a.created_at desc;
$$;

-- Просмотров нашего ролика (для инфо в админке)
create or replace function public.preview_own_views()
returns integer
language sql
stable
as $$
  select count(*)::integer from public.preview_views where kind = 'own';
$$;

grant select on public.preview_ads, public.preview_views to anon;