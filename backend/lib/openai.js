const fetch = require('node-fetch');

const OPENAI_URL  = 'https://api.openai.com/v1/chat/completions';
const MODEL_FAST  = process.env.OPENAI_MODEL_FAST  || 'gpt-4o';
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  let res, data;
  try {
  res = await fetch(OPENAI_URL, {
    signal: controller.signal,
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  data = await res.json();
  } catch (error) {
    return { _error: error.name === 'AbortError' ? 'AI request timed out. Please try again.' : 'AI service returned an invalid response or is unreachable.', _status: 502 };
  } finally { clearTimeout(timeout); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { _error: 'AI service returned an invalid response.', _status: 502 };
  if (!res.ok) {
    console.error('[openai] upstream status:', res.status);
    if ((res.status === 429 || res.status >= 500) && retryCount < 1) {
      const wait = Math.min(10000, Math.max(1000, Number(res.headers.get('retry-after')) * 1000 || 2000));
      console.warn('[openai] temporary failure; retrying once after ' + wait + 'ms');
      await new Promise(r => setTimeout(r, wait));
      return callOpenAI(body, retryCount + 1);
    }
    data._error = res.status === 429 ? 'AI capacity temporarily unavailable. Please try again shortly.' : 'AI service rejected the request. No fallback actions were executed.';
    data._status = res.status === 429 ? 429 : 502;
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
