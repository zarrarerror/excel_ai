const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const supabase = require('../lib/supabase');

// ── Limits ──────────────────────────────────────────────────────
const FREE_LIMIT = parseInt(process.env.FREE_USES_LIMIT || '50');
const PRO_LIMIT  = parseInt(process.env.PRO_USES_LIMIT  || '1000');

// ── OpenAI models ────────────────────────────────────────────────
const OPENAI_URL  = 'https://api.openai.com/v1/chat/completions';
const MODEL_FAST  = process.env.OPENAI_MODEL_FAST   || 'gpt-4o-mini';  // default for all tasks
const MODEL_HEAVY = process.env.OPENAI_MODEL_HEAVY  || 'gpt-4o';       // images + complex tasks

// Cost per 1K tokens (USD) for budget tracking
const MODEL_COSTS = {
  'gpt-4o-mini': { input: 0.000150, output: 0.000600 },
  'gpt-4o':      { input: 0.002500, output: 0.010000 },
};

// Keywords that trigger the heavy model
const COMPLEX_KEYWORDS = [
  'vba', 'macro', 'pivot', 'extract', 'pdf', 'dashboard', 'automate',
  'complex', 'advanced', 'regression', 'forecast', 'solver', 'analysis'
];

// ── Middleware: verify JWT ────────────────────────────────────────
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Not authenticated. Please log in.' });

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Session expired. Please log in again.' });

  req.user = user;
  next();
}

// ── Middleware: usage gate + monthly reset ────────────────────────
async function checkUsage(req, res, next) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('lifetime_usage, monthly_usage, monthly_reset_at, is_pro')
    .eq('id', req.user.id)
    .single();

  const isPro        = profile?.is_pro || false;
  const lifetimeUsed = profile?.lifetime_usage || 0;
  const now          = new Date();

  if (isPro) {
    // Monthly reset logic for Pro
    const resetAt      = profile?.monthly_reset_at ? new Date(profile.monthly_reset_at) : now;
    const needsReset   = now.getFullYear() > resetAt.getFullYear() ||
                         now.getMonth()    > resetAt.getMonth();
    let monthlyUsed    = needsReset ? 0 : (profile?.monthly_usage || 0);

    if (needsReset) {
      await supabase.from('profiles').update({
        monthly_usage: 0,
        monthly_reset_at: now.toISOString()
      }).eq('id', req.user.id);
    }

    if (monthlyUsed >= PRO_LIMIT) {
      return res.status(402).json({
        error: 'pro_limit_reached',
        message: `You have used all ${PRO_LIMIT} Pro requests this month. Resets next month.`,
        used: monthlyUsed,
        limit: PRO_LIMIT
      });
    }

    req.profile = { isPro: true, lifetimeUsed, monthlyUsed };
  } else {
    // Free tier: lifetime cap
    if (lifetimeUsed >= FREE_LIMIT) {
      return res.status(402).json({
        error: 'free_limit_reached',
        message: `You have used all ${FREE_LIMIT} free requests. Upgrade to Pro to continue.`,
        checkout_url: process.env.LEMONSQUEEZY_CHECKOUT_URL,
        used: lifetimeUsed,
        limit: FREE_LIMIT
      });
    }
    req.profile = { isPro: false, lifetimeUsed, monthlyUsed: 0 };
  }

  next();
}

// ── Route model based on content ─────────────────────────────────
function routeModel(messages, hasAttachment, attachmentType) {
  // Images always use heavy model (vision)
  if (hasAttachment && attachmentType === 'image') return MODEL_HEAVY;

  // Check last user message for complex keywords
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  const text = (typeof lastUser?.content === 'string' ? lastUser.content :
    (Array.isArray(lastUser?.content) ? lastUser.content.map(c => c.text || '').join(' ') : '')
  ).toLowerCase();

  if (COMPLEX_KEYWORDS.some(kw => text.includes(kw))) return MODEL_HEAVY;
  return MODEL_FAST;
}

// ── POST /api/chat ────────────────────────────────────────────────
router.post('/', requireAuth, checkUsage, async (req, res) => {
  const { messages, tools, tool_choice, has_attachment, attachment_type } = req.body;

  if (!messages || !Array.isArray(messages))
    return res.status(400).json({ error: 'messages array is required.' });

  const model = routeModel(messages, has_attachment, attachment_type);
  console.log(`[chat] user=${req.user.email} model=${model} has_attachment=${has_attachment} type=${attachment_type}`);

  const body = {
    model,
    messages,
    temperature: 0.1,
    max_tokens: 4096
  };

  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = tool_choice || 'auto';
  }

  try {
    let data = await callOpenAI(body);

    // If tool calling rejected (400 strict schema), retry without tools
    if (data._retryWithoutTools) {
      console.warn(`[chat] tool call rejected, retrying without tools`);
      const retryBody = { ...body };
      delete retryBody.tools;
      delete retryBody.tool_choice;
      data = await callOpenAI(retryBody);
    }

    // If still an error, try upgrading to heavy model
    if (data._error && model !== MODEL_HEAVY && tools && tools.length > 0) {
      console.warn(`[chat] escalating to heavy model`);
      body.model = MODEL_HEAVY;
      data = await callOpenAI(body);
    }

    if (data._error) {
      return res.status(data._status || 500).json({ error: data._error });
    }

    // Log tokens + cost
    const usage = data.usage || {};
    const inputTok  = usage.prompt_tokens || 0;
    const outputTok = usage.completion_tokens || 0;
    const costs     = MODEL_COSTS[data.model] || MODEL_COSTS[MODEL_FAST];
    const costUsd   = (inputTok * costs.input + outputTok * costs.output) / 1000;

    await Promise.all([
      incrementUsage(req.user.id, req.profile),
      logTokens(req.user.id, data.model || model, inputTok, outputTok, costUsd)
    ]);

    res.json(data);

  } catch (err) {
    console.error('[chat] error:', err.message);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// ── POST /api/chat/log — save full conversation log ───────────────
router.post('/log', requireAuth, async (req, res) => {
  const { user_message, ai_response, tools_called, model, session_id } = req.body;

  try {
    await supabase.from('chat_logs').insert({
      user_id:      req.user.id,
      user_email:   req.user.email,
      user_message: user_message ? String(user_message).slice(0, 2000) : '',
      ai_response:  ai_response  ? String(ai_response).slice(0, 4000)  : '',
      tools_called: Array.isArray(tools_called) ? tools_called : [],
      model:        model || 'unknown',
      session_id:   session_id || null
    });
    res.json({ ok: true });
  } catch (err) {
    // Logging failure is non-fatal — don't error the user
    console.error('[log] failed:', err.message);
    res.json({ ok: false });
  }
});

// ── Helpers ──────────────────────────────────────────────────────
async function callOpenAI(body) {
  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('[openai] error:', JSON.stringify(data).slice(0, 300));
    // Tool schema error → signal caller to retry without tools
    if (res.status === 400 && body.tools) {
      data._retryWithoutTools = true;
      return data;
    }
    data._error  = data.error?.message || 'OpenAI request failed.';
    data._status = res.status;
    return data;
  }

  // Normalize tool_call arguments (must be strings, not objects)
  normalizeToolCalls(data);
  return data;
}

async function incrementUsage(userId, profile) {
  if (profile.isPro) {
    await supabase.from('profiles').update({
      monthly_usage:  (profile.monthlyUsed  || 0) + 1,
      lifetime_usage: (profile.lifetimeUsed || 0) + 1
    }).eq('id', userId);
  } else {
    await supabase.from('profiles').update({
      lifetime_usage: (profile.lifetimeUsed || 0) + 1
    }).eq('id', userId);
  }
}

async function logTokens(userId, model, inputTokens, outputTokens, costUsd) {
  try {
    await supabase.from('token_logs').insert({
      user_id: userId, model, input_tokens: inputTokens,
      output_tokens: outputTokens, cost_usd: costUsd
    });
  } catch(e) { /* non-fatal */ }
}

function normalizeToolCalls(data) {
  try {
    const msg = data?.choices?.[0]?.message;
    if (msg?.tool_calls) {
      msg.tool_calls.forEach(tc => {
        if (tc.function && typeof tc.function.arguments === 'object') {
          tc.function.arguments = JSON.stringify(tc.function.arguments);
        }
      });
    }
  } catch (e) { /* ignore */ }
}

module.exports = router;
