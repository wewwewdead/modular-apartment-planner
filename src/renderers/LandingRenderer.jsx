import { getLandingRenderData } from '@/geometry/landingGeometry';
import { DRAWING_GRAPHICS } from '@/sheets/standards';

export default function LandingRenderer({ landings }) {
  return (
    <g className="landings">
      {(landings || []).map((landing) => {
        const renderData = getLandingRenderData(landing);
        if (!renderData) return null;

        const points = renderData.outline.map((p) => `${p.x},${p.y}`).join(' ');

        return (
          <polygon
            key={landing.id}
            data-id={landing.id}
            data-type="landing"
            points={points}
            fill={DRAWING_GRAPHICS.plan.objectFill}
            stroke={DRAWING_GRAPHICS.plan.objectStroke}
            strokeWidth={DRAWING_GRAPHICS.plan.objectStrokeWidth}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </g>
  );
}
