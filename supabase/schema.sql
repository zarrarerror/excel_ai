-- ============================================================
-- Shayntech Excel AI Pro — Supabase Database Schema
-- Fully secured: RLS on every table, no public access
-- Safe to run multiple times (idempotent)
-- ============================================================

-- ── 1. PROFILES ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id                     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                  TEXT,
  lifetime_usage         INTEGER NOT NULL DEFAULT 0 CHECK (lifetime_usage >= 0),
  monthly_usage          INTEGER NOT NULL DEFAULT 0 CHECK (monthly_usage >= 0),
  monthly_reset_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_pro                 BOOLEAN NOT NULL DEFAULT FALSE,
  lemon_subscription_id  TEXT,
  lemon_customer_email   TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe column migrations (ignored if columns already exist)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS monthly_usage    INTEGER NOT NULL DEFAULT 0 CHECK (monthly_usage >= 0);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS monthly_reset_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ── 2. PENDING ACTIVATIONS ───────────────────────────────────────
-- Used by the LemonSqueezy webhook to record payments before
-- a user account exists. Only the service_role key can access this.
CREATE TABLE IF NOT EXISTS pending_activations (
  id              BIGSERIAL PRIMARY KEY,
  email           TEXT NOT NULL,
  subscription_id TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pending_activations_email_key UNIQUE (email)
);

-- ── 3. TOKEN LOGS ────────────────────────────────────────────────
-- One row per AI API call — cost tracking per user
CREATE TABLE IF NOT EXISTS token_logs (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  model         TEXT NOT NULL,
  input_tokens  INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens  >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  cost_usd      NUMERIC(10,6) NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4. CHAT LOGS ─────────────────────────────────────────────────
-- One row per agent session — full conversation record
CREATE TABLE IF NOT EXISTS chat_logs (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_email    TEXT,
  user_message  TEXT,
  ai_response   TEXT,
  tools_called  JSONB NOT NULL DEFAULT '[]',
  model         TEXT,
  session_id    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 5. AUTO-UPDATE updated_at TRIGGER ───────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ══════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY — every table locked down
-- The backend uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS.
-- The anon/authenticated keys used by any client cannot access
-- any table unless a policy explicitly allows it.
-- ══════════════════════════════════════════════════════════════

-- ── profiles ─────────────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can only read/update their own profile row
DROP POLICY IF EXISTS "profiles: user can select own row" ON profiles;
CREATE POLICY "profiles: user can select own row"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles: user can update own row" ON profiles;
CREATE POLICY "profiles: user can update own row"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Users cannot insert or delete profile rows (service_role only)
-- (no INSERT/DELETE policies = blocked for all non-service roles)

-- ── pending_activations ──────────────────────────────────────────
ALTER TABLE pending_activations ENABLE ROW LEVEL SECURITY;
-- No policies added = zero client access. Only service_role (backend) can read/write.

-- ── token_logs ───────────────────────────────────────────────────
ALTER TABLE token_logs ENABLE ROW LEVEL SECURITY;

-- Users can only see their own token log entries (read-only)
DROP POLICY IF EXISTS "token_logs: user can select own rows" ON token_logs;
CREATE POLICY "token_logs: user can select own rows"
  ON token_logs FOR SELECT
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policies = only service_role (backend) can write

-- ── chat_logs ────────────────────────────────────────────────────
ALTER TABLE chat_logs ENABLE ROW LEVEL SECURITY;

-- Users can only see their own chat history (read-only)
DROP POLICY IF EXISTS "chat_logs: user can select own rows" ON chat_logs;
CREATE POLICY "chat_logs: user can select own rows"
  ON chat_logs FOR SELECT
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policies = only service_role (backend) can write

-- ── 6. ADMIN STATS VIEW ──────────────────────────────────────────
DROP VIEW IF EXISTS user_stats;
CREATE VIEW user_stats
  WITH (security_invoker = true)
AS
SELECT
  p.id,
  p.email,
  p.lifetime_usage,
  p.monthly_usage,
  p.is_pro,
  p.lemon_subscription_id,
  p.created_at,
  COALESCE(SUM(tl.cost_usd), 0)::NUMERIC(12,6)            AS total_cost_usd,
  COALESCE(SUM(tl.input_tokens + tl.output_tokens), 0)     AS total_tokens,
  COUNT(DISTINCT cl.id)                                     AS total_chat_sessions
FROM profiles p
LEFT JOIN token_logs tl ON tl.user_id = p.id
LEFT JOIN chat_logs  cl ON cl.user_id = p.id
GROUP BY p.id, p.email, p.lifetime_usage, p.monthly_usage,
         p.is_pro, p.lemon_subscription_id, p.created_at
ORDER BY p.created_at DESC;

-- ══════════════════════════════════════════════════════════════
-- INDEXES for performance
-- ══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_token_logs_user_id   ON token_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_token_logs_created   ON token_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_logs_user_id    ON chat_logs  (user_id);
CREATE INDEX IF NOT EXISTS idx_chat_logs_created    ON chat_logs  (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_is_pro      ON profiles   (is_pro);
