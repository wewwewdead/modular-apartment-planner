// Setting flange gaps (docs/sketch-studio-corner-gaps.md §4.2, §4.4 items 2 –
// 5) on the user's tray: "Set all" to 0.2 and to 0, one row, a wall running
// past its neighbour (covering) and back, a mitre by one lip or both, the
// crossing refusal with its relief hint; every bend kept on the metal it
// bends (a stored line clipped only where it picked up new metal), the
// refusals in shop words with nothing changed.
import { describe, expect, it } from 'vitest';
import { cornerRows, flangeGaps, gapLabel, gapMoves, gapText, setGaps, setGapsText } from './cornerGaps.js';
import { USER_TRAY_FEATURE, USER_TRAY_PROFILE, lCorner } from './cornerGaps.fixtures.js';
import { foldSheet, lineSegments, profilePolygon } from './sheetMetal.js';
import { sequenceChecks } from './brakeStation.js';
import { machineOf } from './shopCatalog.js';
import { pieceClearances } from './panelMaker.js';
import { strokeTooling } from './pressBrake.js';

const F = USER_TRAY_FEATURE,
  P = USER_TRAY_PROFILE;
const read = (feature, profile) => flangeGaps(foldSheet(feature, profile, {}), profile, {});
const before = read(F, P);
const row = (rows, label, n = 0) => rows.filter((r) => gapLabel(r) === label)[n];
// The top-right corner: the rear wall (bend 8) and the right wall (bend 5), the rear and right lips' mitre.
const REAR = 'Bend 8 flange, end → bend 5 flange, inside face';
const RIGHT = 'Bend 5 flange, end → bend 8 flange, inside face';
const MITRE = 'Bend 1 flange ↔ bend 3 flange, edge to edge';
const rearKey = row(before.rows, REAR).key,
  rightKey = row(before.rows, RIGHT).key,
  mitreKey = row(before.rows, MITRE).key;
const ring = (profile) => [profile.start, ...profile.segments.slice(0, -1).map((s) => s.end)];
const shortest = (profile) => {
  const r = ring(profile);
  return Math.min(...r.map((p, i) => Math.hypot(r[(i + 1) % r.length][0] - p[0], r[(i + 1) % r.length][1] - p[1])));
};
const sequenceClear = (fold) =>
  sequenceChecks({ fold, machine: machineOf('brake-50-2000') }).every((c) => !c.refusals.length && !c.collision);

describe("Set all on the user's tray (§4.4 item 2)", () => {
  const result = setGaps({ feature: F, profile: P, target: 0.2 });
  it('brings every row to 0.200 in one or two passes, sixteen edges moved', () => {
    expect(result.passes).toBeGreaterThanOrEqual(1);
    expect(result.passes).toBeLessThanOrEqual(2);
    expect(result.asked).toHaveLength(12);
    expect(result.rows).toHaveLength(12);
    for (const r of result.rows) expect(Math.abs(r.gap - 0.2)).toBeLessThan(0.001);
    expect(result.residual).toBeLessThan(0.001);
    expect(result.moved).toHaveLength(16);
    expect(Math.max(...result.moved.map((m) => m.distance))).toBeCloseTo(1.0188, 3);
    expect(setGapsText(result, 0.2)).toEqual({
      text: 'Set 12 gaps to 0.20 mm: 16 edges moved, the most 1.02 mm. Undo takes it back.',
      warnings: 'Bends 3 and 4: the outline now crosses the bend zone at an angle.',
    });
  });

  it("puts the blank's top-right corner where §1.4's probe put it", () => {
    const expected = [
      [321.8347, 67.9947],
      [306.7813, 83.0481],
      [287.0007, 83.0481],
      [286.9706, 81.0294],
      [284.9706, 81.0294],
      [284.9706, 83.0294],
      [286.5042, 83.0294],
      [286.5042, 103.3104],
      [271.9359, 117.8787],
    ];
    const corner = ring(result.profile).filter(([x, y]) => x > 265 && y > 60);
    expect(corner).toHaveLength(expected.length);
    for (const p of expected) expect(corner.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.001)).toBe(true);
    // Every other corner of the tray is moved alike; the outline keeps its type and its start.
    expect(result.profile.type).toBe('path');
    expect(result.profile.segments).toHaveLength(P.segments.length);
    // The start corner is the left rear mitre's: it slid along the top edge, as every mitre's end does.
    expect(result.profile.start[1]).toBe(P.start[1]);
    expect(result.profile.start[0]).toBeCloseTo(P.start[0] - 0.7982, 3);
  });

  it('folds, warns outline-not-square on bends 3 and 4 only, passes the brake and the clearance check', () => {
    expect(result.newWarnings.map((w) => [w.code, w.bendId])).toEqual([
      ['outline-not-square', F.bends[2].id],
      ['outline-not-square', F.bends[3].id],
    ]);
    expect(sequenceClear(result.fold)).toBe(true);
    const least = Math.min(...pieceClearances(result.fold).map((c) => c.distance));
    expect(Math.abs(least - 0.2)).toBeLessThan(0.005);
    // No line picked up new metal: bends 1 – 6 are the stored records; 7 and 8 (a punch set to its
    // length) keep that length, their trims taking half the longer run each (see below).
    result.bends.slice(0, 6).forEach((b, i) => expect(b).toBe(F.bends[i]));
    for (const i of [6, 7]) expect(result.bends[i]).toEqual({ ...F.bends[i], punchTrim: expect.any(Number) });
    // Nothing given was changed.
    expect(read(F, P).rows.map((r) => r.gap)).toEqual(before.rows.map((r) => r.gap));
  });
});

describe('one row, target 0, a mitre by one lip (§4.4 items 3, 4, 4b)', () => {
  it('sets one wall row and leaves every other gap as it was; its partner now passes closer beside', () => {
    const result = setGaps({ feature: F, profile: P, target: 0.2, keys: [rearKey] });
    expect(result.moved).toHaveLength(1);
    expect(row(result.rows, REAR).gap).toBeCloseTo(0.2, 3);
    for (const r of before.rows) {
      if (r.key === rearKey) continue;
      expect(Math.abs(result.rows.find((x) => x.key === r.key).gap - r.gap)).toBeLessThan(1e-6);
    }
    // The right wall's end sharing the corner: its gap stands, the rear wall's end now 0.2 beside it.
    expect(row(result.rows, RIGHT).beside).toBeCloseTo(0.2, 3);
    expect(setGapsText(result, 0.2).text).toBe('Set 1 gap to 0.20 mm: 1 edge moved 0.53 mm. Undo takes it back.');
  });

  it('closes every corner to 0.000 with no overlap', () => {
    const result = setGaps({ feature: F, profile: P, target: 0 });
    for (const r of result.rows) expect(Math.abs(r.gap)).toBeLessThan(0.001);
    const after = flangeGaps(result.fold, result.profile, {});
    expect(after.overlaps).toEqual([]);
    expect(after.rows.some((r) => r.overlap)).toBe(false);
    expect(after.least).toBeCloseTo(0, 3);
  });

  it("moves only that lip's edge with 'a', both edges equally with 'both'", () => {
    const mitre = row(before.rows, MITRE);
    const one = setGaps({ feature: F, profile: P, target: 0.2, keys: [mitreKey], styles: { [mitreKey]: 'a' } });
    expect(one.moved.map((m) => m.origin)).toEqual([mitre.a.segment]);
    expect(one.moved[0].distance).toBeCloseTo(1.152, 3);
    expect(row(one.rows, MITRE).gap).toBeCloseTo(0.2, 3);
    const other = setGaps({ feature: F, profile: P, target: 0.2, keys: [mitreKey], styles: { [mitreKey]: 'b' } });
    expect(other.moved.map((m) => m.origin)).toEqual([mitre.b.segment]);
    const both = setGaps({ feature: F, profile: P, target: 0.2, keys: [mitreKey] });
    expect(both.moved.map((m) => m.origin)).toEqual([mitre.a.segment, mitre.b.segment]);
    expect(both.moved[0].distance).toBeCloseTo(both.moved[1].distance, 9);
    expect(both.moved[0].distance).toBeCloseTo(0.576, 3);
    expect(row(both.rows, MITRE).gap).toBeCloseTo(0.2, 3);
  });
});

describe('a wall running past its neighbour (§4.4 item 4a)', () => {
  const cover = setGaps({
    feature: F,
    profile: P,
    target: 0.2,
    keys: [rearKey, rightKey],
    styles: { [rearKey]: 'cover' },
  });
  it("stands the rear wall's end flush with the right wall's outside face, the right wall at 0.200 against it", () => {
    const rear = cover.rows.find((r) => r.key === rearKey);
    expect(rear.cover).toBe(true);
    expect(Math.abs(rear.flush)).toBeLessThan(0.001);
    expect(gapText(rear)).toBe('runs past its end: flush with its outside face');
    const right = cover.rows.find((r) => r.key === rightKey);
    expect(right.gap).toBeCloseTo(0.2, 3);
    expect(right.beside).toBe(0);
    const after = flangeGaps(cover.fold, cover.profile, {});
    expect(after.overlaps).toEqual([]);
    expect(sequenceClear(cover.fold)).toBe(true);
    expect(setGapsText(cover, 0.2).text).toBe(
      'Set 1 gap to 0.20 mm and 1 covering end flush: 2 edges moved, the most 1.93 mm. Undo takes it back.',
    );
  });

  it("lays the ear on the rear wall's own stretch, square jogs on its bend zones' edges", () => {
    const ear = ring(cover.profile).filter(([x, y]) => x > 285 && x < 289 && y > 84 && y < 102);
    const fold = foldSheet(F, P, {});
    const h = fold.bends[7].allowance / 2;
    expect(ear.map((p) => p[1]).sort((a, b) => a - b)).toEqual([
      expect.closeTo(83.378679 + h, 5),
      expect.closeTo(83.378679 + h, 5),
      expect.closeTo(102.878679 - h, 5),
      expect.closeTo(102.878679 - h, 5),
    ]);
    // The other corner's rows: the ear's end against the right lip is no corner row ("Set all" leaves it).
    const lip = row(cover.rows, 'Bend 8 flange, end → bend 3 flange, inside face');
    expect(lip).toBeTruthy();
    expect(cornerRows(cover.rows).some((r) => r.key === lip.key)).toBe(false);
  });

  it('keeps bend 5 on the metal it bends: its line clipped to the tabs it had, every other record as stored', () => {
    const clipped = cover.bends[4];
    expect(clipped).not.toBe(F.bends[4]);
    expect(clipped).toEqual({ ...F.bends[4], a: [286.834742, -446.16916], b: [286.834742, 80.529437] });
    cover.bends.forEach((b, i) => i === 4 || expect(b).toBe(F.bends[i]));
    // The clipped line takes exactly the intervals the stored one took before the ear (strokeBends' 0.5 inside).
    const was = lineSegments(profilePolygon(P), F.bends[4]);
    const now = lineSegments(profilePolygon(cover.profile), clipped);
    expect(now).toHaveLength(was.length);
    expect(now[0].a[1]).toBeCloseTo(was[0].a[1], 6);
    expect(now.at(-1).b[1]).toBeCloseTo(was.at(-1).b[1], 6);
    // With the stored line the ear would be bent by bend 5 too: the fold refuses it.
    expect(() => foldSheet(F, cover.profile, {})).toThrow('Bend 5 crosses bend 1.');
  });

  it('leaves a bend-on record and the other records of a stroke exactly as they were', () => {
    const stroke = 'stroke-walls';
    const feature = {
      ...F,
      bends: [
        ...F.bends.map((b, i) => (i === 4 || i === 5 ? { ...b, stroke } : b)),
        { id: 'again-5', again: F.bends[4].id, angle: 92, punch: 'a102', die: 'v8-88' },
      ],
    };
    const result = setGaps({ feature, profile: P, target: 0.2, keys: [rearKey], styles: { [rearKey]: 'cover' } });
    expect(result.bends[4]).toEqual({ ...feature.bends[4], a: [286.834742, -446.16916], b: [286.834742, 80.529437] });
    expect(result.bends[4].stroke).toBe(stroke);
    result.bends.forEach((b, i) => i === 4 || expect(b).toBe(feature.bends[i]));
  });

  it('goes back to "Stops short": 0.200 again, found by its key, no edge shorter than 0.01', () => {
    const back = setGaps({
      feature: { ...F, bends: cover.bends },
      profile: cover.profile,
      target: 0.2,
      keys: [rearKey],
      styles: { [rearKey]: 'short' },
    });
    const rear = back.rows.find((r) => r.key === rearKey);
    expect(rear.cover).toBe(false);
    expect(rear.gap).toBeCloseTo(0.2, 3);
    expect(back.moved).toHaveLength(1);
    expect(back.moved[0].distance).toBeCloseTo(-1.4, 3);
    expect(shortest(back.profile)).toBeGreaterThan(0.01);
    expect(sequenceClear(back.fold)).toBe(true);
  });

  it('refuses both walls of one corner covering, before anything is changed', () => {
    const given = JSON.stringify({ F, P });
    const both = { [rearKey]: 'cover', [rightKey]: 'cover' };
    expect(() => setGaps({ feature: F, profile: P, target: 0.2, keys: [rearKey, rightKey], styles: both })).toThrow(
      'Both flanges cannot cover the same corner: let one of them stop short.',
    );
    // The partner covering already, asked alone: refused as well.
    const rightAlone = { feature: { ...F, bends: cover.bends }, profile: cover.profile, target: 0.2, keys: [rightKey] };
    expect(() => setGaps({ ...rightAlone, styles: { [rightKey]: 'cover' } })).toThrow(
      'Both flanges cannot cover the same corner',
    );
    expect(JSON.stringify({ F, P })).toBe(given);
  });
});

describe('the crossing refusal and its relief hint (§4.4 item 5)', () => {
  // The notch's side (where the right wall starts) moved to x first; the line of bend 5 is at 286.835.
  const notch = (x) => ({
    ...P,
    segments: P.segments.map((s, i) => (i === 5 || i === 6 ? { ...s, end: [x, s.end[1]] } : s)),
  });
  it('sets the gaps with the side at 286.84 and refuses at 286.83 with how far the relief must reach', () => {
    expect(setGaps({ feature: F, profile: notch(286.84), target: 0.2 }).residual).toBeLessThan(0.001);
    expect(() => setGaps({ feature: F, profile: notch(286.83), target: 0.2 })).toThrow(
      'These gaps cannot be set: Bend 8 crosses bend 5: their bend zones would share metal at the corner. The relief must reach 1.41 mm (half the bend zone) past each bend line: cut it wider, or ask for a wider gap.',
    );
  });
});

describe('the punch keeps its length (§4.5, after the first audit)', () => {
  // Bends 7 and 8 carry the user's punch set to 367.70 mm (punchTrim 5.999 / 5.991, horns 30).
  const punch = (feature, profile, i) => {
    const runs = strokeTooling(foldSheet(feature, profile, {}), [feature.bends[i].id]).punch;
    expect(runs).toHaveLength(1);
    return runs[0][1] - runs[0][0];
  };
  const steps = (feature, profile) =>
    sequenceChecks({ fold: foldSheet(feature, profile, {}), machine: machineOf('brake-50-2000') }).map((c) =>
      c.collision ? c.collision.message : c.refusals[0]?.message || 'ok',
    );
  for (const i of [6, 7]) expect(punch(F, P, i)).toBeCloseTo(367.7, 4);

  it('holds 367.70 mm at gaps 0, 0.01 and 0.2; the trims take the change, every other record as stored', () => {
    for (const target of [0, 0.01, 0.2]) {
      const result = setGaps({ feature: F, profile: P, target });
      const feature = { ...F, bends: result.bends };
      for (const i of [6, 7]) {
        expect(Math.abs(punch(feature, result.profile, i) - 367.7)).toBeLessThan(1e-4);
        expect(result.bends[i].punchTrim).toBeGreaterThan(F.bends[i].punchTrim);
        expect(result.bends[i].horns).toBe(30);
      }
      result.bends.slice(0, 6).forEach((b, i) => expect(b).toBe(F.bends[i]));
    }
    // At 0.2: half of the 1.0375 mm longer run each end.
    const set = setGaps({ feature: F, profile: P, target: 0.2 });
    expect(set.bends[6].punchTrim).toBeCloseTo(6.517073, 6);
  });

  it('passes all eight steps at 0.2 and 0.02; at 0 and 0.01 the front and rear lips hit the punch, whatever its length', () => {
    for (const target of [0.2, 0.02]) {
      const result = setGaps({ feature: F, profile: P, target });
      expect(steps({ ...F, bends: result.bends }, result.profile)).toEqual(Array(8).fill('ok'));
    }
    const hit = (n) =>
      `Bend ${n}: the part hits the punch at 32.5°. Bend this one earlier (before the flange in the way), or use the gooseneck punch.`;
    for (const target of [0, 0.01]) {
      const result = setGaps({ feature: F, profile: P, target });
      expect(steps({ ...F, bends: result.bends }, result.profile)).toEqual([...Array(6).fill('ok'), hit(7), hit(8)]);
      // Not the punch's length: with the trims as stored (the punch 1.4 mm longer) or 2 mm shorter, the same.
      for (const shift of [null, 1]) {
        const bends = result.bends.map((b, i) =>
          i < 6 ? b : { ...b, punchTrim: shift == null ? F.bends[i].punchTrim : b.punchTrim + shift },
        );
        expect(steps({ ...F, bends }, result.profile).slice(6)).toEqual([hit(7), hit(8)]);
      }
    }
  });

  it("moves a bend-on record's own trims by the same rule, and leaves a trim that is an expression", () => {
    const again = {
      id: 'again-8',
      again: F.bends[7].id,
      angle: 92,
      punch: 'a102',
      die: 'v8-88',
      punchTrim: 4,
      dieTrim: 3,
    };
    const result = setGaps({ feature: { ...F, bends: [...F.bends, again] }, profile: P, target: 0.2 });
    const change = result.bends[7].punchTrim - F.bends[7].punchTrim;
    expect(result.bends[8]).toEqual({
      ...again,
      punchTrim: expect.closeTo(4 + change, 6),
      dieTrim: expect.closeTo(3 + change, 6),
    });
    const driven = { ...F, bends: F.bends.map((b, i) => (i === 6 ? { ...b, punchTrim: '=trim' } : b)) };
    const kept = setGaps({ feature: driven, profile: P, params: { trim: 5.999242 }, target: 0.2 });
    expect(kept.bends[6]).toBe(driven.bends[6]);
    expect(kept.bends[7]).not.toBe(driven.bends[7]);
  });
});

describe('gapMoves, cornerRows and the refusals', () => {
  it('takes the smallest move for an edge two rows ask for, and nothing from a row at its target', () => {
    const a = {
      key: 'x',
      a: { segment: { loop: 0, index: 3 }, flat: [] },
      b: { kind: 'face' },
      gap: 0.9,
      beside: 0,
      k: 1,
    };
    const b = { ...a, key: 'y', gap: 0.5 };
    const c = { ...a, key: 'z', a: { segment: { loop: 0, index: 4 }, flat: [] }, gap: 0.2003 };
    expect(gapMoves([a, b, c], 0.2)).toEqual([
      { segment: { loop: 0, index: 3 }, distance: expect.closeTo(0.3, 9), keys: ['x', 'y'] },
    ]);
    expect(gapMoves([a, b, c], 0.2, { keys: ['x'] })).toEqual([
      { segment: { loop: 0, index: 3 }, distance: expect.closeTo(0.7, 9), keys: ['x'] },
    ]);
    expect(() => gapMoves([a], 0.2, { styles: { x: 'cover' } })).toThrow('A covering end needs the sheet thickness.');
    expect(() => gapMoves([a], 0.2, { styles: { x: 'sideways' } })).toThrow(
      'A wall\'s gap stops short or runs past: not "sideways".',
    );
  });

  it('takes every row of the tray as a corner row', () => {
    expect(cornerRows(before.rows)).toHaveLength(12);
  });

  it('refuses in shop words and changes nothing', () => {
    expect(() => setGaps({ feature: F, profile: P, target: -0.1 })).toThrow(
      'Flanges cannot overlap: give 0 mm or more.',
    );
    expect(() => setGaps({ feature: F, profile: P, target: 3.5 })).toThrow(
      'Gaps are read up to 3 mm: give 3 mm or less.',
    );
    expect(() => setGaps({ feature: F, profile: P, target: NaN })).toThrow('Type the gap in mm.');
    const driven = { ...P, start: ['=x', P.start[1]] };
    expect(() => setGaps({ feature: F, profile: driven, params: { x: P.start[0] }, target: 0.2 })).toThrow(
      'This outline is driven by parameters: change the parameter instead.',
    );
    expect(() => setGaps({ feature: F, profile: P, target: 0.2, keys: ['no-such-row'] })).toThrow(
      'That gap is no longer on the part: read the gaps again.',
    );
    // A part with one flange has no corner to set.
    const { feature, profile } = lCorner({ gap: 0.5 });
    const single = { ...feature, bends: feature.bends.slice(0, 1) };
    expect(() => setGaps({ feature: single, profile, target: 0.2 })).toThrow('This part has no corner gaps to set.');
  });

  it('says so when the gaps are already as asked', () => {
    const done = setGaps({ feature: F, profile: P, target: 0.2 });
    const again = setGaps({ feature: F, profile: done.profile, target: 0.2 });
    expect(again.passes).toBe(0);
    expect(again.profile).toBe(done.profile);
    expect(setGapsText(again, 0.2)).toEqual({ text: 'These gaps are already as asked: nothing moved.', warnings: '' });
  });

  it("sets the L corner of the CG-1 fixture: the ear's end only, not the relief's sides behind it", () => {
    const { feature, profile } = lCorner({ gap: 0.5 });
    const rows = read(feature, profile).rows;
    // Three rows: the rear wall's ear end (0.50), its relief side behind it and the relief's top (2.87).
    expect(rows.map((r) => r.gap.toFixed(2)).sort()).toEqual(['0.50', '2.87', '2.87']);
    expect(cornerRows(rows).map((r) => r.gap.toFixed(2))).toEqual(['0.50']);
    const result = setGaps({ feature, profile, target: 0.2 });
    expect(result.asked).toHaveLength(1);
    expect(result.moved).toHaveLength(1);
    expect(result.rows.filter((r) => result.asked.includes(r.key)).every((r) => Math.abs(r.gap - 0.2) < 0.001)).toBe(
      true,
    );
    result.bends.forEach((b, i) => expect(b).toBe(feature.bends[i]));
  });
});
