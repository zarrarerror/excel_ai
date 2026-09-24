# Hermes deployment handoff — Excel AI Pro 2.1

Deploy this repository from its root. In the original local workspace these files lived under `excel_ai_pro/`; the GitHub repository already stores the Pro app at its root. The backend serves `addin/taskpane.html`. Root taskpane/manifest copies are synchronized for existing packaging workflows.

## Repository handoff

Repository: https://github.com/zarrarerror/excel_ai. Review branch: `codex/excel-agent-reliability`. A fresh checkout was used because the original workspace had incomplete Git metadata. The old Replit deployment workflow is now manual-only; merging this branch must not silently redeploy the old host. Exclude local secrets, node_modules and caches.

## What changed

- New selected-range audit button and `audit_data_quality` tool: exact blank counts, duplicate nonempty rows, whitespace and formula-error addresses, without changing data. The button performs no AI request.
- Tool names, required fields, types, matrix dimensions and Excel bounds are validated before execution. Data operations are limited to 20,000 cells per call. Formula-looking literal text is escaped; selected external/network formula types are blocked.
- Model responses that are incomplete or contain unknown tool calls are rejected. Provider errors no longer silently disable tools. The agent stops after the first failed action and displays a tool execution record. Earlier actions can remain applied.
- Workbook context is sampled before loading values, with exact addresses and explicit truncation. The prompt treats workbook and attachment contents as untrusted data and requires evidence for claims.
- Value/formula writes and cleaning keep up to ten in-memory undo snapshots. Formula writes are read back for Excel errors. Undo restores formulas as well as values and retains its snapshot if restoration fails. Other operations, including sheet deletion and formatting, are not covered by this custom undo stack.
- Whole-row and whole-column insert/delete operations now affect the whole row/column. Startup initializes template controls after their HTML exists; closing markup is repaired. Reliability logic is separated into `addin/agent-runtime.js` and `addin/agent-safety.js`.
- Same-origin frontend/API, corrected static file routes, dynamically generated manifest, configurable password recovery, request timeouts, basic rate limits, bounded HTTP bodies, and structured API errors.
- Login uses a separate Supabase client so user sessions do not replace the shared administrative client's authorization.
- Database migration removes client subscription/quota writes, makes quota consumption atomic, and fixes double-counted admin statistics. Full server-side chat storage is disabled by default.

## Required environment

Copy `.env.example` to `.env` on the server and fill every placeholder. `DOMAIN` is a hostname, while `PUBLIC_URL` is its HTTPS origin without a trailing slash. Keep Supabase service-role and OpenAI keys on the server. `SUPABASE_ANON_KEY` is public and is used by the password recovery page.

The supplied model defaults preserve the existing `gpt-4o` configuration. Check model access in your OpenAI account before launch. Cost accounting retains historical estimates for the existing models; it is not an invoice reconciliation system.

## Database migration (required before app startup)

1. Back up the existing Supabase database.
2. For a new project only, run `supabase/schema.sql` first.
3. Run `supabase/migrations/20260925_reliability.sql` using the Supabase SQL editor or your migration pipeline. Do this for both new and existing projects. Do not run `schema.sql` over an existing project after the migration because its older statistics view would replace the corrected view.
4. Verify an authenticated ordinary user cannot update `profiles.is_pro`, usage counters, or call `consume_ai_usage`; the service role must be able to call the function.
5. Add `https://YOUR_DOMAIN/reset-password` to Supabase Auth's allowed redirect URLs. Configure email delivery.

Quota semantics: each authenticated, valid AI request accepted by the database consumes one request, including provider failures. Planning calls and agent iterations are separate requests. A provider retry within one request consumes no additional quota. The monthly Pro period resets at the start of the UTC calendar month. Missing migrations fail closed with HTTP 503.

## Build and deploy

Requirements: Linux server with Docker Engine and Compose, DNS pointing to the server, and inbound ports 80/443 available.

From the repository root:

```sh
docker compose config --quiet
docker compose build --pull
docker compose up -d
docker compose ps
docker compose logs --tail=100 app
```

The image runs tests during the build, uses an unprivileged Node user, exposes the app only to the internal Docker network, and includes a health check. Caddy obtains HTTPS certificates. Keep its data volumes across upgrades.

If the server already has Nginx, Traefik or Caddy occupying 80/443, integrate the app with that proxy instead of starting a second public proxy. Route the entire hostname to port 5000, preserve authorization headers, allow 2 MB request bodies, and allow at least 120 seconds for AI requests. Configure `TRUST_PROXY_HOPS` to match the real proxy topology. Do not expose the backend directly when trusting proxy headers. The supplied in-memory rate limiter assumes one app replica; use a shared edge limiter before scaling replicas.

Do not add `X-Frame-Options: SAMEORIGIN` to the taskpane: Excel web embeds it. Server liveness is available at `/api/health`; this endpoint does not prove database or AI credentials work.

## Windows, Mac and web

The app uses Office.js and requires ExcelApi 1.9. It has no COM, ActiveX or Windows-only backend dependency. VBA output is source text for manual review; the add-in does not run macros.

Download the generated `https://YOUR_DOMAIN/manifest.xml` after deployment. Do not distribute the template manifest's old Replit URLs. For organizational rollout, use Microsoft 365 centralized add-in deployment.

For Mac development sideloading, place the downloaded XML in:

```text
~/Library/Containers/com.microsoft.Excel/Data/Documents/wef/
```

Create `wef` if needed, restart Excel, and use the add-ins/developer add-ins menu to open it. Follow Microsoft's current [Mac sideloading instructions](https://learn.microsoft.com/en-us/office/dev/add-ins/testing/sideload-an-office-add-in-on-mac) and [Excel requirement-set compatibility table](https://learn.microsoft.com/en-us/javascript/api/requirement-sets/excel/excel-api-requirement-sets). Test Windows and web installation using their supported manifest upload or centralized deployment flow.

## Release acceptance

Use a disposable workbook on Windows Excel, Mac Excel and Excel web:

1. Sign in, verify usage display and password recovery, and confirm API keys are never present in taskpane requests or static files.
2. Select a range with a duplicate row, blank, whitespace and `=1/0`. Click ✓ and check the counts and error address.
3. Ask to write literals, set formulas, clean text, and undo. Confirm original formulas survive undo and cleaning. Check non-A1 starting ranges and non-English sheet names.
4. Insert/delete rows and columns in a table with data outside column A and row 1. Confirm cells remain aligned.
5. Ask about data outside a sampled snapshot. The agent must read further ranges or state it lacks evidence.
6. Test failed/invalid formulas, protected cells, unknown tool calls and Stop while planning or awaiting the provider. Subsequent actions must not execute after a failure. Stop does not roll back an already-running Excel operation.
7. Test simultaneous requests around the quota boundary. Verify counts do not bypass the limit and Pro reset is correct.
8. Open `/api/health`, `/taskpane.html`, `/agent-safety.js`, `/agent-runtime.js`, `/icon.png` and `/manifest.xml` over HTTPS. Check the manifest points only at the new origin.

Verification performed locally: Node syntax checks, unit/HTTP/Office-double regression tests, dependency audit, and browser startup/recovery controls. Real Supabase migrations, live AI calls, actual Excel clients and the Docker build still require server/staging validation. GitHub Actions is configured for Linux, Windows and macOS Node checks; it has not run yet.

## Remaining limits

- Safeguards reduce errors but cannot guarantee zero hallucinations or validate every natural-language assertion.
- The existing bearer-token browser-storage login remains; a full session-management redesign is outside this upgrade. Registration also retains the existing immediate email confirmation behavior. Enable verified sign-up before a public paid launch.
- Browser libraries still load from external CDNs and require network availability; backend `npm audit` does not cover those script assets. Review and update PDF/XLSX parsing dependencies before processing untrusted public uploads at scale.
- Payment integration is unfinished. Webhooks return 501 instead of claiming success. Do not enable paid checkout until signature verification and subscription lifecycle handling are implemented.
- Undo is session-local and covers values/formulas/cleaning only. Keep workbook backups for destructive operations. Coauthor edits can invalidate an undo snapshot.

Rollback: retain the previous application image and database backup. Prefer rolling back the app image only; do not restore the insecure profile update policy. Do not use `docker compose down -v` for a routine rollback.
