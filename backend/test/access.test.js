const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { providerConfig } = require('../lib/provider');
test('DeepSeek hosted mode uses only the DeepSeek secret; OpenAI remains optional', () => {
  const d = providerConfig({ DEEPSEEK_API_KEY: 'deepseek-test', OPENAI_API_KEY: 'other-test' });
  assert.equal(d.key, 'deepseek-test');
  assert.equal(d.url, 'https://api.deepseek.com/chat/completions');
  assert.equal(providerConfig({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'openai-test' }).key, 'openai-test');
  assert.throws(() => providerConfig({ AI_PROVIDER: 'unknown' }));
});
const html = fs.readFileSync(require.resolve('../../addin/taskpane.html'), 'utf8');
const dispatch = html.slice(html.indexOf('async function callAI('), html.indexOf('async function callCompatible('));
test('own-key mode never calls the hosted quota backend, for every supported provider', async () => {
  for (const provider of ['openrouter', 'gemini', 'groq', 'claude', 'qwen', 'ollama', 'compatible']) {
    let own = 0, hosted = 0;
    const c = { cfg: { mode: 'own', provider }, normalizeMessages: m => m, callProBackend: () => { hosted++; } };
    for (const name of ['OpenRouter', 'Gemini', 'Groq', 'Claude', 'Qwen', 'Ollama', 'Compatible']) c['call' + name] = async () => { own++; return { content: 'OK' }; };
    vm.createContext(c); vm.runInContext(dispatch, c);
    assert.equal((await c.callAI([{ role: 'user', content: 'hello' }], [])).content, 'OK');
    assert.equal(own, 1); assert.equal(hosted, 0);
    c.cfg.mode = 'hosted'; await c.callAI([], []); assert.equal(hosted, 1);
  }
});
test('manual upgrade endpoint requires an administrator and rejects invalid plan input', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service';
  process.env.ADMIN_SECRET = 'test-admin';
  const { createApp } = require('../server');
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  try {
    const url = 'http://127.0.0.1:' + server.address().port + '/api/admin/plan';
    assert.equal((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
    assert.equal((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-key': 'test-admin' }, body: JSON.stringify({ email: 'client@example.com', is_pro: 'true' }) })).status, 400);
  } finally { await new Promise(r => server.close(r)); }
});
