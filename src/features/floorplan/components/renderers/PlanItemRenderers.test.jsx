/* @vitest-environment jsdom */
/**
 * Per-item plan renderers (perf pass 3, D2.1). Each wall, door, window, fixture,
 * column, room and stair is drawn by its own memoised item, so an edit redraws
 * the items it touched rather than every item on the floor.
 *
 * Two things are pinned here:
 *   - the markup is the markup the old renderers drew — the old WallRenderer
 *     is kept below, verbatim, as the oracle — and an item that skipped a
 *     render leaves exactly the DOM a fresh render of the new props would;
 *   - the win: moving one door re-renders one wall item, not all of them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { cleanup, render } from '@testing-library/react';
import { getWallRenderData } from '@/geometry/wallColumnGeometry';
import { wallDirection, wallLength, wallOutline } from '@/geometry/wallGeometry';
import * as wallGeometry from '@/geometry/wallGeometry';
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
import * as wallAssemblies from '@/domain/wallAssemblies';
import {
  WALL_BOARD_MATERIALS,
  deriveWallAssemblyLayers,
  deriveWallFramingLayout,
  resolveWallAssembly,
  wallAssemblyCoreDepth,
} from '@/domain/wallAssemblies';
import { wallFinishHex } from '@/domain/wallFinishes';
import * as fixtureGeometry from '@/geometry/fixtureGeometry';
import * as columnGeometry from '@/geometry/columnGeometry';
import * as stairGeometry from '@/geometry/stairGeometry';
import * as roomZones from '@/domain/roomZones';
import { CanvasZoomProvider } from './CanvasZoomContext';
import ColumnRenderer from './ColumnRenderer';
import DoorRenderer from './DoorRenderer';
import FixtureRenderer from './FixtureRenderer';
import FloorPlanLayer from './FloorPlanLayer';
import {
  PLAN_STYLES,
  PlanStyleProvider,
  isPresentationStyle,
  usePlanDragActive,
  usePlanStyle,
} from './PlanStyleContext';
import RoomRenderer from './RoomRenderer';
import StairRenderer from './StairRenderer';
import WallRenderer from './WallRenderer';
import WindowRenderer from './WindowRenderer';
import { playgroundFloors, richFloor } from './planItemScenarios.testSupport';

// Each spy wraps the real function: the drawings are real, only the calls are
// counted. Every one of them is called exactly once per item render.
vi.mock('@/domain/wallAssemblies', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    resolveWallAssembly: vi.fn(actual.resolveWallAssembly),
    deriveWallFramingLayout: vi.fn(actual.deriveWallFramingLayout),
  };
});
vi.mock('@/geometry/wallGeometry', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    doorOutlineOnWall: vi.fn(actual.doorOutlineOnWall),
    windowOutlineOnWall: vi.fn(actual.windowOutlineOnWall),
  };
});
vi.mock('@/geometry/fixtureGeometry', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, fixtureOutline: vi.fn(actual.fixtureOutline) };
});
vi.mock('@/geometry/columnGeometry', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, columnOutline: vi.fn(actual.columnOutline) };
});
vi.mock('@/geometry/stairGeometry', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getStairRenderData: vi.fn(actual.getStairRenderData) };
});
vi.mock('@/domain/roomZones', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, resolveRoomZone: vi.fn(actual.resolveRoomZone) };
});

afterEach(cleanup);

// ---------------------------------------------------------------------------
// The oracle: WallRenderer as it stood before D2.1, verbatim but for the names.
// ---------------------------------------------------------------------------

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
function OldPresentationWalls({ walls, columns }) {
  const dragging = usePlanDragActive();
  const unionReady = !dragging || hasCachedWallTierRegions(walls, columns);
  const regions = unionReady ? cachedWallTierRegions(walls, columns) : null;

  return (
    <g className="walls" data-wall-render={regions ? 'union' : 'per-wall'}>
      {walls.map((wall) => {
        const renderData = getWallRenderData(wall, columns || []);
        const points = renderData.outline.map((p) => `${p.x},${p.y}`).join(' ');
        const assembly = resolveWallAssembly(wall);
        const tier = wallTier(wall);
        const paint = regions ? null : tierPaint(tier);
        return (
          <g key={wall.id} data-wall-system={assembly.system} data-wall-preset={assembly.preset} data-wall-tier={tier}>
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
      })}
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
      {walls.map((wall) => {
        if (!wallOutboardOffset(wall)) return null;
        return (
          <DrawnAxisLine key={`${wall.id}:axis`} wall={wall} renderData={getWallRenderData(wall, columns || [])} />
        );
      })}
    </g>
  );
}

function OldWallRenderer({ walls, columns, doors = [], windows = [] }) {
  const style = usePlanStyle();
  if (isPresentationStyle(style)) return <OldPresentationWalls walls={walls} columns={columns || EMPTY_COLUMNS} />;

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
      })}
    </g>
  );
}

// ---------------------------------------------------------------------------

const EMPTY = Object.freeze([]);

function styled(node, { style = 'drafting', dragging = false, zoom = null } = {}) {
  const inner =
    style === 'presentation' ? (
      <PlanStyleProvider value={PLAN_STYLES.PRESENTATION} dragging={dragging}>
        {node}
      </PlanStyleProvider>
    ) : (
      node
    );
  return <svg>{zoom ? <CanvasZoomProvider value={zoom}>{inner}</CanvasZoomProvider> : inner}</svg>;
}

function wallProps(floor) {
  return {
    walls: floor.walls,
    columns: floor.columns || EMPTY,
    doors: floor.doors || EMPTY,
    windows: floor.windows || EMPTY,
  };
}

const STYLES = [
  { name: 'drafting', options: {} },
  { name: 'presentation', options: { style: 'presentation', zoom: 0.1 } },
  { name: 'presentation mid-drag', options: { style: 'presentation', dragging: true, zoom: 0.2 }, freshWalls: true },
];

function allFloors() {
  return [['rich', richFloor()], ...playgroundFloors().map((floor, index) => [`playground ${index}`, floor])];
}

describe('WallRenderer items draw what the old renderer drew', () => {
  for (const { name: styleName, options, freshWalls } of STYLES) {
    it(`static markup is identical — ${styleName}`, () => {
      for (const [, floor] of allFloors()) {
        const props = wallProps(freshWalls ? { ...floor, walls: floor.walls.map((wall) => ({ ...wall })) } : floor);
        const before = renderToStaticMarkup(styled(<OldWallRenderer {...props} />, options));
        const after = renderToStaticMarkup(styled(<WallRenderer {...props} />, options));
        expect(after).toBe(before);
      }
    });
  }

  it('is identical with doors and windows left out, as the clipboard preview passes them', () => {
    const floor = richFloor();
    const before = renderToStaticMarkup(styled(<OldWallRenderer walls={floor.walls} columns={floor.columns} />));
    const after = renderToStaticMarkup(styled(<WallRenderer walls={floor.walls} columns={floor.columns} />));
    expect(after).toBe(before);
  });
});

/*
 * The edits a person makes, in order, each applied the way the reducer applies
 * them: the edited entity and its array are new objects, everything else keeps
 * its identity.
 */
function replaceById(list, id, update) {
  return list.map((item) => (item.id === id ? update(item) : item));
}

const EDITS = [
  [
    'move a door along its wall',
    (f) => ({ ...f, doors: replaceById(f.doors, 'd_swing', (d) => ({ ...d, offset: d.offset + 400 })) }),
  ],
  [
    'move a door to another wall',
    (f) => ({ ...f, doors: replaceById(f.doors, 'd_swing', (d) => ({ ...d, wallId: 'w_mixed', offset: 4000 })) }),
  ],
  [
    'change a window type',
    (f) => ({ ...f, windows: replaceById(f.windows, 'n_case', (n) => ({ ...n, type: 'fixed' })) }),
  ],
  [
    'move the column a partition dies into',
    (f) => ({ ...f, columns: replaceById(f.columns, 'c3', (c) => ({ ...c, y: c.y + 250 })) }),
  ],
  [
    'move a corner column',
    (f) => ({ ...f, columns: replaceById(f.columns, 'c1', (c) => ({ ...c, x: c.x - 120, y: c.y + 60 })) }),
  ],
  // The two that move a wall's trimmed ends and nothing else: a wall held at a
  // column's centre keeps its axis while the face it is cut back to moves.
  [
    'rotate the column a wall is held at',
    (f) => ({ ...f, columns: replaceById(f.columns, 'c2', (c) => ({ ...c, rotation: 30 })) }),
  ],
  [
    'enlarge the column a partition dies into',
    (f) => ({ ...f, columns: replaceById(f.columns, 'c3', (c) => ({ ...c, width: 600, depth: 600 })) }),
  ],
  ['delete a column a wall is attached to', (f) => ({ ...f, columns: f.columns.filter((c) => c.id !== 'c2') })],
  [
    'move a framed wall',
    (f) => ({ ...f, walls: replaceById(f.walls, 'w_fc', (w) => ({ ...w, end: { x: w.end.x + 300, y: w.end.y } })) }),
  ],
  [
    're-offset an outboard wall',
    (f) => ({ ...f, walls: replaceById(f.walls, 'w_outboard', (w) => ({ ...w, outboardOffset: -200 })) }),
  ],
  [
    'add a door to a wall that had none',
    (f) => ({ ...f, doors: [...f.doors, { ...f.doors[0], id: 'd_new', wallId: 'w_siding', offset: 4500 }] }),
  ],
  ['remove every window', (f) => ({ ...f, windows: [] })],
  [
    'hand back fresh arrays of the same objects',
    (f) => ({ ...f, walls: [...f.walls], doors: [...f.doors], columns: [...f.columns] }),
  ],
  [
    'resize a fixture',
    (f) => ({ ...f, fixtures: replaceById(f.fixtures, 'f_bed', (x) => ({ ...x, width: x.width + 200 })) }),
  ],
  [
    'move a stair',
    (f) => ({ ...f, stairs: replaceById(f.stairs, 's_up', (s) => ({ ...s, startPoint: { x: 7200, y: 7100 } })) }),
  ],
  [
    'reshape a room',
    (f) => ({
      ...f,
      rooms: replaceById(f.rooms, 'r_bed', (r) => ({ ...r, points: r.points.map((p) => ({ x: p.x + 10, y: p.y })) })),
    }),
  ],
];

describe('an item that skips leaves the DOM a fresh render would draw', () => {
  for (const { name: styleName, options } of STYLES.slice(0, 2)) {
    it(`walls against the oracle, edit by edit — ${styleName}`, () => {
      let floor = richFloor();
      const live = render(styled(<WallRenderer {...wallProps(floor)} />, options));
      for (const [, edit] of EDITS) {
        floor = edit(floor);
        live.rerender(styled(<WallRenderer {...wallProps(floor)} />, options));
        const fresh = render(styled(<OldWallRenderer {...wallProps(floor)} />, options));
        expect(live.container.innerHTML).toBe(fresh.container.innerHTML);
        fresh.unmount();
      }
    });

    it(`the whole plan layer, edit by edit — ${styleName}`, () => {
      let floor = richFloor();
      let selectedId = 'r_bed';
      const layer = () => <FloorPlanLayer floor={floor} filteredFloor={floor} selectedId={selectedId} />;
      const live = render(styled(layer(), options));
      for (const [, edit] of [...EDITS, ['select another room', (f) => ((selectedId = 'r_kitchen'), f)]]) {
        floor = edit(floor);
        live.rerender(styled(layer(), options));
        const fresh = render(styled(layer(), options));
        expect(live.container.innerHTML).toBe(fresh.container.innerHTML);
        fresh.unmount();
      }
    });
  }

  it('switching the style redraws every item', () => {
    const floor = richFloor();
    const plan = <FloorPlanLayer floor={floor} filteredFloor={floor} selectedId={null} />;
    const live = render(styled(plan));
    for (const options of [
      { style: 'presentation', zoom: 0.1 },
      { style: 'presentation', dragging: true, zoom: 0.1 },
      {},
    ]) {
      live.rerender(styled(plan, options));
      const fresh = render(styled(plan, options));
      expect(live.container.innerHTML).toBe(fresh.container.innerHTML);
      fresh.unmount();
    }
  });
});

describe('an edit redraws only the items it touched', () => {
  const spies = {
    wallItems: () => wallAssemblies.resolveWallAssembly,
    framing: () => wallAssemblies.deriveWallFramingLayout,
    doors: () => wallGeometry.doorOutlineOnWall,
    windows: () => wallGeometry.windowOutlineOnWall,
    fixtures: () => fixtureGeometry.fixtureOutline,
    columns: () => columnGeometry.columnOutline,
    stairs: () => stairGeometry.getStairRenderData,
    rooms: () => roomZones.resolveRoomZone,
  };
  const calls = (name) => spies[name]().mock.calls.length;
  beforeEach(() => {
    for (const spy of Object.values(spies)) spy().mockClear();
  });

  /** Calls made by one rerender of `Component` from `floor` to `edit(floor)`. */
  function countRerender(Component, propsOf, floor, edit, name, options = {}) {
    const view = render(styled(<Component {...propsOf(floor)} />, options));
    spies[name]().mockClear();
    view.rerender(styled(<Component {...propsOf(edit(floor))} />, options));
    const count = calls(name);
    view.unmount();
    return count;
  }

  const edit = (label) => EDITS.find(([name]) => name === label)[1];

  it('moving one door re-renders one wall item, not all of them', () => {
    const floor = richFloor();
    const move = edit('move a door along its wall');
    const before = countRerender(OldWallRenderer, wallProps, floor, move, 'wallItems');
    const after = countRerender(WallRenderer, wallProps, floor, move, 'wallItems');
    expect(before).toBe(floor.walls.length);
    expect(after).toBe(1);
  });

  it('a door moved between walls redraws the two walls and lays out studs for those two only', () => {
    const floor = richFloor();
    const move = edit('move a door to another wall');
    expect(countRerender(WallRenderer, wallProps, floor, move, 'wallItems')).toBe(2);
    expect(countRerender(WallRenderer, wallProps, floor, move, 'framing')).toBe(2);
    const framed = floor.walls.filter((wall) => resolveWallAssembly(wall).system === 'framed').length;
    expect(countRerender(OldWallRenderer, wallProps, floor, move, 'framing')).toBe(floor.walls.length);
    expect(framed).toBeGreaterThan(2);
  });

  it('moving a column redraws the walls it trims or holds, and no other', () => {
    const floor = richFloor();
    // c3 holds the end of the partition and of nothing else.
    expect(
      countRerender(WallRenderer, wallProps, floor, edit('move the column a partition dies into'), 'wallItems'),
    ).toBe(1);
    // c1 holds the masonry wall and trims the outboard wall's body.
    const corner = countRerender(WallRenderer, wallProps, floor, edit('move a corner column'), 'wallItems');
    expect(corner).toBeGreaterThanOrEqual(1);
    expect(corner).toBeLessThan(floor.walls.length);
    // Turning c2 about its centre leaves the masonry wall's axis where it was
    // and moves only the face it is trimmed to: that wall, and only that wall.
    expect(
      countRerender(WallRenderer, wallProps, floor, edit('rotate the column a wall is held at'), 'wallItems'),
    ).toBe(1);
  });

  it('moving one wall redraws that wall only', () => {
    const floor = richFloor();
    expect(countRerender(WallRenderer, wallProps, floor, edit('move a framed wall'), 'wallItems')).toBe(1);
    expect(countRerender(OldWallRenderer, wallProps, floor, edit('move a framed wall'), 'wallItems')).toBe(
      floor.walls.length,
    );
  });

  it('a door edit never redraws a presentation wall', () => {
    const floor = richFloor();
    const options = { style: 'presentation', zoom: 0.1 };
    expect(
      countRerender(WallRenderer, wallProps, floor, edit('move a door along its wall'), 'wallItems', options),
    ).toBe(0);
  });

  it('doors, windows, fixtures, columns and stairs redraw only the one that changed', () => {
    const floor = richFloor();
    const doorProps = (f) => ({ doors: f.doors, walls: f.walls });
    const windowProps = (f) => ({ windows: f.windows, walls: f.walls });
    expect(countRerender(DoorRenderer, doorProps, floor, edit('move a door along its wall'), 'doors')).toBe(1);
    expect(countRerender(WindowRenderer, windowProps, floor, edit('change a window type'), 'windows')).toBe(1);
    // A moved wall redraws the openings it hosts, and only those.
    const hosted = floor.doors.filter((door) => door.wallId === 'w_fc').length;
    expect(countRerender(DoorRenderer, doorProps, floor, edit('move a framed wall'), 'doors')).toBe(hosted);
    expect(
      countRerender(FixtureRenderer, (f) => ({ fixtures: f.fixtures }), floor, edit('resize a fixture'), 'fixtures'),
    ).toBe(1);
    expect(
      countRerender(ColumnRenderer, (f) => ({ columns: f.columns }), floor, edit('move a corner column'), 'columns'),
    ).toBe(1);
    expect(
      countRerender(StairRenderer, (f) => ({ stairs: f.stairs, floorId: f.id }), floor, edit('move a stair'), 'stairs'),
    ).toBe(1);
  });

  it('a selection change redraws the two rooms whose selection flipped', () => {
    const floor = richFloor();
    const options = { style: 'presentation', zoom: 0.1 };
    const view = render(styled(<RoomRenderer rooms={floor.rooms} selectedId="r_bed" />, options));
    spies.rooms().mockClear();
    view.rerender(styled(<RoomRenderer rooms={floor.rooms} selectedId="r_kitchen" />, options));
    expect(calls('rooms')).toBe(2);
  });

  it('keeps a wall’s openings array when its doors and windows did not change', () => {
    // Seen through the stud layout, which is cached on that array: a fresh
    // doors array holding the same door objects lays nothing out again.
    const floor = richFloor();
    const same = edit('hand back fresh arrays of the same objects');
    expect(countRerender(WallRenderer, wallProps, floor, same, 'framing')).toBe(0);
    expect(countRerender(WallRenderer, wallProps, floor, same, 'wallItems')).toBe(0);
  });
});
