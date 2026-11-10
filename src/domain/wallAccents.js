/**
 * Where a face's accent panels land, and how they cut its skin
 * (docs/wall-cladding-finishes.md §7.1).
 *
 * Two answers, and everything that draws or bills an accented face reads them:
 *
 * - `resolveWallAccents(wall, floor, side)` — each stored accent as a
 *   rectangle in the wall's own drawing (u from the wall start, v from the
 *   bottom of the frame), with its anchor applied and clipped to the board's
 *   span × the frame's height, plus its net area once openings are taken out.
 * - `splitRectByAccents(rect, accents)` — any rectangle of skin (a segment of
 *   the plain skin, a board fragment, a cassette) cut into pieces that tile it
 *   exactly, each either base face or one accent. Where accents overlap, the
 *   later one in the list wins, as a later coat of paint does.
 *
 * `v` is stored from the FINISHED FLOOR, like a sill height, so an accent typed
 * as 900 above the floor stays 900 above the floor on a bypass wall whose frame
 * starts below it: in the drawing it starts at `frame.datumV + v`, the same
 * convention `wallOpeningRects` keeps for openings.
 *
 * Pure, no THREE.
 */
import { boardLayerUSpan, createWallAssembly, resolveWallAssembly } from './wallAssemblies';
import { defaultAccentFinish, normalizeWallAccent, wallFaceTakesAccents } from './wallAccentModel';
import { deriveWallDetailOpenings, resolveWallDetailFrame } from './wallDetailing';

const EPSILON = 1e-6;

function area(rect) {
  return Math.max(0, rect.u1 - rect.u0) * Math.max(0, rect.v1 - rect.v0);
}

function intersect(a, b) {
  const rect = {
    u0: Math.max(a.u0, b.u0),
    u1: Math.min(a.u1, b.u1),
    v0: Math.max(a.v0, b.v0),
    v1: Math.min(a.v1, b.v1),
  };
  return rect.u1 - rect.u0 > EPSILON && rect.v1 - rect.v0 > EPSILON ? rect : null;
}

/**
 * Whether a wall's face can carry accents: a boarded face of a straight framed
 * wall. Masonry and arc walls are out of this phase.
 */
export function wallFaceAcceptsAccents(wall, side) {
  if (!wall || wall.controlPoint) return false;
  const assembly = resolveWallAssembly(wall);
  return wallFaceTakesAccents(assembly.system, assembly[side]?.material);
}

/** The rectangle an accent asks for, before clipping: its anchor's, or its own. */
function requestedRect(accent, openingsById, frame) {
  const opening = accent.anchor ? openingsById.get(accent.anchor.openingId) : null;
  const u0 = opening ? opening.u0 + accent.anchor.du : accent.u;
  const v0 = opening ? opening.v0 + accent.anchor.dv : frame.datumV + accent.v;
  return { u0, u1: u0 + accent.width, v0, v1: v0 + accent.height, anchored: Boolean(opening) };
}

// One entry per wall object, valid while its floor is the same object — the
// rule `resolveWallDetailFrame`'s cache relies on: walls and floors are
// replaced, never mutated, so an entry can never go stale.
const resolvedAccents = new WeakMap();

/**
 * A face's accents where they actually land. Each entry is the stored accent
 * plus `requested` (its rectangle before clipping, anchor applied), `u0, u1,
 * v0, v1` (clipped to the board span × frame height; equal to the requested
 * rectangle when nothing was cut), `anchorMissing` (anchored to an opening the
 * wall no longer has), `netArea` (mm², openings taken out) and `visible`.
 */
export function resolveWallAccents(wall, floor, side) {
  if (!wallFaceAcceptsAccents(wall, side)) return [];
  const assembly = resolveWallAssembly(wall);
  const stored = assembly[side]?.accents;
  if (!stored?.length) return [];

  const cached = resolvedAccents.get(wall);
  if (cached && cached.floor === floor && cached.sides[side]) return cached.sides[side];

  const frame = resolveWallDetailFrame(wall, floor);
  const openings = deriveWallDetailOpenings(wall, floor);
  const openingsById = new Map(openings.filter((opening) => opening.id).map((opening) => [opening.id, opening]));
  const span = boardLayerUSpan(assembly[side], frame.length);
  const face = { u0: span.u0, u1: span.u1, v0: 0, v1: frame.height };

  const result = stored.map((accent) => {
    const requested = requestedRect(accent, openingsById, frame);
    const clipped = intersect(requested, face);
    const cutByOpenings = clipped
      ? openings.reduce(
          (total, opening) => total + area(intersect(clipped, opening) || { u0: 0, u1: 0, v0: 0, v1: 0 }),
          0,
        )
      : 0;
    const netArea = clipped ? Math.max(0, area(clipped) - cutByOpenings) : 0;
    return {
      ...accent,
      requested: { u0: requested.u0, u1: requested.u1, v0: requested.v0, v1: requested.v1 },
      ...(clipped || { u0: requested.u0, u1: requested.u0, v0: requested.v0, v1: requested.v0 }),
      anchorMissing: Boolean(accent.anchor) && !requested.anchored,
      netArea,
      visible: netArea > EPSILON,
    };
  });

  const entry = cached && cached.floor === floor ? cached : { floor, sides: {} };
  entry.sides[side] = result;
  resolvedAccents.set(wall, entry);
  return result;
}

/**
 * Cut `rect` by the accents that overlap it into pieces that tile it exactly:
 * `[{rect, accentId}]`, `accentId` null for the base face. Where accents
 * overlap, the later one in `accents` wins.
 *
 * The rectangle is cut on every accent edge that crosses it into a grid of
 * cells, each cell owned by the last accent that holds it, and the cells are
 * then merged back — along each row first, then rows with identical runs — so
 * a plain stretch of skin stays one piece. The cuts are exact edge values, so
 * the pieces share edges with no gap and no overlap by construction.
 *
 * A rectangle no accent touches comes back as itself, one base piece.
 */
export function splitRectByAccents(rect, accents = []) {
  const hits = accents.filter((accent) => intersect(rect, accent));
  if (!hits.length) return [{ rect: { u0: rect.u0, u1: rect.u1, v0: rect.v0, v1: rect.v1 }, accentId: null }];

  const cuts = (key0, key1, low, high) =>
    [
      ...new Set(
        [low, high, ...hits.flatMap((accent) => [accent[key0], accent[key1]])].filter(
          (value) => value >= low && value <= high,
        ),
      ),
    ].sort((a, b) => a - b);
  const us = cuts('u0', 'u1', rect.u0, rect.u1);
  const vs = cuts('v0', 'v1', rect.v0, rect.v1);

  const ownerOf = (u, v) => {
    for (let index = hits.length - 1; index >= 0; index -= 1) {
      const accent = hits[index];
      if (u > accent.u0 && u < accent.u1 && v > accent.v0 && v < accent.v1) return accent.id;
    }
    return null;
  };

  // Runs along each row.
  const rows = [];
  for (let row = 0; row < vs.length - 1; row += 1) {
    const v0 = vs[row];
    const v1 = vs[row + 1];
    if (v1 - v0 <= EPSILON) continue;
    const runs = [];
    for (let column = 0; column < us.length - 1; column += 1) {
      const u0 = us[column];
      const u1 = us[column + 1];
      if (u1 - u0 <= EPSILON) continue;
      const owner = ownerOf((u0 + u1) / 2, (v0 + v1) / 2);
      const last = runs[runs.length - 1];
      if (last && last.accentId === owner && Math.abs(last.u1 - u0) <= EPSILON) last.u1 = u1;
      else runs.push({ u0, u1, accentId: owner });
    }
    rows.push({ v0, v1, runs });
  }

  // Rows whose runs line up merge into one taller piece.
  const pieces = [];
  const open = new Map();
  for (const row of rows) {
    const next = new Map();
    for (const run of row.runs) {
      const key = `${run.u0}|${run.u1}|${run.accentId}`;
      const growing = open.get(key);
      if (growing && Math.abs(growing.rect.v1 - row.v0) <= EPSILON) {
        growing.rect.v1 = row.v1;
        next.set(key, growing);
      } else {
        const piece = { rect: { u0: run.u0, u1: run.u1, v0: row.v0, v1: row.v1 }, accentId: run.accentId };
        pieces.push(piece);
        next.set(key, piece);
      }
    }
    open.clear();
    for (const [key, piece] of next) open.set(key, piece);
  }
  return pieces;
}

/** Which accent, if any, holds a point — the later one where they overlap. */
export function accentAtPoint(accents, point) {
  for (let index = accents.length - 1; index >= 0; index -= 1) {
    const accent = accents[index];
    if (point.u > accent.u0 && point.u < accent.u1 && point.v > accent.v0 && point.v < accent.v1) return accent;
  }
  return null;
}

export const ACCENT_PLACEMENTS = Object.freeze({
  LEFT: 'left',
  RIGHT: 'right',
  ABOVE: 'above',
  BELOW: 'below',
});

/**
 * A new accent anchored to one of the wall's openings (spec §7.1): `size` wide
 * beside it (left, right) or `size` tall over or under it (above, below), the
 * opening's own height or width the other way. `opening` is the opening's
 * rectangle in the wall's drawing (`deriveWallDetailOpenings`), `frame` the
 * resolved frame, so the stored `u`/`v` fallback is measured the same way.
 */
export function createAccentAtOpening({ opening, placement, size = 600, id, finish, system, material, frame }) {
  const s = Math.max(10, Math.round(Number(size) || 600));
  const width = Math.round(opening.u1 - opening.u0);
  const height = Math.round(opening.v1 - opening.v0);
  const shapes = {
    [ACCENT_PLACEMENTS.LEFT]: { du: -s, dv: 0, width: s, height },
    [ACCENT_PLACEMENTS.RIGHT]: { du: width, dv: 0, width: s, height },
    [ACCENT_PLACEMENTS.ABOVE]: { du: 0, dv: height, width, height: s },
    [ACCENT_PLACEMENTS.BELOW]: { du: 0, dv: -s, width, height: s },
  };
  const shape = shapes[placement] || shapes[ACCENT_PLACEMENTS.RIGHT];
  return normalizeWallAccent(
    {
      id,
      label: '',
      u: opening.u0 + shape.du,
      v: opening.v0 + shape.dv - (frame?.datumV || 0),
      width: shape.width,
      height: shape.height,
      finish: finish || defaultAccentFinish(system, material),
      anchor: { openingId: opening.id, du: shape.du, dv: shape.dv },
    },
    system,
    material,
  );
}

/**
 * The stored form of an accent placed at a drawing rectangle — what a drag or
 * an exact field writes. `u`/`v` always follow the rectangle (v back to the
 * floor datum); an anchored accent whose opening is still there has its
 * `du`/`dv` rewritten so it keeps following the opening from its new place.
 */
export function placeAccentAt(accent, rect, { frame, openings = [] } = {}) {
  const u0 = Math.round(rect.u0);
  const v0 = Math.round(rect.v0);
  const opening = accent.anchor ? openings.find((entry) => entry.id === accent.anchor.openingId) : null;
  return {
    ...accent,
    u: u0,
    v: v0 - Math.round(frame?.datumV || 0),
    width: Math.max(10, Math.round(rect.u1 - rect.u0)),
    height: Math.max(10, Math.round(rect.v1 - rect.v0)),
    anchor: opening
      ? { openingId: opening.id, du: Math.round(u0 - opening.u0), dv: Math.round(v0 - opening.v0) }
      : accent.anchor,
  };
}

/**
 * Copy one face's accents up and down its facade stack (spec §7.1): every
 * other wall with the same `stackId` gets, on the same face, copies with new
 * ids and no anchor, placed where the source's accents resolve to — which on
 * an identical wall above lands them in the same place. A wall whose face
 * cannot carry accents is left alone, and a copy whose finish the target face
 * cannot carry is dropped there by the normaliser. Copying from a face with no
 * accents clears the others. Untouched floors and walls come back as the same
 * objects; `makeId` names each copy.
 */
export function copyWallFaceAccentsToStack(floors, { floorId, wallId, side }, makeId) {
  const sourceFloor = (floors || []).find((floor) => floor.id === floorId);
  const source = sourceFloor?.walls?.find((wall) => wall.id === wallId);
  if (!source?.stackId || (side !== 'interior' && side !== 'exterior')) return floors;
  const frame = resolveWallDetailFrame(source, sourceFloor);
  const copiesFor = () =>
    resolveWallAccents(source, sourceFloor, side).map((accent) => ({
      id: makeId(),
      label: accent.label,
      u: Math.round(accent.requested.u0),
      v: Math.round(accent.requested.v0 - frame.datumV),
      width: accent.width,
      height: accent.height,
      finish: accent.finish,
      anchor: null,
    }));

  let changed = false;
  const nextFloors = floors.map((floor) => {
    let floorChanged = false;
    const walls = (floor.walls || []).map((wall) => {
      if (wall.id === source.id || wall.stackId !== source.stackId || !wallFaceAcceptsAccents(wall, side)) return wall;
      const assembly = resolveWallAssembly(wall);
      const copies = copiesFor();
      if (!copies.length && !assembly[side].accents) return wall;
      floorChanged = true;
      return {
        ...wall,
        assembly: createWallAssembly(
          assembly.preset,
          { ...assembly, [side]: { ...assembly[side], accents: copies } },
          wall.thickness,
        ),
      };
    });
    if (!floorChanged) return floor;
    changed = true;
    return { ...floor, walls };
  });
  return changed ? nextFloors : floors;
}
