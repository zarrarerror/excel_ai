const express = require('express');
const router = express.Router();

// Razorpay webhook — wired up when payment integration is ready
router.post('/', (req, res) => {
  res.status(501).json({ error: 'Payment webhooks are not configured. No subscription was changed.' });
});

module.exports = router;
