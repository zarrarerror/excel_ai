const test = require('node:test');
const assert = require('node:assert/strict');
const safety = require('../../addin/agent-safety');
const definitions = [{ type: 'function', function: { name: 'write_range', parameters: {
  type: 'object', properties: { sheet: { type: 'string' }, range: { type: 'string' }, values: { type: 'array', items: { type: 'array', items: {} } } }, required: ['sheet', 'range', 'values']
} } }];

test('rejects unknown tools and missing or malformed arguments', () => {
  assert.throws(() => safety.validateTool('invented', {}, definitions), /Unknown/);
  assert.throws(() => safety.validateTool('write_range', {}, definitions), /sheet/);
  assert.throws(() => safety.validateTool('write_range', { sheet: 'Sheet1', range: 'A1', values: [[1], [2, 3]] }, definitions), /rectangular/);
  assert.throws(() => safety.validateTool('write_range', { sheet: 'Sheet1', range: 'A1', values: [[{}]] }, definitions), /cell/);
});
test('prevents oversized and out-of-bounds writes', () => {
  assert.throws(() => safety.parseRange('XFE1'), /bounds/);
  assert.throws(() => safety.parseRange('A0'), /range/);
  assert.throws(() => safety.parseRange('A1:XFD1048576'), /limit/);
  assert.throws(() => safety.validateTool('write_range', { sheet: 'Sheet1', range: 'XFD1048576', values: [[1, 2]] }, definitions), /bounds/);
});
test('literal data cannot become an Excel formula', () => {
  assert.equal(safety.literal('=WEBSERVICE("https://example.com")'), "'=WEBSERVICE(\"https://example.com\")");
  assert.equal(safety.literal(-10), -10);
  assert.equal(safety.literal('hello'), 'hello');
});
test('audit distinguishes blanks, exact duplicate rows and Excel errors', () => {
  const audit = safety.audit([['Item', 'Amount'], ['A', 1], ['A', 1], [' B ', '#DIV/0!'], ['', 0]], [['Item','Amount'],['A',1],['A',1],[' B ','=1/0'],['',0]], 4, 2, true);
  assert.equal(audit.dataRows, 4);
  assert.equal(audit.duplicateRows, 1);
  assert.equal(audit.blankCells, 1);
  assert.equal(audit.whitespaceCells, 1);
  assert.deepEqual(audit.formulaErrors, [{ cell: 'D8', error: '#DIV/0!', formula: '=1/0' }]);
});

test('diagnosis samples explicit references without treating strings or table columns as cells', () => {
  assert.deepEqual(safety.formulaReferences('=B23+B25+B26', 'PR'), [{ sheet: 'PR', range: 'B23' }, { sheet: 'PR', range: 'B25' }, { sheet: 'PR', range: 'B26' }]);
  assert.deepEqual(safety.formulaReferences('=SUM(\'Tax Rates\'!$B$2:$B$5)+IF(A1="Z99",0,A1)+Table1[A55]', 'PR'), [{ sheet: 'Tax Rates', range: 'B2:B5' }, { sheet: 'PR', range: 'A1' }]);
  assert.deepEqual(safety.formulaReferences('=SUM(A1:A10000)', 'PR'), []);
});

test('formula write targets use the actual matrix extent', () => {
  assert.equal(safety.writeTarget('set_formula', { sheet: 'PR', cell: '$B$27', formula: '=1' }).range, 'B27:B27');
  assert.equal(safety.writeTarget('set_formulas_range', { sheet: 'PR', range: 'B27', formulas: [['=1', '=2'], ['=3', '=4']] }).range, 'B27:C28');
});
