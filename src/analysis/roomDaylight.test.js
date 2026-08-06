import { describe, expect, it } from 'vitest';
import { createDoor, createProject, createRoom, createWall, createWindow } from '@/domain/models';
import { DAYLIGHT_ROOM_CONSTANTS, buildDaylightRooms, polygonPerimeter, roomExtentsAlong } from './roomDaylight';

/**
 * A rectangular room walled on its centrelines. The room polygon and the wall
 * centrelines coincide, which is what the room detector produces and what the
 * side probes are written against.
 */
function rectangularFloor({ width = 5000, depth = 4000, height = 2500 } = {}) {
  const corners = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: depth },
    { x: 0, y: depth },
  ];

  const walls = corners.map((corner, index) =>
    createWall(corner, corners[(index + 1) % corners.length], 200, { height }),
  );

  return { corners, walls };
}

function projectWith({ walls = [], windows = [], doors = [], rooms = [] } = {}) {
  const project = createProject('Daylight');
  const floor = project.floors[0];
  return {
    ...project,
    floors: [{ ...floor, walls, windows, doors, rooms }],
  };
}

describe('polygon helpers', () => {
  it('measures a perimeter round the closing edge', () => {
    expect(
      polygonPerimeter([
        { x: 0, y: 0 },
        { x: 5000, y: 0 },
        { x: 5000, y: 4000 },
        { x: 0, y: 4000 },
      ]),
    ).toBeCloseTo(18000, 6);
  });

  it('measures depth back from a window and width across it', () => {
    const extents = roomExtentsAlong(
      [
        { x: 0, y: 0 },
        { x: 5000, y: 0 },
        { x: 5000, y: 4000 },
        { x: 0, y: 4000 },
      ],
      // Looking into the room from the y = 0 wall.
      { x: 0, y: 1 },
    );
    expect(extents.depth).toBeCloseTo(4000, 6);
    expect(extents.width).toBeCloseTo(5000, 6);
  });
});

describe('finding the room a window lights', () => {
  const { corners, walls } = rectangularFloor();
  const southWall = walls[0]; // (0,0) → (5000,0)
  const room = createRoom('Living', corners);

  it('attaches an external window to the room behind it', () => {
    const window_ = createWindow(southWall.id, 2500, 2000);
    const { rooms } = buildDaylightRooms(projectWith({ walls, windows: [window_], rooms: [room] }));

    expect(rooms).toHaveLength(1);
    expect(rooms[0].apertures).toHaveLength(1);
    expect(rooms[0].apertures[0].openingId).toBe(window_.id);
    expect(rooms[0].apertures[0].roomId).toBe(room.id);
  });

  it('points the outward normal away from the room', () => {
    const window_ = createWindow(southWall.id, 2500, 2000);
    const { rooms } = buildDaylightRooms(projectWith({ walls, windows: [window_], rooms: [room] }));
    const aperture = rooms[0].apertures[0];

    // The room lies at y > 0, so outward is −y. Getting this backwards would
    // point every obstruction search into the building.
    expect(aperture.outwardNormal.y).toBeLessThan(0);
    expect(aperture.inwardNormal.y).toBeGreaterThan(0);
    expect(Math.hypot(aperture.outwardNormal.x, aperture.outwardNormal.y)).toBeCloseTo(1, 6);
  });

  it('skips a window with rooms on both sides', () => {
    // Two rooms sharing a wall: glazing between them moves light around but
    // admits none from the sky, and split-flux cannot represent it.
    const left = createRoom('Left', [
      { x: 0, y: 0 },
      { x: 3000, y: 0 },
      { x: 3000, y: 4000 },
      { x: 0, y: 4000 },
    ]);
    const right = createRoom('Right', [
      { x: 3000, y: 0 },
      { x: 6000, y: 0 },
      { x: 6000, y: 4000 },
      { x: 3000, y: 4000 },
    ]);
    const partition = createWall({ x: 3000, y: 0 }, { x: 3000, y: 4000 }, 200, { height: 2500 });
    const internal = createWindow(partition.id, 2000, 1000);

    const { rooms, skippedInternal } = buildDaylightRooms(
      projectWith({ walls: [partition], windows: [internal], rooms: [left, right] }),
    );

    expect(skippedInternal).toBe(1);
    expect(rooms.every((entry) => entry.apertures.length === 0)).toBe(true);
  });

  it('skips a window that lights no detected room', () => {
    const orphanWall = createWall({ x: 50000, y: 50000 }, { x: 55000, y: 50000 }, 200, { height: 2500 });
    const orphan = createWindow(orphanWall.id, 2500, 2000);
    const { rooms, skippedInternal } = buildDaylightRooms(
      projectWith({ walls: [...walls, orphanWall], windows: [orphan], rooms: [room] }),
    );

    expect(skippedInternal).toBe(1);
    expect(rooms[0].apertures).toHaveLength(0);
  });

  it('gathers every window in the room, on any wall', () => {
    const windows = [
      createWindow(walls[0].id, 2500, 2000),
      createWindow(walls[1].id, 2000, 1000),
      createWindow(walls[3].id, 2000, 1000),
    ];
    const { rooms } = buildDaylightRooms(projectWith({ walls, windows, rooms: [room] }));
    expect(rooms[0].apertures).toHaveLength(3);
  });

  it('ignores an opening too small to be a daylight source', () => {
    const slot = createWindow(southWall.id, 2500, 20);
    const { rooms } = buildDaylightRooms(projectWith({ walls, windows: [slot], rooms: [room] }));
    expect(rooms[0].apertures).toHaveLength(0);
  });
});

describe('glazed doors', () => {
  const { corners, walls } = rectangularFloor();
  const room = createRoom('Living', corners);
  const slider = createDoor(walls[0].id, 2500, 1800, 'left', 'sliding');
  const swing = createDoor(walls[2].id, 2500, 900, 'left', 'swing');

  it('counts a sliding door as glazing by default', () => {
    const { rooms } = buildDaylightRooms(projectWith({ walls, doors: [slider, swing], rooms: [room] }));
    // The slider counts; the swing door does not.
    expect(rooms[0].apertures).toHaveLength(1);
    expect(rooms[0].apertures[0].openingId).toBe(slider.id);
    expect(rooms[0].apertures[0].presetKey).toBe('slidingDoor');
  });

  it('can be told to ignore them', () => {
    const { rooms } = buildDaylightRooms(projectWith({ walls, doors: [slider], rooms: [room] }), {
      includeGlazedDoors: false,
    });
    expect(rooms[0].apertures).toHaveLength(0);
  });
});

describe('room geometry', () => {
  it('takes its ceiling height from the walls that bound it', () => {
    const { corners, walls } = rectangularFloor({ height: 2700 });
    const room = createRoom('Living', corners);
    const { rooms } = buildDaylightRooms(projectWith({ walls, rooms: [room] }));
    expect(rooms[0].heightMm).toBe(2700);
  });

  it('ignores a tall wall somewhere else on the floor', () => {
    const { corners, walls } = rectangularFloor({ height: 2500 });
    const elsewhere = createWall({ x: 50000, y: 50000 }, { x: 55000, y: 50000 }, 200, { height: 9000 });
    const room = createRoom('Living', corners);
    const { rooms } = buildDaylightRooms(projectWith({ walls: [...walls, elsewhere], rooms: [room] }));
    expect(rooms[0].heightMm).toBe(2500);
  });

  it('falls back to the storey height for a room with no walls of its own', () => {
    const room = createRoom('Void', [
      { x: 0, y: 0 },
      { x: 5000, y: 0 },
      { x: 5000, y: 4000 },
      { x: 0, y: 4000 },
    ]);
    const { rooms } = buildDaylightRooms(projectWith({ rooms: [room] }));
    expect(rooms[0].heightMm).toBeGreaterThan(0);
  });

  it('records area, perimeter and the depth back from the main window', () => {
    const { corners, walls } = rectangularFloor();
    const room = createRoom('Living', corners);
    const window_ = createWindow(walls[0].id, 2500, 2000);
    const { rooms } = buildDaylightRooms(projectWith({ walls, windows: [window_], rooms: [room] }));

    expect(rooms[0].areaMm2).toBeCloseTo(20e6, 0);
    expect(rooms[0].perimeterMm).toBeCloseTo(18000, 0);
    // Window on the y = 0 wall, so the room runs 4 m back and 5 m across.
    expect(rooms[0].extents.depth).toBeCloseTo(4000, 0);
    expect(rooms[0].extents.width).toBeCloseTo(5000, 0);
    expect(rooms[0].primaryApertureId).toBe(rooms[0].apertures[0].id);
  });

  it('puts the aperture at the right height above the floor', () => {
    const { corners, walls } = rectangularFloor();
    const room = createRoom('Living', corners);
    const window_ = createWindow(walls[0].id, 2500, 2000);
    const { rooms } = buildDaylightRooms(projectWith({ walls, windows: [window_], rooms: [room] }));
    const aperture = rooms[0].apertures[0];

    expect(aperture.sillElevation).toBe(window_.sillHeight);
    expect(aperture.headElevation).toBe(window_.sillHeight + window_.height);
    expect(aperture.centreElevation).toBe(window_.sillHeight + window_.height / 2);
    expect(aperture.openingAreaMm2).toBe(window_.width * window_.height);
  });

  it('carries the floor elevation through on an upper storey', () => {
    const { corners, walls } = rectangularFloor();
    const room = createRoom('Living', corners);
    const window_ = createWindow(walls[0].id, 2500, 2000);
    const base = projectWith({ walls, windows: [window_], rooms: [room] });
    const raised = { ...base, floors: [{ ...base.floors[0], elevation: 6000 }] };

    const { rooms, floorElevation } = buildDaylightRooms(raised);
    expect(floorElevation).toBe(6000);
    expect(rooms[0].floorElevation).toBe(6000);
    expect(rooms[0].apertures[0].sillElevation).toBe(6000 + window_.sillHeight);
  });
});

describe('empty inputs', () => {
  it('returns nothing rather than throwing', () => {
    expect(buildDaylightRooms(null).rooms).toEqual([]);
    expect(buildDaylightRooms({ floors: [] }).rooms).toEqual([]);
    expect(buildDaylightRooms(projectWith({})).rooms).toEqual([]);
  });

  it('probes far enough past a wall face to land inside the room', () => {
    expect(DAYLIGHT_ROOM_CONSTANTS.ROOM_PROBE_MM).toBeGreaterThan(0);
  });
});
