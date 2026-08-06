/**
 * Editor-side settings for the solar access study. Pure helpers, kept out of
 * the reducer so the panel, the runner and the worker can all read them —
 * the same arrangement as `sunStudyState.js` and `daylightState.js`.
 */

import { DEFAULT_GROUND_REFLECTANCE } from './clearSkyIrradiance';
import { DEFAULT_SENSOR_SPACING_MM } from './solarSensors';

/**
 * `annual` samples the fifteenth of every month and weights each by the days in
 * that month — the representative-day method. Twelve days stands in for 365 to
 * within a percent or so, and costs a hundredth of the rays.
 */
export const SOLAR_ACCESS_PERIODS = Object.freeze(['annual', 'day']);

/** What the map colours. Sun hours need no weather model; energy does. */
export const SOLAR_ACCESS_METRICS = Object.freeze(['sunHours', 'irradiation']);

export function createSolarAccessState(overrides = {}) {
  return {
    enabled: false,
    period: 'annual',
    metric: 'sunHours',

    // Local date at the site, for single-day studies. The June solstice is the
    // best case and the natural companion to the sun study's December default.
    date: '2026-06-21',

    // Sampling. An hour is the convention solar access rules are written in;
    // finer mostly buys smoother pictures.
    stepMinutes: 60,
    sensorSpacing: DEFAULT_SENSOR_SPACING_MM,

    // Rays per sensor for the sky view factor, which sets the diffuse term.
    skyViewRays: 64,

    groundReflectance: DEFAULT_GROUND_REFLECTANCE,

    includeFacades: true,
    includeRoofs: true,

    // Hours of direct sun a sensor needs to count as compliant.
    thresholdHours: 2,

    // Height above the mass base at which facade results are drawn in plan.
    // A plan can only show one slice of a facade, and this chooses it.
    facadeSliceHeight: 1500,

    ...overrides,
  };
}

function clampNumber(value, min, max, fallback) {
  if (typeof value !== 'number' && typeof value !== 'string') return fallback;
  if (typeof value === 'string' && value.trim() === '') return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Coerce a patch into a valid state; every field comes from a control. */
export function applySolarAccessPatch(state, patch = {}) {
  const next = { ...state };

  if (typeof patch.enabled === 'boolean') next.enabled = patch.enabled;
  if (typeof patch.includeFacades === 'boolean') next.includeFacades = patch.includeFacades;
  if (typeof patch.includeRoofs === 'boolean') next.includeRoofs = patch.includeRoofs;
  if (SOLAR_ACCESS_PERIODS.includes(patch.period)) next.period = patch.period;
  if (SOLAR_ACCESS_METRICS.includes(patch.metric)) next.metric = patch.metric;
  if (typeof patch.date === 'string' && DATE_PATTERN.test(patch.date)) next.date = patch.date;

  if (patch.stepMinutes !== undefined) {
    next.stepMinutes = Math.round(clampNumber(patch.stepMinutes, 5, 180, state.stepMinutes));
  }
  if (patch.sensorSpacing !== undefined) {
    next.sensorSpacing = Math.round(clampNumber(patch.sensorSpacing, 200, 10000, state.sensorSpacing));
  }
  if (patch.skyViewRays !== undefined) {
    next.skyViewRays = Math.round(clampNumber(patch.skyViewRays, 8, 512, state.skyViewRays));
  }
  if (patch.groundReflectance !== undefined) {
    next.groundReflectance = clampNumber(patch.groundReflectance, 0, 1, state.groundReflectance);
  }
  if (patch.thresholdHours !== undefined) {
    next.thresholdHours = clampNumber(patch.thresholdHours, 0, 8760, state.thresholdHours);
  }
  if (patch.facadeSliceHeight !== undefined) {
    next.facadeSliceHeight = Math.round(clampNumber(patch.facadeSliceHeight, 0, 200000, state.facadeSliceHeight));
  }

  return next;
}

/** The subset a run depends on, so it is not re-keyed on unrelated settings. */
export function runSettingsOf(state) {
  return {
    period: state.period,
    date: state.date,
    stepMinutes: state.stepMinutes,
    sensorSpacing: state.sensorSpacing,
    skyViewRays: state.skyViewRays,
    groundReflectance: state.groundReflectance,
    includeFacades: state.includeFacades,
    includeRoofs: state.includeRoofs,
  };
}
