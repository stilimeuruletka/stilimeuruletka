create extension if not exists pgcrypto;

create or replace function public.generate_referral_code()
returns text
language plpgsql
as $$
declare
  v text;
begin
  loop
    v := encode(gen_random_bytes(9), 'base64');
    v := replace(replace(replace(v, '+', '-'), '/', '_'), '=', '');
    exit when not exists (select 1 from public.users u where u.referral_code = v);
  end loop;
  return v;
end;
$$;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  tg_user_id bigint not null unique,
  username text,
  referral_code text not null unique default public.generate_referral_code(),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  inviter_user_id uuid not null references public.users(id) on delete cascade,
  invitee_user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (invitee_user_id)
);

create table if not exists public.ticket_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  delta integer not null,
  reason text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ticket_ledger_user_created_idx on public.ticket_ledger (user_id, created_at desc);

create table if not exists public.prizes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  weight integer not null check (weight > 0),
  value numeric,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.spins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  spend_ledger_id uuid not null references public.ticket_ledger(id) on delete restrict,
  prize_id uuid references public.prizes(id) on delete set null,
  win boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists spins_user_created_idx on public.spins (user_id, created_at desc);

create table if not exists public.subscription_rewards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  channel_id text not null,
  rewarded_at timestamptz not null default now(),
  unique (user_id, channel_id)
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  tg_user_id bigint not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_events_tg_created_idx on public.audit_events (tg_user_id, created_at desc);

create or replace function public.get_ticket_balance(p_tg_user_id bigint)
returns jsonb
language sql
stable
as $$
  with u as (
    select id from public.users where tg_user_id = p_tg_user_id
  )
  select jsonb_build_object(
    'balance',
    greatest(
      0,
      coalesce((select sum(l.delta)::int from public.ticket_ledger l join u on u.id = l.user_id), 0)
    )
  );
$$;

create or replace function public.handle_start(p_tg_user_id bigint, p_username text, p_ref_code text)
returns jsonb
language plpgsql
as $$
declare
  v_user_id uuid;
  v_inserted boolean := false;
  v_referral_processed boolean := false;
  v_inviter_user_id uuid;
  v_inviter_tg_user_id bigint;
begin
  with upsert as (
    insert into public.users (tg_user_id, username, last_seen_at)
    values (p_tg_user_id, nullif(p_username, ''), now())
    on conflict (tg_user_id)
    do update set
      username = coalesce(excluded.username, public.users.username),
      last_seen_at = now()
    returning id, (xmax = 0) as inserted
  )
  select id, inserted into v_user_id, v_inserted from upsert;

  if v_inserted and p_ref_code is not null and length(p_ref_code) > 0 then
    select u.id, u.tg_user_id
      into v_inviter_user_id, v_inviter_tg_user_id
      from public.users u
      where u.referral_code = p_ref_code
      limit 1;

    if v_inviter_user_id is not null and v_inviter_user_id <> v_user_id then
      begin
        insert into public.referrals (inviter_user_id, invitee_user_id)
        values (v_inviter_user_id, v_user_id);

        insert into public.ticket_ledger (user_id, delta, reason, meta)
        values (v_inviter_user_id, 1, 'referral_invite', jsonb_build_object('invitee_tg_user_id', p_tg_user_id));

        v_referral_processed := true;
      exception when unique_violation then
        v_referral_processed := false;
      end;
    end if;
  end if;

  return jsonb_build_object(
    'is_new_user', v_inserted,
    'referral_processed', v_referral_processed,
    'inviter_user_id', v_inviter_tg_user_id
  );
end;
$$;

create or replace function public.grant_subscription_ticket(p_tg_user_id bigint, p_channel_id text)
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

  begin
    insert into public.subscription_rewards (user_id, channel_id)
    values (v_user_id, p_channel_id);

    insert into public.ticket_ledger (user_id, delta, reason, meta)
    values (v_user_id, 1, 'channel_subscription', jsonb_build_object('channel_id', p_channel_id));
  exception when unique_violation then
    null;
  end;

  return public.get_ticket_balance(p_tg_user_id);
end;
$$;

create or replace function public.spin_wheel(p_tg_user_id bigint)
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

  insert into public.ticket_ledger (user_id, delta, reason, meta)
  values (v_user_id, -1, 'spin', '{}'::jsonb)
  returning id into v_spend_ledger_id;

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

  insert into public.spins (user_id, spend_ledger_id, prize_id, win)
  values (v_user_id, v_spend_ledger_id, v_prize_id, v_win)
  returning id into v_spin_id;

  return jsonb_build_object(
    'spin_id', v_spin_id,
    'prize_id', v_prize_id,
    'prize_title', v_prize_title,
    'prize_value', v_prize_value,
    'win', v_win,
    'balance_after', (public.get_ticket_balance(p_tg_user_id)->>'balance')::int
  );
end;
$$;

insert into public.prizes (title, weight, value)
values
  ('Ничего', 7000, 0),
  ('Малый приз', 2500, 10),
  ('Средний приз', 450, 50),
  ('Большой приз', 50, 500)
on conflict do nothing;
