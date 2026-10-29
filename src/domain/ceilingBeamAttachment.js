import { getBeamRenderData } from '@/geometry/beamGeometry';
import { getFloorFootprintSlabs } from '@/geometry/floorOverhang';
import { dot, normalize, perpendicular, subtract } from '@/geometry/point';
import { polygonArea } from '@/geometry/polygon';
import { intersectionArea, unionPolygons } from '@/geometry/polygonBoolean';
import { getFloorElevation, getOrderedFloors } from './floorModels';

/**
 * Which beams a ceiling may hang from, and the plan boundary the structure
 * around it gives it — the bay those beams enclose, falling back on the slab
 * overhead only where they enclose nothing.
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
 * The beams a ceiling traced over `polygon` should hang from, asked in three
 * widening steps — the beams the outline crosses, the bay it sits in, the deck
 * it sits under — each answer reduced to a single level by the same rule the
 * whole floor uses.
 *
 * Drawing an area is a statement about one room, so the beams framing the next
 * room have no business setting this ceiling's plane. The narrowest question is
 * therefore the first one: which eligible beams does this outline actually run
 * under?
 *
 * Crossing a beam is not the only way to be under one. The natural way to trace
 * a room's ceiling is to follow the room — inside the beams' inner faces, or
 * inside the plaster inside those — and such an outline touches no beam
 * footprint at all while sitting squarely in the bay those beams frame. So an
 * outline that crosses nothing is asked which level's bay it is drawn in. The
 * bay is the level's own rectangle, inner face to inner face, which is exactly
 * the area that level closes off.
 *
 * And an outline in no bay may still be under the building. A cantilever is not
 * an object — it is the deck drawn past the frame — so nothing out there crosses
 * a beam or falls inside a bay, and yet the underside of that deck is closed off
 * by a ceiling hung from the very beams the deck rests on. The last question is
 * that one: is this outline under a slab of the storey above, and is that slab
 * carried by a level of this floor? Carried is read the same way the ceiling
 * itself is bounded — the slab lies over the level's bay — so a level framing no
 * bay is never asked, which is right: it encloses no area for a deck to bear on.
 * A pair of parallel beams under a deck does frame one.
 *
 * A trace under no slab, or under one no level here carries, still returns
 * nothing: a ceiling drawn where neither framing nor deck reaches genuinely
 * hangs from nothing and belongs on a manual datum.
 *
 * `project` is optional and only the last step reads it — the slabs are the
 * storey above's, which a floor has no way to see on its own. Without it the
 * answer is exactly the first two steps.
 */
export function selectCeilingBeamsForArea(floor, polygon, project = null) {
  const outline = (polygon || []).filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y));
  if (outline.length < 3) return [];

  const columns = floor?.columns || [];
  const eligible = getEligibleCeilingSupportBeams(floor);
  const overlapping = eligible.filter((beam) => {
    const footprint = getBeamRenderData(beam, columns)?.outline || [];
    return footprint.length >= 3 && intersectionArea(footprint, outline) > MIN_AREA_OVERLAP;
  });
  if (overlapping.length) return selectPreferredLevel(groupBeamsIntoLevels(overlapping))?.beamIds || [];

  // Levels arrive highest first and filtering keeps that order, so the same
  // most-beams-then-highest preference applies to the bays as to the beams. The
  // bays are derived once and read by both of the remaining steps: they ask the
  // same rectangle about two different things.
  const levels = groupBeamsIntoLevels(eligible).map((level) => ({
    ...level,
    bay: deriveCeilingBoundaryFromBeams(level.beams, floor),
  }));

  const framingLevels = levels.filter((level) => level.bay && intersectionArea(level.bay, outline) > MIN_AREA_OVERLAP);
  if (framingLevels.length) return selectPreferredLevel(framingLevels)?.beamIds || [];

  // Beside the bay, but under the same structure: the slabs overhead that this
  // outline is actually drawn under.
  const decks = getFloorFootprintSlabs(floorAbove(project, floor))
    .map(slabRing)
    .filter((ring) => intersectionArea(ring, outline) > MIN_AREA_OVERLAP);
  if (!decks.length) return [];

  const carryingLevels = levels.filter(
    (level) => level.bay && decks.some((ring) => intersectionArea(ring, level.bay) > MIN_AREA_OVERLAP),
  );

  return selectPreferredLevel(carryingLevels)?.beamIds || [];
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
 * One ring out of a union that may have come apart into several: the largest.
 * Whatever is left over is another part of the building that happens to share a
 * slab, and a ceiling is one ring.
 *
 * Only the slab path asks, and the slab path only runs where the beams framed
 * nothing — so there is no beam rectangle here to prefer a region by.
 */
function pickPrimaryRing(regions) {
  if (!regions.length) return null;
  return regions.reduce((best, region) => (polygonArea(region.outline) > polygonArea(best.outline) ? region : best))
    .outline;
}

/**
 * The slabs overhead a ceiling sits under, and the storey they belong to.
 *
 * A floor's beams frame the TOP of its own storey and the next floor's slab
 * rests on them, so what a ceiling closes off is the underside of the slab
 * above. Two callers want to know which slabs those are: the RCP editor's
 * preview, which shows the deck overhead the boards hang under, and the
 * boundary itself in the one case where no beam frames a rectangle to use
 * instead.
 *
 * Slabs clear of the beam group are left out: one floor can carry several
 * ceilings under several slabs, and taking all of them would show every ceiling
 * the whole storey overhead. With no beam rectangle there is nothing to be local
 * to, so every slab counts.
 *
 * @returns {{floor: object | null, slabs: Array<object>}}
 */
export function selectCeilingCoverageSlabs({ project, floor, supportBeams = [] } = {}) {
  return coverageSlabs(project, floor, deriveCeilingBoundaryFromBeams(supportBeams, floor));
}

/**
 * Plan boundary for a ceiling: the beams' own rectangle, inner face to inner
 * face, wherever the beams frame one.
 *
 * THE BEAMS GOVERN. A ceiling is built in the bay its frame encloses, and the
 * faces a fitter sets the perimeter angle against are the beam faces — so the
 * boundary has to be those faces and nothing else. The slab above gets no say
 * while a beam rectangle exists, in either direction: not outwards, because a
 * slab traced over the frame or out to the grid lines would run the boards and
 * the framing past the beams into the zone the beams occupy, which is what the
 * user looked at and rejected; and not inwards, because a slab traced short
 * would pull the ceiling off the very faces it dies into and leave the beam
 * soffit bare behind a cut board edge.
 *
 * Only where the frame answers nothing does the slab speak: no support beams at
 * all, a single beam, or a set lying on one line all enclose no area, and a
 * ceiling still needs a shape. There the slabs overhead are unioned and the
 * largest ring taken, exactly as before.
 *
 * ACCEPTED TRADE-OFF: an AUTO ceiling no longer reaches a cantilever. A
 * cantilever is not an object — it is a slab drawn past the frame with no beam
 * under it — so a rule that traces beams cannot see it, and the ceiling stops at
 * the perimeter beam with the overhang left open. That is deliberate: reaching
 * it means asking the slab, and asking the slab is what put framing behind the
 * beam faces. A ceiling wanted under an overhang is TRACED with the draw tool,
 * and a drawn boundary is never re-derived — `resolveCeilingBoundary` returns
 * the stored ring outright for a 'drawn' source, so the escape hatch costs the
 * user one gesture and costs this rule nothing. No hybrid is attempted (slab
 * outwards, beams inwards, or the reverse): the two rings differ by half a beam
 * width against a column face, and every combination of them breeds slivers of
 * ceiling a few millimetres wide along the perimeter.
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
  if (beamBoundary) return beamBoundary;

  // Nothing framed: with no rectangle to be local to, every slab overhead is a
  // candidate and the union of them is all this ceiling knows about its shape.
  const { slabs } = coverageSlabs(project, floor, null);
  if (!slabs.length) return null;

  return pickPrimaryRing(unionPolygons(slabs.map(slabRing)));
}
