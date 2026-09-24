-- Run after schema.sql, before deploying version 2.1. Back up the database first.
BEGIN;
-- Subscription and quota fields are exclusively server-managed.
DROP POLICY IF EXISTS "profiles: user can update own row" ON public.profiles;
REVOKE UPDATE ON public.profiles FROM anon, authenticated;

-- One locked transaction per AI request. Accepted attempts count toward quota,
-- including upstream failures; retries within the same request count only once.
CREATE OR REPLACE FUNCTION public.consume_ai_usage(p_user_id uuid, p_free_limit integer, p_pro_limit integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.profiles%ROWTYPE;
  month_start timestamptz := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  used integer;
  cap integer;
BEGIN
  IF p_free_limit < 1 OR p_pro_limit < 1 THEN RAISE EXCEPTION 'Invalid quota'; END IF;
  SELECT * INTO p FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile unavailable'; END IF;
  IF p.monthly_reset_at < month_start THEN
    p.monthly_usage := 0;
    p.monthly_reset_at := month_start;
  END IF;
  used := CASE WHEN p.is_pro THEN p.monthly_usage ELSE p.lifetime_usage END;
  cap := CASE WHEN p.is_pro THEN p_pro_limit ELSE p_free_limit END;
  IF used >= cap THEN
    RETURN jsonb_build_object('allowed', false, 'isPro', p.is_pro, 'used', used, 'limit', cap);
  END IF;
  UPDATE public.profiles SET lifetime_usage = lifetime_usage + 1,
    monthly_usage = CASE WHEN p.is_pro THEN p.monthly_usage + 1 ELSE p.monthly_usage END,
    monthly_reset_at = p.monthly_reset_at WHERE id = p_user_id;
  RETURN jsonb_build_object('allowed', true, 'isPro', p.is_pro, 'used', used + 1, 'limit', cap);
END;
$$;
REVOKE ALL ON FUNCTION public.consume_ai_usage(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_usage(uuid, integer, integer) TO service_role;

-- Aggregate before joining: the former two one-to-many joins multiplied costs.
CREATE OR REPLACE VIEW public.user_stats WITH (security_invoker = true) AS
SELECT p.id, p.email, p.lifetime_usage, p.monthly_usage, p.is_pro,
  p.lemon_subscription_id, p.created_at,
  coalesce(t.cost, 0)::numeric(12,6) AS total_cost_usd,
  coalesce(t.tokens, 0)::bigint AS total_tokens,
  coalesce(c.sessions, 0)::bigint AS total_chat_sessions
FROM public.profiles p
LEFT JOIN (SELECT user_id, sum(cost_usd) AS cost, sum(input_tokens + output_tokens) AS tokens
  FROM public.token_logs GROUP BY user_id) t ON t.user_id = p.id
LEFT JOIN (SELECT user_id, count(*) AS sessions FROM public.chat_logs GROUP BY user_id) c ON c.user_id = p.id;
COMMIT;
