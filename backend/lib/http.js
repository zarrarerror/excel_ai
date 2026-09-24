// Express 4 does not forward rejected async handlers to its error middleware.
function asyncRouter(router) {
  for (const layer of router.stack) {
    if (!layer.route) continue;
    for (const handler of layer.route.stack) {
      const original = handler.handle;
      handler.handle = (req, res, next) => Promise.resolve().then(() => original(req, res, next)).catch(next);
    }
  }
  return router;
}
function rateLimit(limit, windowMs) {
  const clients = new Map();
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of clients) if (entry.until <= now) clients.delete(key);
  }, windowMs);
  cleanup.unref();
  return (req, res, next) => {
    const now = Date.now(), key = req.ip;
    let entry = clients.get(key);
    if (!entry || entry.until <= now) { entry = { count: 0, until: now + windowMs }; clients.set(key, entry); }
    if (++entry.count > limit) {
      res.set('Retry-After', String(Math.ceil((entry.until - now) / 1000)));
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }
    next();
  };
}
module.exports = { asyncRouter, rateLimit };
