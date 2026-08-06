/**
 * Editor-side settings for the daylight study. Pure helpers, kept out of the
 * reducer so the panel, the runner and the worker can all read them without
 * importing store internals — the same arrangement as `sunStudyState.js`.
 *
 * Nothing here depends on where on Earth the site is or what day it is. The CIE
 * overcast sky is the same everywhere and always, which is exactly why a
 * daylight factor is worth computing in a browser and an annual illuminance
 * metric is not.
 */

import { DEFAULT_DESIGN_SKY_LUX, DEFAULT_REFLECTANCES, GLAZING_PRESETS } from './daylightModel';
import {
  DEFAULT_OBSTRUCTION_REFLECTANCE,
  DEFAULT_RAY_COUNT,
  DEFAULT_SENSOR_SPACING_MM,
  DEFAULT_WORKING_PLANE_MM,
} from './daylightGrid';

/**
 * `average` is the BRE split-flux number per room — analytic, instant, and the
 * one a planning officer recognises. `grid` is the Monte Carlo map, which shows
 * where in the room the light actually is and takes a worker to compute.
 */
export const DAYLIGHT_MODES = Object.freeze(['average', 'grid']);

export function createDaylightState(overrides = {}) {
  return {
    enabled: false,
    mode: 'average',

    // Glazing. Defaults are clear double glazing in a typical frame.
    transmittance: GLAZING_PRESETS.standard.transmittance,
    frameFactor: GLAZING_PRESETS.standard.frameFactor,
    maintenance: GLAZING_PRESETS.standard.maintenance,

    // Interior surfaces.
    ceilingReflectance: DEFAULT_REFLECTANCES.ceiling,
    wallReflectance: DEFAULT_REFLECTANCES.wall,
    floorReflectance: DEFAULT_REFLECTANCES.floor,

    // Grid sampling.
    sensorSpacing: DEFAULT_SENSOR_SPACING_MM,
    rayCount: DEFAULT_RAY_COUNT,
    workingPlaneHeight: DEFAULT_WORKING_PLANE_MM,
    obstructionReflectance: DEFAULT_OBSTRUCTION_REFLECTANCE,

    // A sliding door is usually the biggest window in an apartment; ignoring it
    // would understate every living room that opens onto a balcony.
    includeGlazedDoors: true,

    // Only rescales the lux readout — daylight factors are ratios and do not
    // move when this changes.
    designSkyLux: DEFAULT_DESIGN_SKY_LUX,

    // Rooms without a recommended level of their own are judged against this.
    defaultTargetPercent: 1.5,

    ...overrides,
  };
}

function clampNumber(value, min, max, fallback) {
  // `Number(null)` and `Number('')` are both 0, which is finite and would be
  // clamped to the minimum — so a cleared text field would silently set the ray
  // count to 32 rather than leaving it alone. Only strings and numbers count.
  if (typeof value !== 'number' && typeof value !== 'string') return fallback;
  if (typeof value === 'string' && value.trim() === '') return fallback;

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

/** Fields that are a reflectance or a transmittance: all bounded 0-1. */
const FRACTION_FIELDS = [
  'transmittance',
  'frameFactor',
  'maintenance',
  'ceilingReflectance',
  'wallReflectance',
  'floorReflectance',
  'obstructionReflectance',
];

/**
 * Coerce a patch into a valid state. Every field is driven from a text input or
 * a slider, so all of them have to survive nonsense without corrupting a study.
 */
export function applyDaylightPatch(state, patch = {}) {
  const next = { ...state };

  if (typeof patch.enabled === 'boolean') next.enabled = patch.enabled;
  if (typeof patch.includeGlazedDoors === 'boolean') next.includeGlazedDoors = patch.includeGlazedDoors;
  if (DAYLIGHT_MODES.includes(patch.mode)) next.mode = patch.mode;

  for (const field of FRACTION_FIELDS) {
    if (patch[field] !== undefined) next[field] = clampNumber(patch[field], 0, 1, state[field]);
  }

  if (patch.sensorSpacing !== undefined) {
    next.sensorSpacing = Math.round(clampNumber(patch.sensorSpacing, 100, 5000, state.sensorSpacing));
  }
  if (patch.rayCount !== undefined) {
    next.rayCount = Math.round(clampNumber(patch.rayCount, 32, 4096, state.rayCount));
  }
  if (patch.workingPlaneHeight !== undefined) {
    next.workingPlaneHeight = Math.round(clampNumber(patch.workingPlaneHeight, 0, 2000, state.workingPlaneHeight));
  }
  if (patch.designSkyLux !== undefined) {
    next.designSkyLux = Math.round(clampNumber(patch.designSkyLux, 1000, 50000, state.designSkyLux));
  }
  if (patch.defaultTargetPercent !== undefined) {
    next.defaultTargetPercent = clampNumber(patch.defaultTargetPercent, 0, 20, state.defaultTargetPercent);
  }

  return next;
}

/** The subset the worker needs, so a grid run is not keyed on the whole object. */
export function gridSettingsOf(state) {
  return {
    mode: state.mode,
    transmittance: state.transmittance,
    frameFactor: state.frameFactor,
    maintenance: state.maintenance,
    ceilingReflectance: state.ceilingReflectance,
    wallReflectance: state.wallReflectance,
    floorReflectance: state.floorReflectance,
    sensorSpacing: state.sensorSpacing,
    rayCount: state.rayCount,
    workingPlaneHeight: state.workingPlaneHeight,
    obstructionReflectance: state.obstructionReflectance,
    includeGlazedDoors: state.includeGlazedDoors,
    designSkyLux: state.designSkyLux,
    defaultTargetPercent: state.defaultTargetPercent,
  };
}

/** Reflectances in the shape `daylightModel` wants. */
export function reflectancesOf(state) {
  return {
    ceiling: state.ceilingReflectance,
    wall: state.wallReflectance,
    floor: state.floorReflectance,
    glazing: DEFAULT_REFLECTANCES.glazing,
  };
}
