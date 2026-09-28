const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const AgentSafety = require('../../addin/agent-safety');

// Execute the shipped functions, not a duplicate implementation. Top-level
// browser startup is excluded so these tests need neither Excel nor a DOM.
const html = (fs.readFileSync(path.join(__dirname, '../../addin/taskpane.html'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, '../../addin/agent-runtime.js'), 'utf8')).replace(/\r\n/g, '\n');
function functionSource(name) {
  const start = html.search(new RegExp('^(?:async )?function ' + name + '\\(', 'm'));
  assert.notEqual(start, -1, 'Missing taskpane function ' + name);
  const tail = html.slice(start);
  return tail.slice(0, tail.search(/^}/m) + 1);
}
const definitionStart = html.indexOf('const TOOL_DEFINITIONS = [');
const definitions = html.slice(definitionStart, html.indexOf('\n];', definitionStart) + 3);
const clone = value => JSON.parse(JSON.stringify(value));

function harness() {
  const log = [], operations = [], button = { disabled: true };
  const state = { values: [[3, '=literal']], formulas: [['=SUM(A2:A3)', '=literal']], failSync: false, runs: 0, syncs: 0, row: 0, column: 0 };
  const range = {
    load() {}, getResizedRange() { return this; },
    calculate() { if (state.evaluate) state.values = state.formulas.map(row => row.map(state.evaluate)); },
    get rowIndex() { return state.row; }, get columnIndex() { return state.column; },
    get valueTypes() { return state.values.map(row => row.map(v => typeof v)); },
    get values() { return clone(state.values); },
    set values(value) { state.values = clone(value); state.formulas = clone(value); },
    get formulas() { return clone(state.formulas); },
    set formulas(value) { state.formulas = clone(value); },
    getCell(row, col) { return { set formulas(value) { state.formulas[row][col] = value[0][0]; } }; },
    getEntireRow() { operations.push('entireRow'); return this; },
    getEntireColumn() { operations.push('entireColumn'); return this; },
    insert(direction) { operations.push(['insert', direction]); },
    delete(direction) { operations.push(['delete', direction]); }
  };
  const sheet = { getRange(address) { if (/^[A-Z]+[0-9]/i.test(address)) { const p = AgentSafety.parseRange(address); state.row = p.row; state.column = p.column; } return range; }, getRangeByIndexes(...args) { operations.push(args); return range; } };
  const context = {
    workbook: { worksheets: { getItem: () => sheet } },
    async sync() { state.syncs++; if (state.failSync || state.failOnSync === state.syncs) throw new Error('Simulated Excel sync failure'); }
  };
  const sandbox = vm.createContext({
    AgentSafety, undoStack: [], agentRunning: false, agentMemory: {}, stopRequested: false,
    cfg: { maxIter: 3, requireApproval: false }, _userLanguage: 'en',
    document: { getElementById: () => button },
    Excel: {
      run: async callback => { state.runs++; return callback(context); },
      InsertShiftDirection: { down: 'Down', right: 'Right' },
      DeleteShiftDirection: { up: 'Up', left: 'Left' }
    },
    addMessage: (type, text) => log.push({ type, text }),
    showTyping() {}, updateStatusBar() {}, clearStatusBar() {},
    readWorkbook: async () => ({}), workbookToText: () => 'Sheet1!A1:B1',
    storage: { getItem: () => null }, buildErrorHint: (_tool, _args, message) => message
  });
  vm.runInContext(definitions + '\n' + ['restoreSnapshot', 'snapshotMatches', 'inspectFormula', 'verifyWrittenRanges', 'updateUndoBtn', 'applyUndo', 'executeLegacyTool', 'executeTool', 'runAgent'].map(functionSource).join('\n'), sandbox);
  return { sandbox, state, operations, log, button };
}

test('write and undo restore formulas and preserve literal formula-looking text', async () => {
  const { sandbox, state } = harness();
  // Excel's formulas property contains literal strings as well as formulas.
  state.values = [[3, 'normal']]; state.formulas = [['=SUM(A2:A3)', 'normal']];
  await sandbox.executeTool('write_range', { sheet: 'Sheet1', range: 'A1', values: [[99, '=1+1']] });
  assert.deepEqual(state.values, [[99, "'=1+1"]]);
  assert.equal(sandbox.undoStack.length, 1);
  await sandbox.executeTool('undo_last_action', {});
  assert.deepEqual(state.values, [[3, 'normal']]);
  assert.deepEqual(state.formulas, [['=SUM(A2:A3)', 'normal']]);
  assert.equal(sandbox.undoStack.length, 0);
});

test('failed undo retains its snapshot for retry', async () => {
  const { sandbox, state } = harness();
  await sandbox.executeTool('write_range', { sheet: 'Sheet1', range: 'A1', values: [[99, 'x']] });
  state.failSync = true;
  await assert.rejects(sandbox.executeTool('undo_last_action', {}), /sync failure/);
  assert.equal(sandbox.undoStack.length, 1);
  state.failSync = false;
  await sandbox.executeTool('undo_last_action', {});
  assert.equal(sandbox.undoStack.length, 0);
});

test('undo never turns original formula-looking text into a formula', async () => {
  const { sandbox, state } = harness();
  state.values = [['=literal', 3]];
  state.formulas = [['=literal', '=SUM(A2:A3)']];
  await sandbox.executeTool('write_range', { sheet: 'Sheet1', range: 'A1', values: [[0, 0]] });
  await sandbox.executeTool('undo_last_action', {});
  assert.deepEqual(state.formulas, [["'=literal", '=SUM(A2:A3)']]);
});

test('successful final undo disables the undo button', async () => {
  const { sandbox, button } = harness();
  await sandbox.executeTool('write_range', { sheet: 'Sheet1', range: 'A1', values: [[99, 'x']] });
  assert.equal(button.disabled, false);
  await sandbox.executeTool('undo_last_action', {});
  assert.equal(button.disabled, true);
});

test('snapshot failure cancels write before changing cell values', async () => {
  const { sandbox, state } = harness();
  const original = clone(state.values);
  state.failSync = true;
  await assert.rejects(sandbox.executeTool('write_range', { sheet: 'Sheet1', range: 'A1', values: [[99]] }), /snapshot/);
  assert.deepEqual(state.values, original);
  assert.equal(sandbox.undoStack.length, 0);
});

for (const [tool, index, extent, action, direction] of [
  ['insert_rows', 'rowIndex', 'entireRow', 'insert', 'Down'],
  ['delete_rows', 'rowIndex', 'entireRow', 'delete', 'Up'],
  ['insert_columns', 'columnIndex', 'entireColumn', 'insert', 'Right'],
  ['delete_columns', 'columnIndex', 'entireColumn', 'delete', 'Left']
]) {
  test(tool + ' changes entire rows or columns, including index zero', async () => {
    const { sandbox, operations } = harness();
    await sandbox.executeTool(tool, { sheet: 'Sheet1', [index]: 0, count: 2 });
    assert.deepEqual(operations, [index === 'rowIndex' ? [0, 0, 2, 1] : [0, 0, 1, 2], extent, [action, direction]]);
  });
}

test('invalid tool arguments never enter Excel.run', async () => {
  const { sandbox, state } = harness();
  await assert.rejects(sandbox.executeTool('write_range', { sheet: 'Sheet1', range: 'A1', values: [[1], [2, 3]] }), /rectangular/);
  await assert.rejects(sandbox.executeTool('invented_tool', {}), /Unknown/);
  assert.equal(state.runs, 0);
});

function toolCall(name, args, id) {
  return { id, type: 'function', function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args) } };
}
test('agent stops after a failed tool and never executes later calls or completion', async () => {
  const { sandbox, log } = harness();
  const executed = [];
  let aiCalls = 0;
  sandbox.callAI = async () => {
    aiCalls++;
    return { role: 'assistant', content: '', tool_calls: [
      toolCall('write_range', { sheet: 'Sheet1', range: 'A1', values: [[1]] }, 'one'),
      toolCall('delete_sheet', { name: 'Sheet1' }, 'two'),
      toolCall('task_complete', { summary: 'Everything succeeded.' }, 'three')
    ] };
  };
  sandbox.executeTool = async name => { executed.push(name); throw new Error('Write rejected by Excel'); };
  await sandbox.runAgent('Update workbook');
  assert.deepEqual(executed, ['write_range']);
  assert.equal(aiCalls, 1);
  assert.ok(log.some(message => /failed: write_range/.test(message.text)));
  assert.ok(!log.some(message => message.text === 'Everything succeeded.'));
});

test('malformed AI arguments block all subsequent tools', async () => {
  const { sandbox, state, log } = harness();
  sandbox.callAI = async () => ({ role: 'assistant', content: '', tool_calls: [
    toolCall('write_range', '{broken-json', 'one'),
    toolCall('write_range', { sheet: 'Sheet1', range: 'A1', values: [[2]] }, 'two')
  ] });
  await sandbox.runAgent('Update workbook');
  assert.equal(state.runs, 0);
  assert.ok(log.some(message => /Invalid AI action blocked/.test(message.text)));
});

test('a rejected formula restores the entire batch and leaves earlier undo records intact', async () => {
  const { sandbox, state } = harness();
  state.values = [[7, 8]]; state.formulas = [[7, 8]];
  state.evaluate = f => f === '=1+1' ? 2 : '#VALUE!';
  const previous = { prior: true }; sandbox.undoStack.push(previous);
  await assert.rejects(sandbox.executeTool('set_formulas_range', { sheet: 'Sheet1', range: 'B27', formulas: [['=1+1', '=B23+B25+B26']] }), error => {
    assert.equal(error.code, 'FORMULA_REPAIR_REQUIRED');
    assert.equal(error.diagnostic.rollbackVerified, true);
    assert.equal(error.diagnostic.issues[0].cell, 'C27');
    return true;
  });
  assert.deepEqual(state.values, [[7, 8]]);
  assert.deepEqual(state.formulas, [[7, 8]]);
  assert.equal(sandbox.undoStack.length, 1);
  assert.equal(sandbox.undoStack[0], previous);
});

test('uncertain rollback never enables an automatic retry and retains undo', async () => {
  const { sandbox, state } = harness();
  state.values = [[7]]; state.formulas = [[7]];
  state.evaluate = () => '#VALUE!'; state.failOnSync = 4;
  await assert.rejects(sandbox.executeTool('set_formula', { sheet: 'Sheet1', cell: 'B27', formula: '=B23+B25+B26' }), error => {
    assert.equal(error.code, undefined); assert.match(error.message, /could not be verified/); return true;
  });
  assert.equal(sandbox.undoStack.length, 1);
});

test('agent diagnoses, repairs a rolled-back formula, skips stale actions and verifies before completing', async () => {
  const { sandbox, state, log } = harness();
  state.values = [[0]]; state.formulas = [[0]];
  state.evaluate = f => f === '=B23+B25+B26' ? '#VALUE!' : f === '=SUM(B23,B25,B26)' ? 0 : f;
  sandbox.cfg.maxIter = 6;
  let calls = 0;
  sandbox.callAI = async messages => {
    calls++;
    if (calls === 1) return { role: 'assistant', tool_calls: [
      toolCall('set_formula', { sheet: 'Sheet1', cell: 'B27', formula: '=B23+B25+B26' }, 'bad'),
      toolCall('delete_sheet', { name: 'Sheet1' }, 'stale')
    ] };
    if (calls === 2) {
      const results = messages.filter(m => m.role === 'tool');
      assert.equal(results.length, 2); assert.match(results[0].content, /rollbackVerified/); assert.match(results[1].content, /not_executed/);
      return { role: 'assistant', tool_calls: [toolCall('inspect_formula', { sheet: 'Sheet1', cell: 'B27', formula: '=B23+B25+B26' }, 'diagnose')] };
    }
    if (calls === 3) return { role: 'assistant', tool_calls: [toolCall('set_formula', { sheet: 'Sheet1', cell: 'B27', formula: '=SUM(B23,B25,B26)' }, 'fixed')] };
    return { role: 'assistant', tool_calls: [toolCall('task_complete', { summary: 'Formula repaired.' }, 'done')] };
  };
  await sandbox.runAgent('Fix this form');
  assert.equal(calls, 4);
  assert.deepEqual(state.formulas, [['=SUM(B23,B25,B26)']]);
  assert.ok(log.some(m => /Final check: no Excel formula errors/.test(m.text)));
  assert.ok(log.some(m => m.text === 'Formula repaired.'));
});

test('repair cannot overwrite source data or expand the failed formula target', async () => {
  const { sandbox, state, log } = harness();
  state.values = [[5]]; state.formulas = [[5]]; state.evaluate = () => '#VALUE!';
  sandbox.cfg.maxIter = 3; let calls = 0;
  sandbox.callAI = async () => ({ role: 'assistant', tool_calls: [++calls === 1
    ? toolCall('set_formula', { sheet: 'Sheet1', cell: 'B27', formula: '=1/0' }, 'fail')
    : toolCall('write_range', { sheet: 'Sheet1', range: 'B23', values: [[0]] }, 'unsafe' + calls)] });
  await sandbox.runAgent('Build a form');
  assert.deepEqual(state.values, [[5]]);
  assert.equal(state.runs, 1);
  assert.ok(!log.some(m => /write_range succeeded/.test(m.text)));
});

test('repeated rejected formulas stop after two repair attempts without leaving errors', async () => {
  const { sandbox, state, log } = harness();
  state.values = [[5]]; state.formulas = [[5]]; state.evaluate = () => '#VALUE!';
  sandbox.cfg.maxIter = 10; let calls = 0;
  sandbox.callAI = async () => {
    calls++;
    return { role: 'assistant', tool_calls: [calls % 2
      ? toolCall('set_formula', { sheet: 'Sheet1', cell: 'B27', formula: '=1/0' }, 'bad' + calls)
      : toolCall('read_range', { sheet: 'Sheet1', range: 'B23:B27' }, 'read' + calls)] };
  };
  await sandbox.runAgent('Fix the total');
  assert.equal(calls, 5); assert.deepEqual(state.values, [[5]]);
  assert.ok(log.some(m => /Automatic repair limit reached/.test(m.text)));
});

test('final verification blocks false completion if a later write breaks an earlier total', async () => {
  const { sandbox, log } = harness();
  let calls = 0, checks = 0;
  sandbox.cfg.maxIter = 5;
  sandbox.verifyWrittenRanges = async () => { checks++; return { checkedRanges: ['Sheet1!B27'], formulaErrors: [{ sheet: 'Sheet1', cell: 'B27', error: '#VALUE!' }] }; };
  sandbox.callAI = async () => ({ role: 'assistant', tool_calls: [toolCall('task_complete', { summary: 'Everything is correct.' }, 'done' + ++calls)] });
  await sandbox.runAgent('Complete form');
  assert.equal(checks, 3); assert.equal(calls, 3);
  assert.ok(!log.some(m => m.text === 'Everything is correct.'));
});
