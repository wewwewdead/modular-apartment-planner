import { formatMeasurement } from '@/annotations/format';
import { TOOLS } from '@/editor/tools';
import { distance } from '@/geometry/point';
import { PREVIEW_LABEL_OFFSET } from '@/domain/defaults';

export default function WallPreview({ toolState, activeTool }) {
  if (activeTool !== TOOLS.WALL || !toolState.start || !toolState.preview) {
    return null;
  }

  const { start, preview } = toolState;
  const len = distance(start, preview);
  const label = formatMeasurement(len);
  const midX = (start.x + preview.x) / 2;
  const midY = (start.y + preview.y) / 2;

  return (
    <g className="wall-preview" style={{ pointerEvents: 'none' }}>
      <line
        x1={start.x} y1={start.y}
        x2={preview.x} y2={preview.y}
        stroke="var(--color-selection)"
        strokeWidth={2}
        strokeDasharray="8 4"
        vectorEffect="non-scaling-stroke"
        opacity={0.7}
      />
      <circle
        cx={start.x} cy={start.y} r={4}
        fill="var(--color-selection)"
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={preview.x} cy={preview.y} r={4}
        fill="var(--color-selection)"
        vectorEffect="non-scaling-stroke"
      />
      <text
        x={midX} y={midY}
        textAnchor="middle"
        dy={-PREVIEW_LABEL_OFFSET}
        fill="var(--color-selection)"
        fontSize={140}
        fontFamily="var(--font-blueprint)"
      >
        {label}
      </text>
    </g>
  );
}
