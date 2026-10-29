import { describe, expect, it } from 'vitest';
import { createFloor, createSlab, createWall, createWindow } from '@/domain/models';
import { buildElevationScene } from './scene';

/**
 * What an elevation has to get right about a wall is where it starts and where
 * it stops. Everything else on the drawing hangs off those two numbers, which
 * is why they now come from one resolver instead of six copies of the same
 * expression.
 */

const WALL_START = { x: 0, y: 0 };
const WALL_END = { x: 6000, y: 0 };

// A plate covering the strip the 200-thick wall stands on.
const PLATE = [
  { x: -1000, y: -2000 },
  { x: 7000, y: -2000 },
  { x: 7000, y: 2000 },
  { x: -1000, y: 2000 },
];

function makeFloor({ framingMode = 'platform', baseOffset = 0 } = {}) {
  const floor = createFloor('First', 1, { elevation: 3000 });
  const wall = { ...createWall(WALL_START, WALL_END, 200, { height: 2400 }), framingMode, baseOffset };
  const windowItem = createWindow(wall.id, 3000, 1200);
  floor.walls = [wall];
  floor.windows = [windowItem];
  floor.slabs = [createSlab(floor.id, PLATE, 250, 3000)];
  return { floor, wall, windowItem };
}

function find(scene, category) {
  return scene.elements.find((element) => element.category === category) || null;
}

describe('buildElevationScene wall extents', () => {
  it('draws a platform wall from its floor, lifted by whatever holds it up', () => {
    const { floor, wall } = makeFloor({ baseOffset: 450 });

    const rect = find(buildElevationScene(floor, 'elevation_front'), 'wall');

    expect(rect.bottom).toBeCloseTo(3450, 6);
    expect(rect.top).toBeCloseTo(3450 + wall.height, 6);
  });

  it('runs a bypass wall past its own deck and up to the floor above', () => {
    const { floor } = makeFloor({ framingMode: 'bypass' });

    const rect = find(buildElevationScene(floor, 'elevation_front'), 'wall');

    expect(rect.bottom).toBeCloseTo(2750, 6);
    expect(rect.top).toBeCloseTo(6000, 6);
  });

  it('keeps an opening on the floor its wall passes, not on the wall underside', () => {
    const { floor, windowItem } = makeFloor({ framingMode: 'bypass' });

    const rect = find(buildElevationScene(floor, 'elevation_front'), 'window');

    expect(rect.bottom).toBeCloseTo(3000 + windowItem.sillHeight, 6);
    expect(rect.top).toBeCloseTo(3000 + windowItem.sillHeight + windowItem.height, 6);
  });

  it('still carries an opening up a plinth beam with its host wall', () => {
    const { floor, windowItem } = makeFloor({ baseOffset: 450 });

    const rect = find(buildElevationScene(floor, 'elevation_front'), 'window');

    expect(rect.bottom).toBeCloseTo(3450 + windowItem.sillHeight, 6);
  });
});
