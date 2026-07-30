import { describe, expect, it } from 'vitest';
import { reconcileFloorRooms } from './roomReconcile';
import { createRoom } from './models';

/**
 * Two-room fixture (mm):
 *
 *   (0,3000) ─────────────┬───────────── (8000,3000)
 *      │       Kitchen    │    Living        │
 *   (0,0) ────────────────┴───────────── (8000,0)
 *                     divider @ x=4000
 */
function wall(id, x1, y1, x2, y2) {
  return { id, start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 100 };
}

function makeTwoRoomFloor(dividerX = 4000) {
  const walls = [
    wall('bottom', 0, 0, 8000, 0),
    wall('right', 8000, 0, 8000, 3000),
    wall('top', 8000, 3000, 0, 3000),
    wall('left', 0, 3000, 0, 0),
    wall('divider', dividerX, 0, dividerX, 3000),
  ];
  const kitchen = createRoom('Kitchen', [
    { x: 0, y: 0 },
    { x: dividerX, y: 0 },
    { x: dividerX, y: 3000 },
    { x: 0, y: 3000 },
  ]);
  kitchen.color = '#123456';
  kitchen.phaseId = 'phase_1';
  const living = createRoom('Living', [
    { x: dividerX, y: 0 },
    { x: 8000, y: 0 },
    { x: 8000, y: 3000 },
    { x: dividerX, y: 3000 },
  ]);
  return { walls, rooms: [kitchen, living], doors: [], windows: [], columns: [] };
}

describe('reconcileFloorRooms — identity preservation', () => {
  it('keeps names/colors/phases when the divider wall moves', () => {
    const floor = makeTwoRoomFloor(4000);
    // Simulate: divider moved from x=4000 to x=5000 (walls already updated).
    floor.walls = floor.walls.map((w) => (w.id === 'divider' ? wall('divider', 5000, 0, 5000, 3000) : w));

    const next = reconcileFloorRooms(floor, {
      changedWalls: [
        { start: { x: 4000, y: 0 }, end: { x: 4000, y: 3000 } }, // old geometry
        { start: { x: 5000, y: 0 }, end: { x: 5000, y: 3000 } }, // new geometry
      ],
      phaseId: null,
    });

    const kitchen = next.rooms.find((room) => room.name === 'Kitchen');
    const living = next.rooms.find((room) => room.name === 'Living');
    expect(kitchen).toBeDefined();
    expect(living).toBeDefined();
    expect(kitchen.color).toBe('#123456');
    expect(kitchen.phaseId).toBe('phase_1');
    // Kitchen grew to the new divider.
    expect(kitchen.area).toBeCloseTo(5000 * 3000, 0);
    expect(living.area).toBeCloseTo(3000 * 3000, 0);
    expect(next.rooms).toHaveLength(2);
  });

  it('a split room gives its name to the larger-overlap half; the other half is new', () => {
    // One big room, then a divider appears at x=2000 → left 2000 wide, right 6000 wide.
    const walls = [
      wall('bottom', 0, 0, 8000, 0),
      wall('right', 8000, 0, 8000, 3000),
      wall('top', 8000, 3000, 0, 3000),
      wall('left', 0, 3000, 0, 0),
      wall('divider', 2000, 0, 2000, 3000),
    ];
    const big = createRoom('Big', [
      { x: 0, y: 0 },
      { x: 8000, y: 0 },
      { x: 8000, y: 3000 },
      { x: 0, y: 3000 },
    ]);
    const floor = { walls, rooms: [big], doors: [], windows: [], columns: [] };

    const next = reconcileFloorRooms(floor, {
      changedWalls: [{ start: { x: 2000, y: 0 }, end: { x: 2000, y: 3000 } }],
      phaseId: 'phase_new',
    });

    expect(next.rooms).toHaveLength(2);
    const named = next.rooms.find((room) => room.name === 'Big');
    const unnamed = next.rooms.find((room) => room.name !== 'Big');
    expect(named.area).toBeCloseTo(6000 * 3000, 0);
    expect(unnamed.area).toBeCloseTo(2000 * 3000, 0);
    expect(unnamed.phaseId).toBe('phase_new');
  });

  it('preserves labelPosition when still inside; recenters when outside', () => {
    const floor = makeTwoRoomFloor(4000);
    const kitchen = floor.rooms[0];
    kitchen.labelPosition = { x: 3900, y: 1500 }; // near the divider
    floor.walls = floor.walls.map((w) => (w.id === 'divider' ? wall('divider', 2000, 0, 2000, 3000) : w));

    const next = reconcileFloorRooms(floor, {
      changedWalls: [
        { start: { x: 4000, y: 0 }, end: { x: 4000, y: 3000 } },
        { start: { x: 2000, y: 0 }, end: { x: 2000, y: 3000 } },
      ],
    });

    const nextKitchen = next.rooms.find((room) => room.name === 'Kitchen');
    // Kitchen shrank to x<2000; the old label at x=3900 is outside → recentered.
    expect(nextKitchen.labelPosition.x).toBeLessThan(2000);
  });
});

describe('reconcileFloorRooms — locality rule', () => {
  it('never touches distant stale legacy rooms on a scoped reconcile', () => {
    const floor = makeTwoRoomFloor(4000);
    // A legacy room far away whose walls no longer exist (broken loop).
    const ghost = createRoom('Ghost', [
      { x: 50000, y: 50000 },
      { x: 54000, y: 50000 },
      { x: 54000, y: 53000 },
      { x: 50000, y: 53000 },
    ]);
    floor.rooms = [...floor.rooms, ghost];

    const next = reconcileFloorRooms(floor, {
      changedWalls: [{ start: { x: 4000, y: 0 }, end: { x: 4000, y: 3000 } }],
    });

    expect(next.rooms.find((room) => room.name === 'Ghost')).toBe(ghost);
  });

  it('full-floor reconcile (no changedWalls) removes rooms with no matching loop', () => {
    const floor = makeTwoRoomFloor(4000);
    const ghost = createRoom('Ghost', [
      { x: 50000, y: 50000 },
      { x: 54000, y: 50000 },
      { x: 54000, y: 53000 },
      { x: 50000, y: 53000 },
    ]);
    floor.rooms = [...floor.rooms, ghost];

    const next = reconcileFloorRooms(floor, {});

    expect(next.rooms.find((room) => room.name === 'Ghost')).toBeUndefined();
    // The two real rooms keep their identity in full mode too.
    expect(next.rooms.map((room) => room.name).sort()).toEqual(['Kitchen', 'Living']);
  });

  it('full-floor reconcile is the Toolbar Detect Rooms contract: names survive, new loops get numbered rooms', () => {
    // The Toolbar button dispatches ROOMS_SET with reconcileFloorRooms(floor)
    // output — this test pins that contract: pressing Detect Rooms must never
    // reset "Kitchen" back to "Room 1".
    const floor = makeTwoRoomFloor(4000);
    const next = reconcileFloorRooms(floor, { phaseId: 'phase_x' });

    expect(next.rooms.map((room) => room.name).sort()).toEqual(['Kitchen', 'Living']);
    expect(next.rooms.find((room) => room.name === 'Kitchen').color).toBe('#123456');
  });

  it('removes an in-scope room whose loop vanished, in the same reconcile', () => {
    const floor = makeTwoRoomFloor(4000);
    // Divider deleted: one big space now. Kitchen+Living both in scope.
    floor.walls = floor.walls.filter((w) => w.id !== 'divider');

    const next = reconcileFloorRooms(floor, {
      changedWalls: [{ start: { x: 4000, y: 0 }, end: { x: 4000, y: 3000 } }],
    });

    // One survivor claims the merged space (largest overlap), the other is gone.
    expect(next.rooms).toHaveLength(1);
    expect(['Kitchen', 'Living']).toContain(next.rooms[0].name);
    expect(next.rooms[0].area).toBeCloseTo(8000 * 3000, 0);
  });
});
