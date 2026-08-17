import { memo } from 'react';
import { PREVIEW_LABEL_OFFSET } from '@/domain/defaults';
import { CANTILEVER_DEFAULT_DISTANCE_MM, cantileverBoundary } from '@/editor/handlers/cantileverHandler';
import { TOOLS } from '@/editor/tools';
import { slabEdgeOutwardNormal } from '@/geometry/slabGeometry';

/**
 * What the cantilever tool is about to do, drawn on the plan.
 *
 * Two states, one for each half of the flow. While an edge is being chosen the
 * one under the cursor is picked out in a heavy stroke, so the side is chosen by
 * looking rather than by clicking and checking. Once it is chosen the panel owns
 * a number, and the number needs somewhere to land: a dashed ghost of the plate
 * edge where it would end up, with its two corners carried out to meet it.
 *
 * Amber, matching `OverhangIndicatorLayer` — this is the same annotation before
 * the fact, and it should read as the thing that is about to appear there.
 *
 * Non-interactive, like every preview: the picking click has to reach the
 * canvas.
 */

const CANTILEVER_ACCENT = '#d97706';

function CantileverPreview({ toolState = {}, activeTool, floor, selectedId, selectedType }) {
  if (activeTool !== TOOLS.CANTILEVER || !floor) return null;

  const pick = toolState.cantileverPick || null;
  const slabs = floor.slabs || [];
  const slab = pick
    ? slabs.find((entry) => entry.id === pick.slabId) || null
    : selectedType === 'slab' && selectedId
      ? slabs.find((entry) => entry.id === selectedId) || null
      : null;

  const boundary = slab?.boundaryPoints || [];
  if (boundary.length < 3) return null;

  if (!pick) {
    const hoverEdge = toolState.cantileverHoverEdge;
    if (!Number.isInteger(hoverEdge) || hoverEdge < 0 || hoverEdge >= boundary.length) return null;

    const start = boundary[hoverEdge];
    const end = boundary[(hoverEdge + 1) % boundary.length];

    return (
      <g className="cantilever-preview" style={{ pointerEvents: 'none' }} aria-hidden="true">
        <line
          x1={start.x}
          y1={start.y}
          x2={end.x}
          y2={end.y}
          stroke={CANTILEVER_ACCENT}
          strokeWidth={6}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </g>
    );
  }

  const distanceMm = pick.distanceMm ?? pick.defaultDistanceMm ?? CANTILEVER_DEFAULT_DISTANCE_MM;
  const projected = cantileverBoundary(boundary, pick.edgeIndex, pick.support, distanceMm);
  if (!projected) return null;

  const endIndex = (pick.edgeIndex + 1) % boundary.length;
  const from = { start: boundary[pick.edgeIndex], end: boundary[endIndex] };
  const to = { start: projected[pick.edgeIndex], end: projected[endIndex] };

  // On the outward normal so the number sits clear of the ghost edge rather
  // than on top of it, on the side the plate is growing into.
  const normal = slabEdgeOutwardNormal(boundary, pick.edgeIndex) || { x: 0, y: 0 };
  const label = {
    x: (to.start.x + to.end.x) / 2 + normal.x * PREVIEW_LABEL_OFFSET,
    y: (to.start.y + to.end.y) / 2 + normal.y * PREVIEW_LABEL_OFFSET,
  };

  return (
    <g className="cantilever-preview" style={{ pointerEvents: 'none' }} aria-hidden="true">
      {/* The corners travelling out with the edge. */}
      <line
        x1={from.start.x}
        y1={from.start.y}
        x2={to.start.x}
        y2={to.start.y}
        stroke={CANTILEVER_ACCENT}
        strokeWidth={2}
        strokeDasharray="18 10"
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={from.end.x}
        y1={from.end.y}
        x2={to.end.x}
        y2={to.end.y}
        stroke={CANTILEVER_ACCENT}
        strokeWidth={2}
        strokeDasharray="18 10"
        vectorEffect="non-scaling-stroke"
      />
      {/* Where the plate edge would finish. */}
      <line
        x1={to.start.x}
        y1={to.start.y}
        x2={to.end.x}
        y2={to.end.y}
        stroke={CANTILEVER_ACCENT}
        strokeWidth={4}
        strokeLinecap="round"
        strokeDasharray="18 10"
        vectorEffect="non-scaling-stroke"
      />
      <text
        x={label.x}
        y={label.y}
        textAnchor="middle"
        fill={CANTILEVER_ACCENT}
        fontSize={140}
        fontFamily="var(--font-blueprint)"
        paintOrder="stroke"
        stroke="rgba(255, 255, 255, 0.92)"
        strokeWidth={26}
      >
        {Math.round(distanceMm)}
      </text>
    </g>
  );
}

export default memo(CantileverPreview);
