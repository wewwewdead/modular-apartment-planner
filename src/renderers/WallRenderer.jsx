import { getWallRenderData } from '@/geometry/wallColumnGeometry';
import { DRAWING_GRAPHICS } from '@/sheets/standards';

export default function WallRenderer({ walls, columns }) {
  return (
    <g className="walls">
      {walls.map(wall => {
        const outline = getWallRenderData(wall, columns || []).outline;
        const points = outline.map(p => `${p.x},${p.y}`).join(' ');
        return (
          <polygon
            key={wall.id}
            data-id={wall.id}
            data-type="wall"
            points={points}
            fill={DRAWING_GRAPHICS.plan.cutFill}
            stroke={DRAWING_GRAPHICS.plan.cutStroke}
            strokeWidth={DRAWING_GRAPHICS.plan.cutStrokeWidth}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </g>
  );
}
