/**
 * Swami & Chandra (1988) surface-average wind-pressure coefficients.
 *
 * Source: M. V. Swami and S. Chandra, "Correlations for pressure distribution
 * on buildings and calculation of natural-ventilation airflow", ASHRAE
 * Transactions 94(1), 1988. The low-rise form below is the one reproduced in
 * the EnergyPlus Engineering Reference ("Wind Pressure Coefficients", surface
 * average calculation) and in AIVC multizone practice:
 *
 *   Cp(a) = Cp(0) * ln[ 1.248
 *                       - 0.703 sin(a/2)
 *                       - 1.175 sin^2(a)
 *                       + 0.131 sin^3(2 a G)
 *                       + 0.769 cos(a/2)
 *                       + 0.07 G^2 sin^2(a/2)
 *                       + 0.717 cos^2(a/2) ]
 *
 * with Cp(0) = 0.6, `a` the angle of incidence between the wind and the OUTWARD
 * normal of the wall (0 = wind normal to the wall, 180 = wall fully leeward),
 * and G = ln(S) where S is the side ratio: the width of the wall under
 * consideration divided by the width of the wall adjacent to it. The `2 a G`
 * term is linear in `a`, so degrees and radians agree there as long as `a` is
 * consistent; this module works in radians throughout.
 *
 * The correlation is a single expression covering windward, side and leeward
 * walls — there is no separate leeward constant to adopt. It returns roughly
 * +0.60 at normal incidence, -0.44 on a side wall and -0.36 on a leeward wall
 * for a square plan. It is an empirical fit for LOW-RISE buildings (height not
 * greater than three storeys) in an open exposure, and is only defined for
 * incidence in [0, 180]; a signed angle is folded onto that range.
 *
 * Pure functions only: no geometry, no grid, no DOM.
 */

const DEG = Math.PI / 180;

/** Cp at normal incidence — the scale factor the published fit normalises to. */
const CP_NORMAL_INCIDENCE = 0.6;

/**
 * A facade sample outside this band is treated as non-physical. Real facade Cp
 * lives in about [-2, +1]; a coarse 2D slice legitimately reaches -2.6 on a
 * strongly accelerated side wall, so the band is set well outside that and only
 * catches genuine garbage (a diverged cell, a reference that never settled).
 */
const CP_PLAUSIBILITY_LIMIT = 3;

function finiteOr(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

/** Fold any incidence onto the [0, 180] range the correlation is defined on. */
export function normalizeIncidenceDeg(incidenceDeg) {
  const wrapped = ((finiteOr(incidenceDeg, 0) % 360) + 360) % 360;
  return wrapped > 180 ? 360 - wrapped : wrapped;
}

/**
 * Surface-average pressure coefficient for one facade.
 *
 * @param {object} options
 * @param {number} options.incidenceDeg Angle between the wind and the facade's
 *   outward normal, in degrees. 0 is windward, 180 leeward.
 * @param {number} [options.sideRatio] Width of this facade divided by the width
 *   of the adjacent facade. Defaults to 1 (square plan, G = 0).
 * @returns {number} Cp, dimensionless.
 */
export function correlationCp({ incidenceDeg, sideRatio = 1 } = {}) {
  const angle = normalizeIncidenceDeg(incidenceDeg) * DEG;
  const ratio = finiteOr(sideRatio, 1);
  const G = ratio > 0 ? Math.log(ratio) : 0;
  const half = angle / 2;
  const inner =
    1.248 -
    0.703 * Math.sin(half) -
    1.175 * Math.pow(Math.sin(angle), 2) +
    0.131 * Math.pow(Math.sin(2 * angle * G), 3) +
    0.769 * Math.cos(half) +
    0.07 * G * G * Math.pow(Math.sin(half), 2) +
    0.717 * Math.pow(Math.cos(half), 2);
  // The fit can only be evaluated where its bracket is positive. It stays well
  // above zero over the whole [0, 180] range for every side ratio a building
  // plan can produce, so this guard is a defensive floor, not a working branch.
  if (!(inner > 1e-6)) return -CP_NORMAL_INCIDENCE;
  return CP_NORMAL_INCIDENCE * Math.log(inner);
}

/**
 * Incidence of the wind on a facade, from the facade's outward unit normal and
 * the unit vector the air TRAVELS along (not the compass bearing it comes
 * from). Returns degrees in [0, 180].
 */
export function incidenceFromFlow(outwardNormal, flowDirection) {
  const nx = finiteOr(outwardNormal?.x, 0);
  const ny = finiteOr(outwardNormal?.y, 0);
  const fx = finiteOr(flowDirection?.x, 0);
  const fy = finiteOr(flowDirection?.y, 0);
  const normalLength = Math.hypot(nx, ny);
  const flowLength = Math.hypot(fx, fy);
  if (!(normalLength > 0) || !(flowLength > 0)) return 0;
  const cosine = -(nx * fx + ny * fy) / (normalLength * flowLength);
  return Math.acos(Math.min(1, Math.max(-1, cosine))) / DEG;
}

/** True when a sampled Cp is finite and inside the plausibility band. */
export function isPlausibleCp(value) {
  return Number.isFinite(value) && Math.abs(value) <= CP_PLAUSIBILITY_LIMIT;
}

export const CP_CORRELATION = {
  model: 'swami-chandra-1988',
  CP_NORMAL_INCIDENCE,
  CP_PLAUSIBILITY_LIMIT,
};
