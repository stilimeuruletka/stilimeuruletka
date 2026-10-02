-- -----------------------------------------------------------------------------
-- 008_coupon_calendar.sql
-- Месячные наборы купонов (coupon_sets) + журнал выдачи купонов (coupon_redemptions)
-- с автоматическим учётом при выигрыше в рулетке.
-- -----------------------------------------------------------------------------

-- Таблица: месячные наборы купонов (админ создаёт запись на каждый период YYYY-MM)
create table if not exists public.coupon_sets (
  id uuid primary key default gen_random_uuid(),
  period text not null,                    -- формат 'YYYY-MM', например '2026-10'
  title text not null,                     -- уникальное название набора (напр. "Октябрь 2026: Осенние призы")
  total_coupons integer not null check (total_coupons >= 0),  -- стартовое общее количество купонов на месяц
  created_at timestamptz not null default now()
);

create unique index if not exists coupon_sets_period_idx
  on public.coupon_sets (period);

create unique index if not exists coupon_sets_title_idx
  on public.coupon_sets (title);

-- Таблица: журнал выдачи купонов (каждое списание = выигрыш в рулетке)
create table if not exists public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_set_id uuid not null references public.coupon_sets (id) on delete cascade,
  spin_id uuid null references public.spins (id) on delete set null,
  user_id uuid null references public.users (id) on delete set null,
  tg_user_id bigint null,
  username text null,
  coupon_type text not null default '',     -- тип купона: название приза (из prizes.title)
  created_at timestamptz not null default now()
);

create index if not exists coupon_redemptions_set_created_idx
  on public.coupon_redemptions (coupon_set_id, created_at desc);

create index if not exists coupon_redemptions_user_created_idx
  on public.coupon_redemptions (tg_user_id, created_at desc);

create index if not exists coupon_redemptions_type_idx
  on public.coupon_redemptions (coupon_type);

-- -----------------------------------------------------------------------------
-- Триггер: когда в spins появляется выигрыш (win=true, prize_id не null),
-- автоматически ищем подходящий coupon_set по текущему месяцу и добавляем
-- запись в coupon_redemptions (если в этом месяце ещё остались купоны).
--
-- Если записей в coupon_sets на текущий месяц нет — ничего не делаем
-- (админ ещё не создал набор). Если total_coupons уже исчерпан — транзакция
-- спина останавливается через RAISE EXCEPTION.
-- -----------------------------------------------------------------------------

create or replace function public.resolve_coupon_set_for_ts(ts timestamptz)
returns uuid
language sql
stable
as $$
  select id
    from public.coupon_sets
   where period = to_char(ts at time zone 'UTC', 'YYYY-MM')
   order by created_at asc
   limit 1;
$$;

create or replace function public.coupons_remaining_for_set(set_id uuid)
returns integer
language sql
stable
as $$
  select coalesce(s.total_coupons, 0) - count(r.id)::integer
    from public.coupon_sets s
    left join public.coupon_redemptions r on r.coupon_set_id = s.id
   where s.id = set_id
   group by s.id, s.total_coupons;
$$;

create or replace function public.on_spin_win_attach_coupon()
returns trigger
language plpgsql
as $$
declare
  v_set_id uuid;
  v_remaining integer;
  v_prize_title text;
  v_user_id uuid;
  v_tg_user_id bigint;
  v_username text;
begin
  if TG_OP <> 'INSERT' then return NEW; end if;
  if not NEW.win or NEW.prize_id is null then return NEW; end if;

  -- Ищем набор на текущий месяц по времени создания спина
  v_set_id := public.resolve_coupon_set_for_ts(NEW.created_at);
  if v_set_id is null then return NEW; end if;

  -- Остаток (пессимистичная проверка внутри транзакции)
  v_remaining := public.coupons_remaining_for_set(v_set_id);
  if v_remaining is null or v_remaining <= 0 then
    raise exception 'Лимит купонов на месяц исчерпан (coupon_set_id=%)', v_set_id;
  end if;

  select title into v_prize_title from public.prizes where id = NEW.prize_id;
  if not found then v_prize_title := ''; end if;

  select id, tg_user_id, username
    into v_user_id, v_tg_user_id, v_username
    from public.users
   where id = NEW.user_id;

  insert into public.coupon_redemptions
    (coupon_set_id, spin_id, user_id, tg_user_id, username, coupon_type, created_at)
  values
    (v_set_id, NEW.id, v_user_id, v_tg_user_id, v_username, coalesce(v_prize_title, ''), NEW.created_at);

  return NEW;
end;
$$;

drop trigger if exists trg_on_spin_win_attach_coupon on public.spins;

create trigger trg_on_spin_win_attach_coupon
  after insert on public.spins
  for each row
  execute function public.on_spin_win_attach_coupon();

-- -----------------------------------------------------------------------------
-- Вспомогательное представление: агрегированная статистика по наборам
-- (остаток, выдано, процент заполнения, количество уникальных пользователей)
-- -----------------------------------------------------------------------------
create or replace view public.coupon_sets_stats as
select
  s.id,
  s.period,
  s.title,
  s.total_coupons,
  s.created_at,
  count(r.id)::integer                                      as redeemed,
  greatest(s.total_coupons - count(r.id), 0)::integer       as remaining,
  case
    when s.total_coupons > 0
      then round((count(r.id)::numeric / s.total_coupons::numeric) * 10000) / 100
    else 0
  end                                                       as fill_percent,
  count(distinct r.tg_user_id)::integer                     as unique_users
from public.coupon_sets s
left join public.coupon_redemptions r on r.coupon_set_id = s.id
group by s.id, s.period, s.title, s.total_coupons, s.created_at;

grant select on public.coupon_sets_stats to anon;
grant select on public.coupon_sets to anon;
grant select on public.coupon_redemptions to anon;

-- RPC: подсчёт всего купонов, полученных списком tg_user_id.
-- Если scoped_set_id не null — только в рамках набора.
create or replace function public.coupon_redemptions_per_user(
  tg_user_ids bigint[],
  scoped_set_id uuid default null
)
returns table (tg_user_id bigint, total bigint)
language sql
stable
as $$
  select r.tg_user_id, count(*)::bigint as total
    from public.coupon_redemptions r
   where r.tg_user_id = any($1)
     and (scoped_set_id is null or r.coupon_set_id = scoped_set_id)
   group by r.tg_user_id;
$$;

