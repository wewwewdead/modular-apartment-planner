import { describe, expect, it } from 'vitest';
import { getHardwarePattern } from './fastenerUtils';
import {
  buildHardwarePatternFeatureConfigs,
  resolveHardwarePatternPlacement,
  resolveNearestEdgeFrame,
} from './hardwarePatternUtils';

const HINGE = getHardwarePattern('hw-hinge-concealed-35');
const HANDLE = getHardwarePattern('hw-handle-bar-96');

/** A 400 x 700mm door panel at (100, 100). */
const DOOR = { id: 'rect-1', type: 'rect', x: 100, y: 100, width: 400, height: 700, rotation: 0 };

describe('getHardwarePattern', () => {
  it('resolves the built-in hinge and handle patterns', () => {
    expect(HINGE).toMatchObject({ hardwareId: 'hw-hinge-concealed-35', kind: 'hinge', anchor: 'edge' });
    expect(HINGE.holes).toHaveLength(3);
    expect(HANDLE).toMatchObject({ hardwareId: 'hw-handle-bar-96', kind: 'handle', anchor: 'center' });
    expect(HANDLE.holes).toHaveLength(2);
  });

  it('returns null for plain fasteners and unknown ids', () => {
    expect(getHardwarePattern('hw-screw-8-32')).toBeNull();
    expect(getHardwarePattern('not-a-thing')).toBeNull();
    expect(getHardwarePattern(null)).toBeNull();
  });
});

describe('resolveNearestEdgeFrame', () => {
  it('picks the left edge for a click near it, with the normal pointing into the part', () => {
    const frame = resolveNearestEdgeFrame(DOOR, { x: 110, y: 400 });

    expect(frame.dir.x).toBeCloseTo(0);
    expect(Math.abs(frame.dir.y)).toBeCloseTo(1);
    expect(frame.normal.x).toBeCloseTo(1);
    expect(frame.normal.y).toBeCloseTo(0);
  });

  it('picks the top edge for a click near it, with the normal pointing down into the part', () => {
    const frame = resolveNearestEdgeFrame(DOOR, { x: 300, y: 105 });

    expect(Math.abs(frame.dir.x)).toBeCloseTo(1);
    expect(frame.normal.x).toBeCloseTo(0);
    expect(frame.normal.y).toBeCloseTo(1);
  });

  it('orients to the nearest segment of a closed polyline with an inward normal', () => {
    const triangle = {
      id: 'poly-1',
      type: 'polyline',
      closed: true,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 50, y: 100 },
      ],
    };
    const frame = resolveNearestEdgeFrame(triangle, { x: 50, y: 5 });

    // Nearest is the top edge (0,0)-(100,0); interior is below it.
    expect(frame.normal.y).toBeGreaterThan(0);
  });

  it('returns null when the target has no usable segments', () => {
    expect(resolveNearestEdgeFrame(null, { x: 0, y: 0 })).toBeNull();
    expect(resolveNearestEdgeFrame({ id: 'c1', type: 'circle', cx: 0, cy: 0, r: 50 }, { x: 0, y: 0 })).toBeNull();
  });
});

describe('resolveHardwarePatternPlacement', () => {
  it('places the hinge cup 22.5mm in from the clicked edge and pilots on the 32mm line', () => {
    const placement = resolveHardwarePatternPlacement(HINGE, { x: 104, y: 400 }, DOOR);
    const [cup, pilotA, pilotB] = placement.holes;

    expect(cup).toMatchObject({ diameter: 35, depth: 13, through: false, role: 'cup' });
    expect(cup.cx).toBeCloseTo(100 + 22.5);
    expect(cup.cy).toBeCloseTo(400);

    for (const pilot of [pilotA, pilotB]) {
      expect(pilot).toMatchObject({ diameter: 2.5, depth: 11, through: false, role: 'pilot' });
      expect(pilot.cx).toBeCloseTo(100 + 32);
    }
    expect(Math.abs(pilotA.cy - pilotB.cy)).toBeCloseTo(45);
  });

  it('clamps an edge-anchored pattern so every hole stays on the part', () => {
    // Click almost at the top corner of the left edge.
    const placement = resolveHardwarePatternPlacement(HINGE, { x: 104, y: 101 }, DOOR);
    const minCy = Math.min(...placement.holes.map((hole) => hole.cy - hole.diameter / 2));

    expect(minCy).toBeGreaterThanOrEqual(100);
  });

  it('keeps a center-anchored handle centred on the click, oriented along the nearest edge', () => {
    const placement = resolveHardwarePatternPlacement(HANDLE, { x: 150, y: 400 }, DOOR);
    const [a, b] = placement.holes;

    // Left edge is nearest -> holes spread vertically, 96mm apart, at the click x.
    expect(a.cx).toBeCloseTo(150);
    expect(b.cx).toBeCloseTo(150);
    expect(Math.abs(a.cy - b.cy)).toBeCloseTo(96);
    expect((a.cy + b.cy) / 2).toBeCloseTo(400);
    expect(a).toMatchObject({ through: true, depth: null });
  });

  it('spreads a handle horizontally when the nearest edge is horizontal', () => {
    const placement = resolveHardwarePatternPlacement(HANDLE, { x: 300, y: 130 }, DOOR);
    const [a, b] = placement.holes;

    expect(Math.abs(a.cx - b.cx)).toBeCloseTo(96);
    expect(a.cy).toBeCloseTo(130);
    expect(b.cy).toBeCloseTo(130);
  });

  it('falls back to a vertical frame when there is no target part', () => {
    const placement = resolveHardwarePatternPlacement(HINGE, { x: 0, y: 0 }, null);
    const [cup, pilotA, pilotB] = placement.holes;

    expect(placement.frame.onEdge).toBe(false);
    expect(cup.cx).toBeCloseTo(22.5);
    expect(cup.cy).toBeCloseTo(0);
    expect(pilotA.cx).toBeCloseTo(32);
    expect(Math.abs(pilotA.cy - pilotB.cy)).toBeCloseTo(45);
  });

  it('returns null for a missing pattern or point', () => {
    expect(resolveHardwarePatternPlacement(null, { x: 0, y: 0 }, DOOR)).toBeNull();
    expect(resolveHardwarePatternPlacement(HINGE, null, DOOR)).toBeNull();
  });
});

describe('buildHardwarePatternFeatureConfigs', () => {
  it('marks only the first hole as the billed catalog item', () => {
    const configs = buildHardwarePatternFeatureConfigs(HINGE, { x: 104, y: 400 }, DOOR, { targetPartId: DOOR.id });

    expect(configs).toHaveLength(3);
    expect(configs[0].hardwareId).toBe('hw-hinge-concealed-35');
    expect(configs[1].hardwareId).toBeNull();
    expect(configs[2].hardwareId).toBeNull();

    for (const config of configs) {
      expect(config).toMatchObject({ featureType: 'hole', operation: 'subtract', shape: 'circle' });
      expect(config.targetPartId).toBe(DOOR.id);
      expect(config.meta.hardwareKind).toBe('hinge');
    }
  });

  it('maps through holes to a null depth', () => {
    const configs = buildHardwarePatternFeatureConfigs(HANDLE, { x: 300, y: 400 }, DOOR);

    for (const config of configs) {
      expect(config.through).toBe(true);
      expect(config.depth).toBeNull();
    }
  });
});
