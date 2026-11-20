// What the real shop holds (docs/sketch-studio-corner-gaps.md §6, CG-4): the
// "± on the bench" band of a gap row from three tolerances (flange, cut,
// angle), worked out by hand below for one wall row and one mitre row of the
// user's tray, a model's own tolerances over the catalogue's, and the words.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { bandTerms, flangeGaps, gapBand, gapLabel, gapText, setGaps } from './cornerGaps.js';
import { USER_TRAY_FEATURE, USER_TRAY_PROFILE, lCorner } from './cornerGaps.fixtures.js';
import { bendNumbers, foldSheet } from './sheetMetal.js';
import { SHOP_TOLERANCE, shopTolerance } from './shopCatalog.js';
import { normalizeModel } from './model.js';

const WALL = 'Bend 8 flange, end → bend 5 flange, inside face';
const MITRE = 'Bend 1 flange ↔ bend 3 flange, edge to edge';
const tan = (degrees) => Math.tan((degrees * Math.PI) / 180);
const read = (feature, profile) => {
  const fold = foldSheet(feature, profile, {});
  return { fold, rows: flangeGaps(fold, profile, {}).rows };
};

describe('gapBand on the user tray, by hand from the geometry (§6.1 as revised, §6.2)', () => {
  const { fold, rows } = read(USER_TRAY_FEATURE, USER_TRAY_PROFILE);
  const wall = rows.find((r) => gapLabel(r) === WALL);
  const mitre = rows.find((r) => gapLabel(r) === MITRE);
  // Every bend of the tray: t 1.2, r 1.28, BA 2.82115 (h = BA / 2 = 1.410575); every centre of
  // curvature t + r = 2.48 over the face its bend starts from; walls 19.5 (front, rear) and 20 (sides)
  // between their two lines, so a wall's flat between its zones is 19.5 − 2h or 20 − 2h.
  const { allowance, radius } = bendNumbers({ thickness: 1.2, stock: 'spcc', angle: 90, punch: 'a102', die: 'v8-88' });
  const h = allowance / 2;
  const centre = 1.2 + radius; // 2.48
  const byBend = (terms) => new Map(terms.bends.map((b) => [b.bend + 1, b]));

  it('SHOP_TOLERANCE is flange ± 0.2 mm, cut ± 0.1 mm, angle ± 1°', () => {
    expect(SHOP_TOLERANCE).toEqual({ flange: 0.2, cut: 0.1, angle: 1 });
    expect(h).toBeCloseTo(1.410575, 6);
    expect(centre).toBeCloseTo(2.48, 9);
  });

  it('the wall row: its own bend 8 adds nothing; bend 5 slides it 1 : 1 and turns it at 16.68 mm', () => {
    // The rear wall's end against the right wall's inside face: n_B = X, k = 1.
    // Bend 8 (the rear wall's own): its line off moves the wall along Y and Z (outward, lower), its
    // angle turns it about an X axis: neither moves the end along X. slide 0, lever 0.
    // Bend 5 (the right wall's): its line off moves the right wall ε along X (and ε down): slide 1;
    // its angle turns it about a Y axis 2.48 up, so a point z up moves z · θ along X: the end's top
    // corners at 2.48 + (19.5 − 2h) give lever 19.5 − 2h = 16.678850.
    const lever5 = 19.5 - 2 * h;
    expect(lever5).toBeCloseTo(16.67885, 6);
    const terms = bandTerms(wall, fold);
    expect(terms.ends).toBe(1);
    const bends = byBend(terms);
    expect([...bends.keys()].sort()).toEqual([5, 8]);
    expect(bends.get(8).slide).toBeCloseTo(0, 9);
    expect(bends.get(8).lever).toBeCloseTo(0, 9);
    expect(bends.get(5).slide).toBeCloseTo(1, 9);
    expect(bends.get(5).lever).toBeCloseTo(lever5, 6);
    // Defaults: √(0.1² + (0.2 · 1)² + (16.678850 · tan 1°)²) = √(0.01 + 0.04 + 0.291130²) = √0.134757 = 0.367093
    const byHand = Math.sqrt(0.1 ** 2 + (0.2 * 1) ** 2 + (lever5 * tan(1)) ** 2);
    expect(byHand).toBeCloseTo(0.367093, 6);
    expect(gapBand(wall, fold, SHOP_TOLERANCE)).toBeCloseTo(byHand, 6);
    // 0.05 / 0.05 / 0.25°: √(0.0025 + 0.0025 + 0.072776²) = √0.010296 = 0.101471
    const tight = Math.sqrt(0.05 ** 2 + 0.05 ** 2 + (lever5 * tan(0.25)) ** 2);
    expect(tight).toBeCloseTo(0.101471, 6);
    expect(gapBand(wall, fold, { flange: 0.05, cut: 0.05, angle: 0.25 })).toBeCloseTo(tight, 6);
  });

  it('the mitre row: all four bends at 1/√2 — the walls turn it at 13.55 mm, the lips at 1.75 and 1.40', () => {
    // Lip 1's mitred end against lip 3's: both lie flat on top, the mitre at 45° in the horizontal:
    // n_B = (X ± Y) / √2, k = 1. Each of bends 8, 1 (the rear wall, its lip) and 5, 3 (the right wall,
    // its lip) moves what it carries one unit along X or Y per unit off: slide 1/√2 each. Each angle
    // turns about a horizontal axis, so a point v_z above the axis moves v_z · θ horizontally: 1/√2 of
    // it along n_B. The lips' top face (the end's top corners): the rear wall's 2.48 + (19.5 − 2h) =
    // 19.158850, then 2.48 more over bend 1's centre: 21.638850.
    const top = centre + (19.5 - 2 * h) + centre; // 21.638850
    const lever8 = (top - centre) / Math.SQRT2; // the rear wall: axis 2.48 up → 13.547353
    const lever5 = (top - centre) / Math.SQRT2; // the right wall: axis 2.48 up too → 13.547353
    const lever1 = (top - (centre + (19.5 - 2 * h))) / Math.SQRT2; // bend 1's centre 19.158850 up → 1.753625
    const lever3 = (top - (centre + (20 - 2 * h))) / Math.SQRT2; // bend 3's centre 19.658850 up → 1.400071
    expect(lever8).toBeCloseTo(13.547353, 6);
    expect(lever1).toBeCloseTo(1.753625, 6);
    expect(lever3).toBeCloseTo(1.400071, 6);
    const terms = bandTerms(mitre, fold);
    expect(terms.ends).toBe(2);
    const bends = byBend(terms);
    expect([...bends.keys()].sort()).toEqual([1, 3, 5, 8]);
    for (const n of [1, 3, 5, 8]) expect(bends.get(n).slide).toBeCloseTo(Math.SQRT1_2, 6);
    expect(bends.get(8).lever).toBeCloseTo(lever8, 5);
    expect(bends.get(5).lever).toBeCloseTo(lever5, 5);
    expect(bends.get(1).lever).toBeCloseTo(lever1, 5);
    expect(bends.get(3).lever).toBeCloseTo(lever3, 5);
    const levers = lever8 ** 2 + lever5 ** 2 + lever1 ** 2 + lever3 ** 2; // 372.0971
    // Defaults: √(2 · 0.1² + 4 · (0.2/√2)² + tan²1° · 372.0971) = √(0.02 + 0.08 + 0.113370) = 0.461920
    const byHand = Math.sqrt(2 * 0.1 ** 2 + 4 * (0.2 * Math.SQRT1_2) ** 2 + tan(1) ** 2 * levers);
    expect(byHand).toBeCloseTo(0.46192, 6);
    expect(gapBand(mitre, fold, SHOP_TOLERANCE)).toBeCloseTo(byHand, 5);
    // 0.05 / 0.05 / 0.25°: √(0.005 + 0.005 + 0.0070843) = 0.130707
    const tight = Math.sqrt(2 * 0.05 ** 2 + 4 * (0.05 * Math.SQRT1_2) ** 2 + tan(0.25) ** 2 * levers);
    expect(tight).toBeCloseTo(0.130707, 6);
    expect(gapBand(mitre, fold, { flange: 0.05, cut: 0.05, angle: 0.25 })).toBeCloseTo(tight, 5);
  });

  it('the base met has no bend of its own on the path: only the other piece’s bends count', () => {
    const fake = { ...wall, b: { ...wall.b, path: [] } };
    expect(bandTerms(fake, fold).bends.map((b) => b.bend + 1)).toEqual([8]);
  });
});

// Why the band was revised (§6.1, the CG-4 audit): the same tray with its walls 80 mm taller (every
// outline point and bend line beyond a wall's line moved 80 mm further out, so the walls stand 99.5 /
// 100 mm, the lips and mitres as before). A mitre's band grows with the walls' height, about height ×
// tan(angle) for a 90° corner (two walls at 1/√2 each); the first form read the lip's angle and stayed
// near ± 0.49. A wall row's own bend still adds nothing.
describe('a tall tray (walls about 100 mm)', () => {
  const EXTRA = 80;
  const [X5, X6, Y7, Y8] = [286.834742, -94.560553, -449.018402, 83.378679];
  const out = ([x, y]) => [
    x > X5 + 1e-6 ? x + EXTRA : x < X6 - 1e-6 ? x - EXTRA : x,
    y > Y8 + 1e-6 ? y + EXTRA : y < Y7 - 1e-6 ? y - EXTRA : y,
  ];
  const profile = {
    ...USER_TRAY_PROFILE,
    start: out(USER_TRAY_PROFILE.start),
    segments: USER_TRAY_PROFILE.segments.map((s) => ({ ...s, end: out(s.end) })),
  };
  const feature = {
    ...USER_TRAY_FEATURE,
    bends: USER_TRAY_FEATURE.bends.map((b) => ({ ...b, a: out(b.a), b: out(b.b) })),
  };
  const { fold, rows } = read(feature, profile);
  const { allowance } = bendNumbers({ thickness: 1.2, stock: 'spcc', angle: 90, punch: 'a102', die: 'v8-88' });

  it('reads its mitres about height × tan(1°), its walls likewise, a wall’s own bend nothing', () => {
    // The lips' top over the walls' axes (2.48 up): (19.5 + 80 − 2h) + 2.48 = 99.158850.
    const height = 19.5 + EXTRA - allowance + 2.48;
    const mitre = rows.find((r) => gapLabel(r) === MITRE);
    const band = gapBand(mitre, fold, SHOP_TOLERANCE);
    const small = read(USER_TRAY_FEATURE, USER_TRAY_PROFILE);
    const before = gapBand(
      small.rows.find((r) => gapLabel(r) === MITRE),
      small.fold,
      SHOP_TOLERANCE,
    );
    expect(band).toBeGreaterThan(3.5 * before);
    // Two walls at 1/√2 of height each: height · tan 1° = 1.731; with the lips, the lines and the cuts a
    // little more: √(0.1 + tan²1° · (height² + the lips' 5.04)) = 1.760.
    expect(band / (height * tan(1))).toBeGreaterThan(1);
    expect(band / (height * tan(1))).toBeLessThan(1.03);
    const wall = rows.find((r) => gapLabel(r) === WALL);
    const own = bandTerms(wall, fold).bends.find((b) => b.bend + 1 === 8);
    expect(own.slide).toBeCloseTo(0, 9);
    expect(own.lever).toBeCloseTo(0, 9);
    // The rear wall's end against the right wall: √(0.01 + 0.04 + ((99.5 − 2h) · tan 1°)²) = 1.70.
    expect(gapBand(wall, fold, SHOP_TOLERANCE)).toBeCloseTo(
      Math.sqrt(0.01 + 0.04 + ((19.5 + EXTRA - allowance) * tan(1)) ** 2),
      5,
    );
  });
});

describe('the words (§6.1)', () => {
  const set = setGaps({ feature: USER_TRAY_FEATURE, profile: USER_TRAY_PROFILE, target: 0.2 });
  const fold = set.fold;
  const rows = set.rows;
  const wall = rows.find((r) => gapLabel(r) === WALL);

  it('"may touch" at 0.2 with the shop’s defaults, not with a good CNC brake’s figures', () => {
    const band = gapBand(wall, fold, SHOP_TOLERANCE);
    expect(gapText(wall, band)).toBe(
      `0.20 mm · passes 0.20 mm beside it · ± ${band.toFixed(2)} on the bench: may touch`,
    );
    const tight = gapBand(wall, fold, { flange: 0.05, cut: 0.05, angle: 0.25 });
    expect(gapText(wall, tight)).toBe('0.20 mm · passes 0.20 mm beside it · ± 0.10 on the bench');
    for (const row of rows) {
      expect(gapText(row, gapBand(row, fold, SHOP_TOLERANCE))).toMatch(/: may touch$/);
      expect(gapText(row, gapBand(row, fold, { flange: 0.05, cut: 0.05, angle: 0.25 }))).not.toMatch(/may touch/);
    }
  });

  it('not at 0.8: the tray as saved, its wall at 0.73 mm', () => {
    const saved = read(USER_TRAY_FEATURE, USER_TRAY_PROFILE);
    const row = saved.rows.find((r) => gapLabel(r) === WALL);
    expect(gapText(row, gapBand(row, saved.fold, SHOP_TOLERANCE))).toBe(
      '0.73 mm · passes 1.22 mm beside it · ± 0.37 on the bench',
    );
    // Without a band, the CG-1 words.
    expect(gapText(row)).toBe('0.73 mm · passes 1.22 mm beside it');
  });

  it('a covering end: the band on flush, "may stand proud"; an overlap carries no band', () => {
    const covering = read(lCorner({ cover: true }).feature, lCorner({ cover: true }).profile);
    const cover = covering.rows.find((r) => r.cover);
    const band = gapBand(cover, covering.fold, SHOP_TOLERANCE);
    expect(gapText(cover, band)).toBe(
      `runs past its end: flush with its outside face · ± ${band.toFixed(2)} on the bench: may stand proud`,
    );
    const short = read(lCorner({ cover: true, flush: 1 }).feature, lCorner({ cover: true, flush: 1 }).profile);
    const away = short.rows.find((r) => r.cover);
    expect(gapText(away, 0.45)).toBe('runs past its end: 1.00 mm short of flush · ± 0.45 on the bench');
    const overlap = read(lCorner({ gap: -0.3 }).feature, lCorner({ gap: -0.3 }).profile).rows[0];
    expect(gapText(overlap, 0.45)).toBe('runs 0.30 mm into it');
  });
});

describe('shopTolerance: the model’s own over the catalogue’s (§6.1)', () => {
  it('absent: the catalogue; any of the three overrides; junk is ignored', () => {
    expect(shopTolerance(undefined)).toEqual(SHOP_TOLERANCE);
    expect(shopTolerance({ machine: 'brake-50-2000' })).toEqual(SHOP_TOLERANCE);
    expect(shopTolerance({ tolerance: { flange: 0.05 } })).toEqual({ flange: 0.05, cut: 0.1, angle: 1 });
    expect(shopTolerance({ tolerance: { flange: 0.05, cut: 0.05, angle: 0.25 } })).toEqual({
      flange: 0.05,
      cut: 0.05,
      angle: 0.25,
    });
    expect(shopTolerance({ tolerance: { flange: -1, cut: 'x', angle: null } })).toEqual(SHOP_TOLERANCE);
  });
  it('a model tolerance changes the band', () => {
    const { fold, rows } = read(USER_TRAY_FEATURE, USER_TRAY_PROFILE);
    const wall = rows.find((r) => gapLabel(r) === WALL);
    expect(gapBand(wall, fold, shopTolerance({ tolerance: { flange: 0.05, cut: 0.05, angle: 0.25 } }))).toBeCloseTo(
      0.101471,
      6,
    );
  });
});

describe('fabrication.shop.tolerance in the model (§6.1)', () => {
  const file = JSON.parse(
    readFileSync(resolve(process.cwd(), 'scripts/fixtures/corner-gaps-sample-bending.json'), 'utf8'),
  ).document.model;
  const withShop = (shop) => ({
    ...file,
    fabrication: { ...file.fabrication, shop: { ...file.fabrication.shop, ...shop } },
  });
  it('an old file with none loads as it was: the same fabrication, no tolerance key', () => {
    const loaded = normalizeModel(file);
    expect(JSON.stringify(loaded.fabrication)).toBe(JSON.stringify(file.fabrication));
    expect('tolerance' in loaded.fabrication.shop).toBe(false);
  });
  it('keeps a model’s own, any of the three', () => {
    for (const tolerance of [{ flange: 0.05 }, { cut: 0 }, { flange: 0.05, cut: 0.05, angle: 0.25 }])
      expect(normalizeModel(withShop({ tolerance })).fabrication.shop.tolerance).toEqual(tolerance);
  });
  it('refuses a tolerance that is not a number of 0 or more', () => {
    for (const tolerance of [{ flange: -0.1 }, { angle: 'x' }, { cut: null }, 3, null, []])
      expect(() => normalizeModel(withShop({ tolerance })), JSON.stringify(tolerance)).toThrow(
        'Invalid shop settings: the tolerances must be numbers of 0 or more.',
      );
  });
});
