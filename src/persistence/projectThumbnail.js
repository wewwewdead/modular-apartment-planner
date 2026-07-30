import { getOrderedFloors } from '@/domain/floorModels';

const DEFAULT_WIDTH = 480;
const DEFAULT_HEIGHT = 360;
const DEFAULT_PADDING = 24;
const FALLBACK_EXTENT = 1000;
const FALLBACK_WALL_THICKNESS = 100;

const COLORS = {
  background: '#f6f5f2',
  room: '#e5dfd4',
  wall: '#31363b',
  opening: '#f6f5f2',
  label: '#8b8577',
};

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function num(value) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

function isFinitePoint(point) {
  return Boolean(point) && Number.isFinite(point.x) && Number.isFinite(point.y);
}

function resolveFloor(project, floorId) {
  const floors = getOrderedFloors(project);
  if (!floors.length) return null;
  if (floorId) return floors.find((floor) => floor.id === floorId) || null;
  return floors[0];
}

function collectWalls(floor) {
  return (floor?.walls || [])
    .filter((wall) => isFinitePoint(wall?.start) && isFinitePoint(wall?.end))
    .map((wall) => ({
      id: wall.id,
      start: wall.start,
      end: wall.end,
      thickness: Number.isFinite(wall.thickness) && wall.thickness > 0 ? wall.thickness : FALLBACK_WALL_THICKNESS,
    }));
}

function collectRooms(floor) {
  return (floor?.rooms || [])
    .map((room) => (room?.points || []).filter(isFinitePoint))
    .filter((points) => points.length >= 3);
}

function collectOpenings(floor, walls) {
  const wallsById = new Map(walls.map((wall) => [wall.id, wall]));
  const openings = [];

  for (const opening of [...(floor?.doors || []), ...(floor?.windows || [])]) {
    const wall = wallsById.get(opening?.wallId);
    if (!wall) continue;
    if (!Number.isFinite(opening.offset) || !Number.isFinite(opening.width) || opening.width <= 0) continue;

    const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
    if (!(length > 0)) continue;

    const unitX = (wall.end.x - wall.start.x) / length;
    const unitY = (wall.end.y - wall.start.y) / length;
    const centerX = wall.start.x + unitX * opening.offset;
    const centerY = wall.start.y + unitY * opening.offset;
    const half = opening.width / 2;

    openings.push({
      start: { x: centerX - unitX * half, y: centerY - unitY * half },
      end: { x: centerX + unitX * half, y: centerY + unitY * half },
      thickness: wall.thickness,
    });
  }

  return openings;
}

function computeBounds(walls, rooms) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const include = (x, y, margin = 0) => {
    minX = Math.min(minX, x - margin);
    minY = Math.min(minY, y - margin);
    maxX = Math.max(maxX, x + margin);
    maxY = Math.max(maxY, y + margin);
  };

  walls.forEach((wall) => {
    const margin = wall.thickness / 2;
    include(wall.start.x, wall.start.y, margin);
    include(wall.end.x, wall.end.y, margin);
  });
  rooms.forEach((points) => points.forEach((point) => include(point.x, point.y)));

  const isBounded = [minX, minY, maxX, maxY].every(Number.isFinite);
  return isBounded ? { minX, minY, maxX, maxY } : null;
}

function renderRoom(points) {
  const coordinates = points.map((point) => `${num(point.x)},${num(point.y)}`).join(' ');
  return `<polygon points="${coordinates}" fill="${COLORS.room}"/>`;
}

function renderSegment(segment, color, linecap) {
  return (
    `<line x1="${num(segment.start.x)}" y1="${num(segment.start.y)}" ` +
    `x2="${num(segment.end.x)}" y2="${num(segment.end.y)}" ` +
    `stroke="${color}" stroke-width="${num(segment.thickness)}" stroke-linecap="${linecap}"/>`
  );
}

function renderPlaceholder(project, width, height) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(width)}" height="${num(height)}" ` +
      `viewBox="0 0 ${num(width)} ${num(height)}">`,
    `<rect x="0" y="0" width="${num(width)}" height="${num(height)}" fill="${COLORS.background}"/>`,
    `<text x="${num(width / 2)}" y="${num(height / 2)}" text-anchor="middle" dominant-baseline="middle" ` +
      `font-family="system-ui, sans-serif" font-size="18" fill="${COLORS.label}">` +
      `${escapeXml(project?.name || 'Untitled Project')}</text>`,
    '</svg>',
  ].join('');
}

export function generateProjectThumbnailSvg(project, options = {}) {
  const width = Number.isFinite(options.width) && options.width > 0 ? options.width : DEFAULT_WIDTH;
  const height = Number.isFinite(options.height) && options.height > 0 ? options.height : DEFAULT_HEIGHT;
  const padding = Number.isFinite(options.padding) && options.padding >= 0 ? options.padding : DEFAULT_PADDING;

  const floor = resolveFloor(project, options.floorId ?? null);
  const walls = collectWalls(floor);
  const rooms = collectRooms(floor);
  const bounds = computeBounds(walls, rooms);
  if (!bounds) return renderPlaceholder(project, width, height);

  const contentWidth = Math.max(bounds.maxX - bounds.minX, 0) || FALLBACK_EXTENT;
  const contentHeight = Math.max(bounds.maxY - bounds.minY, 0) || FALLBACK_EXTENT;
  const scale = Math.min(
    Math.max(width - padding * 2, 1) / contentWidth,
    Math.max(height - padding * 2, 1) / contentHeight,
  );
  if (!Number.isFinite(scale) || scale <= 0) return renderPlaceholder(project, width, height);

  // The viewBox is sized in model millimetres so padding and centering fall out of the fit scale.
  const viewWidth = width / scale;
  const viewHeight = height / scale;
  const viewX = (bounds.minX + bounds.maxX) / 2 - viewWidth / 2;
  const viewY = (bounds.minY + bounds.maxY) / 2 - viewHeight / 2;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(width)}" height="${num(height)}" ` +
      `viewBox="${num(viewX)} ${num(viewY)} ${num(viewWidth)} ${num(viewHeight)}">`,
    `<rect x="${num(viewX)}" y="${num(viewY)}" width="${num(viewWidth)}" height="${num(viewHeight)}" ` +
      `fill="${COLORS.background}"/>`,
    ...rooms.map(renderRoom),
    ...walls.map((wall) => renderSegment(wall, COLORS.wall, 'round')),
    ...collectOpenings(floor, walls).map((opening) => renderSegment(opening, COLORS.opening, 'butt')),
    '</svg>',
  ].join('');
}
