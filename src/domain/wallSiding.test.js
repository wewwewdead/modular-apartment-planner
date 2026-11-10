import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SIDING_COURSE,
  SIDING_BOARD_LENGTH,
  normalizeSidingCourse,
  parseSidingCourseKey,
  sidingBoardCountAcross,
  sidingCourseDatum,
  sidingCourseKey,
  sidingCoursePitch,
  sidingJointPositions,
  wallSidingCourseLines,
} from './wallSiding';

const COURSE = { orientation: 'horizontal', exposure: 140, joint: 6 };

describe('siding courses', () => {
  it('defaults, clamps and rounds a course to whole millimetres', () => {
    expect(normalizeSidingCourse(undefined)).toEqual(DEFAULT_SIDING_COURSE);
    expect(normalizeSidingCourse({ orientation: 'diagonal', exposure: 12, joint: 99 })).toEqual({
      orientation: 'horizontal',
      exposure: 40,
      joint: 30,
    });
    expect(normalizeSidingCourse({ orientation: 'vertical', exposure: 900, joint: -3 })).toEqual({
      orientation: 'vertical',
      exposure: 400,
      joint: 0,
    });
    expect(normalizeSidingCourse({ exposure: 139.6, joint: 'x' })).toEqual({ ...DEFAULT_SIDING_COURSE, exposure: 140 });
    expect(sidingCoursePitch(COURSE)).toBe(146);
    expect(SIDING_BOARD_LENGTH).toBe(3600);
  });

  it('writes and reads its key, and refuses one it could not have written', () => {
    expect(sidingCourseKey(COURSE)).toBe('h140j6');
    expect(sidingCourseKey({ orientation: 'vertical', exposure: 90, joint: 0 })).toBe('v90j0');
    expect(parseSidingCourseKey('h140j6')).toEqual(COURSE);
    expect(parseSidingCourseKey('v90j0')).toEqual({ orientation: 'vertical', exposure: 90, joint: 0 });
    // Out of range would not round-trip; nonsense is not a key.
    expect(parseSidingCourseKey('h10j6')).toBeNull();
    expect(parseSidingCourseKey('h140j06')).toBeNull();
    expect(parseSidingCourseKey('x140j6')).toBeNull();
    expect(parseSidingCourseKey(undefined)).toBeNull();
  });
});

describe('the project-datum set-out (spec §6.1)', () => {
  const wall = { start: { x: 0, y: 0 }, end: { x: 4000, y: 0 } };

  it('puts a horizontal joint at every world elevation k × pitch: base 300, pitch 146 → first line at v = 138', () => {
    const lines = wallSidingCourseLines(COURSE, { wall, frame: { base: 300, height: 1000, length: 4000 } });
    expect(lines.axis).toBe('v');
    expect(lines.pitch).toBe(146);
    expect(lines.positions[0]).toBe(138);
    expect(lines.positions).toEqual([138, 284, 430, 576, 722, 868]);
    for (const v of lines.positions) expect((v + 300) % 146).toBe(0);
  });

  it('includes a joint that lands exactly on the face edge, and nothing past it', () => {
    expect(sidingJointPositions(146, 0, 0, 292)).toEqual([0, 146, 292]);
    expect(sidingJointPositions(146, 0, 0.5, 291.5)).toEqual([146]);
    expect(sidingJointPositions(0, 0, 0, 100)).toEqual([]);
  });

  it('sets vertical boards out along the wall direction from the plan origin, for a wall that starts off the grid', () => {
    const vertical = { orientation: 'vertical', exposure: 140, joint: 6 };
    // Starts 1000 mm along +x from the origin: dot(start, d) = 1000, and
    // 1022 = 7 × 146 is the first joint, so u = 22.
    const offGrid = { start: { x: 1000, y: 250 }, end: { x: 5000, y: 250 } };
    expect(sidingCourseDatum(vertical, offGrid)).toBe(1000);
    const lines = wallSidingCourseLines(vertical, {
      wall: offGrid,
      frame: { base: 0, height: 2400, length: 4000 },
      span: { u0: 0, u1: 4000 },
    });
    expect(lines.axis).toBe('u');
    expect(lines.positions[0]).toBe(22);
    for (const u of lines.positions) expect((u + 1000) % 146).toBeCloseTo(0, 6);
    // Reversed, the same physical joints come back measured from the other end.
    const reversed = { start: offGrid.end, end: offGrid.start };
    const back = wallSidingCourseLines(vertical, {
      wall: reversed,
      frame: { base: 0, height: 2400, length: 4000 },
      span: { u0: 0, u1: 4000 },
    });
    const xs = (positions, from, sign) => positions.map((u) => from + sign * u).sort((a, b) => a - b);
    expect(xs(back.positions, 5000, -1)).toEqual(xs(lines.positions, 1000, 1));
  });

  it('gives two walls meeting at a corner the same horizontal lines, and storeys that stack the same courses', () => {
    const south = { start: { x: 0, y: 0 }, end: { x: 4000, y: 0 } };
    const east = { start: { x: 4000, y: 0 }, end: { x: 4000, y: 3000 } };
    const frame = { base: 3000, height: 2700, length: 4000 };
    const southLines = wallSidingCourseLines(COURSE, { wall: south, frame });
    const eastLines = wallSidingCourseLines(COURSE, { wall: east, frame: { ...frame, length: 3000 } });
    expect(eastLines.positions).toEqual(southLines.positions);
    // The storey below, 3000 lower: its world elevations of joints continue
    // the same k × pitch series across the floor line.
    const below = wallSidingCourseLines(COURSE, { wall: south, frame: { base: 0, height: 3000, length: 4000 } });
    const world = (lines, base) => lines.positions.map((v) => v + base);
    const series = [...world(below, 0), ...world(southLines, 3000)];
    for (const elevation of series) expect(elevation % 146).toBeCloseTo(0, 6);
  });

  it('counts the boards a face is set out in', () => {
    expect(sidingBoardCountAcross([0, 146, 292], 0, 292)).toBe(2);
    expect(sidingBoardCountAcross([138, 284], 0, 400)).toBe(3);
  });
});
