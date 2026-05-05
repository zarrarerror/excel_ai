const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');

router.post('/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) {
    if (error.message.includes('already registered')) return res.status(409).json({ error: 'An account with this email already exists.' });
    return res.status(400).json({ error: error.message });
  }
  await supabase.from('profiles').upsert({ id: data.user.id, email: data.user.email, lifetime_usage: 0, is_pro: false });
  const { data: session, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) return res.status(500).json({ error: 'Account created but login failed. Please sign in.' });
  res.json({ token: session.session.access_token, user: { email: data.user.email, id: data.user.id } });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return res.status(401).json({ error: 'Invalid email or password.' });
  res.json({ token: data.session.access_token, user: { email: data.user.email, id: data.user.id } });
});

router.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Not authenticated.' });
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Invalid or expired session.' });
  const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  const freeLimit = parseInt(process.env.FREE_USES_LIMIT || '50');
  const proLimit  = parseInt(process.env.PRO_USES_LIMIT  || '1000');
  const isPro = p?.is_pro || false;
  const used  = p?.lifetime_usage || 0;
  if (isPro) {
    const mu = p?.monthly_usage || 0;
    const ra = p?.monthly_reset_at || new Date().toISOString();
    const nr = new Date(ra); nr.setMonth(nr.getMonth() + 1);
    return res.json({ email: user.email, id: user.id, is_pro: true, lifetime_usage: used, monthly_usage: mu, monthly_limit: proLimit, remaining: Math.max(0, proLimit - mu), resets_at: nr.toISOString() });
  }
  res.json({ email: user.email, id: user.id, is_pro: false, lifetime_usage: used, free_limit: freeLimit, remaining: Math.max(0, freeLimit - used) });
});

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required.' });
  const { error } = await supabase.auth.resetPasswo