import { describe, expect, it } from 'vitest';
import { buildSectionScene } from './scene';
import { createDoor, createFloor, createSectionCut, createSlab, createWall, createWindow } from '@/domain/models';
import { sectionCutLength } from '@/geometry/sectionCutGeometry';

// Plan space is y-down. A single 6000 long wall runs west -> east along y = 0, 200 thick,
// so the wall band covers y -100..100. The opening sits off-centre so that a mirrored view
// is distinguishable from a correct one.
const WALL_START = { x: 0, y: 0 };
const WALL_END = { x: 6000, y: 0 };
const DOOR_OFFSET = 1500; // door centre at x = 1500, spanning x 1050..1950

function makeFloor({ doorOffset = DOOR_OFFSET } = {}) {
  const floor = createFloor('Ground', 0, { elevation: 0 });
  const wall = createWall(WALL_START, WALL_END, 200, { height: 3000 });
  const door = createDoor(wall.id, doorOffset, 900);
  floor.walls = [wall];
  floor.doors = [door];
  return { floor, wall, door };
}

function findElement(scene, category) {
  return scene.rectElements.find((element) => element.category === category) || null;
}

function indexOfElement(scene, category) {
  return scene.rectElements.findIndex((element) => element.category === category);
}

describe('buildSectionScene openings', () => {
  it('draws a door that the cut passes through on the same span as its host wall', () => {
    const { floor, door } = makeFloor({ doorOffset: 3000 });
    const cut = createSectionCut({ x: 3000, y: -1500 }, { x: 3000, y: 1500 }, { direction: 1 });
    const scene = buildSectionScene(floor, cut);

    const wallElement = findElement(scene, 'wall');
    const doorElement = findElement(scene, 'door');

    expect(wallElement?.renderMode).toBe('cut');
    expect(doorElement?.renderMode).toBe('cut');
    expect(doorElement.left).toBeCloseTo(wallElement.left, 6);
    expect(doorElement.right).toBeCloseTo(wallElement.right, 6);
    expect(doorElement.bottom).toBeCloseTo(door.sillHeight, 6);
    expect(doorElement.top).toBeCloseTo(door.sillHeight + door.height, 6);
    // The opening must be painted after its host wall so the poche cannot hide it.
    expect(indexOfElement(scene, 'door')).toBeGreaterThan(indexOfElement(scene, 'wall'));
  });

  it('draws doors and windows on a wall that is within the section depth', () => {
    const { floor, wall, door } = makeFloor();
    const windowItem = createWindow(wall.id, 4500, 1200);
    floor.windows = [windowItem];

    // Cut 1000 south of the wall, looking north (direction -1) so the wall is in front.
    const cut = createSectionCut({ x: -500, y: 1000 }, { x: 6500, y: 1000 }, { direction: -1 });
    const scene = buildSectionScene(floor, cut);

    const wallElement = findElement(scene, 'wall');
    const doorElement = findElement(scene, 'door');
    const windowElement = findElement(scene, 'window');

    expect(wallElement?.renderMode).toBe('projection');
    // View axis runs west -> east here, and along is measured from the west end of the cut.
    expect(doorElement.left).toBeCloseTo(1550, 6);
    expect(doorElement.right).toBeCloseTo(2450, 6);
    expect(doorElement.bottom).toBeCloseTo(door.sillHeight, 6);
    expect(doorElement.top).toBeCloseTo(door.sillHeight + door.height, 6);
    expect(windowElement.left).toBeCloseTo(4400, 6);
    expect(windowElement.right).toBeCloseTo(5600, 6);
    expect(windowElement.bottom).toBeCloseTo(windowItem.sillHeight, 6);
    expect(windowElement.top).toBeCloseTo(windowItem.sillHeight + windowItem.height, 6);
    expect(indexOfElement(scene, 'door')).toBeGreaterThan(indexOfElement(scene, 'wall'));
    expect(indexOfElement(scene, 'window')).toBeGreaterThan(indexOfElement(scene, 'wall'));
  });

  it('never paints an opening behind its own host wall', () => {
    // A wall that runs away from the cut plane averages a shallower projection depth than an
    // opening near its far end, which used to sort the opening underneath its own wall.
    const floor = createFloor('Ground', 0, { elevation: 0 });
    const wall = createWall({ x: -3000, y: -500 }, { x: 3000, y: 3000 }, 200, { height: 3000 });
    floor.walls = [wall];
    floor.doors = [createDoor(wall.id, 579, 900)];

    const cut = createSectionCut({ x: 0, y: 0 }, { x: 0, y: 1000 }, { direction: 1, depth: 4000 });
    const scene = buildSectionScene(floor, cut);

    const wallElement = findElement(scene, 'wall');
    const doorElement = findElement(scene, 'door');

    expect(wallElement?.renderMode).toBe('projection');
    expect(doorElement?.renderMode).toBe('projection');
    expect(indexOfElement(scene, 'door')).toBeGreaterThan(indexOfElement(scene, 'wall'));
  });
});

describe('buildSectionScene view orientation', () => {
  it('places plan-east on the left of the view when the section looks south', () => {
    const { floor } = makeFloor();
    // Cut north of the wall, arrow pointing south (direction +1): the viewer looks south, so
    // plan-west is on the viewer's right.
    const cut = createSectionCut({ x: -500, y: -1000 }, { x: 6500, y: -1000 }, { direction: 1 });
    const scene = buildSectionScene(floor, cut);
    const doorElement = findElement(scene, 'door');

    // The door sits at plan x 1050..1950 (the west end), so it must land on the right half.
    expect(doorElement.left).toBeCloseTo(4550, 6);
    expect(doorElement.right).toBeCloseTo(5450, 6);
    expect(doorElement.left).toBeGreaterThan(sectionCutLength(cut) / 2);
  });

  it('mirrors the view when the section is taken from the other side of the wall', () => {
    const { floor } = makeFloor();
    const length = 7000;

    const fromNorth = createSectionCut({ x: -500, y: -1000 }, { x: 6500, y: -1000 }, { direction: 1 });
    const fromSouth = createSectionCut({ x: -500, y: 1000 }, { x: 6500, y: 1000 }, { direction: -1 });

    const northDoor = findElement(buildSectionScene(floor, fromNorth), 'door');
    const southDoor = findElement(buildSectionScene(floor, fromSouth), 'door');

    expect(sectionCutLength(fromNorth)).toBe(length);
    expect(northDoor.left).toBeCloseTo(length - southDoor.right, 6);
    expect(northDoor.right).toBeCloseTo(length - southDoor.left, 6);
  });
});

describe('buildSectionScene cut intervals with an endpoint inside a footprint', () => {
  it('keeps the cut span on the side of the view where the cut actually stops', () => {
    const { floor } = makeFloor({ doorOffset: 3000 });
    // The cut runs from north of the wall and stops on the wall centreline, so only the
    // northern half of the wall band (100mm) is cut.
    const forward = createSectionCut({ x: 3000, y: -1000 }, { x: 3000, y: 0 }, { direction: 1 });
    const forwardWall = findElement(buildSectionScene(floor, forward), 'wall');
    expect(forwardWall.left).toBeCloseTo(0, 6);
    expect(forwardWall.right).toBeCloseTo(100, 6);

    const reversed = createSectionCut({ x: 3000, y: -1000 }, { x: 3000, y: 0 }, { direction: -1 });
    const reversedWall = findElement(buildSectionScene(floor, reversed), 'wall');
    expect(reversedWall.left).toBeCloseTo(900, 6);
    expect(reversedWall.right).toBeCloseTo(1000, 6);
  });

  it('clips a slab to the part of the footprint the cut actually crosses', () => {
    const floor = createFloor('Ground', 0, { elevation: 0 });
    floor.slabs = [
      createSlab(floor.id, [
        { x: 0, y: 0 },
        { x: 6000, y: 0 },
        { x: 6000, y: 4000 },
        { x: 0, y: 4000 },
      ]),
    ];

    // The cut starts inside the slab at x 3000 and leaves it at x 6000; the cut is 5000 long.
    const forward = createSectionCut({ x: 3000, y: 2000 }, { x: 8000, y: 2000 }, { direction: 1 });
    const forwardSlab = findElement(buildSectionScene(floor, forward), 'slab');
    expect(forwardSlab.left).toBeCloseTo(2000, 6);
    expect(forwardSlab.right).toBeCloseTo(5000, 6);

    const reversed = createSectionCut({ x: 3000, y: 2000 }, { x: 8000, y: 2000 }, { direction: -1 });
    const reversedSlab = findElement(buildSectionScene(floor, reversed), 'slab');
    expect(reversedSlab.left).toBeCloseTo(0, 6);
    expect(reversedSlab.right).toBeCloseTo(3000, 6);
  });
});
