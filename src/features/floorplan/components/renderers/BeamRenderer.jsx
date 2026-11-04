import { memo } from 'react';
import { getBeamRenderData } from '@/geometry/beamGeometry';
import { DRAWING_GRAPHICS, PRESENTATION_GRAPHICS } from '@/sheets/standards';
import { isPresentationStyle, usePlanStyle } from './PlanStyleContext';

function BeamRenderer({ beams, columns }) {
  // A beam is overhead, so on a presentation plan it is only a fine dashed
  // trace: a filled beam would paint over the solid walls it sits on.
  const presentation = isPresentationStyle(usePlanStyle());
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
            fill={presentation ? 'none' : DRAWING_GRAPHICS.plan.objectFill}
            stroke={
              presentation
                ? PRESENTATION_GRAPHICS.plan.beamStroke
                : isRoofRingBeam
                  ? '#9a5b16'
                  : DRAWING_GRAPHICS.plan.secondaryStroke
            }
            strokeWidth={DRAWING_GRAPHICS.plan.secondaryStrokeWidth}
            strokeDasharray={
              presentation
                ? PRESENTATION_GRAPHICS.plan.beamDash
                : isRoofRingBeam
                  ? '10 4'
                  : DRAWING_GRAPHICS.plan.hiddenDash
            }
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </g>
  );
}

export default memo(BeamRenderer);
