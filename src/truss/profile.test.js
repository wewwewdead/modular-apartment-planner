import { describe, expect, it } from 'vitest';
import { buildTrussProfile, resolveTrussMetrics } from './profile';
import { createTrussInstance } from '@/domain/trussModels';

function nodeKindCounts(profile) {
  return profile.nodes.reduce((acc, node) => {
    acc[node.kind] = (acc[node.kind] || 0) + 1;
    return acc;
  }, {});
}

function memberTypeCounts(profile) {
  return profile.members.reduce((acc, member) => {
    acc[member.memberType] = (acc[member.memberType] || 0) + 1;
    return acc;
  }, {});
}

describe('resolveTrussMetrics', () => {
  it('clamps span to a minimum of 1000mm', () => {
    // NOTE: createTrussInstance already clamps span to >= 1000, and resolveTrussMetrics
    // clamps again; a raw instance with span 10 resolves to 1000.
    const metrics = resolveTrussMetrics({ trussTypeId: 'truss_type_gable', span: 10 });
    expect(metrics.span).toBe(1000);
  });

  it('uses span/2 as the run for a gable and derives pitch from rise', () => {
    // Raw instance (not factory-built): only span and rise provided, no pitch.
    const metrics = resolveTrussMetrics({ trussTypeId: 'truss_type_gable', span: 8000, rise: 2000 });
    // run = span/2 = 4000; pitch = rise/run*100 = 2000/4000*100 = 50.
    expect(metrics.rise).toBe(2000);
    expect(metrics.pitch).toBeCloseTo(50, 6);
  });

  it('derives rise from pitch when only pitch is given', () => {
    const metrics = resolveTrussMetrics({ trussTypeId: 'truss_type_gable', span: 8000, pitch: 25 });
    // rise = pitch/100 * run = 0.25 * 4000 = 1000.
    expect(metrics.rise).toBeCloseTo(1000, 6);
    expect(metrics.pitch).toBeCloseTo(25, 6);
  });

  it('for a factory instance, rise is the source of truth and pitch is derived from it', () => {
    // RISE is authoritative. createTrussInstance stores an explicit rise verbatim
    // and derives a CONSISTENT pitch from it (run = span/2 = 4000, so
    // pitch = 2000/4000*100 = 50). The stored pitch and the profile geometry
    // therefore always agree -- resolveTrussMetrics returns the same pitch.
    const instance = createTrussInstance({ trussTypeId: 'truss_type_gable', span: 8000, rise: 2000 });
    expect(instance.rise).toBe(2000);
    expect(instance.pitch).toBeCloseTo(50, 6);

    const metrics = resolveTrussMetrics(instance);
    expect(metrics.rise).toBe(2000);
    expect(metrics.pitch).toBeCloseTo(50, 6);
  });

  it('for a factory instance built from pitch, rise is derived so geometry matches', () => {
    // When only pitch is supplied, createTrussInstance derives rise from it
    // (run = span/2 = 4000, so rise = 50% * 4000 = 2000) instead of leaving rise
    // at the truss-type default. The profile is then built from that rise.
    const instance = createTrussInstance({ trussTypeId: 'truss_type_gable', span: 8000, pitch: 50 });
    expect(instance.pitch).toBe(50);
    expect(instance.rise).toBeCloseTo(2000, 6);

    const metrics = resolveTrussMetrics(instance);
    expect(metrics.rise).toBeCloseTo(2000, 6);
    expect(metrics.pitch).toBeCloseTo(50, 6);

    // Geometry (ridge height) is driven by the pitch-implied rise.
    const profile = buildTrussProfile(instance);
    const ridge = profile.nodes.find((node) => node.kind === 'ridge');
    expect(ridge.z).toBeCloseTo(2000, 6);
  });

  it('resolves a legacy inconsistent rise/pitch pair by trusting rise', () => {
    // A raw (legacy) instance whose stored rise and pitch disagree: rise wins and
    // pitch is recomputed to match, so the resolved metrics are deterministic and
    // internally consistent regardless of the stale stored pitch.
    const metrics = resolveTrussMetrics({
      trussTypeId: 'truss_type_gable',
      span: 8000,
      rise: 2000,
      pitch: 25, // stale / inconsistent with rise 2000 at span 8000
    });
    expect(metrics.rise).toBe(2000);
    expect(metrics.pitch).toBeCloseTo(50, 6);
  });

  it('reports panelCount from the truss type web pattern (gable = 6)', () => {
    const metrics = resolveTrussMetrics({ trussTypeId: 'truss_type_gable', span: 8000 });
    expect(metrics.panelCount).toBe(6);
  });

  it('clamps overhangs to be non-negative', () => {
    const metrics = resolveTrussMetrics({
      trussTypeId: 'truss_type_gable',
      span: 8000,
      overhangs: { start: -500, end: 400 },
    });
    expect(metrics.overhangStart).toBe(0);
    expect(metrics.overhangEnd).toBe(400);
  });
});

describe('buildTrussProfile - gable', () => {
  const instance = createTrussInstance({
    trussTypeId: 'truss_type_gable',
    span: 8000,
    rise: 2000,
    overhangs: { start: 300, end: 300 },
  });
  const profile = buildTrussProfile(instance);

  it('produces the expected node and member counts', () => {
    // panelCount 6 -> top chord has 7 points (one is the ridge), bottom chord 7 points,
    // plus 2 overhang nodes = 16 nodes total.
    expect(profile.nodes).toHaveLength(16);
    expect(profile.members).toHaveLength(25);
  });

  it('classifies nodes: exactly one ridge, 2 overhangs, 7 bottom chord', () => {
    const counts = nodeKindCounts(profile);
    expect(counts.ridge).toBe(1);
    expect(counts.overhang).toBe(2);
    expect(counts.bottom_chord).toBe(7);
    expect(counts.top_chord).toBe(6);
  });

  it('has the documented member-type breakdown', () => {
    const counts = memberTypeCounts(profile);
    expect(counts.topChord).toBe(8);
    expect(counts.bottomChord).toBe(6);
    expect(counts.web).toBe(11);
  });

  it('places the ridge at mid-span and is left/right symmetric', () => {
    const ridge = profile.nodes.find((node) => node.kind === 'ridge');
    expect(ridge.x).toBeCloseTo(4000, 6);
    expect(ridge.z).toBeCloseTo(2000, 6);

    // The structural roof outline (excluding the flat overhang tails) is symmetric about x=4000.
    const structural = profile.roofOutline.filter((point) => point.kind);
    for (const point of structural) {
      const mirror = structural.find((entry) => Math.abs(entry.x - (8000 - point.x)) < 1e-6);
      expect(mirror).toBeDefined();
      expect(mirror.z).toBeCloseTo(point.z, 6);
    }
  });

  it('exposes two top-chord runs (left and right)', () => {
    expect(profile.topChordRuns).toHaveLength(2);
    expect(profile.topChordRuns.map((run) => run.side).sort()).toEqual(['left', 'right']);
  });

  it('bottom chord spans exactly from 0 to the span with panelCount even steps', () => {
    const bottom = profile.nodes.filter((node) => node.kind === 'bottom_chord').sort((a, b) => a.x - b.x);
    expect(bottom[0].x).toBeCloseTo(0, 6);
    expect(bottom[bottom.length - 1].x).toBeCloseTo(8000, 6);
    // All bottom-chord nodes are at z = 0.
    for (const node of bottom) expect(node.z).toBeCloseTo(0, 6);
  });
});

describe('buildTrussProfile - flat', () => {
  const profile = buildTrussProfile(createTrussInstance({ trussTypeId: 'truss_type_flat', span: 7200, rise: 900 }));

  it('has no ridge node (flat top chord)', () => {
    const counts = nodeKindCounts(profile);
    expect(counts.ridge).toBeUndefined();
    expect(counts.top_chord).toBe(7);
  });

  it('holds the top chord at a constant rise', () => {
    const top = profile.nodes.filter((node) => node.id.startsWith('top_'));
    for (const node of top) expect(node.z).toBeCloseTo(900, 6);
  });
});

describe('buildTrussProfile - shed', () => {
  const profile = buildTrussProfile(createTrussInstance({ trussTypeId: 'truss_type_shed', span: 6000, rise: 1200 }));

  it('produces a monotonically rising top chord with a single high point', () => {
    const counts = nodeKindCounts(profile);
    expect(counts.high_point).toBe(1);
    const top = profile.nodes.filter((node) => node.id.startsWith('top_')).sort((a, b) => a.x - b.x);
    for (let i = 1; i < top.length; i += 1) {
      expect(top[i].z).toBeGreaterThanOrEqual(top[i - 1].z - 1e-6);
    }
    // High point reaches the full rise.
    expect(top[top.length - 1].z).toBeCloseTo(1200, 6);
  });
});
