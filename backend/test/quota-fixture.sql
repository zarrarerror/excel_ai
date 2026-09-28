-- Disposable PostgreSQL only. Never apply this fixture to Supabase.
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TABLE public.profiles(id uuid PRIMARY KEY, email text, lifetime_usage integer NOT NULL DEFAULT 0,
 monthly_usage integer NOT NULL DEFAULT 0, monthly_reset_at timestamptz DEFAULT now(), is_pro boolean DEFAULT false,
 lemon_subscription_id text, created_at timestamptz DEFAULT now());
CREATE TABLE public.token_logs(user_id uuid, cost_usd numeric, input_tokens integer, output_tokens integer);
CREATE TABLE public.chat_logs(user_id uuid);
