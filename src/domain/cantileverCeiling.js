import { getFloorFootprintPolygons, overhangEdgeInwardNormal } from '@/geometry/floorOverhang';
import { lerp } from '@/geometry/point';
import { pointInPolygon, polygonArea } from '@/geometry/polygon';
import { intersectionArea, subtractPolygons } from '@/geometry/polygonBoolean';
import { selectCeilingBeamsForArea } from './ceilingBeamAttachment';
import { CEILING_ATTACHMENT_MODES, CEILING_BOUNDARY_SOURCES, createCeilingForProject } from './ceilingModels';
import { getOrderedFloors } from './floorModels';

/**
 * Ceilings that close off the underside of a cantilevered slab.
 *
 * A floor's `slabs` are the deck it STANDS ON, and a ceiling hangs under the
 * deck overhead — so the ceiling that shuts an overhang belongs to the storey
 * you would stand on to look up at it, one below the slab that projects. Every
 * ceiling entry point used to file the new ceiling on the active floor, which
 * for someone standing on the cantilevered storey meant boards hung under the
 * storey ABOVE: the wrong deck, the wrong beams, and — because a ceiling's
 * obstructions are collected from its own floor and nowhere else — the wrong
 * structure to trace around. Getting `floorId` right is the whole fix; nothing
 * here stores an obstruction or a support, because everything downstream
 * re-derives both from the floor the ceiling names.
 *
 * Plan geometry in millimetres. Nothing dispatches and nothing reads editor
 * state: what comes back is ceiling objects ready for CEILING_ADD.
 */

/**
 * Below this a region is arithmetic rather than a piece of building. Two rings
 * that agree along an edge come out of the boolean as a sliver micrometres
 * wide, and a ceiling of one is a row in the list nobody can find or delete.
 * 0.01 m².
 */
export const MIN_CANTILEVER_CEILING_AREA_MM2 = 10_000;

/**
 * The floor a ceiling under this floor's deck belongs to: the previous storey in
 * stack order, or null on the lowest one, which has nothing beneath it to ceil.
 *
 * Kept beside the planner rather than in `floorModels` on purpose. "The floor
 * below" is only ever asked as this question — `ceilingBeamAttachment` keeps its
 * own private `floorAbove` for the mirror image — and a general-purpose
 * neighbour helper in the shared module would start being leaned on for
 * stacking rules that want a different answer about gaps and mezzanines.
 * `project.floors` order is not authoritative, so it goes through
 * `getOrderedFloors` like every other stack question.
 */
export function getCeilingHostFloor(project, floorId) {
  if (!floorId) return null;
  const floors = getOrderedFloors(project);
  const index = floors.findIndex((entry) => entry.id === floorId);
  return index > 0 ? floors[index - 1] : null;
}

/**
 * How far off the slab edge the probe stands. Small enough that a shallow reach
 * still has room for it, and far enough off the ring that `pointInPolygon` is
 * answering about the inside rather than about a point lying on a boundary
 * segment, where it answers whatever the arithmetic happens to say.
 */
const FOCUS_PROBE_INSET_MM = 50;

function slabRing(slab) {
  return (slab?.boundaryPoints || []).map((point) => ({ x: point.x, y: point.y }));
}

/**
 * The overhang region one measured run belongs to.
 *
 * A run is a stretch of the slab's own boundary, so it lies ON the ring and the
 * area it names is the one INSIDE that ring — the normal used here is the
 * inward one for that reason, not the outward one a "which side is the fresh
 * air on" reading would suggest. Stepping off the edge by a few centimetres puts
 * the probe squarely in the region the run bounds, and the regions are disjoint,
 * so at most one can claim it.
 *
 * The strip is the fallback for the cases a single probe cannot settle: a run
 * whose midpoint sits over the half-step of carried plate the measurement adds
 * at each end, or one whose depth was found in a direction its own edge does not
 * face. It is the run swept its own reach inwards, and the region it overlaps
 * most is the one the run is a part of. Nothing overlapping it at all means the
 * run names no region worth ceiling, and no ceiling is planned — silently
 * planning all of them instead would build the opposite of what was asked for.
 */
function regionsForRun(regions, run, ring) {
  const inward = overhangEdgeInwardNormal(run, ring);
  if (!inward) return [];

  const depthMm = Number.isFinite(run?.depthMm) ? run.depthMm : 0;
  const midpoint = lerp(run.start, run.end, 0.5);
  const inset = Math.max(1, Math.min(depthMm / 2, FOCUS_PROBE_INSET_MM));
  const probe = { x: midpoint.x + inward.x * inset, y: midpoint.y + inward.y * inset };

  const containing = regions.filter((outline) => pointInPolygon(probe, outline));
  if (containing.length) return containing;

  const strip = [
    run.start,
    run.end,
    { x: run.end.x + inward.x * depthMm, y: run.end.y + inward.y * depthMm },
    { x: run.start.x + inward.x * depthMm, y: run.start.y + inward.y * depthMm },
  ];
  let best = null;
  let bestArea = 0;
  for (const outline of regions) {
    const area = intersectionArea(strip, outline);
    if (area > bestArea) {
      bestArea = area;
      best = outline;
    }
  }
  return best ? [best] : [];
}

/**
 * Ceilings to hang under one slab's overhang, one per stretch of plate that
 * reaches past the storey below.
 *
 * The overhang is measured the way `computeSlabOverhang` measures it — against
 * the footprint the floor below presents — but as regions rather than edge runs,
 * because what a ceiling needs is an area to be traced over and a run along an
 * edge is not one. A storey below with no slabs at all yields nothing, for the
 * same reason the overhang measurement refuses it: an empty floor is an absence
 * of evidence, not a plate hanging over everything.
 *
 * Each region is asked the ordinary beam ladder against the floor BELOW, where
 * the deck-carried step is exactly this case — beside every bay, under a slab
 * those bays carry. The boundary is committed as 'drawn': `resolveCeilingBoundary`
 * re-derives any other source from beam coverage on every read, which would
 * silently replace a traced overhang outline with the beam-bay rectangle it was
 * deliberately drawn outside of.
 *
 * `focusRun` narrows the whole thing to ONE cantilever: a run record out of
 * `computeSlabOverhang`, which is what clicking an overhang indicator on the plan
 * selects. A plate reaching out on three sides is three cantilevers to whoever
 * has to build them, and ceiling the lot from one button is not what someone
 * pointing at one of them asked for. Without it nothing changes — every region
 * is planned, largest first.
 *
 * @returns {{floorBelow: object | null, ceilings: Array<object>}} largest region
 *   first, so a caller that has to pick one gets the piece of overhang someone
 *   actually meant rather than a corner of it.
 */
export function planCantileverCeilings(project, floor, slab, { phaseId = null, focusRun = null } = {}) {
  const floorBelow = getCeilingHostFloor(project, floor?.id);
  if (!floorBelow) return { floorBelow: null, ceilings: [] };

  const ring = slabRing(slab);
  if (ring.length < 3) return { floorBelow, ceilings: [] };

  const belowPolygons = getFloorFootprintPolygons(floorBelow);
  if (!belowPolygons.length) return { floorBelow, ceilings: [] };

  // Outer rings only. A plate overhanging on every side leaves the storey below
  // as a HOLE in the single overhang region, and a ceiling boundary is one ring
  // everywhere downstream — the RCP frame, the board layout, the 3D preview all
  // read it as one. Keeping the outer ring gives a ceiling that reaches back
  // over the floor below instead of a crash, and the structure it reaches over
  // is cut out as an obstruction on the next read anyway. Tracing a true annulus
  // is the draw tool's job.
  const regions = subtractPolygons(ring, belowPolygons)
    .map((region) => region.outline)
    .filter((outline) => outline.length >= 3 && polygonArea(outline) >= MIN_CANTILEVER_CEILING_AREA_MM2)
    .sort((first, second) => polygonArea(second) - polygonArea(first));

  const scoped = focusRun ? regionsForRun(regions, focusRun, ring) : regions;

  const ceilings = scoped.map((outline) => {
    const beamIds = selectCeilingBeamsForArea(floorBelow, outline, project);
    return createCeilingForProject(project, {
      name: 'Cantilever Ceiling',
      floorId: floorBelow.id,
      phaseId,
      attachment: {
        mode: beamIds.length ? CEILING_ATTACHMENT_MODES.BEAM : CEILING_ATTACHMENT_MODES.MANUAL,
        beamIds,
      },
      boundaryPolygon: outline,
      boundarySource: CEILING_BOUNDARY_SOURCES.DRAWN,
    });
  });

  return { floorBelow, ceilings };
}
