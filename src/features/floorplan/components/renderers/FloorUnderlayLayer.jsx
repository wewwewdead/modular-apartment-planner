import { memo } from 'react';
import { columnOutline } from '@/geometry/columnGeometry';
import { getSlabRenderData } from '@/geometry/slabGeometry';
import { getWallRenderData } from '@/geometry/wallColumnGeometry';

/**
 * The floor below, drawn as a ghost under the plan you are editing.
 *
 * An upper floor that overhangs the one beneath it can only be drawn if you can
 * see what it is overhanging, so this traces the structure below — wall bodies,
 * slab edges, columns — in one muted colour at a low opacity. Everything reads
 * as one flat grey mass on purpose: it is context, not content, and it must
 * never compete with the floor that is actually being edited.
 *
 * Strictly non-interactive. There is no `data-id`/`data-type` on anything here
 * and the whole group is pointer-transparent, so a click always falls through to
 * the active floor. (Plan hit-testing is geometric and only ever reads the
 * active floor, so this is belt and braces — but the belt matters: without it a
 * ghost wall would swallow clicks aimed at empty space above it.)
 */

const GHOST_COLOR = '#94a3b8';
const GHOST_OPACITY = 0.35;

function toPoints(points) {
  return points.map((point) => `${point.x},${point.y}`).join(' ');
}

const FloorUnderlayLayer = memo(function FloorUnderlayLayer({ floor }) {
  if (!floor) return null;

  const columns = floor.columns || [];
  const walls = floor.walls || [];
  const slabs = floor.slabs || [];

  if (!columns.length && !walls.length && !slabs.length) return null;

  return (
    <g className="floor-underlay" opacity={GHOST_OPACITY} style={{ pointerEvents: 'none' }} aria-hidden="true">
      {slabs.map((slab) => {
        const renderData = getSlabRenderData(slab);
        if (!renderData) return null;
        return (
          <polygon
            key={slab.id}
            points={renderData.points}
            fill="none"
            stroke={GHOST_COLOR}
            strokeWidth={1.1}
            strokeDasharray="10 6"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
      {walls.map((wall) => {
        const outline = getWallRenderData(wall, columns).outline;
        if (!outline?.length) return null;
        return (
          <polygon
            key={wall.id}
            points={toPoints(outline)}
            fill={GHOST_COLOR}
            stroke={GHOST_COLOR}
            strokeWidth={0.75}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
      {columns.map((column) => (
        <polygon
          key={column.id}
          points={toPoints(columnOutline(column))}
          fill={GHOST_COLOR}
          stroke={GHOST_COLOR}
          strokeWidth={0.75}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </g>
  );
});

export default FloorUnderlayLayer;
