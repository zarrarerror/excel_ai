const test = require('node:test');
const assert = require('node:assert/strict');
const { createAdapters } = require('../lib/frontend-adapters');
const ModelRouting = require('../../addin/model-routing');
const ProviderChecks = require('../../addin/provider-checks');
const first = { role: 'assistant', content: null, tool_calls: [{ id: 'check-1', type: 'function', function: { name: 'verify_sample', arguments: '{"total":12,"formula":"=SUM(A1:A3)"}' } }] };
const last = { role: 'assistant', content: 'SAMPLE_CHECK_PASSED_12' };
function config(provider) {
  return { mode: 'own', provider, [ModelRouting.providers[provider][1]]: { key: provider + '-test-secret', model: 'test-model', url: 'https://example-provider.test/v1' } };
}
for (const provider of Object.keys(ModelRouting.providers)) {
  test(provider + ': real adapter passes two-step probe with a mocked service; model/key stay correct', async () => {
    let calls = 0;
    const cfg = config(provider);
    const adapters = createAdapters(cfg, async (url, options) => {
      calls++; const body = JSON.parse(options.body);
      const continuation = calls === 2;
      assert.equal(options.headers['x-goog-api-key'] || options.headers['x-api-key'] || options.headers.Authorization, ['gemini', 'claude'].includes(provider) ? provider + '-test-secret' : 'Bearer ' + provider + '-test-secret');
      if (provider !== 'gemini') assert.equal(body.model, 'test-model');
      if (continuation) assert.match(JSON.stringify(body), /SAMPLE_CHECK_PASSED_12/);
      let data;
      if (provider === 'gemini') {
        if (continuation) assert.match(JSON.stringify(body), /test-signature/);
        data = { candidates: [{ finishReason: 'STOP', content: { parts: continuation ? [{ text: last.content }] : [{ thoughtSignature: 'test-signature', functionCall: { name: 'verify_sample', args: { total: 12, formula: '=SUM(A1:A3)' }, id: 'check-1' } }] } }] };
      } else if (provider === 'claude') data = { stop_reason: continuation ? 'end_turn' : 'tool_use', content: continuation ? [{ type: 'text', text: last.content }] : [{ type: 'tool_use', id: 'check-1', name: 'verify_sample', input: { total: 12, formula: '=SUM(A1:A3)' } }] };
      else data = { choices: [{ finish_reason: continuation ? 'stop' : 'tool_calls', message: continuation ? last : first }] };
      return { ok: true, json: async () => data };
    });
    const result = await ProviderChecks.run(adapters.callAI, ModelRouting.resolve(cfg));
    assert.equal(result.ok, true); assert.equal(calls, 2);
  });
  test(provider + ': rejection stops without text-only fallback or a second provider', async () => {
    let calls = 0; const cfg = config(provider);
    const adapters = createAdapters(cfg, async () => { calls++; return { ok: false, status: 400 }; });
    await assert.rejects(ProviderChecks.run(adapters.callAI, ModelRouting.resolve(cfg)), /HTTP 400/);
    assert.equal(calls, 1);
  });
}
test('model check rejects wrong calculations, unsupported tools, broken continuation and cancellation', async () => {
  await assert.rejects(ProviderChecks.run(async () => last, {}), /Tool check failed/);
  const wrong = JSON.parse(JSON.stringify(first)); wrong.tool_calls[0].function.arguments = '{"total":13,"formula":"=SUM(A1:A3)"}';
  await assert.rejects(ProviderChecks.run(async () => wrong, {}), /incorrect total/);
  let calls = 0;
  await assert.rejects(ProviderChecks.run(async () => ++calls === 1 ? first : { content: 'I did it' }, {}), /Continuation/);
  calls = 0;
  await assert.rejects(ProviderChecks.run(async () => { calls++; return first; }, {}, () => true), /stopped/);
  assert.equal(calls, 0);
});

test('Claude and Ollama reject truncated output; invalid JSON and cancellations are actionable', async () => {
  for (const [provider, response] of [
    ['claude', { stop_reason: 'max_tokens', content: [{ type: 'text', text: 'partial' }] }],
    ['ollama', { done: true, done_reason: 'length', message: { content: 'partial' } }]
  ]) {
    const cfg = config(provider), adapters = createAdapters(cfg, async () => ({ ok: true, json: async () => response }));
    await assert.rejects(adapters.callAI([{ role: 'user', content: 'test' }], []), /incomplete/);
  }
  const cfg = config('compatible');
  const broken = createAdapters(cfg, async () => ({ ok: true, json: async () => { throw new SyntaxError('Private raw response'); } }));
  await assert.rejects(broken.callAI([], []), error => /invalid response/.test(error.message) && !/Private/.test(error.message));
  const cancelled = createAdapters(cfg, async () => { const error = new Error(); error.name = 'AbortError'; throw error; });
  cancelled.stopRequested = true;
  await assert.rejects(cancelled.callAI([], []), /Stopped by user/);
});
