import { getLandingRenderData } from '@/geometry/landingGeometry';

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
            fill="rgba(160, 165, 175, 0.25)"
            stroke="#666"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </g>
  );
}
