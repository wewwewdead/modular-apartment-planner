// The earlier bends with another punch; 45° first; a quicker card
// (docs/sketch-studio-shop-punches.md §6, SP-2): a third try on the collision
// card (this hit made before an earlier bend AND that bend made with another
// punch of the rack, armed and committed in one commit), a stored row's punch
// button, PART_WAY with 45° first, and the card's punch tries checked on
// brakeCollisions before the station runs. §6.7's unit tests on the 605.4 ×
// 420.4 blank, t 1.2 SPCC, the right edge; the pinned ones it changes live
// with their own files (tightBendsWay, brakeFlip, brakeToolLength, shopPunches).
import { describe, expect, it, vi } from 'vitest';
import { foldSheet, foldedBounds } from './sheetMetal.js';
import {
  NO_WAY,
  PART_WAY,
  brakeSessionDefaults,
  brakeStation,
  placedBends,
  punchChangeWords,
  sequenceChecks,
  sequenceTries,
  startStroke,
  wayTries,
} from './brakeStation.js';
import { gaugeEdges } from './pressBrake.js';
import { emptyModel } from './model.js';
import { machineOf } from './shopCatalog.js';

const MACHINE = machineOf('brake-50-2000');
const feature = (bends = []) => ({
  id: 'f',
  type: 'sheetmetal',
  sketchId: 's',
  thickness: 1.2,
  stock: 'spcc',
  kFactor: null,
  base: null,
  marks: [],
  bends,
});
const rectangle = (W, H) => ({ type: 'rectangle', width: W, height: H, origin: [0, 0] });
const modelOf = (bends, W, H) => {
  const model = emptyModel();
  model.sketches = [{ id: 's', name: 'S', plane: 'XY', profile: rectangle(W, H), primitives: [], constrained: false }];
  model.parts = [{ id: 'p', name: 'Tray', features: [feature(bends)] }];
  model.instances = [{ id: 'i', partId: 'p', name: '', position: [0, 0, 0], rotation: [0, 0, 0], visible: true }];
  return model;
};
const rightOf = (W, H) =>
  gaugeEdges([
    [0, 0],
    [W, 0],
    [W, H],
    [0, H],
  ]).findIndex((e) => Math.abs(e.a[0] - W) < 1e-6 && Math.abs(e.b[0] - W) < 1e-6);
const line = (id, x, H, { angle = 90, direction = 'up', punch = 'straight-88' } = {}) => ({
  id,
  a: [x, 0],
  b: [x, H],
  angle,
  direction,
  radius: null,
  punch,
  die: 'v8-88',
});
const passes = (pending) => Boolean(pending && !pending.error && !pending.refusals.length && !pending.collision?.hit);
const rows = (fold) =>
  sequenceChecks({ fold, machine: MACHINE }).map((c) =>
    c.collision ? c.collision.tool : c.refusals.length ? 'refused' : 'ok',
  );
const size = (fold) => {
  const [lo, hi] = foldedBounds(fold);
  return lo.map((v, i) => Number((hi[i] - v).toFixed(2)));
};

const W = 605.4,
  H = 420.4;
const RIGHT = rightOf(W, H);
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

describe('try 3: this hit first, and the bend after it with another punch (§6.2, §6.7 item 1)', () => {
  // Lip 15 / web 15: the inner bend (L 30) made with the straight punch, the straight punch in, the lip pending.
  const model = modelOf([line('inner', W - 30, H)], W, H);
  const lip = session({ distance: 15 });
  it('offers "Make this hit before bend 1, and bend 1 with the A 101 punch": no first, no part-way, not NO_WAY', () => {
    const { pending } = brakeStation({ model, session: lip });
    expect(pending.collision.hit).toMatchObject({ tool: 'ram', phase: 'approach' });
    expect(pending.collision.ways).toEqual({
      first: null,
      partway: null,
      compound: {
        label: 'Make this hit before bend 1, and bend 1 with the A 101 punch',
        session: { armed: { kind: 'before', key: 'inner', punches: { inner: 'a101' } } },
        number: 1,
        changes: [{ number: 1, punch: 'a101' }],
      },
    });
    const message = pending.collision.hit.message;
    expect(message).toContain('Make this hit before bend 1 and make bend 1 with the A 101 punch.');
    expect(message).not.toContain(NO_WAY);
    expect(message).not.toMatch(/No order|Bend this one earlier|bending this one earlier/);
    // The facts (advise: false) try nothing.
    expect(brakeStation({ model, session: lip, advise: false }).pending.collision.ways).toBeUndefined();
  });
  it('the order alone is refused in its words, naming the step and why (`step`, `tool`)', () => {
    const { pending } = brakeStation({
      model,
      session: { ...lip, armed: { kind: 'before', key: 'inner' } },
      advise: false,
    });
    expect(pending.collision.hit).toBe(null);
    expect(pending.refusals).toHaveLength(1);
    expect(pending.refusals[0]).toMatchObject({ code: 'order', step: 1, tool: 'punch' });
    expect(pending.refusals[0].message).toMatch(/^That order is refused: step 2 could not be made then\. /);
  });
  it('armed: the hit passes; placedBends puts the lip first and the inner bend with the A 101; one commit', () => {
    const armed = { kind: 'before', key: 'inner', punches: { inner: 'a101' } };
    const station = brakeStation({ model, session: { ...lip, armed } });
    expect(passes(station.pending)).toBe(true);
    expect(station.pending.armed).toMatchObject({
      kind: 'before',
      key: 'inner',
      punches: { inner: 'a101' },
      changes: [{ key: 'inner', number: 1, again: false, punch: 'a101' }],
      number: 1,
      place: 0,
    });
    // The view: the sheet as it is then (the inner line flat).
    expect(station.view.angles).toEqual({ inner: 0, 'pending-hit': 0 });
    expect(
      placedBends(station.feature.bends, [{ id: 'new' }], station.pending.armed).map((b) => [b.id, b.punch ?? null]),
    ).toEqual([
      ['new', null],
      ['inner', 'a101'],
    ]);
    let n = 0;
    const stroke = startStroke({ station, token: 't', newId: () => `n${++n}` });
    // The stroke carries both changes, committed together (the workspace commits `placed` once).
    expect(stroke.placed.map((b) => [b.id, b.punch])).toEqual([
      ['n1', 'straight-88'],
      ['inner', 'a101'],
    ]);
    // Numbered as the rows read after the commit: the inner bend is bend 2 then.
    expect(stroke.notice).toBe('Bend 2 is now made with the A 101 punch.');
    const made = foldSheet(feature(stroke.placed), rectangle(W, H));
    expect(rows(made)).toEqual(['ok', 'ok']);
    // The lip-first part's folded size (shop punches §5.9, verify step 2).
    expect(size(made)).toEqual([576.47, 420.4, 17.14]);
  });
});

describe('try 1 is enough when the punch is right (§6.7 item 2)', () => {
  it('the A 101 in from the start: "Make this hit before bend 1", no compound', () => {
    const model = modelOf([line('inner', W - 30, H, { punch: 'a101' })], W, H);
    const { pending } = brakeStation({ model, session: session({ distance: 15, punch: 'a101' }) });
    expect(pending.collision.ways).toEqual({
      first: { label: 'Make this hit before bend 1', session: { armed: { kind: 'before', key: 'inner' } }, number: 1 },
      partway: null,
    });
  });
});

describe('nothing passes (§6.7 item 3: lip 20 / web 10)', () => {
  it('either order: no button, the new NO_WAY', () => {
    expect(NO_WAY).toBe(
      'No order, no part-way bend and no other punch for the earlier bends clears it. Make the web wider or the flange shorter, or use tooling this rack does not hold.',
    );
    for (const [made, x, L] of [
      ['inner', W - 30, 20],
      ['lip', W - 20, 30],
    ]) {
      const { pending } = brakeStation({ model: modelOf([line(made, x, H)], W, H), session: session({ distance: L }) });
      expect(pending.collision.hit, made).toBeTruthy();
      expect(pending.collision.ways, made).toBeUndefined();
      expect(pending.collision.fix, made).toBeUndefined();
      expect(pending.collision.hit.message.endsWith(` ${NO_WAY}`), made).toBe(true);
    }
  });
});

describe('armedOf keeps only what it may change (§6.2, §6.7 item 4)', () => {
  const armedFor = (bends, armed, extra = {}) =>
    brakeStation({ model: modelOf(bends, W, H), session: session({ distance: 15, armed, ...extra }), advise: false })
      .pending.armed;
  it('keeps a sharp step after the place with a sharp punch of the rack', () => {
    expect(
      armedFor([line('inner', W - 30, H)], { kind: 'before', key: 'inner', punches: { inner: 'a102' } }),
    ).toMatchObject({
      punches: { inner: 'a102' },
      changes: [{ number: 1, punch: 'a102' }],
    });
  });
  it('drops a record before the place, an unknown or radius punch, and a round step: plain try 1', () => {
    const two = [line('far', 300, H), line('inner', W - 30, H)];
    const plain = armedFor(two, { kind: 'before', key: 'inner' });
    for (const punches of [{ far: 'a101' }, { inner: 'no-such-punch' }, { inner: 'radius-10' }]) {
      const armed = armedFor(two, { kind: 'before', key: 'inner', punches });
      expect(armed, JSON.stringify(punches)).toMatchObject({ kind: 'before', key: 'inner', number: 2, place: 1 });
      expect(armed.punches, JSON.stringify(punches)).toBeUndefined();
      expect(armed.changes, JSON.stringify(punches)).toBeUndefined();
      expect({ ...armed, step: null }).toEqual({ ...plain, step: null });
    }
    // A round bend (bump bending) after the place is not given another punch.
    const round = { ...line('round', 300, H), radius: 20, steps: 4 };
    const armed = armedFor([round], { kind: 'before', key: 'round', punches: { round: 'a101' } });
    expect(armed).toMatchObject({ kind: 'before', key: 'round' });
    expect(armed.punches).toBeUndefined();
    // A part-way try never carries punches (§6.6).
    const partway = armedFor([line('far', 300, H)], {
      kind: 'partway',
      key: 'far',
      angle: 45,
      punches: { far: 'a101' },
    });
    expect(partway).toMatchObject({ kind: 'partway', angle: 45 });
    expect(partway.punches).toBeUndefined();
  });
  it('words several changed steps as the spec does', () => {
    expect(punchChangeWords([{ number: 1, again: false, punch: 'a101' }])).toBe('bend 1 with the A 101 punch');
    expect(
      punchChangeWords([
        { number: 1, again: false, punch: 'a101' },
        { number: 3, again: false, punch: 'a101' },
      ]),
    ).toBe('bends 1 and 3 with the A 101 punch');
    expect(
      punchChangeWords(
        [
          { number: 1, again: false, punch: 'a101' },
          { number: 3, again: true, punch: 'gooseneck-88' },
        ],
        'is',
      ),
    ).toBe('bend 1 is made with the A 101 punch and step 3 with the gooseneck punch');
    expect(punchChangeWords([{ number: 2, again: false, punch: 'a108' }], 'now')).toBe(
      'bend 2 is now made with the A 108 punch',
    );
  });
});

describe('45° first (§6.4, §6.7 item 5: the tight Z)', () => {
  // 315 × 200: 150 from the left up, then 150 from the right down (web 15).
  const ZW = 315,
    ZH = 200;
  const model = modelOf([line('b1', 150, ZH)], ZW, ZH);
  const down = { ...session({ distance: 150, flip: true }), edge: rightOf(ZW, ZH) };
  it('PART_WAY is [45, 60, 30, 15]', () => {
    expect(PART_WAY).toEqual([45, 60, 30, 15]);
  });
  it('"Bend 1 to 45° first, finish it after this hit": committed as 45°, all ok, the same size as with 60°', () => {
    const { pending } = brakeStation({ model, session: down });
    expect(pending.collision.ways.partway).toMatchObject({
      label: 'Bend 1 to 45° first, finish it after this hit',
      angle: 45,
    });
    const made = (angle) => {
      const station = brakeStation({ model, session: { ...down, armed: { kind: 'partway', key: 'b1', angle } } });
      expect(passes(station.pending), `${angle}°`).toBe(true);
      let n = 0;
      return foldSheet(feature(startStroke({ station, token: 't', newId: () => `n${++n}` }).placed), rectangle(ZW, ZH));
    };
    const at45 = made(45);
    expect(sequenceChecks({ fold: at45, machine: MACHINE }).map((c) => c.label)).toEqual([
      'UP 45° R1.28',
      'DOWN 90° R1.28',
      'bend 1 on: 45° → 90°',
    ]);
    expect(rows(at45)).toEqual(['ok', 'ok', 'ok']);
    expect(size(at45)).toEqual(size(made(60)));
  });
});

describe('a stored row made with another punch (§6.3, §6.7 item 6)', () => {
  it('lip then inner, both straight: row 2 is stopped by the punch; "Make step 2 with the A 101 punch" passes both', () => {
    const bends = [line('lip', W - 15, H), line('inner', W - 30, H)];
    const fold = foldSheet(feature(bends), rectangle(W, H));
    expect(rows(fold)).toEqual(['ok', 'punch']);
    const tries = sequenceTries({ feature: feature(bends), profile: rectangle(W, H), machine: MACHINE });
    expect(Object.keys(tries)).toEqual(['inner']);
    expect(tries.inner.move).toBe(null);
    expect(tries.inner.partway).toBe(null);
    expect(tries.inner.punch.label).toBe('Make step 2 with the A 101 punch');
    expect(tries.inner.punch.bends.map((b) => [b.id, b.punch])).toEqual([
      ['lip', 'straight-88'],
      ['inner', 'a101'],
    ]);
    expect(rows(foldSheet(feature(tries.inner.punch.bends), rectangle(W, H)))).toEqual(['ok', 'ok']);
  });
  it('a row stopped by something else gets no punch button (the screenshot part, inner then lip: the ram)', () => {
    const bends = [line('inner', W - 29, H), line('lip', W - 11, H)];
    const tries = sequenceTries({ feature: feature(bends), profile: rectangle(W, H), machine: MACHINE });
    expect(tries.lip.move.label).toBe('Move step 2 before step 1');
    expect(tries.lip.punch).toBe(null);
  });
});

// Try 3's cost bounded (the follow-up to SP-2's audit, §6.8): one place only — the latest where this
// hit itself passes — and a candidate punch checked on the refused step alone before any armed
// station run. Counted, not timed: lip 20 / web 10 with 4 creases of 10° made before the lip (5 steps
// made, the inner bend at L 30 pending; nothing clears).
describe('try 3 is bounded (§6.2, §6.8)', () => {
  const creased = [
    ...Array.from({ length: 4 }, (_, i) => line(`c${i}`, 60 + 60 * i, H, { angle: 10 })),
    line('lip', W - 20, H),
  ];
  const model = modelOf(creased, W, H);
  const inner = session({ distance: 30 });
  const triesOf = (extra = {}) => {
    const facts = brakeStation({ model, session: inner, advise: false });
    return wayTries({
      model,
      session: inner,
      params: {},
      fold: facts.fold,
      machine: MACHINE,
      pending: facts.pending,
      today: sequenceChecks({ fold: facts.fold, machine: MACHINE }),
      feature: facts.feature,
      profile: facts.profile,
      ...extra,
    });
  };
  it('examines one place, and runs the station only for candidates whose step check passes', () => {
    const tries = triesOf();
    expect(tries.first).toBeUndefined();
    expect(tries.partway).toBeUndefined();
    expect(tries.compound).toBeUndefined();
    // Try 1 walked every place; try 3 looks at one.
    expect(tries.places).toBe(5);
    expect(tries.compoundPlaces).toBe(1);
    // Every other sharp punch of the rack was checked on the lip; none clears it, so no station run.
    expect(tries.stepChecks).toBe(9);
    expect(tries.punchRuns).toBeLessThanOrEqual(tries.stepPassed);
    expect(tries.punchRuns).toBe(0);
    // The card is the same: no button, NO_WAY.
    const { pending } = brakeStation({ model, session: inner });
    expect(pending.collision.ways).toBeUndefined();
    expect(pending.collision.hit.message.endsWith(` ${NO_WAY}`)).toBe(true);
  });
  it('is the last resort: with another remedy on the card it is not tried', () => {
    const tries = triesOf({ offered: true });
    expect(tries).toMatchObject({ compoundPlaces: 0, stepChecks: 0, punchRuns: 0 });
  });
  it('the compound case passes its step check first, then one armed run', () => {
    const one = modelOf([line('inner', W - 30, H)], W, H);
    const lip = session({ distance: 15 });
    const facts = brakeStation({ model: one, session: lip, advise: false });
    const tries = wayTries({
      model: one,
      session: lip,
      params: {},
      fold: facts.fold,
      machine: MACHINE,
      pending: facts.pending,
      today: sequenceChecks({ fold: facts.fold, machine: MACHINE }),
      feature: facts.feature,
      profile: facts.profile,
    });
    expect(tries.compound.label).toBe('Make this hit before bend 1, and bend 1 with the A 101 punch');
    expect(tries).toMatchObject({ compoundPlaces: 1, stepChecks: 1, stepPassed: 1, punchRuns: 1 });
  });
});

// §6.5: the card's punch tries on brakeCollisions first. A spy on brakeCollisions (fresh
// modules per test) tells the quick check (a punch key with the station's gauge point and
// way round) from the station run's own check (the punch entry the station resolved).
const loadSpied = async (patchCatalog = null) => {
  vi.resetModules();
  const calls = [];
  vi.doMock('./brakeCollisions.js', async (importOriginal) => {
    const mod = await importOriginal();
    return {
      ...mod,
      brakeCollisions: (options) => {
        calls.push(options);
        return mod.brakeCollisions(options);
      },
    };
  });
  if (patchCatalog) vi.doMock('./shopCatalog.js', async (importOriginal) => patchCatalog(await importOriginal()));
  const station = await import('./brakeStation.js');
  vi.doUnmock('./brakeCollisions.js');
  vi.doUnmock('./shopCatalog.js');
  const quick = (key) => calls.filter((o) => o.punch === key && 'gaugePoint' in o && 'reverse' in o).length;
  const full = (key) => calls.filter((o) => typeof o.punch === 'object' && o.punch?.key === key).length;
  return { ...station, quick, full };
};

describe('a quicker card (§6.5, §6.7 item 7)', () => {
  const nothing = () => modelOf([line('inner', W - 30, H)], W, H);
  it('a candidate that forms the same radius is checked on brakeCollisions and, hit there, never run', async () => {
    const spied = await loadSpied();
    const { pending } = spied.brakeStation({ model: nothing(), session: session({ distance: 20 }) });
    expect(pending.collision.hit.message.endsWith(` ${spied.NO_WAY}`)).toBe(true);
    for (const key of ['a101', 'a102', 'a103', 'a108', 'gooseneck-88', 'straight-88-tall']) {
      expect(spied.quick(key), key).toBeGreaterThan(0);
      // Every punch meets the part on this pending hit: no station run made it with that punch.
      expect(spied.full(key), key).toBe(0);
    }
  });
  it('is skipped for a punch that forms another radius: the station run decides', async () => {
    // The A 102 with a 2 mm nose (more than the 1.28 mm the V8 die forms): another inside radius, another fold.
    const spied = await loadSpied((mod) => {
      const a102 = Object.freeze({ ...mod.PUNCHES.a102, radius: 2 });
      return {
        ...mod,
        PUNCHES: Object.freeze({ ...mod.PUNCHES, a102 }),
        punchOf: (key) => (key === 'a102' ? a102 : mod.punchOf(key)),
      };
    });
    spied.brakeStation({ model: nothing(), session: session({ distance: 20 }) });
    expect(spied.quick('a102')).toBe(0);
    expect(spied.full('a102')).toBeGreaterThan(0);
    // The others keep the shortcut.
    expect(spied.quick('a101')).toBeGreaterThan(0);
    expect(spied.full('a101')).toBe(0);
  });
});
