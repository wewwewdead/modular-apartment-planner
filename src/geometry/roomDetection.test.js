import { describe, expect, it } from 'vitest';
import { detectRoomFaces, detectRooms, findRoomFaceAtPoint, roomPolygonKey } from './roomDetection';
import { createWall } from '@/domain/models';

// Helper to build a wall between two raw coordinate pairs (all values in mm).
function wall(ax, ay, bx, by) {
  return createWall({ x: ax, y: ay }, { x: bx, y: by });
}

// A closed 4000 x 3000 rectangle (area 12,000,000 mm²).
function rectangleWalls() {
  return [wall(0, 0, 4000, 0), wall(4000, 0, 4000, 3000), wall(4000, 3000, 0, 3000), wall(0, 3000, 0, 0)];
}

describe('detectRooms', () => {
  it('detects a single rectangular room from 4 closed walls', () => {
    const rooms = detectRooms(rectangleWalls());
    expect(rooms).toHaveLength(1);
    expect(rooms[0].area).toBeCloseTo(12_000_000, 3);
    expect(rooms[0].points).toHaveLength(4);
  });

  it('returns no rooms for fewer than 3 walls', () => {
    expect(detectRooms([wall(0, 0, 4000, 0), wall(4000, 0, 4000, 3000)])).toEqual([]);
  });

  it('returns no rooms for an open (non-closed) wall set', () => {
    // Three sides of a rectangle, missing the fourth wall -> no enclosed face.
    const openWalls = [wall(0, 0, 4000, 0), wall(4000, 0, 4000, 3000), wall(4000, 3000, 0, 3000)];
    expect(detectRooms(openWalls)).toEqual([]);
  });

  it('rejects a closed loop whose area is below MIN_ROOM_AREA', () => {
    // 100 x 100 = 10,000 mm², below MIN_ROOM_AREA (100,000 mm²).
    const tinyWalls = [wall(0, 0, 100, 0), wall(100, 0, 100, 100), wall(100, 100, 0, 100), wall(0, 100, 0, 0)];
    expect(detectRooms(tinyWalls)).toEqual([]);
  });

  it('detects two adjacent rooms sharing a common dividing wall', () => {
    const walls = [
      ...rectangleWalls(),
      wall(2000, 0, 2000, 3000), // vertical divider down the middle
    ];
    const rooms = detectRooms(walls);
    expect(rooms).toHaveLength(2);
    // Each half is 2000 x 3000 = 6,000,000 mm².
    for (const room of rooms) {
      expect(room.area).toBeCloseTo(6_000_000, 3);
      expect(room.points).toHaveLength(4);
    }
    const totalArea = rooms.reduce((sum, room) => sum + room.area, 0);
    expect(totalArea).toBeCloseTo(12_000_000, 3);
  });

  it('splits collinear boundary walls into shared vertices without creating extra rooms', () => {
    // The bottom edge is drawn as two collinear segments meeting at (2000, 0).
    const walls = [
      wall(0, 0, 2000, 0),
      wall(2000, 0, 4000, 0),
      wall(4000, 0, 4000, 3000),
      wall(4000, 3000, 0, 3000),
      wall(0, 3000, 0, 0),
    ];
    const faces = detectRoomFaces(walls);
    expect(faces).toHaveLength(1);
    expect(faces[0].area).toBeCloseTo(12_000_000, 3);
    // The extra collinear vertex at (2000, 0) is retained in the traced face.
    expect(faces[0].points).toHaveLength(5);
  });

  it('does not split a room for an interior T-stub that dead-ends', () => {
    // A wall stub protrudes into the interior but does not reach the far side,
    // so it cannot close a second face. Still exactly one room.
    const walls = [
      ...rectangleWalls(),
      wall(2000, 0, 2000, 1500), // dead-end stub
    ];
    const faces = detectRoomFaces(walls);
    expect(faces).toHaveLength(1);
    expect(faces[0].area).toBeCloseTo(12_000_000, 3);
    // The traced boundary walks up one side of the stub and back down the other,
    // producing extra vertices around the dead-end (current behavior: 7 vertices).
    expect(faces[0].points).toHaveLength(7);
  });

  it('tolerates a duplicated wall (same endpoints) without producing a duplicate room', () => {
    const walls = [
      ...rectangleWalls(),
      wall(0, 0, 4000, 0), // exact duplicate of the first wall
    ];
    const rooms = detectRooms(walls);
    expect(rooms).toHaveLength(1);
    expect(rooms[0].area).toBeCloseTo(12_000_000, 3);
  });

  it('merges endpoints within the merge tolerance (nearly-coincident corners)', () => {
    // Corners are off by 0.5mm, below the default ENDPOINT_MERGE_TOLERANCE of 1mm,
    // so the loop still closes into a room.
    const walls = [
      wall(0, 0, 4000, 0),
      wall(4000, 0.5, 4000, 3000),
      wall(4000.5, 3000, 0, 3000),
      wall(0.5, 3000, 0, 0),
    ];
    const rooms = detectRooms(walls);
    expect(rooms).toHaveLength(1);
    expect(rooms[0].area).toBeCloseTo(12_000_000, -2); // within a few thousand mm²
  });
});

describe('findRoomFaceAtPoint', () => {
  it('returns the face containing a query point', () => {
    const walls = rectangleWalls();
    const face = findRoomFaceAtPoint(walls, [], { x: 2000, y: 1500 });
    expect(face).not.toBeNull();
    expect(face.area).toBeCloseTo(12_000_000, 3);
  });

  it('returns null when the point is outside all rooms', () => {
    const walls = rectangleWalls();
    expect(findRoomFaceAtPoint(walls, [], { x: 9000, y: 9000 })).toBeNull();
  });

  it('returns the smaller enclosing face when rooms are nested/overlapping in query', () => {
    // Two adjacent rooms: a point in the left room resolves to the left face.
    const walls = [...rectangleWalls(), wall(2000, 0, 2000, 3000)];
    const face = findRoomFaceAtPoint(walls, [], { x: 1000, y: 1500 });
    expect(face).not.toBeNull();
    expect(face.area).toBeCloseTo(6_000_000, 3);
  });
});

describe('roomPolygonKey', () => {
  it('produces the same key regardless of starting vertex (rotation invariance)', () => {
    const a = [
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 4000, y: 3000 },
      { x: 0, y: 3000 },
    ];
    const rotated = [a[2], a[3], a[0], a[1]];
    expect(roomPolygonKey(a)).toBe(roomPolygonKey(rotated));
  });

  it('produces the same key regardless of winding direction (reversal invariance)', () => {
    const a = [
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 4000, y: 3000 },
      { x: 0, y: 3000 },
    ];
    expect(roomPolygonKey(a)).toBe(roomPolygonKey([...a].reverse()));
  });

  it('returns an empty string for an empty point list', () => {
    expect(roomPolygonKey([])).toBe('');
  });

  it('produces different keys for genuinely different polygons', () => {
    const a = [
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 4000, y: 3000 },
      { x: 0, y: 3000 },
    ];
    const b = [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 1000 },
      { x: 0, y: 1000 },
    ];
    expect(roomPolygonKey(a)).not.toBe(roomPolygonKey(b));
  });
});
