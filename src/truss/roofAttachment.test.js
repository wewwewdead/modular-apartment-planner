import { describe, expect, it } from 'vitest';
import { createTrussSystem } from '@/domain/trussModels';
import { createRoofSystemForProject } from '@/domain/roofModels';
import { buildRoofPlaneGeometry } from '@/geometry/roofPlaneGeometry';
import { buildTrussSystemGeometry } from '@/geometry/trussGeometry';
import { deriveRoofStateFromTrussSystem, getTrussRoofAttachmentElevation } from './roofAttachment';
import { measurePurlins, measureTopChords } from './roofSeating.fixtures';

// Layout line along +x, so the truss span axis (perpendicular of the layout
// line) is +y: each truss copy is LOW at y = -span/2 (start support, profile
// x=0) and HIGH at y = +span/2 (end support).
function createShedTrussSystem(overrides = {}) {
  return createTrussSystem('Shed System', {
    floorId: 'floor_1',
    baseElevation: 0,
    trussInstances: [
      {
        trussTypeId: 'truss_type_shed',
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 8000, y: 0 },
        span: 6000,
        rise: 1200,
        spacing: 2000,
        count: 5,
        overhangs: { start: 0, end: 0 },
        ...overrides,
      },
    ],
  });
}

describe('deriveRoofStateFromTrussSystem', () => {
  it('points the shed pitch direction downhill (toward the truss low support)', () => {
    const roofState = deriveRoofStateFromTrussSystem(createShedTrussSystem());

    expect(roofState.roofType).toBe('shed');
    // Truss rises toward +y, and pitch directions point downhill app-wide, so
    // the derived direction must be -y.
    expect(roofState.pitch.direction.x).toBeCloseTo(0, 6);
    expect(roofState.pitch.direction.y).toBeCloseTo(-1, 6);
  });

  it('keeps the gable pitch direction on the span axis', () => {
    const roofState = deriveRoofStateFromTrussSystem(
      createShedTrussSystem({ trussTypeId: 'truss_type_gable', rise: 1500 }),
    );

    expect(roofState.roofType).toBe('gable');
    expect(roofState.pitch.direction.x).toBeCloseTo(0, 6);
    expect(roofState.pitch.direction.y).toBeCloseTo(1, 6);
  });

  it('builds an attached shed roof that rises with the truss, gaining the truss rise across the span', () => {
    const trussSystem = createShedTrussSystem();
    const roofSystem = createRoofSystemForProject({ trussSystems: [trussSystem] }, {});
    expect(roofSystem).not.toBeNull();

    const geometry = buildRoofPlaneGeometry(roofSystem);
    const lowSupport = { x: 4000, y: -3000 };
    const highSupport = { x: 4000, y: 3000 };
    const elevationAtLow = geometry.getSurfaceElevation(lowSupport, 'top');
    const elevationAtHigh = geometry.getSurfaceElevation(highSupport, 'top');

    // The roof must slope the same way as the truss it traces: high where the
    // truss peaks, and the elevation gained between the two supports must be
    // exactly the truss rise (shed pitch = rise/span, run between supports =
    // span, so gain = rise).
    expect(elevationAtHigh).toBeGreaterThan(elevationAtLow);
    expect(elevationAtHigh - elevationAtLow).toBeCloseTo(1200, 3);
  });
});

// RT-3 (spec §7.2, §7.7): the attached roof sits on the top-chord TOP FACE +
// purlins, measured from the start heel, and follows the sloped tails.
describe('the attached roof follows the chord top face (RT-3)', () => {
  // 25 % gable: rise 1800 over a 7200 run, 300 tails, 90 × 35 chords,
  // 50-deep purlins. θ = atan(0.25); 1 / cos θ = 1.0308.
  function gableSystem(purlinsEnabled = true) {
    return createTrussSystem('Gable System', {
      id: 'ts_gable',
      floorId: 'floor_1',
      baseElevation: 3000,
      purlinSystem: { enabled: purlinsEnabled, depth: 50, width: 75, spacing: 900 },
      trussInstances: [
        {
          trussTypeId: 'truss_type_gable',
          startPoint: { x: 0, y: 0 },
          endPoint: { x: 6000, y: 0 },
          span: 14400,
          rise: 1800,
          spacing: 1200,
          count: 6,
          overhangs: { start: 300, end: 300 },
        },
      ],
    });
  }
  const secant = Math.hypot(1, 0.25);

  it('puts the attachment elevation at base + bc + tc / cos θ + purlin / cos θ', () => {
    expect(getTrussRoofAttachmentElevation(gableSystem(true))).toBeCloseTo(3000 + 90 + 90 * secant + 50 * secant, 6);
    expect(getTrussRoofAttachmentElevation(gableSystem(false))).toBeCloseTo(3000 + 90 + 90 * secant, 6);
  });

  it('emits SIGNED rises: the tails sit 300 × 0.25 below the heel datum', () => {
    const state = deriveRoofStateFromTrussSystem(gableSystem(true));
    const points = state.attachedShapeProfile.points;
    // Collinear samples are dropped: tail, ridge, tail.
    expect(points).toHaveLength(3);
    expect(points[0].rise).toBeCloseTo(-75, 6);
    expect(points[2].rise).toBeCloseTo(-75, 6);
    expect(points[1].position).toBeCloseTo(0.5, 6);
    expect(points[1].rise).toBeCloseTo(1800, 6);
    expect(state.attachedShapeProfile.maxRise).toBeCloseTo(1800, 6);
  });

  it('sends an attached gable through the profile path, eave underside at the tip = attachment − 75', () => {
    const trussSystem = gableSystem(true);
    const roofSystem = createRoofSystemForProject({ trussSystems: [trussSystem] }, {});
    expect(roofSystem.roofType).toBe('gable');
    const geometry = buildRoofPlaneGeometry(roofSystem);
    expect(geometry.planes.map((plane) => plane.planeType)).toEqual(['gable_segment_1', 'gable_segment_2']);

    const attachment = getTrussRoofAttachmentElevation(trussSystem);
    expect(roofSystem.baseElevation).toBeCloseTo(attachment, 6);
    // Trusses span y −7200 … 7200 (tails to ±7500); the layout runs along x.
    expect(geometry.getSurfaceElevation({ x: 3000, y: -7500 }, 'bottom')).toBeCloseTo(attachment - 300 * 0.25, 6);
    expect(geometry.getSurfaceElevation({ x: 3000, y: -7200 }, 'bottom')).toBeCloseTo(attachment, 6);
    // The ridge underside is exactly the chord top face + purlin over the ridge:
    // no `slope × overhang` lift any more.
    expect(geometry.getSurfaceElevation({ x: 3000, y: 0 }, 'bottom')).toBeCloseTo(attachment + 1800, 6);
  });
});

// RT-3.1 (spec §7.8.4): the roof underside sits ON the purlin top face — for a
// gable or shed that follows the truss, for a hip (whose datum is now the
// ROOF outline edge, §7.8.1), and, pivoting on the heel, for a hand-set slope
// (§7.8.2). Synthetic project: span 7200 at 25 % (rise 900, shed 1800),
// 300 tails, 90 × 35 chords, 50-deep purlins at 900, roof overhang 510.
describe('the attached roof seats on the purlin top face (RT-3.1)', () => {
  const PURLIN_DEPTH = 50;
  const TOP_CHORD_DEPTH = 90;
  const SECANT = Math.hypot(1, 0.25);
  const TOLERANCE = 0.5;

  function seatingSystem(trussTypeId, { instance = {}, purlins = {} } = {}) {
    return createTrussSystem('Seating System', {
      id: 'ts_seat',
      floorId: 'floor_1',
      baseElevation: 3000,
      purlinSystem: { enabled: true, depth: PURLIN_DEPTH, width: 75, spacing: 900, ...purlins },
      trussInstances: [
        {
          trussTypeId,
          // Layout along +x, so the span runs along y: start heel at y = −3600.
          startPoint: { x: 0, y: 0 },
          endPoint: { x: 12000, y: 0 },
          span: 7200,
          rise: trussTypeId === 'truss_type_shed' ? 1800 : 900,
          spacing: 1200,
          count: 11,
          overhangs: { start: 300, end: 300 },
          ...instance,
        },
      ],
    });
  }

  function seatedRoof(trussTypeId, roofOptions = {}, systemOptions = {}) {
    const trussSystem = seatingSystem(trussTypeId, systemOptions);
    const roofSystem = createRoofSystemForProject(
      { trussSystems: [trussSystem] },
      { ...roofOptions, pitch: { overhang: 510, ...(roofOptions.pitch || {}) } },
    );
    return {
      trussSystem,
      roofSystem,
      roofGeometry: buildRoofPlaneGeometry(roofSystem),
      trussGeometry: buildTrussSystemGeometry(trussSystem),
    };
  }

  // The purlin TOP FACE point over a sample of its centre line, at its OWN plan
  // position: centre + up · depth / 2 (`up` is three-space: y is elevation).
  function purlinTopFacePoints(segment) {
    const depth = segment.crossSection.height;
    const up = segment.up;
    return [0.02, 0.5, 0.98].map((t) => {
      const lerp = (key) => segment.startWorld[key] + (segment.endWorld[key] - segment.startWorld[key]) * t;
      return {
        x: lerp('x') + (up.x * depth) / 2,
        y: lerp('y') + (up.z * depth) / 2,
        elevation: lerp('elevation') + (up.y * depth) / 2,
      };
    });
  }

  // The top-chord TOP FACE point over a member's midpoint (in-plane normal).
  function chordTopFaceMidpoint(member) {
    const a = member.startWorld;
    const b = member.endWorld;
    const run = Math.hypot(b.x - a.x, b.y - a.y);
    const rise = b.elevation - a.elevation;
    const length = Math.hypot(run, rise);
    const half = TOP_CHORD_DEPTH / 2;
    return {
      x: (a.x + b.x) / 2 - ((b.x - a.x) / run) * (rise / length) * half,
      y: (a.y + b.y) / 2 - ((b.y - a.y) / run) * (rise / length) * half,
      elevation: (a.elevation + b.elevation) / 2 + (run / length) * half,
      secant: length / run,
    };
  }

  /** roof underside − purlin top face, per purlin sample. */
  function purlinGaps(roofGeometry, segments) {
    return segments.flatMap((segment) =>
      purlinTopFacePoints(segment).map((point) => ({
        point,
        gap: roofGeometry.getSurfaceElevation(point, 'bottom') - point.elevation,
      })),
    );
  }

  /** roof underside − chord top face − purlin / cos θ, per top-chord midpoint. */
  function chordGaps(roofGeometry, copy) {
    return copy.members
      .filter((member) => member.memberType === 'topChord')
      .map(chordTopFaceMidpoint)
      .map((point) => ({
        point,
        gap: roofGeometry.getSurfaceElevation(point, 'bottom') - point.elevation - PURLIN_DEPTH * point.secant,
      }));
  }

  function maxAbs(entries) {
    return Math.max(...entries.map((entry) => Math.abs(entry.gap)));
  }

  function firstAndMiddleCopies(trussGeometry, copyFilter = () => true) {
    const copies = trussGeometry.instances[0].copies.filter(copyFilter);
    return [copies[0], copies[Math.floor(copies.length / 2)]];
  }

  it('gable following the truss: every purlin seated, chord top face 50 / cos θ below the roof', () => {
    const { roofSystem, roofGeometry, trussGeometry } = seatedRoof('truss_type_gable');
    expect(roofSystem.roofType).toBe('gable');
    expect(roofSystem.pitchSource).toBe('truss');
    expect(trussGeometry.purlinSegments.length).toBeGreaterThan(40);
    expect(maxAbs(purlinGaps(roofGeometry, trussGeometry.purlinSegments))).toBeLessThan(TOLERANCE);
    for (const copy of firstAndMiddleCopies(trussGeometry)) {
      const gaps = chordGaps(roofGeometry, copy);
      expect(gaps.length).toBeGreaterThan(0);
      expect(maxAbs(gaps)).toBeLessThan(TOLERANCE);
      expect(gaps[0].point.secant).toBeCloseTo(SECANT, 6);
    }
  });

  it('shed following the truss: every purlin seated, chord top face 50 / cos θ below the roof', () => {
    const { roofSystem, roofGeometry, trussGeometry } = seatedRoof('truss_type_shed');
    expect(roofSystem.roofType).toBe('shed');
    expect(trussGeometry.purlinSegments.length).toBeGreaterThan(40);
    expect(maxAbs(purlinGaps(roofGeometry, trussGeometry.purlinSegments))).toBeLessThan(TOLERANCE);
    for (const copy of firstAndMiddleCopies(trussGeometry)) {
      expect(maxAbs(chordGaps(roofGeometry, copy))).toBeLessThan(TOLERANCE);
    }
  });

  it('hip following the truss: the datum is the roof outline edge, 0.25 × (300 + 510) below the heel datum', () => {
    const { trussSystem, roofSystem } = seatedRoof('truss_type_hip');
    expect(roofSystem.roofType).toBe('hip');
    const heelDatum = 3000 + 90 + (TOP_CHORD_DEPTH + PURLIN_DEPTH) * SECANT;
    expect(getTrussRoofAttachmentElevation(trussSystem, { roofOverhang: 510 })).toBeCloseTo(
      heelDatum - 0.25 * (300 + 510),
      6,
    );
    // Without a roof overhang of its own the datum is the tail tip, as before.
    expect(getTrussRoofAttachmentElevation(trussSystem)).toBeCloseTo(heelDatum - 0.25 * 300, 6);
    expect(roofSystem.baseElevation).toBeCloseTo(heelDatum - 0.25 * 810, 6);
  });

  it('gable with a manual 20 % slope pivots on the heel: ridge 0.20 × 3600 up, tails 0.20 × 300 down', () => {
    const { trussSystem, roofSystem, roofGeometry, trussGeometry } = seatedRoof('truss_type_gable', {
      pitchSource: 'manual',
      pitch: { slope: 20 },
    });
    expect(roofSystem.pitchSource).toBe('manual');
    expect(roofSystem.pitch.slope).toBe(20);
    // The profile path, not the preset plane (which would float the heel by
    // 0.20 × (300 + 510) = 162).
    expect(roofGeometry.planes.map((plane) => plane.planeType)).toEqual(['gable_segment_1', 'gable_segment_2']);
    const datum = getTrussRoofAttachmentElevation(trussSystem);
    expect(roofSystem.baseElevation).toBeCloseTo(datum, 6);
    expect(roofGeometry.getSurfaceElevation({ x: 6000, y: -3600 }, 'bottom')).toBeCloseTo(datum, 6);
    expect(roofGeometry.getSurfaceElevation({ x: 6000, y: 0 }, 'bottom')).toBeCloseTo(datum + 0.2 * 3600, 6);
    expect(roofGeometry.getSurfaceElevation({ x: 6000, y: -3900 }, 'bottom')).toBeCloseTo(datum - 0.2 * 300, 6);

    // Against the 25 % trusses the roof is seated AT the heel and opens by
    // (0.20 − 0.25) × the run from it: the analytic pivot, at every sample.
    const runFromHeel = (point) => 3600 - Math.abs(point.y);
    const pivotResidual = ({ point, gap }) => ({ gap: gap - (0.2 - 0.25) * runFromHeel(point) });
    expect(maxAbs(purlinGaps(roofGeometry, trussGeometry.purlinSegments).map(pivotResidual))).toBeLessThan(TOLERANCE);
    for (const copy of firstAndMiddleCopies(trussGeometry)) {
      expect(maxAbs(chordGaps(roofGeometry, copy).map(pivotResidual))).toBeLessThan(TOLERANCE);
    }
  });

  it('carries the underside run slope on the attached profile', () => {
    const state = deriveRoofStateFromTrussSystem(seatingSystem('truss_type_gable'));
    expect(state.attachedShapeProfile.slope).toBeCloseTo(0.25, 9);
    const shed = deriveRoofStateFromTrussSystem(seatingSystem('truss_type_shed'));
    expect(shed.attachedShapeProfile.slope).toBeCloseTo(0.25, 9);
  });

  // RT-4 (spec §7.9): the hip roof's layout range is the SUPPORT line ± the
  // start tail, so EVERY copy seats — the step-down slices (H copies) too —
  // and every purlin (exactly since RT-4.1, §7.10: slice chords break at the
  // crown, flat slices' tails follow the hip pitch, runs end on their slope). Stations: copies 0 / 1200 / 2400 from each line end are
  // H1 (a flat slice) / H2 / H3; the rest are full gables (T1).
  describe('every hip copy seats (RT-4)', () => {
    const RATIO = 0.25;
    const SPAN = 7200;
    const SLOPED_GAP = PURLIN_DEPTH * SECANT; // 51.54: purlins on the slope
    const FLAT_GAP = (TOP_CHORD_DEPTH + PURLIN_DEPTH) * SECANT - TOP_CHORD_DEPTH; // 54.31: no purlin on a flat top
    const measure = { ratio: RATIO, span: SPAN, topChordDepth: TOP_CHORD_DEPTH };

    function planExtent(points) {
      const xs = points.map((point) => point.x);
      const ys = points.map((point) => point.y);
      return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
    }

    /**
     * Every top-chord member of every copy, slices included (RT-4.1, spec
     * §7.10): a sloped member at 50 · sec θ, a flat one at 140 · sec θ − 90.
     * No member may be anything else — no chord drawn across a kink, no level
     * tail. Returns the per-kind counts.
     */
    function expectEveryCopySeated(roofGeometry, trussGeometry) {
      const counts = { sloped: 0, flat: 0, kink: 0, levelTail: 0 };
      for (const copy of trussGeometry.instances[0].copies) {
        for (const entry of measureTopChords(roofGeometry, copy, measure)) {
          counts[entry.kind] += 1;
          const expected = entry.kind === 'flat' ? FLAT_GAP : SLOPED_GAP;
          for (const { gap } of entry.samples) expect(Math.abs(gap - expected)).toBeLessThan(TOLERANCE);
        }
      }
      expect(counts.kink).toBe(0);
      expect(counts.levelTail).toBe(0);
      return counts;
    }

    function expectEveryPurlinSeated(roofGeometry, trussGeometry) {
      const copies = trussGeometry.instances[0].copies;
      const copyById = new Map(copies.map((copy) => [copy.id, copy]));
      const segments = trussGeometry.purlinSegments;
      expect(segments.length).toBeGreaterThan(20);
      for (const segment of segments) {
        const [a, b] = segment.copyIds.map((id) => copyById.get(id));
        // A purlin only spans neighbouring copies that both carry it.
        expect(Math.abs(a.index - b.index)).toBe(1);
        for (const { gap } of measurePurlins(roofGeometry, [segment])) {
          expect(Math.abs(gap)).toBeLessThan(TOLERANCE);
        }
      }
    }

    it('labels and flags the slices: H1 / H2 / H3 at 0 / 1200 / 2400 from each end', () => {
      const { trussGeometry } = seatedRoof('truss_type_hip');
      const copies = trussGeometry.instances[0].copies;
      expect(copies.map((copy) => copy.label)).toEqual([
        'H1',
        'H2',
        'H3',
        'T1',
        'T1',
        'T1',
        'T1',
        'T1',
        'H3',
        'H2',
        'H1',
      ]);
      expect(copies.map((copy) => copy.isHipSlice)).toEqual(copies.map((copy) => copy.label.startsWith('H')));
    });

    it('seats every copy, slices included, and every purlin', () => {
      const { roofGeometry, trussGeometry } = seatedRoof('truss_type_hip');
      const counts = expectEveryCopySeated(roofGeometry, trussGeometry);
      // 5 full gables × 10 runs, plus the slices' sloped runs and tails; the
      // H2 / H3 crown kinks (1200, 2400, inside 900 panels) are chord nodes,
      // and the H1 flat slices' tails fall at the hip pitch (RT-4.1).
      expect(counts.sloped).toBeGreaterThan(50);
      expect(counts.flat).toBeGreaterThan(20);
      expectEveryPurlinSeated(roofGeometry, trussGeometry);
    });

    it('puts the hip ends at the line ± (tail + roof overhang) and the ridge span / 2 inside each line end', () => {
      const { roofGeometry } = seatedRoof('truss_type_hip');
      const extent = planExtent(roofGeometry.roofOutline);
      expect(extent.minX).toBeCloseTo(-810, 6);
      expect(extent.maxX).toBeCloseTo(12810, 6);
      expect(extent.minY).toBeCloseTo(-4410, 6);
      expect(extent.maxY).toBeCloseTo(4410, 6);
      const ridge = roofGeometry.ridgeSegment;
      expect(Math.min(ridge.start.x, ridge.end.x)).toBeCloseTo(3600, 6);
      expect(Math.max(ridge.start.x, ridge.end.x)).toBeCloseTo(8400, 6);
      expect(Math.hypot(ridge.end.x - ridge.start.x, ridge.end.y - ridge.start.y)).toBeCloseTo(4800, 6);
    });

    it('reads the support line, not the copies: copies offset 450 along it seat the same', () => {
      const { roofGeometry, trussGeometry } = seatedRoof(
        'truss_type_hip',
        {},
        { instance: { supportOffsetAlongAxis: 450, count: 10 } },
      );
      const copies = trussGeometry.instances[0].copies;
      expect(copies[0].origin.x).toBeCloseTo(450, 6);
      expect(copies[copies.length - 1].origin.x).toBeCloseTo(11250, 6);
      // The first copy is a slice whose crown underside is 0.25 × 450 above
      // the heel's: its flat top face is base + bc + 112.5 + tc.
      expect(copies[0].isHipSlice).toBe(true);
      const crown = measureTopChords(roofGeometry, copies[0], measure).filter((entry) => entry.kind === 'flat');
      expect(crown.length).toBeGreaterThan(0);
      for (const { member } of crown) {
        expect(member.startWorld.elevation + TOP_CHORD_DEPTH / 2).toBeCloseTo(3000 + 90 + 0.25 * 450 + 90, 6);
      }
      expectEveryCopySeated(roofGeometry, trussGeometry);
      expectEveryPurlinSeated(roofGeometry, trussGeometry);
      const extent = planExtent(roofGeometry.roofOutline);
      expect(extent.minX).toBeCloseTo(-810, 6);
      expect(extent.maxX).toBeCloseTo(12810, 6);
    });

    it('seats with no roof overhang: the outline is the line ± the 300 tail', () => {
      const { roofSystem, roofGeometry, trussGeometry } = seatedRoof('truss_type_hip', { pitch: { overhang: 0 } });
      expect(roofSystem.pitch.overhang).toBe(0);
      expectEveryCopySeated(roofGeometry, trussGeometry);
      expectEveryPurlinSeated(roofGeometry, trussGeometry);
      const extent = planExtent(roofGeometry.roofOutline);
      expect(extent.minX).toBeCloseTo(-300, 6);
      expect(extent.maxX).toBeCloseTo(12300, 6);
      expect(extent.minY).toBeCloseTo(-3900, 6);
      expect(extent.maxY).toBeCloseTo(3900, 6);
    });

    it('stops the purlin layout extension at a slice; a gable run still runs 300 past its last copy', () => {
      const hip = seatedRoof('truss_type_hip', {}, { purlins: { overhangEnd: 300 } }).trussGeometry.instances[0];
      const copyById = new Map(hip.copies.map((copy) => [copy.id, copy]));
      let sliceEnded = 0;
      for (const run of hip.purlinRuns) {
        const last = run.attachments[run.attachments.length - 1];
        const endPoint = run.points[run.points.length - 1];
        const lastSegment = run.segments[run.segments.length - 1];
        if (copyById.get(last.copyId).isHipSlice) {
          sliceEnded += 1;
          expect(endPoint.x).toBeCloseTo(last.planPoint.x, 6);
          expect(endPoint.y).toBeCloseTo(last.planPoint.y, 6);
          expect(lastSegment.endWorld.x).toBeCloseTo(last.worldPoint.x, 6);
        } else {
          expect(endPoint.x).toBeCloseTo(last.planPoint.x + 300, 6);
          expect(lastSegment.endWorld.x).toBeCloseTo(last.worldPoint.x + 300, 6);
        }
      }
      expect(sliceEnded).toBeGreaterThan(0);

      const gable = seatedRoof('truss_type_gable', {}, { purlins: { overhangEnd: 300 } }).trussGeometry.instances[0];
      expect(gable.purlinRuns.length).toBeGreaterThan(0);
      for (const run of gable.purlinRuns) {
        const last = run.attachments[run.attachments.length - 1];
        expect(last.planPoint.x).toBeCloseTo(12000, 6);
        expect(run.points[run.points.length - 1].x).toBeCloseTo(12300, 6);
        expect(run.segments[run.segments.length - 1].endWorld.x).toBeCloseTo(12300, 6);
      }
    });
  });
});
