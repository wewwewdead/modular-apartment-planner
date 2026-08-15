/**
 * Grain direction for parts cut from directional stock.
 *
 * A part's grain is stored on the entity as `grainAngle`, in degrees measured in
 * the sketch plane from +X, exactly the way `materialId` and `thickness` are
 * stored: a plain top-level property, not metadata. `null` / `undefined` means
 * "unconstrained" - the part has no grain requirement and the cut-list optimizer
 * keeps full rotation freedom for it.
 *
 * Angles are direction-free: grain has no arrowhead, so 0deg and 180deg describe
 * the same fibre. Everything below therefore normalizes into [0, 180).
 *
 * A part is only GRAIN LOCKED when both halves agree: the material it is cut
 * from declares `hasGrain`, and the part carries an explicit `grainAngle`. Either
 * one missing means no constraint, which keeps every existing document nesting
 * exactly as it did before grain existed.
 */

/** Sheet stock convention: the grain of a sheet runs along its LENGTH (+X). */
export const SHEET_GRAIN_ANGLE_DEG = 0;

export const GRAIN_ANGLE_PRESETS = [
  { value: 0, label: '0° — along sheet length' },
  { value: 90, label: '90° — across sheet length' },
];

/**
 * Normalize a grain angle into [0, 180), or null when there is no constraint.
 * @param {unknown} value
 * @returns {number|null}
 */
export function normalizeGrainAngle(value) {
  if (value == null || value === '') {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  const wrapped = numeric % 180;
  const normalized = wrapped < 0 ? wrapped + 180 : wrapped;
  // Kill negative zero and floating dust from the modulo.
  return Object.is(normalized, -0) ? 0 : normalized;
}

/** The grain angle recorded on an entity, normalized. */
export function getEntityGrainAngle(entity) {
  return normalizeGrainAngle(entity?.grainAngle);
}

/**
 * Whether a part is grain locked: the stock has grain AND the part declares a
 * direction to hold it in.
 */
export function isGrainLocked(hasGrain, grainAngle) {
  return hasGrain === true && normalizeGrainAngle(grainAngle) != null;
}

const AXIS_TOLERANCE_DEG = 1e-6;

/**
 * Which quarter turns keep a part's grain running along the sheet grain.
 *
 * Sheet grain runs along +X, so a placement rotation R is allowed when
 * `(grainAngle + R) mod 180 === 0`. That yields {0, 180} for a part drawn with
 * its grain along X and {90, 270} for one drawn across it - two rotations that
 * share a single axis-aligned footprint.
 *
 * A grain angle that is not a multiple of 90deg (e.g. a 45deg diagonal veneer
 * layup) can never be brought onto the sheet axis by a quarter turn, so no
 * rotation is "correct". Rather than silently pretend otherwise, such a part is
 * pinned to its AS-DRAWN orientation ({0, 180}), which preserves the angle the
 * designer drew between the part's grain and the sheet.
 *
 * @param {number|null} grainAngle normalized part grain angle in degrees.
 * @returns {{ rotations: number[], swapsFootprint: boolean, alignedToSheet: boolean }}
 */
export function getGrainRotations(grainAngle) {
  const normalized = normalizeGrainAngle(grainAngle);

  if (normalized == null) {
    return { rotations: [0, 90, 180, 270], swapsFootprint: false, alignedToSheet: true };
  }

  if (Math.abs(normalized) <= AXIS_TOLERANCE_DEG) {
    return { rotations: [0, 180], swapsFootprint: false, alignedToSheet: true };
  }

  if (Math.abs(normalized - 90) <= AXIS_TOLERANCE_DEG) {
    return { rotations: [90, 270], swapsFootprint: true, alignedToSheet: true };
  }

  return { rotations: [0, 180], swapsFootprint: false, alignedToSheet: false };
}

/**
 * Grain direction of a part after it has been rotated onto the sheet, in degrees
 * from the sheet's +X axis. Used to draw the grain arrow on the nested layout.
 */
export function getPlacedGrainAngle(grainAngle, placementRotationDeg = 0) {
  const normalized = normalizeGrainAngle(grainAngle);
  return normalized == null ? null : normalizeGrainAngle(normalized + (Number(placementRotationDeg) || 0));
}

/** Human-readable grain label for panels and tooltips. */
export function formatGrainAngle(grainAngle) {
  const normalized = normalizeGrainAngle(grainAngle);
  if (normalized == null) {
    return 'Unconstrained';
  }

  const rounded = Math.round(normalized * 100) / 100;
  if (rounded === 0) {
    return '0° (along sheet length)';
  }
  if (rounded === 90) {
    return '90° (across sheet length)';
  }
  return `${rounded}°`;
}
