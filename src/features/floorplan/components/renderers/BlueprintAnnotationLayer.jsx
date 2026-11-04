import { memo } from 'react';
import { DRAWING_GRAPHICS, PRESENTATION_GRAPHICS, SHEET_COLORS } from '@/sheets/standards';
import { ANNOTATION_SEMANTIC_ROLES, ANNOTATION_TRUST_LEVELS } from '@/annotations/policy';
import { useCanvasZoom } from './CanvasZoomContext';
import { isPresentationStyle, usePlanStyle } from './PlanStyleContext';

// The size constants in DRAWING_GRAPHICS.annotation read correctly at the
// default canvas zoom. Dimension LINES stay readable at any zoom via
// non-scaling strokes; text must compensate the same way or it shrinks into
// invisibility on zoomed-out plans while the lines stay crisp.
const ANNOTATION_BASELINE_ZOOM = 0.1;

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

function DimensionTextMask({ figure, fontSize, textScale = 1 }) {
  const width =
    estimateTextWidth(figure.text.value, fontSize) + DRAWING_GRAPHICS.annotation.textMaskPaddingX * textScale;
  const height = fontSize + DRAWING_GRAPHICS.annotation.textMaskPaddingY * textScale;

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

function DimensionFigure({ figure, textScale = 1 }) {
  const fontSize = DRAWING_GRAPHICS.annotation.textSize * textScale;

  return (
    <g
      key={figure.id}
      data-dimension-source={figure.source}
      data-dimension-source-type={figure.sourceType || undefined}
    >
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
      <DimensionTextMask figure={figure} fontSize={fontSize} textScale={textScale} />
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

function TagTextMask({ tag, fontSize, lineHeight, opacity = 0.92, textScale = 1 }) {
  const maxLineLength = Math.max(...tag.textLines.map((line) => String(line || '').length), 1);
  const width = estimateTextWidth('X'.repeat(maxLineLength), fontSize) + (tag.maskPaddingX ?? 44) * textScale;
  const height = Math.max(lineHeight, tag.textLines.length * lineHeight) + (tag.maskPaddingY ?? 22) * textScale;
  const x =
    tag.textAnchor === 'start'
      ? tag.position.x
      : tag.textAnchor === 'end'
        ? tag.position.x - width
        : tag.position.x - width / 2;

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
  const isInformationalMeasurement =
    tag.semanticRole === ANNOTATION_SEMANTIC_ROLES.MEASUREMENT &&
    tag.trustLevel !== ANNOTATION_TRUST_LEVELS.AUTHORITATIVE;

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

function TagFigure({ tag, textScale = 1 }) {
  const isRoom = tag.sourceType === 'room';
  const nameSize =
    (isRoom ? DRAWING_GRAPHICS.annotation.roomNameSize : (tag.fontSize ?? DRAWING_GRAPHICS.annotation.textSize)) *
    textScale;
  const areaSize = DRAWING_GRAPHICS.annotation.roomAreaSize * textScale;
  const lineHeight = (isRoom ? 168 : (tag.lineHeight ?? 150)) * textScale;
  const startY = tag.position.y - ((tag.textLines.length - 1) * lineHeight) / 2;
  const style = resolveTagStyle(tag, isRoom);

  return (
    <g key={tag.id}>
      {tag.leaderLine ? (
        <>
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
          <circle
            cx={tag.leaderLine.start.x}
            cy={tag.leaderLine.start.y}
            r={nameSize * 0.18}
            fill={style.leaderStroke}
          />
        </>
      ) : null}
      {tag.mask ? (
        <TagTextMask
          tag={tag}
          fontSize={nameSize}
          lineHeight={lineHeight}
          opacity={style.maskOpacity}
          textScale={textScale}
        />
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

// ── Presentation ─────────────────────────────────────────────────────────────
//
// The same figures, set the way a rendered plan sets them: Manrope rather than
// the blueprint mono, filled arrowheads, labels on small rounded chips, room
// names in bold capitals over a quiet area line.

const PA = PRESENTATION_GRAPHICS.annotation;
// Manrope is proportional: digits run narrower than the mono's 0.58 em, bold
// capitals with tracking wider. Only used to size the chip behind a label.
const PRESENTATION_DIGIT_EM = 0.56;
const PRESENTATION_CAPS_EM = 0.7;

function presentationTextWidth(text, fontSize, em) {
  return Math.max(fontSize * 1.2, String(text || '').length * fontSize * em);
}

/** A closed, filled head pointing at the arrow's tip. */
export function filledArrowheadPoints(arrow, length = PA.arrowLength, halfWidthRatio = PA.arrowHalfWidthRatio) {
  const baseX = (arrow.left.x + arrow.right.x) / 2;
  const baseY = (arrow.left.y + arrow.right.y) / 2;
  let dx = arrow.tip.x - baseX;
  let dy = arrow.tip.y - baseY;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  const half = length * halfWidthRatio;
  const bx = arrow.tip.x - dx * length;
  const by = arrow.tip.y - dy * length;
  return [
    [arrow.tip.x, arrow.tip.y],
    [bx - dy * half, by + dx * half],
    [bx + dy * half, by - dx * half],
  ];
}

function PresentationArrowhead({ arrow }) {
  const points = filledArrowheadPoints(arrow)
    .map(([x, y]) => `${x},${y}`)
    .join(' ');
  return <polygon points={points} fill={PA.dimensionStroke} stroke="none" />;
}

function chipRadius(textScale) {
  return PA.chipRadiusPx * textScale * 10;
}

function PresentationDimensionFigure({ figure, textScale = 1 }) {
  const fontSize = DRAWING_GRAPHICS.annotation.textSize * 0.92 * textScale;
  const width = presentationTextWidth(figure.text.value, fontSize, PRESENTATION_DIGIT_EM) + 70 * textScale;
  const height = fontSize + 44 * textScale;
  const { x, y } = figure.text.position;
  const rotate = `rotate(${figure.text.angle}, ${x}, ${y})`;

  return (
    <g data-dimension-source={figure.source} data-dimension-source-type={figure.sourceType || undefined}>
      {figure.extensionLines.map((line, index) => (
        <line
          key={`${figure.id}-ext-${index}`}
          x1={line.start.x}
          y1={line.start.y}
          x2={line.end.x}
          y2={line.end.y}
          stroke={PA.dimensionExtension}
          strokeWidth={PA.dimensionExtensionWidth}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <line
        x1={figure.lineStart.x}
        y1={figure.lineStart.y}
        x2={figure.lineEnd.x}
        y2={figure.lineEnd.y}
        stroke={PA.dimensionStroke}
        strokeWidth={PA.dimensionStrokeWidth}
        vectorEffect="non-scaling-stroke"
      />
      {figure.arrowheads.map((arrow, index) => (
        <PresentationArrowhead key={`${figure.id}-arrow-${index}`} arrow={arrow} />
      ))}
      <rect
        x={x - width / 2}
        y={y - height / 2}
        width={width}
        height={height}
        rx={chipRadius(textScale)}
        ry={chipRadius(textScale)}
        fill={PA.chipFill}
        stroke="rgba(28,33,40,0.08)"
        strokeWidth={0.6}
        vectorEffect="non-scaling-stroke"
        transform={rotate}
      />
      <text
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="central"
        fill={PA.text}
        fontSize={fontSize}
        fontWeight={PA.dimensionTextWeight}
        fontFamily={PA.fontFamily}
        transform={rotate}
        style={{ pointerEvents: 'none', fontVariantNumeric: 'tabular-nums' }}
      >
        {figure.text.value}
      </text>
    </g>
  );
}

function PresentationTagFigure({ tag, textScale = 1 }) {
  const isRoom = tag.sourceType === 'room';
  const nameSize =
    (isRoom
      ? DRAWING_GRAPHICS.annotation.roomNameSize * 0.92
      : (tag.fontSize ?? DRAWING_GRAPHICS.annotation.textSize)) * textScale;
  const areaSize = DRAWING_GRAPHICS.annotation.roomAreaSize * 0.95 * textScale;
  const lineHeight = (isRoom ? 168 : (tag.lineHeight ?? 150)) * textScale;
  const lines = tag.textLines.map((line, index) =>
    isRoom && index === 0 ? String(line || '').toUpperCase() : String(line || ''),
  );
  const startY = tag.position.y - ((lines.length - 1) * lineHeight) / 2;
  const rotate = `rotate(${tag.angle || 0}, ${tag.position.x}, ${tag.position.y})`;
  const style = resolveTagStyle(tag, isRoom);
  const textFill = isRoom || style.textFill === DRAWING_GRAPHICS.annotation.text ? PA.text : PA.textMuted;

  let chip = null;
  if (tag.mask) {
    const widest = Math.max(
      ...lines.map((line, index) =>
        presentationTextWidth(
          line,
          isRoom && index > 0 ? areaSize : nameSize,
          isRoom && index === 0 ? PRESENTATION_CAPS_EM : PRESENTATION_DIGIT_EM,
        ),
      ),
      1,
    );
    const width = widest + 90 * textScale;
    const height = Math.max(lineHeight, lines.length * lineHeight) + 40 * textScale;
    const x =
      tag.textAnchor === 'start'
        ? tag.position.x
        : tag.textAnchor === 'end'
          ? tag.position.x - width
          : tag.position.x - width / 2;
    chip = (
      <rect
        data-annotation-chip=""
        x={x}
        y={tag.position.y - height / 2}
        width={width}
        height={height}
        rx={chipRadius(textScale)}
        ry={chipRadius(textScale)}
        fill={PA.chipFill}
        opacity={isRoom ? 0.82 : 1}
        transform={rotate}
      />
    );
  }

  return (
    <g data-tag-source={tag.sourceType || undefined}>
      {tag.leaderLine ? (
        <>
          <line
            x1={tag.leaderLine.start.x}
            y1={tag.leaderLine.start.y}
            x2={tag.leaderLine.end.x}
            y2={tag.leaderLine.end.y}
            stroke={PA.dimensionExtension}
            strokeWidth={PA.dimensionExtensionWidth}
            strokeDasharray={style.leaderDash}
            vectorEffect="non-scaling-stroke"
          />
          <circle
            cx={tag.leaderLine.start.x}
            cy={tag.leaderLine.start.y}
            r={nameSize * 0.18}
            fill={PA.dimensionStroke}
          />
        </>
      ) : null}
      {chip}
      <text
        x={tag.position.x}
        y={startY}
        textAnchor={tag.textAnchor}
        dominantBaseline="central"
        fill={textFill}
        fontSize={nameSize}
        fontWeight={isRoom ? PA.roomNameWeight : 600}
        fontFamily={PA.fontFamily}
        letterSpacing={isRoom ? PA.roomNameTracking : undefined}
        transform={rotate}
        style={{ pointerEvents: 'none' }}
      >
        {lines.map((line, index) => (
          <tspan
            key={`${tag.id}-line-${index}`}
            x={tag.position.x}
            dy={index === 0 ? 0 : lineHeight}
            fontSize={isRoom && index > 0 ? areaSize : nameSize}
            fill={isRoom && index > 0 ? PA.textMuted : undefined}
            fontWeight={isRoom && index > 0 ? 500 : undefined}
            letterSpacing={isRoom && index > 0 ? '0' : undefined}
          >
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}

function BlueprintAnnotationLayer({ dimensions = [], tags = [], className = 'annotations' }) {
  const zoom = useCanvasZoom();
  const textScale = zoom ? ANNOTATION_BASELINE_ZOOM / Math.max(0.0001, zoom) : 1;
  const presentation = isPresentationStyle(usePlanStyle());

  if (presentation) {
    return (
      <g className={className} data-annotation-style="presentation">
        {dimensions.map((figure) => (
          <PresentationDimensionFigure key={figure.id} figure={figure} textScale={textScale} />
        ))}
        {tags.map((tag) => (
          <PresentationTagFigure key={tag.id} tag={tag} textScale={textScale} />
        ))}
      </g>
    );
  }

  return (
    <g className={className}>
      {dimensions.map((figure) => (
        <DimensionFigure key={figure.id} figure={figure} textScale={textScale} />
      ))}
      {tags.map((tag) => (
        <TagFigure key={tag.id} tag={tag} textScale={textScale} />
      ))}
    </g>
  );
}

export default memo(BlueprintAnnotationLayer);
