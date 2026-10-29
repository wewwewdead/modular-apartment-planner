import { resolveWallVerticalSpan, WALL_FRAMING_MODES } from '@/domain/wallFit';

const NON_WALL_FLOOR_COLLECTIONS = ['beams', 'columns', 'fixtures', 'landings', 'railings', 'rooms', 'slabs', 'stairs'];

/**
 * Builds a lightweight, wall-only project for the assembly editor's live 3D
 * viewport. Keeping the hosted door/window gives the panel generator the same
 * cut-outs as the full model, while unrelated building geometry cannot hide the
 * detailed face or make camera fitting too wide.
 */
export function createWallDetailPreviewProject(project, floorId, wallId) {
  const floor = (project?.floors || []).find((entry) => entry.id === floorId);
  const wall = floor?.walls?.find((entry) => entry.id === wallId);
  if (!project || !floor || !wall) return null;

  // Emptying the floor takes away the deck a bypass wall's drop is derived
  // from, which would stand the preview wall back up on the storey line and
  // disagree with the elevation next to it. Carrying the resolved drop across as
  // an explicit override keeps the same span with none of the geometry.
  const span = resolveWallVerticalSpan(wall, floor, project);
  const previewWall =
    span.mode === WALL_FRAMING_MODES.BYPASS && span.drop > 0 ? { ...wall, bypassDrop: span.drop } : wall;

  const previewFloor = {
    ...floor,
    walls: [previewWall],
    doors: (floor.doors || []).filter((entry) => entry.wallId === wallId),
    windows: (floor.windows || []).filter((entry) => entry.wallId === wallId),
  };

  for (const collection of NON_WALL_FLOOR_COLLECTIONS) {
    previewFloor[collection] = [];
  }

  return {
    ...project,
    floors: [previewFloor],
    roofSystem: null,
    trussSystems: [],
    ceilings: [],
    building: project.building
      ? {
          ...project.building,
          systems: {},
        }
      : project.building,
  };
}
