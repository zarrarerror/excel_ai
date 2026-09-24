(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AgentSafety = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const MAX_CELLS = 20000;
  function columnName(index) {
    let out = '';
    for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) out = String.fromCharCode(65 + (n - 1) % 26) + out;
    return out;
  }
  function parseRange(address) {
    const match = typeof address === 'string' && /^\$?([A-Z]{1,3})\$?([1-9]\d*)(?::\$?([A-Z]{1,3})\$?([1-9]\d*))?$/i.exec(address);
    if (!match) throw new Error('Use a bounded A1 cell range, without a sheet prefix.');
    const col = s => [...s.toUpperCase()].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
    const row = Number(match[2]) - 1, column = col(match[1]);
    const lastRow = Number(match[4] || match[2]) - 1, lastColumn = col(match[3] || match[1]);
    if (lastRow < row || lastColumn < column || lastRow >= 1048576 || lastColumn >= 16384) throw new Error('Range exceeds Excel bounds or is reversed.');
    const rows = lastRow - row + 1, columns = lastColumn - column + 1;
    if (rows * columns > MAX_CELLS) throw new Error('Range exceeds the 20,000 cell limit; use smaller batches.');
    return { row, column, rows, columns };
  }
  function validateSchema(value, schema, path) {
    if (schema.enum && !schema.enum.includes(value)) throw new Error(path + ' has an unsupported value.');
    if (schema.type === 'object') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(path + ' must be an object.');
      for (const key of schema.required || []) if (value[key] === undefined || value[key] === null || value[key] === '') throw new Error(path + '.' + key + ' is required.');
      for (const key of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(schema.properties || {}, key)) throw new Error(path + '.' + key + ' is not supported.');
        validateSchema(value[key], schema.properties[key], path + '.' + key);
      }
    } else if (schema.type === 'array') {
      if (!Array.isArray(value)) throw new Error(path + ' must be an array.');
      value.forEach((item, i) => validateSchema(item, schema.items || {}, path + '[' + i + ']'));
    } else if (schema.type === 'integer') {
      if (!Number.isSafeInteger(value)) throw new Error(path + ' must be an integer.');
    } else if (schema.type && (typeof value !== schema.type || (schema.type === 'number' && !Number.isFinite(value)))) {
      throw new Error(path + ' must be ' + schema.type + '.');
    }
  }
  function matrix(data) {
    if (!Array.isArray(data) || !data.length || !Array.isArray(data[0]) || !data[0].length) throw new Error('A nonempty rectangular cell matrix is required.');
    const columns = data[0].length;
    if (data.length * columns > MAX_CELLS) throw new Error('Cell matrix exceeds the 20,000 cell limit.');
    for (const row of data) {
      if (!Array.isArray(row) || row.length !== columns) throw new Error('Cell matrix must be rectangular; missing cells will not be silently padded.');
      for (const value of row) if (value !== null && !['string', 'number', 'boolean'].includes(typeof value) || typeof value === 'number' && !Number.isFinite(value) || typeof value === 'string' && value.length > 32767) throw new Error('Unsupported cell value.');
    }
    return { rows: data.length, columns };
  }
  function validateTool(name, args, definitions) {
    const definition = definitions.find(t => t.function.name === name);
    if (!definition) throw new Error('Unknown tool: ' + name);
    validateSchema(args, definition.function.parameters, name);
    for (const key of ['range', 'cell', 'start', 'source_range', 'dataRange']) {
      if (!args[key]) continue;
      // Whole rows/columns are useful only for layout tools and don't load cell data.
      if (['auto_fit', 'set_column_width'].includes(name) && /^(?:\$?[A-Z]{1,3}:\$?[A-Z]{1,3}|[1-9]\d*:[1-9]\d*)$/i.test(args[key])) continue;
      parseRange(args[key]);
    }
    for (const key of ['rowIndex', 'columnIndex', 'count', 'rows', 'columns']) {
      if (args[key] !== undefined && (!Number.isSafeInteger(args[key]) || args[key] < (key === 'count' ? 1 : 0) || args[key] > (key === 'count' ? 20000 : 1048575))) throw new Error(key + ' is outside the supported bounds.');
    }
    if (args.rowIndex !== undefined && args.rowIndex + (args.count || 1) > 1048576 || args.columnIndex !== undefined && args.columnIndex + (args.count || 1) > 16384) throw new Error('Operation exceeds Excel bounds.');
    if (name === 'write_range' || name === 'set_formulas_range') {
      const size = matrix(args.values || args.formulas), origin = parseRange(args.range);
      if (origin.row + size.rows > 1048576 || origin.column + size.columns > 16384) throw new Error('Write exceeds Excel bounds.');
      if (name === 'set_formulas_range') for (const row of args.formulas) for (const f of row) formula(f);
    }
    if (name === 'set_formula') {
      const cell = parseRange(args.cell);
      if (cell.rows !== 1 || cell.columns !== 1) throw new Error('set_formula requires one cell.');
      formula(args.formula);
    }
    if (name === 'smart_fill') {
      const origin = parseRange(args.start);
      if (origin.rows !== 1 || origin.columns !== 1 || origin.row + args.count > 1048576) throw new Error('Fill exceeds Excel bounds.');
    }
    return args;
  }
  function formula(value) {
    if (typeof value !== 'string' || !value.startsWith('=')) throw new Error('Formula must start with =.');
    if (/\b(?:WEBSERVICE|RTD|HYPERLINK)\s*\(|\[[^\]]+\][^!]*!|\|[^!]*!/i.test(value)) throw new Error('External-link and network formulas are not supported by the agent.');
  }
  function literal(value) { return typeof value === 'string' && /^[=+\-@]/.test(value) ? "'" + value : value === null ? '' : value; }
  function audit(values, formulas, startRow, startColumn, hasHeader) {
    const report = { dataRows: Math.max(0, values.length - (hasHeader ? 1 : 0)), blankCells: 0, duplicateRows: 0, whitespaceCells: 0, formulaErrors: [], errorsTruncated: false };
    const seen = new Set();
    values.forEach((row, r) => {
      if (hasHeader && r === 0) return;
      if (row.some(v => v !== '' && v !== null)) {
        const key = JSON.stringify(row);
        if (seen.has(key)) report.duplicateRows++;
        seen.add(key);
      }
      row.forEach((v, c) => {
        if (v === '' || v === null) report.blankCells++;
        if (typeof v === 'string' && v !== v.trim()) report.whitespaceCells++;
        const f = formulas && formulas[r] && formulas[r][c];
        if (typeof f === 'string' && f.startsWith('=') && typeof v === 'string' && /^#(?:REF!|DIV\/0!|VALUE!|N\/A|NAME\?|NUM!|NULL!|SPILL!|CALC!|GETTING_DATA|BUSY!|CONNECT!|BLOCKED!|FIELD!|UNKNOWN!)/.test(v)) {
          if (report.formulaErrors.length < 100) report.formulaErrors.push({ cell: columnName(startColumn + c) + (startRow + r + 1), error: v, formula: f });
          else report.errorsTruncated = true;
        }
      });
    });
    return report;
  }
  return { MAX_CELLS, parseRange, validateTool, matrix, formula, literal, audit, columnName };
});
