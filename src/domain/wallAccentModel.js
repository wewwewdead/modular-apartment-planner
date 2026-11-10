/**
 * Accent panels as stored (docs/wall-cladding-finishes.md §7.1): rectangles on
 * one face of a wall finished differently from the rest of it — the orange
 * blocks beside the windows of the reference photo. The same board in another
 * finish, so an accent changes no thickness, no board quantity and no joint.
 *
 * This module only says what a stored accent IS; where it lands on the face
 * (anchors, clipping, splitting the skin) is `wallAccents.js`, which needs the
 * wall's frame and openings. Kept apart so the assembly normaliser can import
 * it without importing the wall-detail derivations that import the assembly.
 *
 * Pure, no THREE.
 */
import { WALL_FINISH_KINDS, normalizeWallFinish, wallCatalogueColour, wallFinishKindsFor } from './wallFinishes';

/** How many accents one face may carry. */
export const WALL_ACCENT_LIMIT = 64;
/** The smallest accent, either way, in millimetres. */
export const WALL_ACCENT_MIN_SIZE = 10;

function wholeMm(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : fallback;
}

/**
 * Whether a face can carry accents at all: a boarded face of a framed wall
 * (siding and rainscreen included). Not masonry and not a framed face with no
 * board — there is nothing there to finish twice. Arc walls are refused by the
 * callers that know a wall is an arc.
 */
export function wallFaceTakesAccents(system, material) {
  return (
    system === 'framed' && Boolean(material) && material !== 'none' && wallFinishKindsFor(system, material).length > 0
  );
}

/**
 * The finish a new accent starts in: paint · Signal Orange · matte, or timber ·
 * Teak · satin on a face that does not offer paint.
 */
export function defaultAccentFinish(system, material) {
  const kinds = wallFinishKindsFor(system, material);
  if (kinds.includes(WALL_FINISH_KINDS.PAINT) || !kinds.includes(WALL_FINISH_KINDS.TIMBER)) {
    return { kind: WALL_FINISH_KINDS.PAINT, colour: wallCatalogueColour('facade', 'Signal Orange'), sheen: 'matte' };
  }
  return { kind: WALL_FINISH_KINDS.TIMBER, colour: wallCatalogueColour('timber', 'Teak'), sheen: 'satin' };
}

function normalizeAnchor(anchor) {
  if (!anchor || typeof anchor !== 'object') return null;
  const openingId = typeof anchor.openingId === 'string' && anchor.openingId ? anchor.openingId : null;
  if (!openingId) return null;
  return { openingId, du: wholeMm(anchor.du), dv: wholeMm(anchor.dv) };
}

/**
 * One stored accent, filled and rounded, or `null` when it cannot stand: a
 * finish this face cannot carry (a finish is required), or no size at all.
 *
 * `index` names an accent that arrived without an id, so normalising the same
 * list twice gives the same ids — the 3D descriptors carry them.
 */
export function normalizeWallAccent(value, system, material, index = 0) {
  if (!value || typeof value !== 'object') return null;
  const finish = normalizeWallFinish(value.finish, system, material);
  if (!finish) return null;
  const width = wholeMm(value.width, NaN);
  const height = wholeMm(value.height, NaN);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  return {
    id: typeof value.id === 'string' && value.id ? value.id : `accent-${index + 1}`,
    label: typeof value.label === 'string' ? value.label : '',
    u: wholeMm(value.u),
    v: wholeMm(value.v),
    width: Math.max(WALL_ACCENT_MIN_SIZE, width),
    height: Math.max(WALL_ACCENT_MIN_SIZE, height),
    finish,
    anchor: normalizeAnchor(value.anchor),
  };
}

/**
 * A face's accents, normalised — or `null` when there are none to keep, so the
 * layer can omit the key the way a stock face omits `finish`.
 */
export function normalizeWallAccents(accents, system, material) {
  if (!Array.isArray(accents) || !accents.length) return null;
  if (!wallFaceTakesAccents(system, material)) return null;
  const seen = new Set();
  const kept = [];
  accents.forEach((accent, index) => {
    if (kept.length >= WALL_ACCENT_LIMIT) return;
    const normalized = normalizeWallAccent(accent, system, material, index);
    if (!normalized || seen.has(normalized.id)) return;
    seen.add(normalized.id);
    kept.push(normalized);
  });
  return kept.length ? kept : null;
}
