import { formatDimensionText, getDimensionGeometry, measureDistance } from '../utils/dimensionUtils';
import { resolveSourceReferenceFromEntities } from '../utils/entityUtils';

function hasValidSourceRefs(entity, allEntities) {
  const sourceRefs = entity.meta?.sourceRefs ?? [];
  if (sourceRefs.length === 0) return true;
  return sourceRefs.every((ref) => {
    if (!ref?.entityId) return true;
    return allEntities.some((e) => e.id === ref.entityId);
  });
}

export default function DimensionRenderer({ entities, allEntities, hoveredId, selectedIds }) {
  return (
    <g className="sketchStudioDimensionLayer">
      {entities
        .filter((entity) => entity.visible !== false)
        .filter((entity) => entity.type === 'dimension')
        .filter((entity) => hasValidSourceRefs(entity, allEntities))
        .map((entity) => {
          const sourceRefs = entity.meta?.sourceRefs ?? [];
          const p1 = resolveSourceReferenceFromEntities(allEntities, sourceRefs[0], entity.p1);
          const p2 = resolveSourceReferenceFromEntities(allEntities, sourceRefs[1], entity.p2);
          const geometry = getDimensionGeometry({
            p1,
            p2,
            subtype: entity.subtype,
            offset: entity.offset,
          });
          const className = [
            'sketchStudioDimension',
            entity.meta?.lineStyle === 'broken' ? 'is-broken-line' : '',
            selectedIds.includes(entity.id) ? 'is-selected' : '',
            hoveredId === entity.id ? 'is-hovered' : '',
          ].filter(Boolean).join(' ');
          const text = formatDimensionText(measureDistance(p1, p2, entity.subtype), entity.units);

          return (
            <g key={entity.id} className={className} pointerEvents="none">
              <line className="sketchStudioDimensionLine" {...geometry.ext1} vectorEffect="non-scaling-stroke" />
              <line className="sketchStudioDimensionLine" {...geometry.ext2} vectorEffect="non-scaling-stroke" />
              <line className="sketchStudioDimensionLine" {...geometry.dimLine} vectorEffect="non-scaling-stroke" />
              <line className="sketchStudioDimensionTick" {...geometry.tick1} vectorEffect="non-scaling-stroke" />
              <line className="sketchStudioDimensionTick" {...geometry.tick2} vectorEffect="non-scaling-stroke" />
              <text className="sketchStudioDimensionText" x={geometry.textPoint.x} y={geometry.textPoint.y} textAnchor="middle" dominantBaseline="middle" transform={`rotate(${geometry.textAngle} ${geometry.textPoint.x} ${geometry.textPoint.y})`}>
                {text}
              </text>
            </g>
          );
        })}
    </g>
  );
}
