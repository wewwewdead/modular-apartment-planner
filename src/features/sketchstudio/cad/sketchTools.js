import { arcGeometry, roundPoint, samePoint } from './sketchProfile.js';
import { evaluateEntry } from './parameters.js';
import { formatMm } from './marks.js';
import {
  describeDimension,
  describePick,
  dimensionPick,
  linearDimension,
  nextDimensionNumber,
  pruneDimensions,
  radialDimension,
} from './sketchDimensions.js';

// The in-viewport sketcher as a pure state machine. Clicks arrive already
// snapped; typed HUD values are turned into the equivalent click, so a typed
// rectangle and a clicked one take the same path.
export const SKETCH_TOOLS = [
  ['line', 'Line'],
  ['rect', 'Rectangle'],
  ['rect-center', 'Center rectangle'],
  ['circle', 'Circle'],
  ['arc', '3-point arc'],
  ['dimension', 'Dimension'],
];

// `parameters` are resolved parameter values: typed "=width-2*t" is
// evaluated against them and stored as a plain number. `dimensions` are the
// sketch's reference dimensions (sketchDimensions.js), `boundary` the model
// edges in the plane a dimension's second click can read square to.
export function createSketchState(entities = [], parameters = {}, dimensions = [], boundary = []) {
  const highest = entities.reduce((max, e) => Math.max(max, Number(String(e.id).replace(/\D/g, '')) || 0), 0);
  return {
    entities,
    parameters,
    nextId: highest + 1,
    tool: null,
    points: [],
    chainStart: null,
    cursor: null,
    typed: {},
    field: 0,
    selectedId: null,
    message: '',
    dimensions,
    boundary,
    nextDimensionId: nextDimensionNumber(dimensions),
    selectedDimensionId: null,
    // The Dimension tool's span or circle waiting for its place click.
    pending: null,
    // What this session added, oldest first ({ kind: 'entity' | 'dimension', id }), for Undo last.
    added: [],
  };
}

// The Dimension tool's step: 'first', 'second' (a point held) or 'place'.
export const dimensionStep = (state) => (state.pending ? 'place' : state.points.length ? 'second' : 'first');

// What a Dimension tool click at `located` would take ({ point, kind, raw,
// tolerance, shift }), given the step the state is at.
const pickAt = (state, located) =>
  dimensionPick({
    point: located.point,
    kind: located.kind,
    raw: located.raw || located.point,
    tolerance: located.tolerance || 0,
    entities: state.entities,
    boundary: state.boundary || [],
    first: state.points[0] || null,
    shift: Boolean(located.shift),
  });
// The cursor as the last move left it.
const hoverOf = (state) =>
  state.cursor && {
    point: state.cursor,
    kind: state.snapKind,
    raw: state.raw,
    tolerance: state.tolerance,
    shift: state.shift,
  };

/**
 * The dimension a place click at `at` would keep: { dimension } or { error }
 * (a linear one with no extent in the direction the cursor chooses); null
 * when nothing is pending.
 */
export function pendingDimension(state, at = state.cursor) {
  const pending = state.pending;
  if (!pending || !at) return null;
  const id = `d${state.nextDimensionId}`;
  if (pending.type === 'circle') return { dimension: radialDimension({ id, ...pending, at }) };
  try {
    return { dimension: linearDimension({ id, from: pending.from, to: pending.to, at }) };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * The box by the cursor while the Dimension tool is on: { value, note } or
 * null (hidden). First step: the entity a click would dimension; second: the
 * distance and axis deltas to the point a click would take; place: the kind
 * and value it would keep.
 */
export function dimensionReadout(state) {
  const hover = hoverOf(state);
  if (state.tool !== 'dimension' || !hover) return null;
  const step = dimensionStep(state);
  if (step === 'place') {
    const result = pendingDimension(state);
    if (!result) return null;
    if (result.error) return { value: result.error, note: 'Esc drops it' };
    return { value: describeDimension(result.dimension), note: 'click to keep · Esc drops it' };
  }
  const pick = pickAt(state, hover);
  if (step === 'first') {
    const words = describePick(pick);
    return words ? { value: words, note: '' } : null;
  }
  if (pick.type === 'refused') return { value: pick.message, note: '' };
  const [first] = state.points;
  const [dx, dy] = [pick.point[0] - first[0], pick.point[1] - first[1]];
  return {
    value: `${formatMm(Math.hypot(dx, dy))} mm · ΔX ${formatMm(dx)} · ΔY ${formatMm(dy)}`,
    note: '',
  };
}

// The message Finish shows instead of finishing ('' when it may finish).
export const finishRefusal = (state) =>
  !state.entities.length && state.dimensions.length
    ? 'Dimensions are kept with a drawing: draw the outline first, or Cancel sketch to leave.'
    : '';

// HUD fields for the current step: coordinates for a first point, then the
// dimension that step defines. The Dimension tool has none (a readout instead).
export function sketchFields(state) {
  if (!state.tool || state.tool === 'dimension') return [];
  if (!state.points.length || state.tool === 'arc') return ['X', 'Y'];
  if (state.tool === 'line') return ['Length', 'Angle'];
  if (state.tool === 'circle') return ['Radius'];
  return ['Width', 'Height'];
}

const angleOf = (from, to) => (Math.atan2(to[1] - from[1], to[0] - from[0]) * 180) / Math.PI;

// What the HUD shows while the cursor moves (placeholders until typed).
export function liveValues(state) {
  const c = state.cursor;
  if (!state.tool || state.tool === 'dimension' || !c) return {};
  const p = state.points[0];
  if (!state.points.length || state.tool === 'arc') return { X: c[0], Y: c[1] };
  if (state.tool === 'line') return { Length: Math.hypot(c[0] - p[0], c[1] - p[1]), Angle: angleOf(p, c) };
  if (state.tool === 'circle') return { Radius: Math.hypot(c[0] - p[0], c[1] - p[1]) };
  const factor = state.tool === 'rect-center' ? 2 : 1;
  return { Width: Math.abs(c[0] - p[0]) * factor, Height: Math.abs(c[1] - p[1]) * factor };
}

const POSITIVE = new Set(['Length', 'Width', 'Height', 'Radius']);
// Typed values override live ones; returns the point a click would have hit.
export function typedPoint(state) {
  const live = liveValues(state);
  const values = {};
  for (const field of sketchFields(state)) {
    const text = String(state.typed[field] ?? '').trim();
    if (text === '') {
      values[field] = live[field] ?? 0;
      continue;
    }
    const { value, error } = evaluateEntry(text, state.parameters || {});
    if (error || value == null) throw new Error(`${field}: ${error || 'must be a number.'}`);
    if (POSITIVE.has(field) && value <= 0) throw new Error(`${field} must be greater than zero.`);
    values[field] = value;
  }
  const p = state.points[0];
  const c = state.cursor || p || [0, 0];
  if (!state.points.length || state.tool === 'arc') return roundPoint([values.X, values.Y]);
  if (state.tool === 'line') {
    const angle = (values.Angle * Math.PI) / 180;
    return roundPoint([p[0] + values.Length * Math.cos(angle), p[1] + values.Length * Math.sin(angle)]);
  }
  if (state.tool === 'circle') {
    const length = Math.hypot(c[0] - p[0], c[1] - p[1]);
    const direction = length > 1e-9 ? [(c[0] - p[0]) / length, (c[1] - p[1]) / length] : [1, 0];
    return roundPoint([p[0] + direction[0] * values.Radius, p[1] + direction[1] * values.Radius]);
  }
  // Rectangles open toward the cursor's quadrant, like typed sizes in Fusion.
  const sx = c[0] < p[0] ? -1 : 1,
    sy = c[1] < p[1] ? -1 : 1;
  const factor = state.tool === 'rect-center' ? 0.5 : 1;
  return roundPoint([p[0] + sx * values.Width * factor, p[1] + sy * values.Height * factor]);
}

const hasTyped = (state) => Object.values(state.typed).some((v) => String(v ?? '').trim() !== '');
const reset = (state, patch = {}) => ({ ...state, typed: {}, field: 0, message: '', ...patch });
const add = (state, entity, patch) =>
  reset(state, {
    entities: [...state.entities, { id: `e${state.nextId}`, ...entity }],
    nextId: state.nextId + 1,
    added: [...(state.added || []), { kind: 'entity', id: `e${state.nextId}` }],
    ...patch,
  });
// An entity leaves the drawing (Delete, Undo last): the dimensions that hung on it go with it.
const removeEntity = (state, id, patch = {}) => {
  const removed = state.entities.find((e) => e.id === id);
  const entities = state.entities.filter((e) => e.id !== id);
  return reset(state, {
    entities,
    dimensions: pruneDimensions(state.dimensions || [], removed, entities),
    ...patch,
  });
};

// Dimension tool (docs/sketch-studio-sketch-dimensions.md §3.3): first a
// point, a line / rectangle side or a circle / arc; with a point held, the
// second point; then the place click keeps it. The click's own snap kind,
// raw point, tolerance and Shift decide what it takes (dimensionPick).
function dimensionClick(state, action) {
  const step = dimensionStep(state);
  if (step === 'place') {
    const result = pendingDimension(state, roundPoint(action.point));
    if (result.error) return { ...state, message: result.error };
    const { dimension } = result;
    return reset(state, {
      dimensions: [...state.dimensions, dimension],
      nextDimensionId: state.nextDimensionId + 1,
      added: [...state.added, { kind: 'dimension', id: dimension.id }],
      pending: null,
      points: [],
    });
  }
  const pick = pickAt(state, action);
  if (pick.type === 'refused') return { ...state, message: pick.message };
  if (step === 'second')
    return reset(state, { points: [], pending: { type: 'span', from: state.points[0], to: pick.point } });
  if (pick.type === 'point') return reset(state, { points: [pick.point] });
  return reset(state, { pending: pick });
}

// Undo last: the last thing this session added that is still there, entity
// or dimension; with none recorded (a sketch just reopened) the last entity,
// then the last dimension.
function undo(state) {
  const added = [...(state.added || [])];
  const exists = ({ kind, id }) =>
    (kind === 'entity' ? state.entities : state.dimensions || []).some((item) => item.id === id);
  let last = null;
  while (added.length && !last) {
    const item = added.pop();
    if (exists(item)) last = item;
  }
  if (!last && state.entities.length) last = { kind: 'entity', id: state.entities.at(-1).id };
  if (!last && state.dimensions?.length) last = { kind: 'dimension', id: state.dimensions.at(-1).id };
  if (!last) return state;
  const patch = { added, points: [], chainStart: null, pending: null };
  if (last.kind === 'dimension')
    return reset(state, {
      ...patch,
      dimensions: state.dimensions.filter((d) => d.id !== last.id),
      selectedDimensionId: state.selectedDimensionId === last.id ? null : state.selectedDimensionId,
    });
  return removeEntity(state, last.id, patch);
}

function click(state, point) {
  const p = roundPoint(point);
  const [first] = state.points;
  switch (state.tool) {
    case 'line': {
      if (!first) return reset(state, { points: [p], chainStart: p });
      // A second click on the same spot (double-click) ends the polyline.
      if (samePoint(p, first)) return reset(state, { points: [], chainStart: null });
      const closes = state.chainStart && samePoint(p, state.chainStart);
      const end = closes ? state.chainStart : p;
      return add(
        state,
        { type: 'line', a: first, b: end },
        closes ? { points: [], chainStart: null } : { points: [end] },
      );
    }
    case 'rect':
    case 'rect-center': {
      if (!first) return reset(state, { points: [p] });
      const a = state.tool === 'rect' ? first : roundPoint([2 * first[0] - p[0], 2 * first[1] - p[1]]);
      if (Math.abs(p[0] - a[0]) < 1e-6 || Math.abs(p[1] - a[1]) < 1e-6)
        return { ...state, message: 'A rectangle needs a nonzero width and height.' };
      return add(state, { type: 'rect', a, b: p }, { points: [] });
    }
    case 'circle': {
      if (!first) return reset(state, { points: [p] });
      const r = Math.hypot(p[0] - first[0], p[1] - first[1]);
      if (r < 1e-6) return { ...state, message: 'A circle needs a nonzero radius.' };
      return add(state, { type: 'circle', c: first, r: Math.round(r * 1e6) / 1e6 }, { points: [] });
    }
    case 'arc': {
      if (state.points.length < 2) {
        if (first && samePoint(p, first)) return { ...state, message: 'Pick a different end point.' };
        return reset(state, { points: [...state.points, p] });
      }
      const [a, b] = state.points;
      if (!arcGeometry(a, p, b)) return { ...state, message: 'The third point must not lie on the chord.' };
      return add(state, { type: 'arc', a, b, m: p }, { points: [] });
    }
    default:
      return state;
  }
}

export function sketchReducer(state, action) {
  switch (action.type) {
    case 'tool':
      return reset(state, {
        tool: action.tool,
        points: [],
        chainStart: null,
        selectedId: null,
        selectedDimensionId: null,
        pending: null,
      });
    case 'move':
      // The raw point, tolerance and Shift let the Dimension tool say what a click would take.
      return {
        ...state,
        cursor: action.point,
        snapKind: action.kind,
        raw: action.raw || action.point,
        tolerance: action.tolerance || 0,
        shift: Boolean(action.shift),
      };
    case 'click':
      if (state.tool === 'dimension') return dimensionClick({ ...state, cursor: action.point }, action);
      return click({ ...state, cursor: action.point }, action.point);
    case 'typed':
      return { ...state, typed: { ...state.typed, [action.field]: action.value }, message: '' };
    case 'field': {
      const count = sketchFields(state).length || 1;
      return { ...state, field: ((action.index % count) + count) % count };
    }
    case 'enter': {
      // Enter does nothing in the Dimension tool.
      if (!state.tool || state.tool === 'dimension') return state;
      if (!hasTyped(state)) {
        // Enter with nothing typed finishes a polyline, as in Fusion.
        if (state.tool === 'line') return reset(state, { points: [], chainStart: null });
        return state;
      }
      try {
        return click(state, typedPoint(state));
      } catch (error) {
        return { ...state, message: error.message };
      }
    }
    case 'finish-chain':
      return reset(state, { points: [], chainStart: null });
    case 'escape':
      // First Esc drops the tool (and any half-drawn shape); the sketcher
      // treats Esc with no tool as "exit sketch". A half-made dimension goes
      // first: its first point, or the dimension waiting for its place click.
      if (state.tool === 'dimension' && (state.pending || state.points.length))
        return reset(state, { pending: null, points: [] });
      if (state.tool) return reset(state, { tool: null, points: [], chainStart: null, pending: null });
      return reset(state, { selectedId: null, selectedDimensionId: null });
    case 'select':
      // One thing selected at a time: an entity or a dimension.
      return { ...state, selectedId: action.id ?? null, selectedDimensionId: action.dimensionId ?? null };
    case 'delete':
      if (state.selectedDimensionId)
        return reset(state, {
          dimensions: state.dimensions.filter((d) => d.id !== state.selectedDimensionId),
          selectedDimensionId: null,
        });
      if (!state.selectedId) return state;
      return removeEntity(state, state.selectedId, { selectedId: null });
    case 'undo':
      return undo(state);
    case 'message':
      return { ...state, message: action.text };
    default:
      throw new Error(`Unknown sketch action: ${action.type}`);
  }
}

// Rubber-band geometry for the current step, following typed values first.
export function previewEntities(state) {
  if (!state.tool || !state.points.length || !state.cursor) return [];
  // Dimension, second step: a rubber band to the point a click would take.
  if (state.tool === 'dimension') {
    const pick = pickAt(state, hoverOf(state));
    return pick.type === 'point' ? [{ id: 'preview', type: 'line', a: state.points[0], b: pick.point }] : [];
  }
  let c = state.cursor;
  if (hasTyped(state))
    try {
      c = typedPoint(state);
    } catch {
      /* keep the cursor preview while a typed value is invalid */
    }
  const [p, q] = state.points;
  if (state.tool === 'line') return [{ id: 'preview', type: 'line', a: p, b: c }];
  if (state.tool === 'rect') return [{ id: 'preview', type: 'rect', a: p, b: c }];
  if (state.tool === 'rect-center')
    return [{ id: 'preview', type: 'rect', a: [2 * p[0] - c[0], 2 * p[1] - c[1]], b: c }];
  if (state.tool === 'circle')
    return [{ id: 'preview', type: 'circle', c: p, r: Math.hypot(c[0] - p[0], c[1] - p[1]) }];
  if (state.tool === 'arc') {
    if (!q) return [{ id: 'preview', type: 'line', a: p, b: c }];
    return arcGeometry(p, c, q)
      ? [{ id: 'preview', type: 'arc', a: p, b: q, m: c }]
      : [{ id: 'preview', type: 'line', a: p, b: q }];
  }
  return [];
}
