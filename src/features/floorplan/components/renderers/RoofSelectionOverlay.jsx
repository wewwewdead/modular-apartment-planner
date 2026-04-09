import { buildRoofPlanGeometry } from '@/geometry/roofPlanGeometry';

const HANDLE_SIZE = 8;

export default function RoofSelectionOverlay({ roofSystem, selectedId, selectedType, zoom }) {
  if (!roofSystem || !selectedId || !selectedType) return null;

  const handleR = HANDLE_SIZE / zoom;
  const plan = buildRoofPlanGeometry(roofSystem);

  if (selectedType === 'roofSystem' && selectedId === roofSystem.id) {
    return (
      <g>
        <polygon
          points={plan.roofOutlinePointsString || plan.boundaryPointsString}
          fill="var(--color-selection-fill)"
          stroke="var(--color-selection)"
          strokeWidth={2}
          strokeDasharray="6 3"
          vectorEffect="non-scaling-stroke"
        />
        {plan.boundaryPoints.map((point, index) => (
          <rect
            key={`${point.x}-${point.y}-${index}`}
            data-handle="roof-boundary-vertex"
            data-index={index}
            x={point.x - handleR / 2}
            y={point.y - handleR / 2}
            width={handleR}
            height={handleR}
            fill="white"
            stroke="var(--color-selection)"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            style={{ cursor: 'move' }}
          />
        ))}
      </g>
    );
  }

  if (selectedType === 'parapet') {
    const parapet = (roofSystem.parapets || []).find((entry) => entry.id === selectedId);
    const renderData = plan.parapets.find((entry) => entry.id === selectedId);
    if (!parapet || !renderData) return null;

    return (
      <g>
        <polygon
          points={renderData.points}
          fill="var(--color-selection-fill)"
          stroke="var(--color-selection)"
          strokeWidth={2}
          strokeDasharray="6 3"
          vectorEffect="non-scaling-stroke"
        />
        <rect
          data-handle="start"
          x={renderData.startPoint.x - handleR / 2}
          y={renderData.startPoint.y - handleR / 2}
          width={handleR}
          height={handleR}
          fill="white"
          stroke="var(--color-selection)"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          style={{ cursor: 'move' }}
        />
        <rect
          data-handle="end"
          x={renderData.endPoint.x - handleR / 2}
          y={renderData.endPoint.y - handleR / 2}
          width={handleR}
          height={handleR}
          fill="white"
          stroke="var(--color-selection)"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          style={{ cursor: 'move' }}
        />
      </g>
    );
  }

  if (selectedType === 'drain') {
    const drain = plan.drains.find((entry) => entry.id === selectedId);
    if (!drain) return null;

    return (
      <g>
        <circle
          cx={drain.center.x}
          cy={drain.center.y}
          r={drain.radius}
          fill="var(--color-selection-fill)"
          stroke="var(--color-selection)"
          strokeWidth={2}
          strokeDasharray="6 3"
          vectorEffect="non-scaling-stroke"
        />
        <rect
          data-handle="drain-center"
          x={drain.center.x - handleR / 2}
          y={drain.center.y - handleR / 2}
          width={handleR}
          height={handleR}
          fill="white"
          stroke="var(--color-selection)"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          style={{ cursor: 'move' }}
        />
      </g>
    );
  }

  if (selectedType === 'roofOpening') {
    const opening = plan.openings.find((entry) => entry.id === selectedId);
    if (!opening) return null;

    return (
      <g>
        <polygon
          points={opening.points}
          fill="var(--color-selection-fill)"
          stroke="var(--color-selection)"
          strokeWidth={2}
          strokeDasharray="6 3"
          vectorEffect="non-scaling-stroke"
        />
        {opening.boundaryPoints.map((point, index) => (
          <rect
            key={`${point.x}-${point.y}-${index}`}
            data-handle="roof-opening-vertex"
            data-index={index}
            x={point.x - handleR / 2}
            y={point.y - handleR / 2}
            width={handleR}
            height={handleR}
            fill="white"
            stroke="var(--color-selection)"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            style={{ cursor: 'move' }}
          />
        ))}
      </g>
    );
  }

  if (selectedType === 'roofPlane') {
    const roofPlane = plan.roofPlanes.find((entry) => entry.id === selectedId);
    if (!roofPlane) return null;

    return (
      <g>
        <polygon
          points={roofPlane.points}
          fill="var(--color-selection-fill)"
          stroke="var(--color-selection)"
          strokeWidth={2}
          strokeDasharray="6 3"
          vectorEffect="non-scaling-stroke"
        />
        {(roofPlane.outline || []).map((point, index) => (
          <rect
            key={`${point.x}-${point.y}-${index}`}
            data-handle="roof-plane-vertex"
            data-index={index}
            x={point.x - handleR / 2}
            y={point.y - handleR / 2}
            width={handleR}
            height={handleR}
            fill="white"
            stroke="var(--color-selection)"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            style={{ cursor: 'move' }}
          />
        ))}
      </g>
    );
  }

  if (selectedType === 'roofEdge') {
    const roofEdge = (plan.roofEdges || []).find((entry) => entry.id === selectedId);
    if (!roofEdge) return null;

    return (
      <g>
        <line
          x1={roofEdge.startPoint.x}
          y1={roofEdge.startPoint.y}
          x2={roofEdge.endPoint.x}
          y2={roofEdge.endPoint.y}
          stroke="var(--color-selection)"
          strokeWidth={2.2}
          strokeDasharray="6 3"
          vectorEffect="non-scaling-stroke"
        />
      </g>
    );
  }

  return null;
}
