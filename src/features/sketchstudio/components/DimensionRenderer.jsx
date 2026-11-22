import { memo, useMemo } from 'react';
import { formatDimensionText, getDimensionGeometry, measureDistance } from '../utils/dimensionUtils';
import { getAngleDimensionGeometry, formatAngleText } from '../utils/angleUtils';
import { buildEntityIdLookup, resolveAngleDimensionPoints, resolveLinearDimensionPoints } from '../utils/entityUtils';

// Every slot is checked, nulls included (a null slot is simply not a broken
// reference): the slots are positional and are never filtered.
function hasValidSourceRefs(entity, entityById) {
  const sourceRefs = entity.meta?.sourceRefs ?? [];
  if (sourceRefs.length === 0) return true;
  return sourceRefs.every((ref) => {
    if (!ref?.entityId) return true;
    return entityById.has(ref.entityId);
  });
}

function renderLinearDimension(entity, allEntities, className, entityById) {
  const { p1, p2 } = resolveLinearDimensionPoints(entity, allEntities, entityById);
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

function renderAngleDimension(entity, allEntities, className, entityById) {
  const { vertex, p1, p2 } = resolveAngleDimensionPoints(entity, allEntities, entityById);
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

// One dimension, memoised like EntityRenderer's shapes: a hover or selection
// change re-renders only the dimensions whose state changed.
const DimensionShape = memo(function DimensionShape({ entity, allEntities, entityById, isSelected, isHovered }) {
  const className = [
    'sketchStudioDimension',
    entity.meta?.lineStyle === 'broken' ? 'is-broken-line' : '',
    isSelected ? 'is-selected' : '',
    isHovered ? 'is-hovered' : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (entity.type === 'angle-dimension') {
    return renderAngleDimension(entity, allEntities, className, entityById);
  }

  return renderLinearDimension(entity, allEntities, className, entityById);
});

function DimensionRenderer({ entities, allEntities, hoveredId, selectedIds }) {
  const selectedIdSet = useMemo(() => (selectedIds instanceof Set ? selectedIds : new Set(selectedIds)), [selectedIds]);
  // Source references resolve through one id lookup per document instead of a
  // scan of every entity per reference.
  const entityById = useMemo(() => buildEntityIdLookup(allEntities), [allEntities]);
  const dimensionEntities = useMemo(
    () =>
      entities.filter(
        (entity) =>
          entity.visible !== false &&
          (entity.type === 'dimension' || entity.type === 'angle-dimension') &&
          hasValidSourceRefs(entity, entityById),
      ),
    [entities, entityById],
  );

  return (
    <g className="sketchStudioDimensionLayer">
      {dimensionEntities.map((entity) => (
        <DimensionShape
          key={entity.id}
          entity={entity}
          allEntities={allEntities}
          entityById={entityById}
          isSelected={selectedIdSet.has(entity.id)}
          isHovered={hoveredId === entity.id}
        />
      ))}
    </g>
  );
}

export default memo(DimensionRenderer);
