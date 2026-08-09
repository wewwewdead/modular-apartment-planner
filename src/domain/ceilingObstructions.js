import { getBeamRenderData } from '@/geometry/beamGeometry';
import { columnOutline } from '@/geometry/columnGeometry';
import { getWallRenderData } from '@/geometry/wallColumnGeometry';
import { getFloorElevation } from './floorModels';
import { wallBaseOffset } from './wallFit';

const EPSILON = 0.01;

/**
 * Plan footprints of the structure a ceiling has to stop at: the beams it hangs
 * beside, the columns that pass through it, and the walls and partitions that
 * divide the space under it.
 *
 * Everything is filtered by elevation, because only structure that actually
 * crosses the ceiling's own slice of the room can obstruct it — a beam two
 * floors down or a half-height partition that dies below the boards does not.
 */

/**
 * Closed on both ends on purpose: structure that reaches the ceiling exactly —
 * a wall whose top finishes level with the board underside — carries the
 * ceiling rather than passing under it, so it still bounds the boards.
 */
function reachesCeilingBand(bottom, top, range) {
  return top >= range.min - EPSILON && bottom <= range.max + EPSILON;
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function floorObstructions(floor, range) {
  const columns = floor?.columns || [];
  const floorLevel = getFloorElevation(floor);
  const outlines = [];

  // Beam levels are absolute: the stored level is the beam's top, and it hangs
  // its own depth below that.
  for (const beam of floor?.beams || []) {
    const top = Number(beam?.floorLevel || 0);
    if (!reachesCeilingBand(top - positive(beam?.depth), top, range)) continue;
    outlines.push(getBeamRenderData(beam, columns)?.outline);
  }

  for (const column of columns) {
    if (!reachesCeilingBand(floorLevel, floorLevel + positive(column?.height), range)) continue;
    outlines.push(columnOutline(column));
  }

  for (const wall of floor?.walls || []) {
    const wallBase = floorLevel + wallBaseOffset(wall);
    if (!reachesCeilingBand(wallBase, wallBase + positive(wall?.height), range)) continue;
    outlines.push(getWallRenderData(wall, columns)?.outline);
  }

  return outlines.filter((outline) => (outline?.length || 0) >= 3);
}

export function collectCeilingObstructions(floors = [], range = null) {
  if (!range || !(range.max > range.min)) return [];
  return floors.filter(Boolean).flatMap((floor) => floorObstructions(floor, range));
}
