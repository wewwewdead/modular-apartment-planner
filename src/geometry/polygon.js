export function signedPolygonArea(points) {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return area / 2;
}

export function polygonArea(points) {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area) / 2;
}

export function polygonCentroid(points) {
  let cx = 0,
    cy = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    cx += points[i].x;
    cy += points[i].y;
  }
  return { x: cx / n, y: cy / n };
}

/**
 * Area-weighted (shoelace) centroid — the centre of mass of the filled region.
 *
 * `polygonCentroid` above averages VERTICES, which is a different point as soon
 * as the vertices are unevenly spaced: an extra collinear vertex on one edge
 * drags it, and an L-shape lands it outside the arm it should sit in. Label
 * placement is tuned around that behaviour and keeps using it; this is the one
 * to use when the answer has to be the centre of the AREA.
 *
 * Winding-independent: reversing the ring negates every cross product and the
 * accumulated area alike, so the quotient is unchanged.
 *
 * Degenerate input has no centre of mass to report — fewer than three points, a
 * collinear run, or a self-cancelling ring all give zero signed area — so the
 * vertex mean stands in, which is what callers of `polygonCentroid` already get.
 */
export function polygonAreaCentroid(points) {
  let twiceArea = 0;
  let cx = 0;
  let cy = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const cross = points[i].x * points[j].y - points[j].x * points[i].y;
    twiceArea += cross;
    cx += (points[i].x + points[j].x) * cross;
    cy += (points[i].y + points[j].y) * cross;
  }
  if (twiceArea === 0) return polygonCentroid(points);
  return { x: cx / (3 * twiceArea), y: cy / (3 * twiceArea) };
}

function crossAt(origin, a, b) {
  return (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
}

/**
 * Do two segments share a point that is INTERIOR to both?
 *
 * A zero cross product means an endpoint lies on the other segment — a touch,
 * not a crossing — so all four must be strictly signed for the proper case.
 * Collinear segments have no sign to read, and two of them that overlap over a
 * length do share interior points, which is why they are measured separately
 * (and why `segmentIntersection` in ./line, which reports null for anything
 * parallel and counts endpoint contact as a hit, cannot stand in here).
 */
function segmentsShareInteriorPoint(a1, a2, b1, b2) {
  const d1 = crossAt(a1, a2, b1);
  const d2 = crossAt(a1, a2, b2);
  const d3 = crossAt(b1, b2, a1);
  const d4 = crossAt(b1, b2, a2);

  if (d1 !== 0 && d2 !== 0 && d3 !== 0 && d4 !== 0) {
    return d1 > 0 !== d2 > 0 && d3 > 0 !== d4 > 0;
  }
  if (d1 !== 0 || d2 !== 0 || d3 !== 0 || d4 !== 0) return false;

  // Collinear. Project onto whichever axis the shared line actually runs along
  // — the other one collapses — and demand overlap with length: meeting at a
  // single point is contact, not overlap. A zero-length segment collapses to a
  // point and fails this by construction.
  const alongX = Math.abs(a2.x - a1.x) + Math.abs(b2.x - b1.x) >= Math.abs(a2.y - a1.y) + Math.abs(b2.y - b1.y);
  const axis = alongX ? 'x' : 'y';
  const low = Math.max(Math.min(a1[axis], a2[axis]), Math.min(b1[axis], b2[axis]));
  const high = Math.min(Math.max(a1[axis], a2[axis]), Math.max(b1[axis], b2[axis]));
  return high - low > 0;
}

/**
 * True when the closed ring crosses itself — the one shape a floor plate must
 * never be dragged into.
 *
 * Only NON-ADJACENT edge pairs are tested: neighbouring edges always meet at
 * the vertex between them, and that shared endpoint is the ring being closed,
 * not a fault. What counts is a point interior to both edges, so a vertex that
 * lands exactly ON a far edge stays legal — a drag pushed one step further
 * crosses properly and is caught then, which lets an edit stop at the touching
 * configuration rather than one snap step short of it.
 *
 * O(n²) on purpose: a plate carries a handful of vertices and this runs on
 * every pointer-move, where a sweep line would cost more to set up than it
 * saves.
 */
export function polygonSelfIntersects(points = []) {
  const n = points.length;
  // Every edge pair of a triangle is adjacent, so nothing below four can cross.
  if (n < 4) return false;

  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      // The last edge wraps round to meet the first, so that pair is adjacent too.
      if (i === 0 && j === n - 1) continue;
      if (segmentsShareInteriorPoint(points[i], points[(i + 1) % n], points[j], points[(j + 1) % n])) {
        return true;
      }
    }
  }
  return false;
}

export function pointInPolygon(point, polygon) {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x,
      yi = polygon[i].y;
    const xj = polygon[j].x,
      yj = polygon[j].y;
    if (yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
