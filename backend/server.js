require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;
const ROOT = path.join(__dirname, '..');

app.use(cors({ origin: function(o, cb) { cb(null, true); }, credentials: true }));

app.use('/api/webhook', require('./routes/webhook'));
app.use(express.json({ limit: '2mb' }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/auth/forgot-password', require('./routes/auth-reset'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/admin', require('./routes/admin'));

app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '1.0.0', service: 'Shayntech Excel AI Pro' }));

// Serve static public folder (pricing, terms, privacy, refund)
app.use(express.static(path.join(ROOT, 'public')));

// Named file routes — all files are at project root
app.get('/',               (req, res) => res.sendFile(path.join(ROOT, 'taskpane.html')));
app.get('/taskpane.html',  (req, res) => res.sendFile(path.join(ROOT, 'taskpane.html')));
app.get('/manifest.xml',   (req, res) => res.sendFile(path.join(ROOT, 'manifest.xml')));
app.get('/index.html',     (req, res) => res.sendFile(path.join(ROOT, 'index.html')));
app.get('/reset-password', (req, res) => res.sendFile(path.join(ROOT, 'reset-password.html')));
app.get('/reset-password.html', (req, res) => res.sendFile(path.join(ROOT, 'reset-password.html')));
app.get('/admin',          (req, res) => res.sendFile(path.join(ROOT, 'admin', 'index.html')));
app.get('/admin/index.html', (req, res) => res.sendFile(path.join(ROOT, 'admin', 'index.html')));

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Shayntech Excel AI Pro backend running on port ${PORT}`);
  console.log(`   Supabase: ${process.env.SUPABASE_URL ? '✓ configured' : '✗ MISSING'}`);
  console.log(`   Qwen API: ${process.env.QWEN_API_KEY ? '✓ configured' : '✗ MISSING'}`);
  console.log(`   LemonSqueezy: ${process.env.LEMONSQUEEZY_WEBHOOK_SECRET ? '✓ configured' : '✗ MISSING'}`);
});
