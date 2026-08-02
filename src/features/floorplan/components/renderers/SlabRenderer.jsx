import { memo } from 'react';
import { getSlabRenderData } from '@/geometry/slabGeometry';
import { DRAWING_GRAPHICS } from '@/sheets/standards';

function SlabRenderer({ slab, selectedId }) {
  const renderData = getSlabRenderData(slab);
  if (!renderData) return null;

  return (
    <g data-id={slab.id} data-type="slab">
      <polygon
        points={renderData.points}
        fill={DRAWING_GRAPHICS.plan.slabEdge.fill}
        stroke={DRAWING_GRAPHICS.plan.slabEdge.stroke}
        strokeWidth={selectedId === slab.id ? 1.1 : DRAWING_GRAPHICS.plan.slabEdge.strokeWidth}
        strokeDasharray={slab.id === selectedId ? '120 60' : undefined}
        vectorEffect="non-scaling-stroke"
      />
      {(slab.openings || []).map((opening) => (
        <polygon
          key={opening.id}
          data-id={opening.id}
          data-type="slab-opening"
          points={(opening.boundaryPoints || []).map((point) => `${point.x},${point.y}`).join(' ')}
          fill="rgba(178, 74, 58, 0.08)"
          stroke="#b24a3a"
          strokeWidth="1.1"
          strokeDasharray="8 4"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </g>
  );
}

export default memo(SlabRenderer);
