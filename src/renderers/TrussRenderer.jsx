import { DRAWING_GRAPHICS } from '@/sheets/standards';
import { getWallRenderData } from '@/geometry/wallColumnGeometry';
import { getSlabRenderData } from '@/geometry/slabGeometry';
import { getBeamRenderData } from '@/geometry/beamGeometry';
import { buildFloorTrussGeometry } from '@/geometry/trussGeometry';

function FloorBackdrop({ floor }) {
  if (!floor) return null;

  return (
    <g className="truss-floor-backdrop" opacity={0.55}>
      {(floor.slabs || []).map((slab) => {
        const renderData = getSlabRenderData(slab);
        if (!renderData?.points) return null;
        return (
          <polygon
            key={slab.id}
            points={renderData.points}
            fill="#ffffff"
            stroke={DRAWING_GRAPHICS.plan.secondaryStroke}
            strokeWidth={0.8}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
      {(floor.walls || []).map((wall) => {
        const outline = getWallRenderData(wall, floor.columns || []).outline || [];
        if (!outline.length) return null;
        return (
          <polygon
            key={wall.id}
            points={outline.map((point) => `${point.x},${point.y}`).join(' ')}
            fill="#ffffff"
            stroke={DRAWING_GRAPHICS.plan.secondaryStroke}
            strokeWidth={0.85}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
      {(floor.beams || []).map((beam) => {
        const renderData = getBeamRenderData(beam, floor.columns || []);
        if (!renderData) return null;

        return (
          <polygon
            key={beam.id}
            points={renderData.outline.map((point) => `${point.x},${point.y}`).join(' ')}
            fill="#eef3f7"
            stroke={DRAWING_GRAPHICS.plan.secondaryStroke}
            strokeWidth={0.85}
            strokeDasharray="6 3"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </g>
  );
}

export default function TrussRenderer({
  floor = null,
  trussSystems = [],
  selectedId = null,
  selectedType = null,
}) {
  const floorGeometry = buildFloorTrussGeometry(trussSystems);

  return (
    <g className="truss-layout">
      <FloorBackdrop floor={floor} />
      {floorGeometry.systems.map((systemGeometry) => (
        <g key={systemGeometry.trussSystem.id}>
          {systemGeometry.instances.map((instanceGeometry) => {
            const isSelectedInstance = selectedType === 'trussInstance' && selectedId === instanceGeometry.instance.id;
            const isSelectedSystem = selectedType === 'trussSystem' && selectedId === systemGeometry.trussSystem.id;

            return (
              <g key={instanceGeometry.instance.id}>
                {(instanceGeometry.purlinRuns || []).map((run) => (
                  <polyline
                    key={run.id}
                    points={run.points.map((point) => `${point.x},${point.y}`).join(' ')}
                    fill="none"
                    stroke={(isSelectedInstance || isSelectedSystem)
                      ? 'var(--color-selection)'
                      : DRAWING_GRAPHICS.plan.secondaryStroke}
                    strokeWidth={(isSelectedInstance || isSelectedSystem) ? 1.1 : 0.8}
                    vectorEffect="non-scaling-stroke"
                    opacity={0.95}
                  />
                ))}
                {(instanceGeometry.purlinMarkers || []).map((marker) => (
                  <line
                    key={marker.id}
                    x1={marker.start.x}
                    y1={marker.start.y}
                    x2={marker.end.x}
                    y2={marker.end.y}
                    stroke={(isSelectedInstance || isSelectedSystem)
                      ? 'var(--color-selection)'
                      : DRAWING_GRAPHICS.plan.secondaryStroke}
                    strokeWidth={0.9}
                    vectorEffect="non-scaling-stroke"
                    opacity={0.9}
                  />
                ))}
                {instanceGeometry.copies.map((copy) => (
                  <line
                    key={copy.id}
                    x1={copy.overallStartPoint.x}
                    y1={copy.overallStartPoint.y}
                    x2={copy.overallEndPoint.x}
                    y2={copy.overallEndPoint.y}
                    stroke={isSelectedInstance ? 'var(--color-selection)' : DRAWING_GRAPHICS.plan.cutStroke}
                    strokeWidth={isSelectedInstance ? 1.8 : 1.15}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                <line
                  x1={instanceGeometry.layoutLineStartPoint.x}
                  y1={instanceGeometry.layoutLineStartPoint.y}
                  x2={instanceGeometry.layoutLineEndPoint.x}
                  y2={instanceGeometry.layoutLineEndPoint.y}
                  stroke={isSelectedSystem ? 'var(--color-selection)' : DRAWING_GRAPHICS.plan.secondaryStroke}
                  strokeWidth={isSelectedSystem ? 1.4 : 0.8}
                  strokeDasharray="8 4"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            );
          })}
        </g>
      ))}
    </g>
  );
}
