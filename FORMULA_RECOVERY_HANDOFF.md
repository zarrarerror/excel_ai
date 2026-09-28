# Formula recovery update

The reported purchase-requisition run stopped when B27 (`=B23+B25+B26`) returned `#VALUE!`. The old executor left the rejected formula in the sheet and ended the entire task. The referenced values were not supplied with the screenshot, so the exact offending input is not assumed.

Changes:
- Recalculate formula batches, read their actual Excel results, and restore the previous contents when errors are detected. Readback must confirm restoration before any automatic retry is allowed. Ambiguous synchronization or rollback failures stop and retain the undo record.
- Give the agent a structured formula error, cell addresses and diagnostic hints. The new `inspect_formula` tool reads actual types/values and a bounded reference sample without changing source cells.
- Allow at most two formula repair attempts per run, scoped to the rejected formula rectangle after read-only diagnosis. Cancel other tool calls from the failed batch and replan remaining work. Repairs share the same hosted prompt and the existing iteration/call limits.
- Check written ranges again before showing a final success message. This scan is bounded to 30 ranges/20,000 cells and explicitly reports skipped ranges. No formula errors is not proof of correct business assumptions.
- Teach the agent to separate numeric input cells from labels/empty-string formulas, avoid hiding failures with IFERROR or invented zeros, batch changes, and finish requested form layouts with widths, wrapping, headers, number formats and borders.

Validation: 40 Node tests pass, including batch rollback, rollback failure, diagnosis/retry/resume, blocking edits outside a repair target, repair limits, stale action cancellation and final verification. The Excel API operations used remain within the advertised ExcelApi 1.9 minimum (Range.calculate is 1.6).

Deployment: no new migration or credentials. Pull the updated branch, build app, then restart only app, preserving the existing 127.0.0.1:5020 override and nginx. Close/reopen the add-in to load the updated scripts. The old failed workbook is not automatically changed by a deployment; a new prompt must explicitly request its repair. Test in a disposable workbook before using important customer files. Windows/Mac/web integration results must be reported separately from automated tests.

Live status: deployed to the existing app service on port 5020; the public runtime contains FORMULA_REPAIR_REQUIRED and health is OK. A real desktop integration run was attempted in a separate blank workbook but could not be completed because desktop automation mis-targeted controls. The customer's original workbook was not changed; do not report Windows, Mac or web Excel acceptance as passed.
