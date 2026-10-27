-- -----------------------------------------------------------------------------
-- 017_prize_images_and_referrals_fix.sql
--
-- 1) Функция list_referrals (страница /main/friends была пустой: функция
--    отсутствовала в БД, хотя миграция 004 есть в репозитории).
-- 2) Колонка prizes.image — URL-логика картинки приза (для истории спинов).
-- 3) Бэкфилл image по названию приза (тот же маппинг, что был на фронте).
-- 4) get_spin_history теперь возвращает prize_image.
-- -----------------------------------------------------------------------------

-- Старые версии могут иметь другой тип возврата (OUT-колонки), поэтому
-- CREATE OR REPLACE не сработает — сначала DROP.
drop function if exists public.list_referrals(bigint);
drop function if exists public.get_spin_history(bigint, integer, integer);
drop function if exists public.get_spin_history(bigint, integer);
drop function if exists public.get_spin_history(bigint);

-- 1. Список приглашённых друзей
create or replace function public.list_referrals(p_tg_user_id bigint)
returns table (
  tg_user_id bigint,
  username text,
  photo_url text,
  created_at timestamptz
)
language sql
stable
as $$
  with inviter as (
    select id from public.users where tg_user_id = p_tg_user_id
  )
  select
    u.tg_user_id,
    u.username,
    u.photo_url,
    r.created_at
  from public.referrals r
  join inviter i on i.id = r.inviter_user_id
  join public.users u on u.id = r.invitee_user_id
  order by r.created_at desc;
$$;

-- 2. Колонки prizes (гарантируем наличие: на удалённой БД отсутствует value,
--    хотя в миграции 001 она есть — разные версии схемы)
alter table public.prizes
  add column if not exists value numeric;
alter table public.prizes
  add column if not exists image text;

-- 3. Бэкфилл картинок по названию приза (совпадает с фронтовым маппингом)
update public.prizes
  set image = '/историясертвб500.jpg'
  where image is null and lower(title) like '%wb%500%';

update public.prizes
  set image = '/историязя300.jpg'
  where image is null and lower(title) like '%зя%300%';

update public.prizes
  set image = '/историяподарочныйсерт500.jpg'
  where image is null and lower(title) like '%зя%500%';

update public.prizes
  set image = '/историяЗЯ1000.jpg'
  where image is null and (lower(title) like '%зя%1000%' or title like '%1.000%');

update public.prizes
  set image = '/историясекретныйпотбренда.jpg'
  where image is null and lower(title) like '%бренда%';

update public.prizes
  set image = '/историясекретбп.jpg'
  where image is null and lower(title) like '%бьюти%';

update public.prizes
  set image = '/история3спина.jpg'
  where image is null and (lower(title) like '%3 спина%' or lower(title) like '%+3%');

update public.prizes
  set image = '/2спина.jpg'
  where image is null and (lower(title) like '%2 спина%' or lower(title) like '%+2%');

update public.prizes
  set image = '/история1спин.jpg'
  where image is null and (lower(title) like '%1 спин%' or lower(title) like '%+1%');

-- 4. История спинов с картинкой приза
create or replace function public.get_spin_history(
  p_tg_user_id bigint,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  spin_id uuid,
  created_at timestamptz,
  win boolean,
  prize_title text,
  prize_value numeric,
  prize_image text
)
language sql
stable
as $$
  select
    s.id as spin_id,
    s.created_at,
    s.win,
    p.title as prize_title,
    p.value as prize_value,
    p.image as prize_image
  from public.users u
  join public.spins s on s.user_id = u.id
  left join public.prizes p on p.id = s.prize_id
  where u.tg_user_id = p_tg_user_id
  order by s.created_at desc
  limit greatest(0, coalesce(p_limit, 50))
  offset greatest(0, coalesce(p_offset, 0));
$$;