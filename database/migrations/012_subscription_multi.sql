-- ================================================================
-- 012_subscription_multi.sql
-- Многоаккаунтный гейт подписки: несколько активных кампаний сразу
-- ================================================================

-- Снимаем ограничение "одна активная кампания"
DROP INDEX IF EXISTS subscription_campaigns_only_one_active;

-- ---------------------------------------------------------------
-- RPC list_active_subscriptions
-- Возвращает ВСЕ активные (не истёкшие) кампании + кто подписан
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_active_subscriptions(
    p_tg_user_id bigint
)
RETURNS TABLE (
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
    v_user_id uuid;
BEGIN
    SELECT u.id INTO v_user_id FROM public.users u WHERE u.tg_user_id = p_tg_user_id;

    RETURN QUERY
    SELECT
        sc.id AS campaign_id,
        b.name::text AS blogger_name,
        sc.channel_id,
        sc.telegram_link,
        sc.goal_subscribers,
        (SELECT COUNT(*)::integer FROM public.user_subscription_confirmations c
          WHERE c.campaign_id = sc.id) AS confirmed_count,
        CASE WHEN sc.goal_subscribers > 0
          THEN ROUND(((SELECT COUNT(*)::numeric FROM public.user_subscription_confirmations c
                 WHERE c.campaign_id = sc.id) / sc.goal_subscribers::numeric) * 10000) / 100.0
          ELSE 0 END AS percent,
        CASE WHEN v_user_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.user_subscription_confirmations c
            WHERE c.campaign_id = sc.id AND c.user_id = v_user_id
        ) THEN true ELSE false END AS user_confirmed
    FROM public.subscription_campaigns sc
    LEFT JOIN public.bloggers b ON b.id = sc.blogger_id
    WHERE sc.active = true
      AND sc.starts_at <= now()
      AND (sc.ends_at IS NULL OR sc.ends_at > now())
    ORDER BY sc.created_at ASC;
END;
$$;

COMMENT ON FUNCTION public.list_active_subscriptions(bigint) IS
'Возвращает все активные кампании подписки. user_confirmed = подтвердил ли подписку конкретный пользователь на эту кампанию.';

-- ---------------------------------------------------------------
-- admin_activate_subscription_campaign (переопределение)
-- Больше НЕ выключает остальные активные кампании — позволяет
-- держать несколько активных аккаунтов одновременно.
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

    UPDATE public.subscription_campaigns SET active = true WHERE id = p_campaign_id;

    ok := true;
    msg := 'Кампания активирована';
    activated_id := p_campaign_id;
    RETURN NEXT;
END;
$$;