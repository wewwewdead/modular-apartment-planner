// BQ-1 (docs/sketch-studio-outline-edit-sheet-nest.md §7): the press brake's
// queue (one row per part, job-board order, its four states), the tooling it
// carries from part to part, Sheets to buy on the job sheet, and the SN-1
// follow-ups — a new cut never lands on a part, the replay's titles for parts
// named after their outlines.
import { describe, expect, it } from 'vitest';
import { emptyModel } from './model.js';
import { bendQueue } from './shopRoute.js';
import { brakeCarry, brakeSessionDefaults } from './brakeStation.js';
import { jobSheet, jobSheetCsv, stockSheets } from './jobSheet.js';
import { laserStation, sheetNest } from './laserStation.js';
import { LANDING_GAP, landingPositions } from './shopParts.js';
import { filmScenes } from './shopFilm.js';

const rect = (width, height) => ({ type: 'rectangle', width, height, origin: [0, 0] });
const flange = (x, height) => ({ id: `b-${x}`, a: [x, -1], b: [x, height + 1], angle: 90, direction: 'up' });
/**
 * Sheet-metal parts [{ id, name, w, h, copies = 1, t = 1.5, stock, bends,
 * broken }] (a `broken` blank does not fold: a bend line off it), instances
 * in the order given or `order`; `groups`: [{ id, name, members }].
 */
function model(parts, { order = null, groups = [], finishes = [], prints = [] } = {}) {
  const instances = parts.flatMap((p) =>
    Array.from({ length: p.copies ?? 1 }, (_, k) => ({
      id: `${p.id}${k + 1}`,
      partId: p.id,
      name: '',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      visible: true,
      ...(groups.find((g) => g.members.includes(`${p.id}${k + 1}`))
        ? { groupId: groups.find((g) => g.members.includes(`${p.id}${k + 1}`)).id }
        : {}),
    })),
  );
  return {
    ...emptyModel(),
    sketches: parts.map((p) => ({ id: `s-${p.id}`, name: p.id, plane: 'XY', profile: rect(p.w, p.h) })),
    parts: parts.map((p) => ({
      id: p.id,
      name: p.name || p.id,
      features: [
        {
          id: `f-${p.id}`,
          type: 'sheetmetal',
          sketchId: `s-${p.id}`,
          thickness: p.t ?? 1.5,
          stock: p.stock || 'spcc',
          bends: p.broken
            ? [{ id: 'off', a: [p.w + 50, -1], b: [p.w + 50, p.h + 1], angle: 90, direction: 'up' }]
            : p.bends || [],
        },
      ],
    })),
    instances: order ? order.map((id) => instances.find((i) => i.id === id)) : instances,
    groups: groups.map(({ id, name }) => ({ id, name, parentId: null })),
    finishes,
    prints,
  };
}

describe('bendQueue (§7.1)', () => {
  it('is one row per part, at its first instance in job-board order, with its copies', () => {
    const m = model(
      [
        { id: 'a', name: 'Tray', w: 300, h: 200 },
        { id: 'b', name: 'Lid', w: 200, h: 100, copies: 2 },
        { id: 'c', name: 'Bracket', w: 150, h: 150 },
      ],
      // The lid's second copy stands first in the model; the job board (the tree) still leads with b1's product.
      { order: ['b2', 'a1', 'b1', 'c1'] },
    );
    const rows = bendQueue(m);
    expect(rows.map((r) => [r.partId, r.instanceId, r.name, r.copies])).toEqual([
      ['b', 'b2', 'Lid', 2],
      ['a', 'a1', 'Tray', 1],
      ['c', 'c1', 'Bracket', 1],
    ]);
    expect(rows.every((r) => r.profile?.type === 'rectangle')).toBe(true);
  });

  it('follows the products: a group’s parts together, in the group’s order', () => {
    const m = model(
      [
        { id: 'a', name: 'Tray', w: 300, h: 200 },
        { id: 'b', name: 'Lid', w: 200, h: 100 },
        { id: 'c', name: 'Bracket', w: 150, h: 150 },
      ],
      { order: ['a1', 'c1', 'b1'], groups: [{ id: 'g', name: 'Box', members: ['a1', 'b1'] }] },
    );
    expect(bendQueue(m).map((r) => r.partId)).toEqual(['a', 'b', 'c']);
  });

  it('says where each part stands: flat, bent, finished (painted or printed, any copy) or a blank that does not fold', () => {
    const m = model(
      [
        { id: 'flat', w: 300, h: 200 },
        { id: 'bent', w: 300, h: 200, bends: [flange(260, 200)] },
        { id: 'two', w: 300, h: 200, bends: [flange(260, 200), flange(40, 200)] },
        { id: 'paint', w: 300, h: 200, copies: 2, bends: [flange(260, 200)] },
        { id: 'print', w: 300, h: 200, bends: [flange(260, 200)] },
        { id: 'both', w: 300, h: 200 },
        { id: 'broken', w: 300, h: 200, broken: true },
      ],
      {
        finishes: [
          { id: 'f1', instanceId: 'paint2', kind: 'powder', name: 'RAL 9005' },
          { id: 'f2', instanceId: 'both1', kind: 'powder', name: 'RAL 9005' },
        ],
        prints: [
          { id: 'p1', instanceId: 'print1', kind: 'text', text: 'A' },
          { id: 'p2', instanceId: 'both1', kind: 'text', text: 'B' },
        ],
      },
    );
    expect(bendQueue(m).map((r) => [r.partId, r.state, r.text, r.bends])).toEqual([
      ['flat', 'flat', 'flat · no bends yet', 0],
      ['bent', 'bent', '1 bend', 1],
      ['two', 'bent', '2 bends', 2],
      // The second copy is painted: the part is (one definition).
      ['paint', 'finished', '1 bend · painted', 1],
      ['print', 'finished', '1 bend · printed', 1],
      ['both', 'finished', 'flat · painted and printed', 0],
      ['broken', 'problem', 'the blank does not fold', 0],
    ]);
  });

  it('leaves out parts that are not sheet metal, and is empty without any', () => {
    const m = model([{ id: 'a', w: 100, h: 60 }]);
    m.parts.push({ id: 'box', name: 'Board', features: [{ id: 'bx', type: 'box', width: 10, depth: 10, height: 10 }] });
    m.instances.push({ id: 'box1', partId: 'box', name: '', position: [0, 0, 0], rotation: [0, 0, 0] });
    expect(bendQueue(m).map((r) => r.partId)).toEqual(['a']);
    expect(bendQueue(emptyModel())).toEqual([]);
  });
});

describe('brakeCarry (§7.3)', () => {
  it('keeps the punch, the die and the punch’s way round — none of the picks', () => {
    const session = {
      ...brakeSessionDefaults(),
      stage: 'setup',
      key: 'k',
      instanceId: 'a1',
      punch: 'gooseneck-88',
      die: 'v16-88',
      reverse: true,
      edge: 2,
      distance: 47,
      points: [[1, 2]],
      angle: 120,
      flip: true,
      shape: 'round',
      radius: 30,
      steps: 10,
      skip: [1],
      turned: true,
      punchTrim: 5,
      dieTrim: 5,
      scrub: { bendId: 'b' },
      lastHit: { bendId: 'b' },
    };
    // The tools' lengths stay in the machine too (brake tool length §9.4, TL-2).
    expect(brakeCarry(session)).toEqual({
      punch: 'gooseneck-88',
      die: 'v16-88',
      reverse: true,
      punchTrim: 5,
      dieTrim: 5,
    });
    // The next part's session: the defaults, the tooling still in.
    const next = { ...brakeSessionDefaults(), ...brakeCarry(session) };
    expect(next).toEqual({
      ...brakeSessionDefaults(),
      punch: 'gooseneck-88',
      die: 'v16-88',
      reverse: true,
      punchTrim: 5,
      dieTrim: 5,
    });
    // An automatic die stays automatic; no session carries nothing.
    expect(brakeCarry({ ...brakeSessionDefaults(), die: null })).toEqual({
      punch: brakeSessionDefaults().punch,
      die: null,
      reverse: false,
    });
    expect(brakeCarry(null)).toBe(null);
  });
});

describe('Sheets to buy (§7.5)', () => {
  const m = model([
    { id: 'a', w: 300, h: 200, copies: 3 },
    { id: 'b', w: 500, h: 400 },
    { id: 'c', w: 200, h: 100, t: 2 },
    { id: 'd', w: 120, h: 80, stock: 'a5052' },
  ]);
  it('is one row per stock and thickness, nested as the laser nests it', () => {
    const rows = stockSheets(m);
    expect(rows.map((r) => [r.stock, r.thickness, r.blanks, r.sheets, r.sheet])).toEqual([
      ['spcc', 1.5, 4, 1, '1219 × 2438 mm'],
      ['spcc', 2, 1, 1, '1219 × 2438 mm'],
      ['a5052', 1.5, 1, 1, '1219 × 2438 mm'],
    ]);
    for (const row of rows) {
      const nest = sheetNest(m, { stock: row.stock, thickness: row.thickness });
      expect(row.use).toBe(nest.use);
    }
    // The laser station's Sheet use on the 1.5 SPCC blanks reads the same nest.
    const station = laserStation({ model: m, session: { instanceId: 'a1' } });
    expect(station.nest.use).toBe(rows[0].use);
    expect(station.nest.sheets.length).toBe(rows[0].sheets);
    expect(rows[0].use).toBeCloseTo((3 * 300 * 200 + 500 * 400) / (1219 * 2438), 9);
  });
  it('nests the batch’s blanks: every instance made batch times', () => {
    const rows = stockSheets(m, { batch: 20 });
    expect(rows[0].blanks).toBe(80);
    expect(rows[0].sheets).toBeGreaterThan(1);
  });
  it('rides on the job sheet and its CSV without changing the products', () => {
    const sheet = jobSheet(m, null);
    expect(sheet.stockSheets).toEqual(stockSheets(m));
    const csv = jobSheetCsv(sheet).split(/\r?\n/);
    const rows = csv.filter((line) => line.includes('Sheet stock'));
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatch(
      /^"Sheets to buy","Sheet stock","","t 1\.5 SPCC · 1219 × 2438 mm","4 blanks · 12\.8% sheet use","1","",""$/,
    );
    const withoutSheets = jobSheetCsv({ ...sheet, stockSheets: [] }).split(/\r?\n/);
    expect(csv.slice(0, withoutSheets.length)).toEqual(withoutSheets);
  });
});

describe('a new cut never lands on a part (§7.7)', () => {
  const box = (w, h) => [
    [0, 0],
    [w, h],
  ];
  const at = [100, 50];
  const overlap = (a, b) => a[0][0] < b[1][0] && b[0][0] < a[1][0] && a[0][1] < b[1][1] && b[0][1] < a[1][1];
  const placed = (boxes, positions) =>
    boxes.map(([[x0, y0], [x1, y1]], i) => [
      [x0 + positions[i][0], y0 + positions[i][1]],
      [x1 + positions[i][0], y1 + positions[i][1]],
    ]);
  it('gives exactly today’s position on an empty view or a clear drop point', () => {
    const one = [box(300, 200)];
    expect(landingPositions(one, at, { taken: [] })).toEqual(landingPositions(one, at));
    const far = [
      [
        [5000, 5000],
        [5100, 5100],
      ],
    ];
    expect(landingPositions(one, at, { taken: far })).toEqual(landingPositions(one, at));
    const lot = [box(300, 200), box(200, 100), box(150, 150)];
    expect(landingPositions(lot, at, { taken: far })).toEqual(landingPositions(lot, at));
  });
  it('moves a second single cut along +X clear of the first, in its own slots', () => {
    const first = placed([box(300, 200)], landingPositions([box(300, 200)], at));
    const second = [box(500, 400)];
    const positions = landingPositions(second, at, { taken: first });
    const centred = landingPositions(second, at);
    // Moved along +X only, by whole slots (its width + the gap), and clear.
    expect(positions[0][1]).toBe(centred[0][1]);
    expect((positions[0][0] - centred[0][0]) % (500 + LANDING_GAP)).toBeCloseTo(0, 9);
    expect(positions[0][0]).toBeGreaterThan(centred[0][0]);
    expect(overlap(placed(second, positions)[0], first[0])).toBe(false);
  });
  it('moves a whole batch together, every blank clear of every part standing', () => {
    const standing = [
      [
        [-400, -300],
        [600, 400],
      ],
      [
        [700, -100],
        [900, 100],
      ],
    ];
    const lot = [box(300, 200), box(200, 100), box(200, 100), box(150, 150)];
    const centred = landingPositions(lot, at);
    const positions = landingPositions(lot, at, { taken: standing });
    const dx = positions[0][0] - centred[0][0],
      dy = positions[0][1] - centred[0][1];
    positions.forEach((p, i) => expect([p[0] - centred[i][0], p[1] - centred[i][1]]).toEqual([dx, dy]));
    for (const b of placed(lot, positions)) for (const s of standing) expect(overlap(b, s)).toBe(false);
  });
});

describe('the replay’s titles for parts named after their outlines (§7.7)', () => {
  it('uses a label whole: "Cut 2 blanks of Sketch 1 · 2"', () => {
    const m = model([
      { id: 'a', name: 'Sketch 1', w: 300, h: 200 },
      { id: 'b', name: 'Sketch 1 · 2', w: 200, h: 100, copies: 2 },
      { id: 'c', name: 'Sketch 2', w: 150, h: 150, bends: [flange(110, 150)] },
    ]);
    m.groups = [{ id: 'g', name: 'Batch', parentId: null }];
    m.instances = m.instances.map((i) => ({ ...i, groupId: 'g' }));
    const scenes = filmScenes(m, 'g');
    expect(scenes.filter((s) => s.station === 'cut').map((s) => [s.title, s.subject])).toEqual([
      ['Cut the Sketch 1 blank', 'Sketch 1'],
      ['Cut 2 blanks of Sketch 1 · 2', 'Sketch 1 · 2 · 2 off'],
      ['Cut the Sketch 2 blank', 'Sketch 2'],
    ]);
    expect(scenes.find((s) => s.station === 'bend').subject).toBe('Sketch 2 · hit 1 of 1');
  });
  it('reads copies under one plain name as a sentence, without splitting it', () => {
    const m = model([{ id: 'a', name: 'Side panel', w: 300, h: 200, copies: 2 }]);
    m.groups = [{ id: 'g', name: 'Batch', parentId: null }];
    m.instances = m.instances.map((i) => ({ ...i, groupId: 'g' }));
    const cut = filmScenes(m, 'g').find((s) => s.station === 'cut');
    expect([cut.title, cut.subject]).toEqual(['Cut two side panel blanks', 'side panel · 2 off']);
  });
});
