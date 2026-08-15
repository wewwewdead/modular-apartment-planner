/**
 * CNC corner relief (dogbone / T-bone).
 *
 * A cylindrical router bit of radius r cannot reach into a sharp interior corner
 * of the region it is removing: it leaves an r-radius fillet, and a square mating
 * part will not seat. The fix is to drive the bit a little past the corner so its
 * sweep covers the corner point, which leaves a small circular "ear" in the
 * finished cut.
 *
 * Defining property implemented here
 * ---------------------------------
 * The relief is a circle of the BIT RADIUS r whose centre sits on the corner
 * bisector, r away from the corner, pointing INTO the region being removed. The
 * original sharp corner point therefore lies exactly ON the relief circle - the
 * bit sweep just touches the corner and no more material than necessary is lost.
 *
 * With the corner at C, the two wall rays leaving C written as `incomingRay`
 * (back along the wall the toolpath arrived on) and `outgoingRay`, and 2*alpha
 * the angle of the removed region at that corner:
 *
 *   centre O = C + bisector * r
 *   wall bite L = 2 * r * cos(alpha)            (symmetric: same on both walls)
 *   entry A = C + incomingRay * L
 *   exit  B = C + outgoingRay * L
 *   arc sweep = 360deg - 4*alpha, passing through C
 *
 * For the common 90deg corner (alpha = 45deg) that collapses to the classic
 * result: L = r*sqrt(2) on each wall and an exact semicircle (bulge magnitude 1).
 *
 * Which corners get relieved
 * --------------------------
 * Only corners the bit cannot reach, i.e. corners where the REMOVED region turns
 * through less than `maxReliefAngleDeg` (~170deg by default; a corner flatter
 * than that needs no relief). Whether "removed" means inside or outside the path
 * is the caller's `region`:
 *
 *   region: 'inside'  - pockets, slots, cutouts, female joint channels. Every
 *                       convex corner of the path is a concave corner of the cut.
 *   region: 'outside' - part perimeters. The waste is outside the path, so only
 *                       REFLEX vertices of the path (notches cut into the
 *                       outline) are concave corners of the cut. Ordinary convex
 *                       perimeter corners need no relief - the bit runs around
 *                       the outside of them freely.
 *
 * Winding is detected from the signed area, so clockwise and counter-clockwise
 * paths are both classified correctly (the concavity test is winding-relative,
 * never a raw cross-product sign).
 *
 * Emission
 * --------
 * `applyDogboneToPolygon` returns the relieved contour as vertices carrying an
 * LWPOLYLINE `bulge`, so the relief is part of one closed toolpath rather than a
 * separate circle the operator has to remember to cut. See the note on
 * `writePolylineEntity` in dxfExport.js for why that choice was available.
 *
 * Composition order is fit -> kerf -> dogbone: relief is always computed on the
 * already kerf-compensated path, because the bit has to reach the corner of the
 * path it will actually follow.
 */

import { isFastenerEntity } from '../../utils/fastenerUtils';
import { signedAreaX2 } from '../utils/polygonOffset';

const EPSILON = 1e-9;
const ANGLE_EPSILON = 1e-9;
const TWO_PI = Math.PI * 2;

/** 1/4" (6.35mm) straight bit - the default cutter for sheet-goods joinery. */
export const DEFAULT_BIT_DIAMETER = 6.35;

/** A cut corner flatter than this needs no relief: the bit already reaches it. */
export const DEFAULT_MAX_RELIEF_ANGLE_DEG = 170;

export const DOGBONE_STYLES = Object.freeze({
  NONE: 'none',
  DOGBONE: 'dogbone',
  TBONE_X: 'tbone-x',
  TBONE_Y: 'tbone-y',
});

const TBONE_STYLES = new Set([DOGBONE_STYLES.TBONE_X, DOGBONE_STYLES.TBONE_Y]);
const KNOWN_STYLES = new Set(Object.values(DOGBONE_STYLES));

/**
 * A T-bone only stays inside the cut when the removed region turns through 90deg
 * or less; past that the relief circle crosses the far wall's back extension and
 * the contour would fold on itself. Such corners fall back to a bisector
 * dogbone, which is valid at any angle.
 */
const TBONE_MAX_REGION_ANGLE_DEG = 90 + 1e-6;

/* ------------------------------------------------------------------ vectors */

function subtract(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}

function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y };
}

function scale(v, factor) {
  return { x: v.x * factor, y: v.y * factor };
}

function normalizeVector(v) {
  const length = Math.hypot(v.x, v.y);
  return length < EPSILON ? null : { x: v.x / length, y: v.y / length };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y;
}

function cross(a, b) {
  return a.x * b.y - a.y * b.x;
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function normalizeTwoPi(angle) {
  const wrapped = angle % TWO_PI;
  return wrapped < 0 ? wrapped + TWO_PI : wrapped;
}

/** Drop consecutive coincident vertices, including the wrap-around pair. */
function dedupePoints(points) {
  const cleaned = [];

  for (const point of points || []) {
    const x = Number(point?.x);
    const y = Number(point?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      continue;
    }

    const previous = cleaned[cleaned.length - 1];
    if (previous && Math.abs(previous.x - x) < EPSILON && Math.abs(previous.y - y) < EPSILON) {
      continue;
    }

    cleaned.push({ x, y });
  }

  while (
    cleaned.length > 1 &&
    Math.abs(cleaned[0].x - cleaned[cleaned.length - 1].x) < EPSILON &&
    Math.abs(cleaned[0].y - cleaned[cleaned.length - 1].y) < EPSILON
  ) {
    cleaned.pop();
  }

  return cleaned;
}

/* ------------------------------------------------------------ corner search */

/**
 * Corners of a closed path that a cylindrical bit cannot reach.
 *
 * @param {{x:number,y:number}[]} points closed path, implicit wrap-around.
 * @param {{ region?: 'inside'|'outside', maxReliefAngleDeg?: number }} [options]
 * @returns {Array<object>} one descriptor per corner needing relief, in path order.
 */
export function findReliefCorners(points, options = {}) {
  const region = options.region === 'outside' ? 'outside' : 'inside';
  const maxReliefAngleDeg = Number.isFinite(options.maxReliefAngleDeg)
    ? options.maxReliefAngleDeg
    : DEFAULT_MAX_RELIEF_ANGLE_DEG;

  const cleaned = dedupePoints(points);
  const count = cleaned.length;
  if (count < 3) {
    return [];
  }

  // +1 when the path is CCW in the coordinate system it was authored in. The
  // concavity test below is expressed relative to this, so a path drawn the
  // other way round classifies identically.
  const winding = signedAreaX2(cleaned) >= 0 ? 1 : -1;
  const corners = [];

  for (let index = 0; index < count; index += 1) {
    const previous = cleaned[(index - 1 + count) % count];
    const current = cleaned[index];
    const next = cleaned[(index + 1) % count];

    const incoming = normalizeVector(subtract(current, previous));
    const outgoing = normalizeVector(subtract(next, current));
    if (!incoming || !outgoing) {
      continue;
    }

    // Signed turn at the vertex; multiplying by the winding makes a left turn on
    // a CCW path and a right turn on a CW path both read as "convex".
    const turnDeg = (Math.atan2(cross(incoming, outgoing), dot(incoming, outgoing)) * 180) / Math.PI;
    const pathInteriorAngleDeg = 180 - turnDeg * winding;
    const cutRegionAngleDeg = region === 'inside' ? pathInteriorAngleDeg : 360 - pathInteriorAngleDeg;

    if (!(cutRegionAngleDeg > ANGLE_EPSILON) || cutRegionAngleDeg >= maxReliefAngleDeg) {
      continue;
    }

    // The bisector of the two wall rays always splits the SMALLER of the two
    // angles at the vertex - and a corner only qualifies above when the removed
    // region is that smaller side, so this points into the cut in both regions.
    const bisector = normalizeVector(subtract(outgoing, incoming));
    if (!bisector) {
      continue;
    }

    corners.push({
      index,
      point: current,
      // Rays that leave the corner back along each wall.
      incomingRay: { x: -incoming.x, y: -incoming.y },
      outgoingRay: outgoing,
      bisector,
      winding,
      region,
      pathInteriorAngleDeg,
      cutRegionAngleDeg,
      halfAngleDeg: cutRegionAngleDeg / 2,
      incomingEdgeLength: Math.hypot(current.x - previous.x, current.y - previous.y),
      outgoingEdgeLength: Math.hypot(next.x - current.x, next.y - current.y),
    });
  }

  return corners;
}

/* --------------------------------------------------------------- placement */

/**
 * Bulge (LWPOLYLINE group 42) for the arc entry -> exit that passes through
 * `through`. Positive means a counter-clockwise sweep in the source coordinate
 * system; the DXF writer flips the sign because DXF space mirrors Y.
 */
function buildArcBulge(center, entry, exit, through) {
  const entryAngle = Math.atan2(entry.y - center.y, entry.x - center.x);
  const exitAngle = Math.atan2(exit.y - center.y, exit.x - center.x);
  const throughAngle = Math.atan2(through.y - center.y, through.x - center.x);

  const counterClockwiseSweep = normalizeTwoPi(exitAngle - entryAngle);
  const counterClockwiseThrough = normalizeTwoPi(throughAngle - entryAngle);
  const isCounterClockwise =
    counterClockwiseThrough > ANGLE_EPSILON && counterClockwiseThrough < counterClockwiseSweep - ANGLE_EPSILON;
  const sweep = isCounterClockwise ? counterClockwiseSweep : TWO_PI - counterClockwiseSweep;

  return {
    sweepDeg: (sweep * 180) / Math.PI,
    bulge: (isCounterClockwise ? 1 : -1) * Math.tan(sweep / 4),
  };
}

function resolveStyleForCorner(corner, style) {
  if (!TBONE_STYLES.has(style)) {
    return DOGBONE_STYLES.DOGBONE;
  }

  // Obtuse cut corners cannot carry a single-wall relief without the circle
  // crossing the far wall behind the corner, so they revert to a dogbone.
  return corner.cutRegionAngleDeg <= TBONE_MAX_REGION_ANGLE_DEG ? style : DOGBONE_STYLES.DOGBONE;
}

function buildBisectorRelief(corner, radius) {
  const alpha = toRadians(corner.halfAngleDeg);
  const bite = 2 * radius * Math.cos(alpha);
  if (!(bite > EPSILON)) {
    return null;
  }

  const center = add(corner.point, scale(corner.bisector, radius));
  const entry = add(corner.point, scale(corner.incomingRay, bite));
  const exit = add(corner.point, scale(corner.outgoingRay, bite));

  return {
    style: DOGBONE_STYLES.DOGBONE,
    center,
    radius,
    entry,
    exit,
    entryBite: bite,
    exitBite: bite,
    // The corner itself lies on the relief circle, which is exactly the
    // property that makes the sweep cover it.
    ...buildArcBulge(center, entry, exit, corner.point),
  };
}

function buildTboneRelief(corner, radius, style) {
  const axis = style === DOGBONE_STYLES.TBONE_X ? 'x' : 'y';
  const useOutgoingWall = Math.abs(corner.outgoingRay[axis]) >= Math.abs(corner.incomingRay[axis]);
  const wall = useOutgoingWall ? corner.outgoingRay : corner.incomingRay;
  const opposite = useOutgoingWall ? corner.incomingRay : corner.outgoingRay;

  const center = add(corner.point, scale(wall, radius));
  const wallBite = 2 * radius;
  // Where the relief circle re-crosses the other wall: |C + t*opposite - O| = r
  // solves to t = 2r*cos(2*alpha), which is >= 0 for the angles a T-bone allows.
  const oppositeBite = 2 * radius * Math.cos(toRadians(corner.cutRegionAngleDeg));
  if (!(wallBite > EPSILON) || oppositeBite < -EPSILON) {
    return null;
  }

  const wallPoint = add(corner.point, scale(wall, wallBite));
  const oppositePoint = add(corner.point, scale(opposite, Math.max(0, oppositeBite)));

  // Outward normal of the chosen wall - the side the relief bulges away from the
  // cut - gives a point that is always strictly inside the arc.
  const rawNormal = { x: -wall.y, y: wall.x };
  const outwardNormal = dot(rawNormal, corner.bisector) > 0 ? { x: wall.y, y: -wall.x } : rawNormal;
  const through = add(center, scale(outwardNormal, radius));

  const entry = useOutgoingWall ? oppositePoint : wallPoint;
  const exit = useOutgoingWall ? wallPoint : oppositePoint;

  return {
    style,
    center,
    radius,
    entry,
    exit,
    entryBite: useOutgoingWall ? Math.max(0, oppositeBite) : wallBite,
    exitBite: useOutgoingWall ? wallBite : Math.max(0, oppositeBite),
    ...buildArcBulge(center, entry, exit, through),
  };
}

/**
 * Relief placement for one corner.
 *
 * @param {object} corner a `findReliefCorners` descriptor.
 * @param {number} radius bit radius (mm).
 * @param {string} [style] one of DOGBONE_STYLES.
 * @returns {object|null} `{ center, radius, entry, exit, bulge, sweepDeg, ... }`
 */
export function buildCornerRelief(corner, radius, style = DOGBONE_STYLES.DOGBONE) {
  if (!corner || !(radius > 0) || style === DOGBONE_STYLES.NONE) {
    return null;
  }

  const resolvedStyle = resolveStyleForCorner(corner, style);
  return resolvedStyle === DOGBONE_STYLES.DOGBONE
    ? buildBisectorRelief(corner, radius)
    : buildTboneRelief(corner, radius, resolvedStyle);
}

/**
 * Reliefs whose wall bites would overrun the edge they sit on (or collide with
 * the relief at the far end of it) are dropped rather than emitted, because a
 * bite longer than its wall folds the contour through itself. Dropping only ever
 * reduces demand, so a single pass is enough.
 */
function dropOverrunningReliefs(cleanedCount, placements) {
  const doomed = new Set();

  for (let index = 0; index < cleanedCount; index += 1) {
    const nextIndex = (index + 1) % cleanedCount;
    const start = placements.get(index);
    const end = placements.get(nextIndex);
    if (!start && !end) {
      continue;
    }

    const edgeLength = start ? start.corner.outgoingEdgeLength : end.corner.incomingEdgeLength;
    const consumed = (start?.relief.exitBite ?? 0) + (end?.relief.entryBite ?? 0);

    if (consumed > edgeLength - EPSILON) {
      if (start) doomed.add(index);
      if (end) doomed.add(nextIndex);
    }
  }

  doomed.forEach((index) => placements.delete(index));
  return doomed.size;
}

/**
 * Relieve every unreachable corner of a closed path.
 *
 * @param {{x:number,y:number}[]} points closed path (implicit wrap-around).
 * @param {object} [options] `{ style, bitDiameter, region, maxReliefAngleDeg }`.
 * @returns {{ points: Array, reliefs: Array, applied: boolean, skippedCorners: number }}
 *   `points` carries an LWPOLYLINE `bulge` on each relief entry vertex. When no
 *   relief was applied the original array is returned untouched.
 */
export function applyDogboneToPolygon(points, options = {}) {
  const style = KNOWN_STYLES.has(options.style) ? options.style : DOGBONE_STYLES.DOGBONE;
  const bitDiameter = Number(options.bitDiameter ?? DEFAULT_BIT_DIAMETER);
  const empty = { points, reliefs: [], applied: false, skippedCorners: 0 };

  if (style === DOGBONE_STYLES.NONE || !(bitDiameter > 0)) {
    return empty;
  }

  const cleaned = dedupePoints(points);
  if (cleaned.length < 3) {
    return empty;
  }

  const radius = bitDiameter / 2;
  const corners = findReliefCorners(cleaned, options);
  if (!corners.length) {
    return empty;
  }

  const placements = new Map();
  let skippedCorners = 0;

  corners.forEach((corner) => {
    const relief = buildCornerRelief(corner, radius, style);
    if (relief) {
      placements.set(corner.index, { corner, relief });
      return;
    }
    skippedCorners += 1;
  });

  skippedCorners += dropOverrunningReliefs(cleaned.length, placements);

  if (!placements.size) {
    return { ...empty, skippedCorners };
  }

  const nextPoints = [];
  cleaned.forEach((point, index) => {
    const placement = placements.get(index);
    if (!placement) {
      nextPoints.push({ x: point.x, y: point.y });
      return;
    }

    // The bulge lives on the vertex the arc STARTS at, per the LWPOLYLINE spec.
    nextPoints.push({ x: placement.relief.entry.x, y: placement.relief.entry.y, bulge: placement.relief.bulge });
    nextPoints.push({ x: placement.relief.exit.x, y: placement.relief.exit.y });
  });

  return {
    points: nextPoints,
    reliefs: Array.from(placements.values()).map((placement) => placement.relief),
    applied: true,
    skippedCorners,
  };
}

/* ---------------------------------------------------------------- entities */

/**
 * Drilled holes never enter the dogbone pass. A fastener is a drill operation
 * (its circle must reach the machine at the catalog pilot size), reference
 * geometry is not a toolpath at all, and round features have no corners to
 * relieve in the first place.
 */
export function isDogboneExemptEntity(entity) {
  return (
    Boolean(entity?.meta?.dxfKerfExempt) ||
    Boolean(entity?.meta?.dxfDogboneExempt) ||
    Boolean(entity?.hardwareId) ||
    isFastenerEntity(entity)
  );
}

/**
 * Which side of a closed path the cutter removes, or null when the entity is not
 * a dogbone candidate.
 *
 * `rect` entities are deliberately excluded: a rectangle has no reflex corner, so
 * a perimeter rect can never need relief, and skipping it keeps its DXF output
 * byte-identical.
 */
export function getDogboneRegion(entity) {
  if (entity?.type === 'feature') {
    if (entity.operation && entity.operation !== 'subtract') {
      return null;
    }
    if (entity.shape === 'circle' || entity.shape === 'ellipse') {
      return null;
    }
    return 'inside';
  }

  if (entity?.type === 'polyline' && entity.closed) {
    return 'outside';
  }

  return null;
}

function featureRectToPoints(entity) {
  const x = Number(entity.x) || 0;
  const y = Number(entity.y) || 0;
  const width = Number(entity.width) || 0;
  const height = Number(entity.height) || 0;

  if (!(Math.abs(width) > EPSILON) || !(Math.abs(height) > EPSILON)) {
    return null;
  }

  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}

/**
 * Corner relief for a single export entity.
 *
 * Returns the SAME object when nothing was relieved, so a document that opts out
 * (or has no reachable-corner problem) produces byte-identical output.
 *
 * @param {object} entity export-ready entity, already kerf compensated.
 * @param {{ style: string, bitDiameter: number, maxReliefAngleDeg?: number }} settings
 */
export function applyDogboneToEntity(entity, settings = {}) {
  const style = settings.style;
  if (!entity || style === DOGBONE_STYLES.NONE || !KNOWN_STYLES.has(style) || isDogboneExemptEntity(entity)) {
    return entity;
  }

  const region = getDogboneRegion(entity);
  if (!region) {
    return entity;
  }

  const options = {
    style,
    bitDiameter: settings.bitDiameter,
    maxReliefAngleDeg: settings.maxReliefAngleDeg,
    region,
  };

  if (entity.type === 'polyline') {
    const result = applyDogboneToPolygon(entity.points, options);
    return result.applied ? { ...entity, points: result.points } : entity;
  }

  const sourcePoints = entity.shape === 'polygon' ? entity.points : featureRectToPoints(entity);
  if (!sourcePoints?.length) {
    return entity;
  }

  const result = applyDogboneToPolygon(sourcePoints, options);
  if (!result.applied) {
    return entity;
  }

  // A relieved rect pocket is no longer a rectangle, so it is re-expressed as a
  // polygon feature. The DXF writer emits polygon features as closed
  // LWPOLYLINEs, which is what carries the bulges.
  return { ...entity, shape: 'polygon', points: result.points };
}

/**
 * Normalize the user-facing export setting into the shape the passes above want,
 * or null when relief is switched off (the default).
 */
export function normalizeDogboneSettings(input) {
  if (!input) {
    return null;
  }

  const style = KNOWN_STYLES.has(input.style) ? input.style : DOGBONE_STYLES.NONE;
  if (style === DOGBONE_STYLES.NONE) {
    return null;
  }

  const bitDiameter = Number(input.bitDiameter ?? DEFAULT_BIT_DIAMETER);
  if (!(bitDiameter > 0)) {
    return null;
  }

  return {
    style,
    bitDiameter,
    maxReliefAngleDeg: Number.isFinite(input.maxReliefAngleDeg)
      ? input.maxReliefAngleDeg
      : DEFAULT_MAX_RELIEF_ANGLE_DEG,
  };
}
