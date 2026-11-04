import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createDoor, createFloor, createRoom, createWall, createWindow } from '@/domain/models';
import { buildElevationScene } from '@/elevations/scene';
import ElevationSceneLayer from './ElevationSceneLayer';
import { CanvasZoomProvider } from './CanvasZoomContext';
import { PLAN_STYLES, PlanStyleProvider } from './PlanStyleContext';
import BlueprintAnnotationLayer, { filledArrowheadPoints } from './BlueprintAnnotationLayer';
import FixtureRenderer from './FixtureRenderer';
import RoomRenderer from './RoomRenderer';
import StairRenderer, { stairDirectionLabel, uprightAngle } from './StairRenderer';
import WallRenderer from './WallRenderer';

function presentation(node, { dragging = false, zoom = null } = {}) {
  const tree = (
    <PlanStyleProvider value={PLAN_STYLES.PRESENTATION} dragging={dragging}>
      {node}
    </PlanStyleProvider>
  );
  return renderToStaticMarkup(<svg>{zoom ? <CanvasZoomProvider value={zoom}>{tree}</CanvasZoomProvider> : tree}</svg>);
}

function drafting(node) {
  return renderToStaticMarkup(<svg>{node}</svg>);
}

const square = [
  { x: 0, y: 0 },
  { x: 3000, y: 0 },
  { x: 3000, y: 3000 },
  { x: 0, y: 3000 },
];

describe('RoomRenderer by style', () => {
  it('tints a room by its zone and adds the wall-shadow band only in presentation', () => {
    const bedroom = createRoom('Bedroom', square);
    const html = presentation(<RoomRenderer rooms={[bedroom]} selectedId={null} />);
    expect(html).toContain('data-zone="private"');
    expect(html).toContain('fill="#f4dfbd"');
    expect(html).toContain('data-room-shadow');
    expect(html).toContain('<clipPath');
    expect(html).toContain('fill-rule="evenodd"');
  });

  it('draws drafting exactly as before: one flat fill, no zone, no clip, no shadow', () => {
    const bedroom = createRoom('Bedroom', square);
    const html = drafting(<RoomRenderer rooms={[bedroom]} selectedId={null} />);
    expect(html).not.toContain('data-zone');
    expect(html).not.toContain('data-room-shadow');
    expect(html).not.toContain('clipPath');
    expect(html).toContain('fill="#f6f8fa"');
  });

  it('lets a custom colour override the zone tint', () => {
    const custom = { ...createRoom('Bedroom', square), color: '#aa5500' };
    expect(presentation(<RoomRenderer rooms={[custom]} selectedId={null} />)).toContain('fill="#aa5500"');
  });
});

describe('WallRenderer in presentation', () => {
  const walls = [
    createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, 200),
    createWall({ x: 4000, y: 0 }, { x: 4000, y: 3000 }, 200),
    createWall({ x: 0, y: 1500 }, { x: 4000, y: 1500 }, 100),
  ];

  it('draws two unioned tier paths and keeps every per-wall hook', () => {
    const html = presentation(<WallRenderer walls={walls} columns={[]} doors={[]} windows={[]} />);
    expect(html.match(/data-type="wall-union"/g)).toHaveLength(2);
    expect(html).toContain('data-wall-tier="solid"');
    expect(html).toContain('data-wall-tier="partition"');
    expect(html.match(/data-type="wall"/g)).toHaveLength(3);
    for (const wall of walls) expect(html).toContain(`data-id="${wall.id}"`);
    expect(html).toContain('data-wall-system="masonry"');
  });

  it('never draws studs or board skins for a framed wall', () => {
    const framed = createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, 100, { assembly: { preset: 'fiber_cement' } });
    const html = presentation(<WallRenderer walls={[framed]} columns={[]} doors={[]} windows={[]} />);
    expect(html).not.toContain('wall-framing-stud');
    expect(html).not.toContain('wall-board-skin');
    expect(html).toContain('data-wall-system="framed"');
  });

  it('falls back to per-wall drawing mid-drag when the walls have not been unioned', () => {
    const fresh = walls.map((wall) => ({ ...wall }));
    const html = presentation(<WallRenderer walls={fresh} columns={[]} doors={[]} windows={[]} />, {
      dragging: true,
    });
    expect(html).not.toContain('data-type="wall-union"');
    expect(html).toContain('data-wall-render="per-wall"');
    expect(html.match(/data-type="wall"/g)).toHaveLength(3);
    expect(html).toContain('fill="#2b2f36"');
  });

  it('keeps a union it already has mid-drag (a door drag never moves the walls)', () => {
    // The reducer hands back the same arrays for an edit that does not touch
    // them, which is what the union is cached on.
    const columns = [];
    const settled = presentation(<WallRenderer walls={walls} columns={columns} doors={[]} windows={[]} />);
    expect(settled).toContain('data-type="wall-union"');
    const dragging = presentation(<WallRenderer walls={walls} columns={columns} doors={[]} windows={[]} />, {
      dragging: true,
    });
    expect(dragging).toContain('data-type="wall-union"');
  });

  it('leaves drafting with no union and no filters', () => {
    const html = drafting(<WallRenderer walls={walls} columns={[]} doors={[]} windows={[]} />);
    expect(html).not.toContain('wall-union');
    expect(html).not.toContain('filter');
  });
});

describe('StairRenderer labels', () => {
  const stair = {
    id: 'stair_1',
    startPoint: { x: 0, y: 0 },
    direction: 0,
    width: 1000,
    riserHeight: 175,
    treadDepth: 250,
    numberOfRisers: 16,
    floorRelation: { fromFloorId: 'f1', toFloorId: 'f2' },
  };

  it('reads UP from the floor a stair leaves and DN on the floor it lands on', () => {
    expect(stairDirectionLabel(stair, 'f1')).toBe('UP');
    expect(stairDirectionLabel(stair, 'f2')).toBe('DN');
    // A stair that records no floors, or is drawn elsewhere, reads UP.
    expect(stairDirectionLabel({ floorRelation: {} }, 'f1')).toBe('UP');
    expect(stairDirectionLabel(stair, 'f3')).toBe('UP');
    expect(stairDirectionLabel({ floorRelation: { fromFloorId: 'f2', toFloorId: 'f2' } }, 'f2')).toBe('UP');
  });

  it('draws the label and a filled head only in presentation', () => {
    const html = presentation(<StairRenderer stairs={[stair]} floorId="f2" />, { zoom: 0.1 });
    expect(html).toContain('data-stair-label');
    expect(html).toContain('>DN</text>');
    expect(html).toContain('data-stair-arrowhead');
    expect(html).toContain('font-family="var(--font-ui)"');
    const plain = drafting(<StairRenderer stairs={[stair]} floorId="f2" />);
    expect(plain).not.toContain('<text');
  });

  it('keeps the label upright whichever way the run points', () => {
    expect(uprightAngle(1, 0)).toBeCloseTo(0);
    expect(uprightAngle(-1, 0)).toBeCloseTo(0);
    expect(uprightAngle(0, 1)).toBeCloseTo(-90);
    expect(uprightAngle(0, -1)).toBeCloseTo(-90);
  });
});

describe('FixtureRenderer — shower and plant', () => {
  const shower = { id: 'fx_shower', fixtureType: 'shower', x: 0, y: 0, width: 900, depth: 900, rotation: 0 };
  const plant = { id: 'fx_plant', fixtureType: 'plant', x: 0, y: 0, width: 800, depth: 800, rotation: 0 };

  it('draws both in presentation with the shared shadow and their hooks', () => {
    const html = presentation(<FixtureRenderer fixtures={[shower, plant]} />);
    expect(html).toContain('data-fixture-symbol="shower"');
    expect(html).toContain('data-fixture-symbol="plant"');
    expect(html).toContain('data-shower-glass');
    expect(html.match(/filter="url\(#fixture-shadow\)"/g)).toHaveLength(2);
    expect(html).toContain('data-id="fx_shower"');
    expect(html).toContain('data-id="fx_plant"');
    // Two greens and a dark pot.
    expect(html).toContain('#6aa35a');
    expect(html).toContain('#4f8a45');
    expect(html).toContain('#6b6b6b');
  });

  it('draws both in drafting too, with flat fills rather than a missing gradient', () => {
    const html = drafting(<FixtureRenderer fixtures={[shower, plant]} />);
    expect(html).toContain('data-id="fx_shower"');
    expect(html).toContain('data-id="fx_plant"');
    expect(html).not.toContain('url(#grad-shower)');
    expect(html).not.toContain('url(#grad-plant)');
  });

  it('never draws a negative rectangle, however thin the fixture', () => {
    const thin = { ...shower, id: 'fx_thin', width: 900, depth: 20 };
    const html = presentation(<FixtureRenderer fixtures={[thin]} />);
    for (const [, value] of html.matchAll(/(?:width|height)="(-?[\d.]+)"/g)) {
      expect(Number(value)).toBeGreaterThan(0);
    }
  });
});

describe('BlueprintAnnotationLayer by style', () => {
  const figure = {
    id: 'dim_1',
    source: 'manual',
    sourceType: 'dimension',
    extensionLines: [],
    lineStart: { x: 0, y: 0 },
    lineEnd: { x: 3000, y: 0 },
    arrowheads: [
      { tip: { x: 0, y: 0 }, left: { x: 80, y: 36 }, right: { x: 80, y: -36 } },
      { tip: { x: 3000, y: 0 }, left: { x: 2920, y: 36 }, right: { x: 2920, y: -36 } },
    ],
    text: { value: '3000 mm', position: { x: 1500, y: -100 }, angle: 0 },
  };
  const roomTag = {
    id: 'tag_1',
    sourceType: 'room',
    textLines: ['Bedroom', '12.00 m²'],
    position: { x: 0, y: 0 },
    textAnchor: 'middle',
    mask: true,
  };

  it('fills the arrowheads, sets Manrope, chips the label and capitalises the room name', () => {
    const html = presentation(<BlueprintAnnotationLayer dimensions={[figure]} tags={[roomTag]} />, { zoom: 0.1 });
    expect(html.match(/<polygon[^>]*fill="#3a4049"/g)).toHaveLength(2);
    expect(html).not.toContain('<polyline');
    expect(html).toContain('font-family="var(--font-ui)"');
    expect(html).not.toContain('var(--font-blueprint)');
    expect(html).toContain('data-dimension-source="manual"');
    expect(html).toContain('>BEDROOM</tspan>');
    // A 4 px radius at the default zoom: 4 × textScale × 10 world millimetres.
    expect(html).toMatch(/<rect[^>]*rx="40"/);
  });

  it('keeps drafting on open chevrons and the blueprint face', () => {
    const html = drafting(<BlueprintAnnotationLayer dimensions={[figure]} tags={[roomTag]} />);
    expect(html.match(/<polyline/g)).toHaveLength(2);
    expect(html).toContain('var(--font-blueprint)');
    expect(html).toContain('>Bedroom</tspan>');
  });

  it('points a filled head at its tip', () => {
    const [tip, left, right] = filledArrowheadPoints(figure.arrowheads[1], 70, 0.4);
    expect(tip).toEqual([3000, 0]);
    expect(left[0]).toBeCloseTo(2930);
    expect(right[0]).toBeCloseTo(2930);
    expect(Math.abs(left[1] - right[1])).toBeCloseTo(56);
  });
});

describe('ElevationSceneLayer by style', () => {
  function frontScene() {
    const floor = createFloor('Ground', 0);
    const front = createWall({ x: 0, y: 0 }, { x: 6000, y: 0 }, 200);
    floor.walls = [front];
    floor.windows = [createWindow(front.id, 2000)];
    floor.doors = [createDoor(front.id, 4500)];
    return buildElevationScene(floor, 'elevation_front');
  }

  it('draws the white model with a ground band, a crisp shadow and charcoal-framed glazing', () => {
    const html = presentation(<ElevationSceneLayer scene={frontScene()} />);
    expect(html).toContain('data-elevation-ground');
    expect(html).toContain('data-elevation-shadow');
    expect(html).toContain('fill="#f2f0eb"');
    expect(html).toContain('fill="#bcd8ea"');
    expect(html).toContain('fill="#5a3f2b"');
    expect(html).toContain('data-opening-frame');
    expect(html).not.toContain('<filter');
  });

  it('leaves the drafting elevation exactly as it was', () => {
    const html = drafting(<ElevationSceneLayer scene={frontScene()} />);
    expect(html).not.toContain('data-elevation-ground');
    expect(html).not.toContain('data-elevation-shadow');
    expect(html).not.toContain('data-opening-frame');
    expect(html).toContain('fill="#f7f8fa"');
  });
});
