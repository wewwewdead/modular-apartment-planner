import { getBeamRenderData } from '@/geometry/beamGeometry';
import { DRAWING_GRAPHICS } from '@/sheets/standards';

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
            fill={DRAWING_GRAPHICS.plan.objectFill}
            stroke={DRAWING_GRAPHICS.plan.secondaryStroke}
            strokeWidth={DRAWING_GRAPHICS.plan.secondaryStrokeWidth}
            strokeDasharray={DRAWING_GRAPHICS.plan.hiddenDash}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </g>
  );
}
