# Shayntech Excel AI Add-in — Project Memory

## Project Overview
An Excel Office Add-in (task pane) that acts as an agentic AI co-pilot.
- **Live URL**: https://excelai.replit.app/taskpane.html
- **GitHub**: https://github.com/zarrarerror/excel_ai.git
- **Hosting**: Replit (static deployment, `python3 -m http.server 5000`)
- **Manifest**: `manifest.xml` — sideloaded via `\\localhost\ExcelAddins` trusted catalog

## Files
| File | Purpose |
|------|---------|
| `taskpane.html` | Entire add-in (single HTML+JS+CSS file) |
| `manifest.xml` | Office Add-in manifest pointing to Replit URL |
| `index.html` | Redirect to taskpane.html for Replit root |
| `.replit` | Replit run config |
| `.github/workflows/deploy.yml` | GitHub Actions → Replit sync pipeline |

## Supported AI Providers

### OpenRouter
- Endpoint: `https://openrouter.ai/api/v1/chat/completions`
- Required headers: `Authorization: Bearer <key>`, `HTTP-Referer: https://excelai.replit.app`, `X-Title: Shayntech AI Agent`
- Free models: `deepseek/deepseek-r1:free`, `meta-llama/llama-3.3-70b-instruct:free`, `google/gemma-3-27b-it:free`, `mistralai/mistral-small-3.1-24b-instruct:free`, `microsoft/phi-4-reasoning-plus:free`
- Known issues: Free tier 429 rate limits (switch model or wait); some models don't support tool calling (auto-retries without tools on 422)

### Qwen / Alibaba DashScope
- **Standard international endpoint (API Host field)**: `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`
- **Standard China endpoint**: `https://dashscope.aliyuncs.com/compatible-mode/v1`
- API Host field: paste only the base URL up to `/v1` — the code appends `/chat/completions` automatically
- API keys: generated from dashscope.console.aliyun.com → API Keys (starts with `sk-`)
- MaaS custom endpoints: enter the full base URL e.g. `https://ws-xxx.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1`
- Models: `qwen-turbo` (best for tool calling), `qwen-max`, `qwen-plus`
- Known issues: `qwen-max` rejects tool calling with 400 (auto-retries without tools); arguments sometimes returned as object not string (normalizeMessage() handles this)

### Ollama (local)
- Endpoint: `http://localhost:11434` (default)
- Uses `/v1/chat/completions` (OpenAI-compat) when tools are present
- Uses `/api/chat` for plain chat
- Optional API key field for secured Ollama setups

## Key Code Patterns

### Initialization (tracking prevention safe)
```javascript
// Uses Office.initialize (not Office.onReady) to avoid localStorage retry loop
Office.initialize = function(reason) { _officeInitDone = true; if (_domReady) _onBothReady(); };
// 2-second fallback if office.js is blocked by Edge tracking prevention
setTimeout(function() { if (!window._appStarted) _onBothReady(); }, 2000);
```

### Storage wrapper (localStorage may be blocked in WebView2)
```javascript
const storage = { _mem: {}, setItem(k,v){...}, getItem(k){...} }
```

### normalizeMessage() — applied to ALL provider responses
Ensures `tool_calls[].function.arguments` is always a JSON string, not an object.
Some models (especially Qwen) return arguments as parsed objects which causes 400 on multi-turn calls.

### write_range / set_formulas_range
Always derives the actual Excel range from the values array dimensions + top-left cell:
```javascript
const topLeft = args.range.split(':')[0];
const rng = sheet.getRange(topLeft).getResizedRange(numRows - 1, numCols - 1);
```
This prevents dimension mismatch errors when the AI guesses the wrong range size.

### Tool result messages
`tool_call_id` and `content` are always cast to strings before being added to messages history.

## Agent Settings Defaults
- Max iterations: 20 (options: 5, 10, 20, 30, 50, 100)
- Context rows per sheet: 500 (options: 50, 100, 200, 500, 1000, 2000)

## Deployment Workflow
1. Edit `taskpane.html` in workspace (`D:\zarrar\excel_ai\excel_ai\`)
2. Copy to `/tmp/excel_ai2/` (git working dir)
3. `git add taskpane.html && git commit -m "..." && git push https://ghp_...@github.com/zarrarerror/excel_ai.git main`
4. In Replit shell: `git fetch origin && git reset --hard origin/main` then redeploy

## Sideloading for Colleagues
Each user must:
1. Create `C:\ExcelAddins\` folder on their own PC
2. Share it as a network share (right-click → Share → `ExcelAddins`)
3. Copy `manifest.xml` into it
4. Excel → File → Options → Trust Center → Trust Center Settings → Trusted Add-in Catalogs → add `\\localhost\ExcelAddins`, check "Show in Menu"
5. Restart Excel → Insert → My Add-ins → Shared Folder → Shayntech AI Agent

## Common Errors & Fixes
| Error | Cause | Fix |
|-------|-------|-----|
| 400 `function.arguments must be JSON` | Model returned args as object | `normalizeMessage()` applied to all providers |
| `write_range failed: cannot read length of undefined` | AI called write_range with `{}` | Guard checks args.values is array before use |
| 404 on Qwen (URL prepended to Replit domain) | Host field missing `https://` | Code auto-prepends `https://` if missing |
| 401 Qwen | Wrong key for endpoint (MaaS key on DashScope or vice versa) | Use matching key for the endpoint |
| 429 OpenRouter | Free tier rate limit | Switch to different free model or wait |
| Office.js not fully loaded | Edge tracking prevention blocks localStorage | normalizeMessage + 2s fallback timer |
| Settings/Send button not clickable | JS syntax error or truncated file | Check brace balance: `{` count must equal `}` count |
