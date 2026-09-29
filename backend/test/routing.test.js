const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ModelRouting = require('../../addin/model-routing');
const GeminiProtocol = require('../../addin/gemini-protocol');
const html = fs.readFileSync(require.resolve('../../addin/taskpane.html'), 'utf8').replace(/\r/g, '');
function source(name) {
  const start = html.search(new RegExp('^(?:async )?function ' + name + '\\(', 'm'));
  assert.notEqual(start, -1, name);
  const tail = html.slice(start); return tail.slice(0, tail.search(/^}/m) + 1);
}
function config() {
  return { mode: 'own', provider: 'openrouter', or: { key: 'or-secret', model: 'default-model' }, gm: { key: 'gm-secret', model: 'gemini-current' }, gq: { key: 'gq-secret', model: 'groq-current' }, routing: ModelRouting.normalize({ enabled: true, routes: {
    bulk: { provider: 'gemini', model: 'gemini-bulk' }, formula: { provider: 'groq', model: 'groq-formula' }, reasoning: { provider: 'openrouter', model: 'reasoning-model' }
  } }) };
}
function harness(cfg = config()) {
  const requests = [];
  const context = vm.createContext({ cfg, ModelRouting, GeminiProtocol, activeTaskRoute: null, activeAIRequest: null, agentRunning: false, stopRequested: false,
    AbortController, setTimeout, clearTimeout, URL, window: { location: { origin: 'https://excel.example.com' } },
    callProBackend: async () => { requests.push({ hosted: true }); return { content: 'hosted' }; },
    fetch: async (url, options) => {
      requests.push({ url, options, body: JSON.parse(options.body) });
      return { ok: true, json: async () => url.includes('googleapis') ? { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'OK' }] } }] } : { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'OK' } }] } };
    }
  });
  vm.runInContext(['normalizeMessage', 'normalizeMessages', 'callAI', 'callCompatible', 'requestProviderJSON', 'completeChatResponse', 'callOpenRouter', 'callGemini', 'callGroq', 'callClaude', 'callQwen', 'callOllama'].map(source).join('\n'), context);
  return { context, requests };
}

test('hosted default ignores personal routes; existing own-key settings keep the selected provider', () => {
  const cfg = config(); cfg.mode = 'hosted'; cfg.gm.key = '';
  assert.equal(ModelRouting.resolve(cfg, { command: 'Analyze many rows', override: 'bulk' }).mode, 'hosted');
  assert.doesNotThrow(() => ModelRouting.validate(cfg));
  cfg.mode = 'own'; delete cfg.routing;
  assert.equal(ModelRouting.resolve(cfg, { command: 'Analyze many rows' }).provider, 'openrouter');
});

test('Auto classifies user instructions and explicit overrides win for mixed tasks', () => {
  for (const [command, category] of [['Analyze 10,000 rows', 'bulk'], ['Clean duplicates in this CSV', 'bulk'], ['Write formulas for 1000 rows', 'formula'], ['=SUM(A1:A3)', 'formula'], ['Debug a VBA macro', 'reasoning'], ['Format the header blue', 'general']]) {
    assert.equal(ModelRouting.classify({ command }), category);
  }
  assert.equal(ModelRouting.classify({ command: 'Analyze rows', mode: 'formula' }), 'formula');
  assert.equal(ModelRouting.classify({ command: 'Write a formula', mode: 'formula', override: 'bulk' }), 'bulk');
  assert.equal(ModelRouting.classify({ command: 'Format headers', workbookText: 'Write VBA code' }), 'general');
});

test('route snapshots keep provider/model/credentials fixed and missing keys cannot fall back', () => {
  const cfg = config(), route = ModelRouting.resolve(cfg, { command: 'Analyze rows' });
  cfg.gm.key = 'changed'; cfg.gm.model = 'changed'; cfg.routing.routes.bulk.provider = 'groq';
  assert.equal(route.config.key, 'gm-secret'); assert.equal(route.config.model, 'gemini-bulk'); assert.equal(route.provider, 'gemini');
  cfg.routing.routes.bulk.provider = 'gemini'; cfg.gm.key = '';
  assert.throws(() => ModelRouting.resolve(cfg, { command: 'Analyze rows' }), /Gemini API key/);
  assert.throws(() => ModelRouting.validate(cfg), /Gemini API key/);
  cfg.gm.key = 'test'; cfg.routing.routes.bulk.provider = 'unrecognized';
  assert.throws(() => ModelRouting.resolve(cfg, { override: 'bulk' }), /supported provider/);
});

test('real provider adapters send the selected model and only its own key to the correct endpoint', async () => {
  const { context, requests } = harness();
  for (const category of ['bulk', 'formula', 'reasoning']) {
    const route = ModelRouting.resolve(context.cfg, { override: category });
    const result = await context.callAI([{ role: 'user', content: 'OK' }], [], route);
    assert.equal(result.content, 'OK');
  }
  assert.equal(requests[0].url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-bulk:generateContent');
  assert.equal(requests[0].options.headers['x-goog-api-key'], 'gm-secret');
  assert.equal(requests[1].url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(requests[1].body.model, 'groq-formula'); assert.equal(requests[1].options.headers.Authorization, 'Bearer gq-secret');
  assert.equal(requests[2].body.model, 'reasoning-model'); assert.equal(requests[2].options.headers.Authorization, 'Bearer or-secret');
  assert.equal(requests[2].options.headers['HTTP-Referer'], 'https://excel.example.com');
  for (const [index, secret] of [[0, 'gm-secret'], [1, 'gq-secret'], [2, 'or-secret']]) {
    const serialized = JSON.stringify(requests[index]);
    for (const other of ['gm-secret', 'gq-secret', 'or-secret'].filter(key => key !== secret)) assert.ok(!serialized.includes(other));
    assert.ok(!JSON.stringify(requests[index].body).includes(secret));
  }
  assert.ok(!requests.some(r => r.hosted));
});

test('planning and subsequent calls use the locked route; provider failure does not call another service', async () => {
  const { context, requests } = harness();
  context.activeTaskRoute = ModelRouting.resolve(context.cfg, { override: 'formula' });
  context.cfg.provider = 'gemini'; context.cfg.gq.model = 'edited-after-start';
  await context.callAI([{ role: 'user', content: 'Plan' }], []);
  await context.callAI([{ role: 'user', content: 'Continue' }], []);
  assert.ok(requests.every(r => r.body.model === 'groq-formula'));
  context.fetch = async () => ({ ok: false, status: 429 });
  await assert.rejects(context.callAI([{ role: 'user', content: 'Continue' }], []), /Groq.*429/);
  assert.equal(requests.length, 2);
});

test('Gemini preserves signatures and matches parallel tool result names and IDs on continuation', () => {
  const parts = [{ text: 'Thinking', thought: true, thoughtSignature: 'signature-text' },
    { functionCall: { name: 'read_range', args: { range: 'A1' }, id: 'call-1' }, thoughtSignature: 'signature-tool' },
    { functionCall: { name: 'inspect_formula', args: { cell: 'B1' }, id: 'call-2' } }];
  const message = GeminiProtocol.response({ candidates: [{ finishReason: 'STOP', content: { parts } }] });
  assert.equal(message.content, null);
  const body = GeminiProtocol.request([{ role: 'user', content: 'Analyze rows' }, message,
    { role: 'tool', tool_call_id: 'call-1', content: '[1]' }, { role: 'tool', tool_call_id: 'call-2', content: '2' }], []);
  assert.deepEqual(body.contents[1].parts, parts);
  assert.deepEqual(body.contents[2].parts.map(p => [p.functionResponse.name, p.functionResponse.id]), [['read_range', 'call-1'], ['inspect_formula', 'call-2']]);
  assert.equal(body.contents.length, 3);
  assert.throws(() => GeminiProtocol.request([{ role: 'tool', tool_call_id: 'unknown', content: '' }]), /matching call/);
});

test('incomplete responses cannot produce workbook actions, and Gemini keeps image parts', () => {
  const { context } = harness();
  assert.throws(() => context.completeChatResponse({ choices: [{ finish_reason: 'length', message: { tool_calls: [{}] } }] }, 'Groq'), /incomplete/);
  assert.throws(() => GeminiProtocol.response({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ functionCall: { name: 'write_range' } }] } }] }), /incomplete/);
  const body = GeminiProtocol.request([{ role: 'user', content: [{ type: 'text', text: 'Read image' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } }] }], []);
  assert.deepEqual(body.contents[0].parts[1], { inlineData: { mimeType: 'image/png', data: 'abc' } });
});
