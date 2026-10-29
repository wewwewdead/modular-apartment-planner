import {
  CEILING_ATTACHMENT_MODES,
  ceilingElevationRange,
  resolveCeilingCoverageSlabs,
  resolveCeilingElevations,
} from '@/domain/ceilingModels';
import { collectCeilingBandStructure } from '@/domain/ceilingObstructions';

const FLOOR_COLLECTIONS = [
  'annotations',
  'beams',
  'columns',
  'doors',
  'fixtures',
  'landings',
  'railings',
  'rooms',
  'sectionCuts',
  'slabs',
  'stairs',
  'walls',
  'windows',
];

function stripFloor(floor) {
  const stripped = { ...floor };
  for (const collection of FLOOR_COLLECTIONS) {
    stripped[collection] = [];
  }
  return stripped;
}

// The beams the ceiling hangs from, plus the columns they span between —
// without the columns the beams resolve to no geometry at all.
function collectSupportStructure(floor, beamIds = []) {
  const wanted = new Set(beamIds.filter(Boolean));
  const beams = (floor?.beams || []).filter((beam) => wanted.has(beam.id));
  const columnIds = new Set(
    beams
      .flatMap((beam) => [beam.startRef, beam.endRef])
      .filter((ref) => ref?.kind === 'column')
      .map((ref) => ref.id),
  );

  return { beams, columns: (floor?.columns || []).filter((column) => columnIds.has(column.id)) };
}

// Two sources may name the same member — a support beam usually crosses its own
// ceiling's band — so the merge is by id and the first mention wins its place.
function mergeById(...groups) {
  const seen = new Set();
  const merged = [];
  for (const group of groups) {
    for (const entry of group || []) {
      if (!entry || seen.has(entry.id)) continue;
      seen.add(entry.id);
      merged.push(entry);
    }
  }
  return merged;
}

/**
 * Builds a lightweight, ceiling-only project for the RCP editor's live 3D
 * viewport. The owning floor is kept for its elevation datum but stripped of
 * every collection, so nothing that merely stands under the ceiling hides it
 * from a camera looking up.
 *
 * What survives the stripping is the structure the ceiling itself is drawn
 * around. The obstruction tracer cuts the boards to every beam, column and wall
 * whose vertical extent reaches the ceiling band, so those members are put back
 * here from the same collection routine and against the same band: a column
 * standing mid-ceiling has a hole in the boards, and a hole with nothing in it
 * reads as a mistake rather than as a column. Asking the tracer instead of
 * repeating its elevation test is the point — the two answers cannot drift.
 *
 * The doors and windows of a restored wall come with it, because a wall the
 * main preview shows an opening in would otherwise stand solid here.
 *
 * A beam-attached ceiling additionally keeps the beams it hangs from and the
 * columns those beams span between, whatever the elevation test makes of them:
 * the ceiling boundary is trimmed to the beam faces and beam geometry resolves
 * through the columns, so dropping either would draw a different ceiling here
 * than the model has.
 *
 * The storey above comes along, stripped to the slabs overhead. Two reasons, and
 * the second is the load-bearing one. It is the deck the boards hang under, so a
 * camera looking up in this pane sees the same soffit it would see in the model
 * rather than open sky. And where the ceiling's beams frame no rectangle at all
 * — one beam, or a collinear pair — the slab IS the boundary, so a preview
 * project without it would re-derive a different ceiling than the model has.
 * Which slabs count is asked of the same routine the boundary asks, so the two
 * cannot drift.
 */
export function createCeilingDetailPreviewProject(project, ceilingId) {
  const ceiling = (project?.ceilings || []).find((entry) => entry.id === ceilingId) || null;
  if (!project || !ceiling) return null;

  const floor = (project.floors || []).find((entry) => entry.id === ceiling.floorId) || null;
  const previewFloor = floor ? stripFloor(floor) : null;

  if (previewFloor) {
    // The elevations are resolved against the real project on purpose: a hung
    // ceiling reads its attachment plane off the support beams, and the
    // stripped floor no longer has them to read.
    //
    // The bearing ends go down with the band for the same reason the band does
    // at all. In a stepped bay they are what lowers the band's floor under the
    // low step, so a preview asking without them would show a bay's worth of
    // structure the boards were never traced around — the two panes of the
    // editor telling the user different things about the same wall.
    const elevations = resolveCeilingElevations(project, ceiling);
    const band = collectCeilingBandStructure(floor, ceilingElevationRange(elevations), elevations.supportBearingEnds);
    const support =
      ceiling.attachment?.mode === CEILING_ATTACHMENT_MODES.BEAM
        ? collectSupportStructure(floor, ceiling.attachment.beamIds || [])
        : { beams: [], columns: [] };

    previewFloor.beams = mergeById(band.beams, support.beams);
    previewFloor.columns = mergeById(band.columns, support.columns);
    previewFloor.walls = band.walls;

    const wallIds = new Set(previewFloor.walls.map((wall) => wall.id));
    previewFloor.doors = (floor.doors || []).filter((door) => wallIds.has(door.wallId));
    previewFloor.windows = (floor.windows || []).filter((entry) => wallIds.has(entry.wallId));
  }

  const coverage = resolveCeilingCoverageSlabs(project, ceiling);
  const coverageFloor =
    coverage.floor && coverage.slabs.length ? { ...stripFloor(coverage.floor), slabs: coverage.slabs } : null;

  return {
    ...project,
    floors: [previewFloor, coverageFloor].filter(Boolean),
    ceilings: [ceiling],
    roofSystem: null,
    // Trusses stand above the ceiling and are no part of it; drawing them here
    // would only put chords between the viewer and the boards.
    trussSystems: [],
    building: project.building
      ? {
          ...project.building,
          systems: {},
        }
      : project.building,
  };
}
