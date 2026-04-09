import { getSlabRenderData } from '@/geometry/slabGeometry';
import { DRAWING_GRAPHICS } from '@/sheets/standards';

export default function SlabRenderer({ slab, selectedId }) {
  const renderData = getSlabRenderData(slab);
  if (!renderData) return null;

  return (
    <polygon
      data-id={slab.id}
      data-type="slab"
      points={renderData.points}
      fill={DRAWING_GRAPHICS.plan.slabEdge.fill}
      stroke={DRAWING_GRAPHICS.plan.slabEdge.stroke}
      strokeWidth={selectedId === slab.id ? 1.1 : DRAWING_GRAPHICS.plan.slabEdge.strokeWidth}
      strokeDasharray={slab.id === selectedId ? '120 60' : undefined}
      vectorEffect="non-scaling-stroke"
    />
  );
}
