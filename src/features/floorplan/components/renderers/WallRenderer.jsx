import { memo } from 'react';
import { getWallRenderData } from '@/geometry/wallColumnGeometry';
import { wallDirection, wallOutline } from '@/geometry/wallGeometry';
import { add, perpendicular, scale } from '@/geometry/point';
import { DRAWING_GRAPHICS } from '@/sheets/standards';
import {
  WALL_BOARD_MATERIALS,
  deriveWallAssemblyLayers,
  deriveWallFramingLayout,
  resolveWallAssembly,
  wallAssemblyCoreDepth,
} from '@/domain/wallAssemblies';

const BOARD_COLORS = {
  [WALL_BOARD_MATERIALS.FIBER_CEMENT]: '#d8d6cf',
  [WALL_BOARD_MATERIALS.PLYWOOD]: '#c9975d',
};

function shiftedOutline(wall, offset, thickness) {
  const normal = perpendicular(wallDirection(wall));
  const delta = scale(normal, offset);
  return wallOutline({
    start: add(wall.start, delta),
    end: add(wall.end, delta),
    thickness,
  });
}

function WallRenderer({ walls, columns, doors = [], windows = [] }) {
  return (
    <g className="walls">
      {walls.map((wall) => {
        const renderData = getWallRenderData(wall, columns || []);
        const outline = renderData.outline;
        const renderWall = renderData.renderWall;
        const points = outline.map((p) => `${p.x},${p.y}`).join(' ');
        const assembly = resolveWallAssembly(wall);
        const layers = assembly.system === 'framed' ? deriveWallAssemblyLayers(assembly) : [];
        const openings = [
          ...doors.filter((door) => door.wallId === wall.id).map((door) => ({ ...door, openingKind: 'door' })),
          ...windows
            .filter((windowItem) => windowItem.wallId === wall.id)
            .map((windowItem) => ({ ...windowItem, openingKind: 'window' })),
        ];
        const framingLayout = deriveWallFramingLayout(wall, openings);
        return (
          <g key={wall.id} data-wall-system={assembly.system} data-wall-preset={assembly.preset}>
            {assembly.system === 'framed' ? (
              <>
                <polygon
                  data-type="wall-framing-core"
                  data-wall-id={wall.id}
                  points={shiftedOutline(renderWall, 0, wallAssemblyCoreDepth(assembly))
                    .map((point) => `${point.x},${point.y}`)
                    .join(' ')}
                  fill={assembly.framing.material === 'timber' ? '#d8b080' : '#d1d5db'}
                  stroke="#6b7280"
                  strokeWidth={0.75}
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                />
                {layers
                  .filter((layer) => layer.material !== WALL_BOARD_MATERIALS.NONE && layer.buildUp > 0)
                  .map((layer) => (
                    <polygon
                      key={`${wall.id}:${layer.side}`}
                      data-type="wall-board-skin"
                      data-wall-id={wall.id}
                      data-assembly-side={layer.side}
                      data-board-material={layer.material}
                      points={shiftedOutline(renderWall, layer.centerOffset, layer.buildUp)
                        .map((point) => `${point.x},${point.y}`)
                        .join(' ')}
                      fill={BOARD_COLORS[layer.material] || '#e5e7eb'}
                      stroke="#374151"
                      strokeWidth={0.75}
                      vectorEffect="non-scaling-stroke"
                      pointerEvents="none"
                    />
                  ))}
                <polygon
                  data-id={wall.id}
                  data-type="wall"
                  points={points}
                  fill="transparent"
                  stroke={DRAWING_GRAPHICS.plan.cutStroke}
                  strokeWidth={DRAWING_GRAPHICS.plan.cutStrokeWidth}
                  vectorEffect="non-scaling-stroke"
                />
              </>
            ) : (
              <polygon
                data-id={wall.id}
                data-type="wall"
                points={points}
                fill={DRAWING_GRAPHICS.plan.cutFill}
                stroke={DRAWING_GRAPHICS.plan.cutStroke}
                strokeWidth={DRAWING_GRAPHICS.plan.cutStrokeWidth}
                vectorEffect="non-scaling-stroke"
              />
            )}
            {framingLayout.studs.map((stud) => (
              <polygon
                key={stud.id}
                data-type="wall-framing-stud"
                data-wall-id={wall.id}
                data-frame-index={stud.frameIndex}
                points={stud.outline.map((point) => `${point.x},${point.y}`).join(' ')}
                fill={assembly.framing.material === 'timber' ? '#b7793f' : '#9ca3af'}
                stroke="#374151"
                strokeWidth={0.75}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            ))}
          </g>
        );
      })}
    </g>
  );
}

export default memo(WallRenderer);
