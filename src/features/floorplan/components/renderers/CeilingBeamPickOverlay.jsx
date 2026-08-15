import { memo } from 'react';
import { isCeilingSupportBeam } from '@/domain/ceilingBeamAttachment';
import { TOOLS } from '@/editor/tools';
import { getBeamRenderData } from '@/geometry/beamGeometry';

function outlinePoints(outline) {
  return outline.map((point) => `${point.x},${point.y}`).join(' ');
}

/**
 * What can be hung from, and what has been chosen so far. Every eligible beam is
 * outlined the moment the tool opens — a ceiling attaches to beams the plan
 * draws identically to the ones it cannot use, so the pickable set has to be
 * visible before the first click rather than discovered by clicking.
 */
function CeilingBeamPickOverlay({ floor = null, activeTool, toolState = {} }) {
  if (activeTool !== TOOLS.CEILING_BEAM_PICK || !floor) return null;

  const picked = new Set(toolState.ceilingPickBeamIds || []);
  const hoveredBeamId = toolState.ceilingPickHoverBeamId || null;
  const columns = floor.columns || [];

  return (
    <g className="ceiling-beam-pick-overlay" pointerEvents="none">
      {(floor.beams || []).map((beam) => {
        if (!isCeilingSupportBeam(beam, floor)) return null;
        const outline = getBeamRenderData(beam, columns)?.outline;
        if (!outline || outline.length < 3) return null;

        const isPicked = picked.has(beam.id);
        const isHovered = beam.id === hoveredBeamId;
        return (
          <polygon
            key={beam.id}
            points={outlinePoints(outline)}
            fill={isPicked ? 'rgba(100, 182, 255, 0.3)' : isHovered ? 'rgba(255, 196, 92, 0.24)' : 'none'}
            stroke={isPicked ? 'var(--color-selection)' : isHovered ? '#d59a22' : 'rgba(100, 182, 255, 0.5)'}
            strokeWidth={isPicked ? 2.4 : 1.4}
            strokeDasharray={isPicked || isHovered ? undefined : '6 4'}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </g>
  );
}

export default memo(CeilingBeamPickOverlay);
