import { memo } from 'react';
import { TOOLS } from '@/editor/tools';
import { deviceOutlineOnWall } from '@/geometry/wallGeometry';
import { ELECTRICAL_PLATE, ELECTRICAL_SYMBOL_SIZE } from '@/domain/defaults';

function ElectricalPreview({ toolState, activeTool, walls }) {
  if (activeTool !== TOOLS.ELECTRICAL) return null;
  if (!toolState.previewWallId || toolState.previewOffset == null) return null;

  const wall = walls.find((w) => w.id === toolState.previewWallId);
  if (!wall) return null;

  const side = toolState.previewSide || 'right';
  const info = deviceOutlineOnWall(wall, { offset: toolState.previewOffset, side }, ELECTRICAL_SYMBOL_SIZE);
  const angleDeg = (info.angle * 180) / Math.PI;
  const outSign = side === 'left' ? -1 : 1;

  const blocked = toolState.previewBlocked;
  const fill = blocked ? 'rgba(255, 60, 60, 0.2)' : 'rgba(43, 127, 255, 0.2)';
  const stroke = blocked ? 'rgba(255, 60, 60, 0.6)' : 'var(--color-selection)';

  return (
    <g style={{ pointerEvents: 'none' }}>
      <polygon
        points={`${info.p1.x},${info.p1.y} ${info.p2.x},${info.p2.y} ${info.p3.x},${info.p3.y} ${info.p4.x},${info.p4.y}`}
        fill={fill}
        stroke={stroke}
        strokeWidth={2}
        strokeDasharray="4 2"
        vectorEffect="non-scaling-stroke"
      />
      {/* The physical faceplate, true to model size — this is what clamping and
          column snapping position, and what the 3D preview shows. */}
      <g transform={`translate(${info.center.x},${info.center.y}) rotate(${angleDeg})`}>
        <rect
          x={-ELECTRICAL_PLATE.width / 2}
          y={outSign < 0 ? -ELECTRICAL_PLATE.depth : 0}
          width={ELECTRICAL_PLATE.width}
          height={ELECTRICAL_PLATE.depth}
          fill={stroke}
          stroke={stroke}
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      </g>
    </g>
  );
}

export default memo(ElectricalPreview);
