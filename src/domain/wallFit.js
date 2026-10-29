import { getBeamRenderData } from '@/geometry/beamGeometry';
import { distanceToSegment } from '@/geometry/line';
import { pointInPolygon } from '@/geometry/polygon';
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
 * How a wall meets the floor structure. Platform framing builds one storey,
 * lands a deck on it and starts again — every wall stands on the plate of its
 * own floor. Bypass framing runs the wall plane straight past the deck, so two
 * storeys of facade read as one uninterrupted plane with no line at the floor.
 */
export const WALL_FRAMING_MODES = Object.freeze({
  PLATFORM: 'platform',
  BYPASS: 'bypass',
});

export function normalizeWallFramingMode(mode) {
  return mode === WALL_FRAMING_MODES.BYPASS ? WALL_FRAMING_MODES.BYPASS : WALL_FRAMING_MODES.PLATFORM;
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

/**
 * How far sideways the built body sits from the drawn axis, signed along
 * perpendicular(direction) — positive being the 'right' side looking from start
 * to end, the sense `wallSideOfPoint` reports.
 *
 * Arc walls always answer 0. Offsetting a curve is not translating it — the
 * inner and outer radii change and the tangency at each end goes with them — so
 * a stored offset on an arc is refused outright rather than applied as a
 * translation that would look right in plan and be wrong everywhere else.
 */
export function wallOutboardOffset(wall) {
  if (wall?.controlPoint) return 0;
  const offset = Number(wall?.outboardOffset);
  return Number.isFinite(offset) ? offset : 0;
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

// Arc walls are not convex, so they fall back to the exact boolean — as does
// anything tested against an outline that is not itself convex. A beam is a
// rectangle; a floor plate is whatever shape the plan is, L-shaped or bitten
// through by a stair void, and SAT would report an overlap across the notch.
function outlinesOverlap(wall, wallOutline, otherOutline, convex = true) {
  return wall.controlPoint || !convex
    ? intersectionArea(wallOutline, otherOutline) > MIN_OVERLAP_AREA
    : convexOutlinesOverlap(wallOutline, otherOutline, MIN_OVERLAP_DEPTH);
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

function positiveDepth(value) {
  const depth = Number(value);
  return Number.isFinite(depth) && depth > 0 ? depth : 0;
}

/**
 * Where a floor sits. `project` is optional and only sharpens the answer for a
 * floor carrying neither an elevation nor a level of its own, which takes its
 * position from where it sits in the stack. Every floor the app creates carries
 * an elevation, so supplying a project changes nothing for a real plan.
 */
function floorElevationOf(floor, project) {
  const index = (project?.floors || []).indexOf(floor);
  return getFloorElevation(floor, index < 0 ? 0 : index);
}

/**
 * How deep the floor structure runs where this wall stands: the deepest thing
 * the wall's built body crosses in plan. A bypass wall has to start that far
 * below its own floor, so its plane and the plane of the storey below overlap
 * across the whole deck instead of butting at the floor line.
 *
 * Only the wall's OWN floor is consulted, never the one above. A storey's deck
 * is filed with the storey it carries, so this floor's slabs and beams are the
 * ones underfoot; and the 3D preview's per-floor cache is keyed on this floor's
 * own arrays, so a derivation that read `floors[index + 1]` would keep drawing
 * a stale drop after someone thickened the slab above it.
 */
function derivedBypassDrop(wall, floor, floorElevation) {
  const columns = floor?.columns || [];
  const outline = getWallRenderData(wall, columns)?.outline;
  if (!outline || outline.length < 3) return null;
  const bounds = boundsOf(outline);

  let deepest = null;

  for (const slab of floor?.slabs || []) {
    const boundary = slab?.boundaryPoints || [];
    if (boundary.length < 3) continue;
    if (!boundsOverlap(bounds, boundsOf(boundary))) continue;
    if (!outlinesOverlap(wall, outline, boundary, false)) continue;
    deepest = Math.max(deepest ?? 0, positiveDepth(slab.thickness));
  }

  for (const beam of floor?.beams || []) {
    const beamOutline = getBeamRenderData(beam, columns)?.outline;
    if (!beamOutline || beamOutline.length < 3) continue;
    if (!boundsOverlap(bounds, boundsOf(beamOutline))) continue;
    if (!outlinesOverlap(wall, outline, beamOutline)) continue;

    // Only the part of the beam hanging BELOW this floor is structure the wall
    // has to fall past. A beam capping the storey — the common case, filed on
    // this floor by a user who drew it at the head of the columns — sits
    // entirely above and answers nothing.
    const band = floorElevation - beamSoffit(beam);
    if (band <= 0) continue;
    deepest = Math.max(deepest ?? 0, band);
  }

  return deepest;
}

/**
 * The drop for a wall the plan gives no structure to cross: the deepest plate
 * on its floor, or nothing at all where the floor has no plate.
 *
 * A wall standing clear of every slab in plan — a bay wall hung past the edge
 * it grows out of — is still a wall on a storey with a deck, and answering zero
 * would butt its plane against the storey below at the floor line, which is
 * precisely the joint bypass framing exists to remove. A floor with no slab has
 * no deck to run past, and zero is then the honest answer.
 */
function fallbackBypassDrop(floor) {
  return (floor?.slabs || []).reduce((deepest, slab) => Math.max(deepest, positiveDepth(slab?.thickness)), 0);
}

/**
 * The single answer to "how far up does this wall run" — the one every view has
 * to draw and every hit test has to use.
 *
 * A platform wall is exactly what it always was: it stands on its floor, lifted
 * by whatever beam is underfoot, and is as tall as its own height. A bypass
 * wall ignores both: it starts below its floor by the depth of the deck it runs
 * past and finishes at the level of the floor above, so storey N's top IS
 * storey N+1's elevation and the two bodies overlap across the structure.
 *
 * `datum` is the level a sill height is measured from — the finished floor,
 * which is the wall base for platform framing and stays at the floor for a
 * bypass wall. Openings sit on the floor you walk on, not on the bottom of a
 * plane that runs past it.
 */
export function resolveWallVerticalSpan(wall, floor, project = null) {
  const floorElevation = floorElevationOf(floor, project);

  if (normalizeWallFramingMode(wall?.framingMode) !== WALL_FRAMING_MODES.BYPASS) {
    const base = floorElevation + wallBaseOffset(wall);
    return {
      mode: WALL_FRAMING_MODES.PLATFORM,
      base,
      top: base + (wall?.height ?? 0),
      drop: 0,
      datum: base,
    };
  }

  // A stored drop is the user overriding the derivation, the same way a manual
  // height overrides the beam fit.
  const override = Number(wall?.bypassDrop);
  const drop =
    Number.isFinite(override) && override > 0
      ? override
      : (derivedBypassDrop(wall, floor, floorElevation) ?? fallbackBypassDrop(floor));

  return {
    mode: WALL_FRAMING_MODES.BYPASS,
    base: floorElevation - drop,
    top: floorElevation + getFloorToFloorHeight(floor),
    drop,
    datum: floorElevation,
  };
}

/**
 * Where a slab crosses a wall's own plane, as a band in the wall's local V.
 *
 * The detail editor and the framing generator are otherwise slab-blind: they
 * draw one rectangle of wall and know nothing of the deck running through it.
 * A bypass wall's whole point is that a deck DOES run through it, and the frame
 * has to carry that deck on a ledger — so the bands are the one piece of
 * structure the wall-local elevation has to be told about.
 *
 * V is measured from the wall base, so a wall dropped D past a slab of thickness
 * T answers `[D − T, D]`: the slab's soffit up to its top, which is the storey
 * line. A platform wall stands ON its deck rather than past it, so nothing
 * crosses it and the list comes back empty — that is a derived answer, not a
 * special case.
 *
 * Plan overlap is decided by the same machinery the bypass drop uses, exact
 * boolean rather than SAT, because a floor plate is whatever shape the plan is.
 */
export function resolveWallSlabBands(wall, floor, project = null) {
  const slabs = floor?.slabs || [];
  if (!slabs.length) return [];

  const span = resolveWallVerticalSpan(wall, floor, project);
  const height = span.top - span.base;
  if (!(height > EPSILON)) return [];
  const floorElevation = floorElevationOf(floor, project);

  // The vertical test first, because it is arithmetic and the plan test is not.
  // A platform wall stands ON its deck, so every slab on the floor falls out
  // here in a few subtractions and no polygon is ever touched — which matters,
  // because this runs for every detailed wall on every rebuild.
  const candidates = [];
  for (const slab of slabs) {
    const boundary = slab?.boundaryPoints || [];
    if (boundary.length < 3) continue;
    const thickness = positiveDepth(slab?.thickness);
    if (!thickness) continue;

    // A slab carries its own top level; a slab that never got one belongs to
    // its floor, which is where the floor line is.
    const level = Number.isFinite(Number(slab?.elevation)) ? Number(slab.elevation) : floorElevation;
    const v1 = level - span.base;
    const v0 = v1 - thickness;
    if (v1 <= EPSILON || v0 >= height - EPSILON) continue;
    candidates.push({ slab, boundary, thickness, level, v0, v1 });
  }
  if (!candidates.length) return [];

  const outline = getWallRenderData(wall, floor?.columns || [])?.outline;
  if (!outline || outline.length < 3) return [];
  const bounds = boundsOf(outline);

  return candidates
    .filter(
      (candidate) =>
        boundsOverlap(bounds, boundsOf(candidate.boundary)) &&
        outlinesOverlap(wall, outline, candidate.boundary, false),
    )
    .map((candidate) => ({
      slabId: candidate.slab.id,
      name: candidate.slab.name || '',
      thickness: candidate.thickness,
      level: candidate.level,
      v0: candidate.v0,
      v1: candidate.v1,
    }))
    .sort((a, b) => a.v0 - b.v0);
}

/**
 * Stations along a wall's run at which its bearing is asked about. Odd enough
 * to land one sample at the middle and coarse enough that the whole check stays
 * a rounding error next to `beamsCrossingWall`, which already runs for every
 * wall on every commit.
 */
const WALL_BEARING_SAMPLE_COUNT = 17;

/**
 * A sample sitting this close to the edge of what carries it is on it. Bay walls
 * are drawn ON the slab edge their own macro created, so an exact point-in-
 * polygon test would answer by whichever way the boundary happened to round.
 */
const WALL_BEARING_EDGE_TOLERANCE_MM = 25;

function pointCarriedBy(point, polygons, toleranceMm) {
  for (const polygon of polygons) {
    if (pointInPolygon(point, polygon)) return true;
    for (let index = 0; index < polygon.length; index += 1) {
      if (distanceToSegment(point, polygon[index], polygon[(index + 1) % polygon.length]) <= toleranceMm) return true;
    }
  }
  return false;
}

/**
 * How much of a wall's built body has something under it on its own floor.
 *
 * Sampled along the built run rather than solved as an area, because the
 * question is which STRETCHES are hanging: a boolean overlap cannot tell a wall
 * half off its plate from one sitting squarely on it, and that difference is the
 * whole check. The candidates are gathered by the bounds prefilter
 * `derivedBypassDrop` uses, so each slab and beam is measured against the wall's
 * bounds once before any point test runs.
 *
 * Only the wall's OWN floor is consulted, for the reason the bypass drop gives:
 * a storey's deck is filed with the storey it carries.
 *
 * @returns {{runMm: number, sampleCount: number, borneSampleCount: number,
 *   bearingRatio: number, unsupportedRatio: number, unsupportedRunMm: number,
 *   bearingSourceCount: number} | null} null when the wall has no readable body
 */
export function resolveWallBaseBearing(wall, floor, options = {}) {
  const columns = floor?.columns || [];
  const rendered = getWallRenderData(wall, columns);
  const outline = rendered?.outline;
  if (!outline || outline.length < 3) return null;

  const start = rendered.trimStart;
  const end = rendered.trimEnd;
  const runMm = Math.hypot(end.x - start.x, end.y - start.y);
  if (!(runMm > 0)) return null;

  const bounds = boundsOf(outline);
  const carriers = [];

  for (const slab of floor?.slabs || []) {
    const boundary = slab?.boundaryPoints || [];
    if (boundary.length < 3) continue;
    if (!boundsOverlap(bounds, boundsOf(boundary))) continue;
    carriers.push(boundary);
  }

  for (const beam of floor?.beams || []) {
    const beamOutline = getBeamRenderData(beam, columns)?.outline;
    if (!beamOutline || beamOutline.length < 3) continue;
    if (!boundsOverlap(bounds, boundsOf(beamOutline))) continue;
    carriers.push(beamOutline);
  }

  // Half the built thickness, floored at the alignment tolerance: a wall whose
  // axis runs along the plate edge still has half its body on the plate, and
  // that is bearing, not a wall in the air.
  const tolerance = options.toleranceMm ?? Math.max(WALL_BEARING_EDGE_TOLERANCE_MM, (Number(wall?.thickness) || 0) / 2);
  const sampleCount = Math.max(2, Math.round(options.sampleCount ?? WALL_BEARING_SAMPLE_COUNT));

  let borneSampleCount = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    // Mid-interval stations, so a sample never lands exactly on an end of the
    // run where the answer belongs to the wall next door as much as this one.
    const t = (index + 0.5) / sampleCount;
    const point = { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
    if (pointCarriedBy(point, carriers, tolerance)) borneSampleCount += 1;
  }

  const bearingRatio = borneSampleCount / sampleCount;
  return {
    runMm,
    sampleCount,
    borneSampleCount,
    bearingRatio,
    unsupportedRatio: 1 - bearingRatio,
    unsupportedRunMm: (runMm * (sampleCount - borneSampleCount)) / sampleCount,
    bearingSourceCount: carriers.length,
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
  // A bypass wall runs past the beams rather than between them, so there is
  // nothing here to fit it to. Its stored height and baseOffset no longer say
  // where it is drawn — `resolveWallVerticalSpan` does — and churning them on
  // every commit would only make the settled-floor memo miss.
  if (normalizeWallFramingMode(wall?.framingMode) === WALL_FRAMING_MODES.BYPASS) return wall;

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
