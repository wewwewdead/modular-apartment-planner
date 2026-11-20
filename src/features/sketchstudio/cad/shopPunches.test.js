// The shop's own punches (docs/sketch-studio-shop-punches.md §5, SP-1): the
// four sections from the tool chart on the user's press brake, the part taken
// off the punch along a slant when a straight lift would catch it (§5.3: the
// brake then agrees with the chart), the card trying every punch in the rack
// (§5.4), the punch staying in the machine (§5.5) and the words that name both
// 30° punches (§5.6). §5.8's unit tests; the pinned ones it changes live with
// their own files (brakeBlades, brakeFlip, brakeToolLength, tightBendsWay,
// pressBrake).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { foldSheet } from './sheetMetal.js';
import { PUNCH_LABELS, TAKE_OFF_SLANTS, brakeCollisions, takeOffOf } from './brakeCollisions.js';
import { NO_WAY, brakeSessionDefaults, brakeStation, sequenceChecks, startStroke } from './brakeStation.js';
import { BRAKE_PUNCH_KEY, forgetPunch, rememberPunch, rememberedPunch } from './brakeMemory.js';
import { gaugeEdges } from './pressBrake.js';
import { emptyModel } from './model.js';
import { PUNCHES, PUNCH_GROUPS, RACK_ORDER, machineOf, punchSection, punchSymmetric } from './shopCatalog.js';

const MACHINE = 'brake-50-2000';
const SHOP = ['a101', 'a102', 'a103', 'a108'];
const feature = (bends = [], thickness = 1.2) => ({
  id: 'f',
  type: 'sheetmetal',
  sketchId: 's',
  thickness,
  stock: 'spcc',
  kFactor: null,
  base: null,
  marks: [],
  bends,
});
const rectangle = (W, H) => ({ type: 'rectangle', width: W, height: H, origin: [0, 0] });
const line = (id, x, H, { angle = 90, punch = 'straight-88', die = null } = {}) => ({
  id,
  a: [x, 0],
  b: [x, H],
  angle,
  direction: 'up',
  radius: null,
  punch,
  ...(die ? { die } : {}),
});
// Some way round: the sheet either side back (`turned`) and the punch either way round (`reverse`).
const WAYS = [
  { turned: false, reverse: false },
  { turned: false, reverse: true },
  { turned: true, reverse: false },
  { turned: true, reverse: true },
];
const area = (ring) =>
  ring.reduce(
    (sum, p, i) => sum + (p[0] * ring[(i + 1) % ring.length][1] - ring[(i + 1) % ring.length][0] * p[1]) / 2,
    0,
  );
const selfCrossing = (ring) => {
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const n = ring.length;
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const [p, q, r, s] = [ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n]];
      if (cross(r, s, p) * cross(r, s, q) < -1e-12 && cross(p, q, r) * cross(p, q, s) < -1e-12) return [i, j];
    }
  return null;
};
// Where a ring crosses the level z: the y of each crossing, ascending.
const cutAt = (ring, z) => {
  const ys = [];
  for (let i = 0; i < ring.length; i++) {
    const [a, b] = [ring[i], ring[(i + 1) % ring.length]];
    if ((a[1] - z) * (b[1] - z) < 0) ys.push(a[0] + ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]));
  }
  return ys.sort((u, v) => u - v);
};

describe('the four punches (§5.1, §5.8 item 1)', () => {
  it('are rows of the rack with the chart’s numbers, marked as the shop’s', () => {
    expect(SHOP.map((key) => PUNCHES[key].name)).toEqual(['A 101', 'A 102', 'A 103', 'A 108']);
    expect(SHOP.map((key) => [PUNCHES[key].angle, PUNCHES[key].radius])).toEqual([
      [88, 0.8],
      [88, 0.8],
      [30, 0.6],
      [88, 0.8],
    ]);
    for (const key of SHOP) expect(PUNCHES[key], key).toMatchObject({ height: 95, load: 500, rack: 'shop' });
    // Every other punch is the catalogue's.
    expect(
      Object.values(PUNCHES)
        .filter((p) => p.rack === 'shop')
        .map((p) => p.key),
    ).toEqual(SHOP);
    expect(PUNCHES.a101.use).toBe('Channels and return flanges: a return as long as its web, from a 10 mm web.');
    expect(PUNCHES.a108.use).toBe('A heavy swan neck: a return up to 5 mm longer than its web, from a 20 mm web.');
    for (const key of SHOP) expect(PUNCH_LABELS[key]).toBe(`Use the ${PUNCHES[key].name} punch`);
  });
  it('have simple counter-clockwise rings from the tip to the shoulder, none its own mirror', () => {
    for (const key of SHOP) {
      const ring = punchSection(PUNCHES[key]);
      expect(selfCrossing(ring), key).toBeNull();
      expect(area(ring), key).toBeGreaterThan(0);
      expect(Math.min(...ring.map((p) => p[1])), key).toBeCloseTo(0, 9);
      expect(Math.max(...ring.map((p) => p[1])), key).toBe(95);
      expect(punchSymmetric(PUNCHES[key]), key).toBe(false);
    }
    // At z 40 the blade stands behind the tip line (+y), the room for a return in front of it.
    const [front101, back101] = cutAt(punchSection(PUNCHES.a101), 40);
    expect(front101).toBeCloseTo(2.8, 9);
    expect(back101).toBeCloseTo(14.9, 9);
    const [front102, back102] = cutAt(punchSection(PUNCHES.a102), 40);
    expect(front102).toBeCloseTo(4.6, 9);
    expect(back102).toBeCloseTo(14.9, 9);
  });
  it('lead the rack, the catalogue after them in its own order (§5.1, §5.2)', () => {
    expect(RACK_ORDER.slice(0, 4)).toEqual(SHOP);
    expect(RACK_ORDER.slice(4)).toEqual(Object.keys(PUNCHES).filter((key) => !SHOP.includes(key)));
    expect([...RACK_ORDER].sort()).toEqual(Object.keys(PUNCHES).sort());
    expect(PUNCH_GROUPS.map((g) => [g.name, g.keys.length])).toEqual([
      ["Your shop's punches", 4],
      ['Catalogue punches', RACK_ORDER.length - 4],
    ]);
  });
});

describe('plain bends with the four (§5.8 item 2)', () => {
  it('clears a 90° bend across a 200 × 100 blank with each, both ways round, either side back', () => {
    let checked = 0;
    for (const t of [1.2, 2.0, 3.2])
      for (const x of [15, 30, 100, 170, 185]) {
        const fold = foldSheet(feature([line('b', x, 100)], t), rectangle(200, 100));
        for (const punch of SHOP)
          for (const way of WAYS) {
            checked++;
            const result = brakeCollisions({ fold, bendIds: ['b'], machine: MACHINE, punch, ...way, advise: false });
            expect(result.hit, `t ${t}, line ${x}, ${punch} ${JSON.stringify(way)}`).toBeNull();
            // A plain bend lifts off straight.
            expect(result.takeOff).toBeNull();
          }
      }
    expect(checked).toBe(240);
  }, 60000);
  it('bends past 90° with the A 103 in the V8 30° die, as the Acute 30°', () => {
    for (const angle of [120, 135, 150]) {
      const fold = foldSheet(feature([line('b', 100, 100, { angle, die: 'v8-30' })]), rectangle(200, 100));
      for (const punch of ['a103', 'acute-30'])
        expect(
          brakeCollisions({ fold, bendIds: ['b'], machine: MACHINE, punch, die: 'v8-30', advise: false }).hit,
          `${angle}° ${punch}`,
        ).toBeNull();
    }
  });
});

describe('the brake agrees with the chart (§5.3, §5.8 item 3)', () => {
  // A web `a` with a return `b`: the lip made first, then the inner bend, the 200 mm body beyond.
  const WEBS = [10, 15, 20, 25, 30, 40, 50, 60];
  const RETURNS = [10, 15, 20, 25, 30, 40, 50];
  // The spec's probe, cell for cell (1: clears some way round). A 103's (30, 30) and (60, 50)
  // lie within 0.3 mm of its outline: the brake passes them, the chart's thin return does not.
  const CHART = {
    a101: ['1000000', '1100000', '1110000', '1111000', '1111100', '1111110', '1111111', '1111111'],
    a102: ['1100000', '1110000', '1111000', '1111100', '1111100', '1111110', '1111111', '1111111'],
    a103: ['0000000', '0000000', '1100000', '1110000', '1111100', '1111100', '1111110', '1111111'],
    a108: ['0000000', '1100000', '1111000', '1111100', '1111100', '1111110', '1111110', '1111111'],
  };
  const cell = (punch, a, b) => {
    const fold = foldSheet(feature([line('lip', 200 + a, 100), line('inner', 200, 100)]), rectangle(200 + a + b, 100));
    return WAYS.map((way) =>
      brakeCollisions({
        fold,
        bendIds: ['inner'],
        angles: { lip: 90 },
        machine: MACHINE,
        punch,
        ...way,
        advise: false,
      }),
    );
  };
  const results = {};
  for (const punch of SHOP)
    it(`${PUNCHES[punch].name}: the chart, cell for cell`, () => {
      results[punch] = WEBS.map((a) => RETURNS.map((b) => cell(punch, a, b)));
      const matrix = results[punch].map((row) => row.map((ways) => (ways.some((r) => !r.hit) ? '1' : '0')).join(''));
      expect(matrix).toEqual(CHART[punch]);
    }, 60000);
  it('the A 101 takes off along a slant exactly where the straight lift is refused', () => {
    const rows = results.a101 || WEBS.map((a) => RETURNS.map((b) => cell('a101', a, b)));
    const slanted = [];
    rows.forEach((row, i) =>
      row.forEach((ways, j) => {
        const clear = ways.filter((r) => !r.hit);
        // Clears, but no way round lifts straight off.
        if (clear.length && clear.every((r) => r.takeOff != null)) slanted.push([WEBS[i], RETURNS[j]]);
        for (const r of ways) if (r.hit) expect(r.takeOff).toBeNull();
        for (const r of clear) if (r.takeOff != null) expect(TAKE_OFF_SLANTS).toContain(r.takeOff);
      }),
    );
    expect(slanted).toEqual([
      [10, 10],
      [15, 15],
      [20, 20],
      [25, 25],
      [30, 30],
    ]);
  }, 60000);
});

// §3 / tight bends §5.3 step 3: the screenshot's 605.4 × 420.4 blank, t 1.2.
const W = 605.4,
  H = 420.4;
const RIGHT = gaugeEdges([
  [0, 0],
  [W, 0],
  [W, H],
  [0, H],
]).findIndex((e) => Math.abs(e.a[0] - W) < 1e-6 && Math.abs(e.b[0] - W) < 1e-6);
const modelOf = (bends) => {
  const model = emptyModel();
  model.sketches = [{ id: 's', name: 'S', plane: 'XY', profile: rectangle(W, H), primitives: [], constrained: false }];
  model.parts = [{ id: 'p', name: 'Tray', features: [feature(bends)] }];
  model.instances = [{ id: 'i', partId: 'p', name: '', position: [0, 0, 0], rotation: [0, 0, 0], visible: true }];
  return model;
};
const session = (extra = {}) => ({
  ...brakeSessionDefaults(),
  stage: 'setup',
  key: 'k',
  instanceId: 'i',
  mode: 'gauge',
  edge: RIGHT,
  angle: 90,
  ...extra,
});
const passes = (pending) => Boolean(pending && !pending.error && !pending.refusals.length && !pending.collision?.hit);

describe('lip 15 / web 15 taken off the punch (§5.8 item 4)', () => {
  const fold = foldSheet(feature([line('lip', W - 15, H), line('inner', W - 30, H)]), rectangle(W, H));
  const inner = (punch, way) =>
    brakeCollisions({ fold, bendIds: ['inner'], angles: { lip: 90 }, machine: MACHINE, punch, ...way, advise: false });
  it('the A 101 with its room toward the lip clears, drawn off at 15°; the body toward the lip meets it near 14°', () => {
    // Turned (the lip toward the operator), the room in front: taken off toward the operator.
    expect(inner('a101', { turned: true, reverse: false })).toMatchObject({ hit: null, takeOff: -15 });
    // This side back, reversed (the room toward the lip at the back): toward the backgauge.
    expect(inner('a101', { turned: false, reverse: true })).toMatchObject({ hit: null, takeOff: 15 });
    for (const way of [
      { turned: false, reverse: false },
      { turned: true, reverse: true },
    ]) {
      const { hit, takeOff } = inner('a101', way);
      expect(hit).toMatchObject({ tool: 'punch', phase: 'bend' });
      expect(hit.angle).toBeGreaterThan(13);
      expect(hit.angle).toBeLessThan(15);
      expect(takeOff).toBeNull();
    }
  });
  it('the A 108 takes it off at 30°', () => {
    expect(inner('a108', { turned: true, reverse: false })).toMatchObject({ hit: null, takeOff: -30 });
    expect(inner('a108', { turned: false, reverse: true })).toMatchObject({ hit: null, takeOff: 30 });
  });
  it('slants only the return: the same hit is refused on the way up when no slant is free', () => {
    // The chart's refused band (web 15, return 20): every way round, the return or the bend.
    const tight = foldSheet(feature([line('lip', 215, 100), line('inner', 200, 100)]), rectangle(235, 100));
    for (const way of WAYS) {
      const { hit, takeOff } = brakeCollisions({
        fold: tight,
        bendIds: ['inner'],
        angles: { lip: 90 },
        machine: MACHINE,
        punch: 'a101',
        ...way,
        advise: false,
      });
      expect(hit).not.toBeNull();
      expect(takeOff).toBeNull();
      if (hit.phase === 'return') expect(hit.message).toMatch(/as the ram goes back up\.$/);
    }
  });
  it('the return alone (a made step re-run) takes off as the pedal’s stroke does', () => {
    expect(
      takeOffOf({ fold, bendIds: ['inner'], angles: { lip: 90 }, machine: MACHINE, punch: 'a101', turned: true }),
    ).toBe(-15);
    expect(takeOffOf({ fold, bendIds: ['inner'], angles: { lip: 90 }, machine: MACHINE, punch: 'straight-88' })).toBe(
      null,
    );
  });
});

describe('the card tries the rack (§5.4, §5.8 items 7 – 9)', () => {
  it('item 7: the lip made with the straight punch, the inner pending: a shop punch, one click and it clears', () => {
    const model = modelOf([{ ...line('lip', W - 15, H), die: 'v8-88' }]);
    const { pending } = brakeStation({ model, session: session({ distance: 30 }) });
    expect(pending.collision.hit).toMatchObject({ tool: 'punch' });
    expect(pending.collision.fix).toEqual({
      label: 'Use the A 101 punch, reversed',
      session: { punch: 'a101', reverse: true },
    });
    expect(pending.collision.hit.message).toMatch(
      /^Bend 2: the part hits the punch at [\d.]+°\. Use the A 101 punch, reversed\. Turning the sheet around, bending this one earlier, a part-way bend first and the A 101 punch were tried: none clears\.$/,
    );
    const fixed = brakeStation({ model, session: session({ distance: 30, ...pending.collision.fix.session }) });
    expect(passes(fixed.pending)).toBe(true);
    // Drawn off the punch toward the backgauge (the room at the back), and the stroke carries it.
    expect(fixed.pending.collision.takeOff).toBe(15);
    expect(startStroke({ station: fixed, token: 't', id: 'x' }).run.takeOff).toBe(15);
  });
  it('item 8: lip 20 / web 10, either order: no button, the new NO_WAY', () => {
    // Reworded by SP-2 (§6.2): the earlier bends with another punch are tried too.
    expect(NO_WAY).toBe(
      'No order, no part-way bend and no other punch for the earlier bends clears it. Make the web wider or the flange shorter, or use tooling this rack does not hold.',
    );
    for (const [made, x, L] of [
      ['inner', W - 30, 20],
      ['lip', W - 20, 30],
    ]) {
      const { pending } = brakeStation({
        model: modelOf([{ ...line(made, x, H), die: 'v8-88' }]),
        session: session({ distance: L }),
      });
      expect(pending.collision.hit, made).toBeTruthy();
      expect(pending.collision.fix, made).toBeUndefined();
      expect(pending.collision.ways, made).toBeUndefined();
      expect(pending.collision.turn, made).toBeUndefined();
      expect(pending.collision.hit.message).toMatch(
        /Turning the sheet around and every other punch in the rack, either way round, were tried: neither clears\. No order/,
      );
      expect(pending.collision.hit.message.endsWith(` ${NO_WAY}`)).toBe(true);
    }
  });
  it('item 9: the A 101 in from the start, inner first, the lip pending: "Make this hit before bend 1", both rows ok', () => {
    const model = modelOf([{ ...line('inner', W - 30, H, { punch: 'a101' }), die: 'v8-88' }]);
    const lip = session({ distance: 15, punch: 'a101' });
    const { pending } = brakeStation({ model, session: lip });
    expect(pending.collision.ways.first).toEqual({
      label: 'Make this hit before bend 1',
      session: { armed: { kind: 'before', key: 'inner' } },
      number: 1,
    });
    const armed = brakeStation({ model, session: { ...lip, ...pending.collision.ways.first.session } });
    expect(passes(armed.pending)).toBe(true);
    const stroke = startStroke({ station: armed, token: 't', id: 'x' });
    const fold = foldSheet({ ...armed.feature, bends: stroke.placed }, armed.profile);
    expect(sequenceChecks({ fold, machine: machineOf(MACHINE) }).map((c) => [c.refusals.length, c.collision])).toEqual([
      [0, null],
      [0, null],
    ]);
  });
  it('past two punches the tried list is one item, the ram’s "every taller punch in the rack"', () => {
    // Inner made with the straight punch, the lip pending: the ram as it comes down.
    const { pending } = brakeStation({
      model: modelOf([{ ...line('inner', W - 30, H), die: 'v8-88' }]),
      session: session({ distance: 15 }),
    });
    expect(pending.collision.hit).toMatchObject({ tool: 'ram', phase: 'approach' });
    // SP-2 (§6.2) offers this part's earlier bend with another punch, and says the part-way bend tried.
    expect(pending.collision.hit.message).toContain(
      'Turning the sheet around, a part-way bend first and every taller punch in the rack, either way round, were tried: none clears.',
    );
  });
});

describe('the punch stays in the machine (§5.5, §5.8 item 10)', () => {
  const store = new Map();
  const storage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  afterEach(() => {
    store.clear();
    vi.unstubAllGlobals();
  });
  // The session a visit with nothing carried starts with (CadWorkspace.jsx startPressBrake).
  const visit = () => ({ ...brakeSessionDefaults(), ...(rememberedPunch() || {}) });
  it('starts with the straight punch when nothing is stored, or no storage is there', () => {
    expect(visit().punch).toBe('straight-88');
    vi.stubGlobal('localStorage', storage);
    forgetPunch();
    expect(rememberedPunch()).toBeNull();
    expect(visit()).toMatchObject({ punch: 'straight-88', reverse: false });
  });
  it('starts the next visit with the last hit’s punch, the way round it was clamped', () => {
    vi.stubGlobal('localStorage', storage);
    rememberPunch({ punch: 'a101', reverse: true });
    expect(JSON.parse(store.get(BRAKE_PUNCH_KEY))).toEqual({ punch: 'a101', reverse: true });
    expect(visit()).toMatchObject({ punch: 'a101', reverse: true });
  });
  it('does not remember a radius punch (it belongs to its bend)', () => {
    vi.stubGlobal('localStorage', storage);
    rememberPunch({ punch: 'gooseneck-88', reverse: false });
    rememberPunch({ punch: 'radius-20', reverse: false });
    expect(visit()).toMatchObject({ punch: 'gooseneck-88', reverse: false });
  });
  it('falls back to the default on an unknown key, a bad value or a storage that throws', () => {
    vi.stubGlobal('localStorage', storage);
    for (const raw of [
      '{',
      'null',
      '"a101"',
      JSON.stringify({ punch: 'nope' }),
      JSON.stringify({ punch: 'radius-10' }),
    ]) {
      store.set(BRAKE_PUNCH_KEY, raw);
      expect(visit().punch, raw).toBe('straight-88');
    }
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('full');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    });
    expect(() => rememberPunch({ punch: 'a101' })).not.toThrow();
    expect(() => forgetPunch()).not.toThrow();
    expect(visit().punch).toBe('straight-88');
  });
});
