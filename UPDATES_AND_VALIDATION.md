# In-app updates and provider verification — 2.2.0

## Customer update behavior

Clients already using excel-ai.shayntech.com need one close/reopen to load this updater. JavaScript already running in an older pane cannot gain a new update checker without reloading. Older Replit manifests still require one manifest replacement because that host is no longer controlled by this deployment.

After bootstrap, the add-in checks /api/version on startup, on focus/visibility changes, and every minute while visible. A different build shows release notes, Update now and Later. About also has Check for updates. No automatic reload interrupts user work.

Update now is blocked during tasks, model tests, unsaved Settings or pending attachments. Saved settings, account session and unsent text are persisted before reload. A storage failure prevents navigation. Excel workbook contents are not modified by the updater. The in-memory add-in Undo stack is cleared on reload; the banner states this when snapshots exist.

Backend release metadata lives in backend/app-release.json. The build ID hashes the release metadata, taskpane and shipped JavaScript. The served page includes that build ID and version; scripts use its cache key. Page, version endpoint and scripts have Cache-Control: no-store. Change the version/notes when shipping a release; code changes also produce a new build ID. No new Supabase migration or credentials are required.

## Evidence and limits

- 68 automated Node tests: existing workbook safety/quota checks plus personal routing, all seven adapter paths with simulated tool continuations and service rejection, malformed/truncated output, update availability/dismissal, stale caches, current version, and reload guards.
- A local browser fixture verified the visible update notice, disabled updating with unsaved settings, user-triggered reload, restored draft, persisted settings, and subsequent up-to-date message.
- Live deepseek-flash API test: two requests using the already provided DeepSeek key, synthetic cells A1=2, A2=3, A3=7; model returned total 12, =SUM(A1:A3), valid function arguments and the expected receipt after the tool result. No customer account quota or workbook was touched. This verifies the live API through the shipped compatible adapter; it does not prove browser CORS or Excel execution.
- User confirmed no Gemini, Groq, OpenRouter or other provider keys are available for our live testing. Those services/models are NOT live-certified by the automated tests. Each customer can enter their own keys and use Test configured models for two-step synthetic checks. Results are visible per model; failed tests do not silently switch providers.
- Real Windows/Mac/web Excel integration and representative large-workbook acceptance remain unverified for this release. No promise of error-free behavior or all-model compatibility is made.

## Reproduce

From backend: node scripts/check-syntax.js; node --test test/*.test.js.

Local browser update fixture: node test/preview-updates.js, then open http://localhost:5052/taskpane.html. It binds loopback, uses dummy service settings and cannot run with NODE_ENV=production. It simulates an older loaded build without changing production.

Opt-in live API check with configured hosted credentials: node scripts/live-provider-check.js. This sends two small requests per distinct configured hosted model, may incur provider charges, and prints only results/model IDs, never keys or raw provider responses.

Deployment uses the existing app service on host loopback 5020 with nginx; preserve .env and compose.override.yaml. The manifest URL stays the same.
