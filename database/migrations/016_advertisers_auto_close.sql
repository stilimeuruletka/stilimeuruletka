-- ================================================================
-- 016_advertisers_auto_close.sql
-- 1) Отдельная сущность «Реклама» (рекламодатели, у кого МЫ покупаем рекламу)
-- 2) Трекинг переходов по их реф-ссылкам (startapp=adv_<code>)
-- 3) Автозакрытие заказа: кампания подписки достигла 100% → кампания и
--    блогер-заказчик становятся неактивными («задача выполнена»)
-- Требуется запустить в Supabase SQL Editor
-- ================================================================

-- ---------------------------------------------------------------
-- 1. Таблица рекламодателей advertisers
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.advertisers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE,
    name text NOT NULL,
    telegram_link text NULL,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.advertisers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'advertisers' AND policyname = 'service_role_all'
    ) THEN
        EXECUTE 'create policy service_role_all on public.advertisers for all using (auth.role() = ''service_role'') with check (auth.role() = ''service_role'')';
    END IF;
END
$$;

-- ---------------------------------------------------------------
-- 2. Журнал переходов по реф-ссылкам рекламодателей
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.advertiser_clicks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    advertiser_id uuid NOT NULL REFERENCES public.advertisers(id) ON DELETE CASCADE,
    tg_user_id bigint,
    meta jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS advertiser_clicks_adv_created_idx ON public.advertiser_clicks (advertiser_id, created_at DESC);
CREATE INDEX IF NOT EXISTS advertiser_clicks_tg_created_idx ON public.advertiser_clicks (tg_user_id, created_at DESC);

ALTER TABLE public.advertiser_clicks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'advertiser_clicks' AND policyname = 'service_role_all'
    ) THEN
        EXECUTE 'create policy service_role_all on public.advertiser_clicks for all using (auth.role() = ''service_role'') with check (auth.role() = ''service_role'')';
    END IF;
END
$$;

-- ---------------------------------------------------------------
-- 3. Привязка пользователя к рекламодателю (первый клик сохраняется)
-- ---------------------------------------------------------------
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS advertiser_id uuid REFERENCES public.advertisers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS users_advertiser_idx ON public.users (advertiser_id) WHERE advertiser_id IS NOT NULL;

-- ---------------------------------------------------------------
-- 4. track_advertiser_click — запись перехода по startapp=adv_<code>
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.track_advertiser_click(p_tg_user_id bigint, p_advertiser_code text, p_meta jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_advertiser_id uuid;
    v_user_id uuid;
BEGIN
    IF p_advertiser_code IS NULL OR length(p_advertiser_code) = 0 THEN
        RETURN;
    END IF;

    SELECT id INTO v_advertiser_id
    FROM public.advertisers
    WHERE code = p_advertiser_code AND active = true
    LIMIT 1;

    IF v_advertiser_id IS NULL THEN
        RETURN;
    END IF;

    SELECT id INTO v_user_id
    FROM public.users
    WHERE tg_user_id = p_tg_user_id
    LIMIT 1;

    IF v_user_id IS NULL THEN
        RETURN;
    END IF;

    INSERT INTO public.advertiser_clicks (advertiser_id, tg_user_id, meta)
    VALUES (v_advertiser_id, p_tg_user_id, COALESCE(p_meta, '{}'::jsonb));

    UPDATE public.users
        SET advertiser_id = COALESCE(advertiser_id, v_advertiser_id),
            last_seen_at = now()
        WHERE id = v_user_id;
END;
$$;

-- ---------------------------------------------------------------
-- 5. get_advertiser_stats — статистика по рекламодателю за период
--    Переходы = клики по ссылке; Пришло людей = пользователи, привязанные
--    к этому рекламодателю и созданные в указанном периоде
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_advertiser_stats(p_from timestamptz, p_to timestamptz)
RETURNS TABLE (
    advertiser_id uuid,
    code text,
    name text,
    clicks bigint,
    registrations bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH range AS (
        SELECT coalesce(p_from, now() - interval '30 days') AS from_ts,
               coalesce(p_to, now()) AS to_ts
    )
    SELECT
        a.id AS advertiser_id,
        a.code,
        a.name,
        coalesce((
            SELECT count(*)::bigint
            FROM public.advertiser_clicks c, range r
            WHERE c.advertiser_id = a.id AND c.created_at >= r.from_ts AND c.created_at < r.to_ts
        ), 0) AS clicks,
        coalesce((
            SELECT count(*)::bigint
            FROM public.users u, range r
            WHERE u.advertiser_id = a.id AND u.created_at >= r.from_ts AND u.created_at < r.to_ts
        ), 0) AS registrations
    FROM public.advertisers a
    ORDER BY a.created_at DESC;
$$;

-- ---------------------------------------------------------------
-- 6. Автозакрытие заказа: при подтверждении подписки проверяем,
--    выполнена ли цель кампании (100%). Если да —
--    деактивируем кампанию и блогера-заказчика («задача выполнена»).
--    Переопределение RPC из миграции 010.
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
    v_goal integer;
    v_cnt integer;
    v_blogger_id uuid;
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
            p_campaign_id, v_user_id, p_tg_user_id,
            COALESCE(p_verified_via, 'bot_api_check'),
            COALESCE(p_meta, '{}'::jsonb)
        ) ON CONFLICT (campaign_id, user_id) DO NOTHING;
        ok := true;
        inserted := true;

        -- Проверяем: достигнута ли цель → закрываем заказ
        SELECT goal_subscribers, blogger_id INTO v_goal, v_blogger_id
        FROM public.subscription_campaigns
        WHERE id = p_campaign_id;

        SELECT count(*)::integer INTO v_cnt
        FROM public.user_subscription_confirmations
        WHERE campaign_id = p_campaign_id;

        IF v_goal IS NOT NULL AND v_cnt >= v_goal THEN
            UPDATE public.subscription_campaigns
               SET active = false, ends_at = now()
             WHERE id = p_campaign_id AND active = true;

            IF v_blogger_id IS NOT NULL THEN
                UPDATE public.bloggers
                   SET active = false
                 WHERE id = v_blogger_id AND active = true;
            END IF;
        END IF;
    ELSE
        ok := true;
        inserted := false;
    END IF;

    user_id := v_user_id;
    RETURN NEXT;
END;
$$;