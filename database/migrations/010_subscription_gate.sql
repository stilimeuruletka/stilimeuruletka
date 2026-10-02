-- ================================================================
-- 010_subscription_gate.sql
-- Обязательная подписка на блогера перед спином
-- Требуется запустить в Supabase SQL Editor
-- ================================================================

-- ---------------------------------------------------------------
-- 1. Колонка telegram_link в существующей таблице bloggers
-- ---------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'bloggers' AND column_name = 'telegram_link'
    ) THEN
        ALTER TABLE public.bloggers
        ADD COLUMN telegram_link text NULL;
    END IF;
END $$;

-- ---------------------------------------------------------------
-- 2. Таблица кампаний подписки subscription_campaigns
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscription_campaigns (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    blogger_id uuid NOT NULL REFERENCES public.bloggers(id) ON DELETE CASCADE,
    channel_id text NOT NULL,
    telegram_link text NOT NULL,
    goal_subscribers integer NOT NULL DEFAULT 1000,
    starts_at timestamptz NOT NULL DEFAULT now(),
    ends_at timestamptz NULL,
    active boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT subscription_campaigns_goal_positive CHECK (goal_subscribers > 0),
    CONSTRAINT subscription_campaigns_ends_check CHECK (ends_at IS NULL OR ends_at > starts_at)
);

-- Индексы
CREATE INDEX IF NOT EXISTS subscription_campaigns_active_idx
    ON public.subscription_campaigns (active) WHERE active = true;

CREATE INDEX IF NOT EXISTS subscription_campaigns_blogger_idx
    ON public.subscription_campaigns (blogger_id);

CREATE UNIQUE INDEX IF NOT EXISTS subscription_campaigns_only_one_active
    ON public.subscription_campaigns ((active = true)) WHERE active = true;

COMMENT ON TABLE public.subscription_campaigns IS 'Кампании обязательной подписки на канал перед спином. Активна только одна одновременно.';
COMMENT ON COLUMN public.subscription_campaigns.channel_id IS 'Передаётся в getChatMember(). Форматы: -1001234567890 или @channel_username';
COMMENT ON COLUMN public.subscription_campaigns.telegram_link IS 'https://t.me/... — открывается пользователю при клике «Подписаться»';

-- ---------------------------------------------------------------
-- 3. Таблица журнал подтверждённых подписок пользователей
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_subscription_confirmations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id uuid NOT NULL REFERENCES public.subscription_campaigns(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    tg_user_id bigint NOT NULL,
    confirmed_at timestamptz NOT NULL DEFAULT now(),
    verified_via text NOT NULL DEFAULT 'bot_api_check',
    meta jsonb NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE (campaign_id, user_id)
);

CREATE INDEX IF NOT EXISTS user_sub_confirmations_campaign_idx
    ON public.user_subscription_confirmations (campaign_id);

CREATE INDEX IF NOT EXISTS user_sub_confirmations_user_idx
    ON public.user_subscription_confirmations (user_id);

CREATE INDEX IF NOT EXISTS user_sub_confirmations_tg_idx
    ON public.user_subscription_confirmations (tg_user_id);

COMMENT ON TABLE public.user_subscription_confirmations IS 'Факт подтверждённой подписки пользователя на конкретную кампанию (getChatMember = ok)';
COMMENT ON COLUMN public.user_subscription_confirmations.verified_via IS 'bot_api_check — через Telegram getChatMember';

-- ---------------------------------------------------------------
-- 4. RPC admin_activate_subscription_campaign
--    Атомарно: выключает все активные кампании → включает указанную
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_activate_subscription_campaign(p_campaign_id uuid)
RETURNS TABLE (ok boolean, msg text, activated_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_exists boolean;
BEGIN
    SELECT EXISTS (SELECT 1 FROM public.subscription_campaigns WHERE id = p_campaign_id)
    INTO v_exists;
    IF NOT v_exists THEN
        ok := false; msg := 'Кампания не найдена'; activated_id := NULL; RETURN NEXT; RETURN;
    END IF;

    UPDATE public.subscription_campaigns SET active = false WHERE active = true;
    UPDATE public.subscription_campaigns SET active = true WHERE id = p_campaign_id;

    ok := true;
    msg := 'Кампания активирована, остальные деактивированы';
    activated_id := p_campaign_id;
    RETURN NEXT;
END;
$$;

-- ---------------------------------------------------------------
-- 5. RPC get_active_subscription_campaign
--    Возвращает текущую активную кампанию (не истекшую по ends_at)
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_active_subscription_campaign()
RETURNS TABLE (
    id uuid,
    blogger_id uuid,
    blogger_name text,
    channel_id text,
    telegram_link text,
    goal_subscribers integer,
    starts_at timestamptz,
    ends_at timestamptz,
    created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        sc.id,
        sc.blogger_id,
        b.name::text AS blogger_name,
        sc.channel_id,
        sc.telegram_link,
        sc.goal_subscribers,
        sc.starts_at,
        sc.ends_at,
        sc.created_at
    FROM public.subscription_campaigns sc
    LEFT JOIN public.bloggers b ON b.id = sc.blogger_id
    WHERE sc.active = true
      AND sc.starts_at <= now()
      AND (sc.ends_at IS NULL OR sc.ends_at > now())
    ORDER BY sc.created_at DESC
    LIMIT 1;
END;
$$;

-- ---------------------------------------------------------------
-- 6. RPC get_subscription_progress (для одной кампании)
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_subscription_progress(p_campaign_id uuid)
RETURNS TABLE (
    confirmed_count integer,
    goal_subscribers integer,
    percent numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_goal integer;
    v_cnt integer;
BEGIN
    SELECT COALESCE(sc.goal_subscribers, 0) INTO v_goal
    FROM public.subscription_campaigns sc WHERE id = p_campaign_id;
    IF v_goal IS NULL THEN
        confirmed_count := 0; goal_subscribers := 0; percent := 0;
        RETURN NEXT;
        RETURN;
    END IF;

    SELECT COUNT(*)::integer INTO v_cnt
    FROM public.user_subscription_confirmations
    WHERE campaign_id = p_campaign_id;

    confirmed_count := COALESCE(v_cnt, 0);
    goal_subscribers := v_goal;
    percent := CASE WHEN v_goal > 0 THEN ROUND((confirmed_count::numeric / v_goal::numeric) * 10000) / 100.0 ELSE 0 END;
    RETURN NEXT;
END;
$$;

-- ---------------------------------------------------------------
-- 7. Вспомогательная функция upsert_user_subscription_confirmation
--    При подтверждении записывает подтверждение один раз
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_user_subscription_confirmation(
    p_campaign_id uuid,
    p_tg_user_id bigint,
    p_verified_via text,
    p_meta jsonb
)
RETURNS TABLE (ok boolean, user_id uuid, inserted boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid;
    v_exists boolean;
BEGIN
    SELECT u.id INTO v_user_id FROM public.users u WHERE u.tg_user_id = p_tg_user_id;
    IF v_user_id IS NULL THEN
        ok := false; user_id := NULL; inserted := false;
        RETURN NEXT;
        RETURN;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.user_subscription_confirmations c
        WHERE c.campaign_id = p_campaign_id AND c.user_id = v_user_id
    ) INTO v_exists;

    IF NOT v_exists THEN
        INSERT INTO public.user_subscription_confirmations (
            campaign_id, user_id, tg_user_id, verified_via, meta
        ) VALUES (
            p_campaign_id, v_user_id, p_tg_user_id, COALESCE(p_verified_via, 'bot_api_check'), COALESCE(p_meta, '{}'::jsonb)
        ) ON CONFLICT (campaign_id, user_id) DO NOTHING;
        ok := true;
        inserted := true;
    ELSE
        ok := true;
        inserted := false;
    END IF;
    user_id := v_user_id;
    RETURN NEXT;
END;
$$;

-- ---------------------------------------------------------------
-- 8. RPC check_user_has_active_subscription_confirmed
--    Проверка: для текущей активной кампании есть ли у пользователя подтверждение
--    Возвращает campaign_info + confirmed
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_user_has_active_subscription(
    p_tg_user_id bigint
)
RETURNS TABLE (
    has_campaign boolean,
    campaign_id uuid,
    blogger_name text,
    channel_id text,
    telegram_link text,
    goal_subscribers integer,
    confirmed_count integer,
    percent numeric,
    user_confirmed boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_campaign record;
    v_user_id uuid;
    v_cnt integer;
    v_confirmed boolean;
    v_percent numeric;
    v_goal integer;
BEGIN
    SELECT g.id, g.blogger_id, g.blogger_name, g.channel_id, g.telegram_link, g.goal_subscribers
    INTO v_campaign
    FROM public.get_active_subscription_campaign() g;

    IF v_campaign.id IS NULL THEN
        has_campaign := false;
        campaign_id := NULL; blogger_name := NULL; channel_id := NULL;
        telegram_link := NULL; goal_subscribers := 0; confirmed_count := 0; percent := 0; user_confirmed := true;
        RETURN NEXT;
        RETURN;
    END IF;

    SELECT u.id INTO v_user_id FROM public.users u WHERE u.tg_user_id = p_tg_user_id;

    IF v_user_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.user_subscription_confirmations c
            WHERE c.campaign_id = v_campaign.id AND c.user_id = v_user_id
        ) INTO v_confirmed;
    ELSE
        v_confirmed := false;
    END IF;

    SELECT COUNT(*)::integer INTO v_cnt
    FROM public.user_subscription_confirmations c
    WHERE c.campaign_id = v_campaign.id;

    v_goal := COALESCE(v_campaign.goal_subscribers, 0);
    v_percent := CASE WHEN v_goal > 0 THEN ROUND((v_cnt::numeric / v_goal::numeric) * 10000) / 100.0 ELSE 0 END;

    has_campaign := true;
    campaign_id := v_campaign.id;
    blogger_name := v_campaign.blogger_name;
    channel_id := v_campaign.channel_id;
    telegram_link := v_campaign.telegram_link;
    goal_subscribers := v_goal;
    confirmed_count := v_cnt;
    percent := v_percent;
    user_confirmed := COALESCE(v_confirmed, false);
    RETURN NEXT;
END;
$$;
