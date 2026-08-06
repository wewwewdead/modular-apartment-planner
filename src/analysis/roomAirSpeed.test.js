import { describe, expect, it } from 'vitest';
import { createProject, createRoom, createWall, createWindow } from '@/domain/models';
import {
  computeRoomAirSpeed,
  ROOM_AIR_SPEED_BAND_FRACTION,
  ROOM_AIR_SPEED_METHOD,
  UNRESOLVED_ROOM_AIR_SPEED,
} from './roomAirSpeed';
import { computeVentilationNetwork } from './ventilationNetwork';

/**
 * A 10 m x 8 m room, 3 m tall, on the origin. Every analytic case below reads
 * its cross-sections straight off these numbers:
 *
 *   flow along +y (north -> south)  cross-section = 10 m x 3 m = 30 m²
 *   flow along +x (west  -> east )  cross-section =  8 m x 3 m = 24 m²
 */
const ROOM = Object.freeze({
  id: 'room',
  heightMm: 3000,
  polygon: [
    { x: 0, y: 0 },
    { x: 10000, y: 0 },
    { x: 10000, y: 8000 },
    { x: 0, y: 8000 },
  ],
});

/** Exterior opening on the room's A side; `flowM3s > 0` leaves the room. */
function exteriorOpening(id, centre, flowM3s, effectiveAreaM2 = 1) {
  return { id, roomAId: ROOM.id, roomBId: null, exterior: true, centre, flowM3s, effectiveAreaM2 };
}

describe('room air speed — the analytic two-opening case', () => {
  it('is exactly through-flow over the flow-normal cross-section', () => {
    // North wall takes 3 m³/s in, south wall puts 3 m³/s out. Through-flow is
    // the matched volume, 3 m³/s, not the 6 m³/s sum of both halves.
    const result = computeRoomAirSpeed({
      room: ROOM,
      openings: [exteriorOpening('north', { x: 5000, y: 0 }, -3), exteriorOpening('south', { x: 5000, y: 8000 }, 3)],
    });

    expect(result.throughFlowM3s).toBe(3);
    expect(result.flowNormal.x).toBeCloseTo(0, 12);
    expect(result.flowNormal.y).toBeCloseTo(1, 12);
    expect(result.crossSectionM2).toBeCloseTo(30, 12);
    expect(result.speedMs).toBeCloseTo(3 / 30, 12);
  });

  it('turns the cross-section with the flow when the pair runs east-west', () => {
    const result = computeRoomAirSpeed({
      room: ROOM,
      openings: [exteriorOpening('west', { x: 0, y: 4000 }, -3), exteriorOpening('east', { x: 10000, y: 4000 }, 3)],
    });

    expect(result.flowNormal.x).toBeCloseTo(1, 12);
    expect(result.flowNormal.y).toBeCloseTo(0, 12);
    // Now the flow spreads across the 8 m face, not the 10 m one.
    expect(result.crossSectionM2).toBeCloseTo(24, 12);
    expect(result.speedMs).toBeCloseTo(3 / 24, 12);
  });

  it('weights the inlet and outlet centroids by effective opening area', () => {
    // Two inlets on the north wall, one four times the area of the other; the
    // inlet centroid must land at 1/5 of the way from the big one to the small.
    const result = computeRoomAirSpeed({
      room: ROOM,
      openings: [
        exteriorOpening('north-big', { x: 0, y: 0 }, -4, 4),
        exteriorOpening('north-small', { x: 10000, y: 0 }, -1, 1),
        exteriorOpening('south', { x: 2000, y: 8000 }, 5, 5),
      ],
    });

    // Inlet centroid x = (0*4 + 10000*1)/5 = 2000, which is the outlet's x too,
    // so the resolved direction is exactly due +y.
    expect(result.flowNormal.x).toBeCloseTo(0, 12);
    expect(result.flowNormal.y).toBeCloseTo(1, 12);
    expect(result.throughFlowM3s).toBe(5);
    expect(result.speedMs).toBeCloseTo(5 / 30, 12);
  });

  it('reports an internal door from the far room’s point of view', () => {
    // Sign convention check: `flowM3s > 0` moves A -> B, so for room B the same
    // opening is an INLET. Getting this backwards would flip the flow normal.
    const result = computeRoomAirSpeed({
      room: ROOM,
      openings: [
        { id: 'door', roomAId: 'other', roomBId: ROOM.id, exterior: false, centre: { x: 5000, y: 0 }, flowM3s: 2 },
        exteriorOpening('south', { x: 5000, y: 8000 }, 2),
      ],
    });

    expect(result.flowNormal.y).toBeCloseTo(1, 12);
    expect(result.throughFlowM3s).toBe(2);
  });
});

describe('room air speed — the single-opening fallback', () => {
  it('falls back to the polygon’s long axis, so the narrow face is the cross-section', () => {
    const result = computeRoomAirSpeed({
      room: ROOM,
      openings: [exteriorOpening('north', { x: 5000, y: 0 }, -2)],
    });

    // Long axis of a 10 x 8 rectangle is the 10 m side: flow along +x, and the
    // cross-section is the 8 m face. Half of 2 m³/s crosses at any instant.
    expect(Math.abs(result.flowNormal.x)).toBeCloseTo(1, 12);
    expect(Math.abs(result.flowNormal.y)).toBeCloseTo(0, 12);
    expect(result.crossSectionM2).toBeCloseTo(24, 12);
    expect(result.throughFlowM3s).toBe(1);
    expect(result.speedMs).toBeCloseTo(1 / 24, 12);
  });

  it('takes the long SIDE of a rectangle, not its diagonal', () => {
    // The furthest-apart pair of vertices in this room is the diagonal, whose
    // perpendicular extent is 12.50 m — wider than either side, and not a room
    // dimension at all. The principal axis returns 8 m.
    const result = computeRoomAirSpeed({
      room: ROOM,
      openings: [exteriorOpening('north', { x: 5000, y: 0 }, -2)],
    });
    expect(result.crossSectionM2 / 3).toBeCloseTo(8, 9);
  });

  it('gives the same axis whichever way the polygon is wound', () => {
    const reversed = { ...ROOM, polygon: [...ROOM.polygon].reverse() };
    const forward = computeRoomAirSpeed({ room: ROOM, openings: [exteriorOpening('n', { x: 5000, y: 0 }, -2)] });
    const backward = computeRoomAirSpeed({ room: reversed, openings: [exteriorOpening('n', { x: 5000, y: 0 }, -2)] });
    expect(backward.crossSectionM2).toBeCloseTo(forward.crossSectionM2, 12);
  });

  it('falls back when two openings sit on the same point and cannot name a direction', () => {
    const result = computeRoomAirSpeed({
      room: ROOM,
      openings: [exteriorOpening('in', { x: 5000, y: 0 }, -2), exteriorOpening('out', { x: 5000, y: 0 }, 2)],
    });
    expect(Math.abs(result.flowNormal.x)).toBeCloseTo(1, 12);
    expect(result.crossSectionM2).toBeCloseTo(24, 12);
  });

  it('resolves a square room deterministically rather than by floating-point luck', () => {
    const square = {
      id: 'square',
      heightMm: 3000,
      polygon: [
        { x: 0, y: 0 },
        { x: 6000, y: 0 },
        { x: 6000, y: 6000 },
        { x: 0, y: 6000 },
      ],
    };
    const openings = [{ id: 'w', roomAId: 'square', roomBId: null, centre: { x: 0, y: 3000 }, flowM3s: -1.8 }];
    const first = computeRoomAirSpeed({ room: square, openings });
    const second = computeRoomAirSpeed({ room: square, openings });
    expect(first.flowNormal).toEqual(second.flowNormal);
    expect(first.crossSectionM2).toBeCloseTo(18, 9);
  });
});

describe('room air speed — a band on every path that reports a number', () => {
  it('brackets the index at the fixed uncertainty fraction', () => {
    const result = computeRoomAirSpeed({
      room: ROOM,
      openings: [exteriorOpening('north', { x: 5000, y: 0 }, -3), exteriorOpening('south', { x: 5000, y: 8000 }, 3)],
    });
    expect(ROOM_AIR_SPEED_BAND_FRACTION).toBe(0.5);
    expect(result.band.lowMs).toBeCloseTo(result.speedMs * 0.5, 12);
    expect(result.band.highMs).toBeCloseTo(result.speedMs * 1.5, 12);
    expect(result.band.fraction).toBe(0.5);
  });

  it('still bands a modelled zero, and keeps it distinct from a null', () => {
    const result = computeRoomAirSpeed({
      room: ROOM,
      openings: [exteriorOpening('north', { x: 5000, y: 0 }, 0)],
    });
    expect(result.speedMs).toBe(0);
    expect(result.band).toEqual({ lowMs: 0, highMs: 0, fraction: 0.5 });
  });

  it('reports no speed AND no band when there is nothing to compute', () => {
    expect(computeRoomAirSpeed({ room: ROOM, openings: [] })).toBe(UNRESOLVED_ROOM_AIR_SPEED);
    expect(computeRoomAirSpeed({ room: { ...ROOM, heightMm: 0 }, openings: [] })).toBe(UNRESOLVED_ROOM_AIR_SPEED);
    expect(computeRoomAirSpeed({ room: { ...ROOM, polygon: [{ x: 0, y: 0 }] }, openings: [] })).toBe(
      UNRESOLVED_ROOM_AIR_SPEED,
    );
    expect(UNRESOLVED_ROOM_AIR_SPEED.speedMs).toBeNull();
    expect(UNRESOLVED_ROOM_AIR_SPEED.band).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Integration: every room the network reports carries the pair               */
/* -------------------------------------------------------------------------- */

function pressureGrid() {
  const columns = 20;
  const rows = 18;
  const pressureCoefficient = new Float32Array(columns * rows);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      pressureCoefficient[row * columns + column] = row < 5 ? 0.6 : -0.3;
    }
  }
  return {
    columns,
    rows,
    cellSize: 1000,
    origin: { x: -5000, y: -5000 },
    obstacles: new Uint8Array(columns * rows),
    pressureCoefficient,
    velocityX: new Float32Array(columns * rows),
    velocityY: new Float32Array(columns * rows),
  };
}

/** Two rooms: the west one cross-ventilated, the east one sealed off. */
function twoRoomProject() {
  const project = createProject('Air speed');
  const floor = project.floors[0];
  const outer = [
    { x: 0, y: 0 },
    { x: 10000, y: 0 },
    { x: 10000, y: 8000 },
    { x: 0, y: 8000 },
  ];
  floor.walls = outer.map((point, index) => createWall(point, outer[(index + 1) % outer.length], 200));
  floor.walls.push(createWall({ x: 5000, y: 0 }, { x: 5000, y: 8000 }, 150));
  floor.rooms = [
    createRoom('West', [outer[0], { x: 5000, y: 0 }, { x: 5000, y: 8000 }, outer[3]]),
    createRoom('East', [{ x: 5000, y: 0 }, outer[1], outer[2], { x: 5000, y: 8000 }]),
  ];
  // Both on the west half: north wall in, south wall out.
  floor.windows = [createWindow(floor.walls[0].id, 2000, 1600), createWindow(floor.walls[2].id, 8000, 1600)];
  return project;
}

describe('ventilation network — room air speed by construction', () => {
  const result = computeVentilationNetwork({ project: twoRoomProject(), grid: pressureGrid(), referenceSpeed: 5 });

  it('names the method once on the model, never on a room', () => {
    expect(result.model.includesRoomAirSpeed).toBe(true);
    expect(result.model.airSpeedMethod).toBe(ROOM_AIR_SPEED_METHOD);
    expect(result.model.airSpeedMethod).toBe('bulk-cross-section');
    for (const room of result.rooms) expect(room.airSpeedMethod).toBeUndefined();
  });

  it('gives every assessed room a finite speed inside its own band', () => {
    const assessed = result.rooms.filter((room) => room.connectedToExterior);
    expect(assessed.length).toBeGreaterThan(0);
    for (const room of assessed) {
      expect(Number.isFinite(room.airSpeedMs), room.id).toBe(true);
      expect(room.airSpeedBand.lowMs, room.id).toBeLessThanOrEqual(room.airSpeedMs);
      expect(room.airSpeedBand.highMs, room.id).toBeGreaterThanOrEqual(room.airSpeedMs);
    }
  });

  it('leaves the unassessed room null on both fields, not zero', () => {
    const east = result.rooms.find((room) => room.name === 'East');
    expect(east.connectedToExterior).toBe(false);
    expect(east.airSpeedMs).toBeNull();
    expect(east.airSpeedBand).toBeNull();
    // The distinction this preserves: its ACH really is a hard zero.
    expect(east.airChangesPerHour).toBe(0);
  });

  it('reproduces the analytic index for the room it can be checked by hand', () => {
    const west = result.rooms.find((room) => room.name === 'West');
    // 5 m x 8 m room, 3 m tall, flow north to south: cross-section 5 x 3 = 15 m².
    const throughFlowM3s = (west.inflowM3s + west.outflowM3s) / 2;
    expect(west.airSpeedMs).toBeCloseTo(throughFlowM3s / 15, 9);
  });
});
