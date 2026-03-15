import { createDimensionFigure } from '@/annotations/dimensions';

export function projectDimensionPoint(point, view) {
  switch (view) {
    case 'top':
      return { x: point.x, y: point.y };
    case 'front':
      return { x: point.x, y: -(point.z || 0) };
    case 'side':
      return { x: point.y, y: -(point.z || 0) };
    default:
      return { x: point.x, y: point.y };
  }
}

export default function DimensionRenderer({ dimension, view, zoom = 1, isSelected = false }) {
  const start2D = projectDimensionPoint(dimension.startPoint, view);
  const end2D = projectDimensionPoint(dimension.endPoint, view);

  const figure = createDimensionFigure({
    id: dimension.id,
    startPoint: start2D,
    endPoint: end2D,
    mode: 'aligned',
    offset: dimension.offset || 200,
    label: dimension.textOverride || undefined,
    source: 'manual',
  });

  if (!figure) return null;

  const hitPad = 8 / zoom;

  return (
    <g data-part-id={dimension.id}>
      {/* Invisible wide hit area along dimension line */}
      <line
        x1={figure.lineStart.x}
        y1={figure.lineStart.y}
        x2={figure.lineEnd.x}
        y2={figure.lineEnd.y}
        stroke="transparent"
        strokeWidth={hitPad * 2}
        style={{ cursor: 'pointer' }}
      />

      {/* Extension lines */}
      {figure.extensionLines.map((line, i) => (
        <line
          key={`ext-${i}`}
          x1={line.start.x}
          y1={line.start.y}
          x2={line.end.x}
          y2={line.end.y}
          stroke="#666"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}

      {/* Dimension line */}
      <line
        x1={figure.lineStart.x}
        y1={figure.lineStart.y}
        x2={figure.lineEnd.x}
        y2={figure.lineEnd.y}
        stroke={isSelected ? '#B8860B' : '#1E2433'}
        strokeWidth={isSelected ? 2 : 1}
        vectorEffect="non-scaling-stroke"
      />

      {/* Arrowheads */}
      {figure.arrowheads.map((arrow, i) => (
        <polygon
          key={`arrow-${i}`}
          points={`${arrow.tip.x},${arrow.tip.y} ${arrow.left.x},${arrow.left.y} ${arrow.right.x},${arrow.right.y}`}
          fill={isSelected ? '#B8860B' : '#1E2433'}
        />
      ))}

      {/* Text label */}
      <text
        x={figure.text.position.x}
        y={figure.text.position.y}
        textAnchor="middle"
        dominantBaseline="central"
        transform={`rotate(${figure.text.angle} ${figure.text.position.x} ${figure.text.position.y})`}
        fontSize={120}
        fontFamily="var(--font-blueprint, monospace)"
        fill={isSelected ? '#B8860B' : '#1E2433'}
      >
        {figure.text.value}
      </text>

      {/* Selection highlight */}
      {isSelected && (
        <rect
          x={Math.min(figure.lineStart.x, figure.lineEnd.x) - hitPad}
          y={Math.min(figure.lineStart.y, figure.lineEnd.y) - hitPad - Math.abs(dimension.offset || 200)}
          width={Math.abs(figure.lineEnd.x - figure.lineStart.x) + hitPad * 2}
          height={Math.abs(figure.lineEnd.y - figure.lineStart.y) + hitPad * 2 + Math.abs(dimension.offset || 200)}
          fill="none"
          stroke="#B8860B"
          strokeWidth={1}
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
          style={{ pointerEvents: 'none' }}
        />
      )}
    </g>
  );
}
