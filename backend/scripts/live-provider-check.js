// Opt-in diagnostic. Sends two small synthetic requests per configured hosted model.
// Prints no credentials, customer data or raw provider responses; creates no accounts.
require('dotenv').config();
const { providerConfig } = require('../lib/provider');
const { createAdapters } = require('../lib/frontend-adapters');
const ModelRouting = require('../../addin/model-routing');
const ProviderChecks = require('../../addin/provider-checks');
async function main() {
  const hosted = providerConfig();
  if (!hosted.key) throw new Error('The hosted provider key is not configured.');
  for (const model of new Set([hosted.fast, hosted.heavy])) {
    const cfg = { mode: 'own', provider: 'compatible', compatible: { key: hosted.key, model, url: hosted.url } };
    const adapters = createAdapters(cfg);
    try {
      const result = await ProviderChecks.run(adapters.callAI, ModelRouting.resolve(cfg));
      console.log(JSON.stringify({ provider: hosted.provider, model, ...result, scope: 'Live API with synthetic data; Excel and browser CORS not tested.' }));
    } catch (error) {
      console.log(JSON.stringify({ provider: hosted.provider, model, ok: false, error: error.message }));
      process.exitCode = 1;
    }
  }
}
main().catch(() => { console.error('Live provider check could not start. Verify server configuration.'); process.exitCode = 1; });
