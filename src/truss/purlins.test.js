import { describe, expect, it } from 'vitest';
import { buildTrussPurlinAttachments, createDetailPurlinMarker } from './purlins';
import { getTopChordRunLength } from './curveSampling';
import { buildTrussProfile } from './profile';
import { createPurlinSystem, createTrussInstance } from '@/domain/trussModels';

// A flat truss whose single top-chord run is exactly `span` long (7200mm here).
const FLAT_PROFILE = buildTrussProfile(
  createTrussInstance({ trussTypeId: 'truss_type_flat', span: 7200, rise: 900, overhangs: { start: 300, end: 300 } }),
);

const GABLE_PROFILE = buildTrussProfile(
  createTrussInstance({ trussTypeId: 'truss_type_gable', span: 8000, rise: 2000, overhangs: { start: 300, end: 300 } }),
);

describe('buildTrussPurlinAttachments - counts & spacing', () => {
  it('returns nothing when the purlin system is disabled', () => {
    const attachments = buildTrussPurlinAttachments(FLAT_PROFILE, createPurlinSystem({ enabled: false, spacing: 900 }));
    expect(attachments).toEqual([]);
  });

  it('returns nothing when spacing is zero (no divide/infinite loop)', () => {
    const attachments = buildTrussPurlinAttachments(FLAT_PROFILE, { enabled: true, spacing: 0 });
    expect(attachments).toEqual([]);
  });

  it('places a purlin at BOTH endpoints when offsets are zero (classic off-by-one check)', () => {
    // Run length 7200, spacing 900, offsets 0 -> distances 0,900,...,7200 inclusive.
    // 7200 / 900 = 8 intervals => 9 attachments (both endpoints included).
    const runLength = getTopChordRunLength(FLAT_PROFILE.topChordRuns[0]);
    expect(runLength).toBeCloseTo(7200, 6);

    const attachments = buildTrussPurlinAttachments(
      FLAT_PROFILE,
      createPurlinSystem({ enabled: true, spacing: 900, startOffset: 0, endOffset: 0 }),
    );
    expect(attachments).toHaveLength(9);
    const distances = attachments.map((a) => a.distanceAlong);
    expect(distances[0]).toBeCloseTo(0, 6);
    expect(distances[distances.length - 1]).toBeCloseTo(7200, 6);
    // Uniform spacing.
    for (let i = 1; i < distances.length; i += 1) {
      expect(distances[i] - distances[i - 1]).toBeCloseTo(900, 6);
    }
  });

  it('respects start and end offsets, trimming the count accordingly', () => {
    // limit = 7200 - 300 = 6900; start at 300 -> 300,1200,...,6600 (300 + 7*900). 8 attachments.
    const attachments = buildTrussPurlinAttachments(
      FLAT_PROFILE,
      createPurlinSystem({ enabled: true, spacing: 900, startOffset: 300, endOffset: 300 }),
    );
    expect(attachments).toHaveLength(8);
    expect(attachments[0].distanceAlong).toBeCloseTo(300, 6);
    expect(attachments[attachments.length - 1].distanceAlong).toBeCloseTo(6600, 6);
  });

  it('produces symmetric purlin runs on a gable (equal counts per side)', () => {
    const attachments = buildTrussPurlinAttachments(
      GABLE_PROFILE,
      createPurlinSystem({ enabled: true, spacing: 900, startOffset: 0, endOffset: 0 }),
    );
    const left = attachments.filter((a) => a.side === 'left');
    const right = attachments.filter((a) => a.side === 'right');
    expect(left.length).toBe(right.length);
    expect(left.length).toBeGreaterThan(0);
    // Each half-run is sqrt(4000^2 + 2000^2) ~= 4472mm; spacing 900 -> 5 purlins (0..3600).
    expect(left.length).toBe(5);
  });

  it('every attachment carries a side, a local point and a tangent', () => {
    const attachments = buildTrussPurlinAttachments(
      FLAT_PROFILE,
      createPurlinSystem({ enabled: true, spacing: 1200, startOffset: 0, endOffset: 0 }),
    );
    expect(attachments.length).toBeGreaterThan(0);
    for (const attachment of attachments) {
      expect(typeof attachment.side).toBe('string');
      expect(Number.isFinite(attachment.localPoint.x)).toBe(true);
      expect(Number.isFinite(attachment.localPoint.z)).toBe(true);
      expect(Number.isFinite(attachment.tangent.x)).toBe(true);
      expect(Number.isFinite(attachment.tangent.z)).toBe(true);
    }
  });
});

describe('createDetailPurlinMarker', () => {
  it('returns null for an attachment with no local point', () => {
    expect(createDetailPurlinMarker(null)).toBeNull();
    expect(createDetailPurlinMarker({})).toBeNull();
  });

  it('creates a marker centered on the local point, spanning the marker length', () => {
    const attachment = {
      id: 'main_0',
      localPoint: { x: 100, z: 200 },
      tangent: { x: 1, z: 0 },
    };
    const marker = createDetailPurlinMarker(attachment, 160);
    expect(marker.id).toBe('main_0');
    // With a horizontal tangent, the normal is vertical (z), so the marker spans z +/- 80.
    const length = Math.hypot(marker.end.x - marker.start.x, marker.end.z - marker.start.z);
    expect(length).toBeCloseTo(160, 6);
    const midX = (marker.start.x + marker.end.x) / 2;
    const midZ = (marker.start.z + marker.end.z) / 2;
    expect(midX).toBeCloseTo(100, 6);
    expect(midZ).toBeCloseTo(200, 6);
  });
});
