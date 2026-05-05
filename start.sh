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
app.use('/api/auth', authRouter);
app.use('/api/chat', chatRouter);

app.get('/api/health', function(req, res) {
  res.json({ status: 'ok', version: '2.0.0', service: 'Shayntech Excel AI Pro' });
});

app.get('/', function(req, res) { res.sendFile(path.join(ROOT, 'taskpane.html')); });
app.get('/taskpane.html', function(req, res) { res.sendFile(path.join(ROOT, 'taskpane.html')); });
app.get('/manifest.xml', function(req, res) { res.sendFile(path.join(ROOT, 'manifest.xml')); });
app.get('/index.html', function(req, res) { res.sendFile(path.join(ROOT, 'index.html')); });

app.use(function(err, req, res, next) {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

app.listen(PORT, '0.0.0.0', function() {
  var ok = 'OK';
  var no = 'MISSING';
  console.log('Shayntech Excel AI Pro v2.0 running on port ' + PORT);
  console.log('Supabase:     ' + (process.env.SUPABASE_URL ? ok : no));
  console.log('OpenAI:       ' + (process.env.OPENAI_API_KEY ? ok : no + ' - add OPENAI_API_KEY to Secrets'));
  console.log('LemonSqueezy: ' + (process.env.LEMONSQUEEZY_WEBHOOK_SECRET ? ok : no));
});
SERVEREOF

node server.js
