-- 009_admin_user_ops.sql
-- Поля для ручных админских операций над пользователями и аудита.
-- Применять через Supabase SQL Editor. Ничего не роняет, только добавляет колонки/индексы.

BEGIN;

-- 1. Ban / admin_note поля в users — всегда безопасно ADD COLUMN IF NOT EXISTS
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'banned_at') THEN
    ALTER TABLE users ADD COLUMN banned_at timestamptz NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'ban_reason') THEN
    ALTER TABLE users ADD COLUMN ban_reason text NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'ban_until') THEN
    ALTER TABLE users ADD COLUMN ban_until timestamptz NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'admin_note') THEN
    ALTER TABLE users ADD COLUMN admin_note text NULL;
  END IF;
END $$;

-- 2. Индекс на бан для быстрых выборок (например в RPC spin_wheel_limited сразу отсеивать забаненных)
CREATE INDEX IF NOT EXISTS idx_users_banned_at ON users (banned_at) WHERE banned_at IS NOT NULL;

-- 3. Разрешить новые reason-значения в ticket_ledger. 
--    Старые: daily_free_spin, referral_invite, repair, ... Добавляем ручные админские
--    (Примечание: если reason это ENUM — используем ALTER TYPE. Если text — ничего не требуется.
--    Делаем safe-проверку через information_schema + USAGE если enum)
DO $$
DECLARE
  reason_type text;
BEGIN
  SELECT data_type INTO reason_type
  FROM information_schema.columns
  WHERE table_name = 'ticket_ledger' AND column_name = 'reason';

  IF reason_type = 'USER-DEFINED' THEN
    -- enum — пробуем добавить значения без падения если уже есть
    BEGIN
      EXECUTE 'ALTER TYPE ticket_ledger_reason ADD VALUE IF NOT EXISTS ''manual_admin_grant''';
      EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      EXECUTE 'ALTER TYPE ticket_ledger_reason ADD VALUE IF NOT EXISTS ''manual_admin_remove''';
      EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- 4. RPC для ручной выдачи билетов админом
CREATE OR REPLACE FUNCTION admin_adjust_tickets(p_tg_user_id bigint, p_delta integer, p_reason text DEFAULT 'manual_admin_grant')
RETURNS TABLE (new_balance integer, ok boolean, msg text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_new_bal integer;
BEGIN
  IF p_delta IS NULL OR p_delta = 0 THEN
    RETURN QUERY SELECT 0::integer, false, 'p_delta must be non-zero';
    RETURN;
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    p_reason := 'manual_admin_grant';
  END IF;

  SELECT id INTO v_user_id FROM users WHERE tg_user_id = p_tg_user_id LIMIT 1;
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT 0::integer, false, 'user_not_found';
    RETURN;
  END IF;

  INSERT INTO ticket_ledger (user_id, delta, reason, meta)
  VALUES (v_user_id, p_delta, left(p_reason, 64), jsonb_build_object('kind', 'admin_manual', 'at', now()::text));

  -- пересчитать актуальный баланс
  SELECT COALESCE(SUM(delta), 0) INTO v_new_bal
  FROM ticket_ledger
  WHERE user_id = v_user_id;

  RETURN QUERY SELECT v_new_bal::integer, true, 'ok';
END;
$$;

-- 5. RPC сброс кулдауна (сразу открывает спин)
CREATE OR REPLACE FUNCTION admin_reset_cooldown(p_tg_user_id bigint)
RETURNS TABLE (next_spin_at timestamptz, ok boolean, msg text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_now timestamptz := now();
BEGIN
  SELECT id INTO v_user_id FROM users WHERE tg_user_id = p_tg_user_id LIMIT 1;
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT NULL::timestamptz, false, 'user_not_found';
    RETURN;
  END IF;

  DELETE FROM spin_cooldowns WHERE user_id = v_user_id;

  -- Выдать бесплатный если требуется — делаем так же как ensure_free_spin
  INSERT INTO spin_cooldowns (user_id, next_spin_at, free_spin_granted)
  VALUES (v_user_id, v_now, false)
  ON CONFLICT (user_id) DO UPDATE SET next_spin_at = v_now;

  RETURN QUERY SELECT v_now, true, 'ok';
END;
$$;

-- 6. RPC бан / разбан + заметка
CREATE OR REPLACE FUNCTION admin_set_user_status(
  p_tg_user_id bigint,
  p_banned boolean,
  p_ban_reason text DEFAULT NULL,
  p_ban_until_hours integer DEFAULT NULL,
  p_admin_note text DEFAULT NULL
)
RETURNS TABLE (banned_at_new timestamptz, note_new text, ok boolean, msg text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_banned_at timestamptz;
  v_note text;
BEGIN
  SELECT id INTO v_user_id FROM users WHERE tg_user_id = p_tg_user_id LIMIT 1;
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT NULL::timestamptz, NULL::text, false, 'user_not_found';
    RETURN;
  END IF;

  IF p_banned THEN
    v_banned_at := now();
    UPDATE users
    SET
      banned_at = v_banned_at,
      ban_reason = left(trim(p_ban_reason), 500),
      ban_until = CASE
        WHEN p_ban_until_hours IS NOT NULL AND p_ban_until_hours > 0 THEN now() + (p_ban_until_hours || ' hours')::interval
        ELSE NULL
      END,
      admin_note = CASE WHEN p_admin_note IS NOT NULL THEN left(trim(p_admin_note), 5000) ELSE admin_note END
    WHERE id = v_user_id
    RETURNING admin_note INTO v_note;
  ELSE
    UPDATE users
    SET
      banned_at = NULL,
      ban_reason = NULL,
      ban_until = NULL,
      admin_note = CASE WHEN p_admin_note IS NOT NULL THEN left(trim(p_admin_note), 5000) ELSE admin_note END
    WHERE id = v_user_id
    RETURNING admin_note INTO v_note;
    v_banned_at := NULL;
  END IF;

  RETURN QUERY SELECT v_banned_at, v_note, true, 'ok';
END;
$$;

COMMIT;
