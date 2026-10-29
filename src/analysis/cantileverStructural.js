/**
 * What a cantilevered slab can carry, and how far it will droop.
 *
 * `floorOverhang` measures the plan geometry — where a slab reaches past the
 * storey below and by how much. That is a dimension, not an answer: a 300 mm
 * nib and a 2.5 m balcony are the same kind of fact and completely different
 * structures. This module is the other half of the question. It takes one
 * metre-wide strip of the slab, treats it as a uniformly loaded cantilever
 * built in at the support line, and reports what that strip can hold, how far
 * its tip settles, and how much of its bending capacity the design load uses.
 *
 * **This is a planning estimate, not a design.** The slab model carries a
 * thickness and nothing else — no concrete grade, no reinforcement, no
 * exposure class — so every one of those is an assumption stated below and
 * surfaced in the UI alongside the numbers. The reinforcement assumption is
 * deliberately the code MINIMUM, because for an unspecified slab that is the
 * only defensible floor: it under-states a properly detailed balcony and never
 * over-states one. Anything that matters gets designed by an engineer, and the
 * rest of this codebase's structural output says so too.
 *
 * **Units.** Everything internal is newtons and millimetres, which is what
 * makes the mixed-unit mistakes impossible: E in N/mm² (MPa), I in mm⁴, L in
 * mm, so wL⁴/(8EI) falls out in mm with no conversion factor anywhere. A
 * uniform area load of 1 kN/m² acting on a strip 1 m wide is a line load of
 * 1 kN/m, which is exactly 1 N/mm — so kN/m² and N/mm are the same number here
 * and the strip width never appears in an arithmetic step. Outputs are
 * converted once, at the end: mm for deflection, kN·m for moment, kN/m² for
 * load.
 */

import { DEFAULT_STRUCTURAL_COORDINATION_PROFILE } from '@/domain/structuralCoordination';
import { resolveWallAssembly } from '@/domain/wallAssemblies';
import { resolveWallVerticalSpan } from '@/domain/wallFit';
import { beamSupportsOverhang, MIN_REPORTED_OVERHANG_MM, overhangEdgeInwardNormal } from '@/geometry/floorOverhang';
import { distance } from '@/geometry/point';
import { getWallRenderData } from '@/geometry/wallColumnGeometry';

/* ── Section ─────────────────────────────────────────────────────────────
 *
 * The analysed strip: one metre of slab width, spanning out from the support
 * line. Rectangular, so its properties come straight off the thickness.
 */

/** Width of the analysed strip. Every "per metre" figure is per this width. */
export const STRIP_WIDTH_MM = 1000;

/* ── Materials ───────────────────────────────────────────────────────────
 *
 * A slab in this model has a thickness and no material, so one is assumed:
 * ordinary reinforced concrete of the lowest grade normally used for a
 * suspended floor. The grade is named in the UI next to every number it
 * produces.
 */

/** Assumed concrete grade. Lowest grade in common use for a suspended RC slab. */
export const ASSUMED_CONCRETE_GRADE = 'C25/30';

/** f_ck for C25/30 — EN 1992-1-1:2004 Table 3.1. */
export const CONCRETE_CHARACTERISTIC_STRENGTH_MPA = 25;

/** f_ctm for C25/30 — EN 1992-1-1:2004 Table 3.1. Sets the cracking moment. */
export const CONCRETE_MEAN_TENSILE_STRENGTH_MPA = 2.6;

/** E_cm for C25/30, 31 GPa — EN 1992-1-1:2004 Table 3.1. */
export const CONCRETE_SECANT_MODULUS_MPA = 31000;

/** γ_C for persistent/transient design situations — EN 1992-1-1:2004 Table 2.1N. */
export const CONCRETE_PARTIAL_FACTOR = 1.5;

/**
 * Long-term creep coefficient φ(∞,t₀).
 *
 * EN 1992-1-1:2004 §3.1.4 Figure 3.1: for a ~200 mm C25/30 member in outside
 * conditions (RH 80 %) loaded at 28 days, φ lands near 2. A projecting slab is
 * the outdoor case; interior members creep more, so this is not the worst
 * number in the chart. It enters through the effective-modulus method,
 * E_c,eff = E_cm/(1 + φ), EN 1992-1-1:2004 §7.4.3(5).
 */
export const CONCRETE_CREEP_COEFFICIENT = 2.0;

/** f_yk for class B/C reinforcement — EN 1992-1-1:2004 §3.2.2 / Annex C. */
export const REINFORCEMENT_CHARACTERISTIC_STRENGTH_MPA = 500;

/** γ_S for persistent/transient design situations — EN 1992-1-1:2004 Table 2.1N. */
export const REINFORCEMENT_PARTIAL_FACTOR = 1.15;

/**
 * Nominal cover c_nom = c_min,dur + Δc_dev.
 *
 * EN 1992-1-1:2004 §4.4.1: exposure class XC3 (external concrete sheltered
 * from rain — the mildest class a projecting slab can claim) gives
 * c_min,dur = 25 mm for structural class S4, plus Δc_dev = 10 mm.
 */
export const NOMINAL_COVER_MM = 35;

/** Assumed main bar, used only to place the bar centroid: d = t − c_nom − φ/2. */
export const ASSUMED_BAR_DIAMETER_MM = 12;

/** λ in the rectangular stress block, f_ck ≤ 50 MPa — EN 1992-1-1:2004 §3.1.7(3). */
export const STRESS_BLOCK_DEPTH_FACTOR = 0.8;

/**
 * Conventional cap on the lever arm, z ≤ 0.95d.
 *
 * Standard UK/Eurocode practice (e.g. the Concrete Centre's *How to design
 * concrete structures using Eurocode 2*): the force-balance lever arm of a
 * very lightly reinforced section runs away towards d, and the cap keeps the
 * result inside the range the stress block was calibrated for.
 */
export const MAX_LEVER_ARM_FACTOR = 0.95;

/* ── Loads ───────────────────────────────────────────────────────────────── */

/** Reinforced concrete, 25 kN/m³ — EN 1991-1-1:2002 Table A.1. */
export const REINFORCED_CONCRETE_UNIT_WEIGHT_KN_PER_M3 = 25;

/**
 * Superimposed dead load: screed, finish, soffit and services.
 *
 * EN 1991-1-1:2002 Table A.1 puts cement screed at 21–23 kN/m³, so ~50 mm of
 * screed is already 1.1 kN/m²; 1.5 kN/m² covers that plus a finish and a light
 * soffit. A configured planning allowance, in the same spirit as the
 * structural coordination profile — not a code value.
 */
export const SUPERIMPOSED_DEAD_LOAD_KPA = 1.5;

/**
 * Imposed load q_k, EN 1991-1-1:2002 Table 6.2, Category A (domestic and
 * residential). Floors are given as 1.5–2.0 kN/m²; balconies as 2.5–4.0 with
 * 3.0 recommended.
 *
 * A slab reaching out past the storey below is a projecting surface, so the
 * balcony value is the one used — the heavier of the two, and the one that
 * matches what a cantilever usually is.
 */
export const IMPOSED_LOAD_RESIDENTIAL_FLOOR_KPA = 2.0;
export const IMPOSED_LOAD_BALCONY_KPA = 3.0;

/* ── The wall standing on the free end ───────────────────────────────────
 *
 * A projecting bay is not a balcony with a heavier finish. Its defining load is
 * a facade standing on the tip, and a cantilever feels weight at its tip far
 * more than the same weight spread along its reach: P·L against wL²/2 for the
 * moment, P·L³/(3EI) against wL⁴/(8EI) for the droop. A wall in this model
 * carries an assembly and no density, so the assembly is what its weight is
 * assumed from — the same move the slab makes with its thickness, and stated in
 * the UI for the same reason.
 */

/**
 * Self-weight of a light framed wall — studs, board on both faces, insulation
 * and fixings — per square metre of wall FACE.
 *
 * ASCE/SEI 7-22 Table C3.1-1a (minimum design dead loads) puts an exterior stud
 * wall with board finishes at about 11 lb/ft², which is 0.53 kN/m². Building the
 * same wall up from EN 1991-1-1:2002 Table A.1 material weights lands lower —
 * two 6 mm fibre-cement skins are barely 0.2 kN/m² — so 0.5 sits at the generous
 * end of the band, which is the safe end for a load.
 */
export const FRAMED_WALL_SELF_WEIGHT_KPA = 0.5;

/**
 * Self-weight of a CHB masonry wall, per square metre of face: 150 mm hollow
 * concrete block, plastered both sides.
 *
 * Worked from EN 1991-1-1:2002 Table A.1. Normal-weight concrete at 24 kN/m³
 * through a block roughly 57 % solid gives 0.150 · 24 · 0.57 ≈ 2.05 kN/m², and
 * 16 mm of cement plaster on each face (21 kN/m³ in the same table) adds
 * ≈ 0.67. The 2.7 kN/m² total is also the figure Philippine practice carries
 * for 150 CHB, and PH is this model's default jurisdiction.
 */
export const MASONRY_WALL_SELF_WEIGHT_KPA = 2.7;

/** γ_G and γ_Q, STR ultimate combination Eq. 6.10 — EN 1990:2002 Table A1.2(B). */
export const PARTIAL_FACTOR_PERMANENT = 1.35;
export const PARTIAL_FACTOR_VARIABLE = 1.5;

/**
 * ψ₂ for Category A imposed load — EN 1990:2002 Table A1.1.
 *
 * Deflection is checked under the quasi-permanent combination G + ψ₂Q, which
 * is the right partner for a creep-adjusted modulus: only the sustained part
 * of the load has been acting long enough to creep.
 */
export const QUASI_PERMANENT_FACTOR = 0.3;

/* ── Serviceability limit ────────────────────────────────────────────────── */

/**
 * Total deflection limit span/250 under quasi-permanent loads —
 * EN 1992-1-1:2004 §7.4.1(4).
 */
export const DEFLECTION_SPAN_DENOMINATOR = 250;

/**
 * CONVENTION: for a cantilever the "span" in a span/n limit is twice the
 * projection — IBC Table 1604.3 footnote ("For cantilever members, l shall be
 * taken as twice the length of the cantilever"), the same rule ACI 318 uses.
 * So the limit applied here is 2L/250, i.e. L/125, and the panel states the
 * 2L/250 form so nobody has to guess which convention produced it.
 */
export const CANTILEVER_SPAN_MULTIPLIER = 2;

/** Above this fraction of a limit a result is reported as worth watching. */
export const UTILIZATION_WATCH_RATIO = 0.85;

const MM_PER_M = 1000;

const NO_ANALYSIS = Object.freeze({ available: false, edges: Object.freeze([]), governing: null });

function round1(value) {
  return Math.round(value * 10) / 10;
}

/**
 * Deflection reads to a tenth of a millimetre, or a hundredth while it is under
 * one — a slab stiff enough to settle 0.13 mm should say so, not report "0".
 */
export function roundDeflectionMm(millimetres) {
  return Math.abs(millimetres) < 1 ? Math.round(millimetres * 100) / 100 : Math.round(millimetres * 10) / 10;
}

function resolveProfile(profile) {
  return { ...DEFAULT_STRUCTURAL_COORDINATION_PROFILE, ...(profile || {}) };
}

function resolveLoads(loads) {
  return {
    superimposedDeadKpa: loads?.superimposedDeadKpa ?? SUPERIMPOSED_DEAD_LOAD_KPA,
    imposedKpa: loads?.imposedKpa ?? IMPOSED_LOAD_BALCONY_KPA,
  };
}

/**
 * Properties of the metre-wide strip, all of them a consequence of thickness.
 *
 * `momentResistanceNmm` is the design bending resistance of that strip with
 * EN 1992-1-1 minimum flexural reinforcement: A_s f_yd z, with the lever arm
 * taken from the rectangular stress-block force balance and capped at 0.95d.
 * `crackingMomentNmm` is f_ctm·S — the moment at which the gross section this
 * module's stiffness is based on stops being the real section.
 */
export function slabStripSection(thicknessMm) {
  const thickness = Number(thicknessMm);
  if (!Number.isFinite(thickness) || thickness <= 0) return null;

  const inertiaMm4 = (STRIP_WIDTH_MM * thickness ** 3) / 12;
  const sectionModulusMm3 = (STRIP_WIDTH_MM * thickness ** 2) / 6;

  const effectiveDepthMm = thickness - NOMINAL_COVER_MM - ASSUMED_BAR_DIAMETER_MM / 2;
  if (effectiveDepthMm <= 0) {
    return {
      thicknessMm: thickness,
      widthMm: STRIP_WIDTH_MM,
      inertiaMm4,
      sectionModulusMm3,
      effectiveDepthMm: 0,
      reinforcementMm2: 0,
      leverArmMm: 0,
      momentResistanceNmm: 0,
      crackingMomentNmm: CONCRETE_MEAN_TENSILE_STRENGTH_MPA * sectionModulusMm3,
    };
  }

  // EN 1992-1-1:2004 §9.2.1.1(1) Eq. (9.1N), applied to slabs through §9.3.1.1:
  // A_s,min = 0.26 (f_ctm/f_yk) b d, but not less than 0.0013 b d.
  const reinforcementMm2 = Math.max(
    0.26 *
      (CONCRETE_MEAN_TENSILE_STRENGTH_MPA / REINFORCEMENT_CHARACTERISTIC_STRENGTH_MPA) *
      STRIP_WIDTH_MM *
      effectiveDepthMm,
    0.0013 * STRIP_WIDTH_MM * effectiveDepthMm,
  );

  const steelDesignStrengthMpa = REINFORCEMENT_CHARACTERISTIC_STRENGTH_MPA / REINFORCEMENT_PARTIAL_FACTOR;
  const concreteDesignStrengthMpa = CONCRETE_CHARACTERISTIC_STRENGTH_MPA / CONCRETE_PARTIAL_FACTOR;
  const tensionForceN = reinforcementMm2 * steelDesignStrengthMpa;
  const neutralAxisMm = tensionForceN / (STRESS_BLOCK_DEPTH_FACTOR * STRIP_WIDTH_MM * concreteDesignStrengthMpa);
  const leverArmMm = Math.min(
    effectiveDepthMm - (STRESS_BLOCK_DEPTH_FACTOR / 2) * neutralAxisMm,
    MAX_LEVER_ARM_FACTOR * effectiveDepthMm,
  );

  return {
    thicknessMm: thickness,
    widthMm: STRIP_WIDTH_MM,
    inertiaMm4,
    sectionModulusMm3,
    effectiveDepthMm,
    reinforcementMm2,
    leverArmMm,
    momentResistanceNmm: tensionForceN * leverArmMm,
    crackingMomentNmm: CONCRETE_MEAN_TENSILE_STRENGTH_MPA * sectionModulusMm3,
  };
}

/** Creep-adjusted modulus, EN 1992-1-1:2004 §7.4.3(5): E_c,eff = E_cm/(1 + φ). */
export function effectiveConcreteModulusMpa() {
  return CONCRETE_SECANT_MODULUS_MPA / (1 + CONCRETE_CREEP_COEFFICIENT);
}

/** Root moment of a uniformly loaded cantilever: M = wL²/2. N·mm from N/mm and mm. */
export function cantileverRootMomentNmm(lineLoadNPerMm, lengthMm) {
  return (lineLoadNPerMm * lengthMm ** 2) / 2;
}

/** Tip deflection of a uniformly loaded cantilever: δ = wL⁴/(8EI). mm. */
export function cantileverTipDeflectionMm(lineLoadNPerMm, lengthMm, modulusMpa, inertiaMm4) {
  if (!(modulusMpa > 0) || !(inertiaMm4 > 0)) return 0;
  return (lineLoadNPerMm * lengthMm ** 4) / (8 * modulusMpa * inertiaMm4);
}

/**
 * The force a metre-wide strip picks up from a line load running along the
 * projecting edge.
 *
 * kN/m along the edge is N/mm — the same identity the area loads lean on — and
 * the strip is STRIP_WIDTH_MM of that line, so the newtons fall out with no
 * conversion factor and the strip width appears exactly once.
 */
export function tipLineLoadStripForceN(lineLoadKnPerM) {
  return lineLoadKnPerM * STRIP_WIDTH_MM;
}

/** Root moment of a cantilever loaded at its tip: M = P·L. N·mm from N and mm. */
export function tipLoadRootMomentNmm(pointLoadN, lengthMm) {
  return pointLoadN * lengthMm;
}

/** Tip deflection under a load at the tip: δ = P·L³/(3EI). mm. */
export function tipLoadDeflectionMm(pointLoadN, lengthMm, modulusMpa, inertiaMm4) {
  if (!(modulusMpa > 0) || !(inertiaMm4 > 0)) return 0;
  return (pointLoadN * lengthMm ** 3) / (3 * modulusMpa * inertiaMm4);
}

/** The deflection a cantilever of this projection is allowed: 2L/250. */
export function cantileverDeflectionLimitMm(lengthMm) {
  return (CANTILEVER_SPAN_MULTIPLIER * lengthMm) / DEFLECTION_SPAN_DENOMINATOR;
}

/**
 * How far the slab carries on behind a projecting edge.
 *
 * Measured along the edge's inward normal, from the edge line to the furthest
 * boundary point behind it, less the projection itself — what is left is the
 * back-span holding the cantilever's tail down. On a slab that projects on
 * opposite sides this counts the far cantilever as back-span, which flatters
 * it; the ratio is a planning check, not a tie-down calculation.
 */
export function overhangBackSpanMm(edge, boundary, depthMm) {
  const inward = overhangEdgeInwardNormal(edge, boundary);
  if (!inward) return null;
  let deepest = 0;
  for (const point of boundary) {
    const reach = (point.x - edge.start.x) * inward.x + (point.y - edge.start.y) * inward.y;
    if (reach > deepest) deepest = reach;
  }
  const backSpan = deepest - depthMm;
  return backSpan > 0 ? backSpan : 0;
}

function analyzeEdge({ edge, index, sourceIndex, boundary, section, loads, profile, modulusMpa, tipLoad }) {
  const depthMm = edge.depthMm || 0;
  const lengthMm = edge.lengthMm ?? distance(edge.start, edge.end);

  const permanentKpa = loads.selfWeightKpa + loads.superimposedDeadKpa;
  const ultimateKpa = PARTIAL_FACTOR_PERMANENT * permanentKpa + PARTIAL_FACTOR_VARIABLE * loads.imposedKpa;
  const quasiPermanentKpa = permanentKpa + QUASI_PERMANENT_FACTOR * loads.imposedKpa;

  // A facade standing on the free end is permanent load, so it takes γ_G in the
  // ultimate combination and goes in unfactored under the quasi-permanent one —
  // exactly the treatment the area permanent loads get, applied to a force
  // instead of a pressure. There is no ψ₂ here: ψ₂ belongs to the variable
  // action, and a wall never leaves.
  const tipLineLoadKnPerM = Math.max(0, Number(tipLoad?.lineLoadKnPerM) || 0);
  const tipWallCount = Math.max(0, Math.round(Number(tipLoad?.wallCount) || 0));
  const tipForceN = tipLineLoadStripForceN(tipLineLoadKnPerM);
  const ultimateTipMomentNmm = tipLoadRootMomentNmm(PARTIAL_FACTOR_PERMANENT * tipForceN, depthMm);
  const quasiTipMomentNmm = tipLoadRootMomentNmm(tipForceN, depthMm);
  const tipLoadDeflection = tipLoadDeflectionMm(tipForceN, depthMm, modulusMpa, section.inertiaMm4);

  // kN/m² on a 1 m strip is N/mm as a line load — see the units note at the top.
  // With no wall on the tip every term added below is exactly zero, so an
  // untouched cantilever reports the same numbers it always did.
  const momentNmm = cantileverRootMomentNmm(ultimateKpa, depthMm) + ultimateTipMomentNmm;
  const serviceMomentNmm = cantileverRootMomentNmm(quasiPermanentKpa, depthMm) + quasiTipMomentNmm;
  const deflectionMm =
    cantileverTipDeflectionMm(quasiPermanentKpa, depthMm, modulusMpa, section.inertiaMm4) + tipLoadDeflection;
  const deflectionLimitMm = cantileverDeflectionLimitMm(depthMm);

  const bendingUtilization = section.momentResistanceNmm > 0 ? momentNmm / section.momentResistanceNmm : Infinity;
  const deflectionUtilization = deflectionLimitMm > 0 ? deflectionMm / deflectionLimitMm : 0;
  const cracked = serviceMomentNmm > section.crackingMomentNmm;

  // Turn each limit back into the imposed load that would just reach it, then
  // strip out the permanent load that is already spent. Both are per metre of
  // slab width; the smaller one is what the cantilever will actually take.
  //
  // The tip load is spent before the area load ever gets a share, so it comes
  // off the capacity rather than out of the answer: what the wall has already
  // taken of the moment, and of the millimetres of droop, is not available to
  // anything else. Both terms vanish when no wall stands there.
  const bendingCapacityKpa =
    depthMm > 0 ? (2 * (section.momentResistanceNmm - ultimateTipMomentNmm)) / depthMm ** 2 : Infinity;
  const allowableImposedBendingKpa = Math.max(
    0,
    (bendingCapacityKpa - PARTIAL_FACTOR_PERMANENT * permanentKpa) / PARTIAL_FACTOR_VARIABLE,
  );
  const deflectionCapacityKpa =
    depthMm > 0
      ? (8 * modulusMpa * section.inertiaMm4 * (deflectionLimitMm - tipLoadDeflection)) / depthMm ** 4
      : Infinity;
  const allowableImposedDeflectionKpa = Math.max(0, (deflectionCapacityKpa - permanentKpa) / QUASI_PERMANENT_FACTOR);

  const deflectionGoverns = allowableImposedDeflectionKpa < allowableImposedBendingKpa;
  const allowableImposedKpa = Math.min(allowableImposedBendingKpa, allowableImposedDeflectionKpa);

  const backSpanMm = overhangBackSpanMm(edge, boundary, depthMm);
  const backSpanRatio = backSpanMm != null && depthMm > 0 ? backSpanMm / depthMm : null;
  const requiredBackSpanRatio = profile.minCantileverBackSpanRatio ?? null;
  const backSpanStatus =
    backSpanRatio == null || requiredBackSpanRatio == null
      ? 'unknown'
      : backSpanRatio >= requiredBackSpanRatio
        ? 'ok'
        : 'short';

  const exceedsPlanningLength =
    profile.maxCantileverPlanningLength != null && depthMm > profile.maxCantileverPlanningLength;

  const reasons = [];
  let status = 'ok';
  if (bendingUtilization > 1) {
    status = 'over';
    reasons.push(`bending is ${Math.round(bendingUtilization * 100)}% of the assumed capacity`);
  }
  if (deflectionUtilization > 1) {
    status = 'over';
    reasons.push(`deflection ${roundDeflectionMm(deflectionMm)} mm exceeds the ${round1(deflectionLimitMm)} mm limit`);
  }
  if (status === 'ok') {
    if (bendingUtilization > UTILIZATION_WATCH_RATIO) {
      status = 'watch';
      reasons.push(`bending is ${Math.round(bendingUtilization * 100)}% of the assumed capacity`);
    }
    if (deflectionUtilization > UTILIZATION_WATCH_RATIO) {
      status = 'watch';
      reasons.push(
        `deflection ${roundDeflectionMm(deflectionMm)} mm is close to the ${round1(deflectionLimitMm)} mm limit`,
      );
    }
    if (cracked) {
      status = 'watch';
      reasons.push('the section cracks under sustained load, so the real deflection will be larger than this');
    }
    if (backSpanStatus === 'short') {
      status = 'watch';
      reasons.push(`back-span is ${round1(backSpanRatio)}x the reach, under the ${requiredBackSpanRatio}x assumption`);
    }
    if (exceedsPlanningLength) {
      status = 'watch';
      reasons.push(`the reach is past the ${profile.maxCantileverPlanningLength} mm early-planning assumption`);
    }
  }

  const headline =
    status === 'ok'
      ? `OK — deflection ${roundDeflectionMm(deflectionMm)} mm of a ${round1(deflectionLimitMm)} mm limit, bending ${Math.round(bendingUtilization * 100)}%`
      : `${status === 'over' ? 'Over' : 'Check'} — ${reasons.join('; ')}`;

  return {
    index,
    // Where this run sits in the measured `overhangEdges`, which is NOT its
    // place here: runs too shallow to analyse are dropped on the way in, so the
    // numbering the panel shows and the numbering the plan clicks through are
    // two different sequences. Anything crossing between them — a highlighted
    // run, a run being pulled back — has to carry this.
    sourceIndex,
    boundaryEdgeIndex: Number.isInteger(edge?.boundaryEdgeIndex) ? edge.boundaryEdgeIndex : null,
    lengthMm,
    depthMm,
    // What the wall on the tip contributes, kept separate from the total so the
    // panel can name the load rather than leave the user to infer it from a
    // moment that grew.
    tipLineLoadKnPerM,
    tipWallCount,
    tipMomentKnm: ultimateTipMomentNmm / 1e6,
    momentKnm: momentNmm / 1e6,
    momentResistanceKnm: section.momentResistanceNmm / 1e6,
    bendingUtilization,
    deflectionMm,
    deflectionLimitMm,
    deflectionUtilization,
    cracked,
    allowableImposedKpa,
    allowableImposedBendingKpa,
    allowableImposedDeflectionKpa,
    allowableGovernedBy: deflectionGoverns ? 'deflection' : 'bending',
    backSpanMm,
    backSpanRatio,
    backSpanStatus,
    requiredBackSpanRatio,
    exceedsPlanningLength,
    status,
    reasons,
    headline,
  };
}

const STATUS_RANK = { ok: 0, watch: 1, over: 2 };

/**
 * Analyse one slab's overhang.
 *
 * Returns `{ available: false }` whenever there is nothing to analyse — no
 * measured overhang, no usable thickness, or every projecting run below the
 * depth `floorOverhang` is willing to call an overhang at all. Silence beats a
 * capacity figure for a rebate.
 *
 * @param {object} input
 * @param {object} input.slab the overhanging slab, for thickness and boundary
 * @param {object} input.overhang one entry from `computeFloorOverhangs`
 * @param {object} [input.profile] structural coordination profile, for the limits
 * @param {object} [input.loads] load overrides, in kN/m²
 * @param {Array<{lineLoadKnPerM: number, wallCount: number, wallIds?: string[]}|null>} [input.tipLoads]
 *   what stands on each projecting run's free end, indexed the same way
 *   `overhang.overhangEdges` is — see `deriveOverhangTipLoads`. Omitted means no
 *   wall load, which is what every cantilever was analysed as before.
 */
export function analyzeSlabCantilever({ slab, overhang, profile, loads, tipLoads } = {}) {
  const section = slabStripSection(slab?.thickness);
  const edges = (overhang?.overhangEdges || [])
    .map((edge, sourceIndex) => ({ edge, sourceIndex }))
    .filter(({ edge }) => (edge?.depthMm || 0) > MIN_REPORTED_OVERHANG_MM);
  if (!section || !edges.length) return NO_ANALYSIS;

  const resolvedProfile = resolveProfile(profile);
  const boundary = slab.boundaryPoints || [];
  const modulusMpa = effectiveConcreteModulusMpa();

  const resolvedLoads = {
    // Unit weight is per cubic metre and the thickness is in millimetres, so
    // the conversion happens once, here, and never again downstream.
    selfWeightKpa: (REINFORCED_CONCRETE_UNIT_WEIGHT_KN_PER_M3 * section.thicknessMm) / MM_PER_M,
    ...resolveLoads(loads),
  };
  const permanentKpa = resolvedLoads.selfWeightKpa + resolvedLoads.superimposedDeadKpa;

  const analyzed = edges.map(({ edge, sourceIndex }, index) =>
    analyzeEdge({
      edge,
      index,
      sourceIndex,
      boundary,
      section,
      loads: resolvedLoads,
      profile: resolvedProfile,
      modulusMpa,
      // Indexed by the run's place in the MEASURED geometry, not its place
      // here: shallow runs are dropped on the way in, and a tip load looked up
      // by the wrong index would be a wall put on the wrong side of a building.
      tipLoad: tipLoads?.[sourceIndex] || null,
    }),
  );

  // How many distinct walls the whole slab was found carrying. Counted by id
  // where the caller supplied them, because one wall can run along two of a
  // corner bay's runs and is still one wall in the sentence the panel shows.
  const tipWallIds = new Set();
  for (const { sourceIndex } of edges) {
    for (const wallId of tipLoads?.[sourceIndex]?.wallIds || []) tipWallIds.add(wallId);
  }
  const tipWallCount = tipWallIds.size || analyzed.reduce((total, entry) => total + entry.tipWallCount, 0);
  const heaviestTipLineLoadKnPerM = analyzed.reduce((worst, entry) => Math.max(worst, entry.tipLineLoadKnPerM), 0);

  // The governing run is the one closest to a limit, not the deepest: a short
  // run on a thin plate can be worse off than a longer one on a thick plate.
  const governing = analyzed.reduce((worst, entry) => {
    const rank = (report) => Math.max(report.bendingUtilization, report.deflectionUtilization);
    if (STATUS_RANK[entry.status] !== STATUS_RANK[worst.status]) {
      return STATUS_RANK[entry.status] > STATUS_RANK[worst.status] ? entry : worst;
    }
    return rank(entry) > rank(worst) ? entry : worst;
  }, analyzed[0]);

  return {
    available: true,
    section,
    profile: resolvedProfile,
    assumptions: {
      thicknessMm: section.thicknessMm,
      concreteGrade: ASSUMED_CONCRETE_GRADE,
      creepCoefficient: CONCRETE_CREEP_COEFFICIENT,
      effectiveModulusMpa: modulusMpa,
      reinforcement: 'EN 1992-1-1 minimum',
      tipWallCount,
      tipLineLoadKnPerM: heaviestTipLineLoadKnPerM,
      summary:
        `Assuming a ${Math.round(section.thicknessMm)} mm ${ASSUMED_CONCRETE_GRADE} reinforced-concrete slab with ` +
        `code-minimum flexural reinforcement, ${resolvedLoads.superimposedDeadKpa} kN/m² of finishes and ` +
        `${resolvedLoads.imposedKpa} kN/m² imposed load. Deflection is long-term, under the quasi-permanent ` +
        `combination, against a 2L/250 cantilever limit. ` +
        // Which of the two load cases this is has to be said outright. A number
        // that quietly did or did not include a facade is a number nobody can
        // check, and the two answers differ by more than any of the assumptions
        // above.
        (tipWallCount > 0
          ? `Including a facade line load from ${tipWallCount} wall(s) on the tip, ` +
            `up to ${round1(heaviestTipLineLoadKnPerM)} kN/m of run, taken as permanent load. `
          : 'No wall load detected on the tip, so no facade line load is included. ') +
        `Planning estimate only — not a structural design.`,
    },
    loads: {
      ...resolvedLoads,
      permanentKpa,
      ultimateKpa: PARTIAL_FACTOR_PERMANENT * permanentKpa + PARTIAL_FACTOR_VARIABLE * resolvedLoads.imposedKpa,
      quasiPermanentKpa: permanentKpa + QUASI_PERMANENT_FACTOR * resolvedLoads.imposedKpa,
    },
    edges: analyzed,
    governing,
    totals: {
      edgeCount: analyzed.length,
      totalRunLengthMm: analyzed.reduce((sum, entry) => sum + entry.lengthMm, 0),
      longestRunLengthMm: analyzed.reduce((longest, entry) => Math.max(longest, entry.lengthMm), 0),
      maxDepthMm: analyzed.reduce((deepest, entry) => Math.max(deepest, entry.depthMm), 0),
    },
    verdict: { status: governing.status, headline: governing.headline },
  };
}

/* ── Finding the wall ────────────────────────────────────────────────────
 *
 * The analysis above takes the tip load as an input because it is a strip
 * calculation and has no opinion about plans. Somebody still has to look at the
 * drawing and answer "is there a wall standing on that?", and this is it.
 */

/** kN per square metre of face, from the only thing a wall in this model knows. */
export function wallAssemblySelfWeightKpa(wall) {
  return resolveWallAssembly(wall)?.system === 'masonry' ? MASONRY_WALL_SELF_WEIGHT_KPA : FRAMED_WALL_SELF_WEIGHT_KPA;
}

/**
 * The facade line load standing on each of a slab's projecting runs.
 *
 * "Standing on it" is the same plan question `beamSupportsOverhang` asks of a
 * beam, asked of the wall's BUILT body instead of its drawn axis — an outboard
 * facade is dimensioned on the grid line and lands somewhere else, and it is
 * where it lands that the plate feels. Weight per metre of run is the assembly's
 * weight per square metre of face times the height the views actually draw, so a
 * bypass wall that runs a storey and a bit is counted over all of it.
 *
 * Two knowingly conservative simplifications, both in the direction of a heavier
 * cantilever: a return wall running from the root out to the tip is counted at
 * its full weight even though only its far end is really at the tip, and where
 * two walls meet at a bay corner both are counted on both runs they touch.
 *
 * @param {object} input
 * @param {object} input.overhang one entry from `computeFloorOverhangs`
 * @param {object} input.floor the floor the slab and its walls belong to
 * @param {object} [input.project] only sharpens the elevation of a floor that
 *   carries none of its own
 * @returns {Array<{lineLoadKnPerM: number, wallCount: number, wallIds: string[]}>}
 *   one entry per `overhang.overhangEdges`, in the same order
 */
export function deriveOverhangTipLoads({ overhang, floor, project = null, proximityMm } = {}) {
  const runs = overhang?.overhangEdges || [];
  if (!runs.length) return [];

  const nothing = () => runs.map(() => ({ lineLoadKnPerM: 0, wallCount: 0, wallIds: [] }));
  const walls = floor?.walls || [];
  if (!walls.length) return nothing();

  const columns = floor?.columns || [];
  const bodies = [];
  for (const wall of walls) {
    const rendered = getWallRenderData(wall, columns);
    if (!rendered?.trimStart || !rendered?.trimEnd) continue;
    const span = resolveWallVerticalSpan(wall, floor, project);
    const heightMm = Math.max(0, (span?.top ?? 0) - (span?.base ?? 0));
    if (!(heightMm > 0)) continue;
    bodies.push({
      wallId: wall.id,
      start: rendered.trimStart,
      end: rendered.trimEnd,
      // kPa of face × metres of height = kN per metre of run.
      lineLoadKnPerM: (wallAssemblySelfWeightKpa(wall) * heightMm) / MM_PER_M,
    });
  }
  if (!bodies.length) return nothing();

  return runs.map((run) => {
    const carried = bodies.filter((body) => beamSupportsOverhang(body, [run], proximityMm));
    return {
      lineLoadKnPerM: carried.reduce((total, body) => total + body.lineLoadKnPerM, 0),
      wallCount: carried.length,
      wallIds: carried.map((body) => body.wallId),
    };
  });
}
