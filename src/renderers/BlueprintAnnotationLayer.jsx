function Arrowhead({ arrow }) {
  return (
    <polyline
      points={`${arrow.left.x},${arrow.left.y} ${arrow.tip.x},${arrow.tip.y} ${arrow.right.x},${arrow.right.y}`}
      fill="none"
      stroke="var(--color-text-secondary)"
      strokeWidth={1}
      vectorEffect="non-scaling-stroke"
      opacity={0.85}
    />
  );
}

function DimensionFigure({ figure }) {
  return (
    <g key={figure.id}>
      {figure.extensionLines.map((line, index) => (
        <line
          key={`${figure.id}-ext-${index}`}
          x1={line.start.x}
          y1={line.start.y}
          x2={line.end.x}
          y2={line.end.y}
          stroke="var(--color-text-secondary)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          opacity={0.55}
        />
      ))}
      <line
        x1={figure.lineStart.x}
        y1={figure.lineStart.y}
        x2={figure.lineEnd.x}
        y2={figure.lineEnd.y}
        stroke="var(--color-text-secondary)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
        opacity={0.75}
      />
      {figure.arrowheads.map((arrow, index) => (
        <Arrowhead key={`${figure.id}-arrow-${index}`} arrow={arrow} />
      ))}
      <text
        x={figure.text.position.x}
        y={figure.text.position.y}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="var(--color-text-secondary)"
        fontSize={140}
        fontFamily="var(--font-blueprint)"
        transform={`rotate(${figure.text.angle}, ${figure.text.position.x}, ${figure.text.position.y})`}
        style={{ pointerEvents: 'none' }}
      >
        {figure.text.value}
      </text>
    </g>
  );
}

function TagFigure({ tag }) {
  const lineHeight = 150;
  const startY = tag.position.y - ((tag.textLines.length - 1) * lineHeight) / 2;

  return (
    <text
      key={tag.id}
      x={tag.position.x}
      y={startY}
      textAnchor={tag.textAnchor}
      dominantBaseline="middle"
      fill="var(--color-text-secondary)"
      fontSize={120}
      fontFamily="var(--font-blueprint)"
      transform={`rotate(${tag.angle || 0}, ${tag.position.x}, ${tag.position.y})`}
      style={{ pointerEvents: 'none' }}
    >
      {tag.textLines.map((line, index) => (
        <tspan key={`${tag.id}-line-${index}`} x={tag.position.x} dy={index === 0 ? 0 : lineHeight}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

export default function BlueprintAnnotationLayer({ dimensions = [], tags = [], className = 'annotations' }) {
  return (
    <g className={className}>
      {dimensions.map((figure) => (
        <DimensionFigure key={figure.id} figure={figure} />
      ))}
      {tags.map((tag) => (
        <TagFigure key={tag.id} tag={tag} />
      ))}
    </g>
  );
}
