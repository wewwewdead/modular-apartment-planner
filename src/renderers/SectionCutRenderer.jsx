import { getSectionCutRenderData } from '@/geometry/sectionCutGeometry';
import { DRAWING_GRAPHICS } from '@/sheets/standards';

function estimateLabelWidth(value = '') {
  return Math.max(300, String(value).length * 96);
}

export default function SectionCutRenderer({ sectionCut, selectedId }) {
  const renderData = getSectionCutRenderData(sectionCut);
  if (!renderData) return null;

  const isSelected = selectedId === sectionCut.id;
  const stroke = isSelected ? 'var(--color-selection)' : DRAWING_GRAPHICS.annotation.calloutStroke;
  const fill = DRAWING_GRAPHICS.annotation.calloutFill;
  const opacity = isSelected ? 0.95 : 1;
  const labelWidth = estimateLabelWidth(renderData.label);

  return (
    <g className="section-cut" style={{ pointerEvents: 'none' }}>
      <line
        x1={renderData.line.start.x}
        y1={renderData.line.start.y}
        x2={renderData.line.end.x}
        y2={renderData.line.end.y}
        stroke={stroke}
        strokeWidth={DRAWING_GRAPHICS.annotation.calloutStrokeWidth}
        strokeDasharray="140 55"
        vectorEffect="non-scaling-stroke"
        opacity={opacity}
      />
      <circle
        cx={renderData.line.start.x}
        cy={renderData.line.start.y}
        r={52}
        fill={fill}
        stroke={stroke}
        strokeWidth={DRAWING_GRAPHICS.annotation.calloutStrokeWidth}
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={renderData.line.end.x}
        cy={renderData.line.end.y}
        r={52}
        fill={fill}
        stroke={stroke}
        strokeWidth={DRAWING_GRAPHICS.annotation.calloutStrokeWidth}
        vectorEffect="non-scaling-stroke"
      />
      {renderData.arrow && (
        <>
          <line
            x1={renderData.arrow.shaftStart.x}
            y1={renderData.arrow.shaftStart.y}
            x2={renderData.arrow.shaftEnd.x}
            y2={renderData.arrow.shaftEnd.y}
            stroke={stroke}
            strokeWidth={DRAWING_GRAPHICS.annotation.calloutStrokeWidth}
            vectorEffect="non-scaling-stroke"
            opacity={opacity}
          />
          <polyline
            points={`${renderData.arrow.headA.x},${renderData.arrow.headA.y} ${renderData.arrow.shaftEnd.x},${renderData.arrow.shaftEnd.y} ${renderData.arrow.headB.x},${renderData.arrow.headB.y}`}
            fill="none"
            stroke={stroke}
            strokeWidth={DRAWING_GRAPHICS.annotation.calloutStrokeWidth}
            vectorEffect="non-scaling-stroke"
            opacity={opacity}
          />
        </>
      )}
      <rect
        x={renderData.center.x - labelWidth / 2}
        y={renderData.center.y - 248}
        width={labelWidth}
        height={154}
        fill={fill}
      />
      <text
        x={renderData.center.x}
        y={renderData.center.y - 180}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={stroke}
        fontSize={138}
        fontWeight={600}
        fontFamily="var(--font-blueprint)"
        opacity={opacity}
      >
        {renderData.label}
      </text>
    </g>
  );
}
