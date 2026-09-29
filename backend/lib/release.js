const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ASSETS = ['agent-safety.js', 'agent-runtime.js', 'model-routing.js', 'routing-settings.js', 'gemini-protocol.js', 'provider-checks.js', 'addin-updates.js'];
function loadRelease(root) {
  const release = JSON.parse(fs.readFileSync(path.join(root, 'backend/app-release.json'), 'utf8'));
  const html = fs.readFileSync(path.join(root, 'addin/taskpane.html'), 'utf8');
  const hash = crypto.createHash('sha256');
  hash.update(JSON.stringify(release));
  for (const file of ['taskpane.html', ...ASSETS]) hash.update(file).update(fs.readFileSync(path.join(root, 'addin', file), 'utf8').replace(/\r\n/g, '\n'));
  const info = { version: release.version, notes: release.notes, build: hash.digest('hex').slice(0, 20) };
  return { info, html: html.replaceAll('__APP_BUILD__', info.build).replaceAll('__APP_VERSION__', info.version) };
}
module.exports = { ASSETS, loadRelease };
