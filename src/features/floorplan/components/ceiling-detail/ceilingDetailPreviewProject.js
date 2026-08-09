import { CEILING_ATTACHMENT_MODES } from '@/domain/ceilingModels';

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

// The support beams a truss bears on, plus the columns they span between —
// without the columns the beams resolve to no geometry at all.
function collectSupportStructure(floor, trussSystem) {
  const beamIds = new Set(
    (trussSystem?.trussInstances || [])
      .flatMap((instance) => [instance?.supportBeamIds?.start, instance?.supportBeamIds?.end])
      .filter(Boolean),
  );
  const beams = (floor?.beams || []).filter((beam) => beamIds.has(beam.id));
  const columnIds = new Set(
    beams
      .flatMap((beam) => [beam.startRef, beam.endRef])
      .filter((ref) => ref?.kind === 'column')
      .map((ref) => ref.id),
  );

  return { beams, columns: (floor?.columns || []).filter((column) => columnIds.has(column.id)) };
}

/**
 * Builds a lightweight, ceiling-only project for the RCP editor's live 3D
 * viewport. The owning floor is kept for its elevation datum but stripped of
 * every collection, so nothing hides the ceiling from below. A truss-attached
 * ceiling keeps its truss system, because those chords are what it hangs from,
 * plus the beams those trusses bear on and the columns those beams span
 * between: the ceiling boundary is trimmed to the beam faces, so dropping them
 * would draw a wider ceiling here than the model has.
 */
export function createCeilingDetailPreviewProject(project, ceilingId) {
  const ceiling = (project?.ceilings || []).find((entry) => entry.id === ceilingId) || null;
  if (!project || !ceiling) return null;

  const floor = (project.floors || []).find((entry) => entry.id === ceiling.floorId) || null;
  const previewFloor = floor ? stripFloor(floor) : null;

  const attachedTrussSystem =
    ceiling.attachment?.mode === CEILING_ATTACHMENT_MODES.TRUSS
      ? (project.trussSystems || []).find((entry) => entry.id === ceiling.attachment.trussSystemId) || null
      : null;
  // A ceiling can hang from a truss on another floor, and the support beams sit
  // with the truss, so that floor comes along carrying only them.
  const trussFloor = attachedTrussSystem
    ? (project.floors || []).find((entry) => entry.id === attachedTrussSystem.floorId) || null
    : null;
  const previewTrussFloor = trussFloor && trussFloor.id !== previewFloor?.id ? stripFloor(trussFloor) : null;
  const supportFloor = previewTrussFloor || (trussFloor?.id === previewFloor?.id ? previewFloor : null);

  if (supportFloor) {
    const support = collectSupportStructure(trussFloor, attachedTrussSystem);
    supportFloor.beams = support.beams;
    supportFloor.columns = support.columns;
  }

  return {
    ...project,
    floors: [previewFloor, previewTrussFloor].filter(Boolean),
    ceilings: [ceiling],
    roofSystem: null,
    trussSystems: attachedTrussSystem ? [attachedTrussSystem] : [],
    building: project.building
      ? {
          ...project.building,
          systems: {},
        }
      : project.building,
  };
}
