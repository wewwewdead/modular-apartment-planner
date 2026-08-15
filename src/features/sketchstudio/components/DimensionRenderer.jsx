import { formatDimensionText, getDimensionGeometry, measureDistance } from '../utils/dimensionUtils';
import { getAngleDimensionGeometry, formatAngleText } from '../utils/angleUtils';
import { resolveAngleDimensionPoints, resolveLinearDimensionPoints } from '../utils/entityUtils';

function hasValidSourceRefs(entity, allEntities) {
  const sourceRefs = entity.meta?.sourceRefs ?? [];
  if (sourceRefs.length === 0) return true;
  return sourceRefs.every((ref) => {
    if (!ref?.entityId) return true;
    return allEntities.some((e) => e.id === ref.entityId);
  });
}

function renderLinearDimension(entity, allEntities, className) {
  const { p1, p2 } = resolveLinearDimensionPoints(entity, allEntities);
  const geometry = getDimensionGeometry({
    p1,
    p2,
    subtype: entity.subtype,
    offset: entity.offset,
  });
  const text = formatDimensionText(measureDistance(p1, p2, entity.subtype), entity.units);

  return (
    <g key={entity.id} className={className} pointerEvents="none">
      <line className="sketchStudioDimensionLine" {...geometry.ext1} vectorEffect="non-scaling-stroke" />
      <line className="sketchStudioDimensionLine" {...geometry.ext2} vectorEffect="non-scaling-stroke" />
      <line className="sketchStudioDimensionLine" {...geometry.dimLine} vectorEffect="non-scaling-stroke" />
      <line className="sketchStudioDimensionTick" {...geometry.tick1} vectorEffect="non-scaling-stroke" />
      <line className="sketchStudioDimensionTick" {...geometry.tick2} vectorEffect="non-scaling-stroke" />
      <text
        className="sketchStudioDimensionText"
        x={geometry.textPoint.x}
        y={geometry.textPoint.y}
        textAnchor="middle"
        dominantBaseline="middle"
        transform={`rotate(${geometry.textAngle} ${geometry.textPoint.x} ${geometry.textPoint.y})`}
      >
        {text}
      </text>
    </g>
  );
}

function renderAngleDimension(entity, allEntities, className) {
  const { vertex, p1, p2 } = resolveAngleDimensionPoints(entity, allEntities);
  const geometry = getAngleDimensionGeometry({
    vertex,
    p1,
    p2,
    arcRadius: entity.arcRadius,
    isometricPlane: entity.isometricPlane,
  });

  // A collapsed ray has no angle to report — draw the rays that survived rather
  // than an arc and a number invented from a zero vector.
  return (
    <g key={entity.id} className={className} pointerEvents="none">
      <line className="sketchStudioDimensionLine" {...geometry.ray1} vectorEffect="non-scaling-stroke" />
      <line className="sketchStudioDimensionLine" {...geometry.ray2} vectorEffect="non-scaling-stroke" />
      {geometry.arcPath ? (
        <path
          className="sketchStudioDimensionLine"
          d={geometry.arcPath}
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      {geometry.angleDeg == null ? null : (
        <text
          className="sketchStudioDimensionText"
          x={geometry.textPoint.x}
          y={geometry.textPoint.y}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {formatAngleText(geometry.angleDeg)}
        </text>
      )}
    </g>
  );
}

export default function DimensionRenderer({ entities, allEntities, hoveredId, selectedIds }) {
  const dimensionEntities = entities.filter(
    (entity) =>
      entity.visible !== false &&
      (entity.type === 'dimension' || entity.type === 'angle-dimension') &&
      hasValidSourceRefs(entity, allEntities),
  );

  return (
    <g className="sketchStudioDimensionLayer">
      {dimensionEntities.map((entity) => {
        const className = [
          'sketchStudioDimension',
          entity.meta?.lineStyle === 'broken' ? 'is-broken-line' : '',
          selectedIds.includes(entity.id) ? 'is-selected' : '',
          hoveredId === entity.id ? 'is-hovered' : '',
        ]
          .filter(Boolean)
          .join(' ');

        if (entity.type === 'angle-dimension') {
          return renderAngleDimension(entity, allEntities, className);
        }

        return renderLinearDimension(entity, allEntities, className);
      })}
    </g>
  );
}
