const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');

function authCheck(req, res) {
  var adminKey = process.env.ADMIN_SECRET;
  if (!adminKey) { res.status(503).json({ error: 'ADMIN_SECRET not set.' }); return false; }
  if (req.headers['x-admin-key'] !== adminKey) { res.status(401).json({ error: 'Unauthorized' }); return false; }
  return true;
}

router.get('/stats', async function(req, res) {
  if (!authCheck(req, res)) return;
  try {
    var result = await supabase.from('user_stats').select('*');
    if (result.error) throw result.error;
    res.json({ users: result.data });
  } catch (err) {
    console.error('[admin] stats error:', err.message);
    res.status(500