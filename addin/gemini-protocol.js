(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GeminiProtocol = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function userParts(content) {
    if (!Array.isArray(content)) return [{ text: String(content || '') }];
    return content.map(part => {
      if (part.type === 'text') return { text: part.text };
      const image = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(part.image_url?.url || '');
      if (part.type === 'image_url' && image) return { inlineData: { mimeType: image[1], data: image[2] } };
      throw new Error('Gemini: this attachment format is not supported. Use text or an attached image.');
    });
  }
  function request(messages, tools) {
    const system = [], contents = [], calls = new Map();
    for (const m of messages) {
      if (m.role === 'system') system.push({ text: String(m.content || '') });
      else if (m.role === 'user') contents.push({ role: 'user', parts: userParts(m.content) });
      else if (m.role === 'assistant') {
        const parts = m._geminiParts || [
          ...(m.content ? [{ text: m.content }] : []),
          ...(m.tool_calls || []).map(tc => ({ functionCall: { name: tc.function.name, args: JSON.parse(tc.function.arguments || '{}') } }))
        ];
        const rawCalls = parts.filter(part => part.functionCall);
        (m.tool_calls || []).forEach((tc, i) => calls.set(tc.id, { name: tc.function.name, id: rawCalls[i]?.functionCall.id }));
        if (parts.length) contents.push({ role: 'model', parts });
      } else if (m.role === 'tool') {
        const call = calls.get(m.tool_call_id);
        if (!call) throw new Error('Gemini: tool result has no matching call. Start a new task.');
        const response = { name: call.name, response: { result: m.content } };
        if (call.id) response.id = call.id;
        const part = { functionResponse: response }, last = contents[contents.length - 1];
        if (last?.role === 'user' && last.parts.every(p => p.functionResponse)) last.parts.push(part);
        else contents.push({ role: 'user', parts: [part] });
      }
    }
    const body = { contents, generationConfig: { maxOutputTokens: 8192, temperature: 0.2 } };
    if (system.length) body.systemInstruction = { parts: system };
    if (tools?.length) body.tools = [{ functionDeclarations: tools.map(t => ({ name: t.function.name, description: t.function.description, parametersJsonSchema: t.function.parameters })) }];
    return body;
  }
  function response(data) {
    const candidate = data.candidates?.[0];
    if (!candidate || candidate.finishReason !== 'STOP') throw new Error('Gemini returned a blocked or incomplete response. Reduce the request or check the selected model. No actions from this response were executed.');
    const parts = candidate.content?.parts || [];
    const toolCalls = parts.filter(p => p.functionCall).map((p, i) => ({
      id: p.functionCall.id || 'gemini_call_' + i,
      type: 'function', function: { name: p.functionCall.name, arguments: JSON.stringify(p.functionCall.args || {}) }
    }));
    const message = { role: 'assistant', content: parts.filter(p => p.text && !p.thought).map(p => p.text).join('') || null };
    if (toolCalls.length) message.tool_calls = toolCalls;
    // Preserve original parts, IDs and thought signatures verbatim for Gemini's next turn.
    message._geminiParts = parts;
    return message;
  }
  return { request, response };
});
