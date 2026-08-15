import { describe, expect, it } from 'vitest';
import {
  applyIsometricOrthoPoint,
  buildIsometricEllipse,
  buildIsometricPlaneRectangle,
  getIsometricGridData,
  inferIsometricPlaneForAngle,
  inferIsometricPlaneFromDirections,
  resolveIsometricPlaneFromEntities,
  withIsometricPlaneMeta,
} from './isometricUtils';

const RIGHT = { x: Math.cos(Math.PI / 6), y: Math.sin(Math.PI / 6) };
const LEFT = { x: -Math.cos(Math.PI / 6), y: Math.sin(Math.PI / 6) };
const VERTICAL = { x: 0, y: 1 };

function directionAt(angleDeg) {
  const radians = (angleDeg * Math.PI) / 180;
  return { x: Math.cos(radians), y: Math.sin(radians) };
}

function flip(direction) {
  return { x: -direction.x, y: -direction.y };
}

describe('isometricUtils', () => {
  it('constrains points to the nearest isometric axis', () => {
    const constrained = applyIsometricOrthoPoint({ x: 0, y: 0 }, { x: 120, y: 20 });

    expect(constrained.x).toBeCloseTo(98.7, 1);
    expect(constrained.y).toBeCloseTo(57, 1);
  });

  it('builds plane-aligned isometric rectangles', () => {
    const shape = buildIsometricPlaneRectangle({ x: 0, y: 0 }, { x: 100, y: 60 }, 'top');

    expect(shape.points).toHaveLength(4);
    expect(shape.width).toBeGreaterThan(0);
    expect(shape.height).toBeGreaterThan(0);
  });

  it('builds ellipses for projected circles', () => {
    const ellipse = buildIsometricEllipse({ x: 0, y: 0 }, { x: 50, y: 0 }, 'left');

    expect(ellipse.rx).toBeGreaterThan(ellipse.ry);
    expect(Math.abs(ellipse.rotation)).toBeGreaterThan(0);
  });

  it('builds three-family isometric grid lines', () => {
    const grid = getIsometricGridData({ zoom: 1, panX: 0, panY: 0 }, { width: 800, height: 600 });

    expect(grid.isoMinor.length).toBeGreaterThan(0);
    expect(grid.isoMajor.length).toBeGreaterThan(0);
    expect(grid.axis).toHaveLength(3);
  });

  it('resolves each isometric plane from the axis pair its rays lie on', () => {
    expect(inferIsometricPlaneFromDirections(LEFT, RIGHT, 'top')).toBe('top');
    expect(inferIsometricPlaneFromDirections(LEFT, VERTICAL, 'top')).toBe('left');
    expect(inferIsometricPlaneFromDirections(RIGHT, VERTICAL, 'top')).toBe('right');
  });

  it('reads axis families as lines, so flipped rays resolve the same plane', () => {
    expect(inferIsometricPlaneFromDirections(flip(LEFT), flip(VERTICAL), 'top')).toBe('left');
    expect(inferIsometricPlaneFromDirections(flip(RIGHT), VERTICAL, 'top')).toBe('right');
    expect(inferIsometricPlaneFromDirections(RIGHT, flip(LEFT), 'right')).toBe('top');
  });

  it('claims a ray for a family only inside the match tolerance', () => {
    expect(inferIsometricPlaneFromDirections(directionAt(44), VERTICAL, 'top')).toBe('right');
    expect(inferIsometricPlaneFromDirections(directionAt(46), VERTICAL, 'top')).toBe('top');
  });

  it('falls back to the ui plane for unclassified or single-family ray pairs', () => {
    expect(inferIsometricPlaneFromDirections(directionAt(0), directionAt(70), 'left')).toBe('left');
    expect(inferIsometricPlaneFromDirections(RIGHT, directionAt(0), 'top')).toBe('top');
    expect(inferIsometricPlaneFromDirections(VERTICAL, flip(VERTICAL), 'top')).toBe('top');
    expect(inferIsometricPlaneFromDirections(LEFT, LEFT, null)).toBeNull();
  });

  it('sweeps an anchored ray into the plane the loose ray points at', () => {
    expect(inferIsometricPlaneForAngle(VERTICAL, directionAt(0), 'top')).toBe('right');
    expect(inferIsometricPlaneForAngle(VERTICAL, directionAt(180), 'top')).toBe('left');
    expect(inferIsometricPlaneForAngle(directionAt(0), VERTICAL, 'top')).toBe('right');
  });

  it('keeps the ui plane whenever it can already contain the anchored ray', () => {
    expect(inferIsometricPlaneForAngle(RIGHT, directionAt(0), 'top')).toBe('top');
    expect(inferIsometricPlaneForAngle(RIGHT, directionAt(0), 'right')).toBe('right');
    expect(inferIsometricPlaneForAngle(directionAt(0), directionAt(70), 'top')).toBe('top');
  });
});

describe('isometric provenance', () => {
  const rightLine = { id: 'a', meta: { isometricPlane: 'right' } };
  const leftLine = { id: 'b', meta: { isometricPlane: 'left' } };
  const plainLine = { id: 'c', meta: {} };

  it('agrees on a plane only when every stamped source names the same one', () => {
    expect(resolveIsometricPlaneFromEntities([rightLine, rightLine])).toBe('right');
    expect(resolveIsometricPlaneFromEntities([rightLine, null])).toBe('right');
    expect(resolveIsometricPlaneFromEntities([null, rightLine, plainLine])).toBe('right');
    expect(resolveIsometricPlaneFromEntities([rightLine, leftLine])).toBeNull();
    expect(resolveIsometricPlaneFromEntities([plainLine, null])).toBeNull();
    expect(resolveIsometricPlaneFromEntities([])).toBeNull();
    expect(resolveIsometricPlaneFromEntities(undefined)).toBeNull();
  });

  it('stamps the drawing plane only while isometric mode is active', () => {
    const entity = { id: 'line-1', type: 'line', meta: {} };

    expect(withIsometricPlaneMeta(entity, 'isometric', 'right').meta).toEqual({ isometricPlane: 'right' });
    expect(withIsometricPlaneMeta(entity, 'plan', 'right')).toBe(entity);
    expect(withIsometricPlaneMeta(entity, 'isometric', null)).toBe(entity);
    expect(withIsometricPlaneMeta(null, 'isometric', 'right')).toBeNull();
  });

  it('keeps the entity out of the isometric-projection filter', () => {
    // projectionMode is what filterNonIsometricEntities keys off; lines record
    // only the plane so their profile-source behaviour is unchanged.
    expect(withIsometricPlaneMeta({ meta: { label: 'Leg' } }, 'isometric', 'right').meta).toEqual({
      label: 'Leg',
      isometricPlane: 'right',
    });
    expect(withIsometricPlaneMeta({ meta: {} }, 'isometric', 'right').meta.projectionMode).toBeUndefined();
  });
});
