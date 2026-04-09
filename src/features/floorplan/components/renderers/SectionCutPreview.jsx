import { TOOLS } from '@/editor/tools';
import { getSectionCutRenderData } from '@/geometry/sectionCutGeometry';

export default function SectionCutPreview({ toolState, activeTool }) {
  if (activeTool !== TOOLS.SECTION) return null;
  if (!toolState.sectionStartPoint || !toolState.sectionPreviewPoint) return null;

  const renderData = getSectionCutRenderData({
    id: 'section-preview',
    startPoint: toolState.sectionStartPoint,
    endPoint: toolState.sectionPreviewPoint,
    label: 'Section',
    direction: 1,
  });
  if (!renderData) return null;

  return (
    <g style={{ pointerEvents: 'none' }}>
      <line
        x1={renderData.line.start.x}
        y1={renderData.line.start.y}
        x2={renderData.line.end.x}
        y2={renderData.line.end.y}
        stroke="var(--color-selection)"
        strokeWidth={2}
        strokeDasharray="140 70"
        vectorEffect="non-scaling-stroke"
      />
      {renderData.arrow && (
        <>
          <line
            x1={renderData.arrow.shaftStart.x}
            y1={renderData.arrow.shaftStart.y}
            x2={renderData.arrow.shaftEnd.x}
            y2={renderData.arrow.shaftEnd.y}
            stroke="var(--color-selection)"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
          <polyline
            points={`${renderData.arrow.headA.x},${renderData.arrow.headA.y} ${renderData.arrow.shaftEnd.x},${renderData.arrow.shaftEnd.y} ${renderData.arrow.headB.x},${renderData.arrow.headB.y}`}
            fill="none"
            stroke="var(--color-selection)"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        </>
      )}
    </g>
  );
}
