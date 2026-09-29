// Local-only browser fixture: first load represents an old build, Update now
// loads the current build. No production credentials, accounts or AI requests.
if (process.env.NODE_ENV === 'production') throw new Error('Local preview only.');
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'preview-only';
process.env.PUBLIC_URL = 'http://localhost:5052';
const express = require('express');
const path = require('node:path');
const { loadRelease } = require('../lib/release');
const release = loadRelease(path.join(__dirname, '../..'));
const wrapper = express();
wrapper.use(express.json());
wrapper.post('/mock-ollama/v1/chat/completions', (req, res) => {
  const complete = req.body.messages?.some(m => m.role === 'tool');
  const message = complete ? { role: 'assistant', content: 'SAMPLE_CHECK_PASSED_12' } : {
    role: 'assistant', content: null, tool_calls: [{ id: 'local-test', type: 'function', function: { name: 'verify_sample', arguments: '{"total":12,"formula":"=SUM(A1:A3)"}' } }]
  };
  res.json({ choices: [{ finish_reason: complete ? 'stop' : 'tool_calls', message }] });
});
wrapper.get('/taskpane.html', (req, res) => {
  const html = req.query._app_build === release.info.build ? release.html : release.html.replaceAll(release.info.build, '0'.repeat(20));
  res.set('Cache-Control', 'no-store').type('html').send(html);
});
wrapper.use(require('../server').createApp());
wrapper.listen(5052, '127.0.0.1', () => console.log('Local update fixture at http://localhost:5052/taskpane.html'));
