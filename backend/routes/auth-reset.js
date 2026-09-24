const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');

router.post('/', async (req, res) => {
  const { email } = req.body;
  if (typeof email !== 'string' || email.length > 254 || !email.includes('@')) return res.status(400).json({ error: 'A valid email is required.' });
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: (process.env.PUBLIC_URL || 'http://localhost:5000') + '/reset-password'
  });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
