import { memo } from 'react';
import { PREVIEW_LABEL_OFFSET } from '@/domain/defaults';
import { normalize, perpendicular, subtract } from '@/geometry/point';
import { useCanvasZoom } from './CanvasZoomContext';

/**
 * The stretches of this floor's slabs that hang out over nothing.
 *
 * A cantilever is invisible on a plan by nature: the edge that reaches past the
 * storey below looks exactly like the edge that sits on it. So the overhanging
 * runs get their own accent — dashed, amber, over the plan they belong to — and
 * each slab gets one number saying how far the deepest of them reaches.
 *
 * Amber as an annotation accent, NOT as a warning: a cantilevered bay is a
 * design move, not a fault. Whether a given overhang is actually carried is a
 * structural question, and the coordination model raises that separately.
 *
 * Unlike the other annotations drawn over the plan, a run is CLICKABLE. It has
 * to be: a cantilever is not an object anyone can select in a list, and "this
 * one, the one on the south side" is a thing you say by pointing. Each run
 * therefore carries a generous invisible hit stroke of its own; the depth label
 * stays out of the way, because nobody points at a number to mean the thing it
 * measures. Clicking anywhere else on the plate still selects the plate.
 */

const OVERHANG_ACCENT = '#d97706';

/** Wide enough to hit at plan zooms, where a run is a hairline. */
const HIT_STROKE_PX = 14;

/**
 * The hit stroke in MODEL units, so that it is `HIT_STROKE_PX` wide on screen.
 *
 * Deliberately not `vectorEffect="non-scaling-stroke"`, which is how the visible
 * strokes stay a constant weight: that keeps a stroke looking the same size
 * while leaving hit-testing to the geometric width, and at the 0.1 zoom a plan
 * is drawn at, 14 mm of geometry is 1.4 px of target. Dividing by the zoom is
 * the same trick the selection handles use to stay grabbable.
 */
function hitStrokeWidth(zoom) {
  return HIT_STROKE_PX / Math.max(zoom || 1, 0.001);
}

function deepestEdge(overhangEdges) {
  return overhangEdges.reduce((deepest, edge) => (edge.depthMm > deepest.depthMm ? edge : deepest), overhangEdges[0]);
}

/**
 * Pushed off the edge along its perpendicular so the number never sits on the
 * line it measures. Which side it lands on is not worth deciding — either is
 * clear of the stroke, which is the whole point.
 */
function labelPoint(edge) {
  const mid = { x: (edge.start.x + edge.end.x) / 2, y: (edge.start.y + edge.end.y) / 2 };
  const away = perpendicular(normalize(subtract(edge.end, edge.start)));
  return {
    x: mid.x + away.x * PREVIEW_LABEL_OFFSET,
    y: mid.y + away.y * PREVIEW_LABEL_OFFSET,
  };
}

const OverhangIndicatorLayer = memo(function OverhangIndicatorLayer({ overhangs, selectedEdge = null }) {
  const zoom = useCanvasZoom();
  if (!overhangs?.length) return null;

  const hitWidth = hitStrokeWidth(zoom);

  return (
    <g className="overhang-indicators">
      {overhangs.map((overhang) => {
        const edges = overhang.overhangEdges || [];
        if (!edges.length) return null;
        const label = labelPoint(deepestEdge(edges));
        // A run is identified by its position in derived geometry, which is
        // recomputed from the plate on every edit. An index that no longer
        // exists simply matches nothing here — the highlight disappears rather
        // than landing on whichever run inherited the number.
        const selectedIndex = selectedEdge?.slabId === overhang.slabId ? selectedEdge.edgeIndex : null;

        return (
          <g key={overhang.slabId}>
            {edges.map((edge, index) => {
              const selected = index === selectedIndex;
              return (
                <line
                  key={`${overhang.slabId}-${index}`}
                  x1={edge.start.x}
                  y1={edge.start.y}
                  x2={edge.end.x}
                  y2={edge.end.y}
                  stroke={selected ? 'var(--color-selection)' : OVERHANG_ACCENT}
                  strokeWidth={selected ? 5 : 3}
                  strokeLinecap="round"
                  strokeDasharray={selected ? undefined : '18 10'}
                  vectorEffect="non-scaling-stroke"
                  style={{ pointerEvents: 'none' }}
                />
              );
            })}
            {/* The hit strokes ride above their own indicators and below
                everything drawn after this layer, so the plate's selection
                handles — which sit on these very edges — still take their
                drags. Transparent rather than opacity-0: an invisible target is
                still a target, and this way it never tints what is under it. */}
            {edges.map((edge, index) => (
              <line
                key={`${overhang.slabId}-hit-${index}`}
                data-overhang-slab={overhang.slabId}
                data-overhang-edge={index}
                x1={edge.start.x}
                y1={edge.start.y}
                x2={edge.end.x}
                y2={edge.end.y}
                stroke="transparent"
                strokeWidth={hitWidth}
                strokeLinecap="round"
                style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
              />
            ))}
            <text
              x={label.x}
              y={label.y}
              textAnchor="middle"
              fill={OVERHANG_ACCENT}
              fontSize={140}
              fontFamily="var(--font-blueprint)"
              paintOrder="stroke"
              stroke="rgba(255, 255, 255, 0.92)"
              strokeWidth={26}
              style={{ pointerEvents: 'none' }}
              aria-hidden="true"
            >
              {Math.round(overhang.maxDepthMm)}
            </text>
          </g>
        );
      })}
    </g>
  );
});

export default OverhangIndicatorLayer;
