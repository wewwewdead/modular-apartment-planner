import { numeric } from './model.js';

// Named parameters: validation, per-row resolution, references ("used by"),
// rename/replace, paste lists and merging (presets, paste) by name.

export const PARAMETER_NAME = /^[A-Za-z_][A-Za-z_0-9]*$/;

export function validateParameterName(name, parameters = [], id = null) {
  const text = String(name ?? '').trim();
  if (!text) return 'Enter a name.';
  if (!PARAMETER_NAME.test(text))
    return 'Use letters, digits and _ only, starting with a letter or _ (e.g. backT, shelf_gap).';
  if (parameters.some((p) => p.id !== id && p.name === text)) return `"${text}" is already a parameter.`;
  return '';
}

// Typed text → stored value: plain numbers are numbers, anything else is kept
// as an expression string (with or without the leading "=").
export function parseParameterValue(text) {
  if (typeof text === 'number') return text;
  const trimmed = String(text ?? '')
    .trim()
    .replace(/\s*mm$/i, '');
  if (trimmed === '') return '';
  const number = Number(trimmed);
  return Number.isFinite(number) ? number : trimmed;
}

const IDENTIFIER = /[A-Za-z_][A-Za-z_0-9]*/g;
const identifiers = (value) => (typeof value === 'string' ? value.replace(/^=/, '').match(IDENTIFIER) || [] : []);

// Each row resolved on its own, so one bad row does not hide the others:
// { [id]: { value } | { error } } with invalid, duplicate, missing and
// circular references named.
export function resolveParameterRows(parameters = []) {
  const byName = new Map();
  const duplicates = new Set();
  for (const p of parameters) {
    if (byName.has(p.name)) duplicates.add(p.name);
    else byName.set(p.name, p);
  }
  const results = {};
  const values = Object.create(null);
  const resolve = (p, stack) => {
    if (results[p.id]) return results[p.id];
    if (!PARAMETER_NAME.test(p.name || '')) return (results[p.id] = { error: 'Invalid name' });
    if (duplicates.has(p.name)) return (results[p.id] = { error: `Duplicate name "${p.name}"` });
    if (stack.includes(p.name))
      return (results[p.id] = { error: `Circular: ${[...stack.slice(stack.indexOf(p.name)), p.name].join(' → ')}` });
    if (p.value === '' || p.value == null) return (results[p.id] = { error: 'Enter a value' });
    for (const name of identifiers(p.value)) {
      const dependency = byName.get(name);
      if (!dependency) return (results[p.id] = { error: `Unknown parameter "${name}"` });
      const resolved = resolve(dependency, [...stack, p.name]);
      if (resolved.error)
        return (results[p.id] = {
          error: resolved.error.startsWith('Circular') ? resolved.error : `Depends on "${name}" (${resolved.error})`,
        });
    }
    try {
      values[p.name] = numeric(p.value, values, p.name);
      return (results[p.id] = { value: values[p.name] });
    } catch (error) {
      return (results[p.id] = { error: error.message });
    }
  };
  for (const p of parameters) resolve(p, []);
  return results;
}

// Text fields that are never numeric expressions (names, notes, references).
const TEXT_KEYS = new Set([
  'id',
  'name',
  'title',
  'label',
  'note',
  'notes',
  'material',
  'type',
  'revision',
  'tolerance',
  'drawingNumber',
  'drawnBy',
  'date',
  'view',
  'layout',
  'units',
  'size',
  'plane',
  'side',
  'operation',
  'mode',
  'orientation',
  'kind',
  'shape',
  'grain',
  'axis',
  'sourceSide',
  'targetSide',
  'from',
  'to',
  'location',
]);
const isReferenceKey = (key) => TEXT_KEYS.has(key) || /Ids?$/.test(key);
const EXPRESSION = /^[\s\d.A-Za-z_+\-*/()]+$/;
// A model string counts as an expression when it starts with "=", or (outside
// text fields) is made only of expression tokens and contains an operator.
function isExpression(value, key) {
  if (typeof value !== 'string') return false;
  if (value.startsWith('=')) return !/Ids?$/.test(key) && key !== 'id';
  return !isReferenceKey(key) && EXPRESSION.test(value) && /[+\-*/()]/.test(value);
}
const boundary = (name) => new RegExp(`(?<![A-Za-z_0-9.])${name}(?![A-Za-z_0-9.])`, 'g');

// Visit every expression string in the parts of the model that can hold one.
function mapExpressions(model, fn, skipParameterId = null) {
  const walk = (value, key) => {
    if (Array.isArray(value)) return value.map((item) => walk(item, key));
    if (value && typeof value === 'object')
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v, k)]));
    return isExpression(value, key) ? fn(value) : value;
  };
  const next = { ...model };
  for (const key of ['sketches', 'parts', 'instances', 'connections', 'sheets'])
    next[key] = (model[key] || []).map((item) => walk(item, key));
  next.parameters = (model.parameters || []).map((p) =>
    p.id === skipParameterId ? p : { ...p, value: walk(p.value, 'value') },
  );
  return next;
}

// How many model values (including other parameters) reference `name`.
export function parameterUses(model, name, parameterId = null) {
  let count = 0;
  const test = boundary(name);
  mapExpressions(
    model,
    (value) => {
      test.lastIndex = 0;
      if (test.test(value.replace(/^=/, ''))) count++;
      return value;
    },
    parameterId,
  );
  return count;
}

// An expression with no names left is stored as its number.
function settle(text) {
  if (identifiers(text).length) return text;
  try {
    return numeric(text, {});
  } catch {
    return text;
  }
}

export function renameParameter(model, id, name) {
  const parameter = model.parameters.find((p) => p.id === id);
  if (!parameter) throw new Error('That parameter no longer exists.');
  const problem = validateParameterName(name, model.parameters, id);
  if (problem) throw new Error(problem);
  const next = mapExpressions(model, (value) => value.replace(boundary(parameter.name), name.trim()), id);
  next.parameters = next.parameters.map((p) => (p.id === id ? { ...p, name: name.trim() } : p));
  return next;
}

export function deleteParameter(model, id) {
  const parameter = model.parameters.find((p) => p.id === id);
  if (!parameter) throw new Error('That parameter no longer exists.');
  const uses = parameterUses(model, parameter.name, id);
  if (uses)
    throw new Error(
      `${parameter.name} is used by ${uses} value${uses === 1 ? '' : 's'}. Replace the uses with its number first, or change them.`,
    );
  return { ...model, parameters: model.parameters.filter((p) => p.id !== id) };
}

// Replace every use of a parameter with its resolved number, then delete it.
export function replaceParameterWithNumber(model, id) {
  const parameter = model.parameters.find((p) => p.id === id);
  if (!parameter) throw new Error('That parameter no longer exists.');
  const row = resolveParameterRows(model.parameters)[id];
  if (row.error) throw new Error(`${parameter.name} has no value to use: ${row.error}`);
  const literal = String(+row.value.toFixed(9));
  const next = mapExpressions(model, (value) => settle(value.replace(boundary(parameter.name), literal)), id);
  return { ...next, parameters: next.parameters.filter((p) => p.id !== id) };
}

// "width = 800", "t 18", "depth: 500", "toe = 100 mm", "# comment".
export function parsePasteList(text) {
  const entries = [],
    errors = [];
  String(text || '')
    .split(/\r?\n/)
    .forEach((raw, index) => {
      const line = raw.replace(/#.*$/, '').trim();
      if (!line) return;
      const match = line.match(/^([A-Za-z_][A-Za-z_0-9]*)\s*(?:=|:|\s)\s*(.+)$/);
      if (!match) return errors.push(`Line ${index + 1}: expected "name = value".`);
      const value = parseParameterValue(match[2]);
      if (String(value).replace(/^=/, '').trim() === '') return errors.push(`Line ${index + 1}: missing value.`);
      entries.push({ name: match[1], value });
    });
  return { entries, errors };
}

// Add or update by name; existing parameters keep their id (and note unless
// a new one is given), so every reference stays live.
export function mergeParameters(parameters, entries, makeId) {
  const next = [...parameters];
  let added = 0,
    updated = 0;
  for (const entry of entries) {
    const problem = PARAMETER_NAME.test(entry.name) ? '' : `Invalid parameter name: ${entry.name}`;
    if (problem) throw new Error(problem);
    const index = next.findIndex((p) => p.name === entry.name);
    if (index >= 0) {
      next[index] = { ...next[index], value: entry.value, ...(entry.note ? { note: entry.note } : {}) };
      updated++;
    } else {
      next.push({ id: makeId(), name: entry.name, value: entry.value, ...(entry.note ? { note: entry.note } : {}) });
      added++;
    }
  }
  return { parameters: next, added, updated };
}

// Autocomplete for "=" expressions: the identifier being typed before the
// caret and the parameter names that complete it.
export function parameterSuggestions(text, caret, names) {
  const value = String(text ?? '');
  const position = caret ?? value.length;
  if (!value.trimStart().startsWith('=')) return null;
  const before = value.slice(0, position);
  const prefix = before.match(/[A-Za-z_][A-Za-z_0-9]*$/)?.[0] || '';
  // After a digit or ")" a name cannot follow, so stay closed.
  if (!prefix && !/(^\s*=|[+\-*/(]\s*)$/.test(before)) return null;
  const lower = prefix.toLowerCase();
  const starts = names.filter((n) => n.toLowerCase().startsWith(lower));
  const contains = names.filter((n) => !n.toLowerCase().startsWith(lower) && n.toLowerCase().includes(lower));
  const items = [...starts.sort((a, b) => a.length - b.length || a.localeCompare(b)), ...contains];
  if (!items.length) return null;
  return { start: position - prefix.length, end: position, prefix, items };
}

export function insertSuggestion(text, suggestion, name) {
  const value = String(text ?? '');
  return {
    text: value.slice(0, suggestion.start) + name + value.slice(suggestion.end),
    caret: suggestion.start + name.length,
  };
}

// HUD entry: a number, or "=expression" evaluated against parameter values.
export function evaluateEntry(text, values = {}) {
  const trimmed = String(text ?? '').trim();
  if (trimmed === '') return { value: null, error: '' };
  if (!trimmed.startsWith('=')) {
    const number = Number(trimmed);
    return Number.isFinite(number) ? { value: number, error: '' } : { value: null, error: 'Not a number' };
  }
  try {
    return { value: numeric(trimmed, values), error: '' };
  } catch (error) {
    return { value: null, error: error.message.replace(/^Dimension: /, '') };
  }
}
