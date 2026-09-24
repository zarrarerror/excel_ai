const supabase = require('./supabase');
function limit(name, fallback) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(name + ' must be a positive integer.');
  return value;
}
const FREE_LIMIT = limit('FREE_USES_LIMIT', 50);
const PRO_LIMIT = limit('PRO_USES_LIMIT', 1000);
async function requireAuth(req, res, next) {
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '');
  if (!match) return res.status(401).json({ error: 'Not authenticated. Please log in.' });
  try {
    const { data, error } = await supabase.auth.getUser(match[1]);
    if (error || !data?.user) return res.status(401).json({ error: 'Session expired. Please log in again.' });
    req.user = data.user;
    next();
  } catch (error) { next(error); }
}
async function checkUsage(req, res, next) {
  try {
    const { data, error } = await supabase.rpc('consume_ai_usage', { p_user_id: req.user.id, p_free_limit: FREE_LIMIT, p_pro_limit: PRO_LIMIT });
    if (error || !data || typeof data.allowed !== 'boolean') return res.status(503).json({ error: 'Usage service unavailable. Check that the database migration has been applied.' });
    if (!data.allowed) return res.status(402).json({ error: data.isPro ? 'pro_limit_reached' : 'free_limit_reached', message: 'Your AI request limit has been reached.', used: data.used, limit: data.limit });
    req.profile = data;
    next();
  } catch (error) { next(error); }
}
async function logTokens(userId, model, inputTokens, outputTokens, costUsd) {
  try {
    const { error } = await supabase.from('token_logs').insert({ user_id: userId, model, input_tokens: inputTokens, output_tokens: outputTokens, cost_usd: costUsd });
    if (error) console.error('[usage] Token accounting unavailable');
  } catch (error) { console.error('[usage] Token accounting unavailable'); }
}
module.exports = { requireAuth, checkUsage, logTokens, FREE_LIMIT, PRO_LIMIT };
