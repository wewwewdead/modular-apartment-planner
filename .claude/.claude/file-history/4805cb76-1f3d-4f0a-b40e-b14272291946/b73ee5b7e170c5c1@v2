import { TOOLS } from '@/editor/tools';
import { positionOnWall, wallDirection } from '@/geometry/wallGeometry';
import { perpendicular, scale, add } from '@/geometry/point';
import { DOOR_WIDTH, WINDOW_WIDTH } from '@/domain/defaults';

export default function DoorWindowPreview({ toolState, activeTool, walls }) {
  if (activeTool !== TOOLS.DOOR && activeTool !== TOOLS.WINDOW) return null;
  if (!toolState.previewWallId || toolState.previewOffset == null) return null;

  const wall = walls.find(w => w.id === toolState.previewWallId);
  if (!wall) return null;

  const width = activeTool === TOOLS.DOOR ? DOOR_WIDTH : WINDOW_WIDTH;
  const center = positionOnWall(wall, toolState.previewOffset);
  const dir = wallDirection(wall);
  const perp = perpendicular(dir);
  const halfThick = wall.thickness / 2;
  const halfWidth = width / 2;

  const p1 = add(add(center, scale(dir, -halfWidth)), scale(perp, halfThick));
  const p2 = add(add(center, scale(dir, halfWidth)), scale(perp, halfThick));
  const p3 = add(add(center, scale(dir, halfWidth)), scale(perp, -halfThick));
  const p4 = add(add(center, scale(dir, -halfWidth)), scale(perp, -halfThick));

  return (
    <polygon
      points={`${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y} ${p4.x},${p4.y}`}
      fill="rgba(43, 127, 255, 0.2)"
      stroke="var(--color-selection)"
      strokeWidth={2}
      strokeDasharray="4 2"
      vectorEffect="non-scaling-stroke"
      style={{ pointerEvents: 'none' }}
    />
  );
}
