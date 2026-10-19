-- -----------------------------------------------------------------------------
-- 015_prize_calendar_adjust.sql
-- Быстрое изменение остатка плана на день: +1 / -1 (и любая ненулевая дельта).
-- Уже выданные места не трогаются: уменьшается/увеличивается только доступный
-- остаток (remaining), amount пересчитывается как выдано + остаток.
-- -----------------------------------------------------------------------------

create or replace function public.admin_adjust_prize_calendar(
  p_id uuid,
  p_delta integer
)
returns jsonb
language plpgsql
as $$
declare
  v_amount integer;
  v_remaining integer;
  v_issued integer;
  v_new_remaining integer;
  v_new_amount integer;
begin
  if p_delta is null or p_delta = 0 then
    return jsonb_build_object('ok', false, 'error', 'delta must be non-zero');
  end if;

  select amount, remaining
    into v_amount, v_remaining
    from public.prize_calendar
   where id = p_id
   for update;

  if v_amount is null then
    return jsonb_build_object('ok', false, 'error', 'prize calendar row not found');
  end if;

  v_issued := v_amount - v_remaining;
  v_new_remaining := greatest(v_remaining + p_delta, 0);
  v_new_amount := v_issued + v_new_remaining;

  update public.prize_calendar
     set remaining = v_new_remaining,
         amount = v_new_amount,
         updated_at = now()
   where id = p_id;

  return jsonb_build_object('ok', true, 'id', p_id, 'amount', v_new_amount, 'remaining', v_new_remaining);
end;
$$;