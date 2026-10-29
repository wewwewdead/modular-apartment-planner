import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { snapPoint, snapTargets } from './sketchSnap.js';
import {
  SKETCH_TOOLS,
  createSketchState,
  liveValues,
  previewEntities,
  sketchFields,
  sketchReducer,
} from './sketchTools.js';
import { describeEntity, entitiesToProfile, entityPolyline, hitEntity } from './sketchProfile.js';
import ExpressionInput from './ExpressionInput.jsx';
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
};
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
    createSketchState(s.entities || [], s.parameters || {}),
  );
  const [hud, setHud] = useState(null);
  const fieldRefs = useRef([]);
  const { frame } = session;
  // Snappable model edges in this plane (the picked face outline plus other
  // model edges lying in it), collected when the sketch started.
  const boundary = session.boundary;
  const targets = useMemo(
    () =>
      snapTargets({
        entities: state.entities,
        boundary,
        extraPoints: [...state.points, ...(state.chainStart ? [state.chainStart] : [])],
      }),
    [state.entities, state.points, state.chainStart, boundary],
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
      const snapped = snapPoint(raw, {
        targets: currentTargets,
        grid,
        tolerance: SNAP_PIXELS * mmPerPixel,
        ortho: event.shiftKey,
        from,
      });
      const rect = canvas.getBoundingClientRect();
      return { ...snapped, raw, mmPerPixel, screen: [event.clientX - rect.left, event.clientY - rect.top] };
    };
    const move = (event) => {
      const located = locate(event);
      if (!located) return;
      dispatch({ type: 'move', point: located.point, kind: located.kind });
      setHud({ screen: located.screen, mmPerPixel: located.mmPerPixel });
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
      if (current.tool) dispatch({ type: 'click', point: located.point, kind: located.kind });
      else
        dispatch({
          type: 'select',
          id: hitEntity(current.entities, located.raw, SNAP_PIXELS * located.mmPerPixel),
        });
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

  const finish = () => latest.current.onFinish(latest.current.state.entities);
  // Keys with focus outside the HUD: Esc drops the tool, then exits; Enter
  // ends a polyline; Delete removes the selected entity.
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
        if (latest.current.state.selectedId) {
          event.preventDefault();
          dispatch({ type: 'delete' });
        }
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
  useEffect(() => {
    viewport.current?.setSketchOverlay({
      frame,
      gridBounds,
      gridStep: gridStep(Math.max(gridBounds[1][0] - gridBounds[0][0], gridBounds[1][1] - gridBounds[0][1]), snap),
      boundary,
      entities: state.entities,
      selectedId: state.selectedId,
      preview,
      cursor: state.cursor,
      snapKind: state.snapKind,
      markerSize: (hud?.mmPerPixel || span / 500) * 4,
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
    if (outside) latest.current.onLookAt?.(state.entities);
  }, [state.entities, session.visible]);
  const fields = sketchFields(state);
  const live = liveValues(state);
  const step = Math.min(state.points.length, (HINTS[state.tool]?.length || 1) - 1);
  // Keep typing going to the active HUD field while a tool is in use.
  useEffect(() => {
    if (!state.tool) return;
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
  return (
    <>
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
        <button type="button" disabled={!state.entities.length} onClick={() => dispatch({ type: 'undo' })}>
          Undo last
        </button>
        <button type="button" disabled={!state.selectedId} onClick={() => dispatch({ type: 'delete' })}>
          Delete selected
        </button>
        <label>
          Snap (mm){' '}
          <input
            aria-label="Sketch snap (mm)"
            type="number"
            min="0"
            step="0.5"
            value={snap}
            onChange={(e) => onSnapChange(Math.max(0, Number(e.target.value) || 0))}
            title="Grid snap; 0 for free placement. Points and edges still snap."
          />
        </label>
        <button
          type="button"
          onClick={() => onLookAt(state.entities)}
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
      <div className="cad-sketch-status" role="status">
        <span>
          {state.tool ? HINTS[state.tool][step] : 'Choose a tool · click a line to select it · Esc exits the sketch'}
        </span>
        {state.cursor && (
          <span>
            X {format(state.cursor[0])} · Y {format(state.cursor[1])} mm
            {state.snapKind && state.snapKind !== 'free' ? ` · ${state.snapKind}` : ''}
          </span>
        )}
        <span>
          {state.entities.length} item{state.entities.length === 1 ? '' : 's'} ·{' '}
          {result.closed ? 'closed profile' : result.profile ? 'open outline' : 'no profile yet'}
        </span>
        {state.message && <span className="cad-sketch-message">{state.message}</span>}
      </div>
      {state.tool && (
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
      {state.selectedId && (
        <div className="cad-sketch-selection" role="note">
          {describeEntity(state.entities.find((e) => e.id === state.selectedId) || {})} · Delete removes it
        </div>
      )}
    </>
  );
}
