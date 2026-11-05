import { describe, expect, it } from 'vitest';
import { HIP_SLICE_MIN_RUN, buildTrussProfile, resolveTrussMetrics } from './profile';
import { createTrussInstance } from '@/domain/trussModels';
import { WEB_PATTERNS } from './webPatterns';

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

    // Geometry (ridge height) is driven by the pitch-implied rise. RT-3: rise
    // is measured on the top chord's UNDERSIDE line (0 at the heels), so the
    // ridge of the bare profile line — not the member centre-line — is 2000.
    const profile = buildTrussProfile(instance);
    expect(Math.max(...profile.lineOutline.map((point) => point.z))).toBeCloseTo(2000, 6);
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

describe('buildTrussProfile - gable (RT-3 member geometry, spec §7.7)', () => {
  // 25 % pitch: rise 1800 over a 7200 run (span 14400), 300 overhangs, the
  // default AU 90 × 35 chords. θ = atan(0.25) = 14.04°, 90 / cos θ = 92.77.
  const instance = createTrussInstance({
    trussTypeId: 'truss_type_gable',
    span: 14400,
    rise: 1800,
    overhangs: { start: 300, end: 300 },
  });
  const profile = buildTrussProfile(instance);
  const slopeFace = 90 / Math.cos(Math.atan(0.25));

  it('derives the heel height = bc + tc / cos θ', () => {
    expect(profile.metrics.heelHeight).toBeCloseTo(90 + slopeFace, 6);
    expect(profile.metrics.heelHeight).toBeGreaterThan(182.7);
    expect(profile.metrics.heelHeight).toBeLessThan(182.9);
    expect(profile.metrics.pitchDegrees).toBeCloseTo(14.036, 2);
    expect(profile.metrics.outToOut).toBe(15000);
  });

  it('continues the slope over the tails: start tail underside = 90 − 300 × 0.25', () => {
    expect(profile.undersideOutline[0]).toEqual({ x: -300, z: 15 });
    expect(profile.undersideOutline[profile.undersideOutline.length - 1].z).toBeCloseTo(15, 6);
    const tail = profile.nodes.find((node) => node.kind === 'overhang' && node.x < 0);
    // The tail node is on the chord centre-line, half the plumb depth above the underside.
    expect(tail.z).toBeCloseTo(15 + slopeFace / 2, 6);
    // The top face (roofOutline) is plumb-cut at the tail tip.
    expect(profile.roofOutline[0].x).toBeCloseTo(-300, 6);
    expect(profile.roofOutline[0].z).toBeCloseTo(15 + slopeFace, 6);
  });

  it('puts the ridge top face at bc + rise + tc / cos θ', () => {
    expect(profile.metrics.overallHeight).toBeCloseTo(90 + 1800 + slopeFace, 6);
    const ridge = profile.nodes.find((node) => node.kind === 'ridge');
    expect(ridge.x).toBeCloseTo(7200, 6);
    expect(ridge.z).toBeCloseTo(90 + 1800 + slopeFace / 2, 6);
  });

  it('sits the bottom chord on the bearing: bottom nodes at bc / 2', () => {
    const bottom = profile.nodes.filter((node) => node.kind === 'bottom_chord');
    expect(bottom.length).toBeGreaterThan(0);
    for (const node of bottom) expect(node.z).toBeCloseTo(45, 6);
    // The bottom outline is the bearing face itself.
    for (const point of profile.bottomOutline) expect(point.z).toBeCloseTo(0, 6);
  });

  it('defaults a gable to Fink: 4 webs on t0.25–b1/3–t0.5–b2/3–t0.75', () => {
    expect(profile.webPatternKey).toBe('fink');
    const nodeMap = new Map(profile.nodes.map((node) => [node.id, node]));
    const webs = profile.members.filter((member) => member.memberType === 'web');
    expect(webs).toHaveLength(4);
    const xs = webs.map((member) =>
      [nodeMap.get(member.startNodeId).x, nodeMap.get(member.endNodeId).x].map((x) => Math.round(x)),
    );
    expect(xs).toEqual([
      [3600, 4800],
      [4800, 7200],
      [7200, 9600],
      [9600, 10800],
    ]);
    const counts = memberTypeCounts(profile);
    expect(counts.topChord).toBe(6);
    expect(counts.bottomChord).toBe(3);
    expect(nodeKindCounts(profile)).toEqual({ overhang: 2, top_chord: 4, ridge: 1, bottom_chord: 4 });
  });

  it('carries member lengths', () => {
    const bottom = profile.members.filter((member) => member.memberType === 'bottomChord');
    expect(bottom.reduce((sum, member) => sum + member.length, 0)).toBeCloseTo(14400, 6);
  });

  it('exposes two top-chord runs (left and right) on the chord centre-line', () => {
    expect(profile.topChordRuns.map((run) => run.side).sort()).toEqual(['left', 'right']);
    const left = profile.topChordRuns.find((run) => run.side === 'left');
    expect(left.points[0].z).toBeCloseTo(90 + slopeFace / 2, 6);
  });
});

describe('buildTrussProfile - web patterns (§7.3)', () => {
  const webs = (webPatternKey, extra = {}) =>
    buildTrussProfile(
      createTrussInstance({ trussTypeId: 'truss_type_gable', span: 7200, rise: 1800, webPatternKey, ...extra }),
    ).members.filter((member) => member.memberType === 'web');

  it('counts the webs of each named gable pattern', () => {
    expect(webs('king_post')).toHaveLength(1);
    expect(webs('queen_post')).toHaveLength(2);
    expect(webs('fink')).toHaveLength(4);
    expect(webs('howe')).toHaveLength(5);
    expect(webs('fan')).toHaveLength(6);
    expect(webs('double_fink')).toHaveLength(8);
    expect(webs('double_howe')).toHaveLength(9);
  });

  it('draws gable studs every 600 on a 7200 span: 11 verticals at 600 … 6600', () => {
    const profile = buildTrussProfile(
      createTrussInstance({ trussTypeId: 'truss_type_gable', span: 7200, rise: 1800 }),
      undefined,
      { webPatternKey: 'gable_studs' },
    );
    const nodeMap = new Map(profile.nodes.map((node) => [node.id, node]));
    const studs = profile.members.filter((member) => member.memberType === 'web');
    expect(studs).toHaveLength(11);
    const xs = studs.map((member) => {
      const a = nodeMap.get(member.startNodeId);
      const b = nodeMap.get(member.endNodeId);
      expect(a.x).toBeCloseTo(b.x, 6);
      return Math.round(a.x);
    });
    expect(xs).toEqual([600, 1200, 1800, 2400, 3000, 3600, 4200, 4800, 5400, 6000, 6600]);
    // The frame keeps the truss outline exactly (same top face as the Fink copy).
    const fink = buildTrussProfile(createTrussInstance({ trussTypeId: 'truss_type_gable', span: 7200, rise: 1800 }));
    expect(profile.roofOutline).toEqual(fink.roofOutline);
  });

  it('ignores a pattern from another family and falls back to the type default', () => {
    expect(webs('warren')).toHaveLength(4);
  });

  it('a raised heel of 300 adds two heel studs and lifts the heel', () => {
    const profile = buildTrussProfile(
      createTrussInstance({ trussTypeId: 'truss_type_gable', span: 7200, rise: 1800 }),
      undefined,
      { heel: { raised: 300 } },
    );
    const studs = profile.members.filter((member) => member.role === 'heel_stud');
    expect(studs).toHaveLength(2);
    const slopeFace = 90 / Math.cos(Math.atan(0.5));
    expect(profile.metrics.heelHeight).toBeCloseTo(90 + 300 + slopeFace, 6);
  });

  it('a scissor truss lifts its bottom chord to rise × ratio at mid-span', () => {
    const profile = buildTrussProfile(
      createTrussInstance({ trussTypeId: 'truss_type_scissor', span: 7200, rise: 1800, scissorBottomPitchRatio: 0.5 }),
    );
    const mid = profile.nodes.find((node) => node.kind === 'bottom_chord' && Math.abs(node.x - 3600) < 1);
    expect(mid.z).toBeCloseTo(1800 * 0.5 + 45, 6);
    expect(profile.webPatternKey).toBe('fink');
    expect(profile.members.filter((member) => member.memberType === 'web')).toHaveLength(4);
  });

  it('keeps every pattern listed', () => {
    expect(Object.keys(WEB_PATTERNS)).toEqual(
      expect.arrayContaining(['king_post', 'fink', 'howe', 'mono_howe', 'mono_fan', 'warren', 'pratt', 'gable_studs']),
    );
  });
});

describe('buildTrussProfile - flat', () => {
  const profile = buildTrussProfile(createTrussInstance({ trussTypeId: 'truss_type_flat', span: 7200, rise: 900 }));

  it('has no ridge node (flat top chord)', () => {
    const counts = nodeKindCounts(profile);
    expect(counts.ridge).toBeUndefined();
    expect(counts.top_chord).toBe(7);
  });

  it('holds the top chord at a constant height: bc + rise + tc / 2 (RT-3: chords now have depth)', () => {
    const top = profile.nodes.filter((node) => node.id.startsWith('top_'));
    for (const node of top) expect(node.z).toBeCloseTo(90 + 900 + 45, 6);
    expect(profile.metrics.overallHeight).toBeCloseTo(90 + 900 + 90, 6);
  });

  it('draws Warren (the old alternating layout) plus two end posts', () => {
    expect(profile.webPatternKey).toBe('warren');
    // 5 interior verticals + 2 end posts + 6 diagonals.
    expect(profile.members.filter((member) => member.memberType === 'web')).toHaveLength(13);
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
    // The underside line reaches the full rise above the heel; the high point
    // (a centre-line node since RT-3) sits half a plumb chord depth above it.
    const plumb = 90 / Math.cos(Math.atan(0.2));
    expect(top[top.length - 1].z).toBeCloseTo(90 + 1200 + plumb / 2, 6);
  });

  it('slopes both tails with the run (the start tail drops below the heel)', () => {
    const shed = buildTrussProfile(
      createTrussInstance({
        trussTypeId: 'truss_type_shed',
        span: 6000,
        rise: 1200,
        overhangs: { start: 500, end: 500 },
      }),
    );
    expect(shed.undersideOutline[0].z).toBeCloseTo(90 - 500 * 0.2, 6);
    expect(shed.undersideOutline[shed.undersideOutline.length - 1].z).toBeCloseTo(90 + 1200 + 500 * 0.2, 6);
  });

  it('draws Mono Fan with the high-end post', () => {
    expect(profile.webPatternKey).toBe('mono_fan');
    // 3 interior verticals + the high-end post + 4 alternating diagonals.
    expect(profile.members.filter((member) => member.memberType === 'web')).toHaveLength(8);
  });
});

describe('buildTrussProfile - outline shapes', () => {
  it('keeps the box gable panel layout and slopes its tails', () => {
    const profile = buildTrussProfile(
      createTrussInstance({ trussTypeId: 'truss_type_box_gable', span: 8400, rise: 1800 }),
    );
    expect(profile.webPatternKey).toBeNull();
    expect(profile.undersideOutline[0].z).toBeLessThan(90);
  });

  it('builds a gable end frame on a box gable that keeps its crown', () => {
    const instance = createTrussInstance({ trussTypeId: 'truss_type_box_gable', span: 8400, rise: 1800 });
    const frame = buildTrussProfile(instance, undefined, { webPatternKey: 'gable_studs' });
    const typical = buildTrussProfile(instance);
    expect(frame.webPatternKey).toBe('gable_studs');
    expect(frame.roofOutline).toEqual(typical.roofOutline);
    expect(frame.members.every((member) => member.memberType !== 'web' || member.length > 0)).toBe(true);
  });
});

// RT-4.1 (spec §7.10): hip slices on the 25 % system — span 7200, rise 900,
// 300 tails, 90 × 35 chords, a 12 000 support line, 8 panels (900 apart).
describe('buildTrussProfile - hip slices (RT-4.1)', () => {
  const instance = createTrussInstance({
    trussTypeId: 'truss_type_hip',
    span: 7200,
    rise: 900,
    overhangs: { start: 300, end: 300 },
  });
  const slice = (layoutOffset) => buildTrussProfile(instance, undefined, { layoutOffset, supportLength: 12000 });
  const SECANT = Math.hypot(1, 0.25);
  // The two chord centre-lines meet tc/2 · (sec θ − 1) / tan θ inside a
  // crown kink (the mitre): that is where the kink node sits.
  const MITRE_SHIFT = (45 * (SECANT - 1)) / 0.25;
  const chordCount = (profile) => profile.members.filter((member) => member.memberType === 'topChord').length;
  const webIds = (profile) =>
    profile.members
      .filter((member) => member.memberType === 'web')
      .map((member) => `${member.startNodeId}-${member.endNodeId}`)
      .sort();

  it('gives a station-1200 slice chord nodes at its crown kinks (1200 and 6000)', () => {
    const profile = slice(1200);
    expect(profile.lineOutline.map((point) => point.x)).toEqual([-300, 0, 1200, 6000, 7200, 7500]);
    const kinks = profile.nodes.filter((node) => node.id.startsWith('top_kink_'));
    expect(kinks.map((node) => node.kind)).toEqual(['top_chord', 'top_chord']);
    expect(kinks[0].x).toBeCloseTo(1200 - MITRE_SHIFT, 6);
    expect(kinks[1].x).toBeCloseTo(6000 + MITRE_SHIFT, 6);
    // On the level crown's centre-line: bc + 0.25 × 1200 + tc / 2.
    for (const node of kinks) expect(node.z).toBeCloseTo(90 + 300 + 45, 6);
    // A panel-only chain is tail + 8 panels + tail = 10 members; the kinks add two.
    expect(chordCount(profile)).toBe(12);
  });

  it('keeps the webs on the panel points: the same webs as a slice whose crown is a panel point', () => {
    const profile = slice(1200);
    expect(webIds(profile).some((id) => id.includes('top_kink_'))).toBe(false);
    const onPanel = slice(900);
    expect(onPanel.nodes.some((node) => node.id.startsWith('top_kink_'))).toBe(false);
    expect(chordCount(onPanel)).toBe(10);
    expect(webIds(profile)).toEqual(webIds(onPanel));
  });

  it('lays every sloped chord member of a slice on the sloped centre-line', () => {
    const profile = slice(1200);
    const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
    for (const member of profile.members.filter((entry) => entry.memberType === 'topChord')) {
      const a = nodes.get(member.startNodeId);
      const b = nodes.get(member.endNodeId);
      const slope = Math.abs((b.z - a.z) / (b.x - a.x));
      expect([0, 0.25].some((value) => Math.abs(slope - value) < 1e-9)).toBe(true);
    }
  });

  it('ends a slice run on its own slope: bc + 0.25 × 1200 + tc / 2 · sec θ at the crown', () => {
    const left = slice(1200).topChordRuns.find((run) => run.id === 'left');
    const crown = left.points[left.points.length - 1];
    expect(crown.x).toBe(1200);
    expect(crown.z).toBeCloseTo(90 + 300 + 45 * SECANT, 6);
    expect(left.points[0].z).toBeCloseTo(90 + 45 * SECANT, 6);
  });

  it('slopes a station-0 slice’s tails at the hip pitch: −75 at both tips', () => {
    const profile = slice(0);
    const line = profile.lineOutline;
    expect(line[0]).toEqual({ x: -300, z: -75 });
    expect(line[line.length - 1]).toEqual({ x: 7500, z: -75 });
    expect(line.filter((point) => point.x >= 0 && point.x <= 7200).every((point) => point.z === 0)).toBe(true);
    expect(profile.undersideOutline[0].z).toBeCloseTo(90 - 75, 6);
  });

  it('builds a station-0.025 sliver as the flat slice', () => {
    expect(HIP_SLICE_MIN_RUN).toBe(1);
    const sliver = slice(12000 - 0.025);
    const flat = slice(0);
    expect(sliver.lineOutline).toEqual(flat.lineOutline);
    expect(sliver.roofOutline).toEqual(flat.roofOutline);
    expect(sliver.nodes.map((node) => node.id)).toEqual(flat.nodes.map((node) => node.id));
  });

  it('keeps the flat FAMILY’s tails level', () => {
    const flat = buildTrussProfile(
      createTrussInstance({
        trussTypeId: 'truss_type_flat',
        span: 7200,
        rise: 900,
        overhangs: { start: 300, end: 300 },
      }),
    );
    expect(flat.lineOutline.every((point) => point.z === 900)).toBe(true);
  });
});

// RT-4.1 (spec §7.10.1): kink nodes must not touch a profile whose kinks
// already sit on panel points. Pinned from the output BEFORE RT-4.1.
describe('buildTrussProfile - unchanged by RT-4.1 (pinned)', () => {
  it('keeps the plain gable: node ids, member count and roof outline', () => {
    const profile = buildTrussProfile(
      createTrussInstance({
        trussTypeId: 'truss_type_gable',
        span: 7200,
        rise: 900,
        overhangs: { start: 300, end: 300 },
      }),
    );
    expect(profile.nodes.map((node) => node.id)).toEqual([
      'overhang_0',
      'overhang_1',
      'top_0',
      'top_1',
      'top_2',
      'top_3',
      'top_4',
      'bottom_0',
      'bottom_1',
      'bottom_2',
      'bottom_3',
    ]);
    expect(profile.members).toHaveLength(13);
    expect(profile.roofOutline.map(({ x, z }) => ({ x, z }))).toEqual([
      { x: -300, z: 107.76987657639737 },
      { x: 0, z: 182.76987657639737 },
      { x: 1200, z: 482.76987657639734 },
      { x: 2400, z: 782.7698765763973 },
      { x: 3600, z: 1082.7698765763973 },
      { x: 4800, z: 782.7698765763973 },
      { x: 6000, z: 482.7698765763972 },
      { x: 7200, z: 182.76987657639737 },
      { x: 7500, z: 107.76987657639737 },
    ]);
  });
  it('keeps the plain shed: node ids, member count and roof outline', () => {
    const profile = buildTrussProfile(
      createTrussInstance({
        trussTypeId: 'truss_type_shed',
        span: 6000,
        rise: 1200,
        overhangs: { start: 300, end: 300 },
      }),
    );
    expect(profile.nodes.map((node) => node.id)).toEqual([
      'overhang_0',
      'overhang_1',
      'top_0',
      'top_1',
      'top_2',
      'top_3',
      'top_4',
      'bottom_0',
      'bottom_1',
      'bottom_2',
      'bottom_3',
      'bottom_4',
    ]);
    expect(profile.members).toHaveLength(18);
    expect(profile.roofOutline.map(({ x, z }) => ({ x, z }))).toEqual([
      { x: -300, z: 121.78235124467014 },
      { x: 0, z: 181.78235124467014 },
      { x: 1500, z: 481.78235124467017 },
      { x: 3000, z: 781.7823512446702 },
      { x: 4500, z: 1081.78235124467 },
      { x: 6000, z: 1381.78235124467 },
      { x: 6300, z: 1441.78235124467 },
    ]);
  });
  it('keeps the plain flat: node ids, member count and roof outline', () => {
    const profile = buildTrussProfile(
      createTrussInstance({
        trussTypeId: 'truss_type_flat',
        span: 7200,
        rise: 900,
        overhangs: { start: 300, end: 300 },
      }),
    );
    expect(profile.nodes.map((node) => node.id)).toEqual([
      'overhang_0',
      'overhang_1',
      'top_0',
      'top_1',
      'top_2',
      'top_3',
      'top_4',
      'top_5',
      'top_6',
      'bottom_0',
      'bottom_1',
      'bottom_2',
      'bottom_3',
      'bottom_4',
      'bottom_5',
      'bottom_6',
    ]);
    expect(profile.members).toHaveLength(27);
    expect(profile.roofOutline.map(({ x, z }) => ({ x, z }))).toEqual([
      { x: -300, z: 1080 },
      { x: 0, z: 1080 },
      { x: 7200, z: 1080 },
      { x: 7500, z: 1080 },
    ]);
  });

  // The domed arch's sample points are a curve, not structural kinks: its
  // chord stays the panel-only chain (curvedChord; RT-4.1 audit).
  it('keeps the domed arch a panel-point chain: no kink nodes, 10 chord members', () => {
    const profile = buildTrussProfile(
      createTrussInstance({ trussTypeId: 'truss_type_domed', overhangs: { start: 300, end: 300 } }),
    );
    // 2 overhang + 9 top + 9 bottom.
    expect(profile.nodes).toHaveLength(20);
    expect(profile.nodes.some((node) => node.id.startsWith('top_kink_'))).toBe(false);
    expect(profile.members.filter((member) => member.memberType === 'topChord')).toHaveLength(10);
    expect(profile.members).toHaveLength(33);
    expect(profile.topChordRuns).toHaveLength(1);
    expect(profile.topChordRuns[0].measurementCurve.kind).toBe('sine_arch');
  });
});
