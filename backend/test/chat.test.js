const test = require('node:test');
const assert = require('node:assert/strict');
const { validateChat, validateResponse } = require('../lib/chat-validation');
const tools = [{ type: 'function', function: { name: 'read_range', parameters: { type: 'object' } } }];
const response = (args = '{}') => ({ choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'read_range', arguments: args } }] } }] });
test('rejects empty histories, invalid roles and malformed content', () => {
  for (const messages of [[], [{ role: 'hacker', content: '' }], [{ role: 'user', content: 4 }]]) assert.throws(() => validateChat({ messages }));
});
test('allows bounded text and tools, rejects duplicate tools', () => {
  validateChat({ messages: [{ role: 'user', content: 'Read A1' }], tools });
  assert.throws(() => validateChat({ messages: [{ role: 'user', content: 'Read' }], tools: [...tools, ...tools] }), /Duplicate/);
});
test('rejects incomplete model output instead of running partial instructions', () => {
  const data = response(); data.choices[0].finish_reason = 'length';
  assert.throws(() => validateResponse(data, tools), /incomplete/);
});
test('rejects unknown tools, duplicate calls and invalid argument JSON', () => {
  assert.throws(() => validateResponse(response(), []), /unknown/);
  assert.throws(() => validateResponse(response('{'), tools));
  assert.throws(() => validateResponse(response('[]'), tools), /object/);
  const data = response(); data.choices[0].message.tool_calls.push(data.choices[0].message.tool_calls[0]);
  assert.throws(() => validateResponse(data, tools), /duplicate/);
});
test('accepts a complete known tool response', () => assert.equal(validateResponse(response(), tools).choices.length, 1));
