import { memo } from 'react';
import { columnOutline } from '@/geometry/columnGeometry';
import { fixtureOutline } from '@/geometry/fixtureGeometry';
import { polygonCentroid } from '@/geometry/polygon';
import { getWallRenderData, resolveWallEndpoints } from '@/geometry/wallColumnGeometry';
import { doorOutlineOnWall, windowOutlineOnWall } from '@/geometry/wallGeometry';

/**
 * The floor plan under the reflected ceiling plan: walls, columns, doors,
 * windows, rooms and furniture, drawn faintly beneath the boards' lights.
 *
 * Without it the RCP was boards and screws in an abstract U/V frame, and the
 * only sign of a wall was the hole it left in the ceiling — so placing a light
 * meant guessing which room the pointer was over. This is context, never
 * content: muted, pointer-transparent and hidden from assistive tech, so a
 * click always falls through to the board under it (the same contract as the
 * plan editor's ghost of the floor below, `FloorUnderlayLayer`).
 *
 * The geometry is drawn in plan millimetres and mapped into the ceiling's UV
 * frame by ONE transform rather than point by point. With the ceiling's local
 * space `u = x·axisU.x + y·axisU.y − minU`, `v = x·axisV.x + y·axisV.y − minV`
 * and `axisV = (axisU.y, −axisU.x)`, that transform is
 *
 *     matrix(axisU.x, axisU.y, axisU.y, −axisU.x, origin.u, origin.v)
 *
 * where `origin = space.toLocal({ x: 0, y: 0 })`. Its determinant is −1, and
 * the editor's outer `translate(0 depth) scale(1 −1)` turns it back over, so
 * the plan reads with the floor plan's own handedness however the ceiling's
 * frame was rotated.
 *
 * The room names are a second, separate layer, drawn outside the flipped group
 * in drawing coordinates — text inside a mirrored group would come out mirrored.
 */

const WALL_FILL = '#33414f';
const DOOR_FILL = '#ffd48a';
const WINDOW_FILL = '#8fd0f0';
const ROOM_STROKE = '#8fa3b8';
const FURNITURE_STROKE = '#5b6b7a';
const LABEL_FILL = '#cfd8e3';
const LABEL_HALO = '#11171d';

const LABEL_FONT_PX = 12.5;

/** The SVG transform taking plan millimetres to this ceiling's UV. */
export function planToCeilingTransform(space) {
  const origin = space.toLocal({ x: 0, y: 0 });
  return planToCeilingMatrix(space.axisU, origin);
}

function planToCeilingMatrix(axisU, origin) {
  return `matrix(${axisU.x} ${axisU.y} ${axisU.y} ${-axisU.x} ${origin.u} ${origin.v})`;
}

function polygonPoints(points) {
  return points.map((point) => `${point.x},${point.y}`).join(' ');
}

/** A door or window as the bar it cuts across its wall's thickness. */
function openingBar(wall, opening, columns, outline) {
  // The wall's real ends, as attached to the columns it runs between — the
  // same ends the plan positions its openings along.
  const { start, end } = resolveWallEndpoints(wall, columns);
  const resolved = { ...wall, start, end };
  const shape = outline(resolved, opening);
  return [shape.p1, shape.p2, shape.p3, shape.p4];
}

function roomLabelPoint(room) {
  if (room.labelPosition && Number.isFinite(room.labelPosition.x)) return room.labelPosition;
  return (room.points || []).length >= 3 ? polygonCentroid(room.points) : null;
}

/**
 * Memoised on the floor and the frame's numbers alone: a light placement
 * changes neither, so the underlay holds still while the lights move over it.
 */
export const CeilingPlanUnderlay = memo(function CeilingPlanUnderlay({ floor, axisUx, axisUy, originU, originV }) {
  if (!floor) return null;
  const columns = floor.columns || [];
  const wallsById = new Map((floor.walls || []).map((wall) => [wall.id, wall]));

  return (
    <g
      data-plan-underlay="plan"
      transform={planToCeilingMatrix({ x: axisUx, y: axisUy }, { u: originU, v: originV })}
      style={{ pointerEvents: 'none' }}
      aria-hidden="true"
    >
      {(floor.rooms || [])
        .filter((room) => (room.points || []).length >= 3)
        .map((room) => (
          <polygon
            key={room.id}
            points={polygonPoints(room.points)}
            fill="none"
            stroke={ROOM_STROKE}
            strokeOpacity={0.6}
            strokeWidth={1}
            strokeDasharray="6 4"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      {(floor.fixtures || []).map((fixture) => (
        <polygon
          key={fixture.id}
          points={polygonPoints(fixtureOutline(fixture))}
          fill="none"
          stroke={FURNITURE_STROKE}
          strokeOpacity={0.7}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {[...wallsById.values()].map((wall) => {
        const outline = getWallRenderData(wall, columns).outline;
        return outline?.length ? (
          <polygon key={wall.id} points={polygonPoints(outline)} fill={WALL_FILL} fillOpacity={0.55} />
        ) : null;
      })}
      {columns.map((column) => (
        <polygon key={column.id} points={polygonPoints(columnOutline(column))} fill={WALL_FILL} fillOpacity={0.55} />
      ))}
      {(floor.doors || []).map((door) => {
        const wall = wallsById.get(door.wallId);
        return wall ? (
          <polygon
            key={door.id}
            data-underlay-opening="door"
            points={polygonPoints(openingBar(wall, door, columns, doorOutlineOnWall))}
            fill={DOOR_FILL}
            fillOpacity={0.5}
          />
        ) : null;
      })}
      {(floor.windows || []).map((entry) => {
        const wall = wallsById.get(entry.wallId);
        return wall ? (
          <polygon
            key={entry.id}
            data-underlay-opening="window"
            points={polygonPoints(openingBar(wall, entry, columns, windowOutlineOnWall))}
            fill={WINDOW_FILL}
            fillOpacity={0.5}
          />
        ) : null;
      })}
    </g>
  );
});

/**
 * The room names, upright, in drawing coordinates (`x = u`, `y = depth − v`).
 * Sized like the dimension text and haloed in the canvas colour, so a name
 * stays legible over a pale board as well as over the dark ground.
 */
export const CeilingPlanUnderlayLabels = memo(function CeilingPlanUnderlayLabels({
  floor,
  axisUx,
  axisUy,
  originU,
  originV,
  depth,
  unitPx,
}) {
  if (!floor) return null;
  const fontSize = LABEL_FONT_PX * unitPx;
  const labels = (floor.rooms || [])
    .filter((room) => room.name && (room.points || []).length >= 3)
    .map((room) => {
      const point = roomLabelPoint(room);
      if (!point) return null;
      const u = point.x * axisUx + point.y * axisUy + originU;
      const v = point.x * axisUy - point.y * axisUx + originV;
      return { id: room.id, name: room.name, x: u, y: depth - v };
    })
    .filter(Boolean);
  if (!labels.length) return null;

  return (
    <g data-plan-underlay="labels" style={{ pointerEvents: 'none' }} aria-hidden="true">
      {labels.map((label) => (
        <text
          key={label.id}
          x={label.x}
          y={label.y}
          fontSize={fontSize}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={LABEL_FILL}
          stroke={LABEL_HALO}
          strokeWidth={3.5 * unitPx}
          strokeLinejoin="round"
          paintOrder="stroke"
        >
          {label.name}
        </text>
      ))}
    </g>
  );
});
