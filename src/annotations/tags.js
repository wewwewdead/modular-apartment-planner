import { getColumnAutoLabel } from '@/domain/columnLabels';
import { getBeamRenderData } from '@/geometry/beamGeometry';
import { columnCenter } from '@/geometry/columnGeometry';
import { add, perpendicular, scale } from '@/geometry/point';
import { doorOutlineOnWall, wallDirection, windowOutlineOnWall } from '@/geometry/wallGeometry';
import { formatAreaLabel } from './format';
import { ANNOTATION_SEMANTIC_ROLES, ANNOTATION_TRUST_LEVELS } from './policy';

function formatRoomArea(room) {
  return formatAreaLabel(room.area);
}

function createTag(id, textLines, position, options = {}) {
  const lines = textLines.filter(Boolean);
  if (!lines.length) return null;

  return {
    id,
    type: 'tag',
    trustLevel: options.trustLevel ?? ANNOTATION_TRUST_LEVELS.INFORMATIONAL,
    semanticRole: options.semanticRole ?? ANNOTATION_SEMANTIC_ROLES.LABEL,
    sourceType: options.sourceType ?? null,
    sourceId: options.sourceId ?? null,
    position,
    angle: options.angle ?? 0,
    textLines: lines,
    textAnchor: options.textAnchor ?? 'middle',
    priority: options.priority ?? 0,
  };
}

function buildColumnTags(columns = []) {
  return columns
    .map((column, index) => createTag(
      `column-tag-${column.id}`,
      [column.name?.trim() || getColumnAutoLabel(column, columns) || `C${index + 1}`],
      columnCenter(column),
      { sourceType: 'column', sourceId: column.id, priority: 1 }
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
        { sourceType: 'beam', sourceId: beam.id, priority: 1 }
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
      { sourceType: 'room', sourceId: room.id, priority: 3 }
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
        { sourceType: 'door', sourceId: door.id, priority: 0 }
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
        { sourceType: 'window', sourceId: windowItem.id, priority: 0 }
      );
    })
    .filter(Boolean);
}

function estimateTagBounds(tag) {
  const fontSize = tag.sourceType === 'room' ? 150 : 120;
  const lineHeight = tag.sourceType === 'room' ? 166 : 150;
  const maxLineLength = Math.max(...tag.textLines.map((line) => line.length), 1);
  const width = Math.max(220, maxLineLength * fontSize * 0.62);
  const height = Math.max(lineHeight, tag.textLines.length * lineHeight);

  return {
    left: tag.position.x - width / 2,
    right: tag.position.x + width / 2,
    top: tag.position.y - height / 2,
    bottom: tag.position.y + height / 2,
  };
}

function intersects(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function applyCollisionOffsets(tags = []) {
  const placed = [];
  const offsets = [
    { x: 0, y: 0 },
    { x: 0, y: -180 },
    { x: 0, y: 180 },
    { x: 180, y: 0 },
    { x: -180, y: 0 },
    { x: 160, y: -130 },
    { x: -160, y: -130 },
  ];

  return [...tags]
    .sort((a, b) => b.priority - a.priority)
    .map((tag) => {
      for (const offset of offsets) {
        const candidate = {
          ...tag,
          position: {
            x: tag.position.x + offset.x,
            y: tag.position.y + offset.y,
          },
        };
        const candidateBounds = estimateTagBounds(candidate);
        if (!placed.some((placedTag) => intersects(candidateBounds, placedTag.bounds))) {
          placed.push({ bounds: candidateBounds });
          return candidate;
        }
      }

      const bounds = estimateTagBounds(tag);
      placed.push({ bounds });
      return tag;
    });
}

export function buildAnnotationTags(floor) {
  return applyCollisionOffsets([
    ...buildColumnTags(floor.columns || []),
    ...buildBeamTags(floor.beams || [], floor.columns || []),
    ...buildRoomTags(floor.rooms || []),
    ...buildDoorTags(floor.doors || [], floor.walls || []),
    ...buildWindowTags(floor.windows || [], floor.walls || []),
  ]);
}
