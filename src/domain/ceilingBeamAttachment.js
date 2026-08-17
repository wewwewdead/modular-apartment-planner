import { getBeamRenderData } from '@/geometry/beamGeometry';
import { getFloorFootprintSlabs } from '@/geometry/floorOverhang';
import { dot, normalize, perpendicular, subtract } from '@/geometry/point';
import { polygonArea } from '@/geometry/polygon';
import { intersectionArea, unionPolygons } from '@/geometry/polygonBoolean';
import { getFloorElevation, getOrderedFloors } from './floorModels';

/**
 * Which beams a ceiling may hang from, and the plan boundary the structure
 * around it gives it — the beams it hangs from together with the slab overhead
 * it closes off.
 *
 * A ceiling hangs under the beams that pass over it, so only a beam whose top
 * sits above the floor the ceiling belongs to can carry one: a tie or slab beam
 * framing the deck this storey stands on is at the floor datum, and a ceiling
 * hung from it would be built into the floor. The elevation is the test, not the
 * beam's placement role — a level the user retyped is still the truth about
 * where the beam is.
 */

// Matches the tolerance the beam-pair support check uses, so beams that read as
// one level to the truss tool read as one level here.
export const CEILING_BEAM_ELEVATION_TOLERANCE = 10;

// Matches the beam-pair support check: a beam parallel enough to carry trusses
// is parallel enough to trim a ceiling.
const PARALLEL_TOLERANCE = 0.05;

// A boundary edge is taken from the outline points of the beams themselves, so
// the beam defining an extent projects onto it exactly; a millimetre of slack
// absorbs the arithmetic without letting an interior beam pass for a perimeter
// one.
const EDGE_TOLERANCE = 1;

// Below this the ceiling has no area worth drawing — two beams face to face, or
// a set that collapses onto one line.
const MIN_EXTENT = 1;

// A beam only carries the part of a ceiling it actually passes over, so a
// footprint that merely meets the drawn outline — a shared edge, or the rounding
// a rotated grid leaves behind — is not an overlap worth hanging from.
const MIN_AREA_OVERLAP = 1;

function cross(a, b) {
  return a.x * b.y - a.y * b.x;
}

function beamTopElevation(beam) {
  const level = Number(beam?.floorLevel);
  return Number.isFinite(level) ? level : null;
}

export function isCeilingSupportBeam(beam, floor) {
  const top = beamTopElevation(beam);
  return top !== null && top > getFloorElevation(floor) + CEILING_BEAM_ELEVATION_TOLERANCE;
}

export function getEligibleCeilingSupportBeams(floor) {
  return (floor?.beams || []).filter((beam) => isCeilingSupportBeam(beam, floor));
}

export function resolveCeilingSupportBeams(floor, beamIds = []) {
  const wanted = new Set((beamIds || []).filter(Boolean));
  if (!wanted.size) return [];
  return (floor?.beams || []).filter((beam) => wanted.has(beam.id));
}

/**
 * The given beams gathered into the levels they sit at, highest first. Each
 * level is one candidate attachment plane: a ceiling hangs from a set of beams
 * whose tops agree, never from a mixture of levels.
 *
 * Takes a list rather than a floor so a subset — the beams over one drawn area,
 * say — is levelled by exactly the same rule as the whole floor.
 */
function groupBeamsIntoLevels(beams) {
  const sorted = [...beams].sort((a, b) => beamTopElevation(b) - beamTopElevation(a));
  const levels = [];

  for (const beam of sorted) {
    const top = beamTopElevation(beam);
    const current = levels[levels.length - 1];
    if (current && Math.abs(current.elevation - top) <= CEILING_BEAM_ELEVATION_TOLERANCE) {
      current.beams.push(beam);
      // The plane is the lowest top in the group: nothing may be hung from
      // higher than the beam that stops first.
      current.elevation = Math.min(current.elevation, top);
      continue;
    }
    levels.push({ elevation: top, beams: [beam] });
  }

  return levels.map((level) => ({
    id: `beam_level_${Math.round(level.elevation)}`,
    elevation: level.elevation,
    beams: level.beams,
    beamIds: level.beams.map((beam) => beam.id),
  }));
}

export function getCeilingSupportBeamLevels(floor) {
  return groupBeamsIntoLevels(getEligibleCeilingSupportBeams(floor));
}

/**
 * The level a new ceiling should hang from: the one carried by the most beams,
 * because that is the level actually framing a room rather than a stray beam,
 * and the highest of those when they tie. The levels arrive highest first, so
 * keeping the incumbent on a tie already prefers the higher one.
 */
function selectPreferredLevel(levels) {
  return levels.reduce((best, level) => {
    if (!best) return level;
    if (level.beams.length > best.beams.length) return level;
    return best;
  }, null);
}

export function selectPreferredCeilingBeamLevel(floor) {
  return selectPreferredLevel(getCeilingSupportBeamLevels(floor));
}

/**
 * The beams a ceiling traced over `polygon` should hang from: the eligible ones
 * whose plan footprint that outline actually crosses, reduced to a single level
 * by the same rule the whole floor uses.
 *
 * Drawing an area is a statement about one room, so the beams framing the next
 * room have no business setting this ceiling's plane. An outline that clears
 * every beam returns nothing, which leaves the ceiling on a manual datum rather
 * than hung from structure it never reaches.
 */
export function selectCeilingBeamsForArea(floor, polygon) {
  const outline = (polygon || []).filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y));
  if (outline.length < 3) return [];

  const columns = floor?.columns || [];
  const overlapping = getEligibleCeilingSupportBeams(floor).filter((beam) => {
    const footprint = getBeamRenderData(beam, columns)?.outline || [];
    return footprint.length >= 3 && intersectionArea(footprint, outline) > MIN_AREA_OVERLAP;
  });

  return selectPreferredLevel(groupBeamsIntoLevels(overlapping))?.beamIds || [];
}

function buildSupport(beam, floor) {
  const renderData = getBeamRenderData(beam, floor?.columns || []);
  if (!renderData) return null;

  const axis = normalize(subtract(renderData.end, renderData.start));
  if (!axis.x && !axis.y) return null;

  return { beam, renderData, axis, length: renderData.length };
}

function projectionRange(points, axis) {
  const values = points.map((point) => dot(point, axis));
  return { min: Math.min(...values), max: Math.max(...values) };
}

/**
 * Pulls one extent back to the inner face of the beam that defines it. The beams
 * run down the middle of their own outlines, so a ceiling stopping at the
 * extent would still bury half a beam's width of board in the beam beside it.
 *
 * Only a beam reaching an extent is a perimeter beam. One sitting between them
 * crosses the ceiling rather than bounding it, and is taken out as an
 * obstruction instead — clipping to it would throw away the whole far side.
 */
function clipRangeToBeamFaces(extent, beamRanges) {
  let { min, max } = extent;

  for (const range of beamRanges) {
    if (range.min <= extent.min + EDGE_TOLERANCE) {
      min = Math.max(min, range.max);
    } else if (range.max >= extent.max - EDGE_TOLERANCE) {
      max = Math.min(max, range.min);
    }
  }

  return { min, max };
}

/**
 * Plan boundary for a ceiling hung from a set of support beams: the extent the
 * beams cover, pulled in to their inner faces.
 *
 * The frame comes from the longest beam, so a ceiling on a grid rotated off plan
 * north follows the grid rather than the lot. Beams square to neither frame axis
 * still stretch the extents — they are part of what the ceiling covers — but
 * they cannot trim a face, because a diagonal beam has no side to stop at.
 *
 * Returns null when there is nothing sane to draw, leaving the caller to fall
 * back to whatever boundary the ceiling has stored.
 */
export function deriveCeilingBoundaryFromBeams(beams, floor = null) {
  const supports = (beams || []).map((beam) => buildSupport(beam, floor)).filter(Boolean);
  if (supports.length < 2) return null;

  const primary = supports.reduce((longest, entry) => (entry.length > longest.length ? entry : longest));
  const axisU = primary.axis;
  const axisV = perpendicular(axisU);

  const outlinePoints = supports.flatMap((support) => support.renderData.outline);
  const extentU = projectionRange(outlinePoints, axisU);
  const extentV = projectionRange(outlinePoints, axisV);

  const alongU = [];
  const alongV = [];
  for (const support of supports) {
    if (Math.abs(cross(support.axis, axisU)) <= PARALLEL_TOLERANCE) {
      alongU.push(projectionRange(support.renderData.outline, axisV));
    } else if (Math.abs(cross(support.axis, axisV)) <= PARALLEL_TOLERANCE) {
      alongV.push(projectionRange(support.renderData.outline, axisU));
    }
  }

  const rangeU = clipRangeToBeamFaces(extentU, alongV);
  const rangeV = clipRangeToBeamFaces(extentV, alongU);
  if (rangeU.max - rangeU.min < MIN_EXTENT || rangeV.max - rangeV.min < MIN_EXTENT) return null;

  return [
    [rangeU.min, rangeV.min],
    [rangeU.max, rangeV.min],
    [rangeU.max, rangeV.max],
    [rangeU.min, rangeV.max],
  ].map(([u, v]) => ({ x: axisU.x * u + axisV.x * v, y: axisU.y * u + axisV.y * v }));
}

function slabRing(slab) {
  return slab.boundaryPoints.map((point) => ({ x: point.x, y: point.y }));
}

/** The storey whose slab rests on this floor's beams: the next one up. */
function floorAbove(project, floor) {
  if (!floor) return null;
  const floors = getOrderedFloors(project);
  const index = floors.findIndex((entry) => entry.id === floor.id);
  return index < 0 ? null : floors[index + 1] || null;
}

function coverageSlabs(project, floor, beamBoundary) {
  const above = floorAbove(project, floor);
  const slabs = getFloorFootprintSlabs(above);
  return {
    floor: above,
    slabs: beamBoundary
      ? slabs.filter((slab) => intersectionArea(slabRing(slab), beamBoundary) > MIN_AREA_OVERLAP)
      : slabs,
  };
}

/**
 * One ring out of a union that may have come apart into several: the region the
 * beams are under, or the largest one when there are no beams to ask. Whatever
 * is left over is another part of the building that happens to share a slab.
 */
function pickPrimaryRing(regions, reference) {
  if (!regions.length) return null;
  const score = reference
    ? (region) => intersectionArea(region.outline, reference)
    : (region) => polygonArea(region.outline);
  return regions.reduce((best, region) => (score(region) > score(best) ? region : best)).outline;
}

/**
 * The slabs overhead that shape a ceiling's plan extent, and the storey they
 * belong to.
 *
 * A floor's beams frame the TOP of its own storey and the next floor's slab
 * rests on them, so what a ceiling closes off is the underside of the slab
 * above. That ring already reaches over any cantilever — a cantilever is not an
 * object, it is a slab drawn past the storey below — which is exactly what the
 * beams cannot report, there being none under it.
 *
 * Slabs clear of the beam group are left out: one floor can carry several
 * ceilings under several slabs, and unioning all of them would make every
 * ceiling cover everything. With no beam rectangle there is nothing to be local
 * to, so every slab counts.
 *
 * @returns {{floor: object | null, slabs: Array<object>}}
 */
export function selectCeilingCoverageSlabs({ project, floor, supportBeams = [] } = {}) {
  return coverageSlabs(project, floor, deriveCeilingBoundaryFromBeams(supportBeams, floor));
}

/**
 * Plan boundary for a ceiling: the beams' rectangle widened to whatever the
 * slab above actually covers.
 *
 * The beams still fix the plane and trim the outline where nothing overhead
 * disagrees; the slab says how far the storey being closed off really reaches.
 * The union of the two is the only answer that covers a cantilever, which has a
 * slab over it and no beam under it. No slab above — a top floor, or a frame
 * carrying nothing but roof beams — leaves the beams the sole authority, as
 * before.
 *
 * One flat ring comes back, holes dropped: every consumer of a ceiling boundary
 * is written for a single ring, and structure crossing a ceiling is already cut
 * out of the boards as an obstruction rather than as a hole in the outline.
 *
 * Returns null when there is nothing sane to draw, leaving the caller to fall
 * back to whatever boundary the ceiling has stored.
 */
export function deriveCeilingStructuralCoverage({ project, floor, supportBeams = [] } = {}) {
  const beamBoundary = deriveCeilingBoundaryFromBeams(supportBeams, floor);
  const { slabs } = coverageSlabs(project, floor, beamBoundary);
  if (!slabs.length) return beamBoundary;

  const rings = slabs.map(slabRing);
  return pickPrimaryRing(unionPolygons(beamBoundary ? [...rings, beamBoundary] : rings), beamBoundary);
}
