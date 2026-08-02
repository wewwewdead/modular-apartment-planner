/**
 * Placement geometry for pattern hardware (hinges, handles): turns a catalog
 * boring pattern plus a click into world-space hole positions.
 *
 * A pattern is authored in its own frame - `along` runs along the anchor edge,
 * `inset` runs from the edge into the part - so the same catalog entry works on
 * any edge of any part. Placement resolves the nearest edge of the clicked
 * part, orients the frame to it (edge direction + inward normal), and projects
 * the click onto the edge. `edge`-anchored patterns (hinges) clamp the
 * projection so every hole stays on the edge; `center`-anchored patterns
 * (handles) stay centred on the click and only borrow the edge's direction.
 *
 * Every function here is pure: the catalog lookup lives in fastenerUtils
 * (`getHardwarePattern`), and the caller passes the resolved pattern in.
 */
import { getRectCorners } from './entityUtils';

const FALLBACK_FRAME_DIR = { x: 0, y: 1 };
const FALLBACK_FRAME_NORMAL = { x: 1, y: 0 };

function subtract(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y;
}

function normalize(vector) {
  const length = Math.hypot(vector.x, vector.y);
  if (!length) {
    return null;
  }
  return { x: vector.x / length, y: vector.y / length };
}

/** Signed polygon area: positive for topLeft→topRight→bottomRight winding (y-down). */
function getSignedArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return area / 2;
}

/**
 * Segments a pattern can anchor to, each carrying the polygon's inward side
 * when there is one. `inwardSign` is +1 to rotate the edge direction by +90°
 * ((dx,dy) → (-dy,dx)), -1 for the other side, or 0 when the geometry is open
 * and the inward side must come from the click instead.
 */
function getAnchorSegments(targetEntity) {
  if (!targetEntity) {
    return [];
  }

  if (targetEntity.type === 'rect') {
    const corners = getRectCorners(targetEntity);
    const ring = [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft];
    return ring.map((start, index) => ({
      start,
      end: ring[(index + 1) % ring.length],
      inwardSign: 1,
    }));
  }

  if (targetEntity.type === 'polyline' && Array.isArray(targetEntity.points) && targetEntity.points.length >= 2) {
    const points = targetEntity.points;
    const first = points[0];
    const last = points[points.length - 1];
    const isClosed = targetEntity.closed === true || (points.length >= 3 && first.x === last.x && first.y === last.y);

    const ring = isClosed && first.x === last.x && first.y === last.y ? points.slice(0, -1) : points;
    const segmentCount = isClosed ? ring.length : ring.length - 1;
    const inwardSign = isClosed ? (getSignedArea(ring) >= 0 ? 1 : -1) : 0;

    const segments = [];
    for (let i = 0; i < segmentCount; i += 1) {
      segments.push({ start: ring[i], end: ring[(i + 1) % ring.length], inwardSign });
    }
    return segments;
  }

  if (targetEntity.type === 'line') {
    return [
      {
        start: { x: targetEntity.x1, y: targetEntity.y1 },
        end: { x: targetEntity.x2, y: targetEntity.y2 },
        inwardSign: 0,
      },
    ];
  }

  return [];
}

function getSegmentFrame(segment, point) {
  const dir = normalize(subtract(segment.end, segment.start));
  if (!dir) {
    return null;
  }

  const length = Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y);
  const projection = Math.min(Math.max(dot(subtract(point, segment.start), dir), 0), length);
  const closest = { x: segment.start.x + dir.x * projection, y: segment.start.y + dir.y * projection };
  const distance = Math.hypot(point.x - closest.x, point.y - closest.y);

  let normal = { x: -dir.y * segment.inwardSign, y: dir.x * segment.inwardSign };
  if (!segment.inwardSign) {
    // Open geometry has no interior; treat the click's side as "into the part".
    const towardClick = subtract(point, closest);
    const candidate = { x: -dir.y, y: dir.x };
    normal = dot(towardClick, candidate) >= 0 ? candidate : { x: dir.y, y: -dir.x };
  }

  return { start: segment.start, dir, normal, length, projection, distance };
}

/**
 * The edge frame a pattern orients to for a click on (or near) a target part:
 * the nearest anchorable segment, its direction, and its inward normal. Null
 * when the target has no usable segments.
 */
export function resolveNearestEdgeFrame(targetEntity, point) {
  let best = null;

  for (const segment of getAnchorSegments(targetEntity)) {
    const frame = getSegmentFrame(segment, point);
    if (frame && (!best || frame.distance < best.distance)) {
      best = frame;
    }
  }

  return best;
}

/** How far the pattern reaches along the edge on each side of its base point. */
function getAlongExtents(holes) {
  let min = Infinity;
  let max = -Infinity;

  for (const hole of holes) {
    const radius = (Number(hole.diameter) || 0) / 2;
    min = Math.min(min, hole.along - radius);
    max = Math.max(max, hole.along + radius);
  }

  return { min, max };
}

/**
 * World-space hole placements for a pattern clicked at `point` on (or near)
 * `targetEntity`. Always returns a placement: without a usable target edge the
 * pattern falls back to a vertical frame through the click, holes opening +x.
 */
export function resolveHardwarePatternPlacement(pattern, point, targetEntity = null) {
  if (!pattern || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    return null;
  }

  const edgeFrame = resolveNearestEdgeFrame(targetEntity, point);
  const dir = edgeFrame?.dir ?? FALLBACK_FRAME_DIR;
  const normal = edgeFrame?.normal ?? FALLBACK_FRAME_NORMAL;

  let base = point;
  if (pattern.anchor === 'edge' && edgeFrame) {
    const extents = getAlongExtents(pattern.holes);
    let projection = edgeFrame.projection;

    if (edgeFrame.length < extents.max - extents.min) {
      // Edge shorter than the pattern: centre it and let the ends overhang.
      projection = (edgeFrame.length - (extents.max + extents.min)) / 2;
    } else {
      projection = Math.min(Math.max(projection, -extents.min), edgeFrame.length - extents.max);
    }

    base = { x: edgeFrame.start.x + dir.x * projection, y: edgeFrame.start.y + dir.y * projection };
  }

  const holes = pattern.holes.map((hole) => ({
    cx: base.x + dir.x * hole.along + normal.x * hole.inset,
    cy: base.y + dir.y * hole.along + normal.y * hole.inset,
    diameter: hole.diameter,
    depth: hole.through === true ? null : (hole.depth ?? null),
    through: hole.through === true,
    role: hole.role ?? 'hole',
  }));

  return { holes, frame: { base, dir, normal, onEdge: Boolean(edgeFrame) } };
}

/**
 * `createFeatureEntity` configs for one placed pattern, in hole order. The
 * first config is the primary: it carries the catalog id, so the BOM bills the
 * set as one piece while every hole still exports as its own drill site.
 */
export function buildHardwarePatternFeatureConfigs(pattern, point, targetEntity = null, options = {}) {
  const placement = resolveHardwarePatternPlacement(pattern, point, targetEntity);

  if (!placement) {
    return [];
  }

  return placement.holes.map((hole, index) => ({
    featureType: 'hole',
    operation: 'subtract',
    shape: 'circle',
    cx: hole.cx,
    cy: hole.cy,
    diameter: hole.diameter,
    depth: hole.depth,
    through: hole.through,
    hardwareId: index === 0 ? pattern.hardwareId : null,
    targetPartId: options.targetPartId ?? null,
    meta: {
      hardwareKind: pattern.kind,
      hardwareRole: hole.role,
      ...options.meta,
    },
  }));
}
