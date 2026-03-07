import { DIMENSION_DEFAULT_OFFSET } from '@/domain/defaults';
import { TOOLS } from '@/editor/tools';
import { createDimensionFigure } from '@/annotations/dimensions';

export default function DimensionPreview({ toolState, activeTool }) {
  if (activeTool !== TOOLS.DIMENSION) return null;
  if (!toolState.dimensionStartPoint || !toolState.dimensionPreviewPoint) return null;

  const figure = createDimensionFigure({
    id: 'dimension-preview',
    startPoint: toolState.dimensionStartPoint,
    endPoint: toolState.dimensionPreviewPoint,
    mode: 'aligned',
    offset: toolState.dimensionPreviewOffset ?? DIMENSION_DEFAULT_OFFSET,
    source: 'preview',
  });

  if (!figure) return null;

  return (
    <g style={{ pointerEvents: 'none' }}>
      {figure.extensionLines.map((line, index) => (
        <line
          key={`preview-ext-${index}`}
          x1={line.start.x}
          y1={line.start.y}
          x2={line.end.x}
          y2={line.end.y}
          stroke="var(--color-selection)"
          strokeWidth={1}
          strokeDasharray="6 3"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <line
        x1={figure.lineStart.x}
        y1={figure.lineStart.y}
        x2={figure.lineEnd.x}
        y2={figure.lineEnd.y}
        stroke="var(--color-selection)"
        strokeWidth={1.5}
        strokeDasharray="6 3"
        vectorEffect="non-scaling-stroke"
      />
      {figure.arrowheads.map((arrow, index) => (
        <polyline
          key={`preview-arrow-${index}`}
          points={`${arrow.left.x},${arrow.left.y} ${arrow.tip.x},${arrow.tip.y} ${arrow.right.x},${arrow.right.y}`}
          fill="none"
          stroke="var(--color-selection)"
          strokeWidth={1.2}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <text
        x={figure.text.position.x}
        y={figure.text.position.y}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="var(--color-selection)"
        fontSize={140}
        fontFamily="var(--font-blueprint)"
        transform={`rotate(${figure.text.angle}, ${figure.text.position.x}, ${figure.text.position.y})`}
      >
        {figure.text.value}
      </text>
    </g>
  );
}
