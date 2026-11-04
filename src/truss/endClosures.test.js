import { describe, expect, it } from 'vitest';
import { createFloor } from '@/domain/models';
import { createRoofSystemForProject } from '@/domain/roofModels';
import { createTrussSystem, normalizeTrussSystem } from '@/domain/trussModels';
import { buildRoofPlaneGeometry } from '@/geometry/roofPlaneGeometry';
import {
  END_CLOSURE_MIN_HEIGHT,
  buildEndClosureLayout,
  buildEndClosureObjects,
  closurePlanPoint,
  describeEndClosures,
  endClosureThickness,
} from './endClosures';

const BASE = 3000;

// Copies march along +x at 900 (five of them, 0 … 3600); each truss spans
// along +y, centred on the layout line, so the bearings sit at y = ±span/2.
function system(trussTypeId, instance = {}, options = {}) {
  return createTrussSystem('Trusses', {
    id: 'ts_1',
    floorId: 'floor_1',
    baseElevation: BASE,
    ...options,
    trussInstances: [
      {
        id: 'ti_1',
        trussTypeId,
        span: 7200,
        rise: 1800,
        spacing: 900,
        count: 5,
        overhangs: { start: 300, end: 300 },
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 3600, y: 0 },
        ...instance,
      },
    ],
  });
}

function withEndClosures(trussSystem, changes) {
  return { ...trussSystem, endClosures: { ...trussSystem.endClosures, ...changes } };
}

function attachedRoof(trussSystem) {
  const floor = { ...createFloor('Ground', 0), id: 'floor_1' };
  return createRoofSystemForProject({ floors: [floor], trussSystems: [trussSystem] }, { id: 'roof_1' });
}

const maxZ = (closure) => Math.max(...closure.points.map((point) => point.z));

// RT-3 (spec §7.1): the chords have depth, so the closure top edge — the top
// chord's TOP FACE — sits bc + tc / cos θ above the profile line. For the
// 7200 / 1800 gable (θ = atan 0.5) that is 90 + 90 · √1.25 = 190.62 at the
// heels and 1800 more at the apex; the panel is the triangle standing on a
// 190.62 heel strip.
const GABLE_SECANT = Math.hypot(1, 0.5);
const GABLE_HEEL = 90 + 90 * GABLE_SECANT;
const GABLE_APEX = GABLE_HEEL + 1800;
const GABLE_AREA_M2 = (7200 * GABLE_HEEL + (7200 * 1800) / 2) / 1e6;

describe('end closure defaults', () => {
  it('closes all four sides with fibre cement infill, old saves included', () => {
    const legacy = normalizeTrussSystem({ id: 'ts_old', name: 'Old', trussInstances: [] });
    for (const side of ['start', 'end', 'spanStart', 'spanEnd']) {
      expect(legacy.endClosures[side]).toMatchObject({
        mode: 'infill',
        assemblyPreset: 'fiber_cement',
        vent: { enabled: false, shape: 'rect', width: 600, height: 300, sillOffset: 300 },
      });
      expect(legacy.endClosures[side].colour).toBeUndefined();
    }
    expect(legacy.endClosures.colour).toMatchObject({ hex: '#E9E5DD', catalogue: 'custom' });
  });

  it('keeps stored values and repairs junk', () => {
    const stored = normalizeTrussSystem({
      id: 'ts_2',
      endClosures: {
        start: { mode: 'open', assemblyPreset: 'plywood' },
        end: { mode: 'bogus', assemblyPreset: 'steel', vent: { enabled: true, shape: 'star', width: -5 } },
        colour: { hex: '#5e1d0e', name: 'Manor Red', catalogue: 'colorbond' },
      },
    });
    expect(stored.endClosures.start).toMatchObject({ mode: 'open', assemblyPreset: 'plywood' });
    expect(stored.endClosures.end).toMatchObject({ mode: 'infill', assemblyPreset: 'fiber_cement' });
    expect(stored.endClosures.end.vent).toMatchObject({ enabled: true, shape: 'rect', width: 50 });
    expect(stored.endClosures.colour).toMatchObject({ hex: '#5E1D0E', name: 'Manor Red', catalogue: 'colorbond' });
  });
});

describe('buildEndClosureLayout', () => {
  it('closes both ends of a gable with a 7.2 m × 1.8 m triangle on the heel and no side strips', () => {
    const layout = buildEndClosureLayout(system('truss_type_gable'));
    expect(layout.attached).toBe(false);
    expect(layout.closures.map((closure) => closure.side)).toEqual(['start', 'end']);
    expect(layout.sides.spanStart.available).toBe(false);
    expect(layout.sides.spanEnd.available).toBe(false);

    const [start, end] = layout.closures;
    expect(Math.min(...start.points.map((point) => point.x))).toBeCloseTo(0, 6);
    expect(Math.max(...start.points.map((point) => point.x))).toBeCloseTo(7200, 6);
    expect(maxZ(start)).toBeCloseTo(GABLE_APEX, 6);
    expect(start.areaMm2 / 1e6).toBeCloseTo(GABLE_AREA_M2, 4);
    expect(layout.totalAreaM2).toBeCloseTo(2 * GABLE_AREA_M2, 4);
    // The 150 mm samples on a straight rake collapse to its corners: the two
    // bearing corners, the two heel tops and the apex.
    expect(start.points).toHaveLength(5);
    expect(start.points.filter((point) => point.x === 0 || point.x === 7200).map((point) => point.z)).toEqual([
      0,
      0,
      expect.closeTo(GABLE_HEEL, 6),
      expect.closeTo(GABLE_HEEL, 6),
    ]);

    // End A is the first copy along the layout axis (x = 0), End B the last.
    expect(closurePlanPoint(start, 0).x).toBeCloseTo(0, 6);
    expect(closurePlanPoint(end, 0).x).toBeCloseTo(3600, 6);
    expect(start.thickness).toBe(endClosureThickness('fiber_cement'));
    expect(start.baseElevation).toBe(BASE);
  });

  it('follows the attached roof underside: the chord top face + purlins, a clean gable (RT-3 cured the pentagon)', () => {
    // RT-2 wart: the preset gable roof sat `slope × overhang` above the heel,
    // so the panel kinked into a pentagon. Since RT-3 the attached roof's
    // underside IS the top-chord top face + purlins (spec §7.2), so the panel's
    // rakes are single straight lines from heel to apex.
    const trussSystem = system('truss_type_gable', {}, { purlinSystem: { enabled: true, depth: 50, width: 75 } });
    const roofSystem = attachedRoof(trussSystem);
    expect(roofSystem?.trussAttachmentId).toBe('ts_1');
    const roofGeometry = buildRoofPlaneGeometry(roofSystem);

    const layout = buildEndClosureLayout(trussSystem, null, roofSystem);
    expect(layout.attached).toBe(true);
    const [start] = layout.closures;
    const buildUp = 50 * GABLE_SECANT;
    // Ridge on the layout line (y = 0), at the start copy (x = 0).
    const ridgeUnderside = roofGeometry.getSurfaceElevation({ x: 0, y: 0 }, 'bottom') - BASE;
    expect(ridgeUnderside).toBeCloseTo(GABLE_APEX + buildUp, 6);
    expect(maxZ(start)).toBeCloseTo(ridgeUnderside, 3);
    // The bearing ends are heel height + build-up, and the top edge is just
    // heel → apex → heel: five points, no kink.
    const eaveUnderside = roofGeometry.getSurfaceElevation({ x: 0, y: -3600 }, 'bottom') - BASE;
    expect(eaveUnderside).toBeCloseTo(GABLE_HEEL + buildUp, 6);
    expect(start.points).toHaveLength(5);
    expect(start.points.find((point) => point.x === 0 && point.z > 0)?.z).toBeCloseTo(GABLE_HEEL + buildUp, 3);
    expect(start.areaMm2 / 1e6).toBeCloseTo((7200 * (GABLE_HEEL + buildUp) + (7200 * 1800) / 2) / 1e6, 4);
    // Still no eave strips: whether a side is tall is the profile's call.
    expect(layout.sides.spanStart.available).toBe(false);
  });

  it('ignores a roof that this system does not carry', () => {
    const trussSystem = system('truss_type_gable');
    const roofSystem = { ...attachedRoof(trussSystem), trussAttachmentId: 'someone_else' };
    const layout = buildEndClosureLayout(trussSystem, null, roofSystem);
    expect(layout.attached).toBe(false);
    expect(maxZ(layout.closures[0])).toBeCloseTo(GABLE_APEX, 6);
  });

  it('gives a shed two sloped-top ends and a high-side strip four bays long', () => {
    // RT-3: both shed ends stand on a heel (bc + tc / cos θ, θ = atan 0.2), so
    // the end panels are right triangles on a 181.8 strip: trapezoids.
    const heel = 90 + 90 * Math.hypot(1, 0.2);
    const layout = buildEndClosureLayout(system('truss_type_shed', { span: 6000, rise: 1200 }));
    expect(layout.closures.map((closure) => closure.side)).toEqual(['start', 'end', 'spanEnd']);
    const [start, , high] = layout.closures;
    expect(start.points).toHaveLength(4);
    expect(start.areaMm2 / 1e6).toBeCloseTo((6000 * heel + (6000 * 1200) / 2) / 1e6, 4);
    expect(high.kind).toBe('strip');
    expect(high.length).toBeCloseTo(4 * 900, 6);
    expect(maxZ(high)).toBeCloseTo(heel + 1200, 6);
    expect(layout.sides.spanEnd.label).toBe('High side');
    expect(layout.sides.spanStart.available).toBe(false);
  });

  it('closes a flat truss on all four sides', () => {
    const layout = buildEndClosureLayout(system('truss_type_flat', { rise: 900 }));
    expect(layout.closures.map((closure) => closure.side)).toEqual(['start', 'end', 'spanStart', 'spanEnd']);
    const [start, , sideA, sideB] = layout.closures;
    // RT-3: the flat truss is bc + rise + tc = 90 + 900 + 90 = 1080 out to out.
    expect(start.areaMm2 / 1e6).toBeCloseTo(7.2 * 1.08, 4);
    expect(sideA.areaMm2 / 1e6).toBeCloseTo(3.6 * 1.08, 4);
    expect(sideB.areaMm2 / 1e6).toBeCloseTo(3.6 * 1.08, 4);
    // Equally tall both sides: neither is the high one.
    expect(layout.sides.spanStart.label).toBe('Side A');
    expect(layout.sides.spanEnd.label).toBe('Side B');
  });

  it('drops a closure under 50 mm tall', () => {
    // RT-3: real chords make every truss at least bc + tc tall, so the test
    // needs 10 mm members to get under 50: 10 + 20 + 10 = 40.
    const thin = { width: 35, depth: 10 };
    const layout = buildEndClosureLayout(
      system(
        'truss_type_flat',
        { rise: END_CLOSURE_MIN_HEIGHT - 30 },
        {
          memberSizes: { preset: 'custom', topChord: thin, bottomChord: thin, web: thin },
        },
      ),
    );
    expect(layout.closures).toEqual([]);
  });

  it('leaves hip ends to the hip planes', () => {
    const layout = buildEndClosureLayout(system('truss_type_hip', { span: 8400, rise: 1600 }));
    expect(layout.closures).toEqual([]);
    expect(describeEndClosures(layout)).toBe('End A: — · End B: —');
  });

  it('cuts an enabled vent out of the area', () => {
    const trussSystem = withEndClosures(system('truss_type_gable'), {
      start: { mode: 'infill', assemblyPreset: 'fiber_cement', vent: { enabled: true, width: 600, height: 300 } },
    });
    const [start, end] = buildEndClosureLayout(trussSystem).closures;
    expect(start.vent.fits).toBe(true);
    expect(start.holes).toHaveLength(1);
    expect(start.areaMm2 / 1e6).toBeCloseTo(GABLE_AREA_M2 - 0.18, 4);
    expect(end.areaMm2 / 1e6).toBeCloseTo(GABLE_AREA_M2, 4);
  });

  it('refuses a vent that does not fit', () => {
    // A sill at 1850 puts the 300-high vent's top (2150) above the 1990.6 apex.
    const trussSystem = withEndClosures(system('truss_type_gable'), {
      start: { vent: { enabled: true, width: 600, height: 300, sillOffset: 1850 } },
    });
    const [start] = buildEndClosureLayout(trussSystem).closures;
    expect(start.vent.fits).toBe(false);
    expect(start.holes).toEqual([]);
    expect(start.areaMm2 / 1e6).toBeCloseTo(GABLE_AREA_M2, 4);
  });

  it('builds nothing for an open end but still reports it as closable', () => {
    const trussSystem = withEndClosures(system('truss_type_gable'), {
      start: { mode: 'open' },
      end: { mode: 'open' },
    });
    const layout = buildEndClosureLayout(trussSystem);
    expect(layout.closures).toEqual([]);
    expect(layout.sides.start.available).toBe(true);
    expect(describeEndClosures(layout)).toBe('End A: Open · End B: Open');
  });

  it('reads the inspect card summary', () => {
    expect(describeEndClosures(buildEndClosureLayout(system('truss_type_gable')))).toBe(
      'End A: Infill · fibre cement · End B: Infill · fibre cement',
    );
  });

  it('closes a single truss once', () => {
    const layout = buildEndClosureLayout(system('truss_type_gable', { count: 1 }));
    expect(layout.closures.map((closure) => closure.side)).toEqual(['start']);
  });
});

describe('buildEndClosureObjects', () => {
  it('emits one verticalPolygon per closure, keyed and tagged on the truss system', () => {
    const descriptors = buildEndClosureObjects(system('truss_type_gable'));
    expect(descriptors.map((descriptor) => descriptor.id)).toEqual(['ts_1-closure-start', 'ts_1-closure-end']);
    const [panel] = descriptors;
    expect(panel).toMatchObject({
      kind: 'trussSystem',
      geometry: 'verticalPolygon',
      materialKey: 'gableInfill',
      thickness: endClosureThickness('fiber_cement'),
      metadata: { sourceId: 'ts_1', trussSystemId: 'ts_1', part: 'endClosure', side: 'start' },
    });
    expect(panel.plane.origin).toMatchObject({ x: 0, y: -3600, elevation: BASE });
    expect(panel.plane.xAxis.y).toBeCloseTo(1, 6);
    expect(panel.bounds.minElevation).toBe(BASE);
    expect(panel.bounds.maxElevation).toBeCloseTo(BASE + GABLE_APEX, 6);
    expect(panel.bounds.minY).toBeCloseTo(-3600, 6);
    expect(panel.bounds.maxY).toBeCloseTo(3600, 6);
    // Pure: the same input builds the same descriptors.
    expect(buildEndClosureObjects(system('truss_type_gable'))).toEqual(descriptors);
  });

  it('adds a recessed dark box behind a vent, inside the roof space', () => {
    const trussSystem = withEndClosures(system('truss_type_gable'), {
      start: { vent: { enabled: true, width: 600, height: 300, sillOffset: 300 } },
    });
    const descriptors = buildEndClosureObjects(trussSystem);
    const vent = descriptors.find((descriptor) => descriptor.id === 'ts_1-closure-start-vent');
    expect(vent).toMatchObject({
      geometry: 'box',
      materialKey: 'fixtureAccentDark',
      baseElevation: BASE + 300,
      size: { x: 600, y: 300, z: 50 },
    });
    // End A is at x = 0 and the roof space is +x of it.
    expect(vent.center.x).toBeGreaterThan(0);
    expect(descriptors.find((descriptor) => descriptor.id === 'ts_1-closure-start').holes).toHaveLength(1);
  });

  it('builds nothing when every side is open', () => {
    const trussSystem = withEndClosures(system('truss_type_gable'), {
      start: { mode: 'open' },
      end: { mode: 'open' },
    });
    expect(buildEndClosureObjects(trussSystem)).toEqual([]);
  });
});
