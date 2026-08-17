import { describe, expect, it } from 'vitest';
import {
  ASSUMED_CONCRETE_GRADE,
  CANTILEVER_SPAN_MULTIPLIER,
  CONCRETE_CREEP_COEFFICIENT,
  CONCRETE_MEAN_TENSILE_STRENGTH_MPA,
  CONCRETE_SECANT_MODULUS_MPA,
  DEFLECTION_SPAN_DENOMINATOR,
  IMPOSED_LOAD_BALCONY_KPA,
  PARTIAL_FACTOR_PERMANENT,
  PARTIAL_FACTOR_VARIABLE,
  QUASI_PERMANENT_FACTOR,
  REINFORCED_CONCRETE_UNIT_WEIGHT_KN_PER_M3,
  SUPERIMPOSED_DEAD_LOAD_KPA,
  analyzeSlabCantilever,
  cantileverDeflectionLimitMm,
  cantileverRootMomentNmm,
  cantileverTipDeflectionMm,
  effectiveConcreteModulusMpa,
  overhangBackSpanMm,
  slabStripSection,
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
