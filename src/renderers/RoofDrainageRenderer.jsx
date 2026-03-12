import { DRAWING_GRAPHICS } from '@/sheets/standards';
import { buildRoofDrainagePlanGeometry } from '@/geometry/roofDrainageGeometry';

function slopeArrowPoints(arrow) {
  return `${arrow.headA.x},${arrow.headA.y} ${arrow.shaftEnd.x},${arrow.shaftEnd.y} ${arrow.headB.x},${arrow.headB.y}`;
}

export default function RoofDrainageRenderer({ roofSystem, interactive = false }) {
  if (!roofSystem) return null;

  const drainage = buildRoofDrainagePlanGeometry(roofSystem);
  const { roofPlan, arrows, gutters, downspouts, drains } = drainage;

  return (
    <g className="roof-drainage">
      {roofPlan.surfacePath && (
        <path
          d={roofPlan.surfacePath}
          fill="#ffffff"
          stroke={DRAWING_GRAPHICS.plan.objectStroke}
          strokeWidth={DRAWING_GRAPHICS.plan.objectStrokeWidth}
          vectorEffect="non-scaling-stroke"
        />
      )}
      {roofPlan.openings.map((opening) => (
        <polygon
          key={opening.id}
          points={opening.points}
          fill="#ffffff"
          stroke={DRAWING_GRAPHICS.plan.secondaryStroke}
          strokeWidth={DRAWING_GRAPHICS.plan.secondaryStrokeWidth}
          strokeDasharray="6 3"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {gutters.map((gutter) => (
        <g key={gutter.id}>
          <line
            x1={gutter.start.x}
            y1={gutter.start.y}
            x2={gutter.end.x}
            y2={gutter.end.y}
            stroke={DRAWING_GRAPHICS.plan.markerStroke}
            strokeWidth={2.2}
            vectorEffect="non-scaling-stroke"
          />
          <text
            x={gutter.center.x}
            y={gutter.center.y - 180}
            textAnchor="middle"
            fill={DRAWING_GRAPHICS.annotation.textMuted}
            fontSize={110}
            fontFamily="var(--font-blueprint)"
            style={{ pointerEvents: 'none' }}
          >
            GUTTER
          </text>
        </g>
      ))}
      {drains.map((drain) => (
        <g key={drain.id}>
          <circle
            cx={drain.center.x}
            cy={drain.center.y}
            r={drain.radius}
            fill="#ffffff"
            stroke={DRAWING_GRAPHICS.plan.markerStroke}
            strokeWidth={DRAWING_GRAPHICS.plan.markerStrokeWidth}
            vectorEffect="non-scaling-stroke"
          />
          <circle
            cx={drain.center.x}
            cy={drain.center.y}
            r={drain.innerRadius}
            fill="none"
            stroke={DRAWING_GRAPHICS.plan.secondaryStroke}
            strokeWidth={DRAWING_GRAPHICS.plan.secondaryStrokeWidth}
            vectorEffect="non-scaling-stroke"
          />
          <text
            x={drain.center.x}
            y={drain.center.y - drain.radius - 120}
            textAnchor="middle"
            fill={DRAWING_GRAPHICS.annotation.textMuted}
            fontSize={108}
            fontFamily="var(--font-blueprint)"
            style={{ pointerEvents: 'none' }}
          >
            RD
          </text>
        </g>
      ))}
      {downspouts.map((downspout) => (
        <g key={downspout.id}>
          <rect
            x={downspout.position.x - 90}
            y={downspout.position.y - 90}
            width={180}
            height={180}
            fill="#ffffff"
            stroke={DRAWING_GRAPHICS.plan.markerStroke}
            strokeWidth={DRAWING_GRAPHICS.plan.markerStrokeWidth}
            vectorEffect="non-scaling-stroke"
          />
          <text
            x={downspout.position.x}
            y={downspout.position.y + 38}
            textAnchor="middle"
            fill={DRAWING_GRAPHICS.annotation.text}
            fontSize={96}
            fontFamily="var(--font-blueprint)"
            style={{ pointerEvents: 'none' }}
          >
            DP
          </text>
        </g>
      ))}
      {arrows.map((arrow) => (
        <g key={arrow.id} pointerEvents={interactive ? 'auto' : 'none'}>
          <line
            x1={arrow.shaftStart.x}
            y1={arrow.shaftStart.y}
            x2={arrow.shaftEnd.x}
            y2={arrow.shaftEnd.y}
            stroke={DRAWING_GRAPHICS.plan.markerStroke}
            strokeWidth={DRAWING_GRAPHICS.plan.markerStrokeWidth}
            vectorEffect="non-scaling-stroke"
          />
          <polyline
            points={slopeArrowPoints(arrow)}
            fill="none"
            stroke={DRAWING_GRAPHICS.plan.markerStroke}
            strokeWidth={DRAWING_GRAPHICS.plan.markerStrokeWidth}
            vectorEffect="non-scaling-stroke"
          />
          {arrow.label && (
            <text
              x={arrow.labelPosition.x}
              y={arrow.labelPosition.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={DRAWING_GRAPHICS.annotation.text}
              fontSize={120}
              fontFamily="var(--font-blueprint)"
              style={{ pointerEvents: 'none' }}
            >
              {arrow.label}
            </text>
          )}
        </g>
      ))}
    </g>
  );
}
