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

app.get('/api/health', function(req, res) { res.json({ status: 'ok', version: '2.1.0', service: 'Shayntech Excel AI Pro' }); });
app.get('/admin', function(req, res) { res.sendFile(path.join(ROOT, 'admin', 'index.html')); });
app.get('/', function(req, res) { res.sendFile(path.join(ROOT, 'taskpane.html')); });
app.get('/taskpane.html', function(req, res) { res.sendFile(path.join(ROOT, 'taskpane.html')); });
app.get('/manifest.xml', function(req, res) { res.sendFile(path.join(ROOT, 'manifest.xml')); });
app.get('/index.html', function(req, res) { res.sendFile(path.join(ROOT, 'index.html')); });
app.use(function(err, req, res, next) { res.status(500).json({ error: 'Internal server error.' }); });

app.listen(PORT, '0.0.0.0', function() {
  var ok = 'OK', no = 'MISSING';
  console.log('Shayntech Excel AI Pro v2.1 running on port ' + PORT);
  console.log('Supabase: ' + (process.env.SUPABASE_URL ? ok : no));
  console.log('OpenAI:   ' + (process.env.OPENAI_API_KEY ? ok : no));
  console.log('Admin:    ' + (process.env.A