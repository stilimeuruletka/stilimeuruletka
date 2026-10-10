-- -----------------------------------------------------------------------------
-- 013_prize_calendar.sql
-- Дневной план выигрышей ("Призовой фонд" по дням).
--
-- Админ сам решает, сколько человек выиграет в конкретный день и какие призы.
-- Рулетка больше НЕ использует вероятность (weight):
--   при спине берём план на сегодня; если есть запись с оставшимися местами —
--   победа (выдаём этот приз, минус одно место), иначе проигрыш.
-- -----------------------------------------------------------------------------

-- Таблица: план призов на дату.
-- Одна строка = "на дату D выдаётся приз P, суммарно amount раз".
-- remaining — сколько ещё раз можно выдать (уменьшается при выигрышах).
create table if not exists public.prize_calendar (
  id uuid primary key default gen_random_uuid(),
  prize_date date not null,             -- дата, на которую план
  prize_id uuid not null references public.prizes(id) on delete cascade,
  amount integer not null check (amount > 0),   -- сколько раз выдаётся приз в этот день
  remaining integer not null check (remaining >= 0), -- сколько ещё осталось
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists prize_calendar_date_idx
  on public.prize_calendar (prize_date);
create index if not exists prize_calendar_date_remaining_idx
  on public.prize_calendar (prize_date, remaining desc);

-- -----------------------------------------------------------------------------
-- Переработанный спин: без вероятности, по дневному плану.
-- -----------------------------------------------------------------------------
create or replace function public.spin_wheel_limited(
  p_tg_user_id bigint,
  p_max_wins_per_month int default null,
  p_test_mode boolean default true,
  p_segments_count int default 10
)
returns jsonb
language plpgsql
as $$
declare
  v_user_id uuid;
  v_balance int;
  v_spend_ledger_id uuid;
  v_prize_id uuid;
  v_prize_title text;
  v_prize_value numeric;
  v_win boolean := false;
  v_spin_id uuid;
  v_today date := current_date;
  v_month_start timestamptz;
  v_month_end timestamptz;
  v_wins_this_month int := 0;
  v_cal_id uuid;
  v_segments int := 10;
  v_sector_index int := 0;
  v_target_parity int := 1;
begin
  select id into v_user_id from public.users where tg_user_id = p_tg_user_id;
  if v_user_id is null then
    raise exception 'User not found';
  end if;

  select coalesce(sum(delta), 0)::int into v_balance
  from public.ticket_ledger
  where user_id = v_user_id;

  if not coalesce(p_test_mode, false) and v_balance <= 0 then
    raise exception 'Not enough tickets';
  end if;

  v_month_start := date_trunc('month', now());
  v_month_end := v_month_start + interval '1 month';

  select count(*)::int into v_wins_this_month
  from public.spins
  where user_id = v_user_id
    and win = true
    and created_at >= v_month_start
    and created_at < v_month_end;

  insert into public.ticket_ledger (user_id, delta, reason, meta)
  values (v_user_id, -1, 'spin', jsonb_build_object('test_mode', coalesce(p_test_mode, false)))
  returning id into v_spend_ledger_id;

  -- Монопольная блокировка плана на сегодня, чтобы исключить гонки (перевыдачу)
  perform pg_advisory_xact_lock(hashtext('prize_calendar_day_' || v_today::text));

  -- Атомарно забираем 1 место из доступной записи плана на сегодня.
  -- Выбираем записи с оставшимися местами, берём первую (по дате создания).
  declare
    v_lock_row record;
  begin
    select id, prize_id
      into v_cal_id, v_prize_id
      from public.prize_calendar
     where prize_date = v_today
       and remaining > 0
     order by created_at asc, id asc
     limit 1
     for update;

    if v_cal_id is not null then
      update public.prize_calendar
         set remaining = remaining - 1,
             updated_at = now()
       where id = v_cal_id
         and remaining > 0;

      if found then
        select title, value
          into v_prize_title, v_prize_value
          from public.prizes
         where id = v_prize_id;
        v_win := true;
      else
        v_cal_id := null;
        v_prize_id := null;
      end if;
    end if;
  end;

  if not v_win then
    v_prize_id := null;
    v_prize_title := null;
    v_prize_value := null;
  end if;

  insert into public.spins (user_id, spend_ledger_id, prize_id, win)
  values (v_user_id, v_spend_ledger_id, v_prize_id, v_win)
  returning id into v_spin_id;

  v_segments := case when p_segments_count is not null and p_segments_count > 1 then p_segments_count else 10 end;
  v_sector_index := floor(random() * v_segments)::int;
  v_target_parity := case when v_win then 0 else 1 end;
  if v_segments > 1 then
    while (v_sector_index % 2) <> v_target_parity loop
      v_sector_index := floor(random() * v_segments)::int;
    end loop;
  end if;

  return jsonb_build_object(
    'spin_id', v_spin_id,
    'prize_id', v_prize_id,
    'prize_title', v_prize_title,
    'prize_value', v_prize_value,
    'win', v_win,
    'balance_after', (public.get_ticket_balance(p_tg_user_id)->>'balance')::int,
    'wins_this_month', v_wins_this_month + case when v_win then 1 else 0 end,
    'max_wins_per_month', p_max_wins_per_month,
    'segments_count', v_segments,
    'sector_index', v_sector_index
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Админский CRUD для плана призов на день.
-- -----------------------------------------------------------------------------

-- Создать/обновить запись плана на дату (amount задаёт кол-во мест на день).
create or replace function public.admin_upsert_prize_calendar(
  p_prize_date date,
  p_prize_id uuid,
  p_amount integer
)
returns jsonb
language plpgsql
as $$
declare
  v_id uuid;
  v_new_remaining integer;
begin
  if p_amount is null or p_amount < 0 then
    return jsonb_build_object('ok', false, 'error', 'amount must be >= 0');
  end if;

  select id into v_id
    from public.prize_calendar
   where prize_date = p_prize_date
     and prize_id = p_prize_id
     and remaining > 0
   limit 1;

  if v_id is not null then
    -- Перезаписываем: остаток = разница (нельзя поднять лимит, если часть уже выдана
    -- сверх нового значения — тогда просто ставим остаток в остаток по факту).
    update public.prize_calendar
       set amount = p_amount,
           remaining = greatest(p_amount - (amount - remaining), 0),
           updated_at = now()
     where id = v_id
     returning id, remaining into v_id, v_new_remaining;
  else
    insert into public.prize_calendar (prize_date, prize_id, amount, remaining)
    values (p_prize_date, p_prize_id, p_amount, p_amount)
    returning id, remaining into v_id, v_new_remaining;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id, 'remaining', v_new_remaining);
end;
$$;

-- Удалить запись плана на день.
create or replace function public.admin_delete_prize_calendar(p_id uuid)
returns jsonb
language plpgsql
as $$
begin
  delete from public.prize_calendar where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- План на диапазон дат (для календаря): с призами.
create or replace function public.prize_calendar_month(p_from date, p_to date)
returns table (
  id uuid,
  prize_date date,
  prize_id uuid,
  prize_title text,
  amount bigint,
  remaining bigint,
  created_at timestamptz
)
language sql
stable
as $$
  select
    pc.id,
    pc.prize_date,
    pc.prize_id,
    p.title as prize_title,
    pc.amount::bigint,
    pc.remaining::bigint,
    pc.created_at
  from public.prize_calendar pc
  join public.prizes p on p.id = pc.prize_id
  where pc.prize_date >= p_from
    and pc.prize_date <= p_to
  order by pc.prize_date asc, pc.created_at asc;
$$;

grant select on public.prize_calendar to anon;
grant select on public.prizes to anon;