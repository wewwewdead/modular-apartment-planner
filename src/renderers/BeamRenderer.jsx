import { getBeamRenderData } from '@/geometry/beamGeometry';

export default function BeamRenderer({ beams, columns }) {
  return (
    <g className="beams">
      {(beams || []).map((beam) => {
        const renderData = getBeamRenderData(beam, columns || []);
        if (!renderData) return null;

        const points = renderData.outline.map((point) => `${point.x},${point.y}`).join(' ');

        return (
          <polygon
            key={beam.id}
            data-id={beam.id}
            data-type="beam"
            points={points}
            fill="rgba(95, 121, 138, 0.6)"
            stroke="#5B7182"
            strokeWidth={1}
            strokeDasharray="10 4"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </g>
  );
}
