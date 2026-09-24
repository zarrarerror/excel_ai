const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { createClient } = require('@supabase/supabase-js');
const loginClient = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

router.post('/register', async (req, res) => {
  const { email, password } = req.body;
  if (typeof email !== 'string' || email.length > 254 || !email.includes('@') || typeof password !== 'string' || password.length > 1024 || !password) return res.status(400).json({ error: 'Email and password are required.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) {
    if (error.message.includes('already registered')) return res.status(409).json({ error: 'An account with this email already exists.' });
    return res.status(400).json({ error: error.message });
  }
  const { error: profileError } = await supabase.from('profiles').upsert({ id: data.user.id, email: data.user.email, lifetime_usage: 0, is_pro: false });
  if (profileError) return res.status(503).json({ error: 'Account profile could not be created. Contact the administrator.' });
  const { data: session, error: signInError } = await loginClient().auth.signInWithPassword({ email, password });
  if (signInError) return res.status(500).json({ error: 'Account created but login failed. Please sign in.' });
  res.json({ token: session.session.access_token, user: { email: data.user.email, id: data.user.id } });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (typeof email !== 'string' || email.length > 254 || !email.includes('@') || typeof password !== 'string' || password.length > 1024 || !password) return res.status(400).json({ error: 'Email and password are required.' });
  const { data, error } = await loginClient().auth.signInWithPassword({ email, password });
  if (error) return res.status(401).json({ error: 'Invalid email or password.' });
  res.json({ token: data.session.access_token, user: { email: data.user.email, id: data.user.id } });
});

router.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Not authenticated.' });
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Invalid or expired session.' });
  const { data: p, error: profileError } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (profileError || !p) return res.status(503).json({ error: 'Account profile unavailable.' });
  const freeLimit = parseInt(process.env.FREE_USES_LIMIT || '50');
  const proLimit  = parseInt(process.env.PRO_USES_LIMIT  || '1000');
  const isPro = p?.is_pro || false;
  const used  = p?.lifetime_usage || 0;
  if (isPro) {
    const now = new Date();
    const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    const mu = new Date(p.monthly_reset_at).getTime() < monthStart ? 0 : p.monthly_usage;
    const nr = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return res.json({ email: user.email, id: user.id, is_pro: true, lifetime_usage: used, monthly_usage: mu, monthly_limit: proLimit, remaining: Math.max(0, proLimit - mu), resets_at: nr.toISOString() });
  }
  res.json({ email: user.email, id: user.id, is_pro: false, lifetime_usage: used, free_limit: freeLimit, remaining: Math.max(0, freeLimit - used) });
});

module.exports = router;
