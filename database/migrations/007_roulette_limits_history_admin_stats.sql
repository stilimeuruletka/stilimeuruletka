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
  v_month_start timestamptz;
  v_month_end timestamptz;
  v_wins_this_month int := 0;
  v_should_win boolean := false;
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

  if v_balance <= 0 then
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

  if coalesce(p_test_mode, false) then
    v_should_win := random() < 0.5;
    if p_max_wins_per_month is not null and p_max_wins_per_month > 0 and v_wins_this_month >= p_max_wins_per_month then
      v_should_win := false;
    end if;

    if v_should_win then
      with active_prizes as (
        select id, title, value, weight, sum(weight) over () as total_weight
        from public.prizes
        where active = true and coalesce(value, 0) > 0
      ),
      r as (
        select (random() * max(total_weight)) as v
        from active_prizes
      ),
      pick as (
        select
          ap.*,
          sum(ap.weight) over (order by ap.id) as cumulative_weight,
          r.v as r
        from active_prizes ap
        cross join r
      )
      select id, title, value
        into v_prize_id, v_prize_title, v_prize_value
        from pick
        where cumulative_weight >= r
        order by cumulative_weight
        limit 1;
      v_win := true;
    else
      v_win := false;
    end if;
  else
    with active_prizes as (
      select id, title, value, weight, sum(weight) over () as total_weight
      from public.prizes
      where active = true
    ),
    r as (
      select (random() * max(total_weight)) as v
      from active_prizes
    ),
    pick as (
      select
        ap.*,
        sum(ap.weight) over (order by ap.id) as cumulative_weight,
        r.v as r
      from active_prizes ap
      cross join r
    )
    select id, title, value
      into v_prize_id, v_prize_title, v_prize_value
      from pick
      where cumulative_weight >= r
      order by cumulative_weight
      limit 1;

    v_win := v_prize_id is not null and coalesce(v_prize_value, 0) > 0;

    if p_max_wins_per_month is not null and p_max_wins_per_month > 0 and v_win and v_wins_this_month >= p_max_wins_per_month then
      v_win := false;
      v_prize_id := null;
      v_prize_title := null;
      v_prize_value := null;
    end if;
  end if;

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
  prize_value numeric
)
language sql
stable
as $$
  select
    s.id as spin_id,
    s.created_at,
    s.win,
    p.title as prize_title,
    p.value as prize_value
  from public.users u
  join public.spins s on s.user_id = u.id
  left join public.prizes p on p.id = s.prize_id
  where u.tg_user_id = p_tg_user_id
  order by s.created_at desc
  limit greatest(0, coalesce(p_limit, 50))
  offset greatest(0, coalesce(p_offset, 0));
$$;

create or replace function public.admin_get_user_spin_stats(p_from timestamptz default null, p_to timestamptz default null)
returns table (
  tg_user_id bigint,
  username text,
  total_spins bigint,
  wins bigint,
  losses bigint,
  last_spin_at timestamptz
)
language sql
stable
as $$
  with range as (
    select coalesce(p_from, now() - interval '30 days') as from_ts,
           coalesce(p_to, now()) as to_ts
  )
  select
    u.tg_user_id,
    u.username,
    count(s.id)::bigint as total_spins,
    count(*) filter (where s.win = true)::bigint as wins,
    count(*) filter (where s.win = false)::bigint as losses,
    max(s.created_at) as last_spin_at
  from public.users u
  left join public.spins s
    on s.user_id = u.id
   and s.created_at >= (select from_ts from range)
   and s.created_at < (select to_ts from range)
  group by u.tg_user_id, u.username
  order by last_spin_at desc nulls last, total_spins desc, u.tg_user_id desc;
$$;
