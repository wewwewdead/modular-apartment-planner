import { memo, useMemo } from 'react';
import { getWallRenderData } from '@/geometry/wallColumnGeometry';
import { wallDirection, wallLength, wallOutline } from '@/geometry/wallGeometry';
import { add, perpendicular, scale } from '@/geometry/point';
import { DRAWING_GRAPHICS, PRESENTATION_GRAPHICS } from '@/sheets/standards';
import { wallOutboardOffset } from '@/domain/wallFit';
import {
  WALL_TIERS,
  cachedWallTierRegions,
  hasCachedWallTierRegions,
  regionsToPath,
  wallTier,
} from '@/geometry/planPresentationGeometry';
import { isPresentationStyle, usePlanDragActive, usePlanStyle } from './PlanStyleContext';
import {
  WALL_BOARD_MATERIALS,
  deriveWallAssemblyLayers,
  deriveWallFramingLayout,
  resolveWallAssembly,
  wallAssemblyCoreDepth,
} from '@/domain/wallAssemblies';
import { wallFinishHex } from '@/domain/wallFinishes';

const BOARD_COLORS = {
  [WALL_BOARD_MATERIALS.FIBER_CEMENT]: '#d8d6cf',
  [WALL_BOARD_MATERIALS.PLYWOOD]: '#c9975d',
  [WALL_BOARD_MATERIALS.RAINSCREEN]: '#c08a63',
  // Every siding face carries a finish, so this is only ever a fallback.
  [WALL_BOARD_MATERIALS.SIDING]: '#9b6a45',
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
const EMPTY_COLUMNS = Object.freeze([]);
const EMPTY_OPENINGS = Object.freeze([]);

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

/**
 * The drawn axis of a wall built off it, as a hidden-weight dashed line. Kept in
 * both styles: it is meaning, not decoration.
 */
function DrawnAxisLine({ wall, renderData }) {
  return (
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
  );
}

/*
 * Each wall is drawn by its own memoised item, so an edit redraws only the walls
 * it touched (a door moved, a column a wall dies into, the wall itself). The
 * item is told it can skip by three things, and they cover everything it reads:
 * the wall object, its openings array, and the render data resolved against the
 * columns — which is recomputed for every wall on every render, exactly as
 * before, but compared by VALUE, because it is a new object every time.
 */

function samePoint(a, b) {
  return a === b || (Boolean(a) && Boolean(b) && a.x === b.x && a.y === b.y);
}

function samePoints(a, b) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (!samePoint(a[index], b[index])) return false;
  }
  return true;
}

// Every resolved axis is the wall with new end points and its attachments kept
// or dropped (a column that has gone), so with the same wall object these are
// the only fields that can differ.
function sameAxis(a, b) {
  return (
    a === b ||
    (samePoint(a.start, b.start) &&
      samePoint(a.end, b.end) &&
      !a.startAttachment === !b.startAttachment &&
      !a.endAttachment === !b.endAttachment)
  );
}

function sameRenderData(a, b) {
  return (
    a === b ||
    (samePoints(a.outline, b.outline) &&
      sameAxis(a.wall, b.wall) &&
      sameAxis(a.bodyWall, b.bodyWall) &&
      sameAxis(a.renderWall, b.renderWall))
  );
}

/**
 * The doors and windows on each wall, grouped once per doors / windows arrays
 * rather than filtered out of both arrays once per wall.
 */
function groupOpeningSources(doors, windows) {
  const byWall = new Map();
  const sourcesFor = (wallId) => {
    let sources = byWall.get(wallId);
    if (!sources) {
      sources = { doors: [], windows: [] };
      byWall.set(wallId, sources);
    }
    return sources;
  };
  for (const door of doors) sourcesFor(door.wallId).doors.push(door);
  for (const windowItem of windows) sourcesFor(windowItem.wallId).windows.push(windowItem);
  return byWall;
}

function sameItems(a, b) {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

// Keyed on the wall object: a wall whose doors and windows are the very same
// objects as last time gets the very same openings array back, which is what
// lets its item skip when a door on some other wall moves.
const openingsCache = new WeakMap();

function wallOpenings(wall, sources) {
  if (!sources) return EMPTY_OPENINGS;
  const cached = openingsCache.get(wall);
  if (cached && sameItems(cached.doors, sources.doors) && sameItems(cached.windows, sources.windows)) {
    return cached.openings;
  }
  const openings = [
    ...sources.doors.map((door) => ({ ...door, openingKind: 'door' })),
    ...sources.windows.map((windowItem) => ({ ...windowItem, openingKind: 'window' })),
  ];
  openingsCache.set(wall, { doors: sources.doors, windows: sources.windows, openings });
  return openings;
}

// The stud layout, kept per wall while its body line and openings stand still.
// Shared by every renderer drawing the same wall — the canvas, each sheet
// viewport and the hidden PDF root.
const framingLayoutCache = new WeakMap();

function cachedFramingLayout(wall, bodyWall, openings) {
  const cached = framingLayoutCache.get(wall);
  if (cached && cached.openings === openings && sameAxis(cached.bodyWall, bodyWall)) return cached.layout;
  const layout = deriveWallFramingLayout(bodyWall, openings);
  framingLayoutCache.set(wall, { bodyWall, openings, layout });
  return layout;
}

function tierPaint(tier) {
  const g = PRESENTATION_GRAPHICS.plan;
  return tier === WALL_TIERS.SOLID
    ? { fill: g.wallSolidFill, stroke: g.wallSolidStroke, strokeWidth: g.wallSolidStrokeWidth }
    : { fill: g.wallPartitionFill, stroke: g.wallPartitionStroke, strokeWidth: g.wallPartitionStrokeWidth };
}

/**
 * Presentation walls: each tier drawn once, as one unioned outline, so corners
 * and tees have no seams — partitions first, solid last so structure wins where
 * they meet. The per-wall polygons stay in the markup, invisible, carrying the
 * `data-id` / `data-type` hooks scripts and tests read; hit-testing is
 * geometric and never needed them painted.
 *
 * While a drag is rewriting the walls the union is not recomputed per frame:
 * if the arrays on screen are not the ones last unioned, every wall is drawn
 * on its own with the tier colours, which costs exactly what drafting costs.
 * The next settled render puts the union back.
 */
const PresentationWallItem = memo(
  function PresentationWallItem({ wall, renderData, painted }) {
    const points = renderData.outline.map((p) => `${p.x},${p.y}`).join(' ');
    const assembly = resolveWallAssembly(wall);
    const tier = wallTier(wall);
    const paint = painted ? tierPaint(tier) : null;
    return (
      <g data-wall-system={assembly.system} data-wall-preset={assembly.preset} data-wall-tier={tier}>
        <polygon
          data-id={wall.id}
          data-type="wall"
          points={points}
          fill={paint ? paint.fill : 'none'}
          stroke={paint ? paint.stroke : 'none'}
          strokeWidth={paint ? paint.strokeWidth : undefined}
          vectorEffect={paint ? 'non-scaling-stroke' : undefined}
          pointerEvents="none"
        />
      </g>
    );
  },
  (prev, next) =>
    prev.wall === next.wall &&
    prev.painted === next.painted &&
    samePoints(prev.renderData.outline, next.renderData.outline),
);

function PresentationWalls({ walls, columns }) {
  const dragging = usePlanDragActive();
  const unionReady = !dragging || hasCachedWallTierRegions(walls, columns);
  const regions = unionReady ? cachedWallTierRegions(walls, columns) : null;
  const renderData = walls.map((wall) => getWallRenderData(wall, columns || []));

  return (
    <g className="walls" data-wall-render={regions ? 'union' : 'per-wall'}>
      {walls.map((wall, index) => (
        <PresentationWallItem key={wall.id} wall={wall} renderData={renderData[index]} painted={!regions} />
      ))}
      {regions ? (
        <>
          <path
            data-type="wall-union"
            data-wall-tier={WALL_TIERS.PARTITION}
            d={regionsToPath(regions.partition)}
            fillRule="evenodd"
            strokeLinejoin="miter"
            {...tierPaint(WALL_TIERS.PARTITION)}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
          <path
            data-type="wall-union"
            data-wall-tier={WALL_TIERS.SOLID}
            d={regionsToPath(regions.solid)}
            fillRule="evenodd"
            strokeLinejoin="miter"
            {...tierPaint(WALL_TIERS.SOLID)}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        </>
      ) : null}
      {walls.map((wall, index) => {
        if (!wallOutboardOffset(wall)) return null;
        return <DrawnAxisLine key={`${wall.id}:axis`} wall={wall} renderData={renderData[index]} />;
      })}
    </g>
  );
}

const DraftingWallItem = memo(
  function DraftingWallItem({ wall, renderData, openings }) {
    const outline = renderData.outline;
    const renderWall = renderData.renderWall;
    const points = outline.map((p) => `${p.x},${p.y}`).join(' ');
    const assembly = resolveWallAssembly(wall);
    // The overhang setbacks are clamped against the wall's own run, so the
    // skin is derived with that run in hand — the core never sees it.
    const layers = assembly.system === 'framed' ? deriveWallAssemblyLayers(assembly, wallLength(wall)) : [];
    const outboardOffset = wallOutboardOffset(wall);
    // Studs are laid out along the wall's own axis, so they go on the line
    // the body is built on — untrimmed, because the layout starts at the
    // wall's start and not at the first column face. `bodyWall` is that
    // line, and it is the drawn axis itself for a wall nobody has offset.
    const framingLayout = cachedFramingLayout(wall, renderData.bodyWall, openings);
    return (
      <g data-wall-system={assembly.system} data-wall-preset={assembly.preset}>
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
                  data-finish-kind={layer.finish?.kind || 'stock'}
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
                  // A finished face is drawn in its own colour; a stock one
                  // keeps the board tint it always had.
                  fill={wallFinishHex(layer) || BOARD_COLORS[layer.material] || '#e5e7eb'}
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
  },
  (prev, next) =>
    prev.wall === next.wall && prev.openings === next.openings && sameRenderData(prev.renderData, next.renderData),
);

function WallRenderer({ walls, columns, doors = [], windows = [] }) {
  const style = usePlanStyle();
  const openingSources = useMemo(() => groupOpeningSources(doors, windows), [doors, windows]);
  if (isPresentationStyle(style)) return <PresentationWalls walls={walls} columns={columns || EMPTY_COLUMNS} />;

  return (
    <g className="walls">
      {walls.map((wall) => (
        <DraftingWallItem
          key={wall.id}
          wall={wall}
          renderData={getWallRenderData(wall, columns || EMPTY_COLUMNS)}
          openings={wallOpenings(wall, openingSources.get(wall.id))}
        />
      ))}
    </g>
  );
}

export default memo(WallRenderer);
