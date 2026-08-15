import { memo } from 'react';
import { TOOLS } from '@/editor/tools';

function previewPoints(toolState) {
  const points = toolState.ceilingPoints || [];
  if (!points.length) return [];
  if (!toolState.ceilingPreviewPoint) return points;
  return [...points, toolState.ceilingPreviewPoint];
}

function CeilingPreview({ toolState, activeTool }) {
  if (activeTool !== TOOLS.CEILING) return null;

  const points = previewPoints(toolState);
  const committedPoints = toolState.ceilingPoints || [];
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

export default memo(CeilingPreview);
