/**
 * Collision-aware placement for the F# tags the printable exports draw beside
 * each drill site.
 *
 * The tag wants to sit up and to the right of its hole, one clearance out. That
 * is fine until two fasteners land closer together than a tag is wide - a pair
 * of pocket screws 9.5mm apart, a row of shelf pins - at which point the labels
 * print on top of each other and the operator cannot tell which hole is which.
 *
 * The resolution is deliberately boring and deterministic, because a drawing
 * that reflows differently between two exports of the same document is worse
 * than one with a slightly awkward label:
 *
 *   1. Marks are placed in a fixed order (top to bottom, then left to right).
 *   2. Each tag tries the four diagonal quadrants at the same clearance, in the
 *      order up-right, up-left, down-right, down-left, and takes the first that
 *      is free.
 *   3. If all four collide, the least-crowded quadrant is pushed straight out
 *      along its diagonal in 1.5mm steps until it is free (or 16 steps pass).
 *   4. A tag pushed more than 2mm past its default clearance gets a leader line
 *      back to the edge of its hole, because at that distance the reader can no
 *      longer tell which hole it belongs to.
 *
 * Obstacles are other tag boxes and the head circles of other fasteners. Part
 * geometry is out of scope on purpose: dodging cut lines would make placement
 * depend on the whole drawing, and a tag overlapping a panel edge still reads.
 */

/** All millimetres: the export is authored at 1:1 print scale. */
export const TAG_FONT_SIZE = 4;
export const TAG_CLEARANCE = 1.2;

/**
 * Mean advance width of the tag alphabet (F and digits) at this font, as a
 * fraction of the font size - measured against the 4.5mm "F1" the print sheet
 * renders. Width is computed per label so "F12" reserves more room than "F1".
 */
const CHAR_WIDTH_RATIO = 0.56;
const ASCENT_RATIO = 0.75;
const DESCENT_RATIO = 0.1;

const PUSH_STEP = 1.5;
const MAX_PUSH_STEPS = 16;
const LEADER_THRESHOLD = 2;

const QUADRANTS = [
  { id: 'up-right', dx: 1, dy: -1 },
  { id: 'up-left', dx: -1, dy: -1 },
  { id: 'down-right', dx: 1, dy: 1 },
  { id: 'down-left', dx: -1, dy: 1 },
];

function round(value) {
  return Math.round(value * 1000) / 1000;
}

/** Printed width of a tag label, in mm. */
export function measureTagWidth(label) {
  return String(label ?? '').length * TAG_FONT_SIZE * CHAR_WIDTH_RATIO;
}

function boxesIntersect(a, b) {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

function boxIntersectsCircle(box, circle) {
  const closestX = Math.min(Math.max(circle.x, box.minX), box.maxX);
  const closestY = Math.min(Math.max(circle.y, box.minY), box.maxY);
  return Math.hypot(circle.x - closestX, circle.y - closestY) < circle.r;
}

function countCollisions(box, obstacles) {
  let hits = 0;

  obstacles.boxes.forEach((other) => {
    if (boxesIntersect(box, other)) {
      hits += 1;
    }
  });

  obstacles.circles.forEach((circle) => {
    if (boxIntersectsCircle(box, circle)) {
      hits += 1;
    }
  });

  return hits;
}

/**
 * One candidate position. `push` is the extra distance travelled along the
 * quadrant diagonal beyond the default clearance, so push 0 in the up-right
 * quadrant reproduces the original `(x + headRadius + 1.2, y - headRadius - 1.2)`
 * text origin exactly.
 */
function buildCandidate(mark, quadrant, push) {
  const width = measureTagWidth(mark.symbol);
  const ascent = TAG_FONT_SIZE * ASCENT_RATIO;
  const descent = TAG_FONT_SIZE * DESCENT_RATIO;
  const offset = mark.headRadius + TAG_CLEARANCE + push * Math.SQRT1_2;

  const anchorX = mark.x + quadrant.dx * offset;
  const baseline = quadrant.dy < 0 ? mark.y - offset : mark.y + offset + ascent;
  const left = quadrant.dx > 0 ? anchorX : anchorX - width;
  const top = baseline - ascent;

  return {
    quadrant,
    push,
    x: round(left),
    y: round(baseline),
    width: round(width),
    height: round(ascent + descent),
    box: {
      minX: round(left),
      minY: round(top),
      maxX: round(left + width),
      maxY: round(top + ascent + descent),
    },
  };
}

/** Leader from the tag corner nearest the hole to the hole's edge. */
function buildLeader(mark, candidate) {
  if (candidate.push <= LEADER_THRESHOLD) {
    return null;
  }

  const corner = {
    x: candidate.quadrant.dx > 0 ? candidate.box.minX : candidate.box.maxX,
    y: candidate.quadrant.dy < 0 ? candidate.box.maxY : candidate.box.minY,
  };
  const dx = corner.x - mark.x;
  const dy = corner.y - mark.y;
  const length = Math.hypot(dx, dy) || 1;

  return {
    x1: round(mark.x + (dx / length) * mark.headRadius),
    y1: round(mark.y + (dy / length) * mark.headRadius),
    x2: corner.x,
    y2: corner.y,
  };
}

function compareMarks(left, right) {
  return (
    left.y - right.y ||
    left.x - right.x ||
    String(left.symbol).localeCompare(String(right.symbol)) ||
    String(left.entityId ?? '').localeCompare(String(right.entityId ?? ''))
  );
}

function placeTag(mark, obstacles) {
  const candidates = QUADRANTS.map((quadrant) => buildCandidate(mark, quadrant, 0));
  const free = candidates.find((candidate) => countCollisions(candidate.box, obstacles) === 0);

  if (free) {
    return free;
  }

  // Least-crowded quadrant wins; ties keep the earlier (more conventional) one.
  let best = candidates[0];
  let bestHits = countCollisions(best.box, obstacles);
  candidates.slice(1).forEach((candidate) => {
    const hits = countCollisions(candidate.box, obstacles);
    if (hits < bestHits) {
      best = candidate;
      bestHits = hits;
    }
  });

  for (let step = 1; step <= MAX_PUSH_STEPS; step += 1) {
    const pushed = buildCandidate(mark, best.quadrant, step * PUSH_STEP);
    if (countCollisions(pushed.box, obstacles) === 0) {
      return pushed;
    }
  }

  // Nowhere clear within reach: take the furthest position rather than loop.
  // It is still a stable, reproducible answer, and the leader line points home.
  return buildCandidate(mark, best.quadrant, MAX_PUSH_STEPS * PUSH_STEP);
}

/**
 * Marks with a resolved `tag` position, in canonical placement order. Input
 * marks are not mutated and every other field (`sites`, `symbol`, ...) is
 * carried through untouched.
 */
export function layoutFastenerTags(marks = []) {
  const ordered = [...marks].sort(compareMarks);
  const circles = ordered.map((mark) => ({ x: mark.x, y: mark.y, r: mark.headRadius }));
  const placedBoxes = [];

  return ordered.map((mark, index) => {
    const obstacles = {
      boxes: placedBoxes,
      // Every hole except the one this tag labels - that one is what the
      // clearance is measured from.
      circles: circles.filter((_circle, circleIndex) => circleIndex !== index),
    };
    const candidate = placeTag(mark, obstacles);
    placedBoxes.push(candidate.box);

    return {
      ...mark,
      tag: {
        x: candidate.x,
        y: candidate.y,
        width: candidate.width,
        height: candidate.height,
        box: candidate.box,
        quadrant: candidate.quadrant.id,
        push: round(candidate.push),
        leader: buildLeader(mark, candidate),
      },
    };
  });
}
