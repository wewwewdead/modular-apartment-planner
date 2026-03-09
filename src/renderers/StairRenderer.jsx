import { getStairRenderData } from '@/geometry/stairGeometry';
import { DRAWING_GRAPHICS } from '@/sheets/standards';

export default function StairRenderer({ stairs }) {
  return (
    <g className="stairs">
      {(stairs || []).map((stair) => {
        const renderData = getStairRenderData(stair);
        if (!renderData) return null;

        const points = renderData.outline.map((point) => `${point.x},${point.y}`).join(' ');

        return (
          <g key={stair.id} data-id={stair.id} data-type="stair">
            <polygon
              points={points}
              fill="#ffffff"
              stroke={DRAWING_GRAPHICS.plan.objectStroke}
              strokeWidth={DRAWING_GRAPHICS.plan.objectStrokeWidth}
              vectorEffect="non-scaling-stroke"
            />
            {renderData.treads.map((tread, index) => (
              <line
                key={`${stair.id}-tread-${index}`}
                x1={tread.start.x}
                y1={tread.start.y}
                x2={tread.end.x}
                y2={tread.end.y}
                stroke={DRAWING_GRAPHICS.plan.secondaryStroke}
                strokeWidth={0.72}
                vectorEffect="non-scaling-stroke"
                style={{ pointerEvents: 'none' }}
              />
            ))}
            {renderData.arrow && (
              <g style={{ pointerEvents: 'none' }}>
                <line
                  x1={renderData.arrow.start.x}
                  y1={renderData.arrow.start.y}
                  x2={renderData.arrow.end.x}
                  y2={renderData.arrow.end.y}
                  stroke={DRAWING_GRAPHICS.plan.markerStroke}
                  strokeWidth={DRAWING_GRAPHICS.plan.markerStrokeWidth}
                  vectorEffect="non-scaling-stroke"
                />
                <line
                  x1={renderData.arrow.end.x}
                  y1={renderData.arrow.end.y}
                  x2={renderData.arrow.headA.x}
                  y2={renderData.arrow.headA.y}
                  stroke={DRAWING_GRAPHICS.plan.markerStroke}
                  strokeWidth={DRAWING_GRAPHICS.plan.markerStrokeWidth}
                  vectorEffect="non-scaling-stroke"
                />
                <line
                  x1={renderData.arrow.end.x}
                  y1={renderData.arrow.end.y}
                  x2={renderData.arrow.headB.x}
                  y2={renderData.arrow.headB.y}
                  stroke={DRAWING_GRAPHICS.plan.markerStroke}
                  strokeWidth={DRAWING_GRAPHICS.plan.markerStrokeWidth}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}
