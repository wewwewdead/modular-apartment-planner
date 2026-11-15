import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { snapPoint, snapTargets } from './sketchSnap.js';
import {
  SKETCH_TOOLS,
  createSketchState,
  dimensionReadout,
  dimensionStep,
  finishRefusal,
  liveValues,
  pendingDimension,
  previewEntities,
  sketchFields,
  sketchReducer,
} from './sketchTools.js';
import { describeEntity, entitiesToProfile, entityPolyline, hitEntity } from './sketchProfile.js';
import { describeDimension, dimensionGeometry, dimensionPoints, hitDimension } from './sketchDimensions.js';
import ExpressionInput from './ExpressionInput.jsx';
import NumericInput from '../components/NumericInput.jsx';
import { evaluateEntry } from './parameters.js';

// The value an "=expression" in the HUD will place, or why it cannot.
function ResolvedEntry({ text, values, field }) {
  const { value, error } = evaluateEntry(text, values);
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
const fieldLabel = (field) => `Sketch ${field.toLowerCase()}`;
const format = (value) => (Number.isFinite(value) ? Number(value.toFixed(2)).toString() : '');
// A light grid: roughly 30-60 lines across the view, never finer than the snap.
function gridStep(span, snap) {
  const raw = span / 40;
  const power = 10 ** Math.floor(Math.log10(raw));
  const nice = [1, 2, 5, 10].map((m) => m * power).find((value) => value >= raw) || power * 10;
  return snap > 0 ? Math.max(snap, Math.ceil(nice / snap) * snap) : nice;
}

// In-viewport sketcher: owns the drawing state, listens on the viewport
// canvas, draws through the viewport's overlay API and shows the HUD.
export default function CadSketcher({ viewport, session, snap, onSnapChange, onFinish, onCancel, onLookAt }) {
  const [state, dispatch] = useReducer(sketchReducer, session, (s) =>
    createSketchState(s.entities || [], s.parameters || {}, s.dimensions || [], s.boundary || []),
  );
  const [hud, setHud] = useState(null);
  const fieldRefs = useRef([]);
  const { frame } = session;
  // Snappable model edges in this plane (the picked face outline plus other
  // model edges lying in it), collected when the sketch started, and the 3D
  // measure mark points projected onto the plane.
  const boundary = session.boundary;
  const markPoints = session.markPoints;
  const targets = useMemo(
    () =>
      snapTargets({
        entities: state.entities,
        boundary,
        extraPoints: [...state.points, ...(state.chainStart ? [state.chainStart] : [])],
        marks: markPoints || [],
      }),
    [state.entities, state.points, state.chainStart, boundary, markPoints],
  );
  const latest = useRef({});
  useLayoutEffect(() => {
    latest.current = { state, targets, snap, onFinish, onCancel, onLookAt };
  });

  // Pointer input on the canvas: moves update the snapped cursor, short
  // left clicks place points (or select an entity when no tool is active).
  useEffect(() => {
    const canvas = viewport.current?.getCanvas();
    if (!canvas) return;
    let down = null;
    const locate = (event) => {
      const api = viewport.current;
      const raw = api?.planePoint(event.clientX, event.clientY, frame);
      if (!raw) return null;
      const near = api.planePoint(event.clientX + 10, event.clientY, frame);
      const mmPerPixel = near ? Math.hypot(near[0] - raw[0], near[1] - raw[1]) / 10 : 1;
      const { state: current, targets: currentTargets, snap: grid } = latest.current;
      const from = current.points.at(-1) || null;
      const placing = current.tool === 'dimension' && dimensionStep(current) === 'place';
      const tolerance = SNAP_PIXELS * mmPerPixel;
      const snapped = snapPoint(raw, {
        targets: placing ? NO_TARGETS : currentTargets,
        grid,
        tolerance,
        ortho: event.shiftKey && !placing,
        from,
      });
      const rect = canvas.getBoundingClientRect();
      return {
        ...snapped,
        raw,
        mmPerPixel,
        tolerance,
        shift: event.shiftKey,
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
    });
    const move = (event) => {
      const located = locate(event);
      if (!located) return;
      dispatch(pointer('move', located));
      setHud({ screen: located.screen, mmPerPixel: located.mmPerPixel, view: located.view });
    };
    const pointerDown = (event) => {
      down = event.button === 0 ? [event.clientX, event.clientY] : null;
    };
    const pointerUp = (event) => {
      if (!down || event.button !== 0) return;
      const moved = Math.hypot(event.clientX - down[0], event.clientY - down[1]);
      down = null;
      if (moved > CLICK_PIXELS) return;
      const located = locate(event);
      if (!located) return;
      const current = latest.current.state;
      if (current.tool) {
        dispatch(pointer('click', located));
        return;
      }
      // Dimensions first (their labels let clicks through to the canvas), then entities.
      const dimensionId = hitDimension(
        current.dimensions,
        located.raw,
        located.tolerance,
        located.mmPerPixel * MARKER_PX,
      );
      if (dimensionId) dispatch({ type: 'select', dimensionId });
      else dispatch({ type: 'select', id: hitEntity(current.entities, located.raw, located.tolerance) });
    };
    const doubleClick = () => {
      if (latest.current.state.tool === 'line') dispatch({ type: 'finish-chain' });
    };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerdown', pointerDown);
    canvas.addEventListener('pointerup', pointerUp);
    canvas.addEventListener('dblclick', doubleClick);
    return () => {
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerdown', pointerDown);
      canvas.removeEventListener('pointerup', pointerUp);
      canvas.removeEventListener('dblclick', doubleClick);
    };
  }, [viewport, frame]);

  // Dimensions with no drawing are not finished (never a silent loss): the sketcher stays and says why.
  const finish = () => {
    const current = latest.current.state;
    const refusal = finishRefusal(current);
    if (refusal) dispatch({ type: 'message', text: refusal });
    else latest.current.onFinish(current.entities, current.dimensions);
  };
  // Keys with focus outside the HUD: Esc drops the tool, then exits; Enter
  // ends a polyline; Delete removes the selected entity or dimension; D
  // toggles the Dimension tool.
  useEffect(() => {
    const keyDown = (event) => {
      if (event.target instanceof HTMLElement && event.target.closest('input, select, textarea')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (latest.current.state.tool) dispatch({ type: 'escape' });
        else finish();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        dispatch({ type: 'enter' });
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        if (latest.current.state.selectedId || latest.current.state.selectedDimensionId) {
          event.preventDefault();
          dispatch({ type: 'delete' });
        }
      } else if (
        event.key?.toLowerCase() === 'd' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.repeat
      ) {
        event.preventDefault();
        dispatch({ type: 'tool', tool: latest.current.state.tool === 'dimension' ? null : 'dimension' });
      }
    };
    window.addEventListener('keydown', keyDown);
    return () => window.removeEventListener('keydown', keyDown);
  }, []);

  const preview = previewEntities(state);
  const span = session.span || 1000;
  const gridBounds = session.gridBounds || [
    [-span, -span],
    [span, span],
  ];
  const markerSize = (hud?.mmPerPixel || span / 500) * MARKER_PX;
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
      selectedId: state.selectedId,
      preview,
      cursor: state.cursor,
      snapKind: state.snapKind,
      markerSize,
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
  const step = Math.min(state.points.length, (HINTS[state.tool]?.length || 1) - 1);
  const hint = state.tool === 'dimension' ? dimensionHint(state) : state.tool ? HINTS[state.tool][step] : null;
  const readout = dimensionReadout(state);
  // Keep typing going to the active HUD field while a tool is in use. The
  // Dimension tool has no field: its toolbar button gives the focus up, so
  // Esc, D and Delete reach the sketcher and Space / Enter never re-press it.
  useEffect(() => {
    if (!state.tool) return;
    if (state.tool === 'dimension') {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.closest('.cad-sketch-toolbar')) active.blur();
      return;
    }
    fieldRefs.current[state.field]?.focus({ preventScroll: true });
  }, [state.tool, state.points.length, state.entities.length, state.field]);
  const fieldKey = (event, index) => {
    if (event.key === 'Tab') {
      event.preventDefault();
      dispatch({ type: 'field', index: index + (event.shiftKey ? -1 : 1) });
    } else if (event.key === 'Enter') {
      event.preventDefault();
      dispatch({ type: 'enter' });
    } else if (event.key === 'Escape') {
      event.preventDefault();
      dispatch({ type: 'escape' });
    } else return;
    event.stopPropagation();
  };
  const result = useMemo(() => entitiesToProfile(state.entities), [state.entities]);
  const hudStyle = hud?.screen
    ? { left: Math.max(8, hud.screen[0] + 18), top: Math.max(56, hud.screen[1] + 18) }
    : { left: 16, top: 60 };
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
      <div className="cad-sketch-top">
        <div className="cad-sketch-toolbar" role="toolbar" aria-label="Sketch tools">
          <strong>{session.name}</strong>
          {SKETCH_TOOLS.map(([tool, label]) => (
            <button
              key={tool}
              type="button"
              aria-pressed={state.tool === tool}
              onClick={() => dispatch({ type: 'tool', tool: state.tool === tool ? null : tool })}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            disabled={!state.entities.length && !state.dimensions.length}
            onClick={() => dispatch({ type: 'undo' })}
          >
            Undo last
          </button>
          <button
            type="button"
            disabled={!state.selectedId && !state.selectedDimensionId}
            onClick={() => dispatch({ type: 'delete' })}
          >
            Delete selected
          </button>
          <label>
            Snap (mm){' '}
            <NumericInput
              aria-label="Sketch snap (mm)"
              min="0"
              step="0.5"
              value={snap}
              onCommit={(v) => onSnapChange(Math.max(0, v))}
              title="Grid snap; 0 for free placement. Points and edges still snap."
            />
          </label>
          <button
            type="button"
            onClick={() => onLookAt(state.entities, framedPoints(state))}
            title="View the sketch plane squarely and fit the sketch"
          >
            Look at
          </button>
          <button type="button" className="cad-primary" onClick={finish}>
            Finish sketch
          </button>
          <button type="button" onClick={() => latest.current.onCancel()}>
            Cancel sketch
          </button>
        </div>
        {state.selectedId && (
          <div className="cad-sketch-selection" role="note">
            {describeEntity(state.entities.find((e) => e.id === state.selectedId) || {})} · Delete removes it
          </div>
        )}
        {state.selectedDimensionId && (
          <div className="cad-sketch-selection" role="note">
            {describeDimension(state.dimensions.find((d) => d.id === state.selectedDimensionId))} · Delete removes it
          </div>
        )}
      </div>
      {/* A refused finish also fills the workspace's error line at the foot of the view: the status sits above it. */}
      <div className={`cad-sketch-status${session.refusal ? ' has-refusal' : ''}`} role="status">
        <span>{hint || 'Choose a tool · click a line to select it · Esc exits the sketch'}</span>
        {state.cursor && (
          <span>
            X {format(state.cursor[0])} · Y {format(state.cursor[1])} mm
            {state.snapKind && state.snapKind !== 'free' ? ` · ${state.snapKind}` : ''}
          </span>
        )}
        <span>
          {state.entities.length} item{state.entities.length === 1 ? '' : 's'} ·{' '}
          {result.closed ? 'closed profile' : result.profile ? 'open outline' : 'no profile yet'}
          {state.dimensions.length > 0 &&
            ` · ${state.dimensions.length} dimension${state.dimensions.length === 1 ? '' : 's'}`}
        </span>
        {state.message && <span className="cad-sketch-message">{state.message}</span>}
        {/* A finish the workspace refused (an outline a cut part no longer folds on), while the drawing is as it was. */}
        {session.refusal && session.refusal.entities === state.entities && (
          <span className="cad-sketch-message" aria-label="Sketch refused">
            {session.refusal.message}
          </span>
        )}
      </div>
      {/* The Dimension tool's box is a readout: no fields, clicks go through it. */}
      {readout && (
        <div className="cad-sketch-hud is-readout" aria-label="Dimension readout" style={readoutStyle}>
          <strong>{readout.value}</strong>
          {readout.note && <small>{readout.note}</small>}
        </div>
      )}
      {state.tool && state.tool !== 'dimension' && (
        <div className="cad-sketch-hud" style={hudStyle}>
          {fields.map((field, index) => (
            <label key={field}>
              {field}
              <ExpressionInput
                ref={(element) => (fieldRefs.current[index] = element)}
                aria-label={fieldLabel(field)}
                className={index === state.field ? 'is-active' : ''}
                value={state.typed[field] ?? ''}
                placeholder={format(live[field])}
                onFocus={() => index !== state.field && dispatch({ type: 'field', index })}
                onChange={(value) => dispatch({ type: 'typed', field, value })}
                onKeyDown={(e) => fieldKey(e, index)}
              />
              {String(state.typed[field] ?? '')
                .trim()
                .startsWith('=') && <ResolvedEntry text={state.typed[field]} values={state.parameters} field={field} />}
            </label>
          ))}
          <small>Tab switches · Enter applies · Esc ends the tool</small>
        </div>
      )}
    </>
  );
}
