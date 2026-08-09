import { getBeamRenderData } from '@/geometry/beamGeometry';
import { intersectionArea } from '@/geometry/polygonBoolean';
import { getWallRenderData } from '@/geometry/wallColumnGeometry';
import { getFloorElevation, getFloorToFloorHeight } from './floorModels';

// A wall occupies the clear gap between the beams that cross it: it stands on
// whatever is underfoot and stops at the soffit of whatever is overhead,
// touching both and intruding into neither. A 3400 column carrying a 450 beam
// leaves 2950 above the slab; put a 450 plinth beam under the same wall and it
// starts at 450 and is 2500 tall.
//
// `height` is the wall's own height and `baseOffset` is how far its underside
// sits above the floor's elevation — the pair, not the height alone, is what
// every view has to draw.

const EPSILON = 1e-6;
// Plan overlap under this reads as two members touching face to face rather
// than one passing under the other.
const MIN_OVERLAP_AREA = 1;
const MIN_OVERLAP_DEPTH = 1;

// Floors that have been checked and need no change. Floors are replaced wholesale
// on every edit, so an object already in here can never have gone stale — and the
// overwhelmingly common case, an action that touches some other part of the plan,
// costs one lookup instead of re-testing every wall against every beam.
const settledFloors = new WeakMap();

export const WALL_HEIGHT_MODES = Object.freeze({
  AUTO: 'auto',
  MANUAL: 'manual',
});

export function normalizeWallHeightMode(mode) {
  return mode === WALL_HEIGHT_MODES.MANUAL ? WALL_HEIGHT_MODES.MANUAL : WALL_HEIGHT_MODES.AUTO;
}

/**
 * How far a wall's underside sits above the elevation of the floor it belongs
 * to. Zero for a wall standing straight on the slab; the depth of a plinth beam
 * for one sitting on top of it. Every view that draws a wall vertically has to
 * add this to the floor elevation before applying the height.
 */
export function wallBaseOffset(wall) {
  const offset = Number(wall?.baseOffset);
  return Number.isFinite(offset) && offset > 0 ? offset : 0;
}

function boundsOf(points) {
  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxY: Math.max(...points.map((point) => point.y)),
  };
}

function boundsOverlap(a, b) {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

function beamSoffit(beam) {
  return Number(beam?.floorLevel || 0) - Math.max(Number(beam?.depth || 0), 0);
}

function projectionOnAxis(points, axis) {
  let min = Infinity;
  let max = -Infinity;
  for (const point of points) {
    const value = point.x * axis.x + point.y * axis.y;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return { min, max };
}

/**
 * Separating-axis overlap test for two convex outlines — a straight wall and a
 * beam are both rectangles, and this answers in a few dozen arithmetic ops
 * where a polygon boolean would allocate and sweep. Runs on every commit, so
 * the difference is the difference between a live model and a laggy one.
 */
function convexOutlinesOverlap(a, b, minDepth) {
  for (const polygon of [a, b]) {
    for (let index = 0; index < polygon.length; index += 1) {
      const start = polygon[index];
      const end = polygon[(index + 1) % polygon.length];
      const length = Math.hypot(end.x - start.x, end.y - start.y);
      if (length <= EPSILON) continue;

      const axis = { x: -(end.y - start.y) / length, y: (end.x - start.x) / length };
      const projectionA = projectionOnAxis(a, axis);
      const projectionB = projectionOnAxis(b, axis);
      const overlap = Math.min(projectionA.max, projectionB.max) - Math.max(projectionA.min, projectionB.min);
      if (overlap <= minDepth) return false;
    }
  }
  return true;
}

// Arc walls are not convex, so they fall back to the exact boolean.
function outlinesOverlap(wall, wallOutline, beamOutline) {
  return wall.controlPoint
    ? intersectionArea(wallOutline, beamOutline) > MIN_OVERLAP_AREA
    : convexOutlinesOverlap(wallOutline, beamOutline, MIN_OVERLAP_DEPTH);
}

/**
 * Where a wall starts and stops: the beam it stands on, the beam it dies under,
 * and the clear gap between them.
 *
 * Returns null only when no beam runs along the wall at all. When beams do
 * cross it but none sit above the base, `top`/`height` come back null with
 * `crossingCount` set — a mis-levelled beam, which reads differently to the
 * user than a missing one.
 */
export function resolveWallStructureFit(wall, floor, floors = [floor]) {
  return fitAgainstBeams(wall, floor, beamPoolFor(floors));
}

/**
 * Every beam in the building with its vertical extent and plan outline, ordered
 * lowest soffit first.
 *
 * Pooled across ALL floors on purpose. Beam levels are absolute, and the beam
 * capping a storey is routinely drawn on the storey ABOVE — it frames that
 * floor's slab, so that is where the user places it. It is the same physical
 * member either way, and a wall underneath has to stop at its soffit. Looking
 * only at the wall's own floor is what let a ground-floor wall run straight
 * through the beam it visibly hit.
 *
 * Beams at or below a wall are kept too: those are the ones it stands *on top
 * of* rather than under.
 */
function buildBeamPool(floors) {
  const pool = [];

  for (const floor of floors || []) {
    const columns = floor?.columns || [];
    for (const beam of floor?.beams || []) {
      const outline = getBeamRenderData(beam, columns)?.outline;
      if (!outline || outline.length < 3) continue;
      pool.push({
        beamId: beam.id,
        top: Number(beam?.floorLevel || 0),
        soffit: beamSoffit(beam),
        outline,
        bounds: boundsOf(outline),
      });
    }
  }

  return pool.sort((a, b) => a.soffit - b.soffit);
}

/**
 * The pool is rebuilt only when some floor's beams or columns are actually
 * replaced. Every other edit — moving a door, renaming a room — reuses it by
 * reference, which is what lets the per-floor memo below keep hitting.
 */
let cachedPoolSources = null;
let cachedPool = null;

function poolSources(floors) {
  const sources = [];
  for (const floor of floors || []) {
    sources.push(floor?.beams, floor?.columns);
  }
  return sources;
}

function sameSources(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

function beamPoolFor(floors) {
  const sources = poolSources(floors);
  if (cachedPool && sameSources(cachedPoolSources, sources)) return cachedPool;
  cachedPoolSources = sources;
  cachedPool = buildBeamPool(floors);
  return cachedPool;
}

/**
 * How far above its floor a beam can still be this storey's ceiling. Without it
 * a wall with nothing over it would reach up and attach itself to a beam three
 * storeys away, which is worse than leaving it alone.
 */
function storeyReach(floor) {
  const columns = floor?.columns || [];
  const tallestColumn = columns.reduce((tallest, column) => {
    const height = Number(column?.height);
    return Number.isFinite(height) && height > tallest ? height : tallest;
  }, 0);
  return getFloorElevation(floor) + Math.max(getFloorToFloorHeight(floor) || 0, tallestColumn);
}

function beamsCrossingWall(wall, floor, candidates) {
  const wallOutline = getWallRenderData(wall, floor?.columns || [])?.outline;
  if (!wallOutline || wallOutline.length < 3) return [];

  const wallBounds = boundsOf(wallOutline);
  return candidates.filter(
    (candidate) => boundsOverlap(wallBounds, candidate.bounds) && outlinesOverlap(wall, wallOutline, candidate.outline),
  );
}

/**
 * Lift the underside clear of anything it would otherwise stand inside: a beam
 * straddling the current base pushes the wall up to its top, and a stack of
 * them settles on the highest.
 *
 * One forward pass is enough because `crossing` is ordered by soffit: raising
 * the base can only bring *later* beams into reach, and every beam already
 * passed had a lower soffit, so it stays eligible and was already applied.
 */
function resolveSupport(floorBase, crossing) {
  let base = floorBase;
  let supportBeamId = null;

  for (const candidate of crossing) {
    if (candidate.soffit > base + EPSILON) break;
    if (candidate.top <= base + EPSILON) continue;
    base = candidate.top;
    supportBeamId = candidate.beamId;
  }

  return { base, supportBeamId };
}

function fitAgainstBeams(wall, floor, candidates) {
  if (!wall || !candidates.length) return null;

  const crossing = beamsCrossingWall(wall, floor, candidates);
  if (!crossing.length) return null;

  const floorBase = getFloorElevation(floor);
  const { base, supportBeamId } = resolveSupport(floorBase, crossing);

  // The lowest soffit above the settled base and still within this storey — the
  // first such, given the order. No minimum gap is applied on purpose: anything
  // at or below the base was already consumed by the support pass, so whatever
  // is left really is overhead, and stopping short beats a wall driven through
  // a beam.
  const reach = storeyReach(floor);
  const head =
    crossing.find((candidate) => candidate.soffit > base + EPSILON && candidate.soffit < reach + EPSILON) || null;

  // Reported even when nothing is overhead and nothing underfoot, so the panel
  // can tell "no beam runs along this wall" apart from "beams do, but none of
  // them sit above it" — the second is a mis-levelled beam, not a missing one.
  return {
    beamId: head?.beamId || null,
    supportBeamId,
    crossingCount: crossing.length,
    base,
    baseOffset: base - floorBase,
    top: head ? head.soffit : null,
    height: head ? head.soffit - base : null,
  };
}

/**
 * Clear run of a wall: what actually gets built between the column faces it
 * lands on, as opposed to the centreline length its endpoints describe.
 */
export function resolveWallClearRun(wall, floor) {
  const renderData = getWallRenderData(wall, floor?.columns || []);
  if (!renderData?.trimStart || !renderData?.trimEnd) return null;

  // `renderWall` is already trimmed back to the column faces; `wall` is the
  // attachment-resolved centreline, which for a column attachment runs to its
  // centre — half a column further out at each end than anything gets built.
  const { trimStart, trimEnd, wall: syncedWall } = renderData;
  const length = Math.hypot(trimEnd.x - trimStart.x, trimEnd.y - trimStart.y);
  const centrelineLength = Math.hypot(syncedWall.end.x - syncedWall.start.x, syncedWall.end.y - syncedWall.start.y);

  return {
    length,
    centrelineLength,
    trimmed: centrelineLength - length > EPSILON,
    start: trimStart,
    end: trimEnd,
  };
}

function applyFit(wall, floor, candidates) {
  if (normalizeWallHeightMode(wall?.heightMode) === WALL_HEIGHT_MODES.MANUAL) return wall;

  const fit = fitAgainstBeams(wall, floor, candidates);
  if (!fit) return wall;

  // A wall with nothing overhead still has to sit on its support, so the height
  // holds while the base moves.
  const nextHeight = fit.height ?? Number(wall.height);
  const heightSettled = Math.abs(nextHeight - Number(wall.height)) <= EPSILON;
  const baseSettled = Math.abs(fit.baseOffset - wallBaseOffset(wall)) <= EPSILON;
  if (heightSettled && baseSettled) return wall;

  return { ...wall, height: nextHeight, baseOffset: fit.baseOffset };
}

export function fitWallToStructure(wall, floor, floors = [floor]) {
  return applyFit(wall, floor, beamPoolFor(floors));
}

// Identity is preserved when nothing moves: history entries share unchanged
// floors by reference, and re-fitting every wall on every edit would break that.
// The memo records WHICH pool a floor settled against, so a beam edited on any
// storey correctly invalidates the floors below it.
export function syncFloorWallHeights(floor, pool = beamPoolFor([floor])) {
  const walls = floor?.walls || [];
  if (!walls.length || !pool.length) return floor;
  if (settledFloors.get(floor) === pool) return floor;

  let changed = false;
  const nextWalls = walls.map((wall) => {
    const fitted = applyFit(wall, floor, pool);
    if (fitted !== wall) changed = true;
    return fitted;
  });

  if (!changed) {
    settledFloors.set(floor, pool);
    return floor;
  }

  const nextFloor = { ...floor, walls: nextWalls };
  settledFloors.set(nextFloor, pool);
  return nextFloor;
}

export function syncProjectWallHeights(project) {
  const floors = project?.floors || [];
  if (!floors.length) return project;

  // One pool for the whole building: a wall is stopped by the beam that
  // physically crosses it, whichever floor that beam is filed under.
  const pool = beamPoolFor(floors);

  let changed = false;
  const nextFloors = floors.map((floor) => {
    const synced = syncFloorWallHeights(floor, pool);
    if (synced !== floor) changed = true;
    return synced;
  });

  return changed ? { ...project, floors: nextFloors } : project;
}
