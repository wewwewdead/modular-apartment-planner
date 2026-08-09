/**
 * Isolines through the sun-hours grid.
 *
 * The grid on its own is a field of coloured cells, and a field of coloured
 * cells reads as a swarm of blocks rather than as a map — the eye has nothing
 * to hold on to and no way to answer "how many hours is *this* spot" without
 * squinting at a legend. Contours are what map-makers add for exactly that:
 * lines of constant value, labelled, so the reader gets a number instead of a
 * hue, and the shape of the field becomes legible as terrain.
 *
 * Marching squares over the cell-centre lattice, so a contour passes through
 * the points the study actually evaluated rather than through cell corners it
 * never sampled. The lattice is one point smaller than the grid in each
 * direction; that is correct, not an off-by-one.
 *
 * Everything here is display geometry. Compliance numbers come from
 * `sunHoursGrid`, which counts cells and areas exactly; a contour is a smoothed
 * line through a sampled field and must never be measured.
 */

/** Candidate spacings, in hours. First one that keeps the map readable wins. */
const CONTOUR_STEPS = [0.5, 1, 2, 3, 4, 6];

/** Chaikin passes. Two rounds off the marching-squares staircase; more just costs points. */
const SMOOTHING_PASSES = 2;

/** Beyond this many segments a level is drawn raw — smoothing it would cost more than it reads. */
const SMOOTHING_SEGMENT_BUDGET = 8000;

/**
 * Hour levels to contour a field whose maximum is `maxHours`.
 *
 * Aims for a handful of lines: too few and the map says nothing, too many and
 * it turns back into the noise the contours were meant to replace. A level
 * sitting on the threshold is dropped, because the threshold contour is drawn
 * separately and heavier — it is the one line that carries a decision.
 */
export function sunHoursContourLevels(maxHours, { threshold = null, maximumLines = 8 } = {}) {
  if (!(maxHours > 0)) return [];

  const step = CONTOUR_STEPS.find((candidate) => maxHours / candidate <= maximumLines) ?? CONTOUR_STEPS.at(-1);
  const levels = [];
  for (let index = 1; index * step < maxHours; index += 1) {
    const level = index * step;
    // A contour a hair under the maximum is a dot, and one on the threshold is
    // already drawn.
    if (maxHours - level < step * 0.25) continue;
    if (threshold != null && Math.abs(level - threshold) < step * 0.25) continue;
    levels.push(level);
  }
  return levels;
}

/**
 * Contour every level through the grid.
 *
 * @param {object} grid  From `sunHoursGrid`: hours, mask, columns, rows, cellSize, origin.
 * @param {number[]} levels
 * @returns {Array<{level: number, lines: Array<{points: Array<{x,y}>, closed: boolean, length: number}>}>}
 */
export function sunHoursContours(grid, levels) {
  if (!grid || !levels?.length) return [];
  if (!(grid.columns > 1) || !(grid.rows > 1)) return [];

  const results = [];
  for (const level of levels) {
    const lines = contourLines(grid, level);
    if (lines.length) results.push({ level, lines });
  }
  return results;
}

/** One level's isolines, chained end to end and smoothed. */
export function contourLines(grid, level) {
  const segments = contourSegments(grid, level);
  if (!segments.length) return [];

  const smooth = segments.length <= SMOOTHING_SEGMENT_BUDGET;
  const lines = [];
  for (const chained of chainSegments(segments)) {
    // Simplified before smoothing, not after: it strips the vertex-per-cell
    // chains a contour running along a straight shadow edge arrives with, so
    // the corner-cutting only ever rounds corners that are really there — and
    // this layer is re-rasterised on every pan, so a vertex that changes
    // nothing is one paid for over and over.
    const simplified = simplifyLine(chained.points, chained.closed, grid.cellSize * 0.04);
    // Two points cannot describe a closed ring; drop the degenerate leftovers
    // that a plateau exactly on the level throws off.
    if (simplified.length < 2) continue;

    const points = smooth ? chaikin(simplified, chained.closed, SMOOTHING_PASSES) : simplified;
    lines.push({ points, closed: chained.closed, length: polylineLength(points, chained.closed) });
  }
  lines.sort((a, b) => b.length - a.length);
  return lines;
}

/**
 * Where a level crosses each square of the lattice.
 *
 * A square with any unassessed corner is skipped outright: interpolating
 * towards a cell that was never evaluated would draw a line through ground the
 * study makes no claim about.
 */
function contourSegments(grid, level) {
  const { hours, mask, columns, rows, cellSize, origin } = grid;
  const segments = [];

  // The lattice sits on cell centres, which is where the hours were sampled.
  const originX = origin.x + cellSize / 2;
  const originY = origin.y + cellSize / 2;

  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      const topLeftIndex = row * columns + column;
      const topRightIndex = topLeftIndex + 1;
      const bottomLeftIndex = topLeftIndex + columns;
      const bottomRightIndex = bottomLeftIndex + 1;

      if (mask && !(mask[topLeftIndex] && mask[topRightIndex] && mask[bottomLeftIndex] && mask[bottomRightIndex])) {
        continue;
      }

      const topLeft = hours[topLeftIndex];
      const topRight = hours[topRightIndex];
      const bottomRight = hours[bottomRightIndex];
      const bottomLeft = hours[bottomLeftIndex];

      let code = 0;
      if (topLeft >= level) code |= 8;
      if (topRight >= level) code |= 4;
      if (bottomRight >= level) code |= 2;
      if (bottomLeft >= level) code |= 1;
      if (code === 0 || code === 15) continue;

      const left = originX + column * cellSize;
      const top = originY + row * cellSize;
      const right = left + cellSize;
      const bottom = top + cellSize;

      const topEdge = () => ({ x: left + cellSize * crossing(topLeft, topRight, level), y: top });
      const bottomEdge = () => ({ x: left + cellSize * crossing(bottomLeft, bottomRight, level), y: bottom });
      const leftEdge = () => ({ x: left, y: top + cellSize * crossing(topLeft, bottomLeft, level) });
      const rightEdge = () => ({ x: right, y: top + cellSize * crossing(topRight, bottomRight, level) });

      const add = (from, to) => {
        // A plateau sitting exactly on the level produces crossings at the
        // corners themselves, and so pairs of coincident points.
        if (from.x === to.x && from.y === to.y) return;
        segments.push([from, to]);
      };

      switch (code) {
        case 1:
        case 14:
          add(leftEdge(), bottomEdge());
          break;
        case 2:
        case 13:
          add(bottomEdge(), rightEdge());
          break;
        case 3:
        case 12:
          add(leftEdge(), rightEdge());
          break;
        case 4:
        case 11:
          add(topEdge(), rightEdge());
          break;
        case 6:
        case 9:
          add(topEdge(), bottomEdge());
          break;
        case 7:
        case 8:
          add(topEdge(), leftEdge());
          break;
        // Saddles. Two opposite corners are inside and the square alone cannot
        // say whether they join through the middle, so the centre's own value
        // decides — otherwise the two readings disagree between neighbouring
        // squares and the contour tears.
        case 5:
        case 10: {
          const centreInside = (topLeft + topRight + bottomRight + bottomLeft) / 4 >= level;
          const cornersJoin = code === 5 ? centreInside : !centreInside;
          if (cornersJoin) {
            add(topEdge(), leftEdge());
            add(rightEdge(), bottomEdge());
          } else {
            add(topEdge(), rightEdge());
            add(leftEdge(), bottomEdge());
          }
          break;
        }
        default:
          break;
      }
    }
  }

  return segments;
}

/** Fraction along an edge where the level sits. */
function crossing(from, to, level) {
  if (to === from) return 0.5;
  const t = (level - from) / (to - from);
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/**
 * Join loose segments into polylines.
 *
 * Neighbouring squares compute a shared edge crossing from the same two corner
 * values, so the endpoints land on identical coordinates and can be matched by
 * key rather than by proximity search. The key is quantised anyway, at a
 * thousandth of a millimetre, so the matching survives a reordered subtraction.
 */
function chainSegments(segments) {
  const key = (point) => `${Math.round(point.x * 1000)},${Math.round(point.y * 1000)}`;

  const buckets = new Map();
  segments.forEach((segment, index) => {
    for (const point of segment) {
      const bucketKey = key(point);
      const bucket = buckets.get(bucketKey);
      if (bucket) bucket.push(index);
      else buckets.set(bucketKey, [index]);
    }
  });

  const used = new Uint8Array(segments.length);
  const lines = [];

  for (let start = 0; start < segments.length; start += 1) {
    if (used[start]) continue;
    used[start] = 1;
    const points = [segments[start][0], segments[start][1]];
    let closed = false;

    // Grow from the tail, then from the head; a ring closes on the first pass
    // and the second finds nothing left to add.
    for (const fromTail of [true, false]) {
      for (;;) {
        const tip = fromTail ? points[points.length - 1] : points[0];
        const candidates = buckets.get(key(tip));
        const next = candidates?.find((index) => !used[index]);
        if (next === undefined) break;

        used[next] = 1;
        const [first, second] = segments[next];
        const other = key(first) === key(tip) ? second : first;
        if (fromTail) points.push(other);
        else points.unshift(other);

        const far = fromTail ? points[0] : points[points.length - 1];
        if (key(other) === key(far)) {
          closed = true;
          break;
        }
      }
      if (closed) break;
    }

    // A closed ring carries its first point twice; the renderer closes it with
    // a Z instead, and the smoothing wants a clean cycle.
    if (closed) points.pop();
    if (points.length >= 2) lines.push({ points, closed });
  }

  return lines;
}

function perpendicularDistance(point, from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - from.x, point.y - from.y);
  return Math.abs((point.x - from.x) * dy - (point.y - from.y) * dx) / Math.sqrt(lengthSquared);
}

/**
 * Drop points that sit on the line between their kept neighbours. A contour
 * running along a straight shadow edge arrives with a vertex per cell, and
 * every one of them would be smoothed, stored and re-rasterised for nothing.
 */
function simplifyLine(points, closed, tolerance) {
  if (points.length <= (closed ? 4 : 3)) return points;

  const kept = [points[0]];
  let anchor = points[0];
  const last = closed ? points.length : points.length - 1;

  for (let index = 1; index < last; index += 1) {
    const candidate = points[index];
    const next = points[(index + 1) % points.length];
    if (perpendicularDistance(candidate, anchor, next) > tolerance) {
      kept.push(candidate);
      anchor = candidate;
    }
  }
  if (!closed) kept.push(points[points.length - 1]);

  // A simplification that destroys the line is worse than none.
  return kept.length >= (closed ? 3 : 2) ? kept : points;
}

/** Corner-cutting subdivision. Cheap, stable, and never overshoots the input. */
function chaikin(points, closed, passes) {
  let current = points;

  for (let pass = 0; pass < passes; pass += 1) {
    if (current.length < 3) return current;
    const next = [];
    const count = current.length;
    if (!closed) next.push(current[0]);

    const limit = closed ? count : count - 1;
    for (let index = 0; index < limit; index += 1) {
      const from = current[index];
      const to = current[(index + 1) % count];
      next.push({ x: from.x * 0.75 + to.x * 0.25, y: from.y * 0.75 + to.y * 0.25 });
      next.push({ x: from.x * 0.25 + to.x * 0.75, y: from.y * 0.25 + to.y * 0.75 });
    }

    if (!closed) next.push(current[count - 1]);
    current = next;
  }

  return current;
}

function polylineLength(points, closed) {
  let total = 0;
  const limit = closed ? points.length : points.length - 1;
  for (let index = 0; index < limit; index += 1) {
    const from = points[index];
    const to = points[(index + 1) % points.length];
    total += Math.hypot(to.x - from.x, to.y - from.y);
  }
  return total;
}

/**
 * Where to write the level on a contour, and which way up.
 *
 * Halfway along the line, angled with it — a contour label that sits flat
 * beside its line could belong to either of two neighbouring contours, which
 * is exactly the ambiguity the label was added to remove. The angle is folded
 * back into the upright half turn so the text never reads upside down.
 *
 * @returns {{x: number, y: number, angle: number}|null}
 */
export function contourLabelAnchor(line) {
  const { points, closed } = line;
  if (!points || points.length < 2) return null;

  const target = polylineLength(points, closed) / 2;
  const limit = closed ? points.length : points.length - 1;

  let travelled = 0;
  for (let index = 0; index < limit; index += 1) {
    const from = points[index];
    const to = points[(index + 1) % points.length];
    const span = Math.hypot(to.x - from.x, to.y - from.y);
    if (span <= 0) continue;

    if (travelled + span >= target) {
      const t = (target - travelled) / span;
      let angle = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
      if (angle > 90) angle -= 180;
      else if (angle < -90) angle += 180;
      return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, angle };
    }
    travelled += span;
  }

  return { x: points[0].x, y: points[0].y, angle: 0 };
}

/** SVG path data for a set of contour lines. */
export function contourPath(lines) {
  return lines
    .map((line) => {
      if (line.points.length < 2) return '';
      const body = line.points.map((point) => `${round(point.x)} ${round(point.y)}`).join(' L ');
      return `M ${body}${line.closed ? ' Z' : ''}`;
    })
    .filter(Boolean)
    .join(' ');
}

/** Tenths of a millimetre are past anything a sampled shadow can claim. */
function round(value) {
  return Math.round(value * 10) / 10;
}
