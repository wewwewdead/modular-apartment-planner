// The sketcher's modes as one definition (sketchMode.js): every action the
// reducer has, sent at random from a fixed seed, never leaves a state that
// breaks a mode's rules; the actions that leave every mode spread NO_MODE and
// do exactly what their hand-written lists did, with the relief readout
// cleared as well; and the window's Esc asks sketchMode what its own list asked.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NO_MODE, modeViolations, sketchMode } from './sketchMode.js';
import { SELECTION_ACTIONS, SKETCH_TOOLS, createSketchState, sketchFields, sketchReducer } from './sketchTools.js';
import { checkDrawing } from './sketchCheck.js';
import { redo as historyRedo, undo as historyUndo } from './sketchHistory.js';
import { inDrawingOrder } from './sketchSelect.js';

// The seeded generator of sketchCheck.test.js.
const random = (seed) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

// An L outline (an inside corner at (50, 50) for Relief), a hole, a tiny
// circle Check offers to remove (a diameter dimension hangs on it alone), and
// a free line to mirror about, trim and extend.
const lines = (points) =>
  points.map((p, i) => ({ id: `e${i + 1}`, type: 'line', a: p, b: points[(i + 1) % points.length] }));
const DRAWING = [
  ...lines([
    [0, 0],
    [100, 0],
    [100, 50],
    [50, 50],
    [50, 100],
    [0, 100],
  ]),
  { id: 'e7', type: 'circle', c: [25, 25], r: 8 },
  { id: 'e8', type: 'circle', c: [25, 75], r: 0.002 },
  { id: 'e9', type: 'line', a: [120, 0], b: [120, 100] },
];
const DIMENSIONS = [
  { id: 'd1', type: 'radial', mode: 'diameter', center: [25, 75], radius: 0.002, at: [25, 90] },
  { id: 'd2', type: 'linear', from: [0, 0], to: [100, 0], orientation: 'horizontal', offset: -10 },
];
// The inside corner five times over: Relief cuts only there.
const SPOTS = [
  [0, 0],
  [100, 0],
  [100, 50],
  [50, 50],
  [50, 50],
  [50, 50],
  [50.3, 50.2],
  [50.3, 50.2],
  [50, 100],
  [0, 100],
  [25, 25],
  [33, 25],
  [25, 75],
  [120, 0],
  [120, 50],
  [120, 100],
  [75, 25],
  [60, 60],
  [-20, -20],
  [140, 120],
];
const KINDS = ['endpoint', 'midpoint', 'center', 'on sketch', 'grid', 'free'];
const TOOLS = [...SKETCH_TOOLS.map(([tool]) => tool), 'zero', null];
const OPS = SELECTION_ACTIONS.map(([kind]) => kind);

// Every action type of sketchReducer, with inputs of the kind the component sends.
const actionsFor = (rand) => {
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const at = () => {
    const point = pick(SPOTS);
    return { point, raw: point, kind: pick(KINDS), tolerance: 2, shift: rand() < 0.2, angleStep: pick([0, 1, 15]) };
  };
  return {
    tool: () => ({ type: 'tool', tool: pick(TOOLS) }),
    move: () => ({ type: 'move', ...at() }),
    click: () => ({ type: 'click', ...at() }),
    shapes: () => ({
      type: 'shapes',
      ...pick([{ radius: null }, { radius: 3 }, { sides: 5 }, { fillet: 2 }, { offset: 3 }]),
    }),
    op: () => ({ type: 'op', kind: pick(OPS) }),
    'op-option': () => ({ type: 'op-option', patch: pick([{ keep: true }, { keep: false }, { remove: true }]) }),
    'mirror-zero': () => ({ type: 'mirror-zero', axis: pick(['vertical', 'horizontal']) }),
    pattern: () => ({
      type: 'pattern',
      patch: pick([
        { kind: 'row', count: 2 },
        { kind: 'grid', columns: 2, rows: 2 },
        { kind: 'circle', count: 3 },
      ]),
    }),
    'pattern-apply': () => ({ type: 'pattern-apply' }),
    drag: () => ({ type: 'drag', grab: pick(SPOTS), to: pick(SPOTS) }),
    'drag-end': () => ({ type: 'drag-end' }),
    'drag-cancel': () => ({ type: 'drag-cancel' }),
    relief: () => ({ type: 'relief', shape: pick(['square', 'round', 'obround', 'rect']) }),
    typed: (state) => ({
      type: 'typed',
      field: pick(sketchFields(state).length ? sketchFields(state) : ['X']),
      value: pick(['', '10', '-5', '0', '=3*2', 'abc']),
    }),
    field: () => ({ type: 'field', index: Math.floor(rand() * 4) }),
    enter: () => ({ type: 'enter' }),
    'finish-chain': () => ({ type: 'finish-chain' }),
    escape: () => ({ type: 'escape' }),
    select: (state) =>
      rand() < 0.3 && state.dimensions.length
        ? { type: 'select', dimensionId: pick(state.dimensions).id }
        : { type: 'select', id: rand() < 0.8 ? pick(state.entities)?.id || null : null, toggle: rand() < 0.3 },
    'select-all': () => ({ type: 'select-all' }),
    box: () => ({
      type: 'box',
      from: pick(SPOTS),
      to: pick(SPOTS),
      mode: pick(['inside', 'touching']),
      add: rand() < 0.3,
    }),
    'box-end': () => ({ type: 'box-end' }),
    'box-cancel': () => ({ type: 'box-cancel' }),
    'select-ids': (state) => ({ type: 'select-ids', ids: state.entities.filter(() => rand() < 0.4).map((e) => e.id) }),
    'zero-reset': () => ({ type: 'zero-reset' }),
    fix: (state) => {
      const fixable = checkDrawing(state.entities).problems.filter((problem) => problem.fix);
      return { type: 'fix', problem: fixable.length ? pick(fixable) : { kind: 'branch' } };
    },
    delete: () => ({ type: 'delete' }),
    edit: (state) => ({
      type: 'edit',
      id: state.selectedIds[0] || pick(state.entities)?.id || 'e1',
      patch: pick([{ diameter: 6 }, { x1: 5 }, { length: 30 }]),
    }),
    construction: () => ({ type: 'construction' }),
    undo: () => ({ type: 'undo' }),
    redo: () => ({ type: 'redo' }),
    message: () => ({ type: 'message', text: 'A note.' }),
  };
};

// Walks of WALK steps from the drawing, each begun with the next tool on,
// each action type as likely as any other except the ones that make or meet
// a selection, which come more often; a tool or an action chosen is most
// often used next, click after click, as a hand would.
const WALKS = 32;
const WALK = 150;
const OFTEN = ['select', 'click', 'move', 'fix', 'undo', 'escape', 'op', 'tool'];
function walk(seed, visit) {
  const rand = random(seed);
  const actions = actionsFor(rand);
  const types = [...Object.keys(actions), ...OFTEN, ...OFTEN];
  for (let w = 0; w < WALKS; w++) {
    let state = sketchReducer(createSketchState(DRAWING, {}, DIMENSIONS), {
      type: 'tool',
      tool: TOOLS[w % TOOLS.length],
    });
    const trail = ['tool'];
    for (let s = 0; s < WALK; s++) {
      const used = ['tool', 'op', 'click'].includes(trail.at(-1)) && rand() < 0.6;
      const action = actions[used ? 'click' : types[Math.floor(rand() * types.length)]](state);
      state = sketchReducer(state, action);
      trail.push(action.type);
      visit(state, trail);
    }
  }
}

describe('the sketcher’s modes', () => {
  it('sends every action type of the reducer', () => {
    const source = readFileSync(new URL('./sketchTools.js', import.meta.url), 'utf8');
    const reducer = source.slice(
      source.indexOf('export function sketchReducer'),
      source.indexOf('// Rubber-band geometry'),
    );
    const handled = [...reducer.matchAll(/^ {4}case '([^']+)'/gm)].map((match) => match[1]);
    expect(handled.length).toBeGreaterThan(30);
    expect([...handled].sort()).toEqual(Object.keys(actionsFor(random(1))).sort());
  });

  it('keeps every mode’s rules after each action of a seeded random walk', () => {
    // Each rule broken, with the last few actions that broke it the first time.
    const broken = new Map();
    // And that the walk went through every mode and the corners where the rules were once broken.
    const seen = new Set();
    walk(20261121, (state, trail) => {
      for (const rule of modeViolations(state)) if (!broken.has(rule)) broken.set(rule, trail.slice(-6).join(' → '));
      seen.add(sketchMode(state));
      if (state.reliefCut) seen.add('a relief cut');
      if (state.selectedDimensionId) seen.add('a dimension selected');
      if (state.op?.copies?.length) seen.add('copies made');
      if (trail.at(-1) === 'fix' && !state.message) seen.add('a fix');
    });
    expect(Object.fromEntries(broken)).toEqual({});
    expect([...seen].sort()).toEqual([
      'a dimension selected',
      'a fix',
      'a relief cut',
      'action',
      'box',
      'copies made',
      'drag',
      'idle',
      'selection',
      'tool',
    ]);
  });

  it('answers Esc’s question as the window’s own list did, for every combination', () => {
    // The window handler's list before sketchMode: with none of these Esc finishes the sketch.
    const escapeTakes = (s) =>
      Boolean(s.box || s.drag || s.op || s.tool || s.selectedIds.length || s.selectedDimensionId);
    for (let mask = 0; mask < 64; mask++) {
      const state = {
        box: mask & 1 ? { from: [0, 0], to: [1, 1] } : null,
        drag: mask & 2 ? { grab: [0, 0], to: [1, 1] } : null,
        op: mask & 4 ? { kind: 'move', step: 'base' } : null,
        tool: mask & 8 ? 'line' : null,
        selectedIds: mask & 16 ? ['e1'] : [],
        selectedDimensionId: mask & 32 ? 'd1' : null,
      };
      expect(sketchMode(state) !== 'idle').toBe(escapeTakes(state));
    }
    expect(sketchMode(createSketchState())).toBe('idle');
  });

  it('names the mode in Esc’s order', () => {
    const base = createSketchState(DRAWING, {}, DIMENSIONS);
    expect(sketchMode({ ...base, selectedDimensionId: 'd1' })).toBe('selection');
    expect(sketchMode({ ...base, selectedIds: ['e7'] })).toBe('selection');
    expect(sketchMode({ ...base, tool: 'relief' })).toBe('tool');
    expect(sketchMode({ ...base, selectedIds: ['e7'], op: { kind: 'move', step: 'base' } })).toBe('action');
    expect(sketchMode({ ...base, selectedIds: ['e7'], drag: { grab: [0, 0], to: [1, 1] } })).toBe('drag');
    expect(sketchMode({ ...base, box: { from: [0, 0], to: [1, 1] } })).toBe('box');
  });

  it('says which rule a state breaks', () => {
    const base = createSketchState(DRAWING, {}, DIMENSIONS);
    expect(modeViolations(base)).toEqual([]);
    expect(modeViolations({ ...base, tool: 'line', selectedIds: ['e7'] })).toEqual(['a tool with a selection']);
    expect(modeViolations({ ...base, tool: 'line', box: { from: [0, 0], to: [1, 1] } })).toEqual([
      'a box under a tool or an action',
    ]);
    expect(modeViolations({ ...base, op: { kind: 'move', step: 'base' } })).toEqual([
      'an action with nothing selected',
    ]);
    expect(modeViolations({ ...base, selectedDimensionId: 'd9' })).toEqual([
      'a selected dimension that no longer exists',
    ]);
    expect(modeViolations({ ...base, tool: 'line', reliefCut: { text: 'Square 4 × 4' } })).toEqual([
      'a relief readout outside Relief',
    ]);
    expect(modeViolations({ ...base, offsetFrom: 'e99', tool: 'offset' })).toEqual([
      'an Offset choice outside Offset or of an entity gone',
    ]);
  });
});

// The hand-written resets NO_MODE replaced, frozen as they were (with the
// helpers they used), to compare with the reducer as it is now.
const reset = (state, patch = {}) => ({ ...state, typed: {}, field: 0, message: '', ...patch });
const chosenIds = (state, ids) =>
  ids.length === state.selectedIds.length && ids.every((id, i) => id === state.selectedIds[i])
    ? state.selectedIds
    : ids;
const hasTyped = (state) => Object.values(state.typed).some((v) => String(v ?? '').trim() !== '');
const FIRST_STEP = { move: 'base', copy: 'base', rotate: 'center', mirror: 'first', pattern: 'numbers' };
const BEFORE = {
  tool: (state, action) =>
    reset(state, {
      tool: action.tool,
      points: [],
      chainStart: null,
      selectedIds: [],
      selectedDimensionId: null,
      pending: null,
      box: null,
      op: null,
      drag: null,
      offsetFrom: null,
    }),
  'select-all': (state) =>
    reset(state, {
      tool: null,
      points: [],
      chainStart: null,
      pending: null,
      box: null,
      op: null,
      drag: null,
      offsetFrom: null,
      selectedIds: chosenIds(
        state,
        state.entities.map((e) => e.id),
      ),
      selectedDimensionId: null,
    }),
  'select-ids': (state, action) =>
    reset(state, {
      tool: null,
      points: [],
      chainStart: null,
      pending: null,
      box: null,
      op: null,
      drag: null,
      offsetFrom: null,
      selectedIds: chosenIds(state, inDrawingOrder(state.entities, action.ids || [])),
      selectedDimensionId: null,
    }),
  // An action's start with none running and something selected (the other paths did not change).
  op: (state, action) =>
    reset(state, {
      tool: null,
      points: [],
      chainStart: null,
      pending: null,
      box: null,
      drag: null,
      offsetFrom: null,
      op: { kind: action.kind, step: FIRST_STEP[action.kind], ...(action.kind === 'copy' ? { copies: [] } : {}) },
    }),
  // Esc's tool rung: no box, drag, action, half-made dimension or Offset choice before it.
  escape: (state) => reset(state, { tool: null, points: [], chainStart: null, pending: null, offsetFrom: null }),
  undo: (state) => stepHistoryBefore(state, 'undo'),
  redo: (state) => stepHistoryBefore(state, 'redo'),
};
function stepHistoryBefore(state, direction) {
  const moved = direction === 'redo' ? historyRedo(state) : historyUndo(state);
  const halfDrawn =
    state.points.length > 0 ||
    Boolean(state.pending) ||
    Boolean(state.chainStart) ||
    hasTyped(state) ||
    Boolean(state.op) ||
    Boolean(state.drag) ||
    Boolean(state.offsetFrom);
  const transient = {
    points: [],
    chainStart: null,
    pending: null,
    box: null,
    reliefCut: null,
    op: null,
    drag: null,
    offsetFrom: null,
  };
  if (!moved) return halfDrawn ? reset(state, transient) : state;
  const present = new Set(moved.entities.map((e) => e.id));
  const kept = state.selectedIds.filter((id) => present.has(id));
  return reset(moved, {
    ...transient,
    selectedIds: kept.length === state.selectedIds.length ? state.selectedIds : kept,
    selectedDimensionId: moved.dimensions.some((d) => d.id === state.selectedDimensionId)
      ? state.selectedDimensionId
      : null,
  });
}
const escapeReachesTool = (s) =>
  !s.box && !s.drag && !s.op && !(s.tool === 'dimension' && (s.pending || s.points.length)) && !s.offsetFrom && s.tool;

describe('NO_MODE in place of the hand-written resets', () => {
  it('is every mode field at rest, the selection apart', () => {
    expect(NO_MODE).toEqual({
      tool: null,
      points: [],
      chainStart: null,
      pending: null,
      offsetFrom: null,
      reliefCut: null,
      box: null,
      op: null,
      drag: null,
    });
    expect(Object.isFrozen(NO_MODE) && Object.isFrozen(NO_MODE.points)).toBe(true);
  });

  it('changes nothing but the relief readout, over the states of the walk', () => {
    const states = [];
    walk(7, (state) => states.push(state));
    let compared = 0;
    for (const state of states.filter((_, i) => i % 3 === 0)) {
      const same = (action, cleared = { reliefCut: null }) => {
        expect(sketchReducer(state, action)).toEqual({ ...BEFORE[action.type](state, action), ...cleared });
        compared++;
      };
      for (const tool of TOOLS) same({ type: 'tool', tool });
      same({ type: 'select-all' });
      same({ type: 'select-ids', ids: state.entities.filter((_, i) => i % 2).map((e) => e.id) });
      if (!state.op && state.selectedIds.length) for (const kind of OPS) same({ type: 'op', kind });
      if (escapeReachesTool(state)) same({ type: 'escape' });
      // Undo and Redo already cleared every mode field but the tool: nothing changes.
      same({ type: 'undo' }, {});
      same({ type: 'redo' }, {});
    }
    expect(compared).toBeGreaterThan(10000);
  });
});
