import { DRAWING_GRAPHICS, SHEET_COLORS } from '@/sheets/standards';
import { ANNOTATION_SEMANTIC_ROLES, ANNOTATION_TRUST_LEVELS } from '@/annotations/policy';

function estimateTextWidth(text, fontSize) {
  return Math.max(fontSize * 1.2, String(text || '').length * fontSize * 0.58);
}

function Arrowhead({ arrow }) {
  return (
    <polyline
      points={`${arrow.left.x},${arrow.left.y} ${arrow.tip.x},${arrow.tip.y} ${arrow.right.x},${arrow.right.y}`}
      fill="none"
      stroke={DRAWING_GRAPHICS.annotation.dimensionStroke}
      strokeWidth={DRAWING_GRAPHICS.annotation.dimensionStrokeWidth}
      vectorEffect="non-scaling-stroke"
    />
  );
}

function DimensionTextMask({ figure, fontSize }) {
  const width = estimateTextWidth(figure.text.value, fontSize) + DRAWING_GRAPHICS.annotation.textMaskPaddingX;
  const height = fontSize + DRAWING_GRAPHICS.annotation.textMaskPaddingY;

  return (
    <rect
      x={figure.text.position.x - width / 2}
      y={figure.text.position.y - height / 2}
      width={width}
      height={height}
      fill={SHEET_COLORS.mask}
      opacity={0.92}
      transform={`rotate(${figure.text.angle}, ${figure.text.position.x}, ${figure.text.position.y})`}
    />
  );
}

function DimensionFigure({ figure }) {
  const fontSize = DRAWING_GRAPHICS.annotation.textSize;

  return (
    <g key={figure.id}>
      {figure.extensionLines.map((line, index) => (
        <line
          key={`${figure.id}-ext-${index}`}
          x1={line.start.x}
          y1={line.start.y}
          x2={line.end.x}
          y2={line.end.y}
          stroke={DRAWING_GRAPHICS.annotation.dimensionExtension}
          strokeWidth={DRAWING_GRAPHICS.annotation.dimensionExtensionWidth}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <line
        x1={figure.lineStart.x}
        y1={figure.lineStart.y}
        x2={figure.lineEnd.x}
        y2={figure.lineEnd.y}
        stroke={DRAWING_GRAPHICS.annotation.dimensionStroke}
        strokeWidth={DRAWING_GRAPHICS.annotation.dimensionStrokeWidth}
        vectorEffect="non-scaling-stroke"
      />
      {figure.arrowheads.map((arrow, index) => (
        <Arrowhead key={`${figure.id}-arrow-${index}`} arrow={arrow} />
      ))}
      <DimensionTextMask figure={figure} fontSize={fontSize} />
      <text
        x={figure.text.position.x}
        y={figure.text.position.y}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={DRAWING_GRAPHICS.annotation.text}
        fontSize={fontSize}
        fontFamily="var(--font-blueprint)"
        transform={`rotate(${figure.text.angle}, ${figure.text.position.x}, ${figure.text.position.y})`}
        style={{ pointerEvents: 'none' }}
      >
        {figure.text.value}
      </text>
    </g>
  );
}

function TagTextMask({ tag, fontSize, lineHeight, opacity = 0.92 }) {
  const maxLineLength = Math.max(...tag.textLines.map((line) => String(line || '').length), 1);
  const width = estimateTextWidth('X'.repeat(maxLineLength), fontSize) + (tag.maskPaddingX ?? 44);
  const height = Math.max(lineHeight, tag.textLines.length * lineHeight) + (tag.maskPaddingY ?? 22);
  const x = tag.textAnchor === 'start'
    ? tag.position.x
    : (tag.textAnchor === 'end' ? tag.position.x - width : tag.position.x - (width / 2));

  return (
    <rect
      x={x}
      y={tag.position.y - height / 2}
      width={width}
      height={height}
      fill={SHEET_COLORS.mask}
      opacity={opacity}
      transform={`rotate(${tag.angle || 0}, ${tag.position.x}, ${tag.position.y})`}
    />
  );
}

function resolveTagStyle(tag, isRoom) {
  const isInformationalMeasurement = (
    tag.semanticRole === ANNOTATION_SEMANTIC_ROLES.MEASUREMENT
    && tag.trustLevel !== ANNOTATION_TRUST_LEVELS.AUTHORITATIVE
  );

  if (isRoom) {
    return {
      textFill: DRAWING_GRAPHICS.annotation.text,
      fontWeight: 600,
      maskOpacity: 0.92,
      leaderStroke: DRAWING_GRAPHICS.annotation.dimensionExtension,
      leaderDash: undefined,
    };
  }

  if (isInformationalMeasurement) {
    return {
      textFill: SHEET_COLORS.textMuted,
      fontWeight: 500,
      maskOpacity: 0.84,
      leaderStroke: SHEET_COLORS.borderMuted,
      leaderDash: '6 4',
    };
  }

  return {
    textFill: DRAWING_GRAPHICS.annotation.textMuted,
    fontWeight: 500,
    maskOpacity: 0.92,
    leaderStroke: DRAWING_GRAPHICS.annotation.dimensionExtension,
    leaderDash: undefined,
  };
}

function TagFigure({ tag }) {
  const isRoom = tag.sourceType === 'room';
  const nameSize = isRoom
    ? DRAWING_GRAPHICS.annotation.roomNameSize
    : (tag.fontSize ?? DRAWING_GRAPHICS.annotation.textSize);
  const areaSize = DRAWING_GRAPHICS.annotation.roomAreaSize;
  const lineHeight = isRoom ? 168 : (tag.lineHeight ?? 150);
  const startY = tag.position.y - ((tag.textLines.length - 1) * lineHeight) / 2;
  const style = resolveTagStyle(tag, isRoom);

  return (
    <g key={tag.id}>
      {tag.leaderLine ? (
        <line
          x1={tag.leaderLine.start.x}
          y1={tag.leaderLine.start.y}
          x2={tag.leaderLine.end.x}
          y2={tag.leaderLine.end.y}
          stroke={style.leaderStroke}
          strokeWidth={DRAWING_GRAPHICS.annotation.dimensionExtensionWidth}
          strokeDasharray={style.leaderDash}
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      {tag.mask ? (
        <TagTextMask tag={tag} fontSize={nameSize} lineHeight={lineHeight} opacity={style.maskOpacity} />
      ) : null}
      <text
        x={tag.position.x}
        y={startY}
        textAnchor={tag.textAnchor}
        dominantBaseline="middle"
        fill={style.textFill}
        fontSize={nameSize}
        fontWeight={style.fontWeight}
        fontFamily="var(--font-blueprint)"
        transform={`rotate(${tag.angle || 0}, ${tag.position.x}, ${tag.position.y})`}
        style={{ pointerEvents: 'none' }}
      >
        {tag.textLines.map((line, index) => (
          <tspan
            key={`${tag.id}-line-${index}`}
            x={tag.position.x}
            dy={index === 0 ? 0 : lineHeight}
            fontSize={isRoom && index > 0 ? areaSize : nameSize}
            fill={isRoom && index > 0 ? DRAWING_GRAPHICS.annotation.textMuted : undefined}
            fontWeight={isRoom && index > 0 ? 500 : undefined}
          >
            {line}
          </tspan>
        ))}
      </text>
    </g>
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
