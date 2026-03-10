import { formatMeasurement } from '@/annotations/format';
import { TOOLS } from '@/editor/tools';
import { formatSurveyorBearing, pointsToSurveyorBearing } from '@/geometry/bearing';
import { distance } from '@/geometry/point';
import { PREVIEW_LABEL_OFFSET } from '@/domain/defaults';

export default function WallPreview({ toolState, activeTool }) {
  if (activeTool !== TOOLS.WALL || !toolState.start || !toolState.preview) {
    return null;
  }

  const { start, preview } = toolState;
  const dx = preview.x - start.x;
  const dy = preview.y - start.y;
  const len = distance(start, preview);
  const lengthLabel = formatMeasurement(len);
  const bearingLabel = formatSurveyorBearing(pointsToSurveyorBearing(start, preview));
  const midX = (start.x + preview.x) / 2;
  const midY = (start.y + preview.y) / 2;
  const safeLen = len || 1;
  const labelX = midX + ((-dy / safeLen) * PREVIEW_LABEL_OFFSET);
  const labelY = midY + ((dx / safeLen) * PREVIEW_LABEL_OFFSET);

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
        x={labelX} y={labelY}
        textAnchor="middle"
        fill="var(--color-selection)"
        fontSize={140}
        fontFamily="var(--font-blueprint)"
        paintOrder="stroke"
        stroke="rgba(255, 255, 255, 0.92)"
        strokeWidth={26}
      >
        {lengthLabel}
      </text>
      <text
        x={labelX} y={labelY + 112}
        textAnchor="middle"
        fill="var(--color-selection)"
        fontSize={92}
        fontFamily="var(--font-blueprint)"
        paintOrder="stroke"
        stroke="rgba(255, 255, 255, 0.92)"
        strokeWidth={18}
      >
        {bearingLabel}
      </text>
    </g>
  );
}
