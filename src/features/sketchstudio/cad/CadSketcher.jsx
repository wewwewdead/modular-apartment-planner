import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { snapPoint, snapTargets } from './sketchSnap.js';
import {
  DRAW_TOOLS,
  EDIT_TOOLS,
  SELECTION_ACTIONS,
  SKETCH_COMMAND_KEYS,
  SKETCH_KEYS,
  SKETCH_TOOLS,
  canRedo,
  canUndo,
  axisValue,
  constructionPressed,
  createSketchState,
  cutEntities,
  derivedValues,
  dimensionReadout,
  dimensionStep,
  editHover,
  editReadout,
  finishRefusal,
  ghostEntities,
  isSelectionAction,
  liveValues,
  mergeRelief,
  mergeShapes,
  orthoFrom,
  patternPlan,
  pendingDimension,
  previewEntities,
  reliefNow,
  reliefReadout,
  selectedEntities,
  shapeRefusal,
  sketchCommand,
  sketchFields,
  sketchKey,
  sketchPairs,
  sketchReducer,
} from './sketchTools.js';
import { describeEntity, entitiesToProfile, entityKeyPoints, entityPolyline, hitEntity } from './sketchProfile.js';
import { PATTERN_KINDS, PATTERN_LIMIT, groupedCount, patternWords } from './sketchPattern.js';
import { POLYGON_MAX, POLYGON_MIN } from './sketchShapes.js';
import { boxSelect, describeSelection } from './sketchSelect.js';
import { entityFields } from './sketchEdit.js';
import { checkDrawing } from './sketchCheck.js';
import { sketchMode } from './sketchMode.js';
import { fromZero, isOrigin, toZero } from './sketchZero.js';
import { describeDimension, dimensionGeometry, dimensionPoints, hitDimension } from './sketchDimensions.js';
import { RELIEF_FIELDS, RELIEF_SHAPES, chosenSizes } from './sketchRelief.js';
import { stockOf } from './shopCatalog.js';
import ExpressionInput from './ExpressionInput.jsx';
import NumericInput from '../components/NumericInput.jsx';
import { evaluateEntry } from './parameters.js';

// The value an "=expression" (or an X / Y typed with "@": its value from the
// zero) in the HUD will place, or why it cannot.
function ResolvedEntry({ resolved, field }) {
  const { value, error } = resolved;
  return (
    <span className={error ? 'cad-hud-resolved is-error' : 'cad-hud-resolved'} aria-label={`${field} resolves to`}>
      {error ? error : `= ${format(value)}`}
    </span>
  );
}

const SNAP_PIXELS = 8;
const CLICK_PIXELS = 4;
const HINTS = {
  line: [
    'Click the start point, or type X, Y and press Enter.',
    'Click the next point, or type a length and angle · Enter or double-click ends · click the start to close.',
  ],
  rect: ['Click the first corner, or type X, Y.', 'Click the opposite corner, or type width and height.'],
  'rect-center': ['Click the centre, or type X, Y.', 'Click a corner, or type the full width and height.'],
  circle: ['Click the centre, or type X, Y.', 'Click a point on the circle, or type the radius.'],
  arc: ['Click the start point.', 'Click the end point.', 'Click a point on the arc.'],
  // By step (sketchTools.js dimensionStep): first, second, place, place a radial one.
  dimension: [
    'Click a point, or a line, circle or arc to dimension it.',
    'Click the second point · an edge reads square to it · Shift locks horizontal or vertical · Esc clears the first point.',
    'Move beside the span for horizontal or vertical, elsewhere for aligned · click to keep it · Esc drops it.',
    'Click where the label goes · Esc drops it.',
  ],
  relief: [
    'Move to an inside corner and click to cut the relief · Obround and Rectangular also go on a straight edge · sizes in the bar above (empty: automatic for the sheet) · Esc ends the tool.',
  ],
  zero: ['Click a point to measure X and Y from it, or type X, Y and press Enter · Esc ends the tool.'],
  // HD-3 (docs/sketch-studio-hand-drawing.md §7.2): by the first click's option.
  slot: [
    'Click the slot’s centre, or type X, Y.',
    'Click the far end’s centre, or type the length and angle · width in the bar above.',
  ],
  'slot-end': [
    'Click one end’s centre, or type X, Y.',
    'Click the other end’s centre, or type the length and angle · width in the bar above.',
  ],
  polygon: [
    'Click the centre, or type X, Y.',
    'Click the middle of a side, or type the size across flats and the angle.',
  ],
  'polygon-corners': [
    'Click the centre, or type X, Y.',
    'Click a corner, or type the size across corners and the angle.',
  ],
  // HD-4 (docs/sketch-studio-hand-drawing.md §8.1): what each Edit tool wants; Offset by its step.
  trim: ['Trim: move over a piece, the part between its crossings shows red · click removes it · Esc ends the tool'],
  extend: ['Extend: move near the end of a line or arc · click runs it on to the next piece · Esc ends the tool'],
  fillet: ['Fillet: click a corner where two lines meet · radius in the bar above · Esc ends the tool'],
  chamfer: ['Chamfer: click a corner where two lines meet · distance in the bar above · Esc ends the tool'],
  offset: [
    'Offset: click the line, arc, circle or shape to offset · distance in the bar above · Esc ends the tool',
    'Click the side the copy goes on · Esc lets go of it',
  ],
};
// The actions on a selection (§7.3), by step: what the status line says next.
const OP_HINTS = {
  'move:base': 'Move: click the base point, or type ΔX, ΔY and press Enter · Esc ends',
  'move:target':
    'Click where the base point goes, or type ΔX, ΔY or X, Y · Shift locks horizontal or vertical · Esc ends',
  'copy:base': 'Copy: click the base point, or type ΔX, ΔY and press Enter for each copy · Esc ends',
  'copy:target':
    'Click where each copy’s base point goes, or type ΔX, ΔY or X, Y · Shift locks horizontal or vertical · Esc ends',
  'rotate:center': 'Rotate: click the centre to turn about, or type X, Y',
  'rotate:angle': 'Click to turn, or type the angle · whole degrees with Snap on, 15° steps with Shift · Esc ends',
  'mirror:first':
    'Mirror: click a line to mirror about it, or the axis’s first point · or about the zero in the bar above · Esc ends',
  'mirror:second': 'Click the axis’s other end · Esc ends',
  'pattern:numbers': 'Pattern: set the numbers in the bar above, then Apply (Enter) · Esc ends',
  'pattern:circle': 'Pattern: click the centre in the view or type it above, then Apply (Enter) · Esc ends',
};
const DRAG_HINT = 'Release to move it here · Shift locks horizontal or vertical · Esc puts it back';
// Bar buttons that show shorter words to keep the bar to two rows (§7.5, §8.6); their names stay.
const SHORT_LABELS = { 'rect-center': 'Center rect', arc: 'Arc' };
// The Edit tools' rows (§8.1): the size each cuts with, kept in `shapes`.
const EDIT_ROWS = {
  fillet: ['Fillet options', 'Radius', 'Fillet radius (mm)', 'The radius each corner is rounded to'],
  chamfer: ['Chamfer options', 'Distance', 'Chamfer distance (mm)', 'How far back each line is cut'],
  offset: ['Offset options', 'Distance', 'Offset distance (mm)', 'How far the copy stands off'],
};
// The readout box's name by the cursor, per tool.
const READOUT_NAMES = {
  relief: 'Relief readout',
  trim: 'Trim readout',
  extend: 'Extend readout',
  fillet: 'Fillet readout',
  chamfer: 'Chamfer readout',
  offset: 'Offset readout',
};
const ACTION_TITLES = {
  move: 'Move (M): a base point, then where it goes, or ΔX, ΔY',
  copy: 'Copy (K): like Move, the original stays; stays on for more copies until Esc',
  rotate: 'Rotate (Q): a centre, then the angle',
  mirror: 'Mirror (I): about a line, two points, or the zero',
  pattern: 'Pattern (G): a row, a grid or round a centre',
};
// What an X or Y box says it takes (docs/sketch-studio-hand-drawing.md §6.2).
const AXIS_TITLE = 'From the zero · @ before a number measures from the last point (@25)';
// The Relief options row's size boxes (docs/sketch-studio-bend-relief.md §3.3):
// the label and the box's aria-label.
const RELIEF_BOXES = {
  size: ['Size', 'Relief size (mm)'],
  diameter: ['Diameter', 'Relief diameter (mm)'],
  width: ['Width', 'Relief width (mm)'],
  depth: ['Depth', 'Relief depth (mm)'],
};
// "1.2 mm SPCC": the stock's code word, as the shop says it.
const sheetWords = ({ thickness, stock }) => {
  let code = String(stock || '').toUpperCase();
  try {
    code = stockOf(stock).name.split(' ')[0];
  } catch {
    /* an unknown stock key: its key */
  }
  return `${format(thickness)} mm ${code}`;
};
const dimensionHint = (state) => {
  const step = dimensionStep(state);
  if (step === 'place') return HINTS.dimension[state.pending.type === 'circle' ? 3 : 2];
  return HINTS.dimension[step === 'second' ? 1 : 0];
};
// The place click follows the cursor rounded to the grid only: a dimension
// line snapped onto an endpoint would sit on the drawing.
const NO_TARGETS = { points: [], curves: [] };
// Marker size (mm) for a scale of mm per pixel: about 4 px on screen.
const MARKER_PX = 4;
// Room (px) the Dimension readout needs right of / below the cursor (its
// offset, its max-width, two lines of text) before it flips to the other side.
const READOUT_ROOM = [18 + 260 + 8, 18 + 64];
// What Look at frames besides the entities: each dimension's line ends,
// extension ends and label point (ticks and gaps are a few pixels: left out).
const framedPoints = (state) => state.dimensions.flatMap((d) => dimensionPoints(d, 0));
// ΔX and ΔY keep their capitals (the lower-case delta reads as another letter).
const fieldLabel = (field) => `Sketch ${field.startsWith('Δ') ? field : field.toLowerCase()}`;
// A bar button's key as aria-keyshortcuts spells it: "Ctrl+Z" is Control+Z or Meta+Z.
const ariaKeys = (key) => (key.startsWith('Ctrl+') ? `Control+${key.slice(5)} Meta+${key.slice(5)}` : key);
const format = (value) => (Number.isFinite(value) ? Number(value.toFixed(2)).toString() : '');
// The selection row's numbers to three decimals (a typed 0.005 mm shows as typed), so seven
// figures fit a box.
const rowValue = (value) => (Number.isFinite(value) ? Number(value.toFixed(3)) : '');
// The bar's groups (docs/sketch-studio-hand-drawing.md §3.3): Draw, Edit (HD-4,
// §8.6: Trim, Extend, Fillet, Chamfer, Offset), then Mark (Dimension, Relief
// and the Construction toggle).
const BAR_GROUPS = [
  ['Draw', SKETCH_TOOLS.filter(([tool]) => DRAW_TOOLS.has(tool))],
  ['Edit', SKETCH_TOOLS.filter(([tool]) => EDIT_TOOLS.has(tool))],
  ['Mark', SKETCH_TOOLS.filter(([tool]) => !DRAW_TOOLS.has(tool) && !EDIT_TOOLS.has(tool))],
];
// The selection row's boxes, what each one does (sketchEdit.js).
const EDIT_TITLES = {
  x1: 'End 1 X: the end moves alone',
  y1: 'End 1 Y: the end moves alone',
  x2: 'End 2 X: the end moves alone',
  y2: 'End 2 Y: the end moves alone',
  length: 'Length: end 2 moves along the line, end 1 stays',
  angle: 'Angle (degrees from +X): end 2 turns about end 1',
  x: 'X from the sketch origin',
  y: 'Y from the sketch origin',
  width: 'Width: the lower-left corner stays',
  height: 'Height: the lower-left corner stays',
  diameter: 'Diameter: the centre stays',
  radius: 'Radius: both ends and the side it bulges to stay',
};
// HD-3's boxes (§7.1), by entity type where a key means something else there.
const TYPE_TITLES = {
  'rect.r': 'Corner radius: empty or 0 for sharp corners, at most half the shorter side',
  'slot.x': 'X of the slot’s centre',
  'slot.y': 'Y of the slot’s centre',
  'slot.length': 'Length: overall, tip to tip; the centre stays',
  'slot.width': 'Width: across the slot; the centre stays',
  'slot.angle': 'Angle (degrees from +X): the slot turns about its centre',
  'polygon.x': 'X of the polygon’s centre',
  'polygon.y': 'Y of the polygon’s centre',
  'polygon.sides': 'Sides: 3 to 12',
  'polygon.af': 'Across flats: the centre stays',
  'polygon.angle': 'Angle (degrees): 0 puts a flat at the bottom',
};
// The X, Y boxes with the zero moved say what they are measured from.
const ZERO_TITLES = { x: 'X from the zero', y: 'Y from the zero' };
const REDO_TITLE = 'Redo (Ctrl+Y or Ctrl+Shift+Z)';
const NO_HOVER = { pointer: null, focus: null };
const REDO_ARIA = 'Control+Y Meta+Y Control+Shift+Z Meta+Shift+Z';
// "12 items · 3 construction · closed profile · 2 dimensions".
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
// A light grid: roughly 30-60 lines across the view, never finer than the snap.
function gridStep(span, snap) {
  const raw = span / 40;
  const power = 10 ** Math.floor(Math.log10(raw));
  const nice = [1, 2, 5, 10].map((m) => m * power).find((value) => value >= raw) || power * 10;
  return snap > 0 ? Math.max(snap, Math.ceil(nice / snap) * snap) : nice;
}

// In-viewport sketcher: owns the drawing state, listens on the viewport
// canvas, draws through the viewport's overlay API and shows the HUD.
// `relief`: the Relief tool's remembered settings ({ shape, sizes, sheet }),
// reported back through `onReliefChange` so the next sketch starts with them;
// the session's own `sheet` (a cut part's, or the one Cut from sheet handed
// over) wins over the remembered one. `shapes`: the shape tools' remembered
// options (HD-3, §7.2; HD-4's Edit sizes), reported back through
// `onShapeOptionsChange`. `onHandChange`: what is in hand ({ tool, op,
// selectedIds, selectedDimensionId, offsetFrom }: sketchHelp.js reads it),
// told the workspace whenever it changes (§8.0 item 3).
export default function CadSketcher({
  viewport,
  session,
  snap,
  onSnapChange,
  onFinish,
  onCancel,
  onLookAt,
  relief = null,
  onReliefChange = null,
  shapes = null,
  onShapeOptionsChange = null,
  onHandChange = null,
}) {
  const [state, dispatch] = useReducer(sketchReducer, session, (s) =>
    createSketchState(
      s.entities || [],
      s.parameters || {},
      s.dimensions || [],
      s.boundary || [],
      mergeRelief(relief || {}, s.sheet ? { sheet: s.sheet } : {}),
      s.zero || null,
      mergeShapes(shapes || {}),
    ),
  );
  const [hud, setHud] = useState(null);
  // The view's millimetres per pixel at its centre, learnt on every camera
  // change (§7.0: a frame from the keyboard, Look at, a wheel zoom), so the
  // markers keep their size on screen without a pointer move.
  const [viewScale, setViewScale] = useState(null);
  // Check (docs/sketch-studio-hand-drawing.md §6.5): the panel open, the row
  // under the pointer or with the focus (its marker drawn larger), and the row
  // to focus once a fix has gone through.
  const [checkOpen, setCheckOpen] = useState(false);
  // { pointer, focus }: the problem ids under the pointer and with the focus.
  const [checkHover, setCheckHover] = useState(NO_HOVER);
  const checkFocus = useRef(null);
  const checkButton = useRef(null);
  const checkRows = useRef([]);
  // Check stands above the status line however that wraps: its foot is set
  // after each render from where the status line's top edge is (no layout in
  // jsdom: the stylesheet's place stands).
  const statusRef = useRef(null);
  const checkPanel = useRef(null);
  useLayoutEffect(() => {
    const [status, panel] = [statusRef.current, checkPanel.current];
    const parent = status?.offsetParent;
    if (!panel || !parent || !status.offsetHeight) return;
    panel.style.bottom = `${parent.clientHeight - status.offsetTop + 6}px`;
  });
  // The HUD stands below the bar and its options row (HD-3 §7.2: the shape tools have a row
  // there, and the HUD with no pointer position would cover it): the row's foot, measured
  // after each render and set on the box before it is painted (no layout in jsdom: 56 px stands).
  const topBlock = useRef(null);
  const hudBox = useRef(null);
  const hudFloor = useRef(56);
  useLayoutEffect(() => {
    const [top, box] = [topBlock.current, hudBox.current];
    if (!top?.offsetHeight) return;
    hudFloor.current = Math.max(56, top.offsetTop + top.offsetHeight + 6);
    if (box && parseFloat(box.style.top) < hudFloor.current) box.style.top = `${hudFloor.current}px`;
  });
  const fieldRefs = useRef([]);
  const { frame } = session;
  // Snappable model edges in this plane (the picked face outline plus other
  // model edges lying in it), collected when the sketch started, and the 3D
  // measure mark points projected onto the plane.
  const boundary = session.boundary;
  const markPoints = session.markPoints;
  // While the selection is on its way (dragged, or Move's / Copy's target,
  // Rotate's angle: §7.3) it snaps to everything that is not moving.
  const moving =
    Boolean(state.drag) ||
    ((state.op?.kind === 'move' || state.op?.kind === 'copy') && state.op.step === 'target') ||
    (state.op?.kind === 'rotate' && state.op.step === 'angle');
  const still = useMemo(() => {
    if (!moving) return state.entities;
    const chosen = new Set(state.selectedIds);
    return state.entities.filter((e) => !chosen.has(e.id));
  }, [moving, state.entities, state.selectedIds]);
  const targets = useMemo(
    () =>
      snapTargets({
        entities: still,
        boundary,
        extraPoints: [...state.points, ...(state.chainStart ? [state.chainStart] : [])],
        marks: markPoints || [],
      }),
    [still, state.points, state.chainStart, boundary, markPoints],
  );
  const latest = useRef({});
  useLayoutEffect(() => {
    latest.current = { state, targets, snap, onFinish, onCancel, onLookAt, storedZero: session.zero };
  });
  // The left press under way: { at (screen), start (plane), free (began on
  // nothing, no tool), box (dragged past CLICK_PIXELS), grab (began on a
  // selected entity: the point it is held by, HD-3 §7.3), dragging (a grab
  // dragged past CLICK_PIXELS) }; null when none. Esc during a box or a drag
  // clears it here too, so the release selects or moves nothing.
  const press = useRef(null);
  // The press is the box's or the drag's other half: whatever ends them in the
  // state (a tool key, Ctrl+A, Ctrl+Z, an action, a Check row) ends it too,
  // before the next move could start them again or the release apply them.
  useLayoutEffect(() => {
    const started = press.current;
    if (started && ((started.box && !state.box) || (started.dragging && !state.drag))) press.current = null;
  }, [state.box, state.drag]);

  // Pointer input on the canvas: moves update the snapped cursor, short
  // left clicks place points (or select an entity when no tool is active).
  useEffect(() => {
    const canvas = viewport.current?.getCanvas();
    if (!canvas) return;
    const locate = (event) => {
      const api = viewport.current;
      const raw = api?.planePoint(event.clientX, event.clientY, frame);
      if (!raw) return null;
      const near = api.planePoint(event.clientX + 10, event.clientY, frame);
      const mmPerPixel = near ? Math.hypot(near[0] - raw[0], near[1] - raw[1]) / 10 : 1;
      const { state: current, targets: currentTargets, snap: grid } = latest.current;
      const from = orthoFrom(current);
      const placing = current.tool === 'dimension' && dimensionStep(current) === 'place';
      const tolerance = SNAP_PIXELS * mmPerPixel;
      const snapped = snapPoint(raw, {
        targets: placing ? NO_TARGETS : currentTargets,
        grid,
        tolerance,
        ortho: event.shiftKey && !placing && Boolean(from),
        from,
      });
      const rect = canvas.getBoundingClientRect();
      return {
        ...snapped,
        raw,
        mmPerPixel,
        tolerance,
        shift: event.shiftKey,
        // Rotate's angle from the cursor: 15° steps with Shift, whole degrees with Snap on (§7.3).
        angleStep: event.shiftKey ? 15 : grid > 0 ? 1 : 0,
        screen: [event.clientX - rect.left, event.clientY - rect.top],
        view: [rect.width, rect.height],
      };
    };
    // What the Dimension tool needs besides the snapped point (sketchTools.js dimensionClick).
    const pointer = (type, located) => ({
      type,
      point: located.point,
      kind: located.kind,
      raw: located.raw,
      tolerance: located.tolerance,
      shift: located.shift,
      angleStep: located.angleStep,
    });
    // Dimensions first (their labels let clicks through to the canvas), then entities.
    const hitAt = (current, located) => {
      const dimensionId = hitDimension(
        current.dimensions,
        located.raw,
        located.tolerance,
        located.mmPerPixel * MARKER_PX,
      );
      return dimensionId ? { dimensionId } : { id: hitEntity(current.entities, located.raw, located.tolerance) };
    };
    // The box from the press to `event` (docs/sketch-studio-hand-drawing.md §5.1):
    // dragged to the right on screen it takes what lies wholly inside, to the left what it touches.
    const boxTo = (started, event, located) => ({
      type: 'box',
      from: started.start,
      to: located.raw,
      mode: event.clientX >= started.at[0] ? 'inside' : 'touching',
      add: event.shiftKey,
    });
    // A box or a drag whose release was missed (the button no longer held),
    // a pointercancel or a window blur: dropped, never applied (a drag puts
    // everything back, no history step).
    const dropBox = () => {
      if (press.current?.box) dispatch({ type: 'box-cancel' });
      if (press.current?.dragging) dispatch({ type: 'drag-cancel' });
      press.current = null;
    };
    const move = (event) => {
      const located = locate(event);
      if (!located) return;
      dispatch(pointer('move', located));
      setHud({ screen: located.screen, mmPerPixel: located.mmPerPixel, view: located.view });
      const started = press.current;
      if (!started?.free && !started?.grab) return;
      if (event.pointerType && !(event.buttons & 1)) return dropBox();
      const far = Math.hypot(event.clientX - started.at[0], event.clientY - started.at[1]) > CLICK_PIXELS;
      if (started.grab) {
        // A selected entity dragged past CLICK_PIXELS moves the selection (§7.3): the grabbed point goes to the snap.
        if (!started.dragging && !far) return;
        started.dragging = true;
        dispatch({ type: 'drag', grab: started.grab, to: located.point });
        return;
      }
      if (!started.box && !far) return;
      started.box = true;
      dispatch(boxTo(started, event, located));
    };
    const pointerDown = (event) => {
      press.current = null;
      if (event.button !== 0) return;
      const started = { at: [event.clientX, event.clientY], start: null, free: false, box: false };
      press.current = started;
      const current = latest.current.state;
      if (current.tool || current.op) return;
      const located = locate(event);
      if (!located) return;
      const hit = hitAt(current, located);
      // Begun on an entity or a dimension it is a click, never a box; on a
      // selected entity it may become a drag, held by its nearest key point
      // within the snap tolerance, else by the press point.
      started.start = located.raw;
      started.free = !hit.dimensionId && !hit.id;
      if (hit.id && current.selectedIds.includes(hit.id)) {
        const entity = current.entities.find((e) => e.id === hit.id);
        let grab = null;
        for (const key of entityKeyPoints(entity)) {
          const d = Math.hypot(key.point[0] - located.raw[0], key.point[1] - located.raw[1]);
          if (d <= located.tolerance && (!grab || d < grab.d)) grab = { d, point: key.point };
        }
        started.grab = grab ? grab.point : located.raw;
      }
      try {
        if ((started.free || started.grab) && event.pointerId != null) canvas.setPointerCapture?.(event.pointerId);
      } catch {
        /* the press goes on without the capture */
      }
    };
    const pointerUp = (event) => {
      const started = press.current;
      if (!started || event.button !== 0) return;
      press.current = null;
      if (started.box) {
        const located = locate(event);
        if (located) dispatch(boxTo(started, event, located));
        dispatch({ type: 'box-end' });
        return;
      }
      if (started.dragging) {
        const located = locate(event);
        if (located) dispatch({ type: 'drag', grab: started.grab, to: located.point });
        dispatch({ type: 'drag-end' });
        return;
      }
      const moved = Math.hypot(event.clientX - started.at[0], event.clientY - started.at[1]);
      if (moved > CLICK_PIXELS) return;
      const located = locate(event);
      if (!located) return;
      const current = latest.current.state;
      if (current.tool || current.op) {
        dispatch(pointer('click', located));
        return;
      }
      // Shift or Ctrl + click adds the entity or takes it out of the selection.
      dispatch({
        type: 'select',
        ...hitAt(current, located),
        toggle: event.shiftKey || event.ctrlKey || event.metaKey,
      });
    };
    const doubleClick = () => {
      if (latest.current.state.tool === 'line') dispatch({ type: 'finish-chain' });
    };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerdown', pointerDown);
    canvas.addEventListener('pointerup', pointerUp);
    canvas.addEventListener('pointercancel', dropBox);
    canvas.addEventListener('dblclick', doubleClick);
    window.addEventListener('blur', dropBox);
    return () => {
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerdown', pointerDown);
      canvas.removeEventListener('pointerup', pointerUp);
      canvas.removeEventListener('pointercancel', dropBox);
      canvas.removeEventListener('dblclick', doubleClick);
      window.removeEventListener('blur', dropBox);
      press.current = null;
    };
  }, [viewport, frame]);

  // Dimensions with no drawing are not finished (never a silent loss): the sketcher stays and says why.
  const finish = () => {
    const current = latest.current.state;
    const refusal = finishRefusal(current);
    if (refusal) dispatch({ type: 'message', text: refusal });
    // The zero goes with it only when it was moved or the sketch had one (§6.1):
    // a sketch whose zero was never moved finishes exactly as before.
    else if (!isOrigin(current.zero) || latest.current.storedZero)
      latest.current.onFinish(current.entities, current.dimensions, {
        zero: isOrigin(current.zero) ? null : current.zero,
      });
    else latest.current.onFinish(current.entities, current.dimensions);
  };
  // A tool's button or key: turns it on, or off when it is the one on.
  const toggle = (tool) => dispatch({ type: 'tool', tool: latest.current.state.tool === tool ? null : tool });
  // Keys with focus outside the HUD: Esc drops a box being dragged, then the
  // tool, then the selection, then finishes the sketch; Enter ends a polyline; Delete
  // removes the selection or the selected dimension; Ctrl+A selects every
  // entity; X is Construction; a tool's key (SKETCH_KEYS: L, R, Shift+R, C,
  // A, S, P, D, B) toggles it; M, K, Q, I, G start or end an action on the
  // selection (HD-3, §7.3). Nothing else in sketch mode uses these letters: the
  // workspace's own keys (R rotate, D measure, …) are off while a sketch is open.
  useEffect(() => {
    const keyDown = (event) => {
      if (event.target instanceof HTMLElement && event.target.closest('input, select, textarea')) return;
      const current = latest.current.state;
      if (event.key === 'Escape') {
        event.preventDefault();
        // A box or a drag goes first: its release must then select or move nothing.
        if (current.box || current.drag) press.current = null;
        if (sketchMode(current) !== 'idle') dispatch({ type: 'escape' });
        else finish();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        dispatch({ type: 'enter' });
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        if (current.selectedIds.length || current.selectedDimensionId) {
          event.preventDefault();
          dispatch({ type: 'delete' });
        }
      } else {
        const command = sketchCommand(event);
        if (command === 'select-all' || command === 'construction') {
          event.preventDefault();
          dispatch({ type: command });
          return;
        }
        // Z: the Zero tool, on or off like a tool's key (§6.1).
        if (command === 'zero') {
          event.preventDefault();
          toggle('zero');
          return;
        }
        // M, K, Q, I, G: an action on the selection, on or off (§7.3).
        if (isSelectionAction(command)) {
          event.preventDefault();
          dispatch({ type: 'op', kind: command });
          return;
        }
        const tool = sketchKey(event);
        if (!tool || tool === 'undo') return;
        event.preventDefault();
        toggle(tool);
      }
    };
    window.addEventListener('keydown', keyDown);
    return () => window.removeEventListener('keydown', keyDown);
  }, []);
  // Ctrl+Z is Undo last, Ctrl+Y and Ctrl+Shift+Z Redo, from the canvas, the
  // bar or a HUD field (a field's own text undo is not kept). Taken on the
  // window's capture, before anything else sees them: the studio's Ctrl+Z /
  // Ctrl+Y (useSketchKeyboard) would also undo or redo the model. In any
  // other box (the Snap box, an options or selection row, a panel field) it
  // is that box's own text undo, and still never the model's.
  useEffect(() => {
    const historyKey = (event) => {
      const step = sketchKey(event) === 'undo' ? 'undo' : sketchCommand(event) === 'redo' ? 'redo' : null;
      if (!step) return;
      event.stopImmediatePropagation();
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest('input, select, textarea') && !target.closest('.cad-sketch-hud')) return;
      event.preventDefault();
      dispatch({ type: step });
    };
    window.addEventListener('keydown', historyKey, true);
    return () => window.removeEventListener('keydown', historyKey, true);
  }, []);

  const preview = previewEntities(state);
  const span = session.span || 1000;
  const gridBounds = session.gridBounds || [
    [-span, -span],
    [span, span],
  ];
  // The view's own scale (every camera change), else the pointer's last, else a guess from the span.
  const markerSize = (viewScale || hud?.mmPerPixel || span / 500) * MARKER_PX;
  useEffect(() => {
    const api = viewport.current;
    if (!api?.watchView) return undefined;
    const measure = () => {
      const canvas = api.getCanvas?.();
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const [x, y] = [rect.left + rect.width / 2, rect.top + rect.height / 2];
      const [a, b] = [api.planePoint(x, y, frame), api.planePoint(x + 10, y, frame)];
      if (!a || !b) return;
      const scale = Math.hypot(b[0] - a[0], b[1] - a[1]) / 10;
      if (scale > 0) setViewScale((old) => (old && Math.abs(old - scale) <= old * 1e-6 ? old : scale));
    };
    measure();
    return api.watchView(measure);
  }, [viewport, frame]);
  // An action's ghost (§7.3, §7.4) and how far a drag has taken the selection.
  const ghost = ghostEntities(state);
  // Offset's chosen entity as a selection array kept while it is the same (the overlay keys on it).
  const offsetChosen = useMemo(() => (state.offsetFrom ? [state.offsetFrom] : null), [state.offsetFrom]);
  // What is in hand, told the workspace when it changes (its Sketching panel, §8.0 item 3).
  const handKey = [
    state.tool,
    state.op?.kind,
    state.op?.step,
    state.selectedIds.length,
    state.selectedDimensionId,
    state.offsetFrom,
  ].join('|');
  useEffect(() => {
    const { tool, op, selectedIds, selectedDimensionId, offsetFrom } = latest.current.state;
    onHandChange?.({
      tool,
      op: op ? { kind: op.kind, step: op.step } : null,
      selectedIds,
      selectedDimensionId,
      offsetFrom,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the key is what is in hand
  }, [handKey]);
  const dragOffset = state.drag ? [state.drag.to[0] - state.drag.grab[0], state.drag.to[1] - state.drag.grab[1]] : null;
  const zeroMoved = !isOrigin(state.zero);
  // Check (§6.4): worked out once per drawing (and zero, for its words), for
  // the status line's count and the panel; a split finish is the shop's.
  const check = useMemo(
    () => checkDrawing(state.entities, { zero: state.zero, split: Boolean(session.returnTo) }),
    [state.entities, state.zero, session.returnTo],
  );
  useEffect(() => {
    // Each dimension as plain drawing data (the viewport stays dumb), then
    // the one the place click would keep.
    const drawn = (dimension) => {
      const { segments, labelAt, text, value } = dimensionGeometry(dimension, markerSize);
      return { id: dimension.id, segments, labelAt, text, value };
    };
    const placing = state.tool === 'dimension' ? pendingDimension(state)?.dimension : null;
    viewport.current?.setSketchOverlay({
      frame,
      gridBounds,
      gridStep: gridStep(Math.max(gridBounds[1][0] - gridBounds[0][0], gridBounds[1][1] - gridBounds[0][1]), snap),
      boundary,
      markPoints,
      entities: state.entities,
      preview,
      cursor: state.cursor,
      snapKind: state.snapKind,
      markerSize,
      // The selection set (its array is kept while it does not change) and the box being dragged;
      // Offset's chosen entity is drawn as selected while it waits for its side (HD-4, §8.4).
      selectedIds: offsetChosen || state.selectedIds,
      box: state.box,
      // HD-3 (§7.3, §7.4): an action's ghost, one batch (its array kept while
      // nothing it is made from changes: Pattern's), and a drag's offset of the selection.
      ghost: ghost.entities,
      dragOffset,
      // HD-4 (§8.1): what an Edit tool's click would take away, red, one batch.
      cut: cutEntities(state),
      // The zero's marker while it is not the origin; Check's markers while its list is open (§6.1, §6.5).
      zero: zeroMoved ? state.zero : null,
      problems: checkOpen ? check.problems : null,
      problemFocus: checkOpen ? checkHover : NO_HOVER,
      dimensions: [
        ...state.dimensions.map((d) => ({
          ...drawn(d),
          selected: d.id === state.selectedDimensionId,
          preview: false,
        })),
        ...(placing ? [{ ...drawn(placing), selected: false, preview: true }] : []),
      ],
    });
  });
  useEffect(() => () => viewport.current?.setSketchOverlay(null), [viewport]);

  // A typed shape larger than the view (a 1200 mm desktop on a fresh plane)
  // would be drawn mostly off-screen; refit the view to include it.
  useEffect(() => {
    const visible = session.visible;
    if (!visible || !state.entities.length) return;
    const outside = state.entities.some((entity) =>
      entityPolyline(entity, 16).some(
        ([u, v]) => u < visible[0][0] || v < visible[0][1] || u > visible[1][0] || v > visible[1][1],
      ),
    );
    if (outside) latest.current.onLookAt?.(state.entities, framedPoints(latest.current.state));
  }, [state.entities, session.visible]);
  const fields = sketchFields(state);
  const live = liveValues(state);
  // The shape tools' words follow their options (§7.2).
  const hintKey =
    state.tool === 'slot' && state.shapes.slotFirst === 'end'
      ? 'slot-end'
      : state.tool === 'polygon' && state.shapes.polygonSize === 'corners'
        ? 'polygon-corners'
        : state.tool;
  const step = Math.min(state.offsetFrom ? 1 : state.points.length, (HINTS[hintKey]?.length || 1) - 1);
  const opHint = state.op
    ? OP_HINTS[
        state.op.kind === 'pattern'
          ? `pattern:${state.pattern.kind === 'circle' ? 'circle' : 'numbers'}`
          : `${state.op.kind}:${state.op.step}`
      ]
    : null;
  const toolHint = state.drag
    ? DRAG_HINT
    : opHint || (state.tool === 'dimension' ? dimensionHint(state) : state.tool ? HINTS[hintKey][step] : null);
  // A box being dragged: what its release takes (docs/sketch-studio-hand-drawing.md §5.1).
  const boxed = useMemo(
    () => (state.box ? boxSelect(state.entities, [state.box.from, state.box.to], state.box.mode).length : 0),
    [state.box, state.entities],
  );
  const selecting = state.selectedIds.length > 0 || Boolean(state.selectedDimensionId);
  const hint = state.box
    ? `${boxed} ${state.box.mode === 'inside' ? 'wholly inside' : 'touched'} · release to select${state.box.add ? ' (added)' : ''} · Esc drops the box`
    : toolHint
      ? state.construction && DRAW_TOOLS.has(state.tool)
        ? `Construction · ${toolHint}`
        : toolHint
      : selecting
        ? 'Shift+click adds or takes out · drag a box to the right for what is inside, to the left for what it touches · Esc clears the selection'
        : 'Choose a tool · click to select · drag a box to the right for what is inside, to the left for what it touches · Esc finishes the sketch';
  const relieving = state.tool === 'relief';
  const editing = EDIT_TOOLS.has(state.tool);
  const readout = relieving ? reliefReadout(state) : editing ? editReadout(state) : dimensionReadout(state);
  // A Fillet over a rectangle's corner: its own Corner radius rounds all four (§8.3).
  const rectCorner = state.tool === 'fillet' && Boolean(editHover(state)?.pick?.rect);
  // Keep typing going to the active HUD field while a tool is in use. The
  // Dimension, Relief and Edit tools have no field: their toolbar button gives
  // the focus up, so Esc, the tool keys and Delete reach the sketcher and
  // Space / Enter never re-press it.
  // An action with a HUD (Move, Copy, Rotate, Mirror: §7.3) takes the typing the same way.
  const opStep = state.op ? `${state.op.kind}:${state.op.step}` : null;
  useEffect(() => {
    if (!state.tool && !(opStep && fields.length)) return;
    if (state.tool === 'dimension' || state.tool === 'relief' || EDIT_TOOLS.has(state.tool)) {
      const active = document.activeElement;
      // An Edit tool's size committed in its row gives the focus up too, so its keys reach the sketcher.
      const row = EDIT_TOOLS.has(state.tool) && active instanceof HTMLElement && active.closest('.cad-sketch-options');
      if (active instanceof HTMLElement && (active.closest('.cad-sketch-toolbar') || row)) active.blur();
      return;
    }
    fieldRefs.current[state.field]?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the field count follows the tool and the step
  }, [state.tool, state.points.length, state.entities.length, state.field, state.construction, opStep, state.shapes]);
  // After a fix the list is worked out again and the focus stays in it, on the
  // row that took the fixed one's place (the last row, or Close, when none).
  useEffect(() => {
    const index = checkFocus.current;
    if (index == null || !checkOpen) return;
    checkFocus.current = null;
    const rows = checkRows.current.filter(Boolean);
    const row = rows[Math.min(index, rows.length - 1)];
    (row || document.querySelector('.cad-sketch-check-close'))?.focus({ preventScroll: true });
  }, [check, checkOpen]);
  // Check's ways out: Close, the Check button again, Esc with the focus in it.
  const closeCheck = () => {
    setCheckOpen(false);
    setCheckHover(NO_HOVER);
  };
  const openCheck = () => {
    setCheckOpen(true);
    checkFocus.current = 0;
  };
  // A row: its place framed (the camera only) and its entities selected.
  const showProblem = (problem) => {
    onLookAt?.([], problem.points, { place: true });
    if (problem.entityIds.length) dispatch({ type: 'select-ids', ids: problem.entityIds });
  };
  const fixProblem = (problem, index) => {
    checkFocus.current = index;
    dispatch({ type: 'fix', problem });
  };
  const checkKey = (event) => {
    // Enter is the focused row's or fix's own (a click): the sketcher's Enter
    // (which takes the key's default away) never sees it.
    if (event.key === 'Enter') return event.stopPropagation();
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    closeCheck();
    checkButton.current?.focus({ preventScroll: true });
  };
  // The HUD field holds the focus while drawing, so a tool's key (and X,
  // Construction) is read here too, but only while this field is empty: typed
  // text keeps its letters ("1e3", "=width-2*t"). The letter is not typed.
  const fieldKey = (event, index) => {
    const tool = sketchKey(event);
    const command = sketchCommand(event);
    if (command === 'construction' && event.target.value === '') {
      event.preventDefault();
      dispatch({ type: 'construction' });
    } else if (command === 'zero' && event.target.value === '') {
      event.preventDefault();
      toggle('zero');
    } else if (isSelectionAction(command) && event.target.value === '') {
      event.preventDefault();
      dispatch({ type: 'op', kind: command });
    } else if (event.key === 'Tab') {
      event.preventDefault();
      dispatch({ type: 'field', index: index + (event.shiftKey ? -1 : 1) });
    } else if (event.key === 'Enter') {
      event.preventDefault();
      dispatch({ type: 'enter' });
    } else if (event.key === 'Escape') {
      event.preventDefault();
      dispatch({ type: 'escape' });
    } else if (tool && tool !== 'undo' && event.target.value === '') {
      event.preventDefault();
      toggle(tool);
    } else return;
    event.stopPropagation();
  };
  // The Relief options (docs/sketch-studio-bend-relief.md §3.3): each change
  // goes to the reducer and up to the workspace, so the next sketch starts
  // with it; a cut part's own sheet is not reported (it is that part's).
  const changeRelief = (patch) => {
    dispatch({ type: 'relief', ...patch });
    const next = mergeRelief(latest.current.state.relief, patch);
    onReliefChange?.({
      shape: next.shape,
      sizes: next.sizes,
      ...(next.sheet.fixed ? {} : { sheet: { thickness: next.sheet.thickness, stock: next.sheet.stock } }),
    });
  };
  // The shape tools' options (§7.2): to the reducer and up to the workspace for the next sketch.
  const changeShapes = (patch) => {
    dispatch({ type: 'shapes', ...patch });
    onShapeOptionsChange?.(mergeShapes(latest.current.state.shapes, patch));
  };
  // Pattern's numbers (§7.4); its centre typed from the zero.
  const changePattern = (patch) => dispatch({ type: 'pattern', patch });
  const patternBox = (key, label, aria, unit = 'mm', extra = {}) => (
    <label key={key}>
      {label}{' '}
      <NumericInput
        aria-label={unit ? `${aria} (${unit})` : aria}
        step={unit === 'mm' ? '0.5' : '1'}
        value={state.pattern[key]}
        onCommit={(v) => changePattern({ [key]: v })}
        {...extra}
      />
    </label>
  );
  // An action's options in the selection row (§7.3, §7.4), in place of the numbers.
  const opOptions = () => {
    const { op } = state;
    if (op.kind === 'rotate')
      return (
        <label>
          <input
            type="checkbox"
            checked={Boolean(op.keep)}
            onChange={(event) => dispatch({ type: 'op-option', patch: { keep: event.target.checked } })}
          />{' '}
          Keep the original
        </label>
      );
    if (op.kind === 'mirror')
      return (
        <>
          <button type="button" onClick={() => dispatch({ type: 'mirror-zero', axis: 'vertical' })}>
            Left ↔ right about the zero
          </button>
          <button type="button" onClick={() => dispatch({ type: 'mirror-zero', axis: 'horizontal' })}>
            Top ↔ bottom about the zero
          </button>
          <label>
            <input
              type="checkbox"
              checked={Boolean(op.remove)}
              onChange={(event) => dispatch({ type: 'op-option', patch: { remove: event.target.checked } })}
            />{' '}
            Remove the original
          </label>
        </>
      );
    if (op.kind === 'copy')
      return op.copies.length ? (
        <span className="cad-sketch-options-sheet">{`${op.copies.length} ${op.copies.length === 1 ? 'copy' : 'copies'} made`}</span>
      ) : null;
    if (op.kind !== 'pattern') return null;
    const p = state.pattern;
    const plan = patternPlan(state);
    const center = fromZero(p.center || state.zero, state.zero);
    const confirming = op.confirm && plan.copies.length > PATTERN_LIMIT;
    return (
      <>
        <label>
          Pattern{' '}
          <select
            aria-label="Pattern kind"
            value={p.kind}
            onChange={(event) => changePattern({ kind: event.target.value })}
          >
            {PATTERN_KINDS.map(([kind, label]) => (
              <option key={kind} value={kind}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {p.kind === 'row' && [
          patternBox('count', 'Count', 'Pattern count', '', { min: 1, title: 'How many, the original included' }),
          patternBox('dx', 'Step X', 'Pattern step X'),
          patternBox('dy', 'Step Y', 'Pattern step Y'),
        ]}
        {p.kind === 'grid' && [
          patternBox('columns', 'Columns', 'Pattern columns', '', { min: 1 }),
          patternBox('rows', 'Rows', 'Pattern rows', '', { min: 1 }),
          patternBox('columnStep', 'Column step', 'Pattern column step'),
          patternBox('rowStep', 'Row step', 'Pattern row step'),
          <label key="stagger">
            <input
              type="checkbox"
              checked={Boolean(p.stagger)}
              onChange={(event) => changePattern({ stagger: event.target.checked })}
            />{' '}
            Stagger every other row
          </label>,
        ]}
        {p.kind === 'circle' && [
          <label key="cx">
            Centre X{' '}
            <NumericInput
              aria-label="Pattern centre X (mm)"
              step="0.5"
              value={rowValue(center[0])}
              onCommit={(v) => changePattern({ center: toZero([v, center[1]], state.zero) })}
              title="From the zero; or click the centre in the view"
            />
          </label>,
          <label key="cy">
            Centre Y{' '}
            <NumericInput
              aria-label="Pattern centre Y (mm)"
              step="0.5"
              value={rowValue(center[1])}
              onCommit={(v) => changePattern({ center: toZero([center[0], v], state.zero) })}
              title="From the zero; or click the centre in the view"
            />
          </label>,
          patternBox('count', 'Count', 'Pattern count', '', { min: 1, title: 'How many, the original included' }),
          patternBox('total', 'Total angle', 'Pattern total angle', '°', {
            title: '360: evenly round; less: from 0 to the angle, both ends included',
          }),
        ]}
        <span className="cad-sketch-options-sheet" aria-label="Pattern adds">
          {patternWords(plan)}
          {plan.copies.length > PATTERN_LIMIT ? ` · the first ${groupedCount(PATTERN_LIMIT)} shown` : ''}
        </span>
        <button
          type="button"
          className={confirming ? 'cad-primary' : undefined}
          disabled={Boolean(plan.refusal) || !plan.copies.length}
          onClick={(event) => {
            dispatch({ type: 'pattern-apply' });
            event.currentTarget.blur();
          }}
        >
          {confirming ? `Add ${groupedCount(plan.copies.length)} shapes?` : 'Apply'}
        </button>
      </>
    );
  };
  // Esc in a Relief box drops its draft (the box's own rule), then leaves the
  // box so the next Esc reaches the sketcher. After the draft is gone: leaving
  // at once would commit it (a box commits on blur).
  const optionsKey = (event) => {
    if (event.key !== 'Escape') return;
    const target = event.target;
    setTimeout(() => target.blur?.(), 0);
  };
  const reliefSized = relieving ? reliefNow(state) : null;
  // What an emptied box would cut with: its automatic size, given the others as typed.
  const automatic = (key) =>
    reliefSized?.auto
      ? format(chosenSizes(state.relief.shape, { ...state.relief.sizes, [key]: null }, reliefSized.auto)[key])
      : '';
  const result = useMemo(() => entitiesToProfile(state.entities), [state.entities]);
  const derived = derivedValues(state);
  const refusalWords = shapeRefusal(state);
  // An "=" or "@" entry as the box will take it: an X or Y as its value from the zero.
  const resolveEntry = (field, text) => {
    if (field !== 'X' && field !== 'Y') return evaluateEntry(text, state.parameters);
    try {
      return { value: axisValue(state, field, text), error: '' };
    } catch (error) {
      return { value: null, error: error.message };
    }
  };
  const cursorShown = state.cursor ? fromZero(state.cursor, state.zero) : null;
  const constructionCount = useMemo(() => state.entities.filter((e) => e.construction).length, [state.entities]);
  // "7 items · 1 construction · open outline · 2 dimensions". An open end Check
  // finds makes it "open outline" even where the profile has a closed loop
  // beside it (holes drawn in an outline not yet closed): with nothing to
  // fix it reads as before.
  const openEnded = check.problems.some((p) => p.kind === 'open-end');
  const counts = `${plural(state.entities.length, 'item')} · ${constructionCount > 0 ? `${constructionCount} construction · ` : ''}${
    result.closed && !openEnded ? 'closed profile' : result.profile ? 'open outline' : 'no profile yet'
  }${state.dimensions.length > 0 ? ` · ${plural(state.dimensions.length, 'dimension')}` : ''}`;
  // The selection's note: one entity as before (whether it is construction the Construction
  // button shows, pressed), several counted by kind, or the dimension.
  const chosen = selecting ? selectedEntities(state) : [];
  const single = chosen.length === 1 ? chosen[0] : null;
  const selectionWords = state.selectedDimensionId
    ? `${describeDimension(state.dimensions.find((d) => d.id === state.selectedDimensionId))} · Delete removes it`
    : single
      ? `${describeEntity(single, state.zero)} · Delete removes it`
      : `${describeSelection(state.entities, state.selectedIds)} · Delete removes them`;
  // With the row up its edit's refusal or note stands in it, beside the boxes, not in the status line.
  const rowMessage = selecting && Boolean(state.message);
  const hudStyle = hud?.screen
    ? { left: Math.max(8, hud.screen[0] + 18), top: Math.max(hudFloor.current, hud.screen[1] + 18) }
    : { left: 16, top: Math.max(60, hudFloor.current) };
  // The readout stands left of / above the cursor near the right / bottom
  // edge: anchored by `left` there it would be squeezed against the edge.
  const readoutStyle = (() => {
    if (!hud?.screen || !hud.view?.[0]) return hudStyle;
    const [x, y] = hud.screen,
      [width, height] = hud.view;
    return {
      ...(x + READOUT_ROOM[0] > width ? { right: Math.max(8, width - x + 18) } : { left: hudStyle.left }),
      ...(y + READOUT_ROOM[1] > height ? { bottom: Math.max(8, height - y + 18) } : { top: hudStyle.top }),
    };
  })();
  return (
    <>
      {/* The sketch bar, and under it whatever its height (it wraps on a narrow view) the selection note. */}
      <div className="cad-sketch-top" ref={topBlock}>
        <div className="cad-sketch-toolbar" role="toolbar" aria-label="Sketch tools">
          <strong>{session.name}</strong>
          {/* Groups in the order of docs/sketch-studio-hand-drawing.md §3.3, each with its small label. */}
          {BAR_GROUPS.map(([group, tools]) => (
            <span key={group} className="cad-sketch-group" role="group" aria-label={group}>
              <small aria-hidden="true">{group}</small>
              {tools.map(([tool, label]) => (
                <button
                  key={tool}
                  type="button"
                  aria-pressed={state.tool === tool}
                  title={`${label} (${SKETCH_KEYS[tool]})`}
                  aria-label={SHORT_LABELS[tool] ? label : undefined}
                  aria-keyshortcuts={ariaKeys(SKETCH_KEYS[tool])}
                  onClick={() => toggle(tool)}
                >
                  {SHORT_LABELS[tool] || label}
                </button>
              ))}
              {group === 'Mark' && (
                // A toggle, never a tool: on a selection it flips it, else it arms the Draw tools (§5.4).
                // It gives the focus up so Space / Enter never re-press it.
                <button
                  type="button"
                  aria-pressed={constructionPressed(state)}
                  title="Construction (X): a selection becomes construction, or what you draw next is"
                  aria-keyshortcuts="X"
                  onClick={(event) => {
                    dispatch({ type: 'construction' });
                    if (!state.tool) event.currentTarget.blur();
                  }}
                >
                  Construction
                </button>
              )}
            </span>
          ))}
          <span className="cad-sketch-group" role="group" aria-label="History">
            <button
              type="button"
              disabled={!canUndo(state)}
              title={`Undo last (${SKETCH_KEYS.undo})`}
              aria-label="Undo last"
              aria-keyshortcuts={ariaKeys(SKETCH_KEYS.undo)}
              onClick={() => dispatch({ type: 'undo' })}
            >
              Undo
            </button>
            <button
              type="button"
              disabled={!canRedo(state)}
              title={REDO_TITLE}
              aria-keyshortcuts={REDO_ARIA}
              onClick={() => dispatch({ type: 'redo' })}
            >
              Redo
            </button>
          </span>
          <label title="Snap (mm)">
            Snap{' '}
            <NumericInput
              aria-label="Sketch snap (mm)"
              min="0"
              step="0.5"
              value={snap}
              onCommit={(v) => onSnapChange(Math.max(0, v))}
              title="Grid snap; 0 for free placement. Points and edges still snap."
            />
          </label>
          {/* Zero (docs/sketch-studio-hand-drawing.md §6.1): a tool, pressed too while the zero is moved. */}
          <button
            type="button"
            aria-pressed={state.tool === 'zero' || zeroMoved}
            title={
              zeroMoved
                ? `Zero at (${format(state.zero[0])}, ${format(state.zero[1])}): Z to move or reset it`
                : 'Zero (Z): click a point to measure X and Y from it'
            }
            aria-keyshortcuts="Z"
            onClick={() => toggle('zero')}
          >
            Zero
          </button>
          <button
            type="button"
            onClick={() => onLookAt(state.entities, framedPoints(state))}
            title="View the sketch plane squarely and fit the sketch"
          >
            Look at
          </button>
          {/* Check (§6.5): no key; it opens or closes the list of what keeps the drawing from a clean blank. */}
          <button
            ref={checkButton}
            type="button"
            aria-pressed={checkOpen}
            title="Check: what keeps the drawing from a clean blank, each with where it is"
            onClick={() => (checkOpen ? closeCheck() : openCheck())}
          >
            Check
          </button>
          <button type="button" className="cad-primary" aria-label="Finish sketch" onClick={finish}>
            Finish
          </button>
          <button type="button" aria-label="Cancel sketch" onClick={() => latest.current.onCancel()}>
            Cancel
          </button>
        </div>
        {/* The Relief tool's options, under the bar: shape, its sizes (empty: automatic), the sheet they come from. */}
        {relieving && (
          <div className="cad-sketch-options" role="group" aria-label="Relief options" onKeyDown={optionsKey}>
            <label>
              Shape{' '}
              <select
                aria-label="Relief shape"
                value={state.relief.shape}
                onChange={(event) => changeRelief({ shape: event.target.value })}
              >
                {RELIEF_SHAPES.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {RELIEF_FIELDS[state.relief.shape].map((key) => (
              <label key={key}>
                {RELIEF_BOXES[key][0]}{' '}
                <NumericInput
                  aria-label={RELIEF_BOXES[key][1]}
                  allowEmpty
                  min="0"
                  step="0.1"
                  value={state.relief.sizes[key]}
                  placeholder={automatic(key)}
                  onCommit={(v) => changeRelief({ sizes: { [key]: v } })}
                  title="Empty: automatic for the sheet"
                />
              </label>
            ))}
            {state.relief.sheet.fixed ? (
              <span className="cad-sketch-options-sheet">{sheetWords(state.relief.sheet)} (this part)</span>
            ) : (
              <label>
                Sheet (mm){' '}
                <NumericInput
                  aria-label="Relief sheet thickness (mm)"
                  min="0.1"
                  step="0.1"
                  value={state.relief.sheet.thickness}
                  onCommit={(v) => v > 0 && changeRelief({ sheet: { thickness: v } })}
                  title="The sheet the automatic sizes are worked out for"
                />
              </label>
            )}
          </div>
        )}
        {/* The Edit tools' rows (HD-4, §8.1): Fillet's radius, Chamfer's and Offset's distance, kept for the
            session and the next sketch; a rectangle's corner under Fillet says its own Radius does all four. */}
        {EDIT_ROWS[state.tool] && (
          <div className="cad-sketch-options" role="group" aria-label={EDIT_ROWS[state.tool][0]} onKeyDown={optionsKey}>
            <label>
              {EDIT_ROWS[state.tool][1]}{' '}
              <NumericInput
                aria-label={EDIT_ROWS[state.tool][2]}
                min="0"
                step="0.5"
                value={state.shapes[state.tool]}
                onCommit={(v) => v > 0 && changeShapes({ [state.tool]: v })}
                title={EDIT_ROWS[state.tool][3]}
              />
            </label>
            {rectCorner && (
              <span className="cad-sketch-options-sheet">
                A rectangle’s own Corner radius rounds all four corners at once.
              </span>
            )}
            {state.tool === 'offset' && state.offsetFrom && (
              <span className="cad-sketch-options-sheet">
                {describeEntity(state.entities.find((e) => e.id === state.offsetFrom) || {}, state.zero)} chosen
              </span>
            )}
          </div>
        )}
        {/* The Zero tool's row (§6.1): where the zero is, and Reset zero once it is moved. */}
        {state.tool === 'zero' && (
          <div className="cad-sketch-options" role="group" aria-label="Zero options">
            <span className="cad-sketch-options-sheet">
              {zeroMoved
                ? `Zero at X ${format(state.zero[0])}, Y ${format(state.zero[1])} from the sketch origin`
                : 'The zero is the sketch origin · click a point to measure from it'}
            </span>
            {zeroMoved && (
              <button type="button" onClick={() => dispatch({ type: 'zero-reset' })}>
                Reset zero
              </button>
            )}
          </div>
        )}
        {/* The shape tools' options (§7.2): the slot's width and what its Length and first click are,
            the polygon's sides and what its size is, the rectangles' corner radius. */}
        {state.tool === 'slot' && (
          <div className="cad-sketch-options" role="group" aria-label="Slot options" onKeyDown={optionsKey}>
            <label>
              Width{' '}
              <NumericInput
                aria-label="Slot width (mm)"
                min="0"
                step="0.5"
                value={state.shapes.width}
                onCommit={(v) => v > 0 && changeShapes({ width: v })}
                title="Across the slot"
              />
            </label>
            <label>
              Length is{' '}
              <select
                aria-label="Slot length is"
                value={state.shapes.slotLength}
                onChange={(event) => changeShapes({ slotLength: event.target.value })}
              >
                <option value="overall">overall</option>
                <option value="centers">centre to centre</option>
              </select>
            </label>
            <label>
              First click is{' '}
              <select
                aria-label="Slot first click"
                value={state.shapes.slotFirst}
                onChange={(event) => changeShapes({ slotFirst: event.target.value })}
              >
                <option value="center">the centre</option>
                <option value="end">one end</option>
              </select>
            </label>
          </div>
        )}
        {state.tool === 'polygon' && (
          <div className="cad-sketch-options" role="group" aria-label="Polygon options" onKeyDown={optionsKey}>
            <label>
              Sides{' '}
              <NumericInput
                aria-label="Polygon sides"
                min={POLYGON_MIN}
                max={POLYGON_MAX}
                step="1"
                value={state.shapes.sides}
                onCommit={(v) => changeShapes({ sides: Math.min(POLYGON_MAX, Math.max(POLYGON_MIN, Math.round(v))) })}
                title={`${POLYGON_MIN} to ${POLYGON_MAX}`}
              />
            </label>
            <label>
              Size is{' '}
              <select
                aria-label="Polygon size is"
                value={state.shapes.polygonSize}
                onChange={(event) => changeShapes({ polygonSize: event.target.value })}
              >
                <option value="flats">across flats</option>
                <option value="corners">across corners</option>
              </select>
            </label>
          </div>
        )}
        {(state.tool === 'rect' || state.tool === 'rect-center') && (
          <div className="cad-sketch-options" role="group" aria-label="Rectangle options" onKeyDown={optionsKey}>
            <label>
              Corner radius{' '}
              <NumericInput
                aria-label="Corner radius (mm)"
                allowEmpty
                min="0"
                step="0.5"
                value={state.shapes.radius}
                placeholder="sharp"
                onCommit={(v) => changeShapes({ radius: v > 0 ? v : null })}
                title="Empty: sharp corners"
              />
            </label>
          </div>
        )}
        {/* The selection's row (docs/sketch-studio-hand-drawing.md §3.3, §5.3, §7.3): what is selected,
            one entity's numbers (Enter or leaving a box applies it: one Undo step) or, during an
            action, its options; Move, Copy, Rotate, Mirror, Pattern; Delete selected. */}
        {selecting && (
          <div
            className="cad-sketch-options cad-sketch-selection-row"
            role="group"
            aria-label="Selection"
            onKeyDown={optionsKey}
          >
            <span className="cad-sketch-selection" role="note">
              {selectionWords}
            </span>
            {!state.op &&
              single &&
              entityFields(single, state.zero).map(({ key, label, unit, value }) => (
                <label key={`${single.id}-${key}`}>
                  {label}{' '}
                  <NumericInput
                    aria-label={unit ? `Selected ${label} (${unit})` : `Selected ${label}`}
                    allowEmpty={single.type === 'rect' && key === 'r'}
                    step={unit === '°' || !unit ? '1' : '0.1'}
                    value={rowValue(value)}
                    placeholder={single.type === 'rect' && key === 'r' ? 'sharp' : undefined}
                    onCommit={(v) => dispatch({ type: 'edit', id: single.id, patch: { [key]: v } })}
                    title={(zeroMoved && ZERO_TITLES[key]) || TYPE_TITLES[`${single.type}.${key}`] || EDIT_TITLES[key]}
                  />
                </label>
              ))}
            {state.op && opOptions()}
            {rowMessage && <span className="cad-sketch-message">{state.message}</span>}
            {state.selectedIds.length > 0 &&
              SELECTION_ACTIONS.map(([kind, label]) => (
                // The action's key or button again ends it; the button gives the focus up so Enter is the sketcher's.
                <button
                  key={kind}
                  type="button"
                  aria-pressed={state.op?.kind === kind}
                  title={ACTION_TITLES[kind]}
                  aria-keyshortcuts={SKETCH_COMMAND_KEYS[kind][0]}
                  onClick={(event) => {
                    dispatch({ type: 'op', kind });
                    event.currentTarget.blur();
                  }}
                >
                  {label}
                </button>
              ))}
            <button type="button" onClick={() => dispatch({ type: 'delete' })}>
              Delete selected
            </button>
          </div>
        )}
      </div>
      {/* A refused finish also fills the workspace's error line at the foot of the view: the status sits above it. */}
      <div className={`cad-sketch-status${session.refusal ? ' has-refusal' : ''}`} role="status" ref={statusRef}>
        <span>{hint}</span>
        {state.cursor && (
          <span>
            X {format(cursorShown[0])} · Y {format(cursorShown[1])} mm{zeroMoved ? ' from the zero' : ''}
            {state.snapKind && state.snapKind !== 'free' ? ` · ${state.snapKind}` : ''}
          </span>
        )}
        {/* With something to fix the counts become a button that opens Check (§6.5). */}
        {check.problems.length ? (
          <button type="button" className="cad-sketch-status-check" onClick={openCheck} title="Open Check">
            {counts} · {check.problems.length} to fix
          </button>
        ) : (
          <span>{counts}</span>
        )}
        {state.message && !rowMessage && <span className="cad-sketch-message">{state.message}</span>}
        {/* A finish the workspace refused (an outline a cut part no longer folds on), while the drawing is as it was. */}
        {session.refusal && session.refusal.entities === state.entities && (
          <span className="cad-sketch-message" aria-label="Sketch refused">
            {session.refusal.message}
          </span>
        )}
      </div>
      {/* Check (§6.5): one row per problem (a click or Enter frames its place and selects
          what it is about; its fix beside it), then the notes. */}
      {checkOpen && (
        <div className="cad-sketch-check" role="region" aria-label="Check" onKeyDown={checkKey} ref={checkPanel}>
          <div className="cad-sketch-check-head">
            <strong>
              {check.problems.length ? `Check · ${check.problems.length} to fix` : 'Check · nothing to fix'}
            </strong>
            <button type="button" className="cad-sketch-check-close" onClick={closeCheck}>
              Close
            </button>
          </div>
          {check.problems.length > 0 && (
            <ul aria-label="Problems">
              {check.problems.map((problem, index) => (
                <li
                  key={problem.id}
                  className={checkHover.pointer === problem.id || checkHover.focus === problem.id ? 'is-focused' : ''}
                  onMouseEnter={() => setCheckHover((h) => ({ ...h, pointer: problem.id }))}
                  onMouseLeave={() => setCheckHover((h) => (h.pointer === problem.id ? { ...h, pointer: null } : h))}
                  onFocus={() => setCheckHover((h) => ({ ...h, focus: problem.id }))}
                  onBlur={() => setCheckHover((h) => (h.focus === problem.id ? { ...h, focus: null } : h))}
                >
                  <button
                    ref={(element) => (checkRows.current[index] = element)}
                    type="button"
                    className="cad-sketch-check-place"
                    onClick={() => showProblem(problem)}
                  >
                    {problem.text}
                  </button>
                  {problem.fix && (
                    <button type="button" onClick={() => fixProblem(problem, index)}>
                      {problem.fix.label}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {check.notes.map((text) => (
            <p key={text}>{text}</p>
          ))}
        </div>
      )}
      {/* The Dimension, Relief and Edit tools' box is a readout: no fields, clicks go through it. */}
      {readout && (
        <div
          className="cad-sketch-hud is-readout"
          aria-label={READOUT_NAMES[state.tool] || 'Dimension readout'}
          style={readoutStyle}
        >
          <strong>{readout.value}</strong>
          {readout.note && <small>{readout.note}</small>}
        </div>
      )}
      {fields.length > 0 && (
        <div className="cad-sketch-hud" style={hudStyle} ref={hudBox}>
          {/* One row a pair (§6.2): the pair not typed in shows, greyed, what the typed one gives. */}
          {sketchPairs(state).map((pair) => (
            <div key={pair.join()} className="cad-sketch-hud-row">
              {pair.map((field) => {
                const index = fields.indexOf(field);
                const text = String(state.typed[field] ?? '').trim();
                const shown = field in derived ? derived[field] : live[field];
                return (
                  <label key={field}>
                    {field}
                    <ExpressionInput
                      ref={(element) => (fieldRefs.current[index] = element)}
                      aria-label={fieldLabel(field)}
                      className={[index === state.field ? 'is-active' : '', field in derived ? 'is-derived' : '']
                        .filter(Boolean)
                        .join(' ')}
                      value={state.typed[field] ?? ''}
                      placeholder={format(shown)}
                      title={field === 'X' || field === 'Y' ? AXIS_TITLE : undefined}
                      onFocus={() => index !== state.field && dispatch({ type: 'field', index })}
                      onChange={(value) => dispatch({ type: 'typed', field, value })}
                      onKeyDown={(e) => fieldKey(e, index)}
                    />
                    {(text.startsWith('=') || text.startsWith('@')) && (
                      <ResolvedEntry resolved={resolveEntry(field, text)} field={field} />
                    )}
                  </label>
                );
              })}
            </div>
          ))}
          {/* A refused slot, polygon or corner radius says why by the cursor (§7.2). */}
          {refusalWords && <small className="cad-sketch-hud-refusal">{refusalWords}</small>}
          <small>Tab switches · Enter applies · Esc ends the tool</small>
        </div>
      )}
    </>
  );
}
