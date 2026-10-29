import { describe, expect, it } from 'vitest';
import { createWall } from '@/domain/models';
import {
  ASSUMED_CONCRETE_GRADE,
  CANTILEVER_SPAN_MULTIPLIER,
  CONCRETE_CREEP_COEFFICIENT,
  CONCRETE_MEAN_TENSILE_STRENGTH_MPA,
  CONCRETE_SECANT_MODULUS_MPA,
  DEFLECTION_SPAN_DENOMINATOR,
  FRAMED_WALL_SELF_WEIGHT_KPA,
  IMPOSED_LOAD_BALCONY_KPA,
  MASONRY_WALL_SELF_WEIGHT_KPA,
  PARTIAL_FACTOR_PERMANENT,
  PARTIAL_FACTOR_VARIABLE,
  QUASI_PERMANENT_FACTOR,
  REINFORCED_CONCRETE_UNIT_WEIGHT_KN_PER_M3,
  STRIP_WIDTH_MM,
  SUPERIMPOSED_DEAD_LOAD_KPA,
  analyzeSlabCantilever,
  cantileverDeflectionLimitMm,
  cantileverRootMomentNmm,
  cantileverTipDeflectionMm,
  deriveOverhangTipLoads,
  effectiveConcreteModulusMpa,
  overhangBackSpanMm,
  slabStripSection,
  tipLineLoadStripForceN,
  tipLoadDeflectionMm,
  tipLoadRootMomentNmm,
} from './cantileverStructural';

/*
 * The reference case, worked by hand once and reused throughout.
 *
 *   200 mm C25/30 slab, 1 m wide strip, cantilevering L = 1000 mm.
 *
 * Section
 *   I = b t³/12 = 1000 · 200³/12       = 666 666 666.67 mm⁴
 *   S = b t²/6  = 1000 · 200²/6        =   6 666 666.67 mm³
 *   d = t − c_nom − φ/2 = 200 − 35 − 6 = 159 mm
 *   A_s,min = 0.26 (f_ctm/f_yk) b d = 0.26 · (2.6/500) · 1000 · 159 = 214.968 mm²
 *             (floor 0.0013 b d = 206.7 mm², so the first term governs)
 *   f_yd = 500/1.15 = 434.783 MPa      → F_s = 214.968 · 434.783 = 93 464.3 N
 *   f_cd = 25/1.5   = 16.667 MPa
 *   x = F_s/(0.8 b f_cd) = 93 464.3/13 333.3 = 7.010 mm
 *   z = min(d − 0.4x, 0.95d) = min(156.196, 151.05) = 151.05 mm  (the cap governs)
 *   M_Rd = F_s · z = 93 464.3 · 151.05 = 14 117 782 N·mm = 14.118 kN·m/m
 *   M_cr = f_ctm · S = 2.6 · 6 666 666.67 = 17 333 333 N·mm = 17.333 kN·m/m
 *
 * Loads (kN/m², which on a 1 m strip is N/mm as a line load)
 *   g_self = 25 · 0.200 = 5.0 ; g_sdl = 1.5 ; g = 6.5 ; q = 3.0
 *   w_ULS = 1.35 · 6.5 + 1.5 · 3.0 = 8.775 + 4.5 = 13.275
 *   w_qp  = 6.5 + 0.3 · 3.0        = 7.4
 *
 * Actions at L = 1000 mm
 *   M_Ed = w_ULS L²/2 = 13.275 · 10⁶/2 = 6 637 500 N·mm = 6.6375 kN·m/m
 *   utilisation = 6.6375/14.11778 = 0.47015
 *   M_qp = 7.4 · 10⁶/2 = 3 700 000 N·mm = 3.70 kN·m < M_cr → uncracked
 *   E_c,eff = 31 000/(1 + 2.0) = 10 333.33 MPa
 *   δ = wL⁴/(8EI) = 7.4 · 10¹² / (8 · 10 333.33 · 666 666 666.67)
 *     = 7.4 · 10¹² / 5.51111 · 10¹³ = 0.13427 mm
 *   δ_limit = 2L/250 = 8.0 mm
 *
 * Allowable imposed load
 *   bending:    w_max = 2 M_Rd/L² = 28.2356 kN/m²
 *               q = (28.2356 − 1.35 · 6.5)/1.5 = 19.4606/1.5 = 12.974 kN/m²
 *   deflection: w_max = 8 E I δ_lim/L⁴ = 5.51111 · 10¹³ · 8/10¹² = 440.889 kN/m²
 *               q = (440.889 − 6.5)/0.3 = 1447.96 kN/m²
 *   → bending governs at 12.97 kN/m²
 */

const THICKNESS_MM = 200;
const LENGTH_MM = 1000;

function rectangle(x, y, width, depth) {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + depth },
    { x, y: y + depth },
  ];
}

/** A plate 3 m wide and 5.6 m deep, projecting off its far (y = 5600) edge. */
function referenceSlab(thickness = THICKNESS_MM) {
  return { id: 'slab_upper', thickness, boundaryPoints: rectangle(0, 0, 3000, 5600) };
}

function referenceOverhang(depthMm = LENGTH_MM) {
  return {
    slabId: 'slab_upper',
    maxDepthMm: depthMm,
    overhangEdges: [{ start: { x: 3000, y: 5600 }, end: { x: 0, y: 5600 }, depthMm, lengthMm: 3000 }],
  };
}

describe('slab strip section properties', () => {
  it('takes I and S straight off the thickness of a 1 m strip', () => {
    const section = slabStripSection(THICKNESS_MM);

    expect(section.inertiaMm4).toBeCloseTo(666_666_666.67, 1);
    expect(section.sectionModulusMm3).toBeCloseTo(6_666_666.67, 1);
    expect(section.effectiveDepthMm).toBeCloseTo(159, 6);
  });

  it('reinforces to the EN 1992-1-1 minimum and resists 14.1 kN·m per metre', () => {
    const section = slabStripSection(THICKNESS_MM);

    expect(section.reinforcementMm2).toBeCloseTo(214.968, 3);
    expect(section.leverArmMm).toBeCloseTo(151.05, 2);
    expect(section.momentResistanceNmm / 1e6).toBeCloseTo(14.1178, 3);
    expect(section.crackingMomentNmm).toBeCloseTo(CONCRETE_MEAN_TENSILE_STRENGTH_MPA * section.sectionModulusMm3, 6);
  });

  it('stiffens with the cube of thickness and strengthens with its square', () => {
    const thin = slabStripSection(200);
    const thick = slabStripSection(400);

    expect(thick.inertiaMm4 / thin.inertiaMm4).toBeCloseTo(8, 9);
    expect(thick.sectionModulusMm3 / thin.sectionModulusMm3).toBeCloseTo(4, 9);
  });

  it('has nothing to say about a thickness that cannot hold reinforcement', () => {
    expect(slabStripSection(0)).toBeNull();
    expect(slabStripSection(undefined)).toBeNull();
    expect(slabStripSection(30).momentResistanceNmm).toBe(0);
  });
});

describe('cantilever closed forms', () => {
  const modulus = effectiveConcreteModulusMpa();
  const inertia = slabStripSection(THICKNESS_MM).inertiaMm4;

  it('creeps the modulus down by 1 + phi', () => {
    expect(modulus).toBeCloseTo(CONCRETE_SECANT_MODULUS_MPA / (1 + CONCRETE_CREEP_COEFFICIENT), 9);
    expect(modulus).toBeCloseTo(10_333.33, 2);
  });

  it('matches the hand-worked tip deflection of the reference strip', () => {
    // w_qp = 7.4 N/mm, L = 1000 mm → 0.13427 mm.
    expect(cantileverTipDeflectionMm(7.4, LENGTH_MM, modulus, inertia)).toBeCloseTo(0.13427, 5);
  });

  it('deflects sixteen times as far when the reach doubles', () => {
    const short = cantileverTipDeflectionMm(7.4, 1000, modulus, inertia);
    const long = cantileverTipDeflectionMm(7.4, 2000, modulus, inertia);

    expect(long / short).toBeCloseTo(16, 9);
  });

  it('deflects an eighth as far when the section doubles in depth, load held fixed', () => {
    const thin = cantileverTipDeflectionMm(7.4, LENGTH_MM, modulus, slabStripSection(200).inertiaMm4);
    const thick = cantileverTipDeflectionMm(7.4, LENGTH_MM, modulus, slabStripSection(400).inertiaMm4);

    expect(thin / thick).toBeCloseTo(8, 9);
  });

  it('squares the root moment with the reach', () => {
    expect(cantileverRootMomentNmm(13.275, LENGTH_MM)).toBeCloseTo(6_637_500, 6);
    expect(cantileverRootMomentNmm(13.275, 2000) / cantileverRootMomentNmm(13.275, 1000)).toBeCloseTo(4, 9);
  });

  it('applies the span/250 limit to twice the projection', () => {
    expect(cantileverDeflectionLimitMm(1000)).toBeCloseTo(8, 9);
    expect(cantileverDeflectionLimitMm(1500)).toBeCloseTo(
      (CANTILEVER_SPAN_MULTIPLIER * 1500) / DEFLECTION_SPAN_DENOMINATOR,
      9,
    );
  });
});

describe('load build-up', () => {
  it('carries its own weight before anything else is put on it', () => {
    const report = analyzeSlabCantilever({ slab: referenceSlab(), overhang: referenceOverhang() });

    expect(report.loads.selfWeightKpa).toBeCloseTo((REINFORCED_CONCRETE_UNIT_WEIGHT_KN_PER_M3 * 200) / 1000, 9);
    expect(report.loads.selfWeightKpa).toBeCloseTo(5, 9);
    expect(report.loads.superimposedDeadKpa).toBe(SUPERIMPOSED_DEAD_LOAD_KPA);
    expect(report.loads.imposedKpa).toBe(IMPOSED_LOAD_BALCONY_KPA);
    expect(report.loads.permanentKpa).toBeCloseTo(6.5, 9);
    expect(report.loads.ultimateKpa).toBeCloseTo(
      PARTIAL_FACTOR_PERMANENT * 6.5 + PARTIAL_FACTOR_VARIABLE * IMPOSED_LOAD_BALCONY_KPA,
      9,
    );
    expect(report.loads.ultimateKpa).toBeCloseTo(13.275, 9);
    expect(report.loads.quasiPermanentKpa).toBeCloseTo(6.5 + QUASI_PERMANENT_FACTOR * 3, 9);
    expect(report.loads.quasiPermanentKpa).toBeCloseTo(7.4, 9);
  });
});

describe('analyzeSlabCantilever — the reference 200 mm plate at 1 m', () => {
  const report = analyzeSlabCantilever({ slab: referenceSlab(), overhang: referenceOverhang() });
  const edge = report.governing;

  it('reports both dimensions of the overhang: how far out, and how far along', () => {
    expect(edge.depthMm).toBe(1000);
    expect(edge.lengthMm).toBe(3000);
    expect(report.totals.totalRunLengthMm).toBe(3000);
    expect(report.totals.longestRunLengthMm).toBe(3000);
  });

  it('lands on the hand-calculated moment, capacity and utilisation', () => {
    expect(edge.momentKnm).toBeCloseTo(6.6375, 4);
    expect(edge.momentResistanceKnm).toBeCloseTo(14.1178, 3);
    expect(edge.bendingUtilization).toBeCloseTo(0.47015, 5);
  });

  it('lands on the hand-calculated deflection and its limit', () => {
    expect(edge.deflectionMm).toBeCloseTo(0.13427, 5);
    expect(edge.deflectionLimitMm).toBeCloseTo(8, 9);
    expect(edge.deflectionUtilization).toBeCloseTo(0.13427 / 8, 5);
  });

  it('finds the section uncracked, so the gross-section stiffness is honest here', () => {
    expect(edge.cracked).toBe(false);
  });

  it('allows 13 kN/m2 of imposed load, governed by bending rather than deflection', () => {
    expect(edge.allowableImposedBendingKpa).toBeCloseTo(12.974, 2);
    expect(edge.allowableImposedDeflectionKpa).toBeCloseTo(1447.96, 1);
    expect(edge.allowableImposedKpa).toBeCloseTo(12.974, 2);
    expect(edge.allowableGovernedBy).toBe('bending');
  });

  it('measures the back-span behind the projecting edge and passes the 3x rule', () => {
    // The plate is 5600 deep and 1000 of that is past the support line.
    expect(edge.backSpanMm).toBeCloseTo(4600, 6);
    expect(edge.backSpanRatio).toBeCloseTo(4.6, 6);
    expect(edge.backSpanStatus).toBe('ok');
  });

  it('says so in plain language, and says it is only an assumption', () => {
    expect(report.verdict.status).toBe('ok');
    expect(report.verdict.headline).toBe('OK — deflection 0.13 mm of a 8 mm limit, bending 47%');
    expect(report.assumptions.concreteGrade).toBe(ASSUMED_CONCRETE_GRADE);
    expect(report.assumptions.summary).toContain('200 mm C25/30');
    expect(report.assumptions.summary).toContain('not a structural design');
  });

  it('sanity-checks its own units: mm of deflection, kN·m of moment, kN/m2 of load', () => {
    expect(edge.deflectionMm).toBeGreaterThan(0.01);
    expect(edge.deflectionMm).toBeLessThan(10);
    expect(edge.momentKnm).toBeGreaterThan(1);
    expect(edge.momentKnm).toBeLessThan(100);
    expect(report.loads.ultimateKpa).toBeGreaterThan(1);
    expect(report.loads.ultimateKpa).toBeLessThan(100);
    expect(report.section.inertiaMm4).toBeGreaterThan(1e8);
  });
});

describe('analyzeSlabCantilever — when the reach outgrows the plate', () => {
  it('cracks, deflects past the limit and fails bending on a long thin reach', () => {
    const slab = { ...referenceSlab(150), boundaryPoints: rectangle(0, 0, 3000, 4000) };
    const report = analyzeSlabCantilever({ slab, overhang: referenceOverhang(2500) });
    const edge = report.governing;

    expect(edge.bendingUtilization).toBeGreaterThan(1);
    expect(edge.cracked).toBe(true);
    expect(report.verdict.status).toBe('over');
    expect(report.verdict.headline).toMatch(/^Over — /);
  });

  it('warns rather than passes when the back-span is shorter than three reaches', () => {
    // 1200 deep plate, 500 of it hanging out: 700 of back-span is 1.4x the reach.
    const slab = { ...referenceSlab(), boundaryPoints: rectangle(0, 0, 3000, 1200) };
    const overhang = {
      slabId: 'slab_upper',
      maxDepthMm: 500,
      overhangEdges: [{ start: { x: 3000, y: 1200 }, end: { x: 0, y: 1200 }, depthMm: 500, lengthMm: 3000 }],
    };

    const edge = analyzeSlabCantilever({ slab, overhang }).governing;

    expect(edge.backSpanMm).toBeCloseTo(700, 6);
    expect(edge.backSpanRatio).toBeCloseTo(1.4, 6);
    expect(edge.backSpanStatus).toBe('short');
    expect(edge.status).toBe('watch');
    expect(edge.headline).toContain('back-span');
  });

  it('flags a reach past the profile assumption without calling it a failure', () => {
    const report = analyzeSlabCantilever({ slab: referenceSlab(300), overhang: referenceOverhang(1600) });

    expect(report.governing.exceedsPlanningLength).toBe(true);
    expect(report.governing.bendingUtilization).toBeLessThan(1);
    expect(report.verdict.status).toBe('watch');
  });

  it('takes its limits from the coordination profile it is handed', () => {
    const strict = analyzeSlabCantilever({
      slab: referenceSlab(300),
      overhang: referenceOverhang(1600),
      profile: { maxCantileverPlanningLength: 3000 },
    });

    expect(strict.governing.exceedsPlanningLength).toBe(false);
  });
});

describe('analyzeSlabCantilever — nothing to analyse', () => {
  it('says nothing about a plate with no measured overhang', () => {
    expect(analyzeSlabCantilever({ slab: referenceSlab(), overhang: null }).available).toBe(false);
    expect(analyzeSlabCantilever({}).available).toBe(false);
  });

  it('says nothing about a projection too shallow to be a cantilever', () => {
    const report = analyzeSlabCantilever({ slab: referenceSlab(), overhang: referenceOverhang(20) });

    expect(report.available).toBe(false);
    expect(report.edges).toEqual([]);
  });

  it('says nothing about a plate with no thickness', () => {
    expect(
      analyzeSlabCantilever({ slab: { ...referenceSlab(), thickness: 0 }, overhang: referenceOverhang() }),
    ).toHaveProperty('available', false);
  });
});

describe('analyzeSlabCantilever — several projecting runs', () => {
  it('governs by the run closest to a limit, not the one that happens to be first', () => {
    const slab = referenceSlab();
    const overhang = {
      slabId: 'slab_upper',
      maxDepthMm: 1800,
      overhangEdges: [
        { start: { x: 3000, y: 5600 }, end: { x: 0, y: 5600 }, depthMm: 400, lengthMm: 3000 },
        { start: { x: 0, y: 5600 }, end: { x: 0, y: 0 }, depthMm: 1800, lengthMm: 5600 },
      ],
    };

    const report = analyzeSlabCantilever({ slab, overhang });

    expect(report.edges).toHaveLength(2);
    expect(report.governing.depthMm).toBe(1800);
    expect(report.totals.totalRunLengthMm).toBe(8600);
    expect(report.totals.maxDepthMm).toBe(1800);
    expect(report.edges[0].bendingUtilization).toBeLessThan(report.edges[1].bendingUtilization);
  });

  it('falls back to measuring the run when the geometry did not carry a length', () => {
    const overhang = {
      slabId: 'slab_upper',
      maxDepthMm: 1000,
      overhangEdges: [{ start: { x: 3000, y: 5600 }, end: { x: 0, y: 5600 }, depthMm: 1000 }],
    };

    expect(analyzeSlabCantilever({ slab: referenceSlab(), overhang }).governing.lengthMm).toBeCloseTo(3000, 6);
  });
});

/*
 * The reference case again, with a wall standing on the free end.
 *
 *   p = 3 kN/m of run → on a 1 m strip, P = 3 kN = 3000 N at the tip.
 *
 * Ultimate (a facade is permanent load, so γ_G and no ψ)
 *   M_tip = 1.35 · 3000 · 1000 = 4 050 000 N·mm = 4.05 kN·m
 *   M_Ed  = 6.6375 + 4.05 = 10.6875 kN·m   → 10.6875/14.11778 = 0.7570
 *
 * Quasi-permanent (unfactored)
 *   δ_tip = P L³/(3EI) = 3000 · 10⁹ / (3 · 10 333.33 · 666 666 666.67)
 *         = 3 · 10¹² / 2.06667 · 10¹³ = 0.145161 mm
 *   δ     = 0.134274 + 0.145161 = 0.279435 mm, still well inside the 8 mm limit
 *
 * Allowable imposed load — the wall spends its share of both limits first
 *   bending:    w_max = 2(14.117782 − 4.05)/1² = 20.13556 kN/m²
 *               q = (20.13556 − 1.35 · 6.5)/1.5 = 7.5737 kN/m²  (was 12.974)
 *   deflection: w_max = 8EI(8 − 0.145161)/L⁴ = 440.889 · 0.981855 = 432.889
 *               q = (432.889 − 6.5)/0.3 = 1421.30 kN/m²          (was 1447.96)
 */
describe('a wall standing on the tip', () => {
  const modulus = effectiveConcreteModulusMpa();
  const inertia = slabStripSection(THICKNESS_MM).inertiaMm4;
  const TIP_LINE_LOAD_KN_PER_M = 3;
  const TIP_FORCE_N = TIP_LINE_LOAD_KN_PER_M * STRIP_WIDTH_MM;

  const bare = analyzeSlabCantilever({ slab: referenceSlab(), overhang: referenceOverhang() });
  const loaded = analyzeSlabCantilever({
    slab: referenceSlab(),
    overhang: referenceOverhang(),
    tipLoads: [{ lineLoadKnPerM: TIP_LINE_LOAD_KN_PER_M, wallCount: 1, wallIds: ['wall_face'] }],
  });

  it('reads kN/m along the edge as N/mm and multiplies by the strip it acts on', () => {
    expect(tipLineLoadStripForceN(TIP_LINE_LOAD_KN_PER_M)).toBe(3000);
    expect(tipLoadRootMomentNmm(3000, 1000)).toBe(3_000_000);
    expect(tipLoadDeflectionMm(3000, 1000, modulus, inertia)).toBeCloseTo(0.145161, 6);
  });

  it('deflects three times as far under a tip load as the same load spread along the reach', () => {
    // δ_point = PL³/3EI against δ_udl = wL⁴/8EI with W = wL: the ratio is 8/3.
    const spread = cantileverTipDeflectionMm(TIP_FORCE_N / LENGTH_MM, LENGTH_MM, modulus, inertia);
    expect(tipLoadDeflectionMm(TIP_FORCE_N, LENGTH_MM, modulus, inertia) / spread).toBeCloseTo(8 / 3, 9);
  });

  it('adds exactly gamma_G · P · L to the root moment', () => {
    expect(loaded.governing.momentKnm - bare.governing.momentKnm).toBeCloseTo(
      (PARTIAL_FACTOR_PERMANENT * TIP_FORCE_N * LENGTH_MM) / 1e6,
      9,
    );
    expect(loaded.governing.tipMomentKnm).toBeCloseTo(4.05, 9);
    expect(loaded.governing.momentKnm).toBeCloseTo(10.6875, 6);
    expect(loaded.governing.bendingUtilization).toBeCloseTo(0.757, 3);
  });

  it('adds exactly P · L3/(3EI) to the tip deflection, with the wall unfactored', () => {
    expect(loaded.governing.deflectionMm - bare.governing.deflectionMm).toBeCloseTo(
      tipLoadDeflectionMm(TIP_FORCE_N, LENGTH_MM, modulus, inertia),
      9,
    );
    expect(loaded.governing.deflectionMm).toBeCloseTo(0.279435, 5);
  });

  it('spends the wall out of both capacities before the imposed load gets a share', () => {
    expect(loaded.governing.allowableImposedBendingKpa).toBeCloseTo(7.5737, 3);
    expect(loaded.governing.allowableImposedDeflectionKpa).toBeCloseTo(1421.3, 1);
    expect(loaded.governing.allowableImposedKpa).toBeLessThan(bare.governing.allowableImposedKpa);
    expect(loaded.governing.allowableGovernedBy).toBe('bending');
  });

  it('never reports a negative allowance when the wall alone exhausts the section', () => {
    const crushed = analyzeSlabCantilever({
      slab: referenceSlab(),
      overhang: referenceOverhang(),
      tipLoads: [{ lineLoadKnPerM: 40, wallCount: 1 }],
    });

    expect(crushed.governing.allowableImposedKpa).toBe(0);
    expect(crushed.governing.bendingUtilization).toBeGreaterThan(1);
    expect(crushed.verdict.status).toBe('over');
  });

  it('is bit-identical to a bare plate when the tip load is zero', () => {
    const zero = analyzeSlabCantilever({
      slab: referenceSlab(),
      overhang: referenceOverhang(),
      tipLoads: [{ lineLoadKnPerM: 0, wallCount: 0, wallIds: [] }],
    });

    for (const key of [
      'momentKnm',
      'deflectionMm',
      'bendingUtilization',
      'deflectionUtilization',
      'allowableImposedBendingKpa',
      'allowableImposedDeflectionKpa',
      'allowableImposedKpa',
    ]) {
      expect(zero.governing[key]).toBe(bare.governing[key]);
    }
    expect(zero.governing.cracked).toBe(bare.governing.cracked);
    expect(zero.verdict.headline).toBe(bare.verdict.headline);
  });

  it('says in words which of the two load cases produced the numbers', () => {
    expect(bare.assumptions.summary).toContain('No wall load detected on the tip');
    expect(bare.assumptions.tipWallCount).toBe(0);

    expect(loaded.assumptions.summary).toContain('facade line load from 1 wall(s) on the tip');
    expect(loaded.assumptions.summary).toContain('3 kN/m of run');
    expect(loaded.assumptions.tipWallCount).toBe(1);
    expect(loaded.assumptions.tipLineLoadKnPerM).toBe(TIP_LINE_LOAD_KN_PER_M);
  });

  it('counts a wall that runs along two of a corner bay runs once', () => {
    const slab = referenceSlab();
    const overhang = {
      slabId: 'slab_upper',
      maxDepthMm: 1000,
      overhangEdges: [
        { start: { x: 3000, y: 5600 }, end: { x: 0, y: 5600 }, depthMm: 1000, lengthMm: 3000 },
        { start: { x: 0, y: 5600 }, end: { x: 0, y: 0 }, depthMm: 1000, lengthMm: 5600 },
      ],
    };
    const report = analyzeSlabCantilever({
      slab,
      overhang,
      tipLoads: [
        { lineLoadKnPerM: 2, wallCount: 1, wallIds: ['wall_face'] },
        { lineLoadKnPerM: 4, wallCount: 2, wallIds: ['wall_face', 'wall_return'] },
      ],
    });

    expect(report.assumptions.tipWallCount).toBe(2);
    expect(report.assumptions.tipLineLoadKnPerM).toBe(4);
    // Each run still carries its own load, not the slab's total.
    expect(report.edges[0].tipLineLoadKnPerM).toBe(2);
    expect(report.edges[1].tipLineLoadKnPerM).toBe(4);
  });

  it('looks a tip load up by the run measured, not the run analysed', () => {
    // The first run is too shallow to analyse and is dropped on the way in, so
    // the surviving run is edges[0] here and sourceIndex 1 in the geometry.
    const overhang = {
      slabId: 'slab_upper',
      maxDepthMm: 1000,
      overhangEdges: [
        { start: { x: 3000, y: 5600 }, end: { x: 2000, y: 5600 }, depthMm: 20, lengthMm: 1000 },
        { start: { x: 2000, y: 5600 }, end: { x: 0, y: 5600 }, depthMm: 1000, lengthMm: 2000 },
      ],
    };
    const report = analyzeSlabCantilever({
      slab: referenceSlab(),
      overhang,
      tipLoads: [
        { lineLoadKnPerM: 99, wallCount: 1, wallIds: ['wall_nib'] },
        { lineLoadKnPerM: 3, wallCount: 1, wallIds: ['wall_face'] },
      ],
    });

    expect(report.edges).toHaveLength(1);
    expect(report.edges[0].sourceIndex).toBe(1);
    expect(report.edges[0].tipLineLoadKnPerM).toBe(3);
  });
});

describe('deriveOverhangTipLoads — is there actually a wall on that edge?', () => {
  function floorWith(walls) {
    return { id: 'first', elevation: 0, floorToFloorHeight: 3000, columns: [], beams: [], slabs: [], walls };
  }

  /** Runs along the projecting edge of the reference plate, 2.4 m of 150 CHB. */
  function tipWall(overrides = {}) {
    return {
      ...createWall({ x: 3000, y: 5600 }, { x: 0, y: 5600 }, 150, { height: 2400 }),
      id: 'wall_tip',
      ...overrides,
    };
  }

  it('finds a wall standing on the projecting run and weighs it by assembly and height', () => {
    const [load] = deriveOverhangTipLoads({ overhang: referenceOverhang(), floor: floorWith([tipWall()]) });

    expect(load.wallCount).toBe(1);
    expect(load.wallIds).toEqual(['wall_tip']);
    expect(load.lineLoadKnPerM).toBeCloseTo(MASONRY_WALL_SELF_WEIGHT_KPA * 2.4, 9);
    expect(load.lineLoadKnPerM).toBeCloseTo(6.48, 9);
  });

  it('leaves a wall standing on the back-span out of the tip load', () => {
    const backSpan = { ...createWall({ x: 3000, y: 2000 }, { x: 0, y: 2000 }, 150, { height: 2400 }), id: 'wall_back' };

    expect(deriveOverhangTipLoads({ overhang: referenceOverhang(), floor: floorWith([backSpan]) })).toEqual([
      { lineLoadKnPerM: 0, wallCount: 0, wallIds: [] },
    ]);
  });

  it('weighs a board wall as a board wall, not as masonry', () => {
    const framed = tipWall({ assembly: { preset: 'fiber_cement' } });
    const [load] = deriveOverhangTipLoads({ overhang: referenceOverhang(), floor: floorWith([framed]) });

    expect(load.lineLoadKnPerM).toBeCloseTo(FRAMED_WALL_SELF_WEIGHT_KPA * 2.4, 9);
    expect(load.lineLoadKnPerM).toBeLessThan(MASONRY_WALL_SELF_WEIGHT_KPA * 2.4);
  });

  it('takes a bypass wall over the whole run the views draw it on', () => {
    // 250 below its own floor at 0, up to the floor above at 3000: 3.25 m tall,
    // not the 2.4 m its stored height still says.
    const bypass = tipWall({ framingMode: 'bypass', bypassDrop: 250 });
    const [load] = deriveOverhangTipLoads({ overhang: referenceOverhang(), floor: floorWith([bypass]) });

    expect(load.lineLoadKnPerM).toBeCloseTo(MASONRY_WALL_SELF_WEIGHT_KPA * 3.25, 9);
  });

  it('follows the wall to where it is BUILT, not where it is drawn', () => {
    // Drawn 400 inboard of the projecting edge — too far to count — but built on
    // it by its outboard offset.
    const drawnInboard = { ...createWall({ x: 3000, y: 5200 }, { x: 0, y: 5200 }, 150, { height: 2400 }) };
    const onAxis = deriveOverhangTipLoads({ overhang: referenceOverhang(), floor: floorWith([drawnInboard]) });
    // start → end runs in −x, so "right" of it is −y; the offset goes the other way.
    const offset = deriveOverhangTipLoads({
      overhang: referenceOverhang(),
      floor: floorWith([{ ...drawnInboard, outboardOffset: -400 }]),
    });

    expect(onAxis[0].wallCount).toBe(0);
    expect(offset[0].wallCount).toBe(1);
  });

  it('has nothing to report about a floor with no walls, or a plate with no overhang', () => {
    expect(deriveOverhangTipLoads({ overhang: referenceOverhang(), floor: floorWith([]) })).toEqual([
      { lineLoadKnPerM: 0, wallCount: 0, wallIds: [] },
    ]);
    expect(deriveOverhangTipLoads({ overhang: null, floor: floorWith([tipWall()]) })).toEqual([]);
    expect(deriveOverhangTipLoads({})).toEqual([]);
  });
});

describe('overhangBackSpanMm', () => {
  const boundary = rectangle(0, 0, 3000, 5600);

  it('measures inward from the projecting edge, net of the projection', () => {
    const edge = { start: { x: 3000, y: 5600 }, end: { x: 0, y: 5600 } };

    expect(overhangBackSpanMm(edge, boundary, 600)).toBeCloseTo(5000, 6);
  });

  it('never reports a negative back-span', () => {
    const edge = { start: { x: 3000, y: 5600 }, end: { x: 0, y: 5600 } };

    expect(overhangBackSpanMm(edge, boundary, 9000)).toBe(0);
  });

  it('has no answer when the edge has no readable normal', () => {
    expect(overhangBackSpanMm({ start: { x: 0, y: 0 }, end: { x: 0, y: 0 } }, boundary, 100)).toBeNull();
  });
});
