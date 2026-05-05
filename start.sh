#!/bin/bash
cd /home/runner/workspace/backend
npm install --silent

cat > server.js << 'SERVEREOF'
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;
const ROOT = path.join(__dirname, '..');

app.use(cors({ origin: function(o,cb){cb(null,true);}, credentials: true }));

const webhookRouter = require('./routes/webhook');
app.use('/api/webhook', webhookRouter);

app.use(express.json({ limit: '2mb' }));

const authRouter = require('./routes/auth');
const chatRouter = require('./routes/chat');
const supabase   = require('./lib/supabase');
app.use('/api/auth', authRouter);
app.use('/api/chat', chatRouter);

app.get('/api/health', function(req, res) {
  res.json({ status: 'ok', version: '2.1.0', service: 'Shayntech Excel AI Pro' });
});

app.get('/api/admin/stats', async function(req, res) {
  var adminKey = process.env.ADMIN_KEY;
  if (!adminKey) return res.status(503).json({ error: 'Admin not configured. Set ADMIN_KEY secret.' });
  if (req.headers['x-admin-key'] !== adminKey)
    return res.status(401).json({ error: 'Unauthorized' });
  try {
    var { data, error } = await supabase.from('user_stats').select('*');
    if (error) throw error;
    res.json({ users: data });
  } catch (err) {
    console.error('[admin] stats error:', err.message);
    res.status(500).json({ error: 'Failed to load stats.' });
  }
});

app.get('/admin', function(req, res) { res.sendFile(path.join(ROOT, 'admin', 'index.html')); });
app.get('/', function(req, res) { res.sendFile(path.join(ROOT, 'taskpane.html')); });
app.get('/taskpane.html', function(req, res) { res.sendFile(path.join(ROOT, 'taskpane.html')); });
app.get('/manifest.xml', function(req, res) {