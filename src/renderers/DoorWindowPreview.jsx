import { TOOLS } from '@/editor/tools';
import { positionOnWall, wallDirection, wallAngle } from '@/geometry/wallGeometry';
import { perpendicular, scale, add } from '@/geometry/point';
import { DOOR_WIDTH, WINDOW_WIDTH } from '@/domain/defaults';

export default function DoorWindowPreview({ toolState, activeTool, walls }) {
  if (activeTool !== TOOLS.DOOR && activeTool !== TOOLS.WINDOW) return null;
  if (!toolState.previewWallId || toolState.previewOffset == null) return null;

  const wall = walls.find(w => w.id === toolState.previewWallId);
  if (!wall) return null;

  const isDoor = activeTool === TOOLS.DOOR;
  const width = isDoor ? DOOR_WIDTH : WINDOW_WIDTH;
  const center = positionOnWall(wall, toolState.previewOffset);
  const dir = wallDirection(wall);
  const perp = perpendicular(dir);
  const halfThick = wall.thickness / 2;
  const halfWidth = width / 2;

  const p1 = add(add(center, scale(dir, -halfWidth)), scale(perp, halfThick));
  const p2 = add(add(center, scale(dir, halfWidth)), scale(perp, halfThick));
  const p3 = add(add(center, scale(dir, halfWidth)), scale(perp, -halfThick));
  const p4 = add(add(center, scale(dir, -halfWidth)), scale(perp, -halfThick));

  const blocked = toolState.previewBlocked;
  const fill = blocked ? 'rgba(255, 60, 60, 0.2)' : 'rgba(43, 127, 255, 0.2)';
  const stroke = blocked ? 'rgba(255, 60, 60, 0.6)' : 'var(--color-selection)';

  // For doors, also render the swing arc preview
  const openDirection = toolState.openDirection || 'left';
  const start = add(center, scale(dir, -halfWidth));
  const angle = wallAngle(wall);
  const angleDeg = (angle * 180) / Math.PI;
  const flipSign = openDirection === 'right' ? -1 : 1;

  return (
    <g style={{ pointerEvents: 'none' }}>
      <polygon
        points={`${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y} ${p4.x},${p4.y}`}
        fill={fill}
        stroke={stroke}
        strokeWidth={2}
        strokeDasharray="4 2"
        vectorEffect="non-scaling-stroke"
      />
      {isDoor && !blocked && (
        <g transform={`translate(${start.x},${start.y}) rotate(${angleDeg})`}>
          <line
            x1={0} y1={0}
            x2={0} y2={flipSign * -width}
            stroke="var(--color-selection)"
            strokeWidth={1.5}
            strokeOpacity={0.6}
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={`M ${width} 0 A ${width} ${width} 0 0 ${openDirection === 'left' ? 1 : 0} 0 ${flipSign * -width}`}
            fill="none"
            stroke="var(--color-selection)"
            strokeWidth={1}
            strokeOpacity={0.6}
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      )}
    </g>
  );
}
