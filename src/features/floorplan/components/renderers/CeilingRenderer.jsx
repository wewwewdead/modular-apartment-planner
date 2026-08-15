import { memo } from 'react';
import { getProjectCeilings, resolveCeilingBoundary } from '@/domain/ceilingModels';
import { DRAWING_GRAPHICS } from '@/sheets/standards';

/**
 * Ceilings on the plan, drawn the way a drawing shows anything above the cut
 * plane: a hidden line with a wash of fill behind it. It has to read as a note
 * about what is overhead rather than as another thing standing on the floor, so
 * it takes no pointer events — a ceiling is still edited from the sidebar, and
 * an outline that swallowed clicks would put it in front of the walls under it.
 *
 * The project handed in is already phase-filtered, so a ceiling belonging to a
 * hidden phase never reaches here.
 */
function CeilingRenderer({ project, floorId }) {
  if (!project || !floorId) return null;

  const ceilings = getProjectCeilings(project, floorId);
  if (!ceilings.length) return null;

  return (
    <g style={{ pointerEvents: 'none' }}>
      {ceilings.map((ceiling) => {
        const boundary = resolveCeilingBoundary(project, ceiling);
        if (boundary.length < 3) return null;
        return (
          <polygon
            key={ceiling.id}
            data-id={ceiling.id}
            data-type="ceiling"
            points={boundary.map((point) => `${point.x},${point.y}`).join(' ')}
            fill={DRAWING_GRAPHICS.plan.hiddenStroke}
            fillOpacity={0.07}
            stroke={DRAWING_GRAPHICS.plan.hiddenStroke}
            strokeWidth={DRAWING_GRAPHICS.plan.hiddenStrokeWidth}
            strokeDasharray={DRAWING_GRAPHICS.plan.hiddenDash}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </g>
  );
}

export default memo(CeilingRenderer);
