const test = require('node:test');
const assert = require('node:assert/strict');
const AddinUpdates = require('../../addin/addin-updates');
function harness() {
  const state = { build: 'a'.repeat(20), remote: { build: 'b'.repeat(20), version: '2.2.0', notes: ['Model routing'] }, blocked: '', saved: true, renders: [], notices: [], navigations: [] };
  const updater = AddinUpdates.create({ build: state.build,
    fetch: async () => { if (state.failed) throw new Error('offline'); return { ok: true, json: async () => state.remote }; },
    blocked: () => state.blocked, render: value => state.renders.push(value), notify: value => state.notices.push(value),
    saveDraft: () => state.saved, navigate: build => state.navigations.push(build)
  });
  return { state, updater };
}
test('new build prompts for a user-triggered reload; task, draft and settings guards prevent unsafe reloads', async () => {
  const { state, updater } = harness(); await updater.check();
  assert.equal(state.renders.at(-1).available.build, state.remote.build); assert.deepEqual(state.navigations, []);
  state.blocked = 'Finish current task'; assert.equal(updater.update(), false);
  state.blocked = 'Save settings'; assert.equal(updater.update(), false);
  state.blocked = ''; state.saved = false; assert.equal(updater.update(), false); assert.deepEqual(state.navigations, []);
  state.saved = true; assert.equal(updater.update(), true); assert.deepEqual(state.navigations, [state.remote.build]);
});
test('Later dismisses only that build; manual check resurfaces it, and equal builds report current', async () => {
  const { state, updater } = harness(); await updater.check(); updater.dismiss(); assert.equal(state.renders.at(-1).available, null);
  await updater.check(true); assert.ok(state.renders.at(-1).available);
  updater.dismiss(); state.remote = { ...state.remote, build: 'c'.repeat(20) }; await updater.check(true); assert.equal(state.renders.at(-1).available.build, 'c'.repeat(20));
  state.remote.build = state.build; await updater.check(true); assert.equal(state.renders.at(-1).available, null); assert.match(state.notices.at(-1), /latest version/);
});
test('offline or malformed update responses cannot reload or show false up-to-date claims', async () => {
  const { state, updater } = harness(); state.failed = true; await updater.check(); assert.deepEqual(state.notices, []);
  await updater.check(true); assert.match(state.notices.at(-1), /Could not check/); assert.equal(updater.update(), false);
  state.failed = false; state.remote.build = 'https://untrusted.example'; await updater.check(true); assert.equal(updater.update(), false);
  assert.deepEqual(state.navigations, []);
});
