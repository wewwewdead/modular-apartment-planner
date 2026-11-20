// The press brake's blades (docs/sketch-studio-brake-flip-tooling.md §4, BT-1):
// the gooseneck drawn from its catalogue row (a plain 90° bend clears it
// either way round, its throat takes a standing return flange the straight
// punch cannot), Reverse punch (the section mirrored), the return sweep only
// as far as the ram goes back up, the collision advice's punch offered as a
// fix only when the hit really clears with it, and the picker's cards.
import { describe, expect, it } from 'vitest';
import { foldSheet } from './sheetMetal.js';
import { brakeCollisions, toolingSections } from './brakeCollisions.js';
import { bladeOptions, brakeSessionDefaults, brakeStation, punchChoice, punchReversed } from './brakeStation.js';
import { emptyModel } from './model.js';
import { DIES, PUNCHES, dieOf, machineOf, punchOf, punchSection, punchSymmetric } from './shopCatalog.js';

const rect = (width, height) => ({ type: 'rectangle', width, height, origin: [0, 0] });
const sheet = (bends) => ({
  id: 'sm',
  type: 'sheetmetal',
  sketchId: 's',
  thickness: 1.5,
  stock: 'spcc',
  kFactor: null,
  base: null,
  marks: [],
  bends: bends.map((bend, i) => ({ id: `b${i + 1}`, angle: 90, direction: 'up', radius: null, ...bend })),
});
const machine = machineOf('brake-50-2000');
const check = (fold, bendId, extra = {}) => brakeCollisions({ fold, bendId, machine, punch: 'straight-88', ...extra });
// A bend across a W × 100 blank at x, gauged off the left or the right end.
const across = (width, x) => foldSheet(sheet([{ a: [x, -1], b: [x, 101] }]), rect(width, 100));
const ENDS = {
  left: () => [0, 50],
  right: (width) => [width, 50],
};
// The polygon's own edges cross nowhere but at their shared corners.
const selfCrossing = (ring) => {
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const n = ring.length;
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const [p, q, r, s] = [ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n]];
      const d1 = cross(r, s, p),
        d2 = cross(r, s, q),
        d3 = cross(p, q, r),
        d4 = cross(p, q, s);
      if (d1 * d2 < -1e-12 && d3 * d4 < -1e-12) return [i, j];
    }
  return null;
};
const area = (ring) =>
  ring.reduce((sum, p, i) => {
    const q = ring[(i + 1) % ring.length];
    return sum + (p[0] * q[1] - q[0] * p[1]) / 2;
  }, 0);

describe('the gooseneck section (§4.2)', () => {
  it('is the catalogue row 11.147: 88°, R0.8, H 104.5, 50 t/m; the deep one 11.148: H 145, 70 t/m', () => {
    expect(PUNCHES['gooseneck-88']).toMatchObject({ angle: 88, radius: 0.8, height: 104.5, load: 500 });
    expect(PUNCHES['gooseneck-88-deep']).toMatchObject({ angle: 88, radius: 0.8, height: 145, load: 700 });
  });
  it('draws a simple counter-clockwise ring from the tip to the clamp shoulder', () => {
    for (const key of ['gooseneck-88', 'gooseneck-88-deep']) {
      const ring = punchSection(PUNCHES[key]);
      expect(area(ring)).toBeGreaterThan(0);
      expect(selfCrossing(ring)).toBeNull();
      expect(Math.min(...ring.map((p) => p[1]))).toBeCloseTo(0, 9);
      expect(Math.max(...ring.map((p) => p[1]))).toBeCloseTo(PUNCHES[key].height, 9);
    }
  });
  it('stays above a wing at half the die limit (46°) on both sides, the back with 1.5° to spare', () => {
    for (const key of ['gooseneck-88', 'gooseneck-88-deep']) {
      const ring = punchSection(PUNCHES[key]);
      // Every point of the body beside the tip arc sits on or above the tip
      // flanks' line, rising at 46° on its own side.
      const half = (44 * Math.PI) / 180;
      const flank = (w) => 0.8 * (1 - Math.sin(half)) + ((w - 0.8 * Math.cos(half)) / Math.sin(half)) * Math.cos(half);
      for (const [y, z] of ring.filter(([y]) => Math.abs(y) > 1))
        expect(z).toBeGreaterThanOrEqual(flank(Math.abs(y)) - 1e-6);
      // The back of the body rises at 47.5° from the tip (above its flank).
      const back = ring.filter(([y, z]) => y > 20 && z < 80);
      const angle = Math.min(...back.map(([y, z]) => (Math.atan2(z, y) * 180) / Math.PI));
      expect(angle).toBeGreaterThan(47);
      expect(angle).toBeLessThan(48);
    }
  });
  it('keeps a throat on the front: 20.3 mm behind the tip line, 29.3 on the deep one', () => {
    const deepest = (key) => {
      const ring = punchSection(PUNCHES[key]);
      // The front of the body between the flank and the head: its point farthest back.
      const front = ring.slice(ring.findIndex(([y, z]) => y < 0 && z === PUNCHES[key].height));
      return Math.max(...front.map(([y]) => y));
    };
    expect(deepest('gooseneck-88')).toBeCloseTo(20.3, 9);
    expect(deepest('gooseneck-88-deep')).toBeCloseTo(29.3, 9);
  });
  it('mirrors when reversed, and only an asymmetric punch can be told apart reversed', () => {
    const ring = punchSection(PUNCHES['gooseneck-88']);
    const reversed = punchSection(PUNCHES['gooseneck-88'], true);
    expect(reversed).toHaveLength(ring.length);
    expect(area(reversed)).toBeCloseTo(area(ring), 9);
    for (const [y, z] of ring) expect(reversed).toContainEqual([-y, z]);
    expect(
      Object.values(PUNCHES)
        .filter((p) => !punchSymmetric(p))
        .map((p) => p.key),
      // The shop's four (docs/sketch-studio-shop-punches.md §5.1) are asymmetric too.
    ).toEqual(['a101', 'a102', 'a103', 'a108', 'gooseneck-88', 'gooseneck-88-deep']);
    const tools = toolingSections({
      machine,
      punch: punchOf('gooseneck-88'),
      die: dieOf('v10-88'),
      tipZ: 2,
      reverse: true,
    });
    expect(tools.punch.ring).toEqual(reversed.map(([y, z]) => [y, z + 2]));
  });
  it('gives every punch and die its plain line on what it is for', () => {
    for (const tool of [...Object.values(PUNCHES), ...Object.values(DIES)]) expect(tool.use).toMatch(/^[A-Z].+\.$/);
  });
});

describe('a plain 90° bend with the gooseneck (§4.4 item 1)', () => {
  // SPCC t 1.5, 100 wide, automatic die (V10): each refused before BT-1 ("the part hits the punch at 69.8°").
  const cases = [
    [300, 150],
    [300, 40],
    [120, 60],
    [100, 50],
  ];
  for (const [width, x] of cases)
    it(`clears ${width} × 100 with the line at ${x}, either way round and reversed`, () => {
      const fold = across(width, x);
      for (const punch of ['gooseneck-88', 'gooseneck-88-deep'])
        for (const end of ['left', 'right'])
          for (const reverse of [false, true]) {
            const { hit } = check(fold, 'b1', { punch, gaugePoint: ENDS[end](width), reverse });
            expect(hit, `${punch} gauged off the ${end}${reverse ? ', reversed' : ''}`).toBeNull();
          }
    });
});

describe('a return flange only a gooseneck clears (§4.4 item 2)', () => {
  // A U channel: the 45 flange made first, then the line 20 in from the
  // right end: the 50 web and the standing 45 flange in front, where the
  // flange swings back over the punch.
  const channel = foldSheet(
    sheet([
      { a: [45, -1], b: [45, 61] },
      { a: [95, -1], b: [95, 61] },
    ]),
    rect(115, 60),
  );
  const at = (punch, extra = {}) => check(channel, 'b2', { punch, gaugePoint: [115, 30], ...extra }).hit;
  it('hits every straight punch, clears both goosenecks with the throat to the operator', () => {
    for (const punch of ['straight-88', 'straight-88-sharp', 'straight-88-tall']) {
      const hit = at(punch);
      expect(hit, punch).toMatchObject({ tool: 'punch', phase: 'bend' });
    }
    expect(at('straight-88').message).toMatch(
      /^Bend 2: the part hits the punch at [\d.]+°\. Bend this one earlier \(before the flange in the way\), or use the gooseneck punch\.$/,
    );
    expect(at('gooseneck-88')).toBeNull();
    expect(at('gooseneck-88-deep')).toBeNull();
    // Reversed, the throat faces the backgauge and the flange meets the neck.
    expect(at('gooseneck-88', { reverse: true })).toMatchObject({ tool: 'punch' });
  });
  it('lifts the ram back only as far as the stroke goes: the flange in the throat is taken off there', () => {
    // At the bottom of the stroke the flange stands in the throat, over the
    // neck; the ram goes back to 40 mm above the sheet, not out of sight.
    const hit = at('gooseneck-88');
    expect(hit).toBeNull();
    const deeper = foldSheet(
      sheet([
        { a: [60, -1], b: [60, 61] },
        { a: [110, -1], b: [110, 61] },
      ]),
      rect(130, 60),
    );
    // A 60 flange sits deeper in the deep gooseneck's throat: lifted straight, its neck would
    // catch it within the 40 mm. Since docs/sketch-studio-shop-punches.md §5.3 the part is
    // taken off along a slant when the straight lift is caught: it comes off toward the operator.
    const deep = check(deeper, 'b2', { punch: 'gooseneck-88-deep', gaugePoint: [130, 30] });
    expect(deep.hit).toBeNull();
    expect(deep.takeOff).toBe(-15);
    const goose = check(deeper, 'b2', { punch: 'gooseneck-88', gaugePoint: [130, 30] });
    expect(goose.hit).toBeNull();
    expect(goose.takeOff).toBeNull();
  });
});

describe('the station: Reverse punch, the advice as a fix, the picker (§4.2, §4.3, §4.1)', () => {
  const modelOf = (width, bends = []) => ({
    ...emptyModel(),
    sketches: [{ id: 's', name: 'Blank', plane: 'XY', profile: rect(width, 60), primitives: [], constrained: false }],
    parts: [{ id: 'p', name: 'Channel', material: 'SPCC cold-rolled steel', features: [sheet(bends)] }],
    instances: [{ id: 'i', partId: 'p', position: [0, 0, 0], rotation: [0, 0, 0] }],
  });
  const session = (patch) => ({
    ...brakeSessionDefaults(),
    stage: 'setup',
    key: 'k',
    instanceId: 'i',
    edge: 1,
    distance: 20,
    ...patch,
  });
  const channel = modelOf(115, [{ a: [45, -1], b: [45, 61], punch: 'straight-88' }]);
  it('starts with the punch the right way round', () => {
    expect(brakeSessionDefaults().reverse).toBe(false);
    expect(punchReversed(session({ reverse: true }))).toBe(false);
    expect(punchReversed(session({ punch: 'gooseneck-88', reverse: true }))).toBe(true);
  });
  it('offers the first punch in the rack that clears on the collision card, and one click makes the hit pass', () => {
    // Shop punches §5.4: every sharp punch is tried in rack order, the shop's own first; the A 101 clears.
    const station = brakeStation({ model: channel, session: session() });
    expect(station.pending.collision.hit).toMatchObject({ tool: 'punch' });
    expect(station.pending.collision.fix).toEqual({
      label: 'Use the A 101 punch',
      session: { punch: 'a101', reverse: false },
    });
    const fixed = brakeStation({ model: channel, session: session(station.pending.collision.fix.session) });
    expect(fixed.pending.refusals).toEqual([]);
    expect(fixed.pending.collision.hit).toBeNull();
    // The view draws the punch the session holds, the right way round.
    expect(fixed.view).toMatchObject({ punch: 'a101', reverse: false });
    // The catalogue gooseneck clears it too, as before.
    expect(
      brakeStation({ model: channel, session: session({ punch: 'gooseneck-88' }) }).pending.collision.hit,
    ).toBeNull();
  });
  it('turns a reversed gooseneck round when that is what clears, and says so', () => {
    const reversed = brakeStation({ model: channel, session: session({ punch: 'gooseneck-88', reverse: true }) });
    expect(reversed.view.reverse).toBe(true);
    expect(reversed.pending.collision.hit).toMatchObject({ tool: 'punch' });
    expect(reversed.pending.collision.fix).toEqual({
      label: 'Turn the punch round',
      session: { punch: 'gooseneck-88', reverse: false },
    });
    // The deep gooseneck reversed: turned back round before any other punch is offered.
    const deep = brakeStation({ model: channel, session: session({ punch: 'gooseneck-88-deep', reverse: true }) });
    expect(deep.pending.collision.fix).toEqual({
      label: 'Turn the punch round',
      session: { punch: 'gooseneck-88-deep', reverse: false },
    });
  });
  it('offers a taller punch when the flange swings into the punch holders and clears under its taller clamps', () => {
    // A 48 flange on a 60 web: its edge rises into the holders over the straight punch. Shop
    // punches §5.4: the rack is tried in order and the A 101 (95 mm) clears first.
    const box = modelOf(128, [{ a: [48, -1], b: [48, 61] }]);
    const station = brakeStation({ model: box, session: session() });
    expect(station.pending.collision.hit).toMatchObject({ tool: 'holder' });
    expect(station.pending.collision.fix).toEqual({
      label: 'Use the A 101 punch',
      session: { punch: 'a101', reverse: false },
    });
    expect(brakeStation({ model: box, session: session({ punch: 'a101' }) }).pending.collision.hit).toBeNull();
    expect(
      brakeStation({ model: box, session: session({ punch: 'straight-88-tall' }) }).pending.collision.hit,
    ).toBeNull();
  });
  it('offers no punch when the hit does not clear with it', () => {
    // A web bent between two standing flanges (the verify-fab-shop-sm2 case):
    // one flange swings into the punch from each side, a throat takes one only.
    const tray = modelOf(100, [
      { a: [20, -1], b: [20, 61] },
      { a: [75, -1], b: [75, 61] },
    ]);
    const station = brakeStation({ model: tray, session: session({ edge: 3, distance: 47.5 }) });
    expect(station.pending.collision.hit).toMatchObject({ tool: 'punch' });
    expect(station.pending.collision.fix).toBeUndefined();
    for (const reverse of [false, true])
      expect(
        brakeStation({ model: tray, session: session({ edge: 3, distance: 47.5, punch: 'gooseneck-88', reverse }) })
          .pending.collision.hit,
      ).toMatchObject({ tool: 'punch' });
  });
  it('shares one rule between the Punch select and the picker', () => {
    expect(punchChoice(session(), 'gooseneck-88')).toEqual({ punch: 'gooseneck-88' });
    expect(punchChoice(session(), 'radius-30')).toEqual({ punch: 'radius-30', shape: 'round', die: null });
    expect(punchChoice(session({ punch: 'radius-30' }), 'straight-88')).toEqual({ punch: 'straight-88', die: null });
  });
  it('tries the pending hit with every punch and every die for the picker', () => {
    const punches = bladeOptions({ model: channel, session: session(), kind: 'punch' });
    expect(punches.map((o) => o.key)).toEqual(Object.keys(PUNCHES));
    const by = Object.fromEntries(punches.map((o) => [o.key, o]));
    expect(by['straight-88'].collision).toMatchObject({ tool: 'punch' });
    expect(by['gooseneck-88']).toMatchObject({ error: null, refusals: [], collision: null });
    expect(by['gooseneck-88'].patch).toEqual({ punch: 'gooseneck-88' });
    // The R10 radius punch takes the wide V32 die, whose shoulders the 20 mm leg does not reach: refused, still a choice.
    expect(by['radius-10'].patch).toEqual({ punch: 'radius-10', shape: 'round', die: null });
    expect(by['radius-10'].refusals.map((r) => r.code)).toContain('short-leg');
    // The R30's bend zone runs off the 20 mm leg: the hit does not fold at all.
    expect(by['radius-30'].error).toMatch(/^This hit runs too close to the edge/);
    const dies = bladeOptions({ model: channel, session: session({ punch: 'gooseneck-88' }), kind: 'die' });
    expect(dies[0]).toMatchObject({ key: null, patch: { die: null }, collision: null });
    expect(dies.map((o) => o.key).slice(1)).toEqual(Object.keys(DIES));
    // The V25 die needs a longer leg than the 20 mm the backgauge leaves.
    expect(dies.find((o) => o.key === 'v25-88').refusals.map((r) => r.code)).toContain('short-leg');
  });
});
