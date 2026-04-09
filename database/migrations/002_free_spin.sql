create table if not exists public.spin_cooldowns (
  user_id uuid primary key references public.users(id) on delete cascade,
  next_spin_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists spin_cooldowns_next_idx on public.spin_cooldowns (next_spin_at asc) where next_spin_at is not null;

create or replace function public.ensure_free_spin(p_tg_user_id bigint)
returns jsonb
language plpgsql
as $$
declare
  v_user_id uuid;
  v_next timestamptz;
  v_granted boolean := false;
begin
  select id into v_user_id from public.users where tg_user_id = p_tg_user_id;
  if v_user_id is null then
    raise exception 'User not found';
  end if;

  insert into public.spin_cooldowns (user_id, next_spin_at)
  values (v_user_id, now())
  on conflict (user_id) do nothing;

  select next_spin_at into v_next from public.spin_cooldowns where user_id = v_user_id;

  if v_next is not null and v_next <= now() then
    insert into public.ticket_ledger (user_id, delta, reason, meta)
    values (v_user_id, 1, 'daily_free_spin', jsonb_build_object('granted_at', now()));

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

create or replace function public.set_next_spin_after_spin(p_tg_user_id bigint, p_next_spin_at timestamptz)
returns jsonb
language plpgsql
as $$
declare
  v_user_id uuid;
begin
  select id into v_user_id from public.users where tg_user_id = p_tg_user_id;
  if v_user_id is null then
    raise exception 'User not found';
  end if;

  insert into public.spin_cooldowns (user_id, next_spin_at)
  values (v_user_id, p_next_spin_at)
  on conflict (user_id)
  do update set
    next_spin_at = excluded.next_spin_at,
    updated_at = now();

  return jsonb_build_object('next_spin_at', p_next_spin_at);
end;
$$;

create or replace function public.list_due_spin_users(p_now timestamptz)
returns table (tg_user_id bigint)
language sql
stable
as $$
  select u.tg_user_id
  from public.spin_cooldowns sc
  join public.users u on u.id = sc.user_id
  where sc.next_spin_at is not null
    and sc.next_spin_at <= p_now
  order by sc.next_spin_at asc;
$$;

