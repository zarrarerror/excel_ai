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

app.use('/api/auth', authRouter);
app.use('/api/chat', chatRouter);

// Health check
app.get('/api/health', function(req, res) {
  res.json({ status: 'ok', version: '2.0.0', service: 'Shayntech Excel AI Pro' });
});

// Serve frontend files from project root
app.get('/', function(req, res) {
  res.sendFile(path.join(ROOT, 'taskpane.html'));
});
app.get('/taskpane.html', function(req, res) {
  res.sendFile(path.join(ROOT, 'taskpane.html'));
});
app.get('/manifest.xml', function(req, res) {
  res.sendFile(path.join(ROOT, 'manifest.xml'));
});
app.get('/index.html', function(req, res) {
  res.sendFile(path.join(ROOT, 'index.html'));
});

// Global error handler
app.use(function(err, req, res, next) {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

app.listen(PORT, '0.0.0.0', function() {
  var ok = 'OK';
  var no = 'MISSING';
  console.