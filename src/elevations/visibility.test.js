import { describe, expect, it } from 'vitest';
import { createDoor, createFloor, createLanding, createStair, createWall, createWindow } from '@/domain/models';
import { buildElevationScene } from './scene';
import { getVisibleElevationDrawables, elevationRegionContainsPoint } from './visibility';
import { buildElevationAnnotationScene } from './annotations';

function fixture() {
  const floor = createFloor('Ground', 0);
  floor.walls = [
    createWall({ x: 0, y: 0 }, { x: 6000, y: 0 }, 200),
    createWall({ x: 6000, y: 4000 }, { x: 0, y: 4000 }, 200),
    createWall({ x: 0, y: 4000 }, { x: 0, y: 0 }, 200),
    createWall({ x: 6000, y: 0 }, { x: 6000, y: 4000 }, 200),
  ];
  floor.windows = floor.walls.map((wall) => createWindow(wall.id, 1600, 1000));
  return floor;
}

describe('architectural elevation visibility', () => {
  it.each(['front', 'rear', 'left', 'right'])('keeps both openings on an angled wall visible from the %s', (side) => {
    const floor = createFloor('Ground', 0);
    const wall = createWall({ x: 0, y: 0 }, { x: 6000, y: 6000 }, 200);
    floor.walls = [wall];
    floor.windows = [createWindow(wall.id, 1500, 1000), createWindow(wall.id, 6500, 1000)];
    const windows = getVisibleElevationDrawables(buildElevationScene(floor, `elevation_${side}`)).filter(
      (element) => element.category === 'window',
    );
    expect(windows).toHaveLength(2);
    for (const window of windows) {
      expect(window.right - window.left).toBeCloseTo(1000 / Math.sqrt(2));
      expect(elevationRegionContainsPoint(window, { x: (window.left + window.right) / 2, y: -1500 })).toBe(true);
    }
  });

  it.each([
    ['front', 0],
    ['rear', 1],
    ['left', 2],
    ['right', 3],
  ])('shows only the facing facade openings in the %s view', (side, wallIndex) => {
    const floor = fixture();
    const scene = buildElevationScene(floor, `elevation_${side}`);
    const windows = getVisibleElevationDrawables(scene).filter((item) => item.category === 'window');
    expect(windows.map((item) => item.sourceId)).toEqual([floor.windows[wallIndex].id]);
    expect(windows[0].right - windows[0].left).toBeCloseTo(1000);
    const dimensions = buildElevationAnnotationScene(floor, scene).dimensions;
    const hiddenIds = floor.windows.filter((_, i) => i !== wallIndex).map((w) => w.id);
    expect(dimensions.some((d) => hiddenIds.includes(d.sourceId))).toBe(false);
    const openingDimensions = dimensions.filter((d) => d.sourceId === windows[0].sourceId);
    expect(openingDimensions.every((d) => d.lineStart.x > windows[0].right)).toBe(true);
  });

  it('mirrors horizontal coordinates between opposite elevations', () => {
    const floor = createFloor('Ground', 0);
    const wall = createWall({ x: 0, y: 0 }, { x: 6000, y: 0 }, 200);
    floor.walls = [wall];
    floor.windows = [createWindow(wall.id, 1400, 800)];
    const opening = (view) =>
      getVisibleElevationDrawables(buildElevationScene(floor, view)).find((e) => e.category === 'window');
    const front = opening('elevation_front');
    const rear = opening('elevation_rear');
    expect(front.left).toBe(1000);
    expect(rear.right).toBe(-front.left);
    expect(rear.left).toBe(-front.right);
  });

  it('clips partially hidden windows and excludes their covered portions from selection', () => {
    const floor = createFloor('Ground', 0);
    const back = createWall({ x: 0, y: 2000 }, { x: 6000, y: 2000 }, 200);
    const front = createWall({ x: 0, y: 0 }, { x: 3000, y: 0 }, 200);
    floor.walls = [back, front];
    floor.windows = [createWindow(back.id, 3000, 2000)];
    const window = getVisibleElevationDrawables(buildElevationScene(floor, 'elevation_front')).find(
      (e) => e.category === 'window',
    );
    expect(elevationRegionContainsPoint(window, { x: 2500, y: -1500 })).toBe(false);
    expect(elevationRegionContainsPoint(window, { x: 3500, y: -1500 })).toBe(true);
  });

  it('resolves crossing face depths locally rather than using average depths', () => {
    const scene = {
      elements: [
        { id: 'angled', left: 0, right: 4000, bottom: 0, top: 3000, depth: 0, depthSlope: 1, depthIntercept: -2000 },
        { id: 'flat', left: 0, right: 4000, bottom: 0, top: 3000, depth: 0 },
      ],
    };
    const visible = getVisibleElevationDrawables(scene);
    const angled = visible.find((e) => e.id === 'angled');
    const flat = visible.find((e) => e.id === 'flat');
    expect(elevationRegionContainsPoint(angled, { x: 1000, y: -1000 })).toBe(true);
    expect(elevationRegionContainsPoint(angled, { x: 3000, y: -1000 })).toBe(false);
    expect(elevationRegionContainsPoint(flat, { x: 1000, y: -1000 })).toBe(false);
    expect(elevationRegionContainsPoint(flat, { x: 3000, y: -1000 })).toBe(true);
  });

  it('places openings on the built face of an offset wall', () => {
    const floor = createFloor('Ground', 0);
    const wall = { ...createWall({ x: 0, y: 0 }, { x: 6000, y: 0 }, 200), outboardOffset: -600 };
    floor.walls = [wall];
    floor.doors = [createDoor(wall.id, 2000)];
    const door = getVisibleElevationDrawables(buildElevationScene(floor, 'elevation_front')).find(
      (e) => e.category === 'door',
    );
    expect(door.depth).toBe(-700);
  });

  it('projects stair treads and attached landings at their model elevations', () => {
    const floor = createFloor('Upper', 1, { elevation: 3000 });
    const landing = createLanding({ x: 0, y: 0 }, 1200, 1000, { elevation: 450, thickness: 180 });
    const stair = createStair(
      { x: 0, y: 0 },
      1000,
      4,
      175,
      250,
      { angle: 0 },
      {},
      {
        startLandingAttachment: { landingId: landing.id },
      },
    );
    floor.stairs = [stair];
    floor.landings = [landing];
    const scene = buildElevationScene(floor, 'elevation_front');
    const steps = scene.elements.filter((e) => e.category === 'stair');
    expect([...new Set(steps.map((e) => e.top))]).toEqual([3625, 3800, 3975, 4150]);
    expect(steps.every((e) => e.right - e.left === 250)).toBe(true);
    const deck = scene.elements.find((e) => e.category === 'landing');
    expect([deck.bottom, deck.top]).toEqual([3450, 3630]);
  });

  it('clips hidden structural lines at the facade', () => {
    const scene = {
      elements: [{ id: 'wall', left: 0, right: 2000, bottom: 0, top: 3000, depth: 0 }],
      lineElements: [{ id: 'truss', start: { x: -1000, z: 1500 }, end: { x: 3000, z: 1500 }, depth: 1000 }],
    };
    const line = getVisibleElevationDrawables(scene).find((e) => e.id === 'truss');
    expect(line.segments).toEqual([
      [
        { x: -1000, y: -1500 },
        { x: 0, y: -1500 },
      ],
      [
        { x: 2000, y: -1500 },
        { x: 3000, y: -1500 },
      ],
    ]);
  });
});
