import { useEffect, useMemo, useRef, useState } from 'react';
import { uid } from './model.js';
import {
  createLinearDimension,
  createRadialDimension,
  nearestCircle,
  snapViewPoint,
  viewSnapData,
} from './sheetAnnotations.js';

const SNAP_PIXELS = 8;
const HINTS = {
  linear: [
    'Click the first point (vertices, midpoints and hole centres snap).',
    'Click the second point.',
    'Click to place the dimension line: beside the span for horizontal/vertical, elsewhere for aligned.',
  ],
  diameter: ['Click a circle or arc edge.', 'Click where the diameter label goes.'],
  radius: ['Click a circle or arc edge.', 'Click where the radius label goes.'],
};

// The generated sheet with the manual dimension tool: clicks are mapped from
// screen pixels to a view's model millimetres through that view's own SVG
// transform (data-view groups), then snapped to the view's projected points.
export default function SheetPreview({ svg, zoom, views, tool, onAdd, onCancel }) {
  const host = useRef(null);
  const [stage, setStage] = useState({});
  const [hover, setHover] = useState(null);
  const [message, setMessage] = useState('');
  const snapData = useMemo(() => new Map(views.map((v) => [v.view || v.name, viewSnapData(v)])), [views]);
  const latest = useRef(onCancel);
  useEffect(() => {
    latest.current = onCancel;
  }, [onCancel]);
  useEffect(() => {
    if (!tool) return;
    const keyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        latest.current?.();
      }
    };
    window.addEventListener('keydown', keyDown);
    return () => window.removeEventListener('keydown', keyDown);
  }, [tool]);

  const locate = (event) => {
    const rect = host.current.getBoundingClientRect();
    for (const group of host.current.querySelectorAll('.cad-sheet-preview g[data-view]')) {
      const ctm = group.getScreenCTM();
      if (!ctm) continue;
      const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
      const [vx, vy, vw, vh] = (group.getAttribute('data-viewbox') || '0 0 0 0').split(' ').map(Number);
      const pxScale = Math.hypot(ctm.a, ctm.b) || 1;
      const margin = Math.max(vw, vh) * 0.15 + 20 / pxScale;
      if (p.x < vx - margin || p.x > vx + vw + margin || p.y < vy - margin || p.y > vy + vh + margin) continue;
      const view = group.getAttribute('data-view');
      const toScreen = (point) => {
        const s = new DOMPoint(point[0], point[1]).matrixTransform(ctm);
        return [s.x - rect.left, s.y - rect.top];
      };
      return { view, raw: [p.x, p.y], tolerance: SNAP_PIXELS / pxScale, toScreen };
    }
    return null;
  };
  const target = (located, step) => {
    const data = snapData.get(located.view) || { points: [], circles: [] };
    if (tool !== 'linear' && step === 0) {
      const circle = nearestCircle(located.raw, data, located.tolerance);
      return circle && { circle, screen: located.toScreen(circle.center), kind: 'circle' };
    }
    if (tool === 'linear' && step === 2)
      return { point: located.raw, screen: located.toScreen(located.raw), kind: 'place' };
    if (tool !== 'linear') return { point: located.raw, screen: located.toScreen(located.raw), kind: 'place' };
    const snapped = snapViewPoint(located.raw, data, located.tolerance);
    return { point: snapped.point, screen: located.toScreen(snapped.point), kind: snapped.kind };
  };
  const step = tool === 'linear' ? (stage.to ? 2 : stage.from ? 1 : 0) : stage.circle ? 1 : 0;
  const move = (event) => {
    if (!tool) return;
    const located = locate(event);
    setHover(located && (!stage.view || stage.view === located.view) ? target(located, step) : null);
  };
  const click = (event) => {
    if (!tool) return;
    const located = locate(event);
    if (!located) return setMessage('Click inside a drawing view.');
    if (stage.view && stage.view !== located.view) return setMessage('Pick all points in the same view.');
    const hit = target(located, step);
    if (!hit) return setMessage('No circle or arc edge there. Click on its outline.');
    setMessage('');
    try {
      if (tool === 'linear') {
        if (step === 0) setStage({ view: located.view, from: hit.point, fromScreen: hit.screen });
        else if (step === 1) setStage({ ...stage, to: hit.point, toScreen: hit.screen });
        else {
          onAdd(
            createLinearDimension({
              id: uid('annotation'),
              view: stage.view,
              from: stage.from,
              to: stage.to,
              at: hit.point,
            }),
          );
          setStage({});
        }
      } else if (step === 0) setStage({ view: located.view, circle: hit.circle, centerScreen: hit.screen });
      else {
        onAdd(
          createRadialDimension({
            id: uid('annotation'),
            view: stage.view,
            circle: stage.circle,
            at: hit.point,
            mode: tool,
          }),
        );
        setStage({});
      }
    } catch (error) {
      setMessage(error.message);
      setStage({});
    }
  };
  return (
    <div className="cad-sheet-stage" style={{ width: `${zoom * 100}%` }}>
      {tool && (
        <p className="cad-sheet-tool-hint" aria-live="polite">
          {message || HINTS[tool][step]} · Esc ends the tool
        </p>
      )}
      <div ref={host} className={`cad-sheet-host ${tool ? 'is-measuring' : ''}`} onPointerMove={move} onClick={click}>
        <div className="cad-sheet-preview" dangerouslySetInnerHTML={{ __html: svg }} />
        {tool && (
          <svg className="cad-sheet-overlay" aria-hidden="true">
            {stage.fromScreen && (
              <circle cx={stage.fromScreen[0]} cy={stage.fromScreen[1]} r="4" className="is-picked" />
            )}
            {stage.toScreen && <circle cx={stage.toScreen[0]} cy={stage.toScreen[1]} r="4" className="is-picked" />}
            {stage.centerScreen && (
              <circle cx={stage.centerScreen[0]} cy={stage.centerScreen[1]} r="4" className="is-picked" />
            )}
            {stage.fromScreen && hover && !stage.toScreen && (
              <line x1={stage.fromScreen[0]} y1={stage.fromScreen[1]} x2={hover.screen[0]} y2={hover.screen[1]} />
            )}
            {hover && (
              <circle
                cx={hover.screen[0]}
                cy={hover.screen[1]}
                r={hover.kind === 'free' || hover.kind === 'place' ? 3 : 5}
                className={hover.kind === 'free' || hover.kind === 'place' ? '' : 'is-snapped'}
              />
            )}
          </svg>
        )}
      </div>
    </div>
  );
}
