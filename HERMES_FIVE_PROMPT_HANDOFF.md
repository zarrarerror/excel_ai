# Five-prompt trial and own-key access

## Product behavior

- Five hosted prompts once per account, backed by DeepSeek. No monthly free reset. Existing lifetime usage is preserved, so existing accounts with five or more uses have exhausted the trial.
- Each submitted task includes planning and up to 40 agent model calls, expiring after two hours. A started task counts even if cancelled or the upstream provider fails. Each request is size/rate limited. Prompt IDs are scoped to an authenticated account; the database serializes quota consumption.
- Own-key mode requires no Shayntech subscription or sign-in and consumes no hosted allowance. Supported adapters: OpenRouter, Gemini, Groq, Claude, Qwen, Ollama, and a generic HTTPS OpenAI-compatible Chat Completions endpoint (including DeepSeek). The provider must support the selected model, tool calls, and browser access. Provider fees can apply. This does not guarantee support for every platform.
- Manual USD upgrades only. Contact hello@shayntech.com or https://wa.me/966537443627. No invented price or checkout. The admin page can activate/remove Pro for an existing account using the server admin secret. The configured Pro allowance remains 1,000 prompts per UTC month; change PRO_USES_LIMIT if a different global plan allowance is agreed. There is no automatic expiry or recurring billing: the owner manages renewal and revocation.

## Server status and deployment

The Supabase service-role key and DeepSeek key have been validated and securely saved in `/opt/excel-ai-pro/.env` (mode 600). DeepSeek `/models` accepted the key and advertised `deepseek-flash`; AI_PROVIDER and both model settings are configured accordingly. This is credential validation, not a completed Excel end-to-end test.

1. Pull this updated branch, preserving `.env`, the host-specific compose override, and nginx configuration. Review local server changes before pulling; never overwrite the 5020 port mapping.
2. Back up the database, then apply `supabase/migrations/20260925_reliability.sql` and `supabase/migrations/20260929_five_prompt_trial.sql` in that order through the Supabase SQL editor or an authorized DB connection. The service-role API key alone does not grant SQL-editor access. Do NOT run `backend/test/quota-fixture.sql` or `quota-assertions.sql` in production.
3. Verify Supabase Auth allows `https://excel-ai.shayntech.com/reset-password`.
4. Build and start only the app service. Host nginx remains the TLS terminator; bundled Caddy stays disabled. Bind the app to `127.0.0.1:5020`, forwarding to container 5000. Do not use host port 5000: another application owns it.
5. Test a fresh test account: five distinct hosted tasks succeed, including multi-step tasks; the sixth shows manual upgrade and own-key choices. Switching to own-key mode works after quota exhaustion without using the hosted endpoint. Test owner activation and revocation, formula mode, stop, write/undo, and password reset.
6. Test the actual manifest in Windows Excel, Mac Excel, and Excel web on a disposable workbook. Provider CORS and local Ollama connectivity vary by client and require real-client checks.

## Validation completed before handoff

- JavaScript/inline-script syntax checks and 32 passing Node regression tests.
- Live DeepSeek tool-calling probe passed using a tiny synthetic request; no workbook data was sent.
- Both migrations executed successfully in an isolated PostgreSQL 17 container, with no live Supabase changes.
- SQL tests cover five-prompt exhaustion, one charge for 41 internal steps, step and expiry limits, no monthly trial reset, manual Pro activation, Pro quota, and restricted RPC permissions.
- Ten concurrent new-prompt attempts accepted exactly five and stored exactly five uses.

Costs for DeepSeek are not priced by the legacy token-cost table yet; zero stored estimates must not be treated as an actual invoice. Verify usage in the provider dashboard. The hosted AI key stays on the server; user-provided keys stay on the client and are sent to the selected provider.
