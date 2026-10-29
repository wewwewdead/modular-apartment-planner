import { describe, expect, it } from 'vitest';
import {
  LOOP_JOIN_TOLERANCE_MM,
  collectDraftingProfiles,
  describeHealedGap,
  draftingArcMidpoint,
  draftingProfile,
  summarizeSkipped,
} from './draftingProfiles.js';
import { emptyModel, numeric, profileToPart, resolveParameters } from './model.js';
import { translateInstance } from './movement.js';
import { applyFillet, computeSketchFillet, findFilletableCorner } from '../utils/filletUtils.js';
import sketchStudioReducer from '../store/sketchStudioReducer.js';
import initialState from '../store/sketchStudioInitialState.js';

describe('drafting to solid profiles', () => {
  it('preserves rotated rectangle coordinates and circle accuracy', () => {
    const p = draftingProfile({ type: 'rect', x: 10, y: 20, width: 100, height: 40, rotation: 90 });
    expect(p.type).toBe('polygon');
    expect(p.points[0][0]).toBeCloseTo(80);
    expect(p.points[0][1]).toBeCloseTo(-10);
    expect(draftingProfile({ type: 'circle', cx: 3, cy: 7, r: 19 })).toEqual({
      type: 'circle',
      center: [3, 7],
      radius: 19,
    });
  });
  it('assembles unordered reversed lines into separate closed loops without mutating the drawing', () => {
    const lines = [
      { id: 'b', type: 'line', x1: 100, y1: 50, x2: 100, y2: 0 },
      { id: 'd', type: 'line', x1: 0, y1: 50, x2: 0, y2: 0 },
      { id: 'a', type: 'line', x1: 0, y1: 0, x2: 100, y2: 0 },
      { id: 'c', type: 'line', x1: 0, y1: 50, x2: 100, y2: 50 },
    ];
    const entities = [...lines, ...lines.map((e) => ({ ...e, id: e.id + '2', x1: e.x1 + 200, x2: e.x2 + 200 }))];
    const original = JSON.stringify(entities);
    const { candidates, rejected } = collectDraftingProfiles(entities);
    expect(candidates).toHaveLength(2);
    expect(candidates[0].sourceIds.sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(candidates[0].profile.points).toHaveLength(4);
    expect(rejected).toEqual([]);
    expect(JSON.stringify(entities)).toBe(original);
    const branch = { id: 'branch', type: 'line', x1: 0, y1: 0, x2: -40, y2: 0 };
    expect(collectDraftingProfiles([...lines, branch]).candidates).toHaveLength(0);
    expect(collectDraftingProfiles(lines.slice(1)).rejected[0].reason).toMatch(/^open loop — 50\.00 mm gap/);
  });
  it('rejects open, intersecting, degenerate and projected outlines explicitly', () => {
    const poly = {
      type: 'polyline',
      points: [
        { x: 0, y: 0 },
        { x: 20, y: 20 },
        { x: 0, y: 20 },
        { x: 20, y: 0 },
      ],
    };
    expect(() => draftingProfile(poly)).toThrow(/Close/);
    expect(() => draftingProfile({ ...poly, closed: true })).toThrow(/cross/);
    expect(() => draftingProfile({ type: 'rect', x: 0, y: 0, width: 10, height: 0 })).toThrow(/positive/);
    expect(() => draftingProfile({ type: 'circle', r: 10, meta: { isometricPlane: 'top' } })).toThrow(/Isometric/);
    expect(() =>
      draftingProfile({
        type: 'polyline',
        closed: true,
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 2, y: 0 },
        ],
      }),
    ).toThrow(/area/);
  });
  it('copies independent profiles with an explicit depth and material, never inferring holes', () => {
    const entities = [
      { id: 'outer', type: 'circle', r: 50, name: 'Disk' },
      { id: 'inner', type: 'circle', r: 10 },
    ];
    const { candidates } = collectDraftingProfiles(entities);
    expect(candidates).toHaveLength(2);
    const created = profileToPart(entities[0], { depth: 12, material: 'Steel' });
    expect(created.part.features[0].length).toBe(12);
    expect(created.part.material).toBe('Steel');
    expect(created.part.sourceEntityIds).toEqual(['outer']);
    expect(created.sketch.profile.holes).toBeUndefined();
    created.sketch.profile.radius = 60;
    expect(entities[0].r).toBe(50);
    expect(() => profileToPart(entities[0], { depth: 0 })).toThrow(/greater than zero/);
  });
});

// The rectangle the Ortho-after-snap bug produced: the closing click snapped
// onto corner A, then Ortho moved it 0.62 mm off along x.
const orthoGapRectangle = () => [
  { id: 'l1', type: 'line', x1: 100, y1: 100, x2: 400.37, y2: 100 },
  { id: 'l2', type: 'line', x1: 400.37, y1: 100, x2: 400.37, y2: 300.84 },
  { id: 'l3', type: 'line', x1: 400.37, y1: 300.84, x2: 100.62, y2: 300.84 },
  { id: 'l4', type: 'line', x1: 100.62, y1: 300.84, x2: 100.62, y2: 100 },
];
const square = (prefix = 's', size = 50, x0 = 0) => [
  { id: `${prefix}1`, type: 'line', x1: x0, y1: 0, x2: x0 + size, y2: 0 },
  { id: `${prefix}2`, type: 'line', x1: x0 + size, y1: 0, x2: x0 + size, y2: size },
  { id: `${prefix}3`, type: 'line', x1: x0 + size, y1: size, x2: x0, y2: size },
  { id: `${prefix}4`, type: 'line', x1: x0, y1: size, x2: x0, y2: 0 },
];

describe('line loop tolerance, gap healing and diagnostics', () => {
  it('rejects the 0.62 mm ortho gap with the exact gap when healing is off', () => {
    const { candidates, rejected, healed } = collectDraftingProfiles(orthoGapRectangle());
    expect(candidates).toEqual([]);
    expect(healed).toEqual([]);
    expect(rejected).toHaveLength(1);
    expect(`${rejected[0].name}: ${rejected[0].reason}`).toBe(
      '4 connected lines: open loop — 0.62 mm gap between (100.00, 100.00) and (100.62, 100.00)',
    );
    expect(rejected[0].kind).toBe('open-loop');
    expect(rejected[0].gapMm).toBeCloseTo(0.62, 9);
  });

  it('heals the 0.62 mm ortho gap when the tolerance covers it, without touching the drawing', () => {
    // 0.5 mm (the dialog default) is below this gap, so it stays open.
    expect(collectDraftingProfiles(orthoGapRectangle(), { healGapMm: 0.5 }).candidates).toEqual([]);
    const entities = orthoGapRectangle();
    const original = JSON.stringify(entities);
    const { candidates, rejected, healed } = collectDraftingProfiles(entities, { healGapMm: 1 });
    expect(rejected).toEqual([]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].sourceIds.sort()).toEqual(['l1', 'l2', 'l3', 'l4']);
    expect(healed).toHaveLength(1);
    expect(healed[0].ids).toEqual(['l1', 'l4']);
    expect(healed[0].gapMm).toBeCloseTo(0.62, 9);
    // The merged node keeps the earlier line's endpoint: the corner the user snapped to.
    expect(healed[0].at).toEqual([100, 100]);
    expect(candidates[0].profile.points).toContainEqual([100, 100]);
    expect(describeHealedGap(healed[0])).toBe('Closed a 0.62 mm gap at (100.00, 100.00) between l1 and l4');
    expect(JSON.stringify(entities)).toBe(original);
    // The healed candidate survives the second draftingProfile() pass in profileToPart.
    expect(profileToPart(candidates[0].entity, { depth: 3 }).sketch.profile.type).toBe('polygon');
  });

  it('heals sub-0.5 mm gaps at the dialog default', () => {
    const lines = square();
    lines[3] = { ...lines[3], y2: 0.3 };
    const { candidates, healed } = collectDraftingProfiles(lines, { healGapMm: 0.5 });
    expect(candidates).toHaveLength(1);
    expect(healed).toEqual([{ ids: ['s1', 's4'], gapMm: expect.closeTo(0.3, 9), at: [0, 0] }]);
  });

  it('joins float-noise gaps silently without healing', () => {
    const lines = square();
    lines[3] = { ...lines[3], x2: 1e-9, y2: -1e-9 };
    lines[1] = { ...lines[1], y1: 0.004 };
    expect(0.004).toBeLessThan(LOOP_JOIN_TOLERANCE_MM);
    const { candidates, rejected, healed } = collectDraftingProfiles(lines);
    expect(rejected).toEqual([]);
    expect(healed).toEqual([]);
    expect(candidates).toHaveLength(1);
  });

  it('never heals two closed loops whose corners almost touch into a branch', () => {
    const { candidates, healed } = collectDraftingProfiles([...square('a'), ...square('b', 50, 50.3)], {
      healGapMm: 0.5,
    });
    expect(candidates).toHaveLength(2);
    expect(healed).toEqual([]);
  });

  it('ignores exact duplicate lines quietly instead of reporting a branch', () => {
    const duplicate = { id: 'dup', type: 'line', x1: 50, y1: 50, x2: 50, y2: 0 }; // s2 reversed
    const { candidates, rejected, skipped } = collectDraftingProfiles([...square(), duplicate]);
    expect(candidates).toHaveLength(1);
    expect(rejected).toEqual([]);
    expect(skipped).toEqual([
      expect.objectContaining({ id: 'dup', kind: 'duplicate', reason: 'Duplicate of s2; ignored.' }),
    ]);
    expect(summarizeSkipped(skipped)).toEqual(['1 duplicate line ignored (dup duplicates s2)']);
  });

  it('reports where a branch is', () => {
    const { rejected } = collectDraftingProfiles([
      ...square(),
      { id: 't', type: 'line', x1: 0, y1: 0, x2: -40, y2: 0 },
    ]);
    expect(rejected).toHaveLength(1);
    expect(`${rejected[0].name}: ${rejected[0].reason}`).toBe(
      '5 connected lines: branch at (0.00, 0.00): 3 lines meet',
    );
  });

  it('reports the gap to a neighbouring line group, where the outline is really broken', () => {
    const lines = square().slice(0, 3);
    lines.push({ id: 'x', type: 'line', x1: 0, y1: 50, x2: 0, y2: 20 });
    lines.push({ id: 'y', type: 'line', x1: 0, y1: 20.5, x2: 0, y2: 5 });
    const { rejected } = collectDraftingProfiles(lines);
    expect(rejected.map((item) => `${item.name}: ${item.reason}`)).toEqual([
      '4 connected lines: open loop — 0.50 mm gap between (0.00, 20.00) and (0.00, 20.50)',
      '1 connected line: open loop — 0.50 mm gap between (0.00, 20.50) and (0.00, 20.00)',
    ]);
    // Once y reaches the corner, the 0.5 mm gap is the only break, and healing closes it.
    lines[4] = { ...lines[4], y2: 0 };
    expect(collectDraftingProfiles(lines).rejected.map((item) => `${item.name}: ${item.reason}`)).toEqual([
      '5 connected lines: open loop — 0.50 mm gap between (0.00, 20.00) and (0.00, 20.50)',
    ]);
    const healedRun = collectDraftingProfiles(lines, { healGapMm: 0.5 });
    expect(healedRun.candidates).toHaveLength(1);
    expect(healedRun.healed).toEqual([{ ids: ['x', 'y'], gapMm: expect.closeTo(0.5, 9), at: [0, 20] }]);
  });

  it('names the open-end count and the closest pair when a branch leaves several open ends', () => {
    const plus = [
      { id: 'e', type: 'line', x1: 0, y1: 0, x2: 30, y2: 0 },
      { id: 'w', type: 'line', x1: 0, y1: 0, x2: -30, y2: 0 },
      { id: 'n', type: 'line', x1: 0, y1: 0, x2: 0, y2: -20 },
      { id: 's', type: 'line', x1: 0, y1: 0, x2: 0, y2: 40 },
    ];
    expect(collectDraftingProfiles(plus).rejected[0].reason).toBe(
      'branch at (0.00, 0.00): 4 lines meet; 4 open end(s); closest is a 36.06 mm gap between (30.00, 0.00) and (0.00, -20.00)',
    );
  });

  it('accepts a polyline whose vertices were double-clicked', () => {
    const profile = draftingProfile({
      type: 'polyline',
      closed: true,
      points: [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 0.000001 },
        { x: 40, y: 30 },
        { x: 0, y: 30 },
        { x: 0, y: 0 },
        { x: 0, y: 0.002 },
      ],
    });
    expect(profile.points).toEqual([
      [0, 0],
      [40, 0],
      [40, 30],
      [0, 30],
    ]);
  });

  it('keeps hidden entities and hidden layers out of the loop graph', () => {
    const lines = square().map((line) => ({ ...line, layerId: 'default' }));
    const construction = { id: 'c', type: 'line', x1: 0, y1: 0, x2: 0, y2: -80, layerId: 'construction' };
    const hiddenOwn = { id: 'h', type: 'line', x1: 50, y1: 50, x2: 90, y2: 90, visible: false };
    const layers = [
      { id: 'default', visible: true },
      { id: 'construction', visible: false },
    ];
    // Without layer info the construction line is a branch of the square.
    expect(collectDraftingProfiles([...lines, construction]).candidates).toHaveLength(0);
    const { candidates, rejected, skipped } = collectDraftingProfiles([...lines, construction, hiddenOwn], { layers });
    expect(candidates).toHaveLength(1);
    expect(rejected).toEqual([]);
    expect(skipped.map((s) => [s.id, s.kind])).toEqual([
      ['c', 'hidden'],
      ['h', 'hidden'],
    ]);
    expect(summarizeSkipped(skipped)).toEqual(['2 hidden entities ignored']);
  });

  it('summarises annotations in one quiet line instead of rejecting each', () => {
    const entities = [
      ...square(),
      { id: 'd1', type: 'dimension' },
      { id: 'd2', type: 'dimension' },
      { id: 'd3', type: 'dimension' },
      { id: 't1', type: 'text' },
      { id: 'f1', type: 'feature', featureType: 'hole' },
    ];
    const { candidates, rejected, skipped } = collectDraftingProfiles(entities);
    expect(candidates).toHaveLength(1);
    expect(rejected).toEqual([]);
    expect(summarizeSkipped(skipped)).toEqual([
      '3 dimensions and 1 text skipped (annotations are not geometry)',
      '1 hole/cutout feature skipped (features are not imported as parts)',
    ]);
  });

  it('collapses many isometric entities into one rejection', () => {
    const iso = square().map((line) => ({ ...line, meta: { isometricPlane: 'top' } }));
    const { rejected } = collectDraftingProfiles(iso);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].name).toBe('4 isometric entities');
    expect(rejected[0].reason).toMatch(/Isometric/);
  });
});

// Built with the real fillet tool so the fixture is what a user's drawing holds.
function filletedPlate(radius = 10) {
  const rect = { id: 'r', type: 'rect', x: 0, y: 0, width: 200, height: 100, layerId: 'default' };
  const corner = findFilletableCorner([rect], { x: 0, y: 0 }, 5);
  return applyFillet([rect], corner, computeSketchFillet(corner, radius), 'default');
}

describe('line and arc loops (fillets)', () => {
  it('imports a plate with a filleted corner as one path profile with the exact fillet radius', () => {
    const entities = filletedPlate(10);
    const original = JSON.stringify(entities);
    expect(entities.map((e) => e.type).sort()).toEqual(['arc', 'line', 'line', 'line', 'line']);
    const { candidates, rejected } = collectDraftingProfiles(entities);
    expect(rejected).toEqual([]);
    expect(candidates).toHaveLength(1);
    const { profile, sourceIds } = candidates[0];
    expect(sourceIds.sort()).toEqual(['arc-1', 'line-1', 'line-2', 'line-3', 'line-4']);
    expect(profile.type).toBe('path');
    expect(profile.closed).toBe(true);
    expect(profile.segments.filter((s) => s.type === 'arc')).toHaveLength(1);
    expect(profile.segments.filter((s) => s.type === 'line')).toHaveLength(4);
    // The loop returns exactly to its start, so the kernel adds no closing edge.
    expect(profile.segments.at(-1).end).toEqual(profile.start);
    // start/mid/end all lie on the R10 circle centred at (10, 10): the true tangent fillet.
    const arcIndex = profile.segments.findIndex((s) => s.type === 'arc');
    const arc = profile.segments[arcIndex];
    const arcStart = arcIndex ? profile.segments[arcIndex - 1].end : profile.start;
    for (const p of [arcStart, arc.mid, arc.end]) expect(Math.hypot(p[0] - 10, p[1] - 10)).toBeCloseTo(10, 9);
    expect(JSON.stringify(entities)).toBe(original);
    // profileToPart re-derives the same profile from the candidate entity.
    expect(profileToPart(candidates[0].entity, { depth: 3 }).sketch.profile).toEqual(profile);
  });

  it('reverses arcs walked backwards without moving their midpoint', () => {
    const entities = filletedPlate(10).map((e) => (e.type === 'arc' ? { ...e, start: e.end, end: e.start } : e));
    const { candidates } = collectDraftingProfiles(entities);
    expect(candidates).toHaveLength(1);
    const arc = candidates[0].profile.segments.find((s) => s.type === 'arc');
    expect(Math.hypot(arc.mid[0] - 10, arc.mid[1] - 10)).toBeCloseTo(10, 9);
  });

  it('uses the drawn Bézier midpoint for hand-drawn arcs, and accepts a two-edge D shape', () => {
    const entities = [
      { id: 'chord', type: 'line', x1: 0, y1: 0, x2: 100, y2: 0 },
      { id: 'bow', type: 'arc', start: { x: 100, y: 0 }, end: { x: 0, y: 0 }, control: { x: 30, y: 80 } },
    ];
    const { candidates, rejected } = collectDraftingProfiles(entities);
    expect(rejected).toEqual([]);
    expect(candidates).toHaveLength(1);
    const arc = candidates[0].profile.segments.find((s) => s.type === 'arc');
    // B(0.5) = (start + 2·control + end) / 4
    expect(arc.mid).toEqual([40, 40]);
    expect(draftingArcMidpoint([100, 0], [30, 80], [0, 0])).toEqual([40, 40]);
  });

  it('reports open line/arc groups with their gap and rejects self-crossing outlines', () => {
    const entities = filletedPlate(10).filter((e) => e.id !== 'line-2');
    const { rejected } = collectDraftingProfiles(entities);
    expect(`${rejected[0].name}: ${rejected[0].reason}`).toBe(
      '4 connected lines/arcs: open loop — 100.00 mm gap between (200.00, 0.00) and (200.00, 100.00)',
    );
    const bowtie = [
      { id: 'a', type: 'line', x1: 0, y1: 0, x2: 100, y2: 100 },
      { id: 'b', type: 'arc', start: { x: 100, y: 100 }, end: { x: 100, y: 0 }, control: { x: 140, y: 50 } },
      { id: 'c', type: 'line', x1: 100, y1: 0, x2: 0, y2: 100 },
      { id: 'd', type: 'line', x1: 0, y1: 100, x2: 0, y2: 0 },
    ];
    expect(collectDraftingProfiles(bowtie).rejected[0].reason).toMatch(/cross or touch/);
  });

  it('treats an identical arc as a duplicate but keeps a different arc between the same points', () => {
    const plate = filletedPlate(10);
    const arc = plate.find((e) => e.type === 'arc');
    const { candidates, skipped } = collectDraftingProfiles([...plate, { ...arc, id: 'arc-copy' }]);
    expect(candidates).toHaveLength(1);
    expect(summarizeSkipped(skipped)).toEqual(['1 duplicate arc ignored (arc-copy duplicates arc-1)']);
    const lens = [
      { id: 'u', type: 'arc', start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, control: { x: 50, y: 40 } },
      { id: 'v', type: 'arc', start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, control: { x: 50, y: -40 } },
    ];
    const lensResult = collectDraftingProfiles(lens);
    expect(lensResult.candidates).toHaveLength(1);
    expect(lensResult.candidates[0].profile.segments.map((s) => s.type)).toEqual(['arc', 'arc']);
  });
});

describe('direct instance movement', () => {
  it('preserves parameter formulas and independent instances through undo/redo', () => {
    const model = {
      ...emptyModel(),
      parameters: [{ id: 'w', name: 'width', value: 200 }],
      instances: [
        { id: 'a', partId: 'p', position: ['=width/2', 10, 0] },
        { id: 'b', partId: 'p', position: [0, 0, 0] },
      ],
    };
    const moved = translateInstance(model, 'a', [25, -30, 0]);
    expect(moved.instances[1]).toBe(model.instances[1]);
    expect(moved.instances[0].position.slice(1)).toEqual([-20, 0]);
    expect(numeric(moved.instances[0].position[0], resolveParameters(model.parameters))).toBe(125);
    expect(numeric(moved.instances[0].position[0], { width: 400 })).toBe(225);
    const before = sketchStudioReducer(initialState, { type: 'SET_CAD_MODEL', payload: model });
    const after = sketchStudioReducer(before, { type: 'SET_CAD_MODEL', payload: moved });
    const undone = sketchStudioReducer(after, { type: 'UNDO' });
    expect(undone.document.model).toEqual(model);
    expect(sketchStudioReducer(undone, { type: 'REDO' }).document.model).toEqual(moved);
  });
  it('blocks constrained instances but allows weld notes and parent movement', () => {
    const model = {
      ...emptyModel(),
      instances: [{ id: 'parent' }, { id: 'child' }],
      connections: [
        { type: 'fixed', from: 'child', to: 'parent' },
        { type: 'weld', from: 'parent', to: 'child' },
      ],
    };
    expect(() => translateInstance(model, 'child', [1, 0, 0])).toThrow(/attached/);
    expect(translateInstance(model, 'parent', [1, 0, 0]).instances[0].position).toEqual([1, 0, 0]);
    expect(() => translateInstance(model, 'parent', [NaN, 0, 0])).toThrow(/finite/);
  });
});
