import { getSlabRenderData } from '@/geometry/slabGeometry';

export default function SlabRenderer({ slab, selectedId }) {
  const renderData = getSlabRenderData(slab);
  if (!renderData) return null;

  return (
    <polygon
      data-id={slab.id}
      data-type="slab"
      points={renderData.points}
      fill="rgba(127, 143, 166, 0.12)"
      stroke="rgba(76, 91, 112, 0.75)"
      strokeWidth={24}
      strokeDasharray={slab.id === selectedId ? '120 60' : undefined}
      vectorEffect="non-scaling-stroke"
    />
  );
}
