const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');

router.post('/', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required.' });
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: 'https://aiexcel.replit.app/reset-password'
  });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
