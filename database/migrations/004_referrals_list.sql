alter table public.users
  add column if not exists photo_url text;

create or replace function public.upsert_user_profile(p_tg_user_id bigint, p_username text, p_photo_url text)
returns void
language plpgsql
as $$
begin
  update public.users
    set username = coalesce(nullif(p_username, ''), public.users.username),
        photo_url = coalesce(nullif(p_photo_url, ''), public.users.photo_url),
        last_seen_at = now()
    where tg_user_id = p_tg_user_id;
end;
$$;

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
