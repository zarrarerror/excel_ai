const express = require('express');
const router = express.Router();
const sb = require('../lib/supabase');

function ok(q, p) {
  var k = process.env.ADMIN_SECRET;
  if (!k) {
    p.status(503).json({ error: 'no secret' });
    return false;
  }
  var h = q.headers['x-admin-key'];
  if (h !== k) {
    p.status(401).json({ error: 'unauthorized' });
    return false;
  }
  return true;
}

router.get('/stats', async function(q, p) {
  if (!ok(q, p)) return;
  try {
    var r = await sb.from('user_stats').select('*');
    if (r.error) throw r.error;
    p.json({ users: r.data });
  } catch (e) {
    p.status(500).json({ error: e.message });
  }
});

router.get('/tokens', async function(q, p) {
  if (!ok(q, p)) return;
  try {
    var sel = 'id,model,input_tokens,output_tokens';
    sel += ',cost_usd,created_at,profiles(email)';
    var r = await sb.from('token_logs')
      .select(sel)
      .order('created_at', { ascending: false })
      .limit(500);
    if (r.error) throw r.error;
    var rows = (r.data || []).map(function(x) {
      return {
        id: x.id,
        email: x.profiles ? x.profiles.email : '?',
        model: x.model,
        input_tokens: x.input_tokens,
        output_tokens: x.output_tokens,
        total_tokens: x.input_tokens + x.output_tokens,
        cost_usd: x.cost_usd,
        created_at: x.created_at
      };
    });
    p.json({ logs: rows });
  } catch (e) {
    p.status(500).json({ error: e.message });
  }
});

// Manual activation after the owner confirms an offline payment. No quota reset.
router.post('/plan', async (req, res) => {
  if (!ok(req, res)) return;
  const { email, is_pro } = req.body;
  if (typeof email !== 'string' || !email.includes('@') || email.length > 254 || typeof is_pro !== 'boolean') return res.status(400).json({ error: 'Provide an account email and an explicit plan status.' });
  const { data, error } = await sb.from('profiles').update({ is_pro }).eq('email', email.trim().toLowerCase()).select('id,email,is_pro');
  if (error) return res.status(503).json({ error: 'Plan update failed.' });
  if (data?.length !== 1) return res.status(404).json({ error: 'Account not found.' });
  res.json({ user: data[0] });
});

module.exports = router;
