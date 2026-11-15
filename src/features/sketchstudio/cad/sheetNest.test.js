// SN-1 (docs/sketch-studio-outline-edit-sheet-nest.md §4): the shared stock
// sheet (sheetNest: every blank of one stock and thickness, first fit on
// shelves, one part alone exactly as before), the station as a job of blanks
// from several parts, and where new blanks land in the view.
import { describe, expect, it } from 'vitest';
import { emptyModel } from './model.js';
import { laserSheetOf } from './shopCatalog.js';
import { laserStation, nestBlanks, sheetNest } from './laserStation.js';
import { LANDING_GAP, copyPositions, landingPositions, landingRows } from './shopParts.js';

const close = (value, expected, digits = 6) => expect(value).toBeCloseTo(expected, digits);
const rect = (width, height, holes = []) => ({ type: 'rectangle', width, height, origin: [0, 0], holes });
const SHEET = laserSheetOf('1219x2438');
/**
 * A model of flat sheet-metal parts: [{ id, w, h, copies = 1, stock = 'spcc',
 * t = 1.5, holes = [] }], instances in the order given (each part's copies together
 * unless `order` names the instance order).
 */
function shopModel(parts, order = null) {
  const instances = parts.flatMap((p) =>
    Array.from({ length: p.copies ?? 1 }, (_, k) => ({ id: `${p.id}${k + 1}`, partId: p.id, name: '' })),
  );
  return {
    ...emptyModel(),
    sketches: parts.map((p) => ({ id: `s-${p.id}`, name: p.id, plane: 'XY', profile: rect(p.w, p.h, p.holes || []) })),
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
          bends: [],
        },
      ],
    })),
    instances: order ? order.map((id) => instances.find((i) => i.id === id)) : instances,
  };
}
const nestOf = (model, extra = {}) => sheetNest(model, { stock: 'spcc', thickness: 1.5, ...extra });
const offsets = (nest) => nest.sheets.flatMap((s) => s.blanks.map((b) => [s.index, b.instanceId, b.offset]));

describe('sheetNest (§4.1)', () => {
  it('places one part alone exactly as nestBlanks did: the same offsets and Sheet use', () => {
    for (const [w, h, n] of [
      [100, 60, 30],
      [300, 200, 1],
      [300, 200, 3],
      [517.3, 211.9, 40],
      [1000, 1000, 3],
    ]) {
      const model = shopModel([{ id: 'a', w, h, copies: n }]);
      const nest = nestOf(model);
      const old = nestBlanks({
        bounds: [
          [0, 0],
          [w, h],
        ],
        area: w * h,
        quantity: n,
        sheet: SHEET,
      });
      expect(nest.sheets).toHaveLength(old.sheets);
      expect(nest.sheets.flatMap((s) => s.blanks.map((b) => [s.index + 1, b.offset]))).toEqual(
        old.copies.map((c) => [c.sheet, c.offset]),
      );
      close(nest.use, old.use, 12);
      expect(nest.oversize).toEqual([]);
    }
    // The numbers the SM-4 test pins: 23 to a row, the 24th 60 + 3 up.
    const nest = nestOf(shopModel([{ id: 'a', w: 100, h: 60, copies: 30 }]));
    expect(nest.sheets[0].blanks[1].offset).toEqual([113, 10]);
    expect(nest.sheets[0].blanks[23].offset).toEqual([10, 73]);
    // A 300 × 200 blank on 1219 × 2438 reads "Sheet use 2%" (shop floor §2.2).
    expect(Number((nestOf(shopModel([{ id: 'a', w: 300, h: 200 }])).use * 100).toFixed(1))).toBe(2);
  });

  it('packs mixed sizes first fit on shelves: a taller blank grows the last shelf, a small one goes back to the first', () => {
    const model = shopModel([
      { id: 'A', w: 1000, h: 500 },
      { id: 'B', w: 300, h: 200, copies: 3 },
      { id: 'C', w: 200, h: 600 },
      { id: 'D', w: 400, h: 100 },
      { id: 'E', w: 250, h: 80 },
    ]);
    const nest = nestOf(model);
    // Usable 2438 − 20 + 3 = 2421 wide: shelf 1 holds A, B × 3, C (603 tall, it grows the shelf);
    // D (403 wide) passes 2421 there, so it opens shelf 2 at 603; E (253) still fits shelf 1.
    expect(offsets(nest)).toEqual([
      [0, 'A1', [10, 10]],
      [0, 'B1', [1013, 10]],
      [0, 'B2', [1316, 10]],
      [0, 'B3', [1619, 10]],
      [0, 'C1', [1922, 10]],
      [0, 'D1', [10, 613]],
      [0, 'E1', [2125, 10]],
    ]);
    const area = 1000 * 500 + 3 * 300 * 200 + 200 * 600 + 400 * 100 + 250 * 80;
    close(nest.use, area / (2438 * 1219));
    expect(nest.sheets[0].blanks.find((b) => b.instanceId === 'C1')).toMatchObject({
      partId: 'C',
      width: 200,
      height: 600,
      area: 120000,
    });
  });

  it('starts a second sheet when the first is full, leaves out a blank larger than the sheet, and keeps to its stock', () => {
    const model = shopModel([
      { id: 'big', w: 1000, h: 1000, copies: 3 },
      { id: 'huge', w: 2500, h: 100 },
      { id: 'steel2', w: 100, h: 100, t: 2 },
      { id: 'inox', w: 100, h: 100, stock: 'sus304' },
    ]);
    const nest = nestOf(model);
    // Two 1003 wide to a row; a second shelf (1003 + 1003 > 1202) does not fit: sheet 2.
    expect(offsets(nest)).toEqual([
      [0, 'big1', [10, 10]],
      [0, 'big2', [1013, 10]],
      [1, 'big3', [10, 10]],
    ]);
    expect(nest.oversize).toEqual(['huge1']);
    close(nest.use, 3e6 / (2 * 2438 * 1219));
    // Each stock and thickness is its own sheet.
    expect(offsets(sheetNest(model, { stock: 'spcc', thickness: 2 }))).toEqual([[0, 'steel21', [10, 10]]]);
    expect(offsets(sheetNest(model, { stock: 'sus304', thickness: 1.5 }))).toEqual([[0, 'inox1', [10, 10]]]);
    // Within 1e-6 mm is the same thickness; a larger sheet holds the huge blank.
    expect(nestOf(model, { thickness: 1.5 + 5e-7 }).sheets[0].blanks).toHaveLength(2);
    expect(nestOf(model, { sheetKey: '1500x3000' }).oversize).toEqual([]);
    // An empty sheet: no blank, no sheet.
    expect(nestOf(emptyModel())).toMatchObject({ sheets: [], use: 0, oversize: [] });
  });

  it('nests 100 instances of 10 parts in a few milliseconds', () => {
    const model = shopModel(
      Array.from({ length: 10 }, (_, k) => ({
        id: `p${k}`,
        w: 80 + 37 * k,
        h: 50 + 23 * ((k * 3) % 7),
        copies: 10,
        holes: [{ type: 'circle', center: [20, 20], radius: 5 }],
      })),
    );
    nestOf(model);
    const runs = 20;
    const t0 = performance.now();
    let nest;
    for (let i = 0; i < runs; i++) nest = nestOf(model);
    const ms = (performance.now() - t0) / runs;
    expect(nest.sheets.reduce((n, s) => n + s.blanks.length, 0)).toBe(100);
    // Measured 2026-11-15 (node, this machine): see §4.9. The ceiling is generous for a loaded CI.
    expect(ms).toBeLessThan(50);
  });
});

describe('the station is a job of blanks (§4.2)', () => {
  // A (lead, 1), B × 2, C with a 0.6 mm hole (refused at 1.5 mm), D not in the job; one sheet.
  const parts = [
    { id: 'A', w: 300, h: 200 },
    { id: 'B', w: 200, h: 100, copies: 2, holes: [{ type: 'circle', center: [50, 50], radius: 10 }] },
    { id: 'C', w: 150, h: 150, holes: [{ type: 'circle', center: [75, 75], radius: 0.3 }] },
    { id: 'D', w: 120, h: 80 },
  ];
  const model = shopModel(parts);
  const batch = { instanceId: 'A1', instanceIds: ['A1', 'B1', 'B2', 'C1'] };

  it('lists the job, its parts with their copies and numbers, and every part’s checks', () => {
    const station = laserStation({ model, session: batch });
    expect(station.job).toEqual(['A1', 'B1', 'B2', 'C1']);
    expect(station.parts.map((r) => [r.partId, r.instanceId, r.name, r.copies, r.lead])).toEqual([
      ['A', 'A1', 'A', 1, true],
      ['B', 'B1', 'B', 2, false],
      ['C', 'C1', 'C', 1, false],
    ]);
    expect(station.parts[1].numbers).toMatchObject({ quantity: 2, pierces: 2 });
    // The lead part's instances in the model; its row's numbers; the job's time.
    expect(station.quantity).toBe(1);
    expect(station.numbers).toBe(station.parts[0].numbers);
    close(
      station.time,
      station.parts.reduce((sum, r) => sum + r.numbers.time, 0),
    );
    // C's cut-out is refused, led by its name; the lead's own checks stay the readouts'.
    expect(station.refusals).toEqual([
      expect.objectContaining({
        code: 'tiny-hole',
        partId: 'C',
        message: expect.stringMatching(/^C: Cut-out 1 is 0\.6 mm across/),
      }),
    ]);
    expect(station.checks.refusals).toEqual([]);
  });

  it('puts the job’s blanks on the shown sheet in nest order, the others beside them, and times the plan per blank', () => {
    const station = laserStation({ model, session: batch });
    expect(station.blanks.map((b) => [b.copy, b.instanceId, b.partId, b.name, b.lead])).toEqual([
      [1, 'A1', 'A', 'A', true],
      [2, 'B1', 'B', 'B', false],
      [3, 'B2', 'B', 'B', false],
      [4, 'C1', 'C', 'C', false],
    ]);
    const nested = station.nest.sheets[0].blanks;
    for (const b of station.blanks) expect(b.offset).toEqual(nested.find((n) => n.instanceId === b.instanceId).offset);
    // Each blank's contours (cut-outs first, the outline last) moved by its offset.
    expect(station.plan.map((c) => [c.copy, c.kind])).toEqual([
      [1, 'outline'],
      [2, 'hole'],
      [2, 'outline'],
      [3, 'hole'],
      [3, 'outline'],
      [4, 'hole'],
      [4, 'outline'],
    ]);
    const b2 = station.plan.find((c) => c.instanceId === 'B2' && c.kind === 'outline');
    const offset = station.blanks[2].offset;
    expect(b2.ring.every(([x, y]) => x >= offset[0] - 1e-9 && y >= offset[1] - 1e-9)).toBe(true);
    // The clock ends on the job's time: every blank of it is on this sheet.
    close(station.timeline.total, station.time, 9);
    // D lies beside them, cut (it exists as a part); in a replay that has not cut it yet, a programmed path.
    expect(station.others.map((o) => [o.instanceId, o.name, o.cut, o.rings.length])).toEqual([['D1', 'D', true, 1]]);
    expect(laserStation({ model, session: { ...batch, cutIds: [] } }).others[0].cut).toBe(false);
    expect(station.elsewhere).toEqual([]);
    close(station.shownUse, (300 * 200 + 2 * (200 * 100 - Math.PI * 100) + 150 * 150 + 120 * 80) / (2438 * 1219), 3);
  });

  it('without a named job cuts every copy of the lead’s part; a row of This cut makes another part the lead', () => {
    const own = laserStation({ model, session: { instanceId: 'B2' } });
    expect(own.job).toEqual(['B1', 'B2']);
    expect(own.parts).toHaveLength(1);
    expect(own.quantity).toBe(2);
    expect(own.blanks.map((b) => b.instanceId)).toEqual(['B1', 'B2']);
    expect(own.others.map((o) => o.instanceId)).toEqual(['A1', 'C1', 'D1']);
    // The same batch led by B: the job and the sheet are the same, B's fields lead.
    const led = laserStation({ model, session: { ...batch, instanceId: 'B1' } });
    expect(led.job).toEqual(['A1', 'B1', 'B2', 'C1']);
    expect(led.parts.find((r) => r.lead).partId).toBe('B');
    expect([led.quantity, led.numbers.quantity, led.part.id]).toEqual([2, 2, 'B']);
    expect(led.blanks.filter((b) => b.lead).map((b) => b.instanceId)).toEqual(['B1', 'B2']);
    // Ids that are gone, or of another thickness, stay out of the job.
    const mixed = shopModel([...parts, { id: 'T', w: 50, h: 50, t: 2 }]);
    expect(
      laserStation({ model: mixed, session: { instanceId: 'A1', instanceIds: ['A1', 'T1', 'gone'] } }).job,
    ).toEqual(['A1']);
  });

  it('shows the sheet asked for, says where the rest of the job is, and draws no head on a sheet without it', () => {
    const big = shopModel([
      { id: 'P', w: 1000, h: 1000, copies: 3 },
      { id: 'Q', w: 100, h: 100 },
    ]);
    // Sheet 1 holds P1, P2 and Q1 (it fits beside them); P3 is on sheet 2.
    const station = laserStation({ model: big, session: { instanceId: 'P1' } });
    expect(station.sheetIndex).toBe(0);
    expect(station.blanks.map((b) => b.instanceId)).toEqual(['P1', 'P2']);
    expect(station.elsewhere).toEqual([{ index: 1, count: 1 }]);
    const second = laserStation({ model: big, session: { instanceId: 'P1', sheetIndex: 1 } });
    expect(second.blanks.map((b) => [b.copy, b.instanceId])).toEqual([[1, 'P3']]);
    expect(second.elsewhere).toEqual([{ index: 0, count: 2 }]);
    // Q's sheet holds none of its own copies on sheet 2: no blank, no plan, no clock.
    const none = laserStation({ model: big, session: { instanceId: 'Q1', sheetIndex: 1 } });
    expect([none.blanks.length, none.plan.length, none.timeline.total]).toEqual([0, 0, 0]);
    expect(none.others.map((o) => o.instanceId)).toEqual(['P3']);
    // An index past the nest follows the lead.
    expect(laserStation({ model: big, session: { instanceId: 'P3', sheetIndex: 7 } }).sheetIndex).toBe(1);
  });

  it('draws a lead larger than the sheet where it would start, with its refusal', () => {
    const huge = shopModel([
      { id: 'H', w: 2500, h: 100 },
      { id: 'S', w: 100, h: 100 },
    ]);
    const station = laserStation({ model: huge, session: { instanceId: 'H1' } });
    expect(station.nest.oversize).toEqual(['H1']);
    expect(station.blanks.map((b) => [b.instanceId, b.offset])).toEqual([['H1', [0, 0]]]);
    expect(station.refusals.map((r) => r.code)).toEqual(['sheet']);
  });
});

describe('where new blanks land (§4.8)', () => {
  const box = (w, h, x0 = 0, y0 = 0) => [
    [x0, y0],
    [x0 + w, y0 + h],
  ];
  const placedBox = ([[x0, y0], [x1, y1]], [px, py]) => [
    [x0 + px, y0 + py],
    [x1 + px, y1 + py],
  ];
  const apart = (boxes) => {
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, b] = [boxes[i], boxes[j]];
        const gapX = Math.max(b[0][0] - a[1][0], a[0][0] - b[1][0]),
          gapY = Math.max(b[0][1] - a[1][1], a[0][1] - b[1][1]);
        if (Math.max(gapX, gapY) < LANDING_GAP - 1e-6) return false;
      }
    return true;
  };

  it('lands one blank with its centre on the drop point, exactly as a single cut always has', () => {
    const blank = box(120, 80, 7.25, -3.5);
    const at = [413.7, -219.3];
    expect(landingPositions([blank], at)).toEqual([[at[0] - (7.25 + 127.25) / 2, at[1] - (-3.5 + 76.5) / 2, 0]]);
  });

  it('lays a lot out in rows 20 mm apart, a new row past 2400 mm, the lot centred on the drop point', () => {
    const sizes = [
      [1000, 400],
      [900, 300],
      [700, 500],
      [300, 200],
    ];
    const { slots, size } = landingRows(sizes);
    // 1000 + 20 + 900 = 1920; + 20 + 700 = 2640 > 2400: the third starts row 2, 20 clear of the 400 deep row.
    expect(slots).toEqual([
      [0, 0],
      [1020, 0],
      [0, 420],
      [720, 420],
    ]);
    expect(size).toEqual([1920, 920]);
    const boxes = sizes.map(([w, h], i) => box(w, h, i * 3, -i));
    const positions = landingPositions(boxes, [100, 50]);
    const placed = boxes.map((b, i) => placedBox(b, positions[i]));
    expect(apart(placed)).toBe(true);
    const xs = placed.flatMap((b) => [b[0][0], b[1][0]]),
      ys = placed.flatMap((b) => [b[0][1], b[1][1]]);
    close((Math.min(...xs) + Math.max(...xs)) / 2, 100);
    close((Math.min(...ys) + Math.max(...ys)) / 2, 50);
    expect(positions.every((p) => p[2] === 0)).toBe(true);
  });

  it('sets Quantity’s copies beside the instance in the same rows, clear of what stands and of each other', () => {
    const at = [500, 200, 0];
    const own = box(300, 200, 500, 200);
    // Something already stands where the second copy would go.
    const other = box(100, 100, 1200, 250);
    const copies = copyPositions({ position: at, box: own, count: 9, taken: [own, other] });
    expect(copies).toHaveLength(9);
    // The first beside it along +X, 20 mm clear.
    expect(copies[0]).toEqual([820, 200, 0]);
    expect(copies.some((p) => p[0] === 1140 && p[1] === 200)).toBe(false);
    const boxes = [own, ...copies.map((p) => placedBox(box(300, 200), p))];
    expect(apart(boxes)).toBe(true);
    for (const b of boxes.slice(1))
      expect(b[0][0] < other[1][0] && other[0][0] < b[1][0] && b[0][1] < other[1][1] && other[0][1] < b[1][1]).toBe(
        false,
      );
    // Rows of seven (7 × 320 − 20 = 2220 ≤ 2400; an eighth would pass): slots 1 – 6 on the instance's
    // row, one of them taken, so five copies there and the rest 20 mm up on the next row.
    expect(copies.filter((p) => p[1] === 200)).toHaveLength(5);
    expect(copies.filter((p) => p[1] === 420).length).toBeGreaterThan(0);
  });
});
