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

  const previewFloor = {
    ...floor,
    walls: [wall],
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
