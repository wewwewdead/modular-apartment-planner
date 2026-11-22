import { resolveWallVerticalSpan, wallOutboardOffset, WALL_FRAMING_MODES } from '@/domain/wallFit';
import { perpendicular } from '@/geometry/point';
import { wallDirection } from '@/geometry/wallGeometry';

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
    roofSystems: [],
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

/**
 * Which way the live 3D pane should look to see the face being edited
 * (docs/wall-fastener-visibility.md §2.1): the face's outward normal and a
 * point on the wall's centre plane, in world x/z — plan (x, y) is world
 * (x, z). The normal is the one the scene builder stands that face's boards
 * and screws out along, `perpendicular(wallDirection(wall))` times the layer's
 * `sign` (`deriveWallAssemblyLayers`); the plane runs through the built body,
 * which an outboard wall carries off its drawn line (`wallOutboardOffset`).
 *
 * `layer` is the derived board layer of the active face. Four plain numbers,
 * because the pane takes them as props and its memo must hold; `null` when the
 * wall or the layer is missing.
 */
export function wallFacePreviewFacing(wall, layer) {
  if (!wall?.start || !wall?.end || !layer || !Number.isFinite(layer.sign) || layer.sign === 0) return null;
  const normal = perpendicular(wallDirection(wall));
  // A zero-length wall has no direction, so no face to look at.
  if (!(Math.hypot(normal.x, normal.y) > 0)) return null;
  const offset = wallOutboardOffset(wall);
  return {
    normalX: normal.x * layer.sign,
    normalZ: normal.y * layer.sign,
    pointX: (wall.start.x + wall.end.x) / 2 + normal.x * offset,
    pointZ: (wall.start.y + wall.end.y) / 2 + normal.y * offset,
  };
}
