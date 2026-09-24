const test = require('node:test');
const assert = require('node:assert/strict');
// Mock only the network boundary; execute the real provider adapter.
let reply, calls = 0;
require.cache[require.resolve('node-fetch')] = { id: require.resolve('node-fetch'), filename: require.resolve('node-fetch'), loaded: true, exports: async () => { calls++; return reply; } };
const { callOpenAI } = require('../lib/openai');
test('400 tool errors never silently fall back to text-only generation', async () => {
  reply = { ok: false, status: 400, json: async () => ({ error: { message: 'secret upstream details' } }) };
  calls = 0;
  const result = await callOpenAI({ tools: [{}], messages: [] });
  assert.equal(calls, 1);
  assert.equal(result._status, 502);
  assert.equal(result._retryWithoutTools, undefined);
  assert.doesNotMatch(result._error, /secret/);
});
test('invalid provider JSON returns an actionable service error', async () => {
  reply = { json: async () => { throw new SyntaxError('HTML gateway'); } };
  assert.equal((await callOpenAI({}))._status, 502);
  reply = { ok: false, status: 400, json: async () => null };
  assert.equal((await callOpenAI({}))._status, 502);
});
test('object tool arguments normalize to JSON for the next turn', async () => {
  reply = { ok: true, json: async () => ({ choices: [{ message: { tool_calls: [{ function: { arguments: { sheet: 'Data' } } }] } }] }) };
  const result = await callOpenAI({});
  assert.equal(result.choices[0].message.tool_calls[0].function.arguments, '{"sheet":"Data"}');
});
