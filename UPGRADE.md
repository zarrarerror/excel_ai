# Reliability and self-hosting upgrade

Target: the Pro add-in in `excel_ai_pro/addin`, served by its Node backend.

1. Validate model tool calls before Excel execution, stop on errors, and record execution evidence. Verify with malformed argument, range boundary, and failed action tests.
2. Add a deterministic data-quality audit; bound workbook snapshots and retain exact addresses. Preserve formulas during write undo. Verify using fixtures and an Office API test double.
3. Fix server file routing, same-origin configuration, API error handling and provider timeouts. Verify with HTTP integration tests and mocked provider responses.
4. Package Docker/HTTPS deployment and Mac installation instructions for Hermes. Verify JavaScript syntax, tests and dependency audit. Actual Excel Mac and live server checks require those environments.

No claim of zero hallucinations: model explanations remain probabilistic. Recorded tool results, input validation and readback provide evidence about actual actions.
