import { describe, expect, it } from 'vitest';
import { emptyModel, resolveParameters } from './model.js';
import { furnitureExample } from './examples.js';
import {
  deleteParameter,
  evaluateEntry,
  insertSuggestion,
  mergeParameters,
  parameterSuggestions,
  parameterUses,
  parseParameterValue,
  parsePasteList,
  renameParameter,
  replaceParameterWithNumber,
  resolveParameterRows,
  validateParameterName,
} from './parameters.js';
import { PARAMETER_PRESETS, presetById } from './parameterPresets.js';
import { createSketchState, sketchReducer, typedPoint } from './sketchTools.js';

const p = (id, name, value) => ({ id, name, value });
const run = (state, ...actions) => actions.reduce(sketchReducer, state);

describe('parameter names and values', () => {
  it('validates names: pattern and uniqueness (ignoring the row itself)', () => {
    const list = [p('a', 'width', 800), p('b', 't', 18)];
    expect(validateParameterName('depth', list)).toBe('');
    expect(validateParameterName('_x2', list)).toBe('');
    expect(validateParameterName('2x', list)).toMatch(/letters, digits and _/);
    expect(validateParameterName('back T', list)).toMatch(/letters, digits and _/);
    expect(validateParameterName('', list)).toBe('Enter a name.');
    expect(validateParameterName('width', list)).toMatch(/already a parameter/);
    expect(validateParameterName('width', list, 'a')).toBe('');
  });
  it('stores numbers as numbers and expressions as typed', () => {
    expect(parseParameterValue(' 800 ')).toBe(800);
    expect(parseParameterValue('18 mm')).toBe(18);
    expect(parseParameterValue('=width-2*t')).toBe('=width-2*t');
    expect(parseParameterValue('')).toBe('');
  });
  it('resolves every row on its own and names what is wrong', () => {
    const rows = resolveParameterRows([
      p('w', 'width', 900),
      p('t', 't', 18),
      p('in', 'inner', '=width-2*t'),
      p('x', 'x', '=missing+1'),
      p('a', 'a', '=b'),
      p('b', 'b', '=a'),
      p('d1', 'dup', 1),
      p('d2', 'dup', 2),
      p('bad', '9lives', 1),
      p('dep', 'dep', '=x*2'),
    ]);
    expect(rows.in).toEqual({ value: 864 });
    expect(rows.x.error).toBe('Unknown parameter "missing"');
    expect(rows.a.error).toMatch(/^Circular: a → b → a/);
    expect(rows.b.error).toMatch(/^Circular/);
    expect(rows.d1.error).toBe('Duplicate name "dup"');
    expect(rows.bad.error).toBe('Invalid name');
    expect(rows.dep.error).toMatch(/Depends on "x"/);
    // Agrees with the kernel's resolver on a valid set.
    const valid = [p('w', 'width', 900), p('t', 't', 18), p('in', 'inner', '=width-2*t')];
    expect(resolveParameters(valid).inner).toBe(resolveParameterRows(valid).in.value);
  });
});

describe('paste lists', () => {
  it('accepts "=", ":" and space separators, units, comments and expressions', () => {
    const { entries, errors } = parsePasteList(
      'width = 800\nt 18\ndepth: 500\n\n# shelves\ntoe = 100 mm\ninner = =width-2*t\n',
    );
    expect(errors).toEqual([]);
    expect(entries).toEqual([
      { name: 'width', value: 800 },
      { name: 't', value: 18 },
      { name: 'depth', value: 500 },
      { name: 'toe', value: 100 },
      { name: 'inner', value: '=width-2*t' },
    ]);
    expect(parsePasteList('9x = 1\nwidth =').errors).toEqual([
      'Line 1: expected "name = value".',
      'Line 2: missing value.',
    ]);
  });
  it('merges by name: updates keep their id, new names are added', () => {
    let n = 0;
    const merged = mergeParameters(
      [p('id-toe', 'toe', 100)],
      [
        { name: 'rail', value: 60 },
        { name: 'toe', value: 120 },
      ],
      () => `new-${++n}`,
    );
    expect(merged).toEqual({
      parameters: [p('id-toe', 'toe', 120), p('new-1', 'rail', 60)],
      added: 1,
      updated: 1,
    });
  });
});

describe('references: used by, rename, delete, replace with number', () => {
  const model = () => {
    const m = furnitureExample('desk');
    m.parameters.push(p('pin', 'pinInset', '=thickness+2'));
    m.sheets[0].title = 'thickness - width'; // a title is text, never an expression
    return m;
  };
  it('counts every model value that uses a name, including other parameters', () => {
    const m = model();
    expect(parameterUses(m, 'weldGap', 'parameter-weldGap')).toBe(0);
    // Desktop part (=width, =depth, =thickness), its 4 holes (2 × =width-60
    // positions, 2 × =depth-60, 4 × =thickness depth), legs, aprons, desktop
    // placement, and pinInset.
    expect(parameterUses(m, 'thickness', 'parameter-thickness')).toBeGreaterThan(5);
    expect(parameterUses(m, 'pinInset', 'pin')).toBe(0);
    expect(parameterUses({ ...emptyModel(), parameters: [p('a', 'a', 1), p('b', 'b', '=a*2')] }, 'a', 'a')).toBe(1);
    // A name inside another name is not a use.
    expect(parameterUses({ ...emptyModel(), parameters: [p('t', 't', 1), p('b', 'b', '=toe+backT')] }, 't', 't')).toBe(
      0,
    );
  });
  it('refuses to delete a used parameter, deletes an unused one', () => {
    const m = model();
    expect(() => deleteParameter(m, 'parameter-thickness')).toThrow(/thickness is used by \d+ values\. Replace/);
    expect(deleteParameter(m, 'parameter-weldGap').parameters.map((x) => x.name)).not.toContain('weldGap');
  });
  it('replaces uses with the resolved number and keeps the model equivalent', () => {
    const m = model();
    const next = replaceParameterWithNumber(m, 'parameter-thickness');
    expect(next.parameters.map((x) => x.name)).not.toContain('thickness');
    expect(next.parameters.find((x) => x.name === 'pinInset').value).toBe(26); // =24+2 settles to a number
    expect(next.parts.find((x) => x.id === 'top').features[0].height).toBe(24);
    expect(next.instances.find((i) => i.id === 'desktop').position[2]).toBe('=height-24');
    expect(next.sheets[0].title).toBe('thickness - width');
    expect(() => resolveParameters(next.parameters)).not.toThrow();
    expect(parameterUses(next, 'thickness')).toBe(0);
  });
  it('renames a parameter and every use of it', () => {
    const m = model();
    const next = renameParameter(m, 'parameter-thickness', 'boardT');
    expect(next.parameters.find((x) => x.id === 'parameter-thickness').name).toBe('boardT');
    expect(next.parts.find((x) => x.id === 'top').features[0].height).toBe('=boardT');
    expect(next.parameters.find((x) => x.name === 'pinInset').value).toBe('=boardT+2');
    expect(() => renameParameter(m, 'parameter-thickness', 'width')).toThrow(/already a parameter/);
  });
});

describe('design presets', () => {
  it('defines the cabinet, table, steel frame and custom sets', () => {
    expect(presetById('cabinet').parameters.map((x) => [x.name, x.value])).toEqual([
      ['width', 800],
      ['depth', 500],
      ['height', 1800],
      ['t', 18],
      ['backT', 12],
      ['toe', 100],
    ]);
    expect(presetById('table').parameters.map((x) => x.name)).toEqual([
      'width',
      'depth',
      'height',
      'thickness',
      'legSize',
    ]);
    expect(presetById('steel-frame').parameters.map((x) => x.name)).toEqual([
      'width',
      'depth',
      'height',
      'section',
      'wall',
      'weldGap',
      'thickness',
    ]);
    expect(presetById('custom').parameters).toEqual([]);
    expect(PARAMETER_PRESETS.every((x) => x.parameters.every((q) => /^[A-Za-z_]\w*$/.test(q.name)))).toBe(true);
  });
  it('applies over existing parameters in one merge, keeping their ids', () => {
    const existing = [p('keep-width', 'width', 1000), p('other', 'shelfGap', '=t+2')];
    let n = 0;
    const applied = mergeParameters(
      existing,
      presetById('cabinet').parameters.map((x) => ({ ...x, value: x.name === 'width' ? 900 : x.value })),
      () => `new-${++n}`,
    );
    expect(applied.updated).toBe(1);
    expect(applied.added).toBe(5);
    expect(applied.parameters.find((x) => x.name === 'width')).toMatchObject({ id: 'keep-width', value: 900 });
    expect(resolveParameterRows(applied.parameters).other).toEqual({ value: 20 });
  });
});

describe('expression autocomplete and the sketch HUD', () => {
  const names = ['width', 'wall', 't', 'toe', 'backT', 'height'];
  it('suggests names for the identifier at the caret, only in "=" expressions', () => {
    expect(parameterSuggestions('800', 3, names)).toBeNull();
    expect(parameterSuggestions('=', 1, names).items).toEqual(
      names.slice().sort((a, b) => a.length - b.length || a.localeCompare(b)),
    );
    expect(parameterSuggestions('=w', 2, names)).toEqual({ start: 1, end: 2, prefix: 'w', items: ['wall', 'width'] });
    // Names starting with the prefix first (shortest first), then names containing it.
    expect(parameterSuggestions('=width-2*t', 10, names).items).toEqual(['t', 'toe', 'width', 'backT', 'height']);
    expect(parameterSuggestions('=width-2', 8, names)).toBeNull();
    expect(parameterSuggestions('=wid', 4, ['depth'])).toBeNull();
    const s = parameterSuggestions('=wi-2', 3, names);
    expect(insertSuggestion('=wi-2', s, 'width')).toEqual({ text: '=width-2', caret: 6 });
  });
  it('evaluates "=expressions" against parameter values and stores numbers', () => {
    const values = { width: 900, t: 18 };
    expect(evaluateEntry('=width-2*t', values)).toEqual({ value: 864, error: '' });
    expect(evaluateEntry('120', values)).toEqual({ value: 120, error: '' });
    expect(evaluateEntry('=depth', values).error).toMatch(/Unknown reference/);
    let state = run(createSketchState([], values), { type: 'tool', tool: 'rect' }, { type: 'click', point: [0, 0] });
    state = run(state, { type: 'move', point: [10, 10] }, { type: 'typed', field: 'Width', value: '=width-2*t' });
    expect(typedPoint({ ...state, typed: { ...state.typed, Height: '500' } })).toEqual([864, 500]);
    state = run(state, { type: 'typed', field: 'Height', value: '=depth' }, { type: 'enter' });
    expect(state.message).toMatch(/^Height: Unknown reference/);
    state = run(state, { type: 'typed', field: 'Height', value: '500' }, { type: 'enter' });
    expect(state.entities).toEqual([{ id: 'e1', type: 'rect', a: [0, 0], b: [864, 500] }]);
  });
});
