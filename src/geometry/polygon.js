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
