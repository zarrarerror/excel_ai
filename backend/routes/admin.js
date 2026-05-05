const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');

router.get('/stats', async function(req, res) {
  var adminKey = process.env.ADMIN_SECRET;
  if (!adminKey) return res.status(503).json({ error: 'Admin not configured. Set ADMIN_SECRET secret.' });
  if (req.headers['x-admin-key'] !== adminKey)
    return res.status(401).json({ error: 'Unauthorized' });
  try {
    var result = await supabase.from('user_stats').select('*');
    if (result.error) throw result.error;
    res.json({ users: result.data });
  } catch (err) {
    console.error('[admin] stats error:', err.message);
    res.status(500).json({ error: 'Failed to load stats.' });
  }
});

module.exports = router;
