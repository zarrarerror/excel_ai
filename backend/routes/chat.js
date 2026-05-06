const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { requireAuth, checkUsage, incrementUsage, logTokens } = require('../lib/usage');
const { routeModel, callOpenAI, MODEL_FAST, MODEL_HEAVY, MODEL_COSTS } = require('../lib/openai');

router.post('/', requireAuth, checkUsage, async (req, res) => {
  const { messages, tools, tool_choice, has_attachment, attachment_type } = req.body;
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'messages array is required.' });

  const model = routeModel(messages, has_attachment, attachment_type);
  console.log('[chat] user=' + req.user.email + ' model=' + model);

  const body = { model, messages, temperature: 0.1, max_tokens: 4096 };
  if (tools && tools.length > 0) { body.tools = tools; body.tool_choice = tool_choice || 'auto'; }

  try {
    let data = await callOpenAI(body);

    if (data._retryWithoutTools) {
      console.warn('[chat] retrying without tools');
      const retryBody = { ...body }; delete retryBody.tools; delete retryBody.tool_choice;
      data = await callOpenAI(retryBody);
    }

    if (data._error && model !== MODEL_HEAVY && tools && tools.length > 0) {
      console.warn('[chat] escalating to heavy model');
      body.model = MODEL_HEAVY;
      data = await callOpenAI(body);
    }

    if (data._error) return res.status(data._status || 500).json({ error: data._error });

    const usage = data.usage || {};
    const inputTok  = usage.prompt_tokens    || 0;
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

router.post('/log', requireAuth, async (req, res) => {
  const { user_message, ai_response, tools_called, model, session_id } = req.body;
  try {
    await supabase.from('chat_logs').insert({
      user_id: req.user.id, user_email: req.user.email,
      user_message: user_message ? String(user_message).slice(0, 2000) : '',
      ai_response:  ai_response  ? String(ai_response).slice(0, 4000)  : '',
      tools_called: Array.isArray(tools_called) ? tools_called : [],
      model: model || 'unknown', session_id: session_id || null
    });
    res.json({ ok: true });
  } catch (err) { console.error('[log] failed:', err.message); res.json({ ok: false }); }
});

module.exports = router;
