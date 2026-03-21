import { calculateDistance, getMidpoint, normalizeVector } from './canvasMath';

const TEXT_OFFSET = 16;
const TICK_SIZE = 10;

export function inferDimensionSubtype(p1, p2) {
  const dx = Math.abs(p2.x - p1.x);
  const dy = Math.abs(p2.y - p1.y);

  if (dy <= dx * 0.25) {
    return 'horizontal';
  }

  if (dx <= dy * 0.25) {
    return 'vertical';
  }

  return 'aligned';
}

export function measureDistance(p1, p2, subtype = 'aligned') {
  if (subtype === 'horizontal') {
    return Math.abs(p2.x - p1.x);
  }

  if (subtype === 'vertical') {
    return Math.abs(p2.y - p1.y);
  }

  return calculateDistance(p1, p2);
}

export function formatDimensionText(distance, units) {
  return `${Math.round(distance * 10) / 10} ${units}`;
}

function createTick(point, dirVector, normalVector) {
  const ax = point.x - ((dirVector.x + normalVector.x) * TICK_SIZE) / 2;
  const ay = point.y - ((dirVector.y + normalVector.y) * TICK_SIZE) / 2;
  const bx = point.x + ((dirVector.x + normalVector.x) * TICK_SIZE) / 2;
  const by = point.y + ((dirVector.y + normalVector.y) * TICK_SIZE) / 2;

  return {
    x1: ax,
    y1: ay,
    x2: bx,
    y2: by,
  };
}

export function getDimensionGeometry({ p1, p2, subtype, offset }) {
  if (subtype === 'horizontal') {
    const baseY = (p1.y + p2.y) / 2;
    const y = baseY + offset;
    const dimStart = { x: p1.x, y };
    const dimEnd = { x: p2.x, y };
    const dir = normalizeVector({ x: dimEnd.x - dimStart.x, y: dimEnd.y - dimStart.y });
    const normal = { x: 0, y: Math.sign(offset || -1) || -1 };

    return {
      ext1: { x1: p1.x, y1: p1.y, x2: dimStart.x, y2: dimStart.y },
      ext2: { x1: p2.x, y1: p2.y, x2: dimEnd.x, y2: dimEnd.y },
      dimLine: { x1: dimStart.x, y1: dimStart.y, x2: dimEnd.x, y2: dimEnd.y },
      tick1: createTick(dimStart, dir, normal),
      tick2: createTick(dimEnd, dir, normal),
      textPoint: { x: (dimStart.x + dimEnd.x) / 2, y: y + normal.y * TEXT_OFFSET },
      textAngle: 0,
      distance: measureDistance(p1, p2, subtype),
    };
  }

  if (subtype === 'vertical') {
    const baseX = (p1.x + p2.x) / 2;
    const x = baseX + offset;
    const dimStart = { x, y: p1.y };
    const dimEnd = { x, y: p2.y };
    const dir = normalizeVector({ x: dimEnd.x - dimStart.x, y: dimEnd.y - dimStart.y });
    const normal = { x: Math.sign(offset || 1) || 1, y: 0 };

    return {
      ext1: { x1: p1.x, y1: p1.y, x2: dimStart.x, y2: dimStart.y },
      ext2: { x1: p2.x, y1: p2.y, x2: dimEnd.x, y2: dimEnd.y },
      dimLine: { x1: dimStart.x, y1: dimStart.y, x2: dimEnd.x, y2: dimEnd.y },
      tick1: createTick(dimStart, dir, normal),
      tick2: createTick(dimEnd, dir, normal),
      textPoint: { x: x + normal.x * TEXT_OFFSET, y: (dimStart.y + dimEnd.y) / 2 },
      textAngle: -90,
      distance: measureDistance(p1, p2, subtype),
    };
  }

  const direction = normalizeVector({ x: p2.x - p1.x, y: p2.y - p1.y });
  const normal = { x: -direction.y, y: direction.x };
  const dimStart = {
    x: p1.x + normal.x * offset,
    y: p1.y + normal.y * offset,
  };
  const dimEnd = {
    x: p2.x + normal.x * offset,
    y: p2.y + normal.y * offset,
  };

  return {
    ext1: { x1: p1.x, y1: p1.y, x2: dimStart.x, y2: dimStart.y },
    ext2: { x1: p2.x, y1: p2.y, x2: dimEnd.x, y2: dimEnd.y },
    dimLine: { x1: dimStart.x, y1: dimStart.y, x2: dimEnd.x, y2: dimEnd.y },
    tick1: createTick(dimStart, direction, normal),
    tick2: createTick(dimEnd, direction, normal),
    textPoint: {
      x: getMidpoint(dimStart, dimEnd).x + normal.x * TEXT_OFFSET,
      y: getMidpoint(dimStart, dimEnd).y + normal.y * TEXT_OFFSET,
    },
    textAngle: Math.atan2(direction.y, direction.x) * (180 / Math.PI),
    distance: measureDistance(p1, p2, subtype),
  };
}
