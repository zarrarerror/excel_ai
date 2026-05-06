const express = require('express');
const router = express.Router();

// Razorpay webhook — wired up when payment integration is ready
router.post('/', (req, res) => {
  console.log('[webhook] received:', req.headers['x-razorpay-event-id'] || 'unknown');
  res.json({ ok: true });
});

module.exports = router;
