import { STAIR_RISERS, STAIR_RISER_HEIGHT, STAIR_TREAD_DEPTH, STAIR_WIDTH } from '@/domain/defaults';
import { TOOLS } from '@/editor/tools';
import { getStairRenderData } from '@/geometry/stairGeometry';

export default function StairPreview({ toolState, activeTool, floorId }) {
  if (activeTool !== TOOLS.STAIR) return null;
  if (!toolState.stairStartPoint || toolState.stairPreviewAngle == null) return null;

  const previewStair = {
    id: 'stair_preview',
    startPoint: toolState.stairStartPoint,
    width: STAIR_WIDTH,
    numberOfRisers: STAIR_RISERS,
    riserHeight: STAIR_RISER_HEIGHT,
    treadDepth: STAIR_TREAD_DEPTH,
    direction: { angle: toolState.stairPreviewAngle },
    floorRelation: { fromFloorId: floorId, toFloorId: floorId },
  };

  const renderData = getStairRenderData(previewStair);
  if (!renderData) return null;

  const points = renderData.outline.map((point) => `${point.x},${point.y}`).join(' ');

  return (
    <g style={{ pointerEvents: 'none' }}>
      <polygon
        points={points}
        fill="rgba(207, 179, 120, 0.1)"
        stroke="var(--color-selection)"
        strokeWidth={2}
        strokeDasharray="6 3"
        vectorEffect="non-scaling-stroke"
      />
      {renderData.treads.map((tread, index) => (
        <line
          key={`preview-tread-${index}`}
          x1={tread.start.x}
          y1={tread.start.y}
          x2={tread.end.x}
          y2={tread.end.y}
          stroke="var(--color-selection)"
          strokeWidth={1.2}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {renderData.arrow && (
        <>
          <line
            x1={renderData.arrow.start.x}
            y1={renderData.arrow.start.y}
            x2={renderData.arrow.end.x}
            y2={renderData.arrow.end.y}
            stroke="var(--color-selection)"
            strokeWidth={1.6}
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={renderData.arrow.end.x}
            y1={renderData.arrow.end.y}
            x2={renderData.arrow.headA.x}
            y2={renderData.arrow.headA.y}
            stroke="var(--color-selection)"
            strokeWidth={1.6}
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={renderData.arrow.end.x}
            y1={renderData.arrow.end.y}
            x2={renderData.arrow.headB.x}
            y2={renderData.arrow.headB.y}
            stroke="var(--color-selection)"
            strokeWidth={1.6}
            vectorEffect="non-scaling-stroke"
          />
        </>
      )}
    </g>
  );
}
