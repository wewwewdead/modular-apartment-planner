import { TOOLS } from '@/editor/tools';
import { BEAM_WIDTH, BEAM_DEPTH } from '@/domain/defaults';
import { getBeamRenderData } from '@/geometry/beamGeometry';

export default function BeamPreview({ toolState, activeTool, columns, floorLevel }) {
  if (activeTool !== TOOLS.BEAM) return null;
  if (!toolState.startColumnId || !toolState.previewColumnId || toolState.startColumnId === toolState.previewColumnId) {
    return null;
  }

  const previewBeam = {
    id: 'beam_preview',
    startRef: { kind: 'column', id: toolState.startColumnId },
    endRef: { kind: 'column', id: toolState.previewColumnId },
    width: BEAM_WIDTH,
    depth: BEAM_DEPTH,
    floorLevel: floorLevel ?? 0,
  };

  const renderData = getBeamRenderData(previewBeam, columns || []);
  if (!renderData) return null;

  const points = renderData.outline.map((point) => `${point.x},${point.y}`).join(' ');

  return (
    <polygon
      points={points}
      fill="rgba(143, 170, 194, 0.25)"
      stroke="var(--color-selection)"
      strokeWidth={2}
      strokeDasharray="6 3"
      vectorEffect="non-scaling-stroke"
      style={{ pointerEvents: 'none' }}
    />
  );
}
