require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// Project root is one level up from backend/
const ROOT = path.join(__dirname, '..');

app.use(cors({
  origin: function(origin, callback) {
    return callback(null, true);
  },
  credentials: true
}));

// Webhook route must come BEFORE express.json() (needs raw body)
const webhookRouter = require('./routes/webhook');
app.use('/api/webhook', webhookRouter);

// JSON middleware for all other routes
app.use(express.json({ limit: '2mb' }));

// API Routes
const authRouter = require('./routes/auth');
const chatRouter = require('./routes/chat');
const supabase    = require('./lib/supabase');

app.use('/api/auth', authRouter);
app.use('/api/chat', chatRouter);

// Health check
app.get('/api/health', function(req, res) {
  res.json({ status: 'ok', version: '2.0.0', service: 'Shayntech Excel AI Pro' });
});

// ── Admin API — secured by ADMIN_SECRET env var ──────────────────────
app.get('/api/admin/stats', async function(req, res) {
  var adminKey = process.env.ADMIN_SECRET;
  if (!adminKey) return res.status(503).json({ error: 'Admin not configured. Set ADMIN_SECRET secret.' });
  if (req.headers['x-admin-key'] !== adminKey)
    return res.status(401).json({ error: 'Unauthorized' });

  try {
    var { data, error } = await supabase.from('user_stats').select('*');
    if (error) throw error;
    res.json({ users: data });
  } catch (err) {
    console.error('[admin] stats error:', err.message);
