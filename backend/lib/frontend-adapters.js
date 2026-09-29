// Diagnostic harness: executes the shipped adapters with a supplied network boundary.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ModelRouting = require('../../addin/model-routing');
const GeminiProtocol = require('../../addin/gemini-protocol');
function createAdapters(cfg, request = fetch) {
  const html = fs.readFileSync(path.join(__dirname, '../../addin/taskpane.html'), 'utf8').replace(/\r/g, '');
  function source(name) {
    const start = html.search(new RegExp('^(?:async )?function ' + name + '\\(', 'm'));
    if (start < 0) throw new Error('Diagnostic adapter is missing.');
    const tail = html.slice(start); return tail.slice(0, tail.search(/^}/m) + 1);
  }
  const context = vm.createContext({ cfg, ModelRouting, GeminiProtocol, activeTaskRoute: null, activeAIRequest: null, agentRunning: false, stopRequested: false,
    AbortController, setTimeout, clearTimeout, URL, window: { location: { origin: 'https://excel-ai.shayntech.com' } }, fetch: request,
    callProBackend: () => { throw new Error('Hosted account requests are excluded from this diagnostic.'); }
  });
  vm.runInContext(['normalizeMessage', 'normalizeMessages', 'callAI', 'callCompatible', 'requestProviderJSON', 'completeChatResponse', 'callOpenRouter', 'callGemini', 'callGroq', 'callClaude', 'callQwen', 'callOllama'].map(source).join('\n'), context);
  return context;
}
module.exports = { createAdapters };
