alter table public.users
  add column if not exists tz_offset_minutes smallint;

alter table public.spin_cooldowns
  add column if not exists initial_granted boolean not null default false;

update public.spin_cooldowns
  set initial_granted = true
  where initial_granted = false;

create or replace function public.set_user_tz_offset(p_tg_user_id bigint, p_tz_offset_minutes int)
returns void
language plpgsql
as $$
begin
  if p_tz_offset_minutes is null or p_tz_offset_minutes < -840 or p_tz_offset_minutes > 840 then
    return;
  end if;

  update public.users
    set tz_offset_minutes = p_tz_offset_minutes::smallint,
        last_seen_at = now()
    where tg_user_id = p_tg_user_id;
end;
$$;

create or replace function public.next_midnight_utc(p_now timestamptz, p_tz_offset_minutes int)
returns timestamptz
language sql
immutable
as $$
  select (
    (
      date_trunc(
        'day',
        (p_now at time zone 'utc') - make_interval(mins => p_tz_offset_minutes)
      ) + interval '1 day'
    ) + make_interval(mins => p_tz_offset_minutes)
  ) at time zone 'utc';
$$;

create or replace function public.set_next_spin_after_spin_midnight(p_tg_user_id bigint, p_now timestamptz default now())
returns jsonb
language plpgsql
as $$
declare
  v_user_id uuid;
  v_tz_offset int;
  v_next timestamptz;
begin
  select id, coalesce(tz_offset_minutes, 0)::int
    into v_user_id, v_tz_offset
    from public.users
    where tg_user_id = p_tg_user_id;

  if v_user_id is null then
    raise exception 'User not found';
  end if;

  v_next := public.next_midnight_utc(p_now, v_tz_offset);

  insert into public.spin_cooldowns (user_id, next_spin_at, updated_at)
  values (v_user_id, v_next, now())
  on conflict (user_id)
  do update set
    next_spin_at = excluded.next_spin_at,
    updated_at = now();

  return jsonb_build_object('next_spin_at', v_next);
end;
$$;

create or replace function public.ensure_free_spin(p_tg_user_id bigint)
returns jsonb
language plpgsql
as $$
declare
  v_user_id uuid;
  v_next timestamptz;
  v_granted boolean := false;
  v_initial_granted boolean := false;
begin
  select id into v_user_id from public.users where tg_user_id = p_tg_user_id;
  if v_user_id is null then
    raise exception 'User not found';
  end if;

  insert into public.spin_cooldowns (user_id, next_spin_at, initial_granted)
  values (v_user_id, null, false)
  on conflict (user_id) do nothing;

  select next_spin_at, initial_granted
    into v_next, v_initial_granted
    from public.spin_cooldowns
    where user_id = v_user_id;

  if not v_initial_granted then
    insert into public.ticket_ledger (user_id, delta, reason, meta)
    values (v_user_id, 1, 'daily_free_spin', jsonb_build_object('kind', 'initial', 'granted_at', now()));

    update public.spin_cooldowns
      set initial_granted = true,
          updated_at = now()
      where user_id = v_user_id;

    v_granted := true;
  end if;

  if v_next is not null and v_next <= now() then
    insert into public.ticket_ledger (user_id, delta, reason, meta)
    values (v_user_id, 1, 'daily_free_spin', jsonb_build_object('kind', 'daily', 'granted_at', now()));

    update public.spin_cooldowns
      set next_spin_at = null,
          updated_at = now()
      where user_id = v_user_id;

    v_granted := true;
    v_next := null;
  end if;

  return jsonb_build_object(
    'balance', (public.get_ticket_balance(p_tg_user_id)->>'balance')::int,
    'can_spin', v_next is null,
    'next_spin_at', v_next,
    'granted', v_granted
  );
end;
$$;
