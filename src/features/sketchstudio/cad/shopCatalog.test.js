import { describe, expect, it } from 'vitest';
import {
  BACKGAUGE,
  DEFAULT_MACHINE,
  DIES,
  MACHINES,
  MACHINE_KEYS,
  PUNCHES,
  SHEET_STOCK,
  STOCK_KEYS,
  airBendRadius,
  defaultDie,
  distortionDistance,
  dieSection,
  kFactorFor,
  machineOf,
  maxBendAngle,
  minLeg,
  punchSection,
  ramDepth,
  shoulderOffset,
  springback,
  stockByName,
  stockOf,
  suggestedDie,
  tonnage,
  toolingLimit,
} from './shopCatalog.js';

describe('sheet stock (§8.1)', () => {
  it('lists the five stocks with their table values and a colour each', () => {
    expect(STOCK_KEYS).toEqual(['spcc', 'secc', 'sus304', 'a5052', 'a6061']);
    expect(stockOf('sus304')).toMatchObject({ rm: 579, radiusOfV: 0.21, hardness: 'hard', springback90: 2.5 });
    expect(stockOf('a6061').minRadius).toBe(1.5);
    expect(stockOf('a5052').thicknesses).toContain(1.5);
    for (const stock of Object.values(SHEET_STOCK)) expect(stock.colour).toMatch(/^#[0-9a-f]{6}$/);
    expect(stockByName('SPCC cold-rolled steel')).toBe(SHEET_STOCK.spcc);
    expect(() => stockOf('brass')).toThrow('Unknown sheet stock: brass');
  });
});

describe('K-factor (§8.2)', () => {
  it('reads the table by r/t and hardness', () => {
    expect(kFactorFor(0.9, 1, 'soft')).toBe(0.33);
    expect(kFactorFor(1, 1, 'medium')).toBe(0.43);
    expect(kFactorFor(3, 1, 'hard')).toBe(0.45);
    expect(kFactorFor(3.1, 1, 'medium')).toBe(0.5);
  });
});

describe('air-bend rules (§8.3)', () => {
  it('picks the smallest 88° die with V ≥ m·t', () => {
    expect(defaultDie(1).key).toBe('v6-88');
    expect(defaultDie(1.5).key).toBe('v10-88');
    expect(defaultDie(2).key).toBe('v12-88');
    expect(defaultDie(3).key).toBe('v25-88'); // 8 × 3 = 24
    expect(defaultDie(6).key).toBe('v25-88'); // past the catalogue: the widest
    // Ten 88° and 30° dies, and the six wide 60° dies of the radius punches (round-bend spec §12.3).
    expect(Object.keys(DIES)).toHaveLength(16);
    // Brake blades BT-1: the gooseneck is the catalogue's 11.147 (H 104.5; it was a schematic 95).
    expect(PUNCHES['gooseneck-88'].height).toBe(104.5);
  });
  it('forms the radius from the die and turns sharp below 0.63 t', () => {
    expect(airBendRadius(stockOf('spcc'), 1.5, PUNCHES['straight-88'], DIES['v10-88'])).toEqual({
      radius: 1.6,
      sharp: false,
    });
    const sharp = airBendRadius(stockOf('a5052'), 3, PUNCHES['straight-88-sharp'], DIES['v6-88']);
    expect(sharp.sharp).toBe(true);
    expect(sharp.radius).toBeCloseTo(1.89, 10);
  });
  it('limits the angle by the die and needs a minimum leg', () => {
    expect(maxBendAngle(DIES['v12-88'])).toBe(92);
    expect(maxBendAngle(DIES['v12-30'])).toBe(150);
    expect(minLeg(DIES['v10-88'], 90)).toBeCloseTo(10 * Math.SQRT1_2 + 1.2, 10);
    expect(distortionDistance(1.5, 1.6)).toBeCloseTo(5.35, 10);
  });
  it('reads tonnage, springback and ram depth', () => {
    // 1.42 × 330 × 1.5² × 1000 / (1000 × 10) = 105.4 kN for a metre of 1.5 SPCC on V10.
    expect(tonnage(stockOf('spcc'), 1.5, 1000, DIES['v10-88'])).toBeCloseTo(105.435, 3);
    expect(springback(stockOf('sus304'), 90, 1.5, 1.5)).toBeCloseTo(2.5, 10);
    expect(springback(stockOf('spcc'), 45, 16, 1)).toBeCloseTo(0.5 * Math.sqrt(8), 10);
    const at = (angle) => ramDepth({ v: 10, thickness: 1.5, radius: 1.6, angle, shoulderRadius: 1.2, dieAngle: 88 });
    expect(at(90)).toBeGreaterThan(at(45));
    expect(at(45)).toBeGreaterThan(0);
  });
});

describe('press brakes and tooling sections (§8.4, SM-2)', () => {
  const area = (ring) =>
    ring.reduce((sum, p, i) => {
      const q = ring[(i + 1) % ring.length];
      return sum + (p[0] * q[1] - q[0] * p[1]) / 2;
    }, 0);
  it('lists three generic machines by capacity, with the backgauge reach', () => {
    expect(MACHINE_KEYS).toEqual(['brake-50-2000', 'brake-80-2500', 'brake-100-3000']);
    expect(Object.values(MACHINES).map((m) => [m.name, m.force, m.bed])).toEqual([
      ['50 t × 2 m press brake', 500, 2090],
      ['80 t × 2.5 m press brake', 800, 2570],
      ['100 t × 3 m press brake', 1000, 3110],
    ]);
    expect(machineOf(DEFAULT_MACHINE)).toMatchObject({
      stroke: 200,
      openHeight: 470,
      throat: 420,
      speeds: { approach: 100, bend: 10, return: 100 },
      backgauge: { min: 5, max: 600 },
    });
    expect(BACKGAUGE).toEqual({ min: 5, max: 600 });
    expect(() => machineOf('brake-1-1')).toThrow('Unknown press brake: brake-1-1');
  });
  it('says when a thickness is beyond the automatic die catalogue', () => {
    expect(suggestedDie(1.5)).toMatchObject({ wanted: 9, fits: true });
    expect(suggestedDie(1.5).die.key).toBe('v10-88');
    expect(suggestedDie(4)).toMatchObject({ wanted: 32, fits: false });
    expect(suggestedDie(4).die.key).toBe('v25-88');
    expect(toolingLimit(PUNCHES['gooseneck-88'], DIES['v12-88'], 200)).toBe(100);
  });
  it('draws each punch from its numbers: tip at the origin, its angle at the tip, the clamp shoulder at its height', () => {
    // The radius punches have a round nose, no flanks (radiusPunch.test.js draws them).
    for (const punch of Object.values(PUNCHES).filter((p) => !p.round)) {
      const ring = punchSection(punch);
      expect(area(ring)).toBeGreaterThan(0);
      expect(Math.min(...ring.map((p) => p[1]))).toBeCloseTo(0, 9);
      expect(Math.max(...ring.map((p) => p[1]))).toBeCloseTo(punch.height, 9);
      // The flanks leave the tip arc at ±(angle/2) from vertical.
      const [, second] = ring;
      expect(second[0]).toBeLessThan(0);
      const [flankEnd, flankTop] = [ring[6], ring[7]];
      const slope = (Math.atan2(flankTop[0] - flankEnd[0], flankTop[1] - flankEnd[1]) * 180) / Math.PI;
      expect(slope).toBeCloseTo(punch.angle / 2, 6);
    }
    // The gooseneck's throat (brake blades BT-1, the catalogue's 11.147): it
    // opens to the front (−Y) and reaches 20.3 mm behind the tip line, the
    // body 49 mm back; reversed, it is mirrored (still counter-clockwise).
    const goose = punchSection(PUNCHES['gooseneck-88']);
    expect(goose).toContainEqual([20.3, 59.2]);
    expect(goose).toContainEqual([49, 53.4]);
    const reversed = punchSection(PUNCHES['gooseneck-88'], true);
    expect(reversed).toContainEqual([-20.3, 59.2]);
    expect(area(reversed)).toBeCloseTo(area(goose), 9);
  });
  it('draws each die from its numbers: the V at the top, shoulders of its radius, flanks at its angle', () => {
    for (const die of Object.values(DIES)) {
      const ring = dieSection(die);
      expect(area(ring)).toBeGreaterThan(0);
      expect(Math.max(...ring.map((p) => p[1]))).toBe(0);
      expect(Math.min(...ring.map((p) => p[1]))).toBe(-die.height);
      expect(Math.max(...ring.map((p) => p[0]))).toBe(die.width / 2);
      // The shoulder arc's points sit Rd from its centre (±c, −Rd).
      const c = shoulderOffset(die);
      const shoulder = ring.filter((p) => p[0] > 0 && p[1] > -die.shoulderRadius * 2 && p[0] < die.width / 2);
      for (const [y, z] of shoulder.filter((p) => p[0] <= c + 1e-9))
        expect(Math.hypot(y - c, z + die.shoulderRadius)).toBeCloseTo(die.shoulderRadius, 9);
    }
  });
});
