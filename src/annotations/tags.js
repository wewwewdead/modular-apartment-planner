import { getColumnAutoLabel } from '@/domain/columnLabels';
import { getBeamRenderData } from '@/geometry/beamGeometry';
import { columnCenter } from '@/geometry/columnGeometry';
import { add, perpendicular, scale } from '@/geometry/point';
import { doorOutlineOnWall, wallDirection, windowOutlineOnWall } from '@/geometry/wallGeometry';

function formatRoomArea(room) {
  return room.area ? `${(room.area / 1_000_000).toFixed(2)} m²` : '';
}

function createTag(id, textLines, position, options = {}) {
  const lines = textLines.filter(Boolean);
  if (!lines.length) return null;

  return {
    id,
    type: 'tag',
    sourceType: options.sourceType ?? null,
    sourceId: options.sourceId ?? null,
    position,
    angle: options.angle ?? 0,
    textLines: lines,
    textAnchor: options.textAnchor ?? 'middle',
  };
}

function buildColumnTags(columns = []) {
  return columns
    .map((column, index) => createTag(
      `column-tag-${column.id}`,
      [column.name?.trim() || getColumnAutoLabel(column, columns) || `C${index + 1}`],
      columnCenter(column),
      { sourceType: 'column', sourceId: column.id }
    ))
    .filter(Boolean);
}

function buildBeamTags(beams = [], columns = []) {
  return beams
    .map((beam, index) => {
      const renderData = getBeamRenderData(beam, columns || []);
      if (!renderData) return null;
      return createTag(
        `beam-tag-${beam.id}`,
        [`B${index + 1}`],
        renderData.midpoint,
        { sourceType: 'beam', sourceId: beam.id }
      );
    })
    .filter(Boolean);
}

function buildRoomTags(rooms = []) {
  return rooms
    .map((room, index) => createTag(
      `room-tag-${room.id}`,
      [room.name?.trim() || `R${index + 1}`, formatRoomArea(room)],
      room.labelPosition,
      { sourceType: 'room', sourceId: room.id }
    ))
    .filter(Boolean);
}

function buildDoorTags(doors = [], walls = []) {
  return doors
    .map((door, index) => {
      const wall = walls.find((entry) => entry.id === door.wallId);
      if (!wall) return null;
      const info = doorOutlineOnWall(wall, door);
      const offset = scale(perpendicular(wallDirection(wall)), wall.thickness / 2 + 180);
      return createTag(
        `door-tag-${door.id}`,
        [`D${index + 1}`],
        add(info.center, offset),
        { sourceType: 'door', sourceId: door.id }
      );
    })
    .filter(Boolean);
}

function buildWindowTags(windows = [], walls = []) {
  return windows
    .map((windowItem, index) => {
      const wall = walls.find((entry) => entry.id === windowItem.wallId);
      if (!wall) return null;
      const info = windowOutlineOnWall(wall, windowItem);
      const offset = scale(perpendicular(wallDirection(wall)), wall.thickness / 2 + 180);
      return createTag(
        `window-tag-${windowItem.id}`,
        [`W${index + 1}`],
        add(info.center, offset),
        { sourceType: 'window', sourceId: windowItem.id }
      );
    })
    .filter(Boolean);
}

export function buildAnnotationTags(floor) {
  return [
    ...buildColumnTags(floor.columns || []),
    ...buildBeamTags(floor.beams || [], floor.columns || []),
    ...buildRoomTags(floor.rooms || []),
    ...buildDoorTags(floor.doors || [], floor.walls || []),
    ...buildWindowTags(floor.windows || [], floor.walls || []),
  ];
}
