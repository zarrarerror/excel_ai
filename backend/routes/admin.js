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

module.exports = router;
