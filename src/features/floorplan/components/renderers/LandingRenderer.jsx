import { memo } from 'react';
import { getLandingRenderData } from '@/geometry/landingGeometry';
import { DRAWING_GRAPHICS, PRESENTATION_GRAPHICS } from '@/sheets/standards';
import { isPresentationStyle, usePlanStyle } from './PlanStyleContext';

function LandingRenderer({ landings }) {
  // A landing is part of the stair: the same light grey in presentation.
  const presentation = isPresentationStyle(usePlanStyle());
  const fill = presentation ? PRESENTATION_GRAPHICS.plan.stairFill : DRAWING_GRAPHICS.plan.objectFill;
  const stroke = presentation ? PRESENTATION_GRAPHICS.plan.stairStroke : DRAWING_GRAPHICS.plan.objectStroke;
  const strokeWidth = presentation
    ? PRESENTATION_GRAPHICS.plan.treadStrokeWidth
    : DRAWING_GRAPHICS.plan.objectStrokeWidth;
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
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </g>
  );
}

export default memo(LandingRenderer);
