/**
 * Bringing a meteorological wind speed to the height the study runs at.
 *
 * ## The mismatch this closes
 *
 * Every speed that enters the wind stack is a 10 m open-terrain figure. The
 * Open-Meteo reanalysis is `wind_speed_10m` by request (windClimate.js), the
 * per-sector Weibull scales are fitted to those samples, and `referenceSpeed`
 * is written straight from `prevailingMeanSpeed` when a site climate is loaded.
 * That is the meteorological standard: 10 m above short grass, well clear of
 * obstacles.
 *
 * The LBM slice runs at `sliceHeight`, 1500 mm by default, in whatever terrain
 * the site actually sits in. Feeding a 10 m open-country speed straight into a
 * 1.5 m suburban slice over-reports every speed and every air-change rate in
 * the model, by roughly a third at the default settings. This module is the one
 * place that correction is applied.
 *
 * ## The transformation
 *
 *   U(z) = U_ref * (z / z_ref)^alpha,   z_ref = 10 m
 *
 * The power law is the standard engineering profile for the atmospheric
 * boundary layer. The exponents are the ASHRAE Handbook — Fundamentals terrain
 * categories (Ch. 24, "Airflow Around Buildings", Table 1):
 *
 *   open        alpha 0.14   open terrain with scattered obstructions; this is
 *                            also the category a met station is sited in, so it
 *                            is the terrain the 10 m reference belongs to.
 *   suburban    alpha 0.22   urban, suburban and wooded areas.
 *   dense-urban alpha 0.33   large city centres, where at least half the
 *                            buildings exceed 21 m.
 *
 * ## What this simplification leaves out, deliberately
 *
 * ASHRAE's full form is a TWO-terrain transformation: it lifts the met speed to
 * the top of the met station's own boundary layer and brings it back down
 * through the site's, carrying a (delta_met / H_met)^a_met * (H / delta)^a
 * ratio with per-category boundary-layer thicknesses. Applied here it would
 * agree exactly for `open` — same terrain both ends — and would push the
 * suburban and dense-urban factors lower still (roughly 0.47 and 0.24 at 1.5 m,
 * against 0.66 and 0.53 below). The single-exponent form is used because it is
 * the transformation the approved plan specifies and the one a reader can check
 * by hand; the direction of the omission is disclosed here rather than hidden,
 * and it is conservative in the sense that it over-reports rather than
 * under-reports wind in built-up terrain.
 *
 * Nothing here gives the LBM a sheared inlet: the solver still runs a uniform
 * 2D slice. This is a single scalar applied to the reference speed, and the
 * disclaimer says so.
 */

import { DEFAULT_SITE_EXPOSURE_CLASS, SITE_EXPOSURE_CLASSES } from '@/domain/defaults';

/** ASHRAE Fundamentals terrain exponents; see the module comment for sources. */
export const EXPOSURE_ALPHA = Object.freeze({
  open: 0.14,
  suburban: 0.22,
  'dense-urban': 0.33,
});

/** Height the climate data is quoted at, metres. Meteorological standard. */
export const CLIMATE_REFERENCE_HEIGHT_M = 10;

/** Below this the power law stops meaning anything; clamped, not extrapolated. */
const MIN_SLICE_HEIGHT_M = 0.1;

function resolveExposureClass(value) {
  return SITE_EXPOSURE_CLASSES.includes(value) && EXPOSURE_ALPHA[value] !== undefined
    ? value
    : DEFAULT_SITE_EXPOSURE_CLASS;
}

/**
 * The exposure block a study stamps on its model, and the factor it applies.
 *
 * @param {object} options
 * @param {string} [options.exposureClass]  Site terrain class; anything
 *   unrecognised falls back to the default rather than to a factor of 1.
 * @param {number} [options.sliceHeightMm]  Height the study slice runs at, mm.
 * @returns {{class: string, alpha: number, referenceHeightM: number, sliceHeightM: number, factor: number}}
 */
export function siteExposure({ exposureClass, sliceHeightMm } = {}) {
  const className = resolveExposureClass(exposureClass);
  const alpha = EXPOSURE_ALPHA[className];
  const rawHeightM = Number(sliceHeightMm) / 1000;
  const sliceHeightM = Number.isFinite(rawHeightM) ? Math.max(MIN_SLICE_HEIGHT_M, rawHeightM) : MIN_SLICE_HEIGHT_M;
  return {
    class: className,
    alpha,
    referenceHeightM: CLIMATE_REFERENCE_HEIGHT_M,
    sliceHeightM,
    factor: Math.pow(sliceHeightM / CLIMATE_REFERENCE_HEIGHT_M, alpha),
  };
}

export default siteExposure;
