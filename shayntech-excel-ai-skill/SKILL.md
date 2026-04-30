---
name: shayntech-excel-ai
description: >
  Maintain, debug, and extend the Shayntech Excel AI Add-in project.
  Use when: fixing bugs in taskpane.html, updating API providers, pushing to GitHub,
  syncing to Replit, adding new Excel tools, or diagnosing errors from the add-in.
---

# Shayntech Excel AI Add-in — Maintenance Skill

## Project Snapshot

- **Live URL**: https://excelai.replit.app/taskpane.html
- **GitHub**: https://github.com/zarrarerror/excel_ai.git (branch: main)
- **Workspace file**: `D:\zarrar\excel_ai\excel_ai\taskpane.html`
- **Git working copy**: `/tmp/excel_ai2/` (bash path: same repo, cloned with PAT)
- **Replit sync command**: `git fetch origin && git reset --hard origin/main`

---

## Standard Deploy Workflow

```
1. Edit file in workspace: D:\zarrar\excel_ai\excel_ai\taskpane.html
2. cp to git dir:  cp /sessions/.../mnt/excel_ai/taskpane.html /tmp/excel_ai2/taskpane.html
3. cd /tmp/excel_ai2 && git add taskpane.html
4. git commit -m "Fix: <description>"
5. git push https://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@github.com/zarrarerror/excel_ai.git main
6. In Replit shell: git fetch origin && git reset --hard origin/main → redeploy
```

**After every code change, always verify:**
```python
# Brace balance check (must be 0)
import re
with open('taskpane.html','r') as f: content = f.read()
for s in re.finditer(r'<script\b[^>]*>.*?</script>', content, re.DOTALL):
    js = re.sub(r'^<script[^>]*>|</script>$','',s.group().strip())
    if len(js)>1000: print(f'Balance: {js.count(chr(123))-js.count(chr(125))}')
# File must end with: </script> </body> </html>
```

---

## AI Provider Configuration

### OpenRouter
- Endpoint: `https://openrouter.ai/api/v1/chat/completions`
- Headers: `Authorization: Bearer <key>`, `HTTP-Referer: https://excelai.replit.app`, `X-Title: Shayntech AI Agent`
- Must include `stream: false`
- Free models (429 = rate limited, switch to another):
  - `deepseek/deepseek-r1:free`
  - `meta-llama/llama-3.3-70b-instruct:free`
  - `google/gemma-3-27b-it:free`
  - `mistralai/mistral-small-3.1-24b-instruct:free`
  - `microsoft/phi-4-reasoning-plus:free`
- On 422/400 → auto-retry without tools (already implemented)

### Qwen / Alibaba DashScope
- **API Host field must contain the base URL ending in `/v1` — code appends `/chat/completions`**
- International endpoint: `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`
- China endpoint: `https://dashscope.aliyuncs.com/compatible-mode/v1`
- MaaS custom: `https://<workspace-id>.<region>.maas.aliyuncs.com/compatible-mode/v1`
- API key: from dashscope.console.aliyun.com → API Keys (starts with `sk-`)
- Must include `stream: false`
- `qwen-turbo` = best for tool calling
- `qwen-max` = rejects tool calling with 400 → auto-retried without tools

### Ollama (local)
- Default: `http://localhost:11434`
- With tools: uses `/v1/chat/completions` (OpenAI-compat)
- Without tools: uses `/api/chat`

---

## Critical Code Patterns (DO NOT REMOVE)

### normalizeMessage() — applied to ALL three providers
```javascript
function normalizeMessage(msg) {
  if (msg && msg.tool_calls) {
    msg.tool_calls = msg.tool_calls.map(tc => {
      if (tc.function && typeof tc.function.arguments !== 'string') {
        tc.function.arguments = JSON.stringify(tc.function.arguments);
      }
      return tc;
    });
  }
  return msg;
}
```
**Why**: Some models return `arguments` as a parsed JS object. On the next agent loop
iteration this causes a 400 from Qwen or silent failures in other providers.
Must be called on every `data.choices[0].message` return.

### write_range — use getResizedRange, not the AI-provided range
```javascript
const topLeft = args.range.split(':')[0];
const rng = sheet.getRange(topLeft).getResizedRange(numRows - 1, numCols - 1);
rng.values = values;
```
**Why**: AI frequently guesses wrong range end-cell. Excel throws dimension mismatch if sizes don't match exactly.

### Tool result messages — always stringify
```javascript
const tcId = String(tc.id || tc.function?.name || 'tool_0');
const tcContent = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
messages.push({ role: 'tool', tool_call_id: tcId, content: tcContent });
```

### Storage wrapper — localStorage may be blocked in WebView2/Excel
```javascript
const storage = {
  _mem: {},
  setItem(key, val) { try { localStorage.setItem(key, val); } catch(e) {} this._mem[key] = val; },
  getItem(key) { try { const v = localStorage.getItem(key); if (v !== null) return v; } catch(e) {} return this._mem[key] || null; }
};
```

### Office initialization — use initialize not onReady
```javascript
Office.initialize = function(reason) { _officeInitDone = true; if (_domReady) _onBothReady(); };
// 2s fallback if office.js is blocked by Edge tracking prevention
setTimeout(function() { if (!window._appStarted) _onBothReady(); }, 2000);
```

---

## Common Errors & Fixes

| Error | Root Cause | Fix |
|-------|-----------|-----|
| `400 function.arguments must be JSON` | Model returned args as JS object | `normalizeMessage()` on all provider returns |
| `write_range failed: cannot read length of undefined` | AI called write_range with `{}` | Guard: `if (!Array.isArray(args.values) \|\| args.values.length === 0)` |
| Qwen URL appended to Replit domain (404) | Host field missing `https://` | Code auto-prepends `https://` if not starting with `http` |
| `401 Qwen` | Key doesn't match endpoint (MaaS vs DashScope) | Use dashscope-intl key for intl endpoint |
| `429 OpenRouter` | Free tier rate limit | Switch model or wait a few minutes |
| Settings tab / Send button not clickable | JS parse error (truncated file, bad syntax) | Check brace balance; ensure file ends `</script></body></html>` |
| `Office.js has not fully loaded` | Edge tracking prevention blocks localStorage | normalizeMessage + 2s fallback already handles this |

---

## Settings Defaults
- Max agent loop iterations: **20** (dropdown: 5 / 10 / 20 / 30 / 50 / 100)
- Context rows per sheet: **500** (dropdown: 50 / 100 / 200 / 500 / 1000 / 2000)

---

## Sideloading for New Users (Colleagues)
Each person needs to do this on their own PC:
1. Create folder `C:\ExcelAddins\`
2. Right-click → Properties → Sharing → Share it as `ExcelAddins`
3. Copy `manifest.xml` into `C:\ExcelAddins\`
4. Excel → File → Options → Trust Center → Trust Center Settings → Trusted Add-in Catalogs
5. Catalog URL: `\\localhost\ExcelAddins` → Add Catalog → check **Show in Menu** → OK
6. Fully close and reopen Excel
7. Insert → My Add-ins → Shared Folder tab → **Shayntech AI Agent** → Insert
