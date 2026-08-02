import { memo } from 'react';
import { getBeamRenderData } from '@/geometry/beamGeometry';
import { DRAWING_GRAPHICS } from '@/sheets/standards';

function BeamRenderer({ beams, columns }) {
  return (
    <g className="beams">
      {(beams || []).map((beam) => {
        const renderData = getBeamRenderData(beam, columns || []);
        if (!renderData) return null;

        const points = renderData.outline.map((point) => `${point.x},${point.y}`).join(' ');
        const isRoofRingBeam = beam.placementRole === 'roof_ring';

        return (
          <polygon
            key={beam.id}
            data-id={beam.id}
            data-type="beam"
            data-placement-role={isRoofRingBeam ? 'roof_ring' : 'floor'}
            points={points}
            fill={DRAWING_GRAPHICS.plan.objectFill}
            stroke={isRoofRingBeam ? '#9a5b16' : DRAWING_GRAPHICS.plan.secondaryStroke}
            strokeWidth={DRAWING_GRAPHICS.plan.secondaryStrokeWidth}
            strokeDasharray={isRoofRingBeam ? '10 4' : DRAWING_GRAPHICS.plan.hiddenDash}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </g>
  );
}

export default memo(BeamRenderer);
