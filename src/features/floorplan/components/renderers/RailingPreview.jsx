import { TOOLS } from '@/editor/tools';
import { getRailingRenderData } from '@/geometry/railingGeometry';
import { RAILING_WIDTH } from '@/domain/defaults';

export default function RailingPreview({ toolState, activeTool }) {
  if (activeTool !== TOOLS.RAILING) return null;
  if (!toolState.railingStartPoint || !toolState.railingPreviewPoint) return null;

  const renderData = getRailingRenderData({
    id: 'railing-preview',
    startPoint: toolState.railingStartPoint,
    endPoint: toolState.railingPreviewPoint,
    width: RAILING_WIDTH,
    type: 'guardrail',
  });
  if (!renderData) return null;

  const points = renderData.outline.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <g style={{ pointerEvents: 'none' }}>
      <polygon
        points={points}
        fill="rgba(100, 180, 255, 0.15)"
        stroke="var(--color-selection)"
        strokeWidth={2}
        strokeDasharray="6 3"
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}
