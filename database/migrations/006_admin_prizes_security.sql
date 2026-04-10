alter table public.prizes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'prizes' and policyname = 'service_role_all'
  ) then
    execute 'create policy service_role_all on public.prizes for all using (auth.role() = ''service_role'') with check (auth.role() = ''service_role'')';
  end if;
end
$$;

create or replace function public.create_admin_user(p_email text, p_password text)
returns jsonb
language plpgsql
as $$
declare
  v_role text;
  v_id uuid;
  v_email text;
begin
  v_role := coalesce(auth.role(), '');
  if v_role not in ('service_role', 'postgres') then
    raise exception 'Not allowed';
  end if;

  v_email := lower(trim(p_email));
  if v_email is null or length(v_email) < 3 then
    raise exception 'Invalid email';
  end if;
  if p_password is null or length(p_password) < 6 then
    raise exception 'Invalid password';
  end if;

  insert into public.admin_users (email, password_hash)
  values (v_email, crypt(p_password, gen_salt('bf')))
  returning id into v_id;

  return jsonb_build_object('admin_id', v_id, 'email', v_email);
end;
$$;

create or replace function public.set_admin_password(p_email text, p_password text)
returns void
language plpgsql
as $$
declare
  v_role text;
  v_email text;
begin
  v_role := coalesce(auth.role(), '');
  if v_role not in ('service_role', 'postgres') then
    raise exception 'Not allowed';
  end if;

  v_email := lower(trim(p_email));
  if v_email is null or length(v_email) < 3 then
    raise exception 'Invalid email';
  end if;
  if p_password is null or length(p_password) < 6 then
    raise exception 'Invalid password';
  end if;

  update public.admin_users
    set password_hash = crypt(p_password, gen_salt('bf'))
    where lower(email) = v_email;
end;
$$;

