import { arcGeometry, entitiesToProfile, hitEntity, roundPoint, samePoint } from './sketchProfile.js';
import { acrossFlats, cornerRadiusRefusal, polygonRefusal, slotRefusal } from './sketchShapes.js';
import {
  normalAngle,
  reflection,
  rotation,
  transformDimensions,
  transformEntities,
  transformEntity,
  translation,
} from './sketchTransform.js';
import { PATTERN_LIMIT, defaultPattern, planPattern, withoutCopies } from './sketchPattern.js';
import { evaluateEntry } from './parameters.js';
import { commit, emptyHistory, redo as historyRedo, undo as historyUndo } from './sketchHistory.js';
import { boxSelect, boxSelection, clickSelection, inDrawingOrder } from './sketchSelect.js';
import { editEntity, followDimensions, joinsAt, setConstruction } from './sketchEdit.js';
import { fromZero, storedZero, toZero } from './sketchZero.js';
import { applyFix } from './sketchCheck.js';
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
import { chosenSizes, cutRelief, reliefPick, reliefSizes } from './sketchRelief.js';
import { extendCut, extendPick, fmtMm, trimCut, trimPick } from './sketchTrim.js';
import { chamferCut, cornerPick, filletCut } from './sketchCorner.js';
import { offsetCut, offsetPick } from './sketchOffset.js';
import { DEFAULT_STOCK } from './shopCatalog.js';

// The in-viewport sketcher as a pure state machine. Clicks arrive already
// snapped; typed HUD values are turned into the equivalent click, so a typed
// rectangle and a clicked one take the same path.
export const SKETCH_TOOLS = [
  ['line', 'Line'],
  ['rect', 'Rectangle'],
  ['rect-center', 'Center rectangle'],
  ['circle', 'Circle'],
  ['arc', '3-point arc'],
  // HD-3 (docs/sketch-studio-hand-drawing.md §7.2): one entity each.
  ['slot', 'Slot'],
  ['polygon', 'Polygon'],
  // HD-4 (§8.1, §8.6): the Edit group, each a pick-then-cut tool that stays on.
  ['trim', 'Trim'],
  ['extend', 'Extend'],
  ['fillet', 'Fillet'],
  ['chamfer', 'Chamfer'],
  ['offset', 'Offset'],
  ['dimension', 'Dimension'],
  ['relief', 'Relief'],
];

// The sketch bar's keys (docs/sketch-studio-sketch-shortcuts.md §3): each
// tool's, and Undo last's. The one table the sketcher's key handlers and the
// bar's titles read. Ctrl+Z is Meta+Z as well.
export const SKETCH_KEYS = {
  line: 'L',
  rect: 'R',
  'rect-center': 'Shift+R',
  circle: 'C',
  arc: 'A',
  slot: 'S',
  polygon: 'P',
  trim: 'T',
  extend: 'E',
  fillet: 'F',
  chamfer: 'H',
  offset: 'O',
  dimension: 'D',
  relief: 'B',
  undo: 'Ctrl+Z',
};

// What a key press is in the sketch bar: a tool of SKETCH_KEYS, 'undo', or
// null. Shift counts (Shift+L is no key), Alt is never one; a held tool key
// does not repeat, a held Ctrl+Z goes on undoing.
export function sketchKey(event) {
  const letter = String(event.key ?? '');
  if (letter.length !== 1 || event.altKey) return null;
  const chord = event.ctrlKey || event.metaKey;
  if (event.repeat && !chord) return null;
  const name = `${chord ? 'Ctrl+' : ''}${event.shiftKey ? 'Shift+' : ''}${letter.toUpperCase()}`;
  return Object.keys(SKETCH_KEYS).find((key) => SKETCH_KEYS[key] === name) || null;
}

// HD-1's keys beside the tools' (docs/sketch-studio-hand-drawing.md §3.3):
// Redo, select all, Construction, HD-2's Zero (§6.1) and HD-3's actions on a
// selection (§7.3). Kept apart from SKETCH_KEYS, whose entries are the Draw
// and Mark tools and Undo last.
export const SKETCH_COMMAND_KEYS = {
  redo: ['Ctrl+Y', 'Ctrl+Shift+Z'],
  'select-all': ['Ctrl+A'],
  construction: ['X'],
  zero: ['Z'],
  move: ['M'],
  copy: ['K'],
  rotate: ['Q'],
  mirror: ['I'],
  pattern: ['G'],
};
// The actions on a selection (§7.3), in the selection row's order: [kind, label].
export const SELECTION_ACTIONS = [
  ['move', 'Move'],
  ['copy', 'Copy'],
  ['rotate', 'Rotate'],
  ['mirror', 'Mirror'],
  ['pattern', 'Pattern'],
];
export const isSelectionAction = (command) => SELECTION_ACTIONS.some(([kind]) => kind === command);
// What a key press is besides sketchKey's: 'redo', 'select-all',
// 'construction', 'zero', 'move' … 'pattern' or null. The same rules: Alt is
// never one, a held letter does not repeat, a held chord does; Meta is Ctrl.
export function sketchCommand(event) {
  const letter = String(event.key ?? '');
  if (letter.length !== 1 || event.altKey) return null;
  const chord = event.ctrlKey || event.metaKey;
  if (event.repeat && !chord) return null;
  const name = `${chord ? 'Ctrl+' : ''}${event.shiftKey ? 'Shift+' : ''}${letter.toUpperCase()}`;
  return Object.keys(SKETCH_COMMAND_KEYS).find((key) => SKETCH_COMMAND_KEYS[key].includes(name)) || null;
}
// The tools whose entities Construction (armed) marks.
export const DRAW_TOOLS = new Set(['line', 'rect', 'rect-center', 'circle', 'arc', 'slot', 'polygon']);
// The Edit tools (HD-4, §8.1): no HUD boxes, a readout by the cursor, their sizes in the options row.
export const EDIT_TOOLS = new Set(['trim', 'extend', 'fillet', 'chamfer', 'offset']);

// The shape tools' options (docs/sketch-studio-hand-drawing.md §7.2): the
// slot's width, what its Length means and what its first click is; the
// polygon's sides and what its size means; the rectangles' corner radius
// (null: sharp); HD-4's Fillet radius, Chamfer and Offset distances (§8.1).
// Kept for the session and the next sketch, as Relief's are.
export function mergeShapes(shapes = {}, patch = {}) {
  const next = {
    width: 5,
    slotLength: 'overall',
    slotFirst: 'center',
    sides: 6,
    polygonSize: 'flats',
    radius: null,
    fillet: 5,
    chamfer: 2,
    offset: 5,
  };
  for (const source of [shapes, patch])
    for (const key of Object.keys(next)) if (source && key in source) next[key] = source[key];
  return next;
}

// The Relief tool's settings (docs/sketch-studio-bend-relief.md §3.2): the
// shape, the typed sizes (null = automatic for the sheet) and the sheet the
// automatic sizes come from (`fixed`: a cut part's own). `patch` merges in.
export function mergeRelief(relief = {}, patch = {}) {
  return {
    shape: patch.shape || relief.shape || 'square',
    sizes: { diameter: null, size: null, width: null, depth: null, ...relief.sizes, ...patch.sizes },
    sheet: { thickness: 1.5, stock: DEFAULT_STOCK, ...relief.sheet, ...patch.sheet },
  };
}

// `parameters` are resolved parameter values: typed "=width-2*t" is
// evaluated against them and stored as a plain number. `dimensions` are the
// sketch's reference dimensions (sketchDimensions.js), `boundary` the model
// edges in the plane a dimension's second click can read square to, `relief`
// the Relief tool's settings (mergeRelief), `zero` the stored `sketch.zero`
// (docs/sketch-studio-hand-drawing.md §6.1; absent: the sketch origin),
// `shapes` the shape tools' remembered options (mergeShapes, §7.2).
export function createSketchState(
  entities = [],
  parameters = {},
  dimensions = [],
  boundary = [],
  relief = {},
  zero = null,
  shapes = {},
) {
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
    // The selected entities' ids in drawing order (sketchSelect.js); a dimension is selected alone.
    selectedIds: [],
    message: '',
    dimensions,
    boundary,
    nextDimensionId: nextDimensionNumber(dimensions),
    selectedDimensionId: null,
    // The Dimension tool's span or circle waiting for its place click.
    pending: null,
    // Undo / Redo (sketchHistory.js): this session's steps only, so a sketch
    // just reopened has nothing to undo.
    history: emptyHistory(),
    // Construction armed: what the Draw tools add carries `construction: true`.
    construction: false,
    // A box being dragged with no tool: { from, to, mode: 'inside' | 'touching', add }.
    box: null,
    relief: mergeRelief(relief),
    // What every X, Y shown or typed is measured from (sketch-plane mm); never history.
    zero: storedZero(zero) || [0, 0],
    // The last point a Draw tool placed in this session: where `@` measures from with no point of the tool's own.
    lastPoint: null,
    // HD-3 (§7.2 – §7.4): the shape tools' options; an action on the selection
    // (`op`: { kind, step, … }, never a tool); the selection being dragged
    // ({ grab, to }: nothing moves until the release); Pattern's numbers.
    shapes: mergeShapes(shapes),
    op: null,
    drag: null,
    pattern: defaultPattern(),
    // Rotate's angle step from the cursor (degrees; 0: free): whole degrees with Snap on, 15 with Shift.
    angleStep: 0,
    // HD-4 (§8.5): the entity Offset's first click chose (its id); every way out clears it.
    offsetFrom: null,
  };
}

// The entities selected now, in drawing order.
export const selectedEntities = (state) => {
  const set = new Set(state.selectedIds);
  return set.size ? state.entities.filter((e) => set.has(e.id)) : [];
};
// Construction's button is pressed while it is armed, or, with a selection and
// no tool, while every selected entity is construction.
export const constructionPressed = (state) => {
  const selected = state.tool ? [] : selectedEntities(state);
  return selected.length ? selected.every((e) => e.construction) : Boolean(state.construction);
};
export { canRedo, canUndo } from './sketchHistory.js';

// The sizes the Relief tool cuts with now ({ sizes } or { error }: no sheet to size from).
export function reliefNow(state) {
  const { shape, sizes, sheet } = state.relief || mergeRelief();
  try {
    const auto = reliefSizes(sheet);
    return { sizes: chosenSizes(shape, sizes, auto), auto };
  } catch (error) {
    return { error: error.message };
  }
}

// What a Relief click at `at` ({ point, raw, tolerance }) would do: { cut } or { error }.
function reliefAt(state, at) {
  const { shape } = state.relief;
  const now = reliefNow(state);
  if (now.error) return { error: now.error };
  const pick = reliefPick({
    entities: state.entities,
    raw: at.raw || at.point,
    point: at.point,
    tolerance: at.tolerance || 0,
    shape,
  });
  if (pick.type === 'none') return { error: pick.message };
  try {
    return { cut: cutRelief({ entities: state.entities, pick, shape, sizes: now.sizes, nextId: state.nextId }) };
  } catch (error) {
    return { error: error.message };
  }
}
// The hover's answer, worked out once for the preview and the readout of one state.
let lastHover = { key: null, value: null };
function reliefHover(state) {
  if (state.tool !== 'relief' || !state.cursor) return null;
  const key = [state.entities, state.cursor, state.raw, state.tolerance, state.relief, state.nextId];
  if (lastHover.key && key.every((part, i) => part === lastHover.key[i])) return lastHover.value;
  const value = reliefAt(state, { point: state.cursor, raw: state.raw, tolerance: state.tolerance });
  lastHover = { key, value };
  return value;
}

/**
 * The box by the cursor while the Relief tool is on (§3.2): { value, note }
 * — what a click would cut ("Square 4 × 4") and "click to cut · Esc ends the
 * tool", or the refusal with no note; null without a cursor. Right after a
 * cut, until the cursor moves: "Square 4 × 4 cut" and "Undo last takes it
 * back · Esc ends the tool".
 */
export function reliefReadout(state) {
  const hover = reliefHover(state);
  if (!hover) return null;
  // Just cut, the cursor not moved since: the relief's own corners are under it now.
  const cut = state.reliefCut;
  if (cut && cut.cursor === state.cursor && cut.entities === state.entities)
    return { value: `${cut.text} cut`, note: 'Undo last takes it back · Esc ends the tool' };
  if (hover.error) return { value: hover.error, note: '' };
  return { value: hover.cut.text, note: 'click to cut · Esc ends the tool' };
}

// ---------------------------------------------------------------- the Edit tools (HD-4, §8.1 – §8.5)
// What an Edit tool click at `at` ({ point, raw, tolerance }) would do: { pick,
// result } (sketchTrim.js, sketchCorner.js, sketchOffset.js: the new list and
// what it adds and removes), Offset's first step { pick, choose, pieces }, or
// { error } (with the pick when there is one: a Fillet's rectangle note).
function editAt(state, at) {
  const { tool, entities, nextId, shapes } = state;
  const raw = at.raw || at.point;
  const tolerance = at.tolerance || 0;
  let pick = null;
  try {
    if (tool === 'offset' && state.offsetFrom)
      return {
        result: offsetCut({ entities, id: state.offsetFrom, raw, distance: Number(shapes.offset), nextId }),
      };
    pick =
      tool === 'trim'
        ? trimPick({ entities, raw, tolerance })
        : tool === 'extend'
          ? extendPick({ entities, raw, tolerance })
          : tool === 'offset'
            ? offsetPick({ entities, raw, tolerance })
            : cornerPick({ entities, raw, tolerance, tool });
    if (pick.type === 'none') return { error: pick.message };
    if (tool === 'offset') {
      const { id: _id, ...outline } = entities[pick.index];
      return { pick, choose: pick.id, pieces: [outline] };
    }
    const result =
      tool === 'trim'
        ? trimCut({ entities, pick, nextId })
        : tool === 'extend'
          ? extendCut({ entities, pick, nextId })
          : tool === 'fillet'
            ? filletCut({ entities, pick, radius: Number(shapes.fillet), nextId })
            : chamferCut({ entities, pick, distance: Number(shapes.chamfer), nextId });
    return { pick, result };
  } catch (error) {
    return { pick, error: error.message };
  }
}
// The hover's answer, worked out once per state for the preview, the red cut, the readout and the click.
let lastEdit = { key: null, value: null };
export function editHover(state) {
  if (!EDIT_TOOLS.has(state.tool) || !state.cursor) return null;
  const key = [
    state.tool,
    state.entities,
    state.cursor,
    state.raw,
    state.tolerance,
    state.shapes,
    state.offsetFrom,
    state.nextId,
  ];
  if (lastEdit.key && key.every((part, i) => part === lastEdit.key[i])) return lastEdit.value;
  const value = editAt(state, { point: state.cursor, raw: state.raw, tolerance: state.tolerance });
  lastEdit = { key, value };
  return value;
}
const EDIT_NOTES = {
  trim: 'click to trim · Esc ends the tool',
  extend: 'Esc ends the tool',
  fillet: 'click to round · Esc ends the tool',
  chamfer: 'click to cut the corner · Esc ends the tool',
  offset: 'click to place the copy · Esc lets go of it',
};
/**
 * The box by the cursor while an Edit tool is on (§8.1): { value, note } —
 * what a click does ("Trim 12.5 mm", "click to extend 7.5 mm", "Fillet R5",
 * "Chamfer 2", "Offset 5 mm outward") or the refusal with no note; null
 * without a cursor.
 */
export function editReadout(state) {
  const hover = editHover(state);
  if (!hover) return null;
  if (hover.error) return { value: hover.error, note: '' };
  if (hover.choose)
    return { value: `Offset ${fmtMm(Number(state.shapes.offset))} mm`, note: 'click to choose it · Esc ends the tool' };
  const { text } = hover.result;
  if (state.tool === 'trim' && hover.pick.whole) return { value: text, note: 'Esc ends the tool' };
  return { value: text, note: EDIT_NOTES[state.tool] };
}
// What the click would take away, for the red `cut` piece of the overlay (one array per hover).
const NO_CUT = Object.freeze([]);
export const cutEntities = (state) => editHover(state)?.result?.removed || NO_CUT;
// An Edit tool's click: one history step with the selection empty, the tool
// staying on; Offset's first click only chooses (no step); a refusal is the message.
function editClick(state, action) {
  const done = editAt(state, action);
  if (done.error) return { ...state, message: done.error };
  if (done.choose) return reset(state, { offsetFrom: done.choose });
  const { result } = done;
  let dimensions = state.dimensions;
  // Trim: a dimension on what went that now lies on nothing goes (Delete's rule); Extend: one on the
  // moved end follows it; Fillet, Chamfer and Offset keep every one (§8.1).
  if (state.tool === 'trim')
    dimensions = result.removed.reduce((list, gone) => pruneDimensions(list, gone, result.entities), dimensions);
  if (state.tool === 'extend')
    dimensions = followDimensions(dimensions, state.entities[done.pick.index], result.entities[done.pick.index]);
  return commit(
    state,
    reset(state, { entities: result.entities, nextId: result.nextId, dimensions, selectedIds: [], offsetFrom: null }),
  );
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

// HUD fields for the current step (docs/sketch-studio-hand-drawing.md §6.2),
// in pairs, one row each: X, Y for a first point, every arc point and Zero;
// a Line's next point Length, Angle · X, Y; a Rectangle's second corner
// Width, Height · X, Y (Center rectangle: X, Y is the corner); a Circle's
// size Radius · Diameter. The Dimension and Relief tools have none (a readout instead).
// HD-3 (§7.2, §7.3): a Slot's far end Length, Angle · X, Y; a Polygon's size
// Across flats (or Across corners), Angle · X, Y; Move's and Copy's base ΔX,
// ΔY, their target ΔX, ΔY · X, Y; Rotate's centre X, Y, then its Angle;
// Mirror's axis points X, Y; Pattern none (its numbers are in its row).
const readoutTool = (tool) => tool === 'dimension' || tool === 'relief' || EDIT_TOOLS.has(tool);
const XY = ['X', 'Y'];
const DELTA = ['ΔX', 'ΔY'];
const polygonSizeField = (state) => (state.shapes?.polygonSize === 'corners' ? 'Across corners' : 'Across flats');
function opPairs(op) {
  if (op.kind === 'move' || op.kind === 'copy') return op.step === 'target' ? [DELTA, XY] : [DELTA];
  if (op.kind === 'rotate') return op.step === 'angle' ? [['Angle']] : [XY];
  if (op.kind === 'mirror') return [XY];
  return [];
}
export function sketchPairs(state) {
  if (state.op) return opPairs(state.op);
  if (!state.tool || readoutTool(state.tool)) return [];
  if (!state.points.length || state.tool === 'arc') return [XY];
  if (state.tool === 'line' || state.tool === 'slot') return [['Length', 'Angle'], XY];
  if (state.tool === 'polygon') return [[polygonSizeField(state), 'Angle'], XY];
  if (state.tool === 'circle') return [['Radius'], ['Diameter']];
  return [['Width', 'Height'], XY];
}
// The HUD's boxes in Tab order.
export const sketchFields = (state) => sketchPairs(state).flat();
const typedText = (state, field) => String(state.typed[field] ?? '').trim();
// The pair typed in (typing in one empties the other, so the one typed last), or -1.
export const typedPair = (state) =>
  sketchPairs(state).findIndex((pair) => pair.some((f) => typedText(state, f) !== ''));

const angleOf = (from, to) => (Math.atan2(to[1] - from[1], to[0] - from[0]) * 180) / Math.PI;
const roundValue = (value) => {
  const result = Math.round(value * 1e6) / 1e6;
  return Object.is(result, -0) ? 0 : result;
};
// A polygon's angle within one side's turn, [0, 360 / sides).
const spinOf = (degrees, sides) => {
  const spin = 360 / sides;
  return roundValue((((degrees % spin) + spin) % spin) % spin);
};

// A slot from its first point and a second at `q`: the far end's centre (the
// first click the centre) or the other end's (the first click one end).
// With `values` ({ Length, Angle }) those numbers exactly, Length read as the
// option says (overall or centre to centre). { entity } or { error }.
function slotFrom(state, q, values = null) {
  const [p] = state.points;
  const { width, slotLength, slotFirst } = state.shapes;
  const fromEnd = slotFirst === 'end';
  let length, angle;
  if (values) {
    length = slotLength === 'centers' ? values.Length + width : values.Length;
    angle = values.Angle;
  } else {
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d < 1e-6) return { error: "Pick a different point for the slot's other end." };
    length = (fromEnd ? d : 2 * d) + width;
    angle = angleOf(p, q);
  }
  angle = normalAngle(angle);
  const t = (angle * Math.PI) / 180,
    reach = (length - width) / 2;
  const c = fromEnd ? roundPoint([p[0] + Math.cos(t) * reach, p[1] + Math.sin(t) * reach]) : p;
  const entity = { type: 'slot', c, length: roundValue(length), width, angle };
  const error = slotRefusal(entity);
  return error ? { error } : { entity };
}
// A polygon from its centre and a flat's middle (or a corner) at `q`; with
// `values` ({ Across flats | Across corners, Angle }) those numbers exactly.
function polygonFrom(state, q, values = null) {
  const [p] = state.points;
  const { sides, polygonSize } = state.shapes;
  const corners = polygonSize === 'corners';
  let size, angle;
  if (values) {
    size = values[polygonSizeField(state)];
    angle = roundValue(values.Angle);
  } else {
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d < 1e-6) return { error: 'Pick a different point for the size.' };
    size = 2 * d;
    angle = spinOf(angleOf(p, q) + 90 + (corners ? 180 / sides : 0), sides);
  }
  const entity = { type: 'polygon', c: p, sides, af: roundValue(corners ? acrossFlats(size, sides) : size), angle };
  const error = polygonRefusal(entity);
  return error ? { error } : { entity };
}
// The second click a slot or polygon answers to: the slot's far (or other)
// end centre, the polygon's flat middle (or corner) at its angle.
function secondPointOf(state, entity) {
  const t = (deg) => (deg * Math.PI) / 180;
  if (entity.type === 'slot') {
    const reach = (entity.length - entity.width) / 2;
    return roundPoint([
      entity.c[0] + Math.cos(t(entity.angle)) * reach,
      entity.c[1] + Math.sin(t(entity.angle)) * reach,
    ]);
  }
  const corners = state.shapes.polygonSize === 'corners';
  const reach = corners ? entity.af / 2 / Math.cos(Math.PI / entity.sides) : entity.af / 2;
  const toward = t(entity.angle - 90 - (corners ? 180 / entity.sides : 0));
  return roundPoint([entity.c[0] + Math.cos(toward) * reach, entity.c[1] + Math.sin(toward) * reach]);
}
// The angle Rotate turns by from the cursor's direction about its centre, in the angle step.
function liveAngle(state) {
  const { center } = state.op || {};
  const c = state.cursor;
  if (!center || !c || samePoint(c, center)) return 0;
  const step = state.angleStep || 0;
  const raw = angleOf(center, c);
  return normalAngle(step ? Math.round(raw / step) * step : raw);
}

// What the HUD shows while the cursor moves (placeholders until typed): X and Y from the zero.
export function liveValues(state) {
  const c = state.cursor;
  if (state.op) return opLiveValues(state);
  if (!state.tool || readoutTool(state.tool) || !c) return {};
  const [x, y] = fromZero(c, state.zero);
  const at = { X: x, Y: y };
  const p = state.points[0];
  if (!state.points.length || state.tool === 'arc') return at;
  if (state.tool === 'line') return { Length: Math.hypot(c[0] - p[0], c[1] - p[1]), Angle: angleOf(p, c), ...at };
  if (state.tool === 'slot') {
    const { entity } = slotFrom(state, c);
    if (!entity) return at;
    const length = state.shapes.slotLength === 'centers' ? entity.length - entity.width : entity.length;
    return { Length: length, Angle: entity.angle, ...at };
  }
  if (state.tool === 'polygon') {
    const { entity } = polygonFrom(state, c);
    if (!entity) return at;
    const size = state.shapes.polygonSize === 'corners' ? 2 * Math.hypot(c[0] - p[0], c[1] - p[1]) : entity.af;
    return { [polygonSizeField(state)]: size, Angle: entity.angle, ...at };
  }
  if (state.tool === 'circle') {
    const radius = Math.hypot(c[0] - p[0], c[1] - p[1]);
    return { Radius: radius, Diameter: radius * 2 };
  }
  const factor = state.tool === 'rect-center' ? 2 : 1;
  return { Width: Math.abs(c[0] - p[0]) * factor, Height: Math.abs(c[1] - p[1]) * factor, ...at };
}

// An action's own HUD values: the target's ΔX, ΔY from the base and X, Y; Rotate's Angle; a point's X, Y.
function opLiveValues(state) {
  const { op, cursor: c } = state;
  if (!c) return {};
  const [x, y] = fromZero(c, state.zero);
  if (op.kind === 'move' || op.kind === 'copy')
    return op.step === 'target' ? { ΔX: c[0] - op.base[0], ΔY: c[1] - op.base[1], X: x, Y: y } : {};
  if (op.kind === 'rotate' && op.step === 'angle') return { Angle: liveAngle(state) };
  return { X: x, Y: y };
}

// The point an action measures from: Move's and Copy's base, Rotate's centre, Mirror's first axis point.
const opAnchor = (op) => op?.base || op?.center || op?.first || null;
// Where `@` measures from: the tool's own previous point (an action's base,
// centre or first axis point), else the last point a Draw tool placed in
// this session; null when none was.
export const lastPointOf = (state) => state.points.at(-1) || opAnchor(state.op) || state.lastPoint || null;
/**
 * The point Shift locks horizontal or vertical from: a dragged selection's
 * grabbed point, an action's base or first axis point, a tool's last point
 * (Rotate's angle is no point: never). null when none.
 */
export function orthoFrom(state) {
  if (state.drag) return state.drag.grab;
  if (state.op) return state.op.kind === 'rotate' && state.op.step === 'angle' ? null : opAnchor(state.op);
  return state.points.at(-1) || null;
}
export const RELATIVE_REFUSAL = '@ measures from the last point: place one first.';
const AXIS = { X: 0, Y: 1 };
/**
 * A typed X or Y as its value from the zero: a number or "=expression", or
 * with a leading "@" the rest measured from the last point ("@13.94",
 * "@-5", "@=pitch"; "@" alone is the last point's own). Throws the refusal.
 */
export function axisValue(state, field, text) {
  const trimmed = String(text ?? '').trim();
  const relative = trimmed.startsWith('@');
  const last = relative ? lastPointOf(state) : null;
  if (relative && !last) throw new Error(RELATIVE_REFUSAL);
  const rest = relative ? trimmed.slice(1).trim() : trimmed;
  const { value, error } =
    relative && rest === '' ? { value: 0, error: '' } : evaluateEntry(rest, state.parameters || {});
  if (error || value == null) throw new Error(`${field}: ${error || 'must be a number.'}`);
  return relative ? fromZero(last, state.zero)[AXIS[field]] + value : value;
}

const POSITIVE = new Set(['Length', 'Width', 'Height', 'Radius', 'Diameter', 'Across flats', 'Across corners']);
// The values of one pair: typed ones over the live ones (an X or Y from the zero, `@` from the last point).
function pairValues(state, pair) {
  const live = liveValues(state);
  const values = {};
  for (const field of pair || []) {
    const text = typedText(state, field);
    if (text === '') {
      values[field] = live[field] ?? 0;
      continue;
    }
    if (field in AXIS) {
      values[field] = axisValue(state, field, text);
      continue;
    }
    const { value, error } = evaluateEntry(text, state.parameters || {});
    if (error || value == null) throw new Error(`${field}: ${error || 'must be a number.'}`);
    if (POSITIVE.has(field) && value <= 0) throw new Error(`${field} must be greater than zero.`);
    values[field] = value;
  }
  return values;
}
// Typed values override live ones; returns the point a click would have hit.
// Of two pairs the typed one is read (none typed: the first, all live).
export function typedPoint(state) {
  const values = pairValues(state, sketchPairs(state)[Math.max(0, typedPair(state))]);
  const p = state.points[0];
  const c = state.cursor || p || [0, 0];
  if ('X' in values) return roundPoint(toZero([values.X, values.Y], state.zero));
  // Move's and Copy's target: the base and ΔX, ΔY.
  if ('ΔX' in values) {
    const base = state.op?.base || [0, 0];
    return roundPoint([base[0] + values['ΔX'], base[1] + values['ΔY']]);
  }
  // A slot's far end and a polygon's flat middle (or corner) from the numbers.
  if (state.tool === 'slot' || state.tool === 'polygon') {
    const { entity, error } = state.tool === 'slot' ? slotFrom(state, c, values) : polygonFrom(state, c, values);
    if (error) throw new Error(error);
    return secondPointOf(state, entity);
  }
  if (state.tool === 'line') {
    const angle = (values.Angle * Math.PI) / 180;
    return roundPoint([p[0] + values.Length * Math.cos(angle), p[1] + values.Length * Math.sin(angle)]);
  }
  if (state.tool === 'circle') {
    const radius = 'Diameter' in values ? values.Diameter / 2 : values.Radius;
    const length = Math.hypot(c[0] - p[0], c[1] - p[1]);
    const direction = length > 1e-9 ? [(c[0] - p[0]) / length, (c[1] - p[1]) / length] : [1, 0];
    return roundPoint([p[0] + direction[0] * radius, p[1] + direction[1] * radius]);
  }
  // Rectangles open toward the cursor's quadrant, like typed sizes in Fusion.
  const sx = c[0] < p[0] ? -1 : 1,
    sy = c[1] < p[1] ? -1 : 1;
  const factor = state.tool === 'rect-center' ? 0.5 : 1;
  return roundPoint([p[0] + sx * values.Width * factor, p[1] + sy * values.Height * factor]);
}

/**
 * What the pair not typed in shows, greyed (§6.2): what the typed pair gives,
 * the point's X and Y from the zero, or its Length and Angle, Width and
 * Height, Radius or Diameter. {} while neither pair is typed in, or the typed
 * values are refused.
 */
export function derivedValues(state) {
  const pairs = sketchPairs(state);
  const typed = typedPair(state);
  if (pairs.length < 2 || typed < 0) return {};
  let point;
  try {
    point = typedPoint(state);
  } catch {
    return {};
  }
  // A slot, a polygon, an action's target: what the cursor at that point would read.
  if (state.op || state.tool === 'slot' || state.tool === 'polygon') {
    const at = liveValues({ ...state, cursor: point });
    return Object.fromEntries(pairs[1 - typed].map((field) => [field, at[field]]));
  }
  const p = state.points[0];
  const [x, y] = fromZero(point, state.zero);
  const factor = state.tool === 'rect-center' ? 2 : 1;
  const reach = Math.hypot(point[0] - p[0], point[1] - p[1]);
  const all = {
    X: x,
    Y: y,
    Length: reach,
    Angle: angleOf(p, point),
    Width: Math.abs(point[0] - p[0]) * factor,
    Height: Math.abs(point[1] - p[1]) * factor,
    Radius: reach,
    Diameter: 2 * reach,
  };
  return Object.fromEntries(pairs[1 - typed].map((field) => [field, all[field]]));
}

// The selection as `ids`, keeping the array it was when nothing changed: the overlay
// rebuilds the entity batch for a new selection array only (drawSketchOverlay).
const chosenIds = (state, ids) =>
  ids.length === state.selectedIds.length && ids.every((id, i) => id === state.selectedIds[i])
    ? state.selectedIds
    : ids;
const hasTyped = (state) => Object.values(state.typed).some((v) => String(v ?? '').trim() !== '');
const reset = (state, patch = {}) => ({ ...state, typed: {}, field: 0, message: '', ...patch });
// A drawn entity is one history step; with Construction armed it is construction.
const add = (state, entity, patch) => {
  const marked = state.construction && DRAW_TOOLS.has(state.tool) ? { ...entity, construction: true } : entity;
  return commit(
    state,
    reset(state, {
      entities: [...state.entities, { id: `e${state.nextId}`, ...marked }],
      nextId: state.nextId + 1,
      ...patch,
    }),
  );
};
/**
 * The drawing without the entities `ids` (Delete, Delete selected): {
 * entities, dimensions }, the dimensions that hung on them pruned
 * (pruneDimensions, one entity at a time against what remains). The same
 * arrays when none of `ids` is drawn.
 */
export function removeEntities(entities, dimensions = [], ids = []) {
  const gone = new Set(ids);
  const kept = entities.filter((e) => !gone.has(e.id));
  if (kept.length === entities.length) return { entities, dimensions };
  const pruned = entities
    .filter((e) => gone.has(e.id))
    .reduce((list, removed) => pruneDimensions(list, removed, kept), dimensions);
  return { entities: kept, dimensions: pruned };
}

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
    return commit(
      state,
      reset(state, {
        dimensions: [...state.dimensions, dimension],
        nextDimensionId: state.nextDimensionId + 1,
        pending: null,
        points: [],
      }),
    );
  }
  const pick = pickAt(state, action);
  if (pick.type === 'refused') return { ...state, message: pick.message };
  if (step === 'second')
    return reset(state, { points: [], pending: { type: 'span', from: state.points[0], to: pick.point } });
  if (pick.type === 'point') return reset(state, { points: [pick.point] });
  return reset(state, { pending: pick });
}

// Relief tool (docs/sketch-studio-bend-relief.md §3.2): a click cuts the
// relief at the pick (sketchRelief.js), the tool stays on; a refusal is the
// message and nothing changes.
function reliefClick(state, action) {
  const { cut, error } = reliefAt(state, action);
  if (error) return { ...state, message: error };
  return commit(
    state,
    reset(state, {
      entities: cut.entities,
      nextId: cut.nextId,
      selectedIds: [],
      // What was just cut, while the cursor stays where it clicked and the drawing as the cut left it
      // (the corner is gone from under the cursor).
      reliefCut: { text: cut.text, cursor: state.cursor, entities: cut.entities },
    }),
  );
}

// Undo last / Redo (docs/sketch-studio-hand-drawing.md §5.2): one history
// step, the half-drawn shape dropped first in the same press (never a step of
// its own), the tool kept, and of the selection what still exists. With no
// step to take only the half-drawn shape goes; with none either, nothing.
function stepHistory(state, direction) {
  const moved = direction === 'redo' ? historyRedo(state) : historyUndo(state);
  // An action or a drag under way is dropped too (§7.3: Undo during it drops it).
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

// A selected entity's numbers typed in the selection row (§5.3): one history
// step; the dimensions on it follow; a refusal is the message, nothing changed.
// A line or arc end moved alone leaves what ended there: said when the
// outline is open after it.
function editSelected(state, { id, patch }) {
  let entities;
  try {
    entities = editEntity(state.entities, id, patch, state.zero);
  } catch (error) {
    return { ...state, message: error.message };
  }
  if (entities === state.entities) return state.message ? { ...state, message: '' } : state;
  const before = state.entities.find((e) => e.id === id);
  const after = entities.find((e) => e.id === id);
  let message = '';
  if ((before.type === 'line' || before.type === 'arc') && !before.construction) {
    const joins = ['a', 'b']
      .filter((end) => !samePoint(before[end], after[end], 0))
      .reduce((count, end) => count + joinsAt(state.entities, id, before[end]), 0);
    if (joins && !entitiesToProfile(entities).closed)
      message = `This end joins ${joins} other${joins === 1 ? '' : 's'}: ${joins === 1 ? 'it stays' : 'they stay'}.`;
  }
  return commit(state, { ...state, entities, dimensions: followDimensions(state.dimensions, before, after), message });
}

// A Check row's fix (sketchCheck.js applyFix; docs/sketch-studio-hand-drawing.md
// §6.5): one history step, the dimensions on what it removes pruned and on an end
// it moves following; a refusal (the problem is gone) is the message.
function fixProblem(state, problem) {
  let fixed;
  try {
    fixed = applyFix(state.entities, state.dimensions, problem, { remove: removeEntities });
  } catch (error) {
    return { ...state, message: error.message };
  }
  const present = new Set(fixed.entities.map((e) => e.id));
  const kept = state.selectedIds.filter((id) => present.has(id));
  return commit(
    state,
    reset(state, {
      ...fixed,
      selectedIds: kept.length === state.selectedIds.length ? state.selectedIds : kept,
      offsetFrom: null,
    }),
  );
}

// `values`: a slot's or polygon's numbers typed (Enter), taken exactly rather than through the point.
function click(state, point, values = null) {
  const p = roundPoint(point);
  const [first] = state.points;
  // Each point a Draw tool places is the last point `@` measures from (a
  // circle's is its centre: the size click places no point).
  switch (state.tool) {
    case 'zero':
      // The zero goes on the point and the tool ends (§6.1); never history.
      return reset(state, { zero: p, tool: null, points: [] });
    case 'line': {
      if (!first) return reset(state, { points: [p], chainStart: p, lastPoint: p });
      // A second click on the same spot (double-click) ends the polyline.
      if (samePoint(p, first)) return reset(state, { points: [], chainStart: null });
      const closes = state.chainStart && samePoint(p, state.chainStart);
      const end = closes ? state.chainStart : p;
      return add(
        state,
        { type: 'line', a: first, b: end },
        closes ? { points: [], chainStart: null, lastPoint: end } : { points: [end], lastPoint: end },
      );
    }
    case 'rect':
    case 'rect-center': {
      if (!first) return reset(state, { points: [p], lastPoint: p });
      const a = state.tool === 'rect' ? first : roundPoint([2 * first[0] - p[0], 2 * first[1] - p[1]]);
      if (Math.abs(p[0] - a[0]) < 1e-6 || Math.abs(p[1] - a[1]) < 1e-6)
        return { ...state, message: 'A rectangle needs a nonzero width and height.' };
      // The options row's corner radius (HD-3, §7.2): absent when sharp; one too large is refused.
      const r = Number(state.shapes?.radius) || 0;
      const refusal = cornerRadiusRefusal({ a, b: p }, r);
      if (refusal) return { ...state, message: refusal };
      return add(state, { type: 'rect', a, b: p, ...(r ? { r } : {}) }, { points: [], lastPoint: p });
    }
    case 'slot':
    case 'polygon': {
      // The centre (or a slot's one end), then the far end's centre, a flat's middle or a corner (§7.2).
      if (!first) return reset(state, { points: [p], lastPoint: p });
      const { entity, error } = state.tool === 'slot' ? slotFrom(state, p, values) : polygonFrom(state, p, values);
      if (error) return { ...state, message: error };
      return add(state, entity, { points: [], lastPoint: p });
    }
    case 'circle': {
      if (!first) return reset(state, { points: [p], lastPoint: p });
      const r = Math.hypot(p[0] - first[0], p[1] - first[1]);
      if (r < 1e-6) return { ...state, message: 'A circle needs a nonzero radius.' };
      return add(state, { type: 'circle', c: first, r: Math.round(r * 1e6) / 1e6 }, { points: [] });
    }
    case 'arc': {
      if (state.points.length < 2) {
        if (first && samePoint(p, first)) return { ...state, message: 'Pick a different end point.' };
        return reset(state, { points: [...state.points, p], lastPoint: p });
      }
      const [a, b] = state.points;
      if (!arcGeometry(a, p, b)) return { ...state, message: 'The third point must not lie on the chord.' };
      return add(state, { type: 'arc', a, b, m: p }, { points: [], lastPoint: p });
    }
    default:
      return state;
  }
}

// ---------------------------------------------------------------- acting on a selection (HD-3, §7.3, §7.4)
const OP_VERBS = { move: 'move', copy: 'copy', rotate: 'turn', mirror: 'mirror', pattern: 'pattern' };
const FIRST_STEP = { move: 'base', copy: 'base', rotate: 'center', mirror: 'first', pattern: 'numbers' };
// Snap kinds that are no point: a Mirror click there over a line takes the line.
const NOT_KEY = new Set(['on sketch', 'on edge', 'grid', 'free']);

/**
 * An action's start (its key or row button): the tool and its half-drawn
 * shape end, the selection stays; the same action again ends it. With
 * nothing selected the words say so and nothing changes.
 */
function startOp(state, kind) {
  if (state.op?.kind === kind) return endOp(state);
  if (!state.selectedIds.length) return { ...state, message: `Select what to ${OP_VERBS[kind]} first.` };
  return reset(state, {
    tool: null,
    points: [],
    chainStart: null,
    pending: null,
    box: null,
    drag: null,
    offsetFrom: null,
    op: { kind, step: FIRST_STEP[kind], ...(kind === 'copy' ? { copies: [] } : {}) },
  });
}
// An action's end (Esc, its key again, a tool): the selection stays; Copy's copies become it.
function endOp(state, patch = {}) {
  const copies = state.op?.copies?.filter((id) => state.entities.some((e) => e.id === id)) || [];
  return reset(state, { op: null, ...(copies.length ? { selectedIds: copies } : {}), ...patch });
}

/**
 * The selection through T, one history step: moved in place (ids kept; the
 * dimensions on it follow), or with `keep` copies added after the last
 * entity (new ids; none that would lie exactly on a shape already there:
 * left out and counted, all of them refused). { state, ids } or { error }.
 */
function transformed(state, T, { keep = false } = {}) {
  const result = transformEntities(state.entities, state.selectedIds, T, { keep, nextId: state.nextId });
  let { entities, ids } = result;
  let note = '';
  if (keep) {
    const made = entities.slice(state.entities.length);
    const { kept, leftOut } = withoutCopies(state.entities, made);
    if (!kept.length)
      return {
        error: `${made.length === 1 ? 'The copy' : `All ${made.length} copies`} would lie on shapes already there: nothing added.`,
      };
    if (leftOut) {
      entities = [...state.entities, ...kept];
      ids = kept.map((e) => e.id);
      note = `${leftOut} left out: already there`;
    }
  }
  const dimensions = keep ? state.dimensions : transformDimensions(state.dimensions, result.before, T);
  const next = commit(state, reset(state, { entities, dimensions, nextId: result.nextId }));
  return { state: { ...next, message: note }, ids };
}
// Apply T to the selection and end the action; the selection becomes what it made.
function finishOp(state, T, keep) {
  if (T.turn === 0 && !T.mirror && !T.t[0] && !T.t[1]) return { ...state, message: 'That moves nothing.' };
  const done = transformed(state, T, { keep });
  if (done.error) return { ...state, message: done.error };
  return { ...done.state, op: null, selectedIds: done.ids };
}
// Copy: one more copy from the same base, the action staying on.
function copyOnce(state, T) {
  if (!T.t[0] && !T.t[1]) return { ...state, message: 'That puts the copy on the original.' };
  const done = transformed(state, T, { keep: true });
  if (done.error) return { ...state, message: done.error };
  return { ...done.state, op: { ...state.op, copies: [...state.op.copies, ...done.ids] } };
}
// The line under a Mirror click that is on no key point: an unselected line, or null.
function mirrorLine(state, at) {
  const kind = at?.kind;
  if (!at?.raw || (kind && !NOT_KEY.has(kind) && !String(kind).startsWith('ortho'))) return null;
  const chosen = new Set(state.selectedIds);
  const lines = state.entities.filter((e) => e.type === 'line' && !chosen.has(e.id));
  const id = hitEntity(lines, at.raw, at.tolerance || 0);
  return id ? lines.find((e) => e.id === id) : null;
}
// What Mirror's next click would mirror about: a hovered line, or the axis from the first point.
function mirrorAxis(state, at) {
  const { op } = state;
  if (op.step === 'second') return at?.point && !samePoint(at.point, op.first) ? reflection(op.first, at.point) : null;
  const line = mirrorLine(state, at);
  return line ? reflection(line.a, line.b) : null;
}
// A click (or Enter on typed X, Y) during an action.
function opClick(state, action) {
  const { op } = state;
  const p = roundPoint(action.point);
  if (op.kind === 'move' || op.kind === 'copy') {
    if (op.step === 'base') return reset(state, { op: { ...op, step: 'target', base: p } });
    const T = translation(roundValue(p[0] - op.base[0]), roundValue(p[1] - op.base[1]));
    return op.kind === 'copy' ? copyOnce(state, T) : finishOp(state, T, false);
  }
  if (op.kind === 'rotate') {
    if (op.step === 'center') return reset(state, { op: { ...op, step: 'angle', center: p } });
    return turnBy({ ...state, cursor: p }, liveAngle({ ...state, cursor: p }));
  }
  if (op.kind === 'mirror') {
    const T = mirrorAxis(state, { ...action, point: p });
    if (T) return finishOp(state, T, !op.remove);
    if (op.step === 'second') return { ...state, message: "Pick a different point for the axis's other end." };
    return reset(state, { op: { ...op, step: 'second', first: p } });
  }
  // Pattern: a click is a circle's centre.
  if (state.pattern.kind === 'circle') return { ...state, pattern: { ...state.pattern, center: p }, message: '' };
  return state;
}
function turnBy(state, angle) {
  if (!angle) return { ...state, message: 'A turn of 0° moves nothing.' };
  return finishOp(state, rotation(state.op.center, angle), Boolean(state.op.keep));
}
// A typed box of the HUD as a number, or null when empty.
function typedNumber(state, field) {
  const text = typedText(state, field);
  if (text === '') return null;
  const { value, error } = evaluateEntry(text, state.parameters || {});
  if (error || value == null) throw new Error(`${field}: ${error || 'must be a number.'}`);
  return value;
}
// Enter during an action: Move's / Copy's typed ΔX, ΔY at once; Rotate's typed
// angle; a typed point as a click; Pattern's Apply.
function opEnter(state) {
  const { op } = state;
  if (op.kind === 'pattern') return applyPattern(state);
  if (!hasTyped(state)) return state;
  try {
    if ((op.kind === 'move' || op.kind === 'copy') && op.step === 'base') {
      const T = translation(roundValue(typedNumber(state, 'ΔX') ?? 0), roundValue(typedNumber(state, 'ΔY') ?? 0));
      return op.kind === 'copy' ? copyOnce(state, T) : finishOp(state, T, false);
    }
    if (op.kind === 'rotate' && op.step === 'angle') return turnBy(state, roundValue(typedNumber(state, 'Angle') ?? 0));
    return opClick(state, { point: typedPoint(state) });
  } catch (error) {
    return { ...state, message: error.message };
  }
}

/** What Pattern would add now: planPattern's { copies, leftOut, refusal } (memoised on its inputs). */
let lastPlan = { key: null, value: null };
export function patternPlan(state) {
  const key = [state.entities, state.selectedIds, state.pattern, state.zero];
  if (lastPlan.key && key.every((part, i) => part === lastPlan.key[i])) return lastPlan.value;
  const value = planPattern(state.entities, state.selectedIds, state.pattern, { zero: state.zero });
  lastPlan = { key, value };
  return value;
}
// Apply: the copies one history step, the selection the original; over
// PATTERN_LIMIT new shapes the first Apply only asks (the button's second press).
function applyPattern(state) {
  const plan = patternPlan(state);
  if (plan.refusal) return { ...state, message: plan.refusal };
  if (!plan.copies.length)
    return { ...state, message: plan.leftOut ? 'Every copy would lie on a shape already there: nothing added.' : '' };
  if (plan.copies.length > PATTERN_LIMIT && !state.op.confirm) return { ...state, op: { ...state.op, confirm: true } };
  const added = plan.copies.map((shape, i) => ({ id: `e${state.nextId + i}`, ...shape }));
  const next = commit(
    state,
    reset(state, { entities: [...state.entities, ...added], nextId: state.nextId + added.length, op: null }),
  );
  return {
    ...next,
    message: `${added.length} added${plan.leftOut ? ` · ${plan.leftOut} left out: already there` : ''}`,
  };
}

export function sketchReducer(state, action) {
  switch (action.type) {
    case 'tool':
      // A tool ends an action and a drag too (§7.3: a tool key or button takes the tool).
      return reset(state, {
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
      });
    case 'move':
      // The raw point, tolerance and Shift let the Dimension tool say what a click would take
      // (and Mirror which line it would mirror about); Rotate's angle step comes with them.
      return {
        ...state,
        cursor: action.point,
        snapKind: action.kind,
        raw: action.raw || action.point,
        tolerance: action.tolerance || 0,
        shift: Boolean(action.shift),
        angleStep: action.angleStep || 0,
      };
    case 'click':
      if (state.op) return opClick({ ...state, cursor: action.point }, action);
      if (state.tool === 'dimension') return dimensionClick({ ...state, cursor: action.point }, action);
      if (state.tool === 'relief') return reliefClick({ ...state, cursor: action.point }, action);
      if (EDIT_TOOLS.has(state.tool)) return editClick({ ...state, cursor: action.point }, action);
      return click({ ...state, cursor: action.point }, action.point);
    case 'shapes':
      // The shape tools' options (mergeShapes); the drawing is untouched.
      return { ...state, shapes: mergeShapes(state.shapes, action), message: '' };
    case 'op':
      // Move, Copy, Rotate, Mirror, Pattern on the selection (its key or row button).
      return startOp(state, action.kind);
    case 'op-option':
      // Rotate's "Keep the original", Mirror's "Remove the original".
      return state.op ? { ...state, op: { ...state.op, ...action.patch }, message: '' } : state;
    case 'mirror-zero': {
      // Left ↔ right (about the plumb line through the zero) or top ↔ bottom (the level one), at once.
      if (state.op?.kind !== 'mirror') return state;
      const [u, v] = state.zero;
      const T = action.axis === 'vertical' ? reflection([u, v], [u, v + 1]) : reflection([u, v], [u + 1, v]);
      return finishOp(state, T, !state.op.remove);
    }
    case 'pattern':
      // Pattern's numbers; a change asks again before a large Apply.
      return {
        ...state,
        pattern: { ...state.pattern, ...action.patch },
        op: state.op?.confirm ? { ...state.op, confirm: false } : state.op,
        message: '',
      };
    case 'pattern-apply':
      return state.op?.kind === 'pattern' ? applyPattern(state) : state;
    case 'drag':
      // A selected entity dragged (no tool, no action): the grabbed point and where it is now; nothing moves yet.
      if (state.tool || state.op || !state.selectedIds.length) return state;
      return { ...state, drag: { grab: state.drag?.grab || action.grab, to: action.to }, message: '' };
    case 'drag-end': {
      // The release: the selection moved by grab → to, one history step (none for no move).
      const { drag } = state;
      if (!drag) return state;
      const done = { ...state, drag: null };
      const [dx, dy] = [roundValue(drag.to[0] - drag.grab[0]), roundValue(drag.to[1] - drag.grab[1])];
      if (!dx && !dy) return done;
      const moved = transformed(done, translation(dx, dy));
      return moved.error ? { ...done, message: moved.error } : moved.state;
    }
    case 'drag-cancel':
      // Esc, pointercancel, blur, a missed release: everything stays where it was, no step.
      return state.drag ? { ...state, drag: null } : state;
    case 'relief':
      // The Relief tool's shape, typed sizes or sheet (mergeRelief); the drawing is untouched.
      return { ...state, relief: mergeRelief(state.relief, action), message: '' };
    case 'typed': {
      // Typing in a box of one pair empties the other pair's (§6.2): of the two, the one typed last wins.
      const typed = { ...state.typed, [action.field]: action.value };
      if (String(action.value ?? '').trim() !== '')
        for (const pair of sketchPairs(state))
          if (!pair.includes(action.field)) for (const field of pair) delete typed[field];
      return { ...state, typed, message: '' };
    }
    case 'field': {
      const count = sketchFields(state).length || 1;
      return { ...state, field: ((action.index % count) + count) % count };
    }
    case 'enter': {
      if (state.op) return opEnter(state);
      // Enter does nothing in the Dimension and Relief tools.
      if (!state.tool || readoutTool(state.tool)) return state;
      if (!hasTyped(state)) {
        // Enter with nothing typed finishes a polyline, as in Fusion.
        if (state.tool === 'line') return reset(state, { points: [], chainStart: null });
        return state;
      }
      try {
        // A slot's or polygon's typed numbers are taken as typed, not through the point they give.
        const exact =
          (state.tool === 'slot' || state.tool === 'polygon') && state.points.length && typedPair(state) === 0;
        return click(state, typedPoint(state), exact ? pairValues(state, sketchPairs(state)[0]) : null);
      } catch (error) {
        return { ...state, message: error.message };
      }
    }
    case 'finish-chain':
      return reset(state, { points: [], chainStart: null });
    case 'escape':
      // A box being dragged goes first (nothing selected by it). Then Esc
      // drops the tool (and any half-drawn shape), or with no tool clears the
      // selection; the sketcher treats Esc with neither as "exit sketch". A
      // half-made dimension goes before its tool: its first point, or the
      // dimension waiting for its place click.
      if (state.box) return { ...state, box: null };
      // A drag goes back (no step); then an action ends, the selection staying (§7.3).
      if (state.drag) return { ...state, drag: null };
      if (state.op) return endOp(state);
      if (state.tool === 'dimension' && (state.pending || state.points.length))
        return reset(state, { pending: null, points: [] });
      // Offset: the chosen entity goes first, then the tool (§8.5).
      if (state.offsetFrom) return reset(state, { offsetFrom: null });
      if (state.tool)
        return reset(state, { tool: null, points: [], chainStart: null, pending: null, offsetFrom: null });
      return reset(state, { selectedIds: chosenIds(state, []), selectedDimensionId: null });
    case 'select':
      // A dimension is selected alone. An entity alone, or with `toggle`
      // (Shift / Ctrl + click) added or removed; a toggle on nothing changes nothing.
      if (action.dimensionId)
        return { ...state, selectedIds: chosenIds(state, []), selectedDimensionId: action.dimensionId };
      if (action.toggle && !action.id) return state;
      return {
        ...state,
        selectedIds: chosenIds(
          state,
          clickSelection(state.entities, state.selectedIds, action.id ?? null, Boolean(action.toggle)),
        ),
        selectedDimensionId: null,
      };
    case 'select-all':
      // Ctrl+A: every entity; a tool and its half-drawn shape (an action, a drag) end first.
      return reset(state, {
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
      });
    case 'box':
      // The box dragged with no tool (sketch-plane corners): drawn, nothing selected yet.
      return { ...state, box: { from: action.from, to: action.to, mode: action.mode, add: Boolean(action.add) } };
    case 'box-end': {
      // Released: what it takes (sketchSelect.js boxSelect), added with Shift, else in place of the selection.
      const { box } = state;
      if (!box) return state;
      const ids = boxSelect(state.entities, [box.from, box.to], box.mode);
      return {
        ...state,
        box: null,
        selectedIds: chosenIds(state, boxSelection(state.entities, state.selectedIds, ids, Boolean(box.add))),
        selectedDimensionId: null,
      };
    }
    case 'box-cancel':
      return state.box ? { ...state, box: null } : state;
    case 'select-ids':
      // A Check row's entities (§6.5): selected as a box would, a tool and its half-drawn shape ended first.
      return reset(state, {
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
      });
    case 'zero-reset':
      // Reset zero: back to the sketch origin, the Zero tool ended; never history.
      return reset(state, { zero: [0, 0], ...(state.tool === 'zero' ? { tool: null, points: [] } : {}) });
    case 'fix':
      return fixProblem(state, action.problem);
    case 'delete': {
      // The whole selection in one step, with the dimensions that hung on it.
      if (state.selectedDimensionId)
        return commit(
          state,
          reset(state, {
            dimensions: state.dimensions.filter((d) => d.id !== state.selectedDimensionId),
            selectedDimensionId: null,
          }),
        );
      // Nothing selected (a tool on): only Offset's chosen entity goes (§8.5).
      if (!state.selectedIds.length) return state.offsetFrom ? reset(state, { offsetFrom: null }) : state;
      const { entities, dimensions } = removeEntities(state.entities, state.dimensions, state.selectedIds);
      return commit(
        state,
        reset(state, { entities, dimensions, selectedIds: [], op: null, drag: null, offsetFrom: null }),
      );
    }
    case 'edit':
      return editSelected(state, action);
    case 'construction': {
      // X: with a selection and no tool its entities flip (all construction
      // unless every one already is: then none), one step; else it arms or
      // disarms the Draw tools.
      const selected = state.tool ? [] : selectedEntities(state);
      if (!selected.length) return { ...state, construction: !state.construction, message: '' };
      const on = !selected.every((e) => e.construction);
      return commit(state, { ...state, entities: setConstruction(state.entities, state.selectedIds, on), message: '' });
    }
    case 'undo':
      return stepHistory(state, 'undo');
    case 'redo':
      return stepHistory(state, 'redo');
    case 'message':
      return { ...state, message: action.text };
    default:
      throw new Error(`Unknown sketch action: ${action.type}`);
  }
}

// Rubber-band geometry for the current step, following typed values first.
export function previewEntities(state) {
  // Relief: the relief's own outline at the hover pick; none when it is refused.
  if (state.tool === 'relief')
    return (reliefHover(state)?.cut?.pieces || []).map((piece, i) => ({ id: `preview-${i + 1}`, ...piece }));
  // An Edit tool: what the click would add (Offset's first step: the entity under the cursor).
  if (EDIT_TOOLS.has(state.tool)) {
    const hover = editHover(state);
    return (hover?.result?.pieces || hover?.pieces || []).map((piece, i) => ({ id: `preview-${i + 1}`, ...piece }));
  }
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
  // The rectangles with the options row's corner radius (one too large draws sharp; the HUD says why).
  const r = Number(state.shapes?.radius) || 0;
  const rounded = r ? { r } : {};
  if (state.tool === 'line') return [{ id: 'preview', type: 'line', a: p, b: c }];
  if (state.tool === 'rect') return [{ id: 'preview', type: 'rect', a: p, b: c, ...rounded }];
  if (state.tool === 'rect-center')
    return [{ id: 'preview', type: 'rect', a: [2 * p[0] - c[0], 2 * p[1] - c[1]], b: c, ...rounded }];
  // The slot and the polygon as they would be (§7.2); a refused size draws nothing.
  if (state.tool === 'slot' || state.tool === 'polygon') {
    const { entity } = shapeNow(state, c);
    return entity ? [{ id: 'preview', ...entity }] : [];
  }
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

// The slot or polygon the second step would add with the cursor at `c` (the
// typed numbers exactly when the size pair is typed): { entity } or { error }.
function shapeNow(state, c = state.cursor) {
  let values = null;
  if (hasTyped(state) && typedPair(state) === 0)
    try {
      values = pairValues(state, sketchPairs(state)[0]);
    } catch (error) {
      return { error: error.message };
    }
  return state.tool === 'slot' ? slotFrom(state, c, values) : polygonFrom(state, c, values);
}
/**
 * Why the shape under the cursor would be refused, for the HUD (§7.2: "a
 * refused size says why by the cursor"): a slot or polygon size, a corner
 * radius too large for the rectangle; '' when none.
 */
export function shapeRefusal(state) {
  if (!state.cursor || !state.points.length || state.op) return '';
  if (state.tool === 'slot' || state.tool === 'polygon') {
    const c = hasTyped(state) && typedPair(state) === 1 ? safePoint(state) : state.cursor;
    return c ? shapeNow(state, c).error || '' : '';
  }
  if ((state.tool === 'rect' || state.tool === 'rect-center') && Number(state.shapes?.radius) > 0) {
    const [preview] = previewEntities(state);
    const [x0, y0, x1, y1] = [
      Math.min(preview.a[0], preview.b[0]),
      Math.min(preview.a[1], preview.b[1]),
      Math.max(preview.a[0], preview.b[0]),
      Math.max(preview.a[1], preview.b[1]),
    ];
    if (x1 - x0 < 1e-6 || y1 - y0 < 1e-6) return '';
    return cornerRadiusRefusal({ a: [x0, y0], b: [x1, y1] }, state.shapes.radius);
  }
  return '';
}
const safePoint = (state) => {
  try {
    return typedPoint(state);
  } catch {
    return null;
  }
};

/**
 * The ghost of an action (§7.3, §7.4): the selection where the next click (or
 * Enter) would put it — moved to the cursor from the base, turned by the
 * cursor's angle, mirrored about the hovered line or the axis to the cursor —
 * or Pattern's copies (at most PATTERN_LIMIT; `more` says how many are left
 * out of the ghost). { entities, more }.
 */
const patternGhosts = new WeakMap();
// No ghost: one object, so the overlay keeps its empty piece.
const NO_GHOST = Object.freeze({ entities: Object.freeze([]), more: 0 });
export function ghostEntities(state) {
  const { op } = state;
  const none = NO_GHOST;
  if (!op) return none;
  if (op.kind === 'pattern') {
    // One ghost per plan, so the overlay keeps its batch while the numbers stay.
    const plan = patternPlan(state);
    let ghost = patternGhosts.get(plan);
    if (!ghost) {
      const { copies } = plan;
      ghost = {
        entities: copies.length > PATTERN_LIMIT ? copies.slice(0, PATTERN_LIMIT) : copies,
        more: Math.max(0, copies.length - PATTERN_LIMIT),
      };
      patternGhosts.set(plan, ghost);
    }
    return ghost;
  }
  let T = null;
  try {
    if ((op.kind === 'move' || op.kind === 'copy') && op.step === 'target' && state.cursor) {
      const to = hasTyped(state) ? typedPoint(state) : state.cursor;
      T = translation(to[0] - op.base[0], to[1] - op.base[1]);
    } else if (op.kind === 'rotate' && op.step === 'angle') {
      const typed = typedNumber(state, 'Angle');
      const angle = typed ?? liveAngle(state);
      T = angle ? rotation(op.center, angle) : null;
    } else if (op.kind === 'mirror')
      T = mirrorAxis(state, { point: state.cursor, raw: state.raw, kind: state.snapKind, tolerance: state.tolerance });
  } catch {
    T = null;
  }
  if (!T) return none;
  const chosen = new Set(state.selectedIds);
  return { entities: state.entities.filter((e) => chosen.has(e.id)).flatMap((e) => transformEntity(e, T)), more: 0 };
}
