// The brake checks the sheet's thickness (docs/sketch-studio-corner-gaps.md §5,
// CG-3): the end of every stroke tested at the true thickness (thicknessHit,
// cornerGaps.js foldOverlaps), so a flange can no longer end up to t/2 inside
// another while the card says clear. The §3.4 L corner (its rear wall's end
// 0.3 past the right wall's inside face), the user's tray as saved and set to
// 0.2, a hem, a round bend mid-sequence, the shop's examples, the cost.
import { describe, expect, it } from 'vitest';
import { foldOverlaps, setGaps } from './cornerGaps.js';
import { USER_TRAY_FEATURE, USER_TRAY_PROFILE, lCorner } from './cornerGaps.fixtures.js';
import { foldSheet, hitSequence, poseFold, stepPose } from './sheetMetal.js';
import { brakeSessionDefaults, brakeStation, sequenceChecks, sequenceTries, thicknessHit } from './brakeStation.js';
import { emptyModel } from './model.js';
import { machineOf } from './shopCatalog.js';
import { sheetMetalControlBox, sheetMetalKiosk } from './shopExamples.js';

const MACHINE = machineOf('brake-50-2000');
const verdict = (c) =>
  c.collision ? (c.collision.thickness ? 'thickness' : c.collision.tool) : c.refusals.length ? 'refused' : 'ok';
const rows = (fold, profile = null, extra = {}) =>
  sequenceChecks({ fold, machine: MACHINE, profile, ...extra }).map(verdict);
const L_MESSAGE =
  "Bend 2: bend 1's flange ends 0.30 mm inside bend 2's flange (the sheet is 1.2 mm thick). Give that gap 0 mm or more in the part's Sheet metal panel.";

// The L corner at the station: the rear wall made, the right wall's line picked by its two points.
const modelOf = ({ feature, profile }, made) => {
  const model = emptyModel();
  model.sketches = [{ id: feature.sketchId, name: 'S', plane: 'XY', profile, primitives: [], constrained: false }];
  model.parts = [{ id: 'p', name: 'L', features: [{ ...feature, bends: made }] }];
  model.instances = [{ id: 'i', partId: 'p', name: '', position: [0, 0, 0], rotation: [0, 0, 0], visible: true }];
  return model;
};
const pickSession = (line) => ({
  ...brakeSessionDefaults(),
  stage: 'setup',
  key: 'k',
  instanceId: 'i',
  mode: 'points',
  points: [line.a, line.b],
  angle: 90,
  punch: 'a102',
  die: 'v8-88',
});

describe('the L corner with its rear end 0.3 mm inside the right wall (§5.1)', () => {
  const L = lCorner({ gap: -0.3 });
  const fold = foldSheet(L.feature, L.profile, {});

  it('the mid-surface alone says clear: the overlap is under t/2 (the premise, §1.2 item 5)', () => {
    expect(rows(fold, null, { thickness: false })).toEqual(['ok', 'ok']);
  });

  it("refuses the second stroke at its end, in the spec's words, with the depth from the facing row", () => {
    const checks = sequenceChecks({ fold, machine: MACHINE, profile: L.profile });
    expect(checks.map(verdict)).toEqual(['ok', 'thickness']);
    const hit = checks[1].collision;
    expect(hit).toMatchObject({ tool: 'part', thickness: true, phase: 'end', angle: 90, bends: [1, 2] });
    expect(hit.depth).toBeCloseTo(0.3, 6);
    expect(hit.message).toBe(L_MESSAGE);
    // The two pieces: the rear wall's (whose end runs in) first.
    const bendOf = (id) => fold.pieces.find((p) => p.id === id).path.at(-1);
    expect(hit.pieces.map(bendOf)).toEqual(['bend-rear', 'bend-right']);
    // Without the profile (the blank as polygons) the same depth and words.
    expect(sequenceChecks({ fold, machine: MACHINE })[1].collision.message).toBe(L_MESSAGE);
  });

  it('the other order names it from the other side: the flange made now ends inside the one made before', () => {
    const swapped = { ...L.feature, bends: [L.feature.bends[1], L.feature.bends[0]] };
    const checks = sequenceChecks({ fold: foldSheet(swapped, L.profile, {}), machine: MACHINE, profile: L.profile });
    expect(checks.map(verdict)).toEqual(['ok', 'thickness']);
    expect(checks[1].collision.message).toBe(
      "Bend 2: the flange ends 0.30 mm inside bend 1's flange (the sheet is 1.2 mm thick). Give that gap 0 mm or more in the part's Sheet metal panel.",
    );
  });

  it('is clear at 0.0 and +0.2 (a flange lying on the face is no overlap), and at 0.004 into it (the skin)', () => {
    for (const gap of [0, 0.2, -0.004]) {
      const fixture = lCorner({ gap });
      expect(rows(foldSheet(fixture.feature, fixture.profile, {}), fixture.profile), `gap ${gap}`).toEqual([
        'ok',
        'ok',
      ]);
    }
    const deeper = lCorner({ gap: -0.006 });
    expect(rows(foldSheet(deeper.feature, deeper.profile, {}), deeper.profile)).toEqual(['ok', 'thickness']);
  });

  it('the pending hit: Bend refused with the card, no try offered, the two pieces marked in the view', () => {
    const [rear, right] = L.feature.bends;
    const model = modelOf(L, [rear]);
    for (const advise of [false, true]) {
      const { pending, view } = brakeStation({ model, session: pickSession(right), advise });
      expect(pending.refusals).toEqual([]);
      expect(pending.collision.hit).toMatchObject({ tool: 'part', thickness: true, angle: 90 });
      expect(pending.collision.hit.message).toBe(L_MESSAGE);
      // Nothing another order, angle, punch, turn or length could cure.
      expect(pending.collision.turnedClears).toBe(false);
      for (const key of ['fix', 'turn', 'horn', 'length', 'ways']) expect(pending.collision[key], key).toBeUndefined();
      expect(pending.collision.hit.message).not.toMatch(/earlier|tried|Turn|punch/i);
      // The view poses the stroke's end and showHit gets both pieces' sheet faces (machine frame).
      expect(view.angles).toEqual({ 'pending-hit': 90 });
      expect(view.collision.tool).toBe('part');
      expect(view.collision.triangles.length).toBeGreaterThanOrEqual(8);
      for (const tri of view.collision.triangles) for (const p of tri) expect(p.every(Number.isFinite)).toBe(true);
    }
    // A candidate search leaves it out (thickness: false), as every try does.
    expect(brakeStation({ model, session: pickSession(right), thickness: false }).pending.collision.hit).toBeNull();
    // Drawn on the face (gap 0) the same hit goes.
    const fit = lCorner({ gap: 0 });
    expect(
      brakeStation({ model: modelOf(fit, [fit.feature.bends[0]]), session: pickSession(right) }).pending.collision.hit,
    ).toBeNull();
  });

  it('a stored step refused for it gets no reorder or punch try (sequenceTries)', () => {
    expect(sequenceTries({ feature: L.feature, profile: L.profile, machine: MACHINE })).toEqual({});
  });

  it('foldOverlaps: the pair only with a moved piece in it; none at the start of the stroke', () => {
    const steps = hitSequence(fold);
    const end = stepPose(fold, 1, { after: true });
    const posed = poseFold(end.fold, end.angles);
    expect(foldOverlaps(posed)).toHaveLength(1);
    const right = posed.pieces.filter((p) => p.path.includes(steps[1].bendIds[0])).map((p) => p.id);
    expect(foldOverlaps(posed, { moved: right })).toHaveLength(1);
    expect(foldOverlaps(posed, { moved: [] })).toEqual([]);
    expect(foldOverlaps(poseFold(fold, { [steps[1].bendIds[0]]: 0 }))).toEqual([]);
  });
});

describe("the user's tray (§5.1)", () => {
  const fold = foldSheet(USER_TRAY_FEATURE, USER_TRAY_PROFILE, {});
  it('as saved: all eight strokes clear at thickness', () => {
    expect(rows(fold, USER_TRAY_PROFILE)).toEqual(Array(8).fill('ok'));
  });
  it('set to 0.2 (Set all): all eight strokes clear at thickness', () => {
    const set = setGaps({ feature: USER_TRAY_FEATURE, profile: USER_TRAY_PROFILE, target: 0.2 });
    const after = foldSheet({ ...USER_TRAY_FEATURE, bends: set.bends }, set.profile, {});
    expect(rows(after, set.profile)).toEqual(Array(8).fill('ok'));
  });
  it('adds under 3 ms to a clear stroke (the end of each of the eight steps)', () => {
    const times = hitSequence(fold).map((stroke, index) => {
      const pose = stepPose(fold, index);
      const later = Object.fromEntries(Object.entries(pose.angles).filter(([id]) => !stroke.bendIds.includes(id)));
      const options = { fold: pose.fold, bendIds: stroke.bendIds, angles: later, machine: MACHINE, die: stroke.die };
      expect(thicknessHit(options)).toBeNull();
      const runs = [];
      for (let i = 0; i < 15; i++) {
        const start = performance.now();
        thicknessHit(options);
        runs.push(performance.now() - start);
      }
      return runs.sort((p, q) => p - q)[7];
    });
    console.warn(`thicknessHit, user's tray, per step: ${times.map((t) => t.toFixed(2)).join(' / ')} ms`);
    for (const t of times) expect(t).toBeLessThan(3);
  });
});

describe('no false refusals (§5 care point 3)', () => {
  const sheet = (bends, profile) =>
    foldSheet(
      {
        id: 'f',
        type: 'sheetmetal',
        sketchId: 's',
        thickness: 1.2,
        stock: 'spcc',
        kFactor: null,
        base: null,
        marks: [],
        bends,
      },
      profile,
      {},
    );
  const rect = (w, h) => ({ type: 'rectangle', origin: [0, 0], width: w, height: h });
  const line = (id, a, b, extra = {}) => ({
    id,
    a,
    b,
    angle: 90,
    direction: 'up',
    radius: null,
    punch: 'a102',
    die: 'v8-88',
    ...extra,
  });

  it('a 180° hem: its flange lies on the base it is joined to (no pair)', () => {
    const fold = sheet([line('hem', [-1, 80], [101, 80], { angle: 180 })], rect(100, 100));
    const [stroke] = hitSequence(fold);
    expect(thicknessHit({ fold, bendIds: stroke.bendIds, machine: MACHINE, die: stroke.die })).toBeNull();
  });

  it('a round (bump) bend made mid-sequence, then sharp bends either side of it', () => {
    const fold = sheet(
      [
        line('sharp-1', [40, -1], [40, 201]),
        line('round', [150, -1], [150, 201], { radius: 20, steps: 4 }),
        line('sharp-2', [260, -1], [260, 201]),
      ],
      rect(300, 200),
    );
    expect(rows(fold, rect(300, 200)).filter((v) => v === 'thickness')).toEqual([]);
    expect(rows(fold, rect(300, 200))).toEqual(rows(fold, null, { thickness: false }));
  });

  it('the control box (closed corners at its 0.1 fit-up gap, the side ends covering flush) and its lid', () => {
    const model = sheetMetalControlBox();
    for (const id of ['shop-box-body', 'shop-box-lid']) {
      const feature = model.parts.find((p) => p.id === id).features[0];
      const profile = model.sketches.find((s) => s.id === feature.sketchId).profile;
      const fold = foldSheet(feature, profile, {});
      expect(rows(fold, profile), id).toEqual(rows(fold, null, { thickness: false }));
      expect(rows(fold, profile), id).not.toContain('thickness');
    }
  });

  it("every kiosk part (the face frame's closed corners, the round-cornered pieces) bends as before", () => {
    const model = sheetMetalKiosk();
    let steps = 0;
    for (const part of model.parts) {
      const feature = part.features.find((f) => f.type === 'sheetmetal');
      if (!feature) continue;
      const profile = model.sketches.find((s) => s.id === feature.sketchId).profile;
      const fold = foldSheet(feature, profile, {});
      const now = rows(fold, profile);
      expect(now, part.name).toEqual(rows(fold, null, { thickness: false }));
      expect(now, part.name).not.toContain('thickness');
      steps += now.length;
    }
    expect(steps).toBeGreaterThan(10);
  }, 30000);
});
