import { memo } from 'react';
import { getWallRenderData } from '@/geometry/wallColumnGeometry';
import { wallDirection, wallLength, wallOutline } from '@/geometry/wallGeometry';
import { add, perpendicular, scale } from '@/geometry/point';
import { DRAWING_GRAPHICS } from '@/sheets/standards';
import { wallOutboardOffset } from '@/domain/wallFit';
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
  [WALL_BOARD_MATERIALS.RAINSCREEN]: '#c08a63',
};

/**
 * The rectangle a layer of the wall occupies in plan, shifted off the centreline
 * by `offset` and — for a board layer told to lap a corner — run on past the end
 * of the wall by `overhangStart` / `overhangEnd`.
 *
 * A wall nobody has given an overhang takes the same three lines it always did:
 * this is drawn for every wall on every frame, and the corner detail is the
 * exception rather than the rule.
 */
function shiftedOutline(wall, offset, thickness, overhangStart = 0, overhangEnd = 0) {
  const direction = wallDirection(wall);
  const normal = perpendicular(direction);
  const delta = scale(normal, offset);
  const start = add(wall.start, delta);
  const end = add(wall.end, delta);
  return wallOutline({
    start: overhangStart ? add(start, scale(direction, -overhangStart)) : start,
    end: overhangEnd ? add(end, scale(direction, overhangEnd)) : end,
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
        // The overhang setbacks are clamped against the wall's own run, so the
        // skin is derived with that run in hand — the core never sees it.
        const layers = assembly.system === 'framed' ? deriveWallAssemblyLayers(assembly, wallLength(wall)) : [];
        const openings = [
          ...doors.filter((door) => door.wallId === wall.id).map((door) => ({ ...door, openingKind: 'door' })),
          ...windows
            .filter((windowItem) => windowItem.wallId === wall.id)
            .map((windowItem) => ({ ...windowItem, openingKind: 'window' })),
        ];
        const outboardOffset = wallOutboardOffset(wall);
        // Studs are laid out along the wall's own axis, so they go on the line
        // the body is built on — untrimmed, because the layout starts at the
        // wall's start and not at the first column face. `bodyWall` is that
        // line, and it is the drawn axis itself for a wall nobody has offset.
        const framingLayout = deriveWallFramingLayout(renderData.bodyWall, openings);
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
                      data-overhang-start={layer.overhangStart || 0}
                      data-overhang-end={layer.overhangEnd || 0}
                      points={shiftedOutline(
                        renderWall,
                        layer.centerOffset,
                        layer.buildUp,
                        layer.overhangStart,
                        layer.overhangEnd,
                      )
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
            {/* A wall built off the line it was drawn on has to say so, or the
                plan quietly disagrees with the grid it was dimensioned to. The
                axis goes back as a hidden-weight dashed line — the drafting
                convention for something that is there but not in section. */}
            {outboardOffset ? (
              <line
                data-type="wall-drawn-axis"
                data-wall-id={wall.id}
                x1={renderData.wall.start.x}
                y1={renderData.wall.start.y}
                x2={renderData.wall.end.x}
                y2={renderData.wall.end.y}
                stroke={DRAWING_GRAPHICS.plan.hiddenStroke}
                strokeWidth={DRAWING_GRAPHICS.plan.hiddenStrokeWidth}
                strokeDasharray={DRAWING_GRAPHICS.plan.hiddenDash}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            ) : null}
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
