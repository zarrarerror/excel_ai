const test = require('node:test');
const assert = require('node:assert/strict');
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
process.env.PUBLIC_URL = 'https://excel.example.com';
process.env.NODE_ENV = 'test';
const { createApp } = require('../server');
let server, origin;
test.before(async () => {
  server = createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
});
test.after(() => new Promise(resolve => server.close(resolve)));
test('serves actual add-in assets and rewrites the manifest to the server domain', async () => {
  for (const route of ['/', '/taskpane.html', '/agent-safety.js', '/agent-runtime.js', '/icon.png', '/reset-password', '/admin']) assert.equal((await fetch(origin + route)).status, 200);
  const xml = await (await fetch(origin + '/manifest.xml')).text();
  assert.match(xml, /https:\/\/excel.example.com\/taskpane.html/);
  assert.doesNotMatch(xml, /replit.app/);
  assert.match(xml, /ExcelApi/);
});
test('health succeeds and public configuration never exposes the service key', async () => {
  const health = await fetch(origin + '/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.headers.get('cache-control'), 'no-store');
  assert.doesNotMatch(await (await fetch(origin + '/api/public-config')).text(), /test-service-role/);
});
test('CORS permits configured origin and omits permission for an unknown origin', async () => {
  for (const [o, expected] of [['https://excel.example.com', 'https://excel.example.com'], ['https://attacker.example', null]]) {
    const r = await fetch(origin + '/api/health', { headers: { Origin: o } });
    assert.equal(r.headers.get('access-control-allow-origin'), expected);
  }
});
test('invalid JSON and absent auth return actionable errors', async () => {
  const malformed = await fetch(origin + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400);
  const unauth = await fetch(origin + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(unauth.status, 401);
});
test('unconfigured payments do not return a false success', async () => {
  assert.equal((await fetch(origin + '/api/webhook', { method: 'POST' })).status, 501);
});
