/**
 * Daylight physics: the CIE standard overcast sky, and the BRE split-flux
 * formulas that turn a room's geometry into a daylight factor.
 *
 * **What a daylight factor is, and why this is the honest thing to compute.**
 * DF is the ratio of indoor illuminance to the unobstructed outdoor horizontal
 * illuminance *under the same overcast sky*, as a percentage. The overcast sky
 * is rotationally symmetric, so a daylight factor does not depend on
 * orientation, date or time — which is exactly what makes it computable in a
 * browser from geometry alone, with no weather file.
 *
 * The price of that is what it cannot tell you. Anything involving the sun's
 * position — annual metrics (sDA, ASE), glare (DGP), useful daylight
 * illuminance — needs a climate file and a backward raytracer. Those are not
 * here and are not approximated, because a wrong number that looks like a
 * Radiance result is worse than no number.
 *
 * Two methods live in this codebase and they agree because they share these
 * formulas:
 *   - Split-flux (this file): one average DF per room from an analytic formula.
 *   - Monte Carlo (`daylightGrid.js`): per-sensor sky component by sampling,
 *     plus the internally reflected component from here, unchanged.
 *
 * Units: geometry arrives in millimetres and is converted to metres at the
 * boundary, because every daylight formula in the literature is written in
 * metres and re-deriving them in millimetres invites a factor of 10^6.
 */

const MM_PER_M = 1000;
const MM2_PER_M2 = MM_PER_M * MM_PER_M;
const DEG = Math.PI / 180;

/**
 * Relative luminance of the CIE standard overcast sky at a given angle from the
 * zenith: the zenith is three times as bright as the horizon, and there is no
 * azimuthal variation at all.
 *
 * Returned relative to the zenith luminance, so the absolute sky brightness
 * cancels out of every daylight factor.
 */
export function overcastRelativeLuminance(zenithAngle) {
  return (1 + 2 * Math.cos(zenithAngle)) / 3;
}

/**
 * Horizontal illuminance under the unobstructed CIE overcast sky, again
 * relative to the zenith luminance.
 *
 *   E = ∫ L(θ) cos θ dω = 2π/3 · Lz · ∫₀^{π/2} (1 + 2cos θ) cos θ sin θ dθ
 *     = 2π/3 · Lz · (1/2 + 2/3) = 7π/9 · Lz
 *
 * This is the denominator of every daylight factor, so it is worth stating
 * exactly rather than sampling.
 */
export const OVERCAST_HORIZONTAL_FACTOR = (7 * Math.PI) / 9;

/**
 * Design sky illuminance used to translate a daylight factor into lux.
 *
 * Conventional for UK/CIE practice. It is a *label on the answer*, not an input
 * to it: DF is a ratio, and changing this number rescales the lux readout
 * without changing a single daylight factor.
 */
export const DEFAULT_DESIGN_SKY_LUX = 10000;

/**
 * Glazing assumptions by window type.
 *
 * `transmittance` is diffuse visible transmittance (τ_v), `frameFactor` the
 * fraction of the structural opening that is actually glass, `maintenance` the
 * BRE dirt factor for a vertical window in a clean environment.
 *
 * These are early-design defaults, not product data. The panel exposes them and
 * a window may override them with its own `glazing` object once real products
 * are specified.
 */
export const GLAZING_PRESETS = Object.freeze({
  standard: { transmittance: 0.68, frameFactor: 0.7, maintenance: 0.9 },
  casement: { transmittance: 0.68, frameFactor: 0.7, maintenance: 0.9 },
  awning: { transmittance: 0.68, frameFactor: 0.68, maintenance: 0.9 },
  // Fixed lights lose less area to opening frames.
  fixed: { transmittance: 0.68, frameFactor: 0.8, maintenance: 0.9 },
  // A sliding patio door is mostly glass, with one meeting stile.
  slidingDoor: { transmittance: 0.68, frameFactor: 0.8, maintenance: 0.85 },
});

/** Typical surface reflectances for a light-coloured interior. */
export const DEFAULT_REFLECTANCES = Object.freeze({
  ceiling: 0.7,
  wall: 0.5,
  floor: 0.2,
  // Glass seen from inside reflects a little; counting it as wall would
  // overstate the internally reflected component.
  glazing: 0.15,
});

/**
 * Recommended average daylight factors, from BS 8206-2 and CIBSE LG10.
 *
 * These are the "no supplementary electric lighting needed for most of the
 * daytime" thresholds, not statutory minima; the panel says so.
 */
export const DAYLIGHT_TARGETS = Object.freeze({
  kitchen: 2,
  living: 1.5,
  living_sleeping: 1.5,
  dining: 1.5,
  bedroom: 1,
  sleeping: 1,
  study: 2,
  office: 2,
  // Circulation and service spaces have no daylight recommendation; they are
  // reported but not judged.
  bathroom: null,
  shared_corridor: null,
  stair_core: null,
  service_core: null,
  unit_block: null,
});

/** Target DF for a room, or null when the space type carries no recommendation. */
export function daylightTargetFor(spaceType, fallback = 1.5) {
  if (spaceType && Object.prototype.hasOwnProperty.call(DAYLIGHT_TARGETS, spaceType)) {
    return DAYLIGHT_TARGETS[spaceType];
  }
  return fallback;
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function numberOr(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Resolve the glazing properties for one aperture: a window's own `glazing`
 * object wins, then the study settings, then the type preset.
 */
export function resolveGlazing(opening, settings = {}, presetKey = 'standard') {
  const preset = GLAZING_PRESETS[presetKey] || GLAZING_PRESETS.standard;
  const own = opening?.glazing || {};

  return {
    transmittance: clamp01(numberOr(own.transmittance, numberOr(settings.transmittance, preset.transmittance))),
    frameFactor: clamp01(numberOr(own.frameFactor, numberOr(settings.frameFactor, preset.frameFactor))),
    maintenance: clamp01(numberOr(own.maintenance, numberOr(settings.maintenance, preset.maintenance))),
  };
}

/** Everything an aperture contributes to a daylight factor, as one factor. */
export function apertureEfficiency(glazing) {
  return glazing.transmittance * glazing.frameFactor * glazing.maintenance;
}

/**
 * The internal surfaces of a room, in square metres.
 *
 * Glazing is split out of the wall area rather than ignored, because it is both
 * darker than the wall it sits in and a meaningful fraction of a well-lit
 * room's envelope.
 */
export function roomSurfaces({ floorAreaMm2, perimeterMm, heightMm, glazingAreaMm2 = 0 }) {
  const floor = Math.max(0, floorAreaMm2) / MM2_PER_M2;
  const wallGross = (Math.max(0, perimeterMm) * Math.max(0, heightMm)) / MM2_PER_M2;
  const glazing = Math.min(Math.max(0, glazingAreaMm2) / MM2_PER_M2, wallGross);

  return {
    floor,
    ceiling: floor,
    wall: wallGross - glazing,
    glazing,
    total: floor * 2 + wallGross,
  };
}

/** Area-weighted mean reflectance of every internal surface, including glass. */
export function averageReflectance(surfaces, reflectances = DEFAULT_REFLECTANCES) {
  if (!(surfaces.total > 0)) return 0;

  const weighted =
    surfaces.floor * reflectances.floor +
    surfaces.ceiling * reflectances.ceiling +
    surfaces.wall * reflectances.wall +
    surfaces.glazing * reflectances.glazing;

  return clamp01(weighted / surfaces.total);
}

/**
 * Mean reflectance of the two halves of the room the BRE internally reflected
 * component distinguishes: everything below the window's mid-height (floor plus
 * lower walls) and everything above it (ceiling plus upper walls).
 *
 * Both exclude the window wall, because light leaving the window does not
 * strike the wall it came through.
 */
export function splitReflectances({ surfaces, windowMidHeightMm, heightMm, reflectances = DEFAULT_REFLECTANCES }) {
  const height = Math.max(1, heightMm);
  const belowFraction = clamp01(windowMidHeightMm / height);
  const wallBelow = surfaces.wall * belowFraction;
  const wallAbove = surfaces.wall * (1 - belowFraction);

  const lowerArea = surfaces.floor + wallBelow;
  const upperArea = surfaces.ceiling + wallAbove;

  return {
    floorAndLowerWalls:
      lowerArea > 0 ? (surfaces.floor * reflectances.floor + wallBelow * reflectances.wall) / lowerArea : 0,
    ceilingAndUpperWalls:
      upperArea > 0 ? (surfaces.ceiling * reflectances.ceiling + wallAbove * reflectances.wall) / upperArea : 0,
  };
}

/**
 * BRS/BRE coefficient C for the internally reflected component, tabulated
 * against the angle of external obstruction measured at the window centre.
 * Linearly interpolated between the published 10° steps.
 */
const IRC_C_TABLE = [39, 35, 31, 25, 20, 14, 10, 7, 5];

export function ircCoefficient(obstructionAngleDeg) {
  const angle = Math.min(80, Math.max(0, obstructionAngleDeg || 0));
  const index = angle / 10;
  const low = Math.floor(index);
  const high = Math.min(IRC_C_TABLE.length - 1, low + 1);
  const t = index - low;
  return IRC_C_TABLE[low] + (IRC_C_TABLE[high] - IRC_C_TABLE[low]) * t;
}

/**
 * BRE average daylight factor (BS 8206-2 / BRE Digest 309):
 *
 *   DF = T · A_w · θ · M / (A · (1 − R²))
 *
 * θ is in degrees, which is where the factor of 100 hides — the result is a
 * percentage directly. A 2 m² window in a 20 m² room with clear glass and no
 * obstruction lands near 2%, the familiar rule of thumb.
 *
 * This is a whole-room fit that already contains both the sky component and the
 * interreflections, so it is *not* the sum of the components below. It is the
 * headline number because it is the one a planning officer recognises.
 *
 * @param {object} options
 * @param {number} options.glazingAreaM2       Net glass area, m².
 * @param {number} options.efficiency          τ · frame · maintenance.
 * @param {number} options.skyAngleDeg         Angle of visible sky at the window, 0-90°.
 * @param {number} options.totalSurfaceAreaM2  Every internal surface, m².
 * @param {number} options.averageReflectance  Area-weighted, 0-1.
 * @returns {number} Average daylight factor, percent.
 */
export function averageDaylightFactorPercent({
  glazingAreaM2,
  efficiency,
  skyAngleDeg,
  totalSurfaceAreaM2,
  averageReflectance: reflectance,
}) {
  if (!(glazingAreaM2 > 0) || !(totalSurfaceAreaM2 > 0)) return 0;

  // R approaching 1 would divide by zero; a real room never does, but a
  // malformed one must not produce Infinity.
  const denominator = totalSurfaceAreaM2 * (1 - Math.min(0.98, reflectance) ** 2);
  if (!(denominator > 0)) return 0;

  return (efficiency * glazingAreaM2 * Math.max(0, skyAngleDeg)) / denominator;
}

/**
 * BRE average internally reflected component (Hopkinson):
 *
 *   IRC = T · A_w / (A · (1 − R)) · (C · R_fw + 5 · R_cw)
 *
 * The 5 is not a fitted constant for the ceiling so much as the ratio of the
 * flux reaching the upper room to that reaching the lower room; C carries the
 * obstruction dependence. Result is a percentage, on the same scale as the
 * average daylight factor above.
 *
 * This is the term Monte Carlo sky sampling cannot produce without bounces, so
 * the grid adds it as a room-uniform floor under the sampled sky component —
 * which is precisely the split-flux decomposition, done honestly.
 */
export function internallyReflectedComponentPercent({
  glazingAreaM2,
  efficiency,
  totalSurfaceAreaM2,
  averageReflectance: reflectance,
  floorAndLowerWallsReflectance,
  ceilingAndUpperWallsReflectance,
  obstructionAngleDeg = 0,
}) {
  if (!(glazingAreaM2 > 0) || !(totalSurfaceAreaM2 > 0)) return 0;

  const denominator = totalSurfaceAreaM2 * (1 - Math.min(0.98, reflectance));
  if (!(denominator > 0)) return 0;

  const c = ircCoefficient(obstructionAngleDeg);
  return (
    ((efficiency * glazingAreaM2) / denominator) *
    (c * floorAndLowerWallsReflectance + 5 * ceilingAndUpperWallsReflectance)
  );
}

/** Daylight factor as an illuminance under a stated design sky. */
export function daylightFactorToLux(daylightFactorPercent, designSkyLux = DEFAULT_DESIGN_SKY_LUX) {
  return (daylightFactorPercent / 100) * designSkyLux;
}

/**
 * The BRE "no sky line" depth criterion from BS 8206-2: beyond a limiting
 * depth, the back of a room cannot be lit from a single window wall no matter
 * how large the glazing.
 *
 *   L/W + L/H < 2 / (1 − R_back)
 *
 * where L is room depth, W its width, H the window head height and R_back the
 * mean reflectance of the surfaces at the back half of the room. Returned as a
 * ratio: at or below 1 the room passes.
 */
export function limitingDepthRatio({ depthMm, widthMm, windowHeadHeightMm, backReflectance = 0.5 }) {
  const depth = depthMm / MM_PER_M;
  const width = widthMm / MM_PER_M;
  const head = windowHeadHeightMm / MM_PER_M;
  if (!(depth > 0) || !(width > 0) || !(head > 0)) return 0;

  const limit = 2 / (1 - Math.min(0.98, backReflectance));
  return (depth / width + depth / head) / limit;
}

export const DAYLIGHT_UNITS = { MM_PER_M, MM2_PER_M2, DEG };
