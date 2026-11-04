import { describe, expect, it } from 'vitest';
import {
  createRoofSystem,
  createRoofPitch,
  getRoofTopElevation,
  getRoofTypeLabel,
  isValidRoofPolygon,
  normalizeRoofPitchDirection,
  roofPitchDirectionFromAngle,
  roofPitchDirectionToAngle,
} from './roofModels';
import { ROOF_OVERHANG, ROOF_PITCH_SLOPE, ROOF_SLAB_THICKNESS } from './defaults';

describe('createRoofPitch', () => {
  it('applies documented defaults when no options are given', () => {
    const pitch = createRoofPitch();
    expect(pitch.slope).toBe(ROOF_PITCH_SLOPE);
    expect(pitch.overhang).toBe(ROOF_OVERHANG);
    expect(pitch.ridgeOffset).toBe(0);
    expect(pitch.direction).toEqual({ x: 0, y: 1 });
  });

  it('honours finite overrides', () => {
    const pitch = createRoofPitch({ slope: 40, overhang: 600, ridgeOffset: 250 });
    expect(pitch.slope).toBe(40);
    expect(pitch.overhang).toBe(600);
    expect(pitch.ridgeOffset).toBe(250);
  });

  it('falls back to defaults for non-finite slope', () => {
    expect(createRoofPitch({ slope: 'abc' }).slope).toBe(ROOF_PITCH_SLOPE);
    expect(createRoofPitch({ slope: NaN }).slope).toBe(ROOF_PITCH_SLOPE);
  });

  it('normalizes the pitch direction to a unit vector', () => {
    const pitch = createRoofPitch({ direction: { x: 3, y: 4 } });
    expect(pitch.direction.x).toBeCloseTo(0.6, 10);
    expect(pitch.direction.y).toBeCloseTo(0.8, 10);
  });
});

describe('normalizeRoofPitchDirection', () => {
  it('returns a unit vector for a valid direction', () => {
    const dir = normalizeRoofPitchDirection({ x: 3, y: 4 });
    expect(dir).toEqual({ x: 0.6, y: 0.8 });
    expect(Math.hypot(dir.x, dir.y)).toBeCloseTo(1, 10);
  });

  it('falls back to the default (+y) for a zero-length or null direction', () => {
    expect(normalizeRoofPitchDirection({ x: 0, y: 0 })).toEqual({ x: 0, y: 1 });
    expect(normalizeRoofPitchDirection(null)).toEqual({ x: 0, y: 1 });
    expect(normalizeRoofPitchDirection(undefined)).toEqual({ x: 0, y: 1 });
  });
});

describe('roof pitch angle conversions', () => {
  it('converts an angle to a unit direction vector', () => {
    const d0 = roofPitchDirectionFromAngle(0);
    expect(d0.x).toBeCloseTo(1, 10);
    expect(d0.y).toBeCloseTo(0, 10);

    const d90 = roofPitchDirectionFromAngle(90);
    expect(d90.x).toBeCloseTo(0, 10);
    expect(d90.y).toBeCloseTo(1, 10);
  });

  it('converts a direction vector to an angle in [0, 360)', () => {
    expect(roofPitchDirectionToAngle({ x: 1, y: 0 })).toBeCloseTo(0, 6);
    expect(roofPitchDirectionToAngle({ x: 0, y: 1 })).toBeCloseTo(90, 6);
    expect(roofPitchDirectionToAngle({ x: 0, y: -1 })).toBeCloseTo(270, 6);
  });

  it('round-trips angle -> direction -> angle', () => {
    for (const angle of [0, 37, 90, 145, 270, 359]) {
      expect(roofPitchDirectionToAngle(roofPitchDirectionFromAngle(angle))).toBeCloseTo(angle, 4);
    }
  });
});

describe('getRoofTypeLabel', () => {
  it('maps known roof types to human labels', () => {
    expect(getRoofTypeLabel('flat')).toBe('Flat');
    expect(getRoofTypeLabel('gable')).toBe('Gable');
    expect(getRoofTypeLabel('hip')).toBe('Hip');
    expect(getRoofTypeLabel('box_gable')).toBe('Box Gable');
    expect(getRoofTypeLabel('pyramid_hipped')).toBe('Pyramid Hipped');
    expect(getRoofTypeLabel('custom')).toBe('Custom');
  });

  it('falls back to Flat for an unknown roof type', () => {
    expect(getRoofTypeLabel('nonsense')).toBe('Flat');
    expect(getRoofTypeLabel()).toBe('Flat');
  });
});

describe('isValidRoofPolygon', () => {
  it('accepts a polygon with 3+ vertices and positive area', () => {
    expect(
      isValidRoofPolygon([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ]),
    ).toBe(true);
  });

  it('rejects fewer than 3 vertices', () => {
    expect(
      isValidRoofPolygon([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ]),
    ).toBe(false);
  });

  it('rejects a zero-area (degenerate) polygon', () => {
    expect(
      isValidRoofPolygon([
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ]),
    ).toBe(false);
  });

  it('rejects non-array input', () => {
    expect(isValidRoofPolygon(null)).toBe(false);
    expect(isValidRoofPolygon(undefined)).toBe(false);
  });
});

describe('createRoofSystem normalization', () => {
  const boundary = [
    { x: 0, y: 0 },
    { x: 1000, y: 0 },
    { x: 1000, y: 1000 },
    { x: 0, y: 1000 },
  ];

  it('normalizes an unknown roof type to flat', () => {
    expect(createRoofSystem('R', { roofType: 'wacky' }).roofType).toBe('flat');
  });

  it('defaults pitchSource to manual when no truss attachment is present', () => {
    expect(createRoofSystem('R', { roofType: 'gable', boundaryPolygon: boundary }).pitchSource).toBe('manual');
  });

  it('applies the default boundary polygon when none is provided', () => {
    const rs = createRoofSystem('R', {});
    expect(rs.boundaryPolygon).toEqual([
      { x: -3000, y: -3000 },
      { x: 3000, y: -3000 },
      { x: 3000, y: 3000 },
      { x: -3000, y: 3000 },
    ]);
  });

  it('defaults slab thickness to ROOF_SLAB_THICKNESS', () => {
    expect(createRoofSystem('R', { boundaryPolygon: boundary }).slabThickness).toBe(ROOF_SLAB_THICKNESS);
  });
});

describe('getRoofTopElevation', () => {
  it('returns base elevation plus slab thickness', () => {
    const rs = createRoofSystem('R', {
      roofType: 'gable',
      baseElevation: 5000,
      slabThickness: 200,
      boundaryPolygon: [
        { x: 0, y: 0 },
        { x: 1000, y: 0 },
        { x: 1000, y: 1000 },
        { x: 0, y: 1000 },
      ],
    });
    expect(getRoofTopElevation(rs)).toBe(5200);
  });

  it('returns 0 for a null roof system', () => {
    expect(getRoofTopElevation(null)).toBe(0);
  });
});

describe('roof covering and edge-kit defaults', () => {
  const boundary = [
    { x: 0, y: 0 },
    { x: 8000, y: 0 },
    { x: 8000, y: 6000 },
    { x: 0, y: 6000 },
  ];

  it('gives a new pitched roof corrugated Shale Grey and the edge kit on', () => {
    const roofSystem = createRoofSystem('R', { roofType: 'gable', boundaryPolygon: boundary });
    expect(roofSystem.covering).toMatchObject({
      kind: 'metal_corrugated',
      productId: 'corrugated_042',
      finish: 'satin',
      colour: { hex: '#BDBFBA', name: 'Shale Grey' },
    });
    expect(roofSystem.trims.fascia.enabled).toBe(true);
    expect(roofSystem.trims.bargeCap.enabled).toBe(false);
    expect(roofSystem.trims.soffit.mode).toBe('boxed');
  });

  it('turns every trim off on flat and custom roofs', () => {
    for (const roofType of ['flat', 'custom']) {
      const { trims, covering } = createRoofSystem('R', { roofType, boundaryPolygon: boundary });
      expect(Object.values(trims).filter((entry) => entry?.enabled === true)).toEqual([]);
      expect(trims.soffit.mode).toBe('open');
      if (roofType === 'flat') expect(covering).toMatchObject({ kind: 'concrete_slab', thickness: 180 });
    }
  });

  it('normalizes a legacy roof that carries neither field', async () => {
    const { syncRoofSystemAttachment } = await import('./roofModels');
    const legacy = { id: 'roof_old', roofType: 'shed', boundaryPolygon: boundary, pitch: { slope: 10 } };
    const synced = syncRoofSystemAttachment({ floors: [], trussSystems: [] }, legacy);
    expect(synced.covering.kind).toBe('metal_corrugated');
    expect(synced.trims.gutter).toEqual({ enabled: true, profile: 'quad_115', width: 115, depth: 90 });
  });

  it('keeps what a roof already says, filling only what is missing', async () => {
    const { syncRoofSystemAttachment } = await import('./roofModels');
    const stored = {
      id: 'roof_kept',
      roofType: 'gable',
      boundaryPolygon: boundary,
      covering: { kind: 'clay_tile', colour: { hex: '#703731', name: 'RAL 3009 Oxide red', catalogue: 'ral' } },
      trims: { fascia: { enabled: false } },
    };
    const synced = syncRoofSystemAttachment({ floors: [], trussSystems: [] }, stored);
    expect(synced.covering).toMatchObject({ kind: 'clay_tile', colour: { hex: '#703731', catalogue: 'ral' } });
    expect(synced.trims.fascia).toEqual({ enabled: false, depth: 200, thickness: 25, drop: 0 });
  });
});
