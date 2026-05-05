const supabase = require('./supabase');
const FREE_LIMIT = parseInt(process.env.FREE_USES_LIMIT || '50');
const PRO_LIMIT  = parseInt(process.env.PRO_USES_LIMIT  || '1000');

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Not authenticated. Please log in.' });
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Session expired. Please log in again.' });
  req.user = user; next();
}

async function checkUsage(req, res, next) {
  const { data: profile } = await supabase.from('profiles')
    .select('lifetime_usage, monthly_usage, monthly_reset_at, is_pro').eq('id', req.user.id).single();
  const isPro = profile?.is_pro || false;
  const lifetimeUsed = profile?.lifetime_usage || 0;
  const now = new Date();
  if (isPro) {
    const resetAt = profile?.monthly_reset_at ? new Date(profile.monthly_reset_at) : now;
    const needsReset = now.getFullYear() > resetAt.getFullYear() || now.getMonth() > resetAt.getMonth();
    let monthlyUsed = needsReset ? 0 : (profile?.monthly_usage || 0);
    if (needsReset) await supabase.from('profiles').update({ monthly_usage: 0, monthly_reset_at: now.toISOString() }).eq('id', req.user.id);
    if (monthlyUsed >= PRO_LIMIT) return res.status(402).json({ error: 'pro_limit_reached', message: 'You have used all ' + PRO_LIMIT + ' Pro requests this month. Resets next month.', used: monthlyUsed, limit: PRO_LIMIT });
    req.profile = { isPro: true, lifetimeUsed, monthlyUsed };
  } else {
    if (lifetimeUsed >= FREE_LIMIT) return res.status(402).json({ error: 'free_limit_reached', message: 'You have used all ' + FREE_LIMIT + ' free requests. Upgrade to Pro to continue.', checkout_url: process.env.LEMONSQUEEZY_CHECKOUT_URL, used: lifetimeUsed, limit: FREE_LIMIT });
    req.profile = { isPro: false, lifetimeUsed, monthlyUsed: 0 };
  }
  next();
}

async function incrementUsage(userId, profile) {
  if (profile.isPro) {
    await supabase.from('profiles').update({ monthly_usage: (profile.monthlyUsed||0)+1, lifetime_usage: (profile.lifetimeUsed||0)+1 }).eq('id', userId);
  } else {
    await supabase.from('profiles').update({ lifetime_usage: (profile.lifetimeUsed||0)+1 }).eq('id', userId);
  }
}

async function logTokens(userId, model, inputTokens, outputTokens, costUsd) {
  try { await supabase.from('token_logs').insert({ user_id: userId, model, input_tokens: inputTokens, output_tokens: outputTokens, cost_usd: costUsd }); } catch(e) {}
}

module.exports = { requireAuth, checkUsage, incrementUsage, logTokens, FREE_LIMIT, PRO_LIMIT };
