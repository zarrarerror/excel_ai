(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ProviderChecks = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const tool = { type: 'function', function: {
    name: 'verify_sample', description: 'Check the total and Excel formula for synthetic sample values. Does not access a workbook.',
    parameters: { type: 'object', properties: { total: { type: 'number' }, formula: { type: 'string' } }, required: ['total', 'formula'], additionalProperties: false }
  } };
  async function run(call, route, stopped = () => false) {
    if (stopped()) throw new Error('Test stopped.');
    const messages = [{ role: 'system', content: 'This is a tool protocol test using synthetic data. Follow the requested response format exactly.' },
      { role: 'user', content: 'Synthetic cells A1=2, A2=3, A3=7. Call verify_sample once with their numeric total and exactly the formula =SUM(A1:A3). Do not answer in text yet.' }];
    const first = await call(messages, [tool], route);
    if (stopped()) throw new Error('Test stopped.');
    if (first?.tool_calls?.length !== 1 || first.tool_calls[0].function?.name !== 'verify_sample' || !first.tool_calls[0].id) throw new Error('Tool check failed: the model did not return the requested function call. Choose a model with tool support.');
    const tc = first.tool_calls[0];
    let args;
    try { args = JSON.parse(tc.function.arguments); } catch (_) { throw new Error('Tool check failed: invalid function arguments.'); }
    if (args.total !== 12 || args.formula?.replace(/\s/g, '').toUpperCase() !== '=SUM(A1:A3)') throw new Error('Sample check failed: incorrect total or formula.');
    messages.push(first, { role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ verified: true, total: 12, receipt: 'SAMPLE_CHECK_PASSED_12' }) },
      { role: 'user', content: 'The test is complete. Reply only with the exact receipt from the tool result. Do not call another tool.' });
    const second = await call(messages, [tool], route);
    if (stopped()) throw new Error('Test stopped.');
    if (second?.tool_calls?.length || second?.content?.trim() !== 'SAMPLE_CHECK_PASSED_12') throw new Error('Continuation check failed: the model did not correctly use the tool result.');
    return { ok: true, checks: ['sample total', 'Excel formula', 'tool arguments', 'two-step continuation'] };
  }
  return { run };
});
