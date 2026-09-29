(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ModelRouting = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const providers = { openrouter: ['OpenRouter', 'or'], gemini: ['Gemini', 'gm'], groq: ['Groq', 'gq'], claude: ['Claude', 'cl'], qwen: ['Qwen', 'qw'], ollama: ['Ollama', 'ol'], compatible: ['OpenAI-compatible', 'compatible'] };
  const categories = { general: 'General tasks', bulk: 'Bulk data / many rows', formula: 'Formulas', reasoning: 'Reasoning / coding' };
  function normalize(value) {
    const result = { enabled: value?.enabled === true, routes: {} };
    for (const category of Object.keys(categories)) {
      const route = value?.routes?.[category];
      result.routes[category] = { provider: typeof route?.provider === 'string' ? route.provider : 'default', model: typeof route?.model === 'string' ? route.model.trim() : '' };
    }
    return result;
  }
  function classify(task = {}) {
    if (task.override && task.override !== 'auto') {
      if (!Object.prototype.hasOwnProperty.call(categories, task.override)) throw new Error('Choose a valid task route.');
      return task.override;
    }
    const command = String(task.command || '').toLowerCase();
    if (task.mode === 'formula') return 'formula';
    // Only user instructions drive Auto. Never classify workbook cells or tool output.
    if (/\b(vba|macro|macros|python|javascript|coding|code|debug|reasoning|complex|multi[- ]step|algorithm)\b|برمج|كود|ماكرو/.test(command)) return 'reasoning';
    if (/\b(formulas?|sumifs?|sumproduct|xlookup|vlookup|hlookup|countifs?|index\s*\/\s*match)\b|معادل/.test(command) || /^\s*=/.test(command)) return 'formula';
    if (/\b(bulk|batch|rows?|dataset|csv|deduplicat\w*|duplicates?|clean\w*|summari[sz]\w*|analy[sz]\w*|processing)\b|صفوف|تنظيف|تحليل|تلخيص/.test(command)) return 'bulk';
    return 'general';
  }
  function resolve(cfg, task = {}) {
    if (cfg.mode !== 'own') return Object.freeze({ mode: 'hosted', category: 'general', label: 'Shayntech default' });
    const routing = normalize(cfg.routing);
    const category = routing.enabled ? classify(task) : 'general';
    const route = routing.enabled ? routing.routes[category] : { provider: 'default', model: '' };
    const provider = route.provider === 'default' ? cfg.provider : route.provider;
    if (!Object.prototype.hasOwnProperty.call(providers, provider)) throw new Error('Choose a supported provider for ' + categories[category] + ' in Settings.');
    const [label, key] = providers[provider];
    const config = { ...cfg[key], model: (route.model || cfg[key]?.model || '').trim() };
    if (!config.model || config.model.length > 200 || /[\s?#]/.test(config.model)) throw new Error(label + ': enter a valid model ID in Settings.');
    if (provider !== 'ollama' && !config.key?.trim()) throw new Error(label + ' API key is missing. Add it in Settings for ' + categories[category] + '.');
    if (provider === 'ollama' && !config.url) throw new Error('Enter your Ollama URL in Settings.');
    return Object.freeze({ mode: 'own', category, provider, config: Object.freeze(config), label: label + ' / ' + config.model });
  }
  function validate(cfg) {
    const routing = normalize(cfg.routing);
    if (cfg.mode !== 'own') return;
    for (const category of routing.enabled ? Object.keys(categories) : ['general']) resolve(cfg, { override: category });
  }
  return { providers, categories, normalize, classify, resolve, validate };
});
