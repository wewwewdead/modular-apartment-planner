import { describe, expect, it } from 'vitest';
import { deviceOutlineOnWall, snapOffsetToWallColumns, wallSideOfPoint } from './wallGeometry';
import { ELECTRICAL_SYMBOL_SIZE } from '@/domain/defaults';

// Wall along +x at y=0, 200 thick: the two faces sit at y=+100 and y=-100.
const WALL = { id: 'wall_1', start: { x: 0, y: 0 }, end: { x: 6000, y: 0 }, thickness: 200 };

describe('wallSideOfPoint', () => {
  it('names the +perpendicular face "right" and the other "left"', () => {
    expect(wallSideOfPoint(WALL, { x: 1000, y: 500 })).toBe('right');
    expect(wallSideOfPoint(WALL, { x: 1000, y: -500 })).toBe('left');
  });

  it('flips with the wall direction, not with world axes', () => {
    const reversed = { ...WALL, start: { x: 6000, y: 0 }, end: { x: 0, y: 0 } };
    expect(wallSideOfPoint(reversed, { x: 1000, y: 500 })).toBe('left');
    expect(wallSideOfPoint(reversed, { x: 1000, y: -500 })).toBe('right');
  });
});

describe('deviceOutlineOnWall', () => {
  it('centres the symbol on the wall face named by side', () => {
    const right = deviceOutlineOnWall(WALL, { offset: 1000, side: 'right' }, ELECTRICAL_SYMBOL_SIZE);
    const left = deviceOutlineOnWall(WALL, { offset: 1000, side: 'left' }, ELECTRICAL_SYMBOL_SIZE);

    expect(right.center).toEqual({ x: 1000, y: 100 });
    expect(left.center).toEqual({ x: 1000, y: -100 });
    // Opposite faces: same point on the wall axis, mirrored across it.
    expect(left.center.y).toBe(-right.center.y);
    expect(left.center.x).toBe(right.center.x);
  });

  it('returns a square of the requested size around that centre', () => {
    const info = deviceOutlineOnWall(WALL, { offset: 1000, side: 'right' }, ELECTRICAL_SYMBOL_SIZE);
    const xs = [info.p1, info.p2, info.p3, info.p4].map((p) => p.x);
    const ys = [info.p1, info.p2, info.p3, info.p4].map((p) => p.y);

    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(ELECTRICAL_SYMBOL_SIZE, 6);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(ELECTRICAL_SYMBOL_SIZE, 6);
    expect(info.angle).toBeCloseTo(0, 6);
  });

  it('rotates the outline with the wall', () => {
    const vertical = { id: 'wall_v', start: { x: 0, y: 0 }, end: { x: 0, y: 6000 }, thickness: 200 };
    const info = deviceOutlineOnWall(vertical, { offset: 1000, side: 'right' }, ELECTRICAL_SYMBOL_SIZE);

    expect(info.center.x).toBeCloseTo(-100, 6);
    expect(info.center.y).toBeCloseTo(1000, 6);
    expect(info.angle).toBeCloseTo(Math.PI / 2, 6);
  });
});

describe('snapOffsetToWallColumns', () => {
  // 400×400 column centred on the wall axis at x=3000: faces at 2800 and 3200.
  const COLUMN = { id: 'col_1', x: 3000, y: 0, width: 400, depth: 400, rotation: 0 };
  const DEVICE_WIDTH = 100;

  it('snaps flush to the near column face from either side', () => {
    expect(snapOffsetToWallColumns(WALL, 2700, [COLUMN], DEVICE_WIDTH)).toBe(2800 - DEVICE_WIDTH / 2);
    expect(snapOffsetToWallColumns(WALL, 3300, [COLUMN], DEVICE_WIDTH)).toBe(3200 + DEVICE_WIDTH / 2);
  });

  it('leaves the offset alone outside the snap distance', () => {
    expect(snapOffsetToWallColumns(WALL, 2400, [COLUMN], DEVICE_WIDTH)).toBe(2400);
    expect(snapOffsetToWallColumns(WALL, 4000, [COLUMN], DEVICE_WIDTH)).toBe(4000);
  });

  it('ignores columns standing clear of the wall band', () => {
    const detached = { ...COLUMN, y: 800 };
    expect(snapOffsetToWallColumns(WALL, 2700, [detached], DEVICE_WIDTH)).toBe(2700);
  });

  it('snaps to a rotated column footprint, not its unrotated box', () => {
    // 45°-rotated square: plan reach along the wall grows to ±(w+d)/2·cos45 ≈ ±282.8
    const rotated = { ...COLUMN, rotation: 45 };
    const reach = ((COLUMN.width + COLUMN.depth) / 2) * Math.cos(Math.PI / 4);
    const snapped = snapOffsetToWallColumns(WALL, 2620, [rotated], DEVICE_WIDTH);
    expect(snapped).toBeCloseTo(3000 - reach - DEVICE_WIDTH / 2, 6);
  });

  it('never snaps a device past the wall ends', () => {
    // Column at the very end of the wall: the far-side flush position (6250)
    // would fall outside the wall, so only the inboard face is offered.
    const endColumn = { ...COLUMN, x: 6000 };
    expect(snapOffsetToWallColumns(WALL, 5850, [endColumn], DEVICE_WIDTH)).toBe(5800 - DEVICE_WIDTH / 2);
    expect(snapOffsetToWallColumns(WALL, 6000, [endColumn], DEVICE_WIDTH)).toBe(6000);
  });
});
