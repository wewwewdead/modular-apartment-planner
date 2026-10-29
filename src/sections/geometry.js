import { pointInPolygon } from '@/geometry/polygon';
import { distanceToSegment } from '@/geometry/line';
import { projectPointToSectionCut, sectionCutLength, sectionCutPointAtAlong } from '@/geometry/sectionCutGeometry';

const EPSILON = 1e-6;

export function sectionPlanPoint(cut, point) {
  const projected = projectPointToSectionCut(cut, point);
  return { x: projected.along, y: projected.offset };
}

export function subtractSectionIntervals(intervals, holes = []) {
  return holes.reduce(
    (remaining, hole) =>
      remaining.flatMap((interval) => {
        if (hole.right <= interval.left + EPSILON || hole.left >= interval.right - EPSILON) return [interval];
        return [
          { left: interval.left, right: Math.min(interval.right, hole.left) },
          { left: Math.max(interval.left, hole.right), right: interval.right },
        ].filter((part) => part.right - part.left > EPSILON);
      }),
    intervals,
  );
}

// Test every interval between crossings, rather than joining the first and
// last hit. A U-shaped footprint can intersect the same cut more than once.
export function sectionCutIntervals(cut, outline = [], holes = []) {
  if (outline.length < 3 || sectionCutLength(cut) < EPSILON) return [];
  const points = outline.map((point) => sectionPlanPoint(cut, point));
  const length = sectionCutLength(cut);
  const crossings = [0, length];
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (Math.abs(a.y) < EPSILON) crossings.push(a.x);
    if ((a.y < 0 && b.y > 0) || (a.y > 0 && b.y < 0)) {
      crossings.push(a.x + ((b.x - a.x) * -a.y) / (b.y - a.y));
    }
  }
  const values = crossings
    .filter((x) => x >= 0 && x <= length)
    .sort((a, b) => a - b)
    .filter((x, i, all) => i === 0 || x - all[i - 1] > EPSILON);
  const intervals = [];
  for (let i = 1; i < values.length; i += 1) {
    const left = values[i - 1];
    const right = values[i];
    const mid = { x: (left + right) / 2, y: 0 };
    const inside =
      pointInPolygon(mid, points) ||
      points.some((a, j) => distanceToSegment(mid, a, points[(j + 1) % points.length]) < EPSILON);
    if (inside) intervals.push({ left, right });
  }
  return subtractSectionIntervals(
    intervals,
    holes.flatMap((hole) => sectionCutIntervals(cut, hole)),
  );
}

// Clip the parameter range, so all interpolated values (including elevation)
// stay at their real positions when the section is shortened or made shallower.
export function clipSectionSegment(cut, start, end) {
  let from = 0;
  let to = 1;
  const limits = [
    ['x', 0, sectionCutLength(cut)],
    ['y', 0, Math.max(0, cut.depth ?? 0)],
  ];
  for (const [key, min, max] of limits) {
    const delta = end[key] - start[key];
    if (Math.abs(delta) < EPSILON) {
      if (start[key] < min - EPSILON || start[key] > max + EPSILON) return null;
      continue;
    }
    const a = (min - start[key]) / delta;
    const b = (max - start[key]) / delta;
    from = Math.max(from, Math.min(a, b));
    to = Math.min(to, Math.max(a, b));
    if (to - from < EPSILON) return null;
  }
  const at = (t) =>
    Object.fromEntries(Object.keys(start).map((key) => [key, start[key] + (end[key] - start[key]) * t]));
  return { start: at(from), end: at(to), from, to };
}

export function sectionProjectedFaces(cut, outline = []) {
  return outline.flatMap((point, index) => {
    const segment = clipSectionSegment(
      cut,
      sectionPlanPoint(cut, point),
      sectionPlanPoint(cut, outline[(index + 1) % outline.length]),
    );
    if (!segment || Math.abs(segment.end.x - segment.start.x) < EPSILON) return [];
    const { start, end } = segment;
    const depthSlope = (end.y - start.y) / (end.x - start.x);
    return [
      {
        left: Math.min(start.x, end.x),
        right: Math.max(start.x, end.x),
        depth: (start.y + end.y) / 2,
        depthSlope,
        depthIntercept: start.y - depthSlope * start.x,
        edgeIndex: index,
      },
    ];
  });
}

export function projectSectionLine(cut, start, end, metadata) {
  const clipped = clipSectionSegment(
    cut,
    { ...sectionPlanPoint(cut, start), z: start.elevation },
    { ...sectionPlanPoint(cut, end), z: end.elevation },
  );
  if (!clipped) return null;
  const a = clipped.start;
  const b = clipped.end;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  if (Math.hypot(dx, dz) < EPSILON) return null;
  const depthSlope = Math.abs(dx) > EPSILON ? (b.y - a.y) / dx : 0;
  const depthSlopeZ = Math.abs(dx) > EPSILON ? 0 : (b.y - a.y) / dz;
  return {
    ...metadata,
    renderMode: Math.max(Math.abs(a.y), Math.abs(b.y)) < EPSILON ? 'cut' : 'projection',
    points: [
      { x: a.x, z: a.z },
      { x: b.x, z: b.z },
    ],
    depth: (a.y + b.y) / 2,
    depthSlope,
    depthSlopeZ,
    depthIntercept: a.y - depthSlope * a.x - depthSlopeZ * a.z,
  };
}

export function buildSectionPrism({ id, category, sourceId, cut, outline, holes = [], bottom, top }) {
  if (!outline?.length || top - bottom <= EPSILON) return [];
  const common = { category, sourceId, bottom, top };
  return [
    ...sectionCutIntervals(cut, outline, holes).map((interval, index) => ({
      ...common,
      ...interval,
      id: `${id}-cut-${index}`,
      renderMode: 'cut',
      depth: 0,
    })),
    ...[outline, ...holes].flatMap((ring, ringIndex) =>
      sectionProjectedFaces(cut, ring).map((face) => ({
        ...common,
        ...face,
        id: `${id}-face-${ringIndex}-${face.edgeIndex}`,
        renderMode: 'projection',
      })),
    ),
  ];
}

export function projectSectionSurface(cut, vertices, metadata) {
  let points = vertices.map((point) => ({ ...sectionPlanPoint(cut, point), z: point.z }));
  for (const [key, limit, sign] of [
    ['x', 0, 1],
    ['x', sectionCutLength(cut), -1],
    ['y', 0, 1],
    ['y', cut.depth, -1],
  ]) {
    const clipped = [];
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const da = sign * (a[key] - limit);
      const db = sign * (b[key] - limit);
      if (da >= -EPSILON) clipped.push(a);
      if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
        const t = da / (da - db);
        clipped.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
      }
    }
    points = clipped;
  }
  if (points.length < 3) return null;
  const a = points[0];
  for (let i = 1; i < points.length - 1; i += 1) {
    const b = points[i];
    const c = points[i + 1];
    const dx1 = b.x - a.x;
    const dz1 = b.z - a.z;
    const dd1 = b.y - a.y;
    const dx2 = c.x - a.x;
    const dz2 = c.z - a.z;
    const dd2 = c.y - a.y;
    const det = dx1 * dz2 - dx2 * dz1;
    if (Math.abs(det) < EPSILON) continue;
    const depthSlope = (dd1 * dz2 - dd2 * dz1) / det;
    const depthSlopeZ = (dx1 * dd2 - dx2 * dd1) / det;
    return {
      ...metadata,
      renderMode: 'projection',
      points: points.map(({ x, z }) => ({ x, z })),
      depth: points.reduce((sum, p) => sum + p.y, 0) / points.length,
      depthSlope,
      depthSlopeZ,
      depthIntercept: a.y - depthSlope * a.x - depthSlopeZ * a.z,
    };
  }
  return null;
}

export function buildSlopedSectionPrism({ id, category, sourceId, style, cut, outline, bottomAt, topAt }) {
  const common = { category, sourceId, style };
  const cuts = sectionCutIntervals(cut, outline).map((interval, index) => {
    const a = sectionCutPointAtAlong(cut, interval.left);
    const b = sectionCutPointAtAlong(cut, interval.right);
    return {
      ...common,
      id: `${id}-cut-${index}`,
      renderMode: 'cut',
      depth: 0,
      points: [
        { x: interval.left, z: topAt(a) },
        { x: interval.right, z: topAt(b) },
        { x: interval.right, z: bottomAt(b) },
        { x: interval.left, z: bottomAt(a) },
      ],
    };
  });
  const faces = outline.map((a, index) => {
    const b = outline[(index + 1) % outline.length];
    return projectSectionSurface(
      cut,
      [
        { ...a, z: topAt(a) },
        { ...b, z: topAt(b) },
        { ...b, z: bottomAt(b) },
        { ...a, z: bottomAt(a) },
      ],
      { ...common, id: `${id}-face-${index}` },
    );
  });
  for (const [name, elevationAt] of [
    ['top', topAt],
    ['bottom', bottomAt],
  ]) {
    faces.push(
      projectSectionSurface(
        cut,
        outline.map((point) => ({ ...point, z: elevationAt(point) })),
        { ...common, id: `${id}-${name}` },
      ),
    );
  }
  return [...cuts, ...faces.filter(Boolean)];
}
