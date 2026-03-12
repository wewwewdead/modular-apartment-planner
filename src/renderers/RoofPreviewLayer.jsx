import { formatMeasurement } from '@/annotations/format';
import { PREVIEW_LABEL_OFFSET } from '@/domain/defaults';
import { TOOLS } from '@/editor/tools';
import { buildRoofParapetCandidateEdges } from '@/geometry/roofPlanGeometry';
import { distance } from '@/geometry/point';

function pointsToString(points = []) {
  return points.map((point) => `${point.x},${point.y}`).join(' ');
}

export default function RoofPreviewLayer({ activeTool, toolState, roofSystem = null }) {
  if (activeTool === TOOLS.ROOF_PARAPET && roofSystem) {
    const candidateEdges = buildRoofParapetCandidateEdges(roofSystem);

    return (
      <g className="roof-parapet-preview" style={{ pointerEvents: 'none' }}>
        {candidateEdges.map((edge) => (
          <line
            key={`candidate-edge-${edge.index}`}
            x1={edge.start.x}
            y1={edge.start.y}
            x2={edge.end.x}
            y2={edge.end.y}
            stroke="var(--color-selection)"
            strokeWidth={1.3}
            strokeDasharray="4 4"
            opacity={0.35}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {!toolState.roofParapetStart && toolState.roofParapetSnapStart && toolState.roofParapetSnapEnd ? (
          <line
            x1={toolState.roofParapetSnapStart.x}
            y1={toolState.roofParapetSnapStart.y}
            x2={toolState.roofParapetSnapEnd.x}
            y2={toolState.roofParapetSnapEnd.y}
            stroke="var(--color-selection)"
            strokeWidth={2}
            strokeDasharray="6 3"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        {toolState.roofParapetStart && toolState.roofParapetPreview ? (
          <line
            x1={toolState.roofParapetStart.x}
            y1={toolState.roofParapetStart.y}
            x2={toolState.roofParapetPreview.x}
            y2={toolState.roofParapetPreview.y}
            stroke="var(--color-selection)"
            strokeWidth={2}
            strokeDasharray="6 3"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
      </g>
    );
  }

  if (activeTool === TOOLS.ROOF_OPENING && (toolState.roofOpeningPoints || []).length) {
    const committedPoints = toolState.roofOpeningPoints || [];
    const points = [...committedPoints];
    const previewPoint = toolState.roofOpeningPreviewPoint;
    const segmentStart = committedPoints[committedPoints.length - 1];

    if (previewPoint) {
      points.push(previewPoint);
    }

    const previewLength = segmentStart && previewPoint ? distance(segmentStart, previewPoint) : 0;
    const showLengthLabel = previewLength > 0;
    let labelPosition = null;

    if (showLengthLabel) {
      const dx = previewPoint.x - segmentStart.x;
      const dy = previewPoint.y - segmentStart.y;
      const safeLen = previewLength || 1;
      const midX = (segmentStart.x + previewPoint.x) / 2;
      const midY = (segmentStart.y + previewPoint.y) / 2;

      labelPosition = {
        x: midX + ((-dy / safeLen) * PREVIEW_LABEL_OFFSET),
        y: midY + ((dx / safeLen) * PREVIEW_LABEL_OFFSET),
      };
    }

    return (
      <g className="roof-opening-preview" style={{ pointerEvents: 'none' }}>
        <polyline
          points={pointsToString(points)}
          fill="none"
          stroke="var(--color-selection)"
          strokeWidth={2}
          strokeDasharray="6 3"
          vectorEffect="non-scaling-stroke"
        />
        {showLengthLabel ? (
          <text
            x={labelPosition.x}
            y={labelPosition.y}
            textAnchor="middle"
            fill="var(--color-selection)"
            fontSize={140}
            fontFamily="var(--font-blueprint)"
            paintOrder="stroke"
            stroke="rgba(255, 255, 255, 0.92)"
            strokeWidth={26}
          >
            {formatMeasurement(previewLength)}
          </text>
        ) : null}
      </g>
    );
  }

  return null;
}
