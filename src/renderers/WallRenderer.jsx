import { getWallRenderData } from '@/geometry/wallColumnGeometry';

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
            fill="var(--color-wall-fill)"
            stroke="var(--color-wall-stroke)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </g>
  );
}
