import { arcGeometry, roundPoint, samePoint } from './sketchProfile.js';
import { evaluateEntry } from './parameters.js';

// The in-viewport sketcher as a pure state machine. Clicks arrive already
// snapped; typed HUD values are turned into the equivalent click, so a typed
// rectangle and a clicked one take the same path.
export const SKETCH_TOOLS = [
  ['line', 'Line'],
  ['rect', 'Rectangle'],
  ['rect-center', 'Center rectangle'],
  ['circle', 'Circle'],
  ['arc', '3-point arc'],
];

// `parameters` are resolved parameter values: typed "=width-2*t" is
// evaluated against them and stored as a plain number.
export function createSketchState(entities = [], parameters = {}) {
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
  };
}

// HUD fields for the current step: coordinates for a first point, then the
// dimension that step defines.
export function sketchFields(state) {
  if (!state.tool) return [];
  if (!state.points.length || state.tool === 'arc') return ['X', 'Y'];
  if (state.tool === 'line') return ['Length', 'Angle'];
  if (state.tool === 'circle') return ['Radius'];
  return ['Width', 'Height'];
}

const angleOf = (from, to) => (Math.atan2(to[1] - from[1], to[0] - from[0]) * 180) / Math.PI;

// What the HUD shows while the cursor moves (placeholders until typed).
export function liveValues(state) {
  const c = state.cursor;
  if (!state.tool || !c) return {};
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
    ...patch,
  });

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
      return reset(state, { tool: action.tool, points: [], chainStart: null, selectedId: null });
    case 'move':
      return { ...state, cursor: action.point, snapKind: action.kind };
    case 'click':
      return click({ ...state, cursor: action.point }, action.point);
    case 'typed':
      return { ...state, typed: { ...state.typed, [action.field]: action.value }, message: '' };
    case 'field': {
      const count = sketchFields(state).length || 1;
      return { ...state, field: ((action.index % count) + count) % count };
    }
    case 'enter': {
      if (!state.tool) return state;
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
      // treats Esc with no tool as "exit sketch".
      if (state.tool) return reset(state, { tool: null, points: [], chainStart: null });
      return reset(state, { selectedId: null });
    case 'select':
      return { ...state, selectedId: action.id };
    case 'delete':
      if (!state.selectedId) return state;
      return reset(state, {
        entities: state.entities.filter((e) => e.id !== state.selectedId),
        selectedId: null,
      });
    case 'undo':
      if (!state.entities.length) return state;
      return reset(state, { entities: state.entities.slice(0, -1), points: [], chainStart: null });
    default:
      throw new Error(`Unknown sketch action: ${action.type}`);
  }
}

// Rubber-band geometry for the current step, following typed values first.
export function previewEntities(state) {
  if (!state.tool || !state.points.length || !state.cursor) return [];
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
