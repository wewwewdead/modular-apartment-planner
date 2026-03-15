import { TOOLS } from '@/editor/tools';
import { COLUMN_WIDTH, COLUMN_DEPTH } from '@/domain/defaults';
import { columnOutline } from '@/geometry/columnGeometry';

export default function ColumnPreview({ toolState, activeTool }) {
  if (activeTool !== TOOLS.COLUMN) return null;
  if (toolState.previewX == null || toolState.previewY == null) return null;

  const preview = {
    x: toolState.previewX,
    y: toolState.previewY,
    width: COLUMN_WIDTH,
    depth: COLUMN_DEPTH,
    rotation: 0,
  };

  const outline = columnOutline(preview);
  const points = outline.map(p => `${p.x},${p.y}`).join(' ');

  return (
    <polygon
      points={points}
      fill="rgba(160, 160, 160, 0.3)"
      stroke="var(--color-selection)"
      strokeWidth={2}
      strokeDasharray="4 2"
      vectorEffect="non-scaling-stroke"
      style={{ pointerEvents: 'none' }}
    />
  );
}
