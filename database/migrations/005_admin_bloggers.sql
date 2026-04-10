create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

alter table public.admin_users enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'admin_users' and policyname = 'service_role_all'
  ) then
    execute 'create policy service_role_all on public.admin_users for all using (auth.role() = ''service_role'') with check (auth.role() = ''service_role'')';
  end if;
end
$$;

create or replace function public.admin_login(p_email text, p_password text)
returns jsonb
language plpgsql
as $$
declare
  v_id uuid;
  v_hash text;
begin
  select id, password_hash into v_id, v_hash
  from public.admin_users
  where lower(email) = lower(p_email)
  limit 1;

  if v_id is null then
    raise exception 'Invalid credentials';
  end if;

  if crypt(p_password, v_hash) <> v_hash then
    raise exception 'Invalid credentials';
  end if;

  update public.admin_users
    set last_login_at = now()
    where id = v_id;

  return jsonb_build_object('admin_id', v_id, 'email', p_email);
end;
$$;

create table if not exists public.bloggers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.bloggers enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'bloggers' and policyname = 'service_role_all'
  ) then
    execute 'create policy service_role_all on public.bloggers for all using (auth.role() = ''service_role'') with check (auth.role() = ''service_role'')';
  end if;
end
$$;

create table if not exists public.blogger_clicks (
  id uuid primary key default gen_random_uuid(),
  blogger_id uuid not null references public.bloggers(id) on delete cascade,
  tg_user_id bigint,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists blogger_clicks_blogger_created_idx on public.blogger_clicks (blogger_id, created_at desc);
create index if not exists blogger_clicks_tg_created_idx on public.blogger_clicks (tg_user_id, created_at desc);

alter table public.blogger_clicks enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'blogger_clicks' and policyname = 'service_role_all'
  ) then
    execute 'create policy service_role_all on public.blogger_clicks for all using (auth.role() = ''service_role'') with check (auth.role() = ''service_role'')';
  end if;
end
$$;

alter table public.users
  add column if not exists blogger_id uuid references public.bloggers(id) on delete set null;

create index if not exists users_blogger_idx on public.users (blogger_id) where blogger_id is not null;

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
  values (v_blogger_id, p_tg_user_id, coalesce(p_meta, '{}'::jsonb));

  update public.users
    set blogger_id = coalesce(blogger_id, v_blogger_id),
        last_seen_at = now()
    where id = v_user_id;
end;
$$;

create or replace function public.get_blogger_stats(p_from timestamptz, p_to timestamptz)
returns table (
  blogger_id uuid,
  code text,
  name text,
  clicks bigint,
  registrations bigint,
  spins bigint
)
language sql
stable
as $$
  with range as (
    select coalesce(p_from, now() - interval '30 days') as from_ts,
           coalesce(p_to, now()) as to_ts
  )
  select
    b.id as blogger_id,
    b.code,
    b.name,
    coalesce((
      select count(*)::bigint
      from public.blogger_clicks c, range r
      where c.blogger_id = b.id and c.created_at >= r.from_ts and c.created_at < r.to_ts
    ), 0) as clicks,
    coalesce((
      select count(*)::bigint
      from public.users u, range r
      where u.blogger_id = b.id and u.created_at >= r.from_ts and u.created_at < r.to_ts
    ), 0) as registrations,
    coalesce((
      select count(*)::bigint
      from public.spins s
      join public.users u on u.id = s.user_id,
      range r
      where u.blogger_id = b.id and s.created_at >= r.from_ts and s.created_at < r.to_ts
    ), 0) as spins
  from public.bloggers b
  order by b.created_at desc;
$$;

