// The laser station (docs/sketch-studio-fab-shop.md §9 SM-4, §8.5): speeds,
// pierce and kerf by hand, the cut order (cut-outs first, the outline last),
// the machine clock, the checks with their remedies, nesting N copies with the
// shelf packer and Etch bend lines.
import { describe, expect, it } from 'vitest';
import { emptyModel } from './model.js';
import { foldSheet, profilePolygon } from './sheetMetal.js';
import {
  LASER_PART_GAP,
  LASER_SHEETS,
  LASER_SHEET_MARGIN,
  laserCutTime,
  laserFamily,
  laserKerf,
  laserSheetOf,
  laserSpeed,
  pierceTime,
} from './shopCatalog.js';
import {
  LASER_WATCH,
  animationScale,
  cutPlan,
  etchBendMarks,
  featureMarks,
  headAt,
  holeWidth,
  laserChecks,
  laserNumbers,
  laserStation,
  laserTimeline,
  narrowestWeb,
  nestBlanks,
  pointAlong,
  profileCircles,
} from './laserStation.js';

const close = (value, expected, digits = 6) => expect(value).toBeCloseTo(expected, digits);
const circle = (center, radius) => ({ type: 'circle', center, radius });
const rect = (width, height, holes = []) => ({ type: 'rectangle', width, height, origin: [0, 0], holes });

describe('laser numbers (§8.5)', () => {
  it('interpolates the 2 kW fiber speeds on thickness by stock family, clamped to 1 – 6 mm', () => {
    expect(laserFamily('spcc')).toBe('steel');
    expect(laserFamily('secc')).toBe('steel');
    expect(laserFamily('sus304')).toBe('stainless');
    expect(laserFamily('a5052')).toBe('aluminium');
    expect(laserFamily('a6061')).toBe('aluminium');
    close(laserSpeed('spcc', 1), 25);
    close(laserSpeed('spcc', 1.5), 15.25); // 25 + (5.5 − 25) / 2
    close(laserSpeed('spcc', 1.2), 21.1); // 25 − 19.5 × 0.2
    close(laserSpeed('spcc', 2.5), 4.75);
    close(laserSpeed('sus304', 4), 4.2); // 5.8 + (1 − 5.8) / 3
    close(laserSpeed('a5052', 1.5), 18.75);
    close(laserSpeed('a5052', 0.5), 26); // below the table: the 1 mm speed
    close(laserSpeed('a6061', 8), 0.75); // above: the 6 mm speed
  });

  it('times a pierce from 0.1 s at 1 mm to 1 s at 6 mm and picks the kerf by thickness', () => {
    close(pierceTime(1), 0.1);
    close(pierceTime(6), 1);
    close(pierceTime(3.5), 0.55);
    close(pierceTime(1.5), 0.19);
    close(pierceTime(0.6), 0.1);
    expect([laserKerf(1.5), laserKerf(2), laserKerf(2.5), laserKerf(3), laserKerf(4)]).toEqual([
      0.1, 0.1, 0.15, 0.15, 0.25,
    ]);
  });

  it('times a 100 × 60 blank with a Ø20 cut-out in 1.5 SPCC by hand', () => {
    // 2 pierces × 0.19 s + (320 + 20π) mm / (15.25 m/min = 254.1667 mm/s).
    const expected = 2 * 0.19 + (320 + 20 * Math.PI) / ((15.25 * 1000) / 60);
    close(laserCutTime({ cutLength: 320 + 20 * Math.PI, pierces: 2, stock: 'spcc', thickness: 1.5 }), expected);
    const numbers = laserNumbers({
      cutLength: 320 + 20 * Math.PI,
      pierces: 2,
      stock: 'spcc',
      thickness: 1.5,
      quantity: 3,
    });
    close(numbers.perBlank, 1.88622, 4);
    close(numbers.time, 3 * expected);
    expect(numbers.kerf).toBe(0.1);
    expect(numbers.beyond).toBe(false);
    expect(laserNumbers({ cutLength: 10, pierces: 1, stock: 'spcc', thickness: 8 }).beyond).toBe(true);
  });

  it('lists the stock sheets long side along X and refuses an unknown one', () => {
    expect(Object.keys(LASER_SHEETS)).toEqual(['1219x2438', '1250x2500', '1500x3000']);
    expect(laserSheetOf('1219x2438')).toMatchObject({ width: 2438, height: 1219 });
    expect(laserSheetOf()).toBe(LASER_SHEETS['1219x2438']);
    expect(() => laserSheetOf('600x600')).toThrow('Unknown stock sheet: 600x600');
    expect(LASER_PART_GAP).toBeGreaterThanOrEqual(0.25 + 2);
  });
});

describe('the cut path', () => {
  const polygon = profilePolygon(rect(100, 60, [circle([80, 30], 5), circle([20, 30], 5), circle([50, 15], 3)]));

  it('cuts every cut-out first, nearest next from the sheet corner, then the outline from the nearest corner', () => {
    const plan = cutPlan(polygon);
    expect(plan.map((c) => c.kind)).toEqual(['hole', 'hole', 'hole', 'outline']);
    // From (0, 0): the Ø10 at (20, 30), then the Ø6 at (50, 15), then the Ø10 at (80, 30).
    expect(plan.slice(0, -1).map((c) => c.index)).toEqual([1, 2, 0]);
    // Each contour starts (and ends) at its pierce point.
    for (const c of plan) expect(c.ring[0]).toEqual(c.pierce);
    // The outline is pierced at the corner nearest the last cut-out.
    expect(plan.at(-1).pierce).toEqual([100, 0]);
  });

  it('runs a machine clock that ends on the readout and walks the head round each contour', () => {
    const fold = foldSheet({ thickness: 1.5, stock: 'spcc', bends: [] }, rect(100, 60, [circle([50, 30], 10)]));
    const numbers = laserNumbers({ cutLength: fold.flat.cutLength, pierces: 2, stock: 'spcc', thickness: 1.5 });
    const plan = cutPlan(profilePolygon(rect(100, 60, [circle([50, 30], 10)])));
    const sampled = plan.reduce((sum, c) => sum + c.length, 0);
    const timeline = laserTimeline(plan, numbers, sampled);
    close(timeline.total, numbers.perBlank, 9);
    expect(headAt(timeline, 0)).toMatchObject({ phase: 'pierce', index: 0 });
    const s = timeline.segments[0];
    const half = headAt(timeline, (s.cutStart + s.end) / 2);
    expect(half.phase).toBe('cut');
    close(half.fraction, 0.5);
    // Halfway round the circle from its pierce point: diametrically opposite.
    const p = plan[0].pierce;
    close(Math.hypot(half.point[0] - (100 - p[0]), half.point[1] - (60 - p[1])), 0, 1);
    expect(headAt(timeline, timeline.segments[1].start + 0.01)).toMatchObject({ phase: 'pierce', index: 1 });
    expect(headAt(timeline, timeline.total + 1)).toMatchObject({ phase: 'done', index: 1 });
    expect(
      pointAlong(
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
        ],
        0.25,
      ),
    ).toEqual([10, 0]);
  });

  it('stretches a short cut to a watchable length and squeezes a long one, and says by how much', () => {
    expect(animationScale(2)).toEqual({ duration: LASER_WATCH.min, scale: 2 / LASER_WATCH.min });
    expect(animationScale(10)).toEqual({ duration: 10, scale: 1 });
    expect(animationScale(60)).toEqual({ duration: LASER_WATCH.max, scale: 60 / LASER_WATCH.max });
  });
});

describe('the checks (§8.5)', () => {
  const sheet = laserSheetOf('1219x2438');
  const check = (profile, t = 1.5, at = sheet) => {
    const polygon = profilePolygon(profile);
    const fold = foldSheet({ thickness: t, stock: 'spcc', bends: [] }, profile);
    return laserChecks({ polygon, thickness: t, sheet: at, flat: fold.flat, profile });
  };

  it('measures a cut-out by its smallest width and the narrowest web between cuts', () => {
    // A sampled circle is a hair narrower than it (chord error ≤ 0.05 mm a side) …
    const sampled = holeWidth(profilePolygon(rect(10, 10, [circle([5, 5], 2)])).holes[0]);
    expect(sampled).toBeGreaterThan(3.9);
    expect(sampled).toBeLessThan(4);
    // … so the checks measure circles from the profile: exactly 4.
    const blank = rect(10, 10, [circle([5, 5], 2)]);
    expect(
      laserChecks({
        polygon: profilePolygon(blank),
        thickness: 1,
        sheet,
        flat: { width: 10, height: 10 },
        profile: blank,
      }).holes,
    ).toEqual([{ index: 0, width: 4 }]);
    // A 10 × 2 slot turned 30°: 2 mm across, whatever its bounding box.
    const a = Math.PI / 6,
      turn = ([x, y]) => [50 + x * Math.cos(a) - y * Math.sin(a), 30 + x * Math.sin(a) + y * Math.cos(a)];
    const slot = {
      type: 'polygon',
      points: [
        [-5, -1],
        [5, -1],
        [5, 1],
        [-5, 1],
      ].map(turn),
    };
    close(holeWidth(profilePolygon(rect(100, 60, [slot])).holes[0]), 2);
    const twin = rect(100, 60, [circle([20, 30], 5), circle([31, 30], 5)]);
    const web = narrowestWeb(profilePolygon(twin), profileCircles(twin));
    close(web.distance, 1);
    expect(web.between).toEqual([0, 1]);
    expect(narrowestWeb(profilePolygon(rect(10, 10)))).toBeNull();
  });

  it('passes a plain blank', () => {
    const result = check(rect(100, 60, [circle([50, 30], 10)]));
    expect(result.refusals).toEqual([]);
    expect(result.warnings).toEqual([]);
    close(result.web.distance, 20);
  });

  it('warns on a hole under t, refuses one under 0.5 t, with the remedy', () => {
    const result = check(rect(100, 60, [circle([20, 30], 0.6), circle([60, 30], 0.3)]));
    expect(result.warnings.map((w) => w.code)).toEqual(['small-hole']);
    expect(result.warnings[0].message).toMatch(/^Cut-out 1 is 1\.2 mm across, under the sheet thickness \(1\.5 mm\)/);
    expect(result.warnings[0].message).toMatch(/drill it to size after cutting/);
    expect(result.refusals.map((r) => r.code)).toEqual(['tiny-hole']);
    expect(result.refusals[0].message).toMatch(/^Cut-out 2 is 0\.6 mm across: below 0\.5 t \(0\.75 mm\)/);
  });

  it('warns on a web below 0.5 t between cuts and to the edge', () => {
    const between = check(rect(100, 60, [circle([20, 30], 5), circle([30.5, 30], 5)]));
    expect(between.warnings.map((w) => w.code)).toEqual(['thin-web']);
    expect(between.warnings[0].message).toMatch(
      /^Cut-out 1 to cut-out 2: the web is 0\.5 mm, below 0\.5 t \(0\.75 mm\)/,
    );
    const edge = check(rect(100, 60, [circle([5.5, 30], 5)]));
    expect(edge.warnings[0].message).toMatch(/^Cut-out 1 to the outline: the web is 0\.5 mm/);
  });

  it('refuses a blank larger than the sheet and names a sheet that holds it', () => {
    const result = check(rect(2500, 100));
    expect(result.refusals.map((r) => r.code)).toEqual(['sheet']);
    expect(result.refusals[0].message).toBe(
      `The blank is 2500 × 100 mm; the 1219 × 2438 mm sheet holds 2418 × 1199 mm inside its ${LASER_SHEET_MARGIN} mm edge. Choose the 1500 × 3000 mm sheet.`,
    );
    expect(check(rect(3100, 100)).refusals[0].message).toMatch(/No sheet in the shop is large enough/);
  });
});

describe('nesting and marks', () => {
  it('nests 30 copies of 100 × 60 with the shelf packer: 23 to a row, the gap between, the margin round', () => {
    const nest = nestBlanks({
      bounds: [
        [0, 0],
        [100, 60],
      ],
      area: 6000,
      quantity: 30,
      sheet: laserSheetOf('1219x2438'),
    });
    expect(nest.sheets).toBe(1);
    expect(nest.copies).toHaveLength(30);
    expect(nest.copies[0].offset).toEqual([10, 10]);
    expect(nest.copies[1].offset).toEqual([113, 10]);
    // (2438 − 2 × 10 + 3) / 103 = 23.5: the 24th starts the second row, 60 + 3 up.
    expect(nest.copies[22].offset).toEqual([10 + 22 * 103, 10]);
    expect(nest.copies[23].offset).toEqual([10, 73]);
    close(nest.use, (30 * 6000) / (2438 * 1219));
  });

  it('etches the bends’ punch lines as marks on the blank, one per zone interval', () => {
    const fold = foldSheet(
      { thickness: 1.5, stock: 'spcc', bends: [{ id: 'b', a: [30, 0], b: [30, 40], angle: 90, direction: 'up' }] },
      rect(80, 40),
    );
    const marks = etchBendMarks(fold);
    expect(marks).toHaveLength(1);
    expect([marks[0].a, marks[0].b].map((p) => p[0])).toEqual([30, 30]);
    expect([marks[0].a[1], marks[0].b[1]].sort((x, y) => x - y)).toEqual([0, 40]);
    expect(marks[0].id).toMatch(/^mark-/);
    expect(featureMarks({ marks: [...marks, { id: 'bad', a: [1] }] })).toEqual(marks);
  });

  it('derives the station for a session: closed for a part that is not sheet metal', () => {
    const model = {
      ...emptyModel(),
      sketches: [{ id: 's', name: 'Blank', plane: 'XY', profile: rect(100, 60, [circle([50, 30], 10)]) }],
      parts: [
        {
          id: 'p',
          name: 'Blank',
          material: 'SPCC cold-rolled steel',
          features: [{ id: 'f', type: 'sheetmetal', sketchId: 's', thickness: 1.5, stock: 'spcc', bends: [] }],
        },
        { id: 'q', name: 'Board', features: [{ id: 'g', type: 'box', width: 10, depth: 10, height: 10 }] },
      ],
      instances: [
        { id: 'i', partId: 'p' },
        { id: 'j', partId: 'q' },
      ],
    };
    expect(laserStation({ model, session: { instanceId: 'j' } })).toEqual({ closed: true });
    // SN-1 §4.3: the quantity is the part's instances in the model (no longer the session's).
    const four = {
      ...model,
      instances: [...model.instances, ...[2, 3, 4].map((k) => ({ id: `i${k}`, partId: 'p' }))],
    };
    const station = laserStation({ model: four, session: { instanceId: 'i' } });
    expect(station.sheet.key).toBe('1219x2438');
    expect(station.quantity).toBe(4);
    expect(station.plan).toHaveLength(8);
    expect(station.plan.map((c) => c.copy)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
    close(station.timeline.total, 4 * station.numbers.perBlank, 9);
    expect(station.checks.refusals).toEqual([]);
    // An unknown sheet key in the model falls back to the default, and says so.
    const other = { ...model, fabrication: { ...model.fabrication, shop: { ...model.fabrication.shop, sheet: 'x' } } };
    expect(laserStation({ model: other, session: { instanceId: 'i' } })).toMatchObject({
      sheetKnown: false,
      sheetKey: 'x',
      quantity: 1,
    });
  });
});
