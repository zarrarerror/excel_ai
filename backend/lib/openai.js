const fetch = require('node-fetch');

const OPENAI_URL  = 'https://api.openai.com/v1/chat/completions';
const MODEL_FAST  = process.env.OPENAI_MODEL_FAST  || 'gpt-4o-mini';
const MODEL_HEAVY = process.env.OPENAI_MODEL_HEAVY || 'gpt-4o';
const MODEL_COSTS = {
  'gpt-4o-mini': { input: 0.000150, output: 0.000600 },
  'gpt-4o':      { input: 0.002500, output: 0.010000 },
};
const COMPLEX_KEYWORDS = [
  'vba','macro','pivot','extract','pdf','dashboard','automate',
  'complex','advanced','regression','forecast','solver','analysis'
];

function routeModel(messages, hasAttachment, attachmentType) {
  if (hasAttachment && attachmentType === 'image') return MODEL_HEAVY;
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  const text = (typeof lastUser?.content === 'string' ? lastUser.content :
    (Array.isArray(lastUser?.content) ? lastUser.content.map(c => c.text||'').join(' ') : '')
  ).toLowerCase();
  if (COMPLEX_KEYWORDS.some(kw => text.includes(kw))) return MODEL_HEAVY;
  return MODEL_FAST;
}

async function callOpenAI(body, retryCount = 0) {
  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) {
    console.error('[openai] error:', JSON.stringify(data).slice(0, 300));
    if (res.status === 429 && retryCount < 3) {
      const wait = (parseInt(res.headers.get('retry-after') || '12')) * 1000 || (retryCount + 1) * 12000;
      console.warn('[openai] 429 — waiting ' + wait + 'ms, retry ' + (retryCount+1) + '/3');
      await new Promise(r => setTimeout(r, wait));
      return callOpenAI(body, retryCount + 1);
    }
    if (res.status === 400 && body.tools) { data._retryWithoutTools = true; return data; }
    data._error = data.error?.message || 'OpenAI request failed.';
    data._status = res.status;
    return data;
  }
  normalizeToolCalls(data);
  return data;
}

function normalizeToolCalls(data) {
  try {
    const msg = data?.choices?.[0]?.message;
    if (msg?.tool_calls) {
      msg.tool_calls.forEach(tc => {
        if (tc.function && typeof tc.function.arguments === 'object')
          tc.function.arguments = JSON.stringify(tc.function.arguments);
      });
    }
  } catch(e) {}
}

module.exports = { routeModel, callOpenAI, MODEL_FAST, MODEL_HEAVY, MODEL_COSTS };
