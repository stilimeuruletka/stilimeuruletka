-- Security lockdown: close all public access, unique blogger clicks

-- 1) Unique clicks per blogger + user
delete from public.blogger_clicks bc
using public.blogger_clicks bc2
where bc.tg_user_id is not null
  and bc2.tg_user_id is not null
  and bc.blogger_id = bc2.blogger_id
  and bc.tg_user_id = bc2.tg_user_id
  and bc.created_at > bc2.created_at;

create unique index if not exists blogger_clicks_unique_blogger_user
  on public.blogger_clicks (blogger_id, tg_user_id)
  where tg_user_id is not null;

create or replace function public.track_blogger_click(p_tg_user_id bigint, p_blogger_code text, p_meta jsonb default '{}'::jsonb)
returns void
language plpgsql
as $$
declare
  v_blogger_id uuid;
  v_user_id uuid;
begin
  if p_blogger_code is null or length(p_blogger_code) = 0 then
    return;
  end if;

  select id into v_blogger_id
  from public.bloggers
  where code = p_blogger_code and active = true
  limit 1;

  if v_blogger_id is null then
    return;
  end if;

  select id into v_user_id
  from public.users
  where tg_user_id = p_tg_user_id
  limit 1;

  if v_user_id is null then
    return;
  end if;

  insert into public.blogger_clicks (blogger_id, tg_user_id, meta)
  values (v_blogger_id, p_tg_user_id, coalesce(p_meta, '{}'::jsonb))
  on conflict (blogger_id, tg_user_id) where tg_user_id is not null do nothing;

  update public.users
    set blogger_id = coalesce(blogger_id, v_blogger_id),
        last_seen_at = now()
    where id = v_user_id;
end;
$$;

-- 2) Remove old public grants
revoke all on table public.coupon_sets_stats from anon, authenticated;
revoke all on table public.coupon_sets from anon, authenticated;
revoke all on table public.coupon_redemptions from anon, authenticated;
revoke all on table public.preview_ads from anon, authenticated;
revoke all on table public.preview_views from anon, authenticated;
revoke all on table public.prize_calendar from anon, authenticated;
revoke all on table public.prizes from anon, authenticated;

-- 3) Enable RLS + allow only service_role
do $$
begin
  -- users
  execute 'alter table public.users enable row level security';
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'users' and policyname = 'service_role_all') then
    execute 'create policy service_role_all on public.users for all using (auth.role() = ''service_role'') with check (auth.role() = ''service_role'')';
  end if;

  -- referrals
  execute 'alter table public.referrals enable row level security';
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'referrals' and policyname = 'service_role_all') then
    execute 'create policy service_role_all on public.referrals for all using (auth.role() = ''service_role'') with check (auth.role() = ''service_role'')';
  end if;

  -- ticket_ledger
  execute 'alter table public.ticket_ledger enable row level security';
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ticket_ledger' and policyname = 'service_role_all') then
    execute 'create policy service_role_all on public.ticket_ledger for all using (auth.role() = ''service_role'') with check (auth.role() = ''service_role'')';
  end if;

  -- spins
  execute 'alter table public.spins enable row level security';
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'spins' and policyname = 'service_role_all') then
    execute 'create policy service_role_all on public.spins for all using (auth.role() = ''service_role'') with check (auth.role() = ''service_role'')';
  end if;

  -- spin_cooldowns
  execute 'alter table public.spin_cooldowns enable row level security';
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'spin_cooldowns' and policyname = 'service_role_all') then
    execute 'create policy service_role_all on public.spin_cooldowns for all using (auth.role() = ''service_role'') with check (auth.role() = ''service_role'')';
  end if;

  -- subscription_rewards
  execute 'alter table public.subscription_rewards enable row level security';
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'subscription_rewards' and policyname = 'service_role_all') then
    execute 'create policy service_role_all on public.subscription_rewards for all using (auth.role() = ''service_role'') with check (auth.role() = ''service_role'')';
  end if;

  -- audit_events
  execute 'alter table public.audit_events enable row level security';
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'audit_events' and policyname = 'service_role_all') then
    execute 'create policy service_role_all on public.audit_events for all using (auth.role() = ''service_role'') with check (auth.role() = ''service_role'')';
  end if;

  -- prize_calendar
  execute 'alter table public.prize_calendar enable row level security';
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'prize_calendar' and policyname = 'service_role_all') then
    execute 'create policy service_role_all on public.prize_calendar for all using (auth.role() = ''service_role'') with check (auth.role() = ''service_role'')';
  end if;

  -- preview_ads
  execute 'alter table public.preview_ads enable row level security';
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'preview_ads' and policyname = 'service_role_all') then
    execute 'create policy service_role_all on public.preview_ads for all using (auth.role() = ''service_role'') with check (auth.role() = ''service_role'')';
  end if;

  -- preview_views
  execute 'alter table public.preview_views enable row level security';
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'preview_views' and policyname = 'service_role_all') then
    execute 'create policy service_role_all on public.preview_views for all using (auth.role() = ''service_role'') with check (auth.role() = ''service_role'')';
  end if;

  -- coupon_sets
  execute 'alter table public.coupon_sets enable row level security';
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'coupon_sets' and policyname = 'service_role_all') then
    execute 'create policy service_role_all on public.coupon_sets for all using (auth.role() = ''service_role'') with check (auth.role() = ''service_role'')';
  end if;

  -- coupon_redemptions
  execute 'alter table public.coupon_redemptions enable row level security';
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'coupon_redemptions' and policyname = 'service_role_all') then
    execute 'create policy service_role_all on public.coupon_redemptions for all using (auth.role() = ''service_role'') with check (auth.role() = ''service_role'')';
  end if;

  -- subscription_campaigns
  execute 'alter table public.subscription_campaigns enable row level security';
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'subscription_campaigns' and policyname = 'service_role_all') then
    execute 'create policy service_role_all on public.subscription_campaigns for all using (auth.role() = ''service_role'') with check (auth.role() = ''service_role'')';
  end if;

  -- user_subscription_confirmations
  execute 'alter table public.user_subscription_confirmations enable row level security';
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_subscription_confirmations' and policyname = 'service_role_all') then
    execute 'create policy service_role_all on public.user_subscription_confirmations for all using (auth.role() = ''service_role'') with check (auth.role() = ''service_role'')';
  end if;
end
$$;

-- 4) Hard revoke table privileges from anon/authenticated
do $$
declare r record;
begin
  for r in
    select c.oid::regclass as tbl
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r','p','v','m','f')
  loop
    execute format('revoke all on table %s from anon, authenticated;', r.tbl);
    execute format('grant all on table %s to service_role;', r.tbl);
  end loop;
end
$$;

-- 5) Revoke function execute from anon/authenticated, allow only service_role
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as fn
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    execute format('revoke execute on function %s from anon, authenticated;', r.fn);
    execute format('grant execute on function %s to service_role;', r.fn);
  end loop;
end
$$;

-- 6) Revoke schema usage for anon/authenticated
revoke all on schema public from anon, authenticated;
grant usage on schema public to service_role;
