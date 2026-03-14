import { DRAWING_GRAPHICS } from '@/sheets/standards';
import { buildRoofPlanScene } from '@/geometry/roofPlanScene';
import BlueprintAnnotationLayer from './BlueprintAnnotationLayer';

function slopeArrowPoints(arrow) {
  return `${arrow.headA.x},${arrow.headA.y} ${arrow.shaftEnd.x},${arrow.shaftEnd.y} ${arrow.headB.x},${arrow.headB.y}`;
}

export default function RoofRenderer({ roofSystem, selectedId = null, selectedType = null, interactive = true }) {
  if (!roofSystem) return null;

  const scene = buildRoofPlanScene(roofSystem);
  const { plan, arrows, tags } = scene;
  const isRoofSelected = selectedType === 'roofSystem' && selectedId === roofSystem.id;
  const isCustom = plan.roofType === 'custom';
  const transitionEdges = (plan.roofEdges || []).filter((edge) => !['ridge', 'valley', 'hip'].includes(edge.edgeRole));

  return (
    <g className="roof-system">
      {!isCustom && plan.surfacePath && (
        <path
          d={plan.surfacePath}
          fill={DRAWING_GRAPHICS.plan.objectFill}
          fillRule="evenodd"
          stroke={isRoofSelected ? 'var(--color-selection)' : DRAWING_GRAPHICS.plan.objectStroke}
          strokeWidth={isRoofSelected ? 1.4 : DRAWING_GRAPHICS.plan.objectStrokeWidth}
          vectorEffect="non-scaling-stroke"
        />
      )}
      {isCustom && plan.roofPlanes.map((plane) => {
        const isSelectedPlane = selectedType === 'roofPlane' && selectedId === plane.id;
        return (
          <polygon
            key={plane.id}
            points={plane.points}
            fill={DRAWING_GRAPHICS.plan.objectFill}
            fillOpacity={isSelectedPlane ? 0.52 : 0.28}
            stroke={isSelectedPlane ? 'var(--color-selection)' : DRAWING_GRAPHICS.plan.objectStroke}
            strokeWidth={isSelectedPlane ? 1.4 : DRAWING_GRAPHICS.plan.objectStrokeWidth}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
      {isCustom && plan.roofOutlinePath && (
        <path
          d={plan.roofOutlinePath}
          fill="none"
          stroke={isRoofSelected ? 'var(--color-selection)' : DRAWING_GRAPHICS.plan.objectStroke}
          strokeWidth={isRoofSelected ? 1.5 : DRAWING_GRAPHICS.plan.objectStrokeWidth}
          vectorEffect="non-scaling-stroke"
        />
      )}
      {plan.ridgeSegments.map((segment, index) => (
        <line
          key={segment.id || `roof-ridge-${index}`}
          x1={segment.start.x}
          y1={segment.start.y}
          x2={segment.end.x}
          y2={segment.end.y}
          stroke={selectedType === 'roofEdge' && selectedId === segment.id ? 'var(--color-selection)' : DRAWING_GRAPHICS.plan.secondaryStroke}
          strokeWidth={selectedType === 'roofEdge' && selectedId === segment.id ? 1.4 : DRAWING_GRAPHICS.plan.secondaryStrokeWidth}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {plan.valleySegments.map((segment, index) => (
        <line
          key={segment.id || `roof-valley-${index}`}
          x1={segment.start.x}
          y1={segment.start.y}
          x2={segment.end.x}
          y2={segment.end.y}
          stroke={selectedType === 'roofEdge' && selectedId === segment.id ? 'var(--color-selection)' : DRAWING_GRAPHICS.plan.secondaryStroke}
          strokeWidth={selectedType === 'roofEdge' && selectedId === segment.id ? 1.4 : DRAWING_GRAPHICS.plan.secondaryStrokeWidth}
          strokeDasharray="10 4"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {plan.hipSegments.map((segment, index) => (
        <line
          key={segment.id || `roof-hip-${index}`}
          x1={segment.start.x}
          y1={segment.start.y}
          x2={segment.end.x}
          y2={segment.end.y}
          stroke={selectedType === 'roofEdge' && selectedId === segment.id ? 'var(--color-selection)' : DRAWING_GRAPHICS.plan.secondaryStroke}
          strokeWidth={selectedType === 'roofEdge' && selectedId === segment.id ? 1.4 : DRAWING_GRAPHICS.plan.secondaryStrokeWidth}
          strokeDasharray="14 5 3 5"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {transitionEdges.map((edge) => (
        <line
          key={edge.id}
          x1={edge.startPoint.x}
          y1={edge.startPoint.y}
          x2={edge.endPoint.x}
          y2={edge.endPoint.y}
          stroke={selectedType === 'roofEdge' && selectedId === edge.id ? 'var(--color-selection)' : DRAWING_GRAPHICS.plan.secondaryStroke}
          strokeWidth={selectedType === 'roofEdge' && selectedId === edge.id ? 1.2 : DRAWING_GRAPHICS.plan.secondaryStrokeWidth}
          strokeDasharray="5 4"
          opacity={0.8}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {plan.openings.map((opening) => (
        <polygon
          key={opening.id}
          points={opening.points}
          fill="#ffffff"
          stroke={DRAWING_GRAPHICS.plan.secondaryStroke}
          strokeWidth={selectedType === 'roofOpening' && selectedId === opening.id ? 1.2 : DRAWING_GRAPHICS.plan.secondaryStrokeWidth}
          strokeDasharray="6 3"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {plan.parapets.map((parapet) => (
        <polygon
          key={parapet.id}
          points={parapet.points}
          fill={DRAWING_GRAPHICS.plan.cutFill}
          stroke={selectedType === 'parapet' && selectedId === parapet.id ? 'var(--color-selection)' : DRAWING_GRAPHICS.plan.cutStroke}
          strokeWidth={selectedType === 'parapet' && selectedId === parapet.id ? 1.4 : DRAWING_GRAPHICS.plan.cutStrokeWidth}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {plan.drains.map((drain) => (
        <g key={drain.id}>
          <circle
            cx={drain.center.x}
            cy={drain.center.y}
            r={drain.radius}
            fill="#ffffff"
            stroke={selectedType === 'drain' && selectedId === drain.id ? 'var(--color-selection)' : DRAWING_GRAPHICS.plan.markerStroke}
            strokeWidth={selectedType === 'drain' && selectedId === drain.id ? 1.4 : DRAWING_GRAPHICS.plan.markerStrokeWidth}
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
          <line
            x1={drain.center.x - drain.innerRadius * 0.7}
            y1={drain.center.y - drain.innerRadius * 0.7}
            x2={drain.center.x + drain.innerRadius * 0.7}
            y2={drain.center.y + drain.innerRadius * 0.7}
            stroke={DRAWING_GRAPHICS.plan.secondaryStroke}
            strokeWidth={DRAWING_GRAPHICS.plan.secondaryStrokeWidth}
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={drain.center.x - drain.innerRadius * 0.7}
            y1={drain.center.y + drain.innerRadius * 0.7}
            x2={drain.center.x + drain.innerRadius * 0.7}
            y2={drain.center.y - drain.innerRadius * 0.7}
            stroke={DRAWING_GRAPHICS.plan.secondaryStroke}
            strokeWidth={DRAWING_GRAPHICS.plan.secondaryStrokeWidth}
            vectorEffect="non-scaling-stroke"
          />
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
        </g>
      ))}
      <BlueprintAnnotationLayer dimensions={[]} tags={tags} className="roof-plan-annotations" />
    </g>
  );
}
