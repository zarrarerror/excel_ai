require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('node:path');
const fs = require('node:fs');
const { asyncRouter, rateLimit } = require('./lib/http');
const ROOT = path.join(__dirname, '..');
function publicOrigin() {
  const value = process.env.PUBLIC_URL || 'http://localhost:5000';
  const url = new URL(value);
  if (url.username || url.password || url.origin !== value || !['http:', 'https:'].includes(url.protocol)) throw new Error('PUBLIC_URL must be an origin without credentials, path or trailing slash.');
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') throw new Error('Production PUBLIC_URL must use HTTPS.');
  return url.origin;
}
function createApp() {
  const app = express();
  const origin = publicOrigin();
  const allowed = new Set([origin, ...(process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)]);
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY_HOPS) app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS));
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'no-referrer');
    // Office embeds the taskpane in an iframe; SAMEORIGIN would break Excel web.
    if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
    if (origin.startsWith('https:')) res.set('Strict-Transport-Security', 'max-age=31536000');
    next();
  });
  app.use(cors({ origin: (o, cb) => cb(null, !o || allowed.has(o)), credentials: false }));
  app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '2.1.0', service: 'Shayntech Excel AI Pro' }));
  app.get('/api/public-config', (req, res) => res.json({ supabaseUrl: process.env.SUPABASE_URL || '', supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '' }));
  app.use('/api/webhook', require('./routes/webhook'));
  app.use(express.json({ limit: '2mb' }));
  app.use('/api', (req, res, next) => {
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))) return res.status(400).json({ error: 'A JSON object is required.' });
    next();
  });
  app.use('/api/auth', rateLimit(30, 15 * 60 * 1000));
  app.use('/api/admin', rateLimit(30, 60 * 1000));
  app.use('/api/chat', rateLimit(120, 60 * 1000));
  app.use('/api/auth', asyncRouter(require('./routes/auth')));
  app.use('/api/auth/forgot-password', asyncRouter(require('./routes/auth-reset')));
  app.use('/api/chat', asyncRouter(require('./routes/chat')));
  app.use('/api/admin', asyncRouter(require('./routes/admin')));
  app.use(express.static(path.join(ROOT, 'public')));
  app.get(['/', '/index.html', '/taskpane.html'], (req, res) => res.sendFile(path.join(ROOT, 'addin', 'taskpane.html')));
  app.get('/agent-safety.js', (req, res) => res.sendFile(path.join(ROOT, 'addin', 'agent-safety.js')));
  app.get('/agent-runtime.js', (req, res) => res.sendFile(path.join(ROOT, 'addin', 'agent-runtime.js')));
  app.get('/manifest.xml', (req, res) => {
    const template = fs.readFileSync(path.join(ROOT, 'addin', 'manifest.xml'), 'utf8');
    res.type('application/xml').send(template.replaceAll('https://aiexcel.replit.app', origin));
  });
  app.get(['/reset-password', '/reset-password.html'], (req, res) => res.sendFile(path.join(ROOT, 'reset-password.html')));
  app.get(['/admin', '/admin/index.html'], (req, res) => res.sendFile(path.join(ROOT, 'admin', 'index.html')));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint not found.' }));
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = err.type === 'entity.too.large' ? 413 : err.type === 'entity.parse.failed' ? 400 : 500;
    console.error('[http]', status, err.name || 'Error');
    res.status(status).json({ error: status === 413 ? 'Request exceeds the 2 MB limit. Reduce context or attachment size.' : status === 400 ? 'Invalid JSON request.' : 'Internal server error.' });
  });
  return app;
}
if (require.main === module) {
  for (const name of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'OPENAI_API_KEY']) {
    if (!process.env[name]) throw new Error(name + ' must be configured.');
  }
  const server = createApp().listen(process.env.PORT || 5000, '0.0.0.0', () => console.log('Excel AI Pro listening'));
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  });
}
module.exports = { createApp, publicOrigin };
