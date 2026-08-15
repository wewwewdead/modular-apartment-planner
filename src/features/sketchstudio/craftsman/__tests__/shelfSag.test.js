import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BOOK_LOAD_KG_PER_M,
  SAG_BORDERLINE_MM_PER_M,
  SAG_FINE_MM_PER_M,
  SAG_RULE_MM_PER_M,
  SAG_VERDICTS,
  STANDARD_GRAVITY,
  classifySag,
  computeSecondMomentOfArea,
  estimateShelfSag,
} from '../physics/shelfSag';
import { getMaterialById } from '../data/materials';

/*
 * ============================================================================
 * HAND-COMPUTED REFERENCE CASE A - uniform load, simply supported
 * ============================================================================
 * Shelf: span L = 1000mm, width b = 120mm, thickness t = 20mm
 * Material: explicit E = 10 GPa = 10 x 1000 = 10,000 N/mm^2
 * Load: 20 kg/m, uniformly distributed
 *
 *   I = b t^3 / 12 = 120 x 20^3 / 12 = 120 x 8000 / 12 = 960,000 / 12
 *     = 80,000 mm^4
 *
 *   w = 20 kg/m x 9.80665 N/kg = 196.133 N/m = 0.196133 N/mm
 *
 *   delta = 5 w L^4 / (384 E I)
 *         = 5 x 0.196133 x 1000^4 / (384 x 10,000 x 80,000)
 *         = 0.980665 x 1e12 / 3.072e11
 *         = 9.80665e11 / 3.072e11
 *         = 3.192268... mm
 *
 *   sag per metre = 3.192268 mm / 1.000 m = 3.192 mm/m
 *                 -> between 2.7 and 4.0 -> BORDERLINE
 *
 * Fixed-end cross-check: the fixed-both-ends uniform case is w L^4 / (384 E I),
 * i.e. exactly ONE FIFTH of the simple case: 3.192268 / 5 = 0.638454 mm.
 * ============================================================================
 * HAND-COMPUTED REFERENCE CASE B - centre point load, simply supported
 * ============================================================================
 * Same beam: L = 1000mm, I = 80,000 mm^4, E = 10,000 N/mm^2
 * Load: 20 kg concentrated at midspan
 *
 *   P = 20 kg x 9.80665 N/kg = 196.133 N
 *
 *   delta = P L^3 / (48 E I)
 *         = 196.133 x 1000^3 / (48 x 10,000 x 80,000)
 *         = 1.96133e11 / 3.84e10
 *         = 5.107630... mm
 *
 *   sag per metre = 5.108 mm/m -> above 4.0 -> SAGS
 *
 * Fixed-end cross-check: P L^3 / (192 E I) is exactly ONE QUARTER of the simple
 * case: 5.107630 / 4 = 1.276908 mm.
 * ============================================================================
 */

const REFERENCE_BEAM = { spanMm: 1000, widthMm: 120, thicknessMm: 20, modulusGPa: 10 };

describe('shelf sag - section properties', () => {
  it('computes I = b t^3 / 12 for a rectangular section', () => {
    // 120 x 20^3 / 12 = 120 x 8000 / 12 = 80,000
    expect(computeSecondMomentOfArea(120, 20)).toBe(80000);
    // Thickness enters cubed: doubling t multiplies I by 8.
    expect(computeSecondMomentOfArea(120, 40)).toBe(80000 * 8);
    // Width enters linearly.
    expect(computeSecondMomentOfArea(240, 20)).toBe(80000 * 2);
  });

  it('treats non-physical sections as zero stiffness', () => {
    expect(computeSecondMomentOfArea(0, 20)).toBe(0);
    expect(computeSecondMomentOfArea(120, -5)).toBe(0);
  });
});

describe('shelf sag - hand-computed reference case A (uniform, simple)', () => {
  const result = estimateShelfSag({ ...REFERENCE_BEAM, loadKgPerM: 20 });

  it('reproduces 5wL^4/(384EI) = 3.192mm', () => {
    expect(result.momentOfInertiaMm4).toBe(80000);
    expect(result.lineLoadNPerMm).toBeCloseTo((20 * STANDARD_GRAVITY) / 1000, 9);
    expect(result.deflectionMm).toBeCloseTo(3.192268880208332, 9);
    expect(result.sagPerMeterMm).toBeCloseTo(3.192268880208332, 9);
  });

  it('lands in the borderline band', () => {
    expect(result.verdict).toBe(SAG_VERDICTS.BORDERLINE);
    expect(result.verdictLabel).toBe('Borderline');
  });

  it('reports the total load implied by the line load', () => {
    // 20 kg/m over a 1.000m span = 20 kg total.
    expect(result.totalLoadKg).toBe(20);
  });

  it('is exactly one fifth as much with both ends fixed', () => {
    const fixed = estimateShelfSag({ ...REFERENCE_BEAM, loadKgPerM: 20, fixity: 'fixed' });
    expect(fixed.deflectionMm).toBeCloseTo(3.192268880208332 / 5, 9);
    expect(fixed.deflectionMm).toBeCloseTo(0.6384537760416665, 9);
    expect(fixed.verdict).toBe(SAG_VERDICTS.FINE);
  });

  it('gives the same answer whether the load is stated per metre or in total', () => {
    const byTotal = estimateShelfSag({ ...REFERENCE_BEAM, totalLoadKg: 20 });
    expect(byTotal.deflectionMm).toBe(result.deflectionMm);
    expect(byTotal.loadKgPerM).toBe(20);
  });
});

describe('shelf sag - hand-computed reference case B (centre point, simple)', () => {
  const result = estimateShelfSag({ ...REFERENCE_BEAM, totalLoadKg: 20, loadType: 'center' });

  it('reproduces PL^3/(48EI) = 5.108mm', () => {
    expect(result.pointLoadN).toBeCloseTo(20 * STANDARD_GRAVITY, 6);
    expect(result.deflectionMm).toBeCloseTo(5.107630208333332, 9);
  });

  it('is judged a sag', () => {
    expect(result.sagPerMeterMm).toBeCloseTo(5.107630208333332, 9);
    expect(result.verdict).toBe(SAG_VERDICTS.SAGS);
  });

  it('is exactly one quarter as much with both ends fixed', () => {
    const fixed = estimateShelfSag({ ...REFERENCE_BEAM, totalLoadKg: 20, loadType: 'center', fixity: 'fixed' });
    expect(fixed.deflectionMm).toBeCloseTo(5.107630208333332 / 4, 9);
    expect(fixed.deflectionMm).toBeCloseTo(1.276907552083333, 9);
  });

  it('concentrates 20kg at midspan more damagingly than spreading it out', () => {
    const uniform = estimateShelfSag({ ...REFERENCE_BEAM, totalLoadKg: 20 });
    // PL^3/48 vs 5wL^4/384 with w = P/L works out to a ratio of 8/5 = 1.6.
    expect(result.deflectionMm / uniform.deflectionMm).toBeCloseTo(1.6, 9);
  });
});

describe('shelf sag - Sagulator-magnitude sanity case', () => {
  /*
   * 800mm pine shelf, 19mm thick, 250mm deep, carrying the 25 kg/m book default.
   *
   *   E (Eastern white pine, WH Table 5-3b) = 8.55 GPa = 8550 N/mm^2
   *   I = 250 x 19^3 / 12 = 250 x 6859 / 12 = 1,714,750 / 12 = 142,895.83 mm^4
   *   w = 25 x 9.80665 / 1000 = 0.24516625 N/mm
   *   delta = 5 x 0.24516625 x 800^4 / (384 x 8550 x 142,895.83)
   *         = 5.02100e11 / 4.69156e11 = 1.0702 mm
   *   sag per metre = 1.0702 / 0.8 = 1.338 mm/m
   *
   * This is a real, measurable ~1mm dip - the right order of magnitude for a
   * shelf calculator - but it is BELOW the 1/32-inch-per-foot eyeball rule, so
   * the honest verdict at 800mm is "fine", not "visibly sagging". The span at
   * which the same shelf does start to sag is checked below.
   */
  const pine = getMaterialById('pine-20x95');

  it('predicts about 1.07mm of deflection with the book default', () => {
    const result = estimateShelfSag({
      spanMm: 800,
      widthMm: 250,
      thicknessMm: 19,
      material: pine,
      loadKgPerM: DEFAULT_BOOK_LOAD_KG_PER_M,
    });

    expect(result.modulusGPa).toBe(8.55);
    expect(result.deflectionMm).toBeCloseTo(1.0702216492779795, 6);
    expect(result.sagPerMeterMm).toBeCloseTo(1.3377770615974742, 6);
    expect(result.verdict).toBe(SAG_VERDICTS.FINE);
  });

  it('sags once the same shelf is stretched to 1200mm', () => {
    const result = estimateShelfSag({
      spanMm: 1200,
      widthMm: 250,
      thicknessMm: 19,
      material: pine,
      loadKgPerM: DEFAULT_BOOK_LOAD_KG_PER_M,
    });

    // Deflection goes as L^4 for a fixed load PER METRE, so 1.5x the span is
    // 1.5^4 = 5.0625x the deflection: 1.0702 x 5.0625 = 5.418mm.
    expect(result.deflectionMm).toBeCloseTo(5.417997099469772, 6);
    expect(result.deflectionMm / 1.0702216492779795).toBeCloseTo(1.5 ** 4, 6);
    expect(result.verdict).toBe(SAG_VERDICTS.SAGS);
  });

  it('resolves E from the material catalog for a plywood shelf', () => {
    const result = estimateShelfSag({
      spanMm: 900,
      widthMm: 300,
      thicknessMm: 18,
      material: getMaterialById('birch-plywood-18'),
      loadKgPerM: DEFAULT_BOOK_LOAD_KG_PER_M,
    });

    expect(result.modulusGPa).toBe(9.2);
    expect(result.deflectionMm).toBeCloseTo(1.5614358653192937, 6);
    expect(result.verdict).toBe(SAG_VERDICTS.FINE);
  });

  it('gets a stiffer answer for oak than for pine at the same size', () => {
    const shared = { spanMm: 1000, widthMm: 250, thicknessMm: 19, loadKgPerM: 25 };
    const pineResult = estimateShelfSag({ ...shared, material: pine });
    const oakResult = estimateShelfSag({ ...shared, material: getMaterialById('oak-20x95') });

    // Deflection is inversely proportional to E, so the ratio is exactly the
    // inverse ratio of the two moduli: 12.27 / 8.55.
    expect(pineResult.deflectionMm / oakResult.deflectionMm).toBeCloseTo(12.27 / 8.55, 6);
  });
});

describe('shelf sag - verdict thresholds', () => {
  it('places the classic 1/32-inch-per-foot rule at 2.604 mm/m', () => {
    // 1/32 in = 0.79375mm; 1 ft = 304.8mm.
    expect(SAG_RULE_MM_PER_M).toBeCloseTo(0.79375 / 304.8 / 0.001, 3);
    expect(SAG_RULE_MM_PER_M).toBeLessThan(SAG_FINE_MM_PER_M);
  });

  it('classifies on the documented boundaries', () => {
    expect(classifySag(0)).toBe(SAG_VERDICTS.FINE);
    expect(classifySag(SAG_FINE_MM_PER_M - 0.001)).toBe(SAG_VERDICTS.FINE);
    expect(classifySag(SAG_FINE_MM_PER_M)).toBe(SAG_VERDICTS.BORDERLINE);
    expect(classifySag(SAG_BORDERLINE_MM_PER_M - 0.001)).toBe(SAG_VERDICTS.BORDERLINE);
    expect(classifySag(SAG_BORDERLINE_MM_PER_M)).toBe(SAG_VERDICTS.SAGS);
    expect(classifySag(50)).toBe(SAG_VERDICTS.SAGS);
  });
});

describe('shelf sag - refusals', () => {
  it('returns null rather than a fabricated zero when an input is missing', () => {
    expect(estimateShelfSag()).toBeNull();
    expect(estimateShelfSag({ ...REFERENCE_BEAM })).toBeNull(); // no load
    expect(estimateShelfSag({ ...REFERENCE_BEAM, spanMm: 0, loadKgPerM: 20 })).toBeNull();
    expect(estimateShelfSag({ ...REFERENCE_BEAM, widthMm: 0, loadKgPerM: 20 })).toBeNull();
    expect(estimateShelfSag({ ...REFERENCE_BEAM, thicknessMm: -1, loadKgPerM: 20 })).toBeNull();
  });

  it('returns null when the material has no published modulus', () => {
    expect(
      estimateShelfSag({ spanMm: 1000, widthMm: 120, thicknessMm: 20, material: { id: 'unobtanium' }, loadKgPerM: 20 }),
    ).toBeNull();
  });

  it('lets an explicit modulus override the material lookup', () => {
    const result = estimateShelfSag({
      spanMm: 1000,
      widthMm: 120,
      thicknessMm: 20,
      material: getMaterialById('oak-20x95'),
      modulusGPa: 10,
      loadKgPerM: 20,
    });
    expect(result.modulusGPa).toBe(10);
    expect(result.deflectionMm).toBeCloseTo(3.192268880208332, 9);
  });

  it('falls back to the documented defaults for unknown load type and fixity', () => {
    const result = estimateShelfSag({ ...REFERENCE_BEAM, loadKgPerM: 20, loadType: 'wat', fixity: 'nope' });
    expect(result.loadType).toBe('uniform');
    expect(result.fixity).toBe('simple');
    expect(result.deflectionMm).toBeCloseTo(3.192268880208332, 9);
  });
});
