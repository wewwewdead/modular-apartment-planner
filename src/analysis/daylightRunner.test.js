import { describe, expect, it } from 'vitest';
import { createProject, createRoom, createWall, createWindow } from '@/domain/models';
import { createDaylightState } from './daylightState';
import { computeDaylightGrids, computeDaylightStudy } from './daylightRunner';

const ON = createDaylightState({ enabled: true });

/**
 * One rectangular room, walled on its centrelines, with a window in the y = 0
 * wall. 5 × 4 m at 2.5 m high — the room every daylight primer works through.
 */
function singleRoom({ windowWidth = 2000, windowHeight = 1400, spaceType = 'living', extraWalls = [] } = {}) {
  const corners = [
    { x: 0, y: 0 },
    { x: 5000, y: 0 },
    { x: 5000, y: 4000 },
    { x: 0, y: 4000 },
  ];
  const walls = corners.map((corner, index) =>
    createWall(corner, corners[(index + 1) % corners.length], 200, { height: 2500 }),
  );

  const window_ = createWindow(walls[0].id, 2500, windowWidth);
  window_.height = windowHeight;

  const room = { ...createRoom('Living', corners), spaceType };
  const project = createProject('Daylight');

  return {
    project: {
      ...project,
      floors: [{ ...project.floors[0], walls: [...walls, ...extraWalls], windows: [window_], rooms: [room] }],
    },
    walls,
    room,
    window: window_,
  };
}

/** A free-standing block of massing on its own floor, to obstruct the window. */
function obstructingFloor(project, { y, height }) {
  const corners = [
    { x: -10000, y },
    { x: 15000, y },
    { x: 15000, y: y - 6000 },
    { x: -10000, y: y - 6000 },
  ];
  const walls = corners.map((corner, index) =>
    createWall(corner, corners[(index + 1) % corners.length], 300, { height }),
  );

  return {
    ...project,
    floors: [...project.floors, { ...project.floors[0], id: 'floor_obstruction', walls, windows: [], rooms: [] }],
  };
}

describe('the split-flux study', () => {
  it('is off unless it is switched on', () => {
    const { project } = singleRoom();
    expect(computeDaylightStudy({ project, daylight: createDaylightState() })).toBeNull();
  });

  it('reports a believable daylight factor for an ordinary room', () => {
    const { project } = singleRoom();
    const study = computeDaylightStudy({ project, daylight: ON });
    const room = study.rooms[0];

    // 2.8 m² of opening in a 20 m² room: the rule of thumb says a bit under 2%.
    expect(room.averageDaylightFactor).toBeGreaterThan(1);
    expect(room.averageDaylightFactor).toBeLessThan(3);
    expect(room.internallyReflected).toBeGreaterThan(0);
    expect(room.internallyReflected).toBeLessThan(room.averageDaylightFactor);
    expect(room.skyAndExternal).toBeCloseTo(room.averageDaylightFactor - room.internallyReflected, 6);
  });

  it('sees a clear sky when nothing is in the way', () => {
    const { project } = singleRoom();
    const room = computeDaylightStudy({ project, daylight: ON }).rooms[0];
    expect(room.skyAngleDeg).toBe(90);
    expect(room.obstructionAngleDeg).toBe(0);
  });

  it('does not let the window’s own building obstruct it', () => {
    // The single most likely way to get this wrong: the room's four walls are
    // in the massing, and the window sits inside one of them.
    const { project } = singleRoom();
    expect(computeDaylightStudy({ project, daylight: ON }).rooms[0].averageDaylightFactor).toBeGreaterThan(1);
  });

  it('darkens the room when a building goes up opposite', () => {
    const { project } = singleRoom();
    const clear = computeDaylightStudy({ project, daylight: ON }).rooms[0];
    const shaded = computeDaylightStudy({
      project: obstructingFloor(project, { y: -8000, height: 12000 }),
      daylight: ON,
    }).rooms[0];

    expect(shaded.skyAngleDeg).toBeLessThan(clear.skyAngleDeg);
    expect(shaded.averageDaylightFactor).toBeLessThan(clear.averageDaylightFactor);
    expect(shaded.obstructionAngleDeg).toBeGreaterThan(20);
  });

  it('scales with the size of the window', () => {
    const small = computeDaylightStudy({ project: singleRoom({ windowWidth: 800 }).project, daylight: ON }).rooms[0];
    const large = computeDaylightStudy({ project: singleRoom({ windowWidth: 4000 }).project, daylight: ON }).rooms[0];
    expect(large.averageDaylightFactor).toBeGreaterThan(small.averageDaylightFactor * 2);
  });

  it('responds to the interior finishes', () => {
    const { project } = singleRoom();
    const dark = computeDaylightStudy({
      project,
      daylight: createDaylightState({
        enabled: true,
        wallReflectance: 0.15,
        ceilingReflectance: 0.3,
        floorReflectance: 0.05,
      }),
    }).rooms[0];
    const light = computeDaylightStudy({
      project,
      daylight: createDaylightState({
        enabled: true,
        wallReflectance: 0.7,
        ceilingReflectance: 0.85,
        floorReflectance: 0.4,
      }),
    }).rooms[0];

    expect(light.averageDaylightFactor).toBeGreaterThan(dark.averageDaylightFactor);
    expect(light.internallyReflected).toBeGreaterThan(dark.internallyReflected);
  });

  it('reports a windowless room as dark rather than omitting it', () => {
    const { project } = singleRoom();
    const withoutWindows = { ...project, floors: [{ ...project.floors[0], windows: [] }] };
    const room = computeDaylightStudy({ project: withoutWindows, daylight: ON }).rooms[0];

    expect(room.hasDaylight).toBe(false);
    expect(room.averageDaylightFactor).toBe(0);
    expect(room.meetsTarget).toBe(false);
  });

  it('judges each room against the level recommended for its use', () => {
    const kitchen = computeDaylightStudy({ project: singleRoom({ spaceType: 'kitchen' }).project, daylight: ON })
      .rooms[0];
    const bedroom = computeDaylightStudy({ project: singleRoom({ spaceType: 'bedroom' }).project, daylight: ON })
      .rooms[0];
    const bathroom = computeDaylightStudy({ project: singleRoom({ spaceType: 'bathroom' }).project, daylight: ON })
      .rooms[0];

    expect(kitchen.target).toBe(2);
    expect(bedroom.target).toBe(1);
    // No recommendation exists for a bathroom, so none is invented.
    expect(bathroom.target).toBeNull();
    expect(bathroom.meetsTarget).toBeNull();
  });

  it('carries the geometry the overlay draws from', () => {
    // The overlay renders from the study alone, so a room that loses its
    // polygon on the way through draws nothing — and does it silently, which is
    // exactly how it got missed the first time.
    const { project } = singleRoom();
    const room = computeDaylightStudy({ project, daylight: ON }).rooms[0];

    expect(room.polygon).toHaveLength(4);
    expect(room.polygon[0]).toEqual({ x: 0, y: 0 });
    expect(Number.isFinite(room.centroid.x)).toBe(true);
    expect(Number.isFinite(room.centroid.y)).toBe(true);
  });

  it('summarises the floor by area, not by room count', () => {
    const { project } = singleRoom();
    const study = computeDaylightStudy({ project, daylight: ON });

    expect(study.summary.roomCount).toBe(1);
    expect(study.summary.litRoomCount).toBe(1);
    expect(study.summary.totalAreaM2).toBeCloseTo(20, 1);
    expect(study.summary.areaWeightedDaylightFactor).toBeCloseTo(study.rooms[0].averageDaylightFactor, 6);
  });

  it('does not depend on which way the building faces', () => {
    // The overcast sky is rotationally symmetric. If a daylight factor moved
    // when the plan was rotated, something orientation-dependent has leaked in.
    const { project } = singleRoom();
    const rotate = (point) => ({ x: point.y, y: -point.x });
    const floor = project.floors[0];
    const rotated = {
      ...project,
      floors: [
        {
          ...floor,
          walls: floor.walls.map((wall) => ({ ...wall, start: rotate(wall.start), end: rotate(wall.end) })),
          rooms: floor.rooms.map((room) => ({ ...room, points: room.points.map(rotate) })),
        },
      ],
    };

    const north = computeDaylightStudy({ project, daylight: ON }).rooms[0];
    const east = computeDaylightStudy({ project: rotated, daylight: ON }).rooms[0];
    expect(east.averageDaylightFactor).toBeCloseTo(north.averageDaylightFactor, 6);
  });
});

describe('the Monte Carlo grid', () => {
  it('agrees with split-flux on an ordinary room', () => {
    // The whole point of running two methods. They share the aperture geometry
    // and the obstruction mask, but nothing else: one is a fitted whole-room
    // formula, the other is ray sampling under a CIE sky. Landing within a
    // third of each other is the evidence that neither has a unit error.
    const { project } = singleRoom();
    const study = computeDaylightGrids({ project, daylight: createDaylightState({ enabled: true, rayCount: 512 }) });
    const room = study.rooms[0];

    expect(room.grid).toBeTruthy();
    const ratio = room.grid.mean / room.averageDaylightFactor;
    expect(ratio).toBeGreaterThan(0.67);
    expect(ratio).toBeLessThan(1.5);
  });

  it('still agrees once a building goes up opposite', () => {
    // Agreement on the easy case could be luck. The two methods handle
    // obstruction completely differently — one folds it into a single sky
    // angle, the other tests every ray against the mask — so agreeing here
    // means the sky angle really does summarise what the rays see.
    const { project } = singleRoom();
    const shadedProject = obstructingFloor(project, { y: -8000, height: 12000 });
    const study = computeDaylightGrids({
      project: shadedProject,
      daylight: createDaylightState({ enabled: true, rayCount: 512 }),
    });
    const room = study.rooms[0];

    const ratio = room.grid.mean / room.averageDaylightFactor;
    expect(ratio).toBeGreaterThan(0.6);
    expect(ratio).toBeLessThan(1.6);
  });

  it('shows the gradient across the room that an average cannot', () => {
    const { project } = singleRoom();
    const room = computeDaylightGrids({ project, daylight: ON }).rooms[0];

    expect(room.grid.max).toBeGreaterThan(room.grid.mean);
    expect(room.grid.min).toBeLessThan(room.grid.mean);
    expect(room.grid.uniformity).toBeLessThan(0.7);
    expect(room.grid.fractionAboveTarget).toBeGreaterThanOrEqual(0);
    expect(room.grid.fractionAboveTarget).toBeLessThanOrEqual(1);
  });

  it('leaves a windowless room without a grid', () => {
    const { project } = singleRoom();
    const withoutWindows = { ...project, floors: [{ ...project.floors[0], windows: [] }] };
    const room = computeDaylightGrids({ project: withoutWindows, daylight: ON }).rooms[0];
    expect(room.grid).toBeUndefined();
  });

  it('reports progress as it goes', () => {
    const { project } = singleRoom();
    const seen = [];
    computeDaylightGrids({ project, daylight: ON }, (progress) => seen.push(progress));

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ done: 1, total: 1, roomName: 'Living' });
  });
});
