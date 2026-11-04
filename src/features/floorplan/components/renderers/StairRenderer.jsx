import { memo } from 'react';
import { getStairRenderData } from '@/geometry/stairGeometry';
import { DRAWING_GRAPHICS, PRESENTATION_GRAPHICS } from '@/sheets/standards';
import { useCanvasZoom } from './CanvasZoomContext';
import { isPresentationStyle, usePlanStyle } from './PlanStyleContext';

// Same baseline the annotation layer compensates against: sizes read right at
// the default zoom, and text is scaled by 0.1 / zoom to stay legible.
const TEXT_BASELINE_ZOOM = 0.1;
const LABEL_SETBACK = 120; // mm behind the arrow's tail, along the run

/**
 * UP from the floor a stair leaves, DN on the floor it arrives at. A stair
 * that only names the floor it lands on — and is drawn on that floor — goes
 * down from here; everything else, including a stair with no floors recorded,
 * reads as going up, which is how a plan is conventionally annotated.
 */
export function stairDirectionLabel(stair, floorId) {
  const relation = stair?.floorRelation || {};
  if (floorId && relation.toFloorId === floorId && relation.fromFloorId !== floorId) return 'DN';
  return 'UP';
}

/**
 * The run's angle, turned so the label never reads upside down. A vertical run
 * reads from the right-hand side (bottom to top), the drafting convention for
 * vertical text, rather than top to bottom.
 */
export function uprightAngle(dx, dy) {
  let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (deg > 90.01) deg -= 180;
  else if (deg <= -90.01) deg += 180;
  if (deg > 89.99) deg -= 180;
  return deg;
}

function StairLabel({ stair, arrow, floorId, textScale }) {
  const g = PRESENTATION_GRAPHICS.plan;
  const dx = arrow.end.x - arrow.start.x;
  const dy = arrow.end.y - arrow.start.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) return null;
  const x = arrow.start.x - (dx / length) * LABEL_SETBACK * Math.max(1, textScale);
  const y = arrow.start.y - (dy / length) * LABEL_SETBACK * Math.max(1, textScale);
  const angle = uprightAngle(dx, dy);
  return (
    <text
      data-stair-label=""
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="middle"
      fill={g.arrowStroke}
      fontSize={g.stairLabelSize * textScale}
      fontWeight={700}
      fontFamily="var(--font-ui)"
      letterSpacing="0.06em"
      transform={`rotate(${angle}, ${x}, ${y})`}
      style={{ pointerEvents: 'none' }}
    >
      {stairDirectionLabel(stair, floorId)}
    </text>
  );
}

function PresentationStair({ stair, renderData, floorId, textScale }) {
  const g = PRESENTATION_GRAPHICS.plan;
  const points = renderData.outline.map((point) => `${point.x},${point.y}`).join(' ');
  const arrow = renderData.arrow;
  return (
    <g data-id={stair.id} data-type="stair">
      <polygon
        points={points}
        fill={g.stairFill}
        stroke={g.stairStroke}
        strokeWidth={g.treadStrokeWidth}
        vectorEffect="non-scaling-stroke"
      />
      {renderData.treads.map((tread, index) => (
        <line
          key={`${stair.id}-tread-${index}`}
          x1={tread.start.x}
          y1={tread.start.y}
          x2={tread.end.x}
          y2={tread.end.y}
          stroke={g.treadStroke}
          strokeWidth={g.treadStrokeWidth}
          vectorEffect="non-scaling-stroke"
          style={{ pointerEvents: 'none' }}
        />
      ))}
      {arrow && (
        <g style={{ pointerEvents: 'none' }}>
          <line
            x1={arrow.start.x}
            y1={arrow.start.y}
            x2={arrow.end.x}
            y2={arrow.end.y}
            stroke={g.arrowStroke}
            strokeWidth={g.arrowStrokeWidth}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          <polygon
            data-stair-arrowhead=""
            points={`${arrow.headA.x},${arrow.headA.y} ${arrow.end.x},${arrow.end.y} ${arrow.headB.x},${arrow.headB.y}`}
            fill={g.arrowStroke}
            stroke={g.arrowStroke}
            strokeWidth={0.6}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <circle cx={arrow.start.x} cy={arrow.start.y} r={22 * Math.max(1, textScale)} fill={g.arrowStroke} />
          <StairLabel stair={stair} arrow={arrow} floorId={floorId} textScale={textScale} />
        </g>
      )}
    </g>
  );
}

function StairRenderer({ stairs, floorId = null }) {
  const presentation = isPresentationStyle(usePlanStyle());
  const zoom = useCanvasZoom();
  const textScale = zoom ? TEXT_BASELINE_ZOOM / Math.max(0.0001, zoom) : 1;

  return (
    <g className="stairs">
      {(stairs || []).map((stair) => {
        const renderData = getStairRenderData(stair);
        if (!renderData) return null;

        if (presentation) {
          return (
            <PresentationStair
              key={stair.id}
              stair={stair}
              renderData={renderData}
              floorId={floorId}
              textScale={textScale}
            />
          );
        }

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

export default memo(StairRenderer);
