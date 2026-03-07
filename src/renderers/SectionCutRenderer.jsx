import { getSectionCutRenderData } from '@/geometry/sectionCutGeometry';

export default function SectionCutRenderer({ sectionCut, selectedId }) {
  const renderData = getSectionCutRenderData(sectionCut);
  if (!renderData) return null;

  const isSelected = selectedId === sectionCut.id;
  const stroke = isSelected ? 'var(--color-selection)' : 'var(--color-text-secondary)';
  const opacity = isSelected ? 0.95 : 0.75;

  return (
    <g className="section-cut" style={{ pointerEvents: 'none' }}>
      <line
        x1={renderData.line.start.x}
        y1={renderData.line.start.y}
        x2={renderData.line.end.x}
        y2={renderData.line.end.y}
        stroke={stroke}
        strokeWidth={2}
        strokeDasharray="160 70"
        vectorEffect="non-scaling-stroke"
        opacity={opacity}
      />
      {renderData.arrow && (
        <>
          <line
            x1={renderData.arrow.shaftStart.x}
            y1={renderData.arrow.shaftStart.y}
            x2={renderData.arrow.shaftEnd.x}
            y2={renderData.arrow.shaftEnd.y}
            stroke={stroke}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            opacity={opacity}
          />
          <polyline
            points={`${renderData.arrow.headA.x},${renderData.arrow.headA.y} ${renderData.arrow.shaftEnd.x},${renderData.arrow.shaftEnd.y} ${renderData.arrow.headB.x},${renderData.arrow.headB.y}`}
            fill="none"
            stroke={stroke}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            opacity={opacity}
          />
        </>
      )}
      <text
        x={renderData.center.x}
        y={renderData.center.y - 180}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={stroke}
        fontSize={150}
        fontFamily="var(--font-blueprint)"
        opacity={opacity}
      >
        {renderData.label}
      </text>
    </g>
  );
}
