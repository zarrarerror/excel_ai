# Shayntech Excel AI Add-in — Project Memory

## Project Overview
Two products — a free public add-in and a Pro subscription add-in.

### Free Add-in
- **Live URL**: https://excelai.replit.app/taskpane.html
- **GitHub**: https://github.com/zarrarerror/excel_ai.git (public repo)
- **Hosting**: Replit `excelai` project (static, `python3 -m http.server 5000`)
- **File**: `taskpane.html` (single HTML+JS+CSS file at repo root)
- **Manifest**: `manifest.xml` — sideloaded via `\\localhost\ExcelAddins`

### Pro Add-in + Backend
- **Backend URL**: https://aiexcel.replit.app
- **GitHub**: https://github.com/zarrarerror/excel_ai.git (same repo, `excel_ai_pro/` subfolder maps to Replit root)
- **Hosting**: Replit `aiexcel` project (Node.js, `bash start.sh`)
- **Admin dashboard**: https://aiexcel.replit.app/admin (secured by `ADMIN_SECRET` env var)

## CRITICAL: Replit File Size Limit
Replit's git checkout corrupts files based on **byte size**, not line count. Files above ~1500 bytes
get replacement-type null bytes (content is lost — cannot be recovered). Files slightly over get
padding-type null bytes (content intact — stripping recovers them).
**RULES:**
1. Keep every backend file under **1200 bytes** (≈ 20 compact lines). Split if larger.
2. Never use multi-line bash strings in start.sh — use single-quoted single-line `node -e '...'`.
3. The start.sh null-byte stripper handles padding corruption only; it cannot recover lost content.
4. After any file grows, check with `wc -c filename` — keep under 1200 bytes.

## Backend File Structure (excel_ai_pro/)
```
start.sh                    # Entry point: single-line node -e null-byte strip → server.js (6 lines)
backend/
  server.js                 # Express app, routes only (20 lines, 1212 bytes)
  routes/
    auth.js                 # register, login, /me (48 lines, 3100 bytes — stripped OK)
    auth-reset.js           # POST /forgot-password (10 lines, 313 bytes)
    chat.js                 # POST /api/chat, POST /api/chat/log (65 lines, 2772 bytes)
    admin.js                # GET /api/admin/stats (20 lines, 742 bytes)
    webhook.js              # Razorpay webhook stub (10 lines, 313 bytes)
  lib/
    supabase.js             # Supabase client init
    openai.js               # callOpenAI, routeModel, normalizeToolCalls, constants (61 lines)
    usage.js                # requireAuth, checkUsage, incrementUsage, logTokens (46 lines)
addin/
  taskpane.html             # Pro add-in (login + chat UI)
admin/
  index.html                # Admin dashboard HTML
supabase/
  schema.sql                # Full DB schema with RLS
```

## Replit Secrets Required
| Secret | Purpose |
|--------|---------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role (bypasses RLS) |
| `OPENAI_API_KEY` | OpenAI API key |
| `ADMIN_SECRET` | Password for /admin dashboard |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | (unused — switching to Razorpay) |
| `LEMONSQUEEZY_CHECKOUT_URL` | (unused — switching to Razorpay) |
| `FREE_USES_LIMIT` | Default: 50 |
| `PRO_USES_LIMIT` | Default: 1000 |
| `OPENAI_MODEL_FAST` | Default: gpt-4o (all requests) |
| `OPENAI_MODEL_HEAVY` | Default: gpt-4o (images/complex) |

## Payment Provider
**Razorpay** (replacing LemonSqueezy — rejected integration).
- Indian business registration accepted
- Supports international payments + subscriptions
- Webhook: update `routes/webhook.js` for Razorpay signature verification

## Supabase Schema (key tables)
- `profiles`: id, email, lifetime_usage, monthly_usage, monthly_reset_at, is_pro, lemon_subscription_id
- `token_logs`: user_id, model, input_tokens, output_tokens, cost_usd
- `chat_logs`: user_id, user_email, user_message, ai_response, tools_called (JSONB), model, session_id
- `pending_activations`: email, subscription_id (service_role only)
- `user_stats` VIEW: joins profiles + token_logs + chat_logs for admin

## AI Model Routing (lib/openai.js)
- Default: `gpt-4o` for ALL requests (env: `OPENAI_MODEL_FAST`)
- Heavy: `gpt-4o` for images/complex (env: `OPENAI_MODEL_HEAVY`)
- 429 rate limit: auto-retry up to 3 times with backoff
- Images: `detail: 'low'` to stay under 30K TPM limit

## Frontend Key Patterns (addin/taskpane.html)

### Auto context pre-loading
Before every agent run, the frontend reads the active sheet and injects
full cell data into the system prompt so AI has complete context automatically.

### Storage wrapper (localStorage may be blocked in WebView2)
```javascript
const storage = { _mem: {}, setItem(k,v){...}, getItem(k){...} }
```

### normalizeMessage() — applied to ALL provider responses
Ensures `tool_calls[].function.arguments` is always a JSON string, not an object.

### write_range / set_formulas_range
Always derives range from values array dimensions + top-left cell only.
Pass only top-left cell (e.g. "A1"), never guess full range "A1:D10".

### Pro backend URL
`const PRO_BACKEND_URL = 'https://aiexcel.replit.app'`

## Deployment Workflow
### Pro backend (aiexcel Replit):
1. Edit files in `D:\zarrar\excel_ai\excel_ai\excel_ai_pro\`
2. Push via git from `/tmp/repo_check/` (cloned with token)
3. In aiexcel Replit shell: `git fetch origin && git reset --hard origin/main && bash start.sh`
4. Click **Republish** in Replit deployment tab

### GitHub token
Token in use: `ghp_****` (stored locally only — never commit to GitHub, expires June 4, 2026)
Repo: `https://github.com/zarrarerror/excel_ai.git`

## System Prompt Rules (addin/taskpane.html)
Key rules enforced:
- R8: VAT/Total placement — always scan for Total row first, write below it
- R9: No blank rows between Total/VAT/Grand Total
- Rule 0b: VBA always goes to write_vba_to_sheet tool, never in chat
- Rule 21: "add price X" = write literal X, not =cell+X formula
- Mandatory read-first before any write operation
- gpt-4o understands context well; combined with auto pre-loaded sheet data

## Common Errors & Fixes
| Error | Cause | Fix |
|-------|-------|-----|
| `SyntaxError: Unexpected end of input` at backend/routes/*.js | Replit file truncation (file >80 lines) | Split file into smaller modules |
| `EADDRINUSE port 5000` | Old node process still running | `pkill -f "node server.js"` in start.sh |
| `python3: command not found` | Replit nodejs-20 has no python3 | Use `node -e "..."` for scripting |
| 429 gpt-4o TPM limit | 30K tokens/min limit hit | Auto-retry with backoff in callOpenAI() |
| Usage pill shows 0/1000 | /api/auth/me not returning monthly fields | Fixed in auth.js — returns monthly_usage, remaining, resets_at |
| `write_range dimension mismatch` | AI guessed wrong range | Pass top-left cell only, let code resize |
| 400 `function.arguments must be JSON` | Model returned args as object | normalizeToolCalls() in 