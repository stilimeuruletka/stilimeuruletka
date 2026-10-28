-- -----------------------------------------------------------------------------
-- 018_handle_start_photo_url.sql
--
-- handle_start теперь принимает p_photo_url и сохраняет аватар пользователя,
-- чтобы на странице /main/friends подгружалось фото приглашённых друзей.
-- -----------------------------------------------------------------------------

-- Колонка photo_url (гарантируем наличие, если 004 не применялась)
alter table public.users
  add column if not exists photo_url text;

-- Меняется сигнатура функции (добавляется параметр) -> CREATE OR REPLACE даст 42P13,
-- поэтому сначала DROP.
drop function if exists public.handle_start(bigint, text, text);

create or replace function public.handle_start(
  p_tg_user_id bigint,
  p_username text,
  p_ref_code text,
  p_photo_url text default null
)
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
    insert into public.users (tg_user_id, username, photo_url, last_seen_at)
    values (p_tg_user_id, nullif(p_username, ''), nullif(p_photo_url, ''), now())
    on conflict (tg_user_id)
    do update set
      username = coalesce(excluded.username, public.users.username),
      photo_url = coalesce(nullif(excluded.photo_url, ''), public.users.photo_url),
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