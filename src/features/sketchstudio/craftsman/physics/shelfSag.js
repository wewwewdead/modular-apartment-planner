/**
 * Shelf deflection (sag) from Euler-Bernoulli beam theory.
 *
 * A shelf is a beam. Every case below is a textbook closed form; nothing is
 * fitted or tuned, so the arithmetic can be checked by hand and the unit tests
 * do exactly that.
 *
 *   load        supports      maximum deflection at midspan
 *   ----------  ------------  -----------------------------
 *   uniform     simple        5 w L^4 / (384 E I)
 *   uniform     fixed both    1 w L^4 / (384 E I)     (one fifth of simple)
 *   centre pt   simple        P L^3 / (48 E I)
 *   centre pt   fixed both    P L^3 / (192 E I)       (one quarter of simple)
 *
 *   I = b t^3 / 12   for a rectangular section, b = shelf width, t = thickness
 *
 * (Roark's Formulas for Stress and Strain, Table 8.1, cases 1a/1c/2a/2c; the
 * same four rows appear in every statics text.)
 *
 * Units
 * -----
 * Everything in this module is newtons and millimetres, which makes the
 * formulas dimensionally clean without a single conversion factor inside them:
 *
 *   E in N/mm^2 (= MPa; 1 GPa = 1000 N/mm^2)
 *   I in mm^4
 *   w in N/mm (line load)      P in N (point load)
 *   L in mm                    deflection in mm
 *
 * Mass -> force happens once, at the input boundary, using standard gravity.
 *
 * Accuracy caveat
 * ---------------
 * `E` comes from clear, straight-grained small specimens (see
 * `woodProperties`). Real boards are less stiff, and wood also CREEPS: a shelf
 * under sustained load settles to roughly twice its initial elastic deflection
 * over a year or two ([WH] Ch.5, time-dependent behaviour). This function
 * reports the elastic deflection, which is the number every shelf calculator
 * reports; treat a "borderline" verdict as "will look bad in two years".
 */

import { getMaterialModulusGPa } from './woodProperties';

/** Standard gravity, m/s^2 (CGPM 1901; ISO 80000-3). */
export const STANDARD_GRAVITY = 9.80665;

const GPA_TO_N_PER_MM2 = 1000;
const MM_PER_M = 1000;

/**
 * Default shelf load: 25 kg per linear metre of shelf.
 *
 * A typical hardcover is about 240 x 160 x 30mm and 0.75kg, so a densely packed
 * metre holds 1000/30 = 33 volumes = ~25kg. Woodworking references quote
 * 20-25 kg/m (13-17 lb/ft) for a full run of hardbacks and about half that for
 * paperbacks. 25 kg/m is therefore the pessimistic end of "a shelf of books",
 * which is the right default for a warning.
 */
export const DEFAULT_BOOK_LOAD_KG_PER_M = 25;

/**
 * The classic eyeball rule: a shelf that deflects more than 1/32 inch per foot
 * of span reads as sagging to the naked eye (the rule the Sagulator and most
 * shelf references quote).
 *
 *   1/32 in = 0.79375mm over 1 ft = 304.8mm
 *   0.79375 / 304.8 = 0.0026042 mm/mm = 2.604 mm/m
 *
 * We round the "fine" ceiling to 2.7 mm/m - within the noise of an eyeball
 * rule - and call anything past 4.0 mm/m (about 1.5x the rule) a sag nobody
 * will accept.
 */
export const SAG_RULE_MM_PER_M = 2.604;
export const SAG_FINE_MM_PER_M = 2.7;
export const SAG_BORDERLINE_MM_PER_M = 4.0;

export const SAG_VERDICTS = Object.freeze({
  FINE: 'fine',
  BORDERLINE: 'borderline',
  SAGS: 'sags',
});

const VERDICT_LABELS = Object.freeze({
  [SAG_VERDICTS.FINE]: 'Fine',
  [SAG_VERDICTS.BORDERLINE]: 'Borderline',
  [SAG_VERDICTS.SAGS]: 'Sags',
});

export const LOAD_TYPES = Object.freeze({ UNIFORM: 'uniform', CENTER: 'center' });
export const FIXITIES = Object.freeze({ SIMPLE: 'simple', FIXED: 'fixed' });

/** Numerator coefficient of the four closed forms, keyed loadType:fixity. */
const DEFLECTION_COEFFICIENTS = Object.freeze({
  'uniform:simple': 5 / 384,
  'uniform:fixed': 1 / 384,
  'center:simple': 1 / 48,
  'center:fixed': 1 / 192,
});

function toPositiveNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

/** Second moment of area of a rectangular section about its bending axis. */
export function computeSecondMomentOfArea(widthMm, thicknessMm) {
  const width = toPositiveNumber(widthMm);
  const thickness = toPositiveNumber(thicknessMm);
  return (width * thickness ** 3) / 12;
}

export function classifySag(sagPerMeterMm) {
  if (sagPerMeterMm < SAG_FINE_MM_PER_M) {
    return SAG_VERDICTS.FINE;
  }
  if (sagPerMeterMm < SAG_BORDERLINE_MM_PER_M) {
    return SAG_VERDICTS.BORDERLINE;
  }
  return SAG_VERDICTS.SAGS;
}

/**
 * Resolve the two load descriptions onto both a line load and a total mass, so
 * the result can report either without the caller having to redo the division.
 */
function resolveLoad({ loadKgPerM, totalLoadKg, spanMm }) {
  const perMetre = toPositiveNumber(loadKgPerM);
  if (perMetre > 0) {
    return { loadKgPerM: perMetre, totalLoadKg: (perMetre * spanMm) / MM_PER_M };
  }

  const total = toPositiveNumber(totalLoadKg);
  if (total > 0) {
    return { loadKgPerM: (total * MM_PER_M) / spanMm, totalLoadKg: total };
  }

  return null;
}

/**
 * Maximum deflection of a rectangular shelf.
 *
 * @param {object} input
 * @param {number} input.spanMm clear span between supports.
 * @param {number} input.widthMm shelf depth (the horizontal dimension, b in I = b t^3/12).
 * @param {number} input.thicknessMm shelf thickness (t).
 * @param {object|string} [input.material] catalog material or id; supplies E.
 * @param {number} [input.modulusGPa] explicit E, overrides the material lookup.
 * @param {number} [input.loadKgPerM] distributed load in kg per metre of span.
 * @param {number} [input.totalLoadKg] total load in kg (alternative to loadKgPerM).
 * @param {'uniform'|'center'} [input.loadType]
 * @param {'simple'|'fixed'} [input.fixity]
 * @returns {{deflectionMm:number, sagPerMeterMm:number, verdict:string,
 *   verdictLabel:string, modulusGPa:number, momentOfInertiaMm4:number,
 *   lineLoadNPerMm:number, pointLoadN:number, totalLoadKg:number,
 *   loadKgPerM:number, spanMm:number, loadType:string, fixity:string} | null}
 *   null when an input is missing or non-physical - the readout shows a dash
 *   rather than a fabricated zero.
 */
export function estimateShelfSag({
  spanMm,
  widthMm,
  thicknessMm,
  material = null,
  modulusGPa = null,
  loadKgPerM = null,
  totalLoadKg = null,
  loadType = LOAD_TYPES.UNIFORM,
  fixity = FIXITIES.SIMPLE,
} = {}) {
  const span = toPositiveNumber(spanMm);
  const width = toPositiveNumber(widthMm);
  const thickness = toPositiveNumber(thicknessMm);
  if (!span || !width || !thickness) {
    return null;
  }

  const resolvedModulusGPa = toPositiveNumber(modulusGPa) || toPositiveNumber(getMaterialModulusGPa(material));
  if (!resolvedModulusGPa) {
    return null;
  }

  const load = resolveLoad({ loadKgPerM, totalLoadKg, spanMm: span });
  if (!load) {
    return null;
  }

  const resolvedLoadType = loadType === LOAD_TYPES.CENTER ? LOAD_TYPES.CENTER : LOAD_TYPES.UNIFORM;
  const resolvedFixity = fixity === FIXITIES.FIXED ? FIXITIES.FIXED : FIXITIES.SIMPLE;
  const coefficient = DEFLECTION_COEFFICIENTS[`${resolvedLoadType}:${resolvedFixity}`];

  const elasticModulus = resolvedModulusGPa * GPA_TO_N_PER_MM2; // N/mm^2
  const momentOfInertia = computeSecondMomentOfArea(width, thickness); // mm^4
  const stiffness = elasticModulus * momentOfInertia; // N*mm^2

  // Line load w in N/mm, and the equivalent single force P in N. A uniform case
  // uses w and L^4; a centre case uses P and L^3.
  const lineLoad = (load.loadKgPerM * STANDARD_GRAVITY) / MM_PER_M;
  const pointLoad = load.totalLoadKg * STANDARD_GRAVITY;

  const deflectionMm =
    resolvedLoadType === LOAD_TYPES.UNIFORM
      ? (coefficient * lineLoad * span ** 4) / stiffness
      : (coefficient * pointLoad * span ** 3) / stiffness;

  const sagPerMeterMm = (deflectionMm * MM_PER_M) / span;

  const verdict = classifySag(sagPerMeterMm);

  // Values are returned at full precision. Rounding is a presentation concern,
  // and rounding here would make the module impossible to check against a
  // hand-computed reference to more than three decimals.
  return {
    deflectionMm,
    sagPerMeterMm,
    verdict,
    verdictLabel: VERDICT_LABELS[verdict],
    modulusGPa: resolvedModulusGPa,
    momentOfInertiaMm4: momentOfInertia,
    lineLoadNPerMm: lineLoad,
    pointLoadN: pointLoad,
    totalLoadKg: load.totalLoadKg,
    loadKgPerM: load.loadKgPerM,
    spanMm: span,
    widthMm: width,
    thicknessMm: thickness,
    loadType: resolvedLoadType,
    fixity: resolvedFixity,
  };
}
