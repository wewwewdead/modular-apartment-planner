import { TOOLS } from '@/editor/tools';

function previewPoints(toolState) {
  const points = toolState.slabPoints || [];
  if (!points.length) return [];
  if (!toolState.slabPreviewPoint) return points;
  return [...points, toolState.slabPreviewPoint];
}

export default function SlabPreview({ toolState, activeTool }) {
  if (activeTool !== TOOLS.SLAB) return null;

  const points = previewPoints(toolState);
  const committedPoints = toolState.slabPoints || [];
  if (!points.length) return null;

  return (
    <g style={{ pointerEvents: 'none' }}>
      {points.length >= 2 && (
        <polyline
          points={points.map((point) => `${point.x},${point.y}`).join(' ')}
          fill={points.length >= 3 ? 'rgba(127, 143, 166, 0.08)' : 'none'}
          stroke="var(--color-selection)"
          strokeWidth={28}
          strokeDasharray="120 60"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {committedPoints.map((point, index) => (
        <circle
          key={`${point.x}-${point.y}-${index}`}
          cx={point.x}
          cy={point.y}
          r={60}
          fill={index === 0 ? 'var(--color-accent)' : 'var(--color-selection)'}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </g>
  );
}
