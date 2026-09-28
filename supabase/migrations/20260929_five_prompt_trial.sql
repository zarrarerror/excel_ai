-- Run after 20260925_reliability.sql. Existing lifetime usage is preserved.
BEGIN;
CREATE TABLE IF NOT EXISTS public.ai_prompt_runs (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  prompt_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  calls integer NOT NULL DEFAULT 1 CHECK (calls BETWEEN 1 AND 41),
  PRIMARY KEY (user_id, prompt_id)
);
ALTER TABLE public.ai_prompt_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_prompt_runs FROM anon, authenticated;

-- Serialize on the profile row: concurrent new prompts cannot exceed the quota.
-- One submitted task includes planning plus up to 40 agent model calls.
-- Reusing an ID cannot buy unlimited model calls or renew an expired task.
CREATE OR REPLACE FUNCTION public.consume_ai_prompt(p_user_id uuid, p_prompt_id uuid, p_pro_limit integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  profile public.profiles%ROWTYPE;
  run public.ai_prompt_runs%ROWTYPE;
  allowance jsonb;
BEGIN
  IF p_prompt_id IS NULL OR p_pro_limit < 1 THEN RAISE EXCEPTION 'Invalid prompt'; END IF;
  SELECT * INTO profile FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile unavailable'; END IF;
  SELECT * INTO run FROM public.ai_prompt_runs WHERE user_id = p_user_id AND prompt_id = p_prompt_id;
  IF FOUND THEN
    IF run.created_at < now() - interval '2 hours' OR run.calls >= 41 THEN
      RETURN jsonb_build_object('allowed', false, 'reason', CASE WHEN run.calls >= 41 THEN 'step_limit' ELSE 'prompt_expired' END);
    END IF;
    UPDATE public.ai_prompt_runs SET calls = calls + 1 WHERE user_id = p_user_id AND prompt_id = p_prompt_id;
    RETURN jsonb_build_object('allowed', true, 'isPro', profile.is_pro);
  END IF;
  allowance := public.consume_ai_usage(p_user_id, 5, p_pro_limit);
  IF NOT (allowance->>'allowed')::boolean THEN RETURN allowance; END IF;
  INSERT INTO public.ai_prompt_runs(user_id, prompt_id) VALUES (p_user_id, p_prompt_id);
  RETURN allowance;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_ai_prompt(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_prompt(uuid, uuid, integer) TO service_role;
COMMIT;
