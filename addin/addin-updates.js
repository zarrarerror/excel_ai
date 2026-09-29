(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AddinUpdates = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function create(options) {
    let available = null, dismissed = '', checking = false, lastCheck = 0;
    function render() {
      const visible = available && available.build !== dismissed;
      options.render({ available: visible ? available : null, blocked: options.blocked() });
    }
    async function check(manual = false) {
      if (checking || (!manual && Date.now() - lastCheck < 30000)) return;
      checking = true; lastCheck = Date.now();
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await options.fetch('/api/version', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Update check unavailable. Try again shortly.');
        const info = await response.json();
        if (!/^[a-f0-9]{20}$/.test(info.build) || !/^\d+\.\d+\.\d+$/.test(info.version) || !Array.isArray(info.notes)) throw new Error('Update information is unavailable.');
        available = info.build !== options.build ? { build: info.build, version: info.version, notes: info.notes.filter(x => typeof x === 'string').slice(0, 5).map(x => x.slice(0, 240)) } : null;
        if (manual) { dismissed = ''; options.notify(available ? 'An update is available.' : 'You are using the latest version (' + info.version + ').'); }
        render();
      } catch (_) { if (manual) options.notify('Could not check for updates. Check your connection and try again.'); }
      finally { checking = false; clearTimeout(timer); }
    }
    function update() {
      if (!available) return false;
      const blocked = options.blocked();
      if (blocked) { options.notify(blocked); return false; }
      // Saving the draft must succeed before navigation; failure leaves the pane untouched.
      if (options.saveDraft() === false) { options.notify('Your draft or settings could not be saved. Keep this pane open and save your changes before updating.'); return false; }
      options.navigate(available.build);
      return true;
    }
    function dismiss() { if (available) dismissed = available.build; render(); }
    return { check, update, dismiss, render };
  }
  return { create };
});
