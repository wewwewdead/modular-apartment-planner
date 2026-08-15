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

/**
 * The structure of one floor that reaches the ceiling band, as the objects
 * themselves rather than their footprints. Tracing a cutout and deciding what a
 * ceiling-only view has to contain are the same question asked twice, so both
 * ask it here: anything that answers the elevation test separately will sooner
 * or later disagree with the boards it is supposed to explain.
 */
export function collectCeilingBandStructure(floor, range) {
  if (!floor || !range || !(range.max > range.min)) return { beams: [], columns: [], walls: [] };

  const columns = floor.columns || [];
  const floorLevel = getFloorElevation(floor);

  return {
    // Beam levels are absolute: the stored level is the beam's top, and it hangs
    // its own depth below that.
    beams: (floor.beams || []).filter((beam) => {
      const top = Number(beam?.floorLevel || 0);
      return reachesCeilingBand(top - positive(beam?.depth), top, range);
    }),
    columns: columns.filter((column) => reachesCeilingBand(floorLevel, floorLevel + positive(column?.height), range)),
    walls: (floor.walls || []).filter((wall) => {
      const wallBase = floorLevel + wallBaseOffset(wall);
      return reachesCeilingBand(wallBase, wallBase + positive(wall?.height), range);
    }),
  };
}

function floorObstructions(floor, range) {
  const columns = floor?.columns || [];
  const band = collectCeilingBandStructure(floor, range);
  const outlines = [
    ...band.beams.map((beam) => getBeamRenderData(beam, columns)?.outline),
    ...band.columns.map((column) => columnOutline(column)),
    ...band.walls.map((wall) => getWallRenderData(wall, columns)?.outline),
  ];

  return outlines.filter((outline) => (outline?.length || 0) >= 3);
}

export function collectCeilingObstructions(floors = [], range = null) {
  if (!range || !(range.max > range.min)) return [];
  return floors.filter(Boolean).flatMap((floor) => floorObstructions(floor, range));
}
