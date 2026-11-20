// Three shapes that stay one entity (docs/sketch-studio-hand-drawing.md §7.1,
// HD-3): a slot, a regular polygon and a rectangle with rounded corners. Each
// as its lines and arcs (counter-clockwise, in drawing order, no zero-length
// piece), its key points (in a fixed order: followDimensions reads them by
// index), its refusals and its name. Pure: no imports, no three, no DOM
// (sketchProfile.js, which runs in the kernel worker, builds on it).
//   slot    { id, type: 'slot', c, length, width, angle }  overall length (tip to tip), degrees CCW from +X
//   polygon { id, type: 'polygon', c, sides, af, angle }   regular, af across flats; angle 0: a flat at the bottom
//   rect    { id, type: 'rect', a, b, r? }                 r a corner radius, the key absent when sharp

const round = (value) => {
  const result = Math.round(value * 1e6) / 1e6;
  return Object.is(result, -0) ? 0 : result;
};
const rp = (p) => [round(p[0]), round(p[1])];
const rad = (degrees) => (degrees * Math.PI) / 180;
const fmt = (value) => Number(value.toFixed(2)).toString();
const line = (a, b) => ({ type: 'line', a, b });
const arc = (a, b, m) => ({ type: 'arc', a, b, m });
// A side shorter than this is left out (a rectangle whose radius is half its height has no upright sides).
const SIDE = 1e-9;

export const POLYGON_MIN = 3;
export const POLYGON_MAX = 12;
const NAMES = { 3: 'Triangle', 4: 'Square', 5: 'Pentagon', 6: 'Hexagon', 7: 'Heptagon', 8: 'Octagon' };
// "Hexagon", "Triangle" … "Octagon", then "9-sided polygon".
export const polygonName = (sides) => NAMES[sides] || `${sides}-sided polygon`;

// A rectangle's two sides, lower-left first.
export const rectBounds = ({ a, b }) => [
  Math.min(a[0], b[0]),
  Math.min(a[1], b[1]),
  Math.max(a[0], b[0]),
  Math.max(a[1], b[1]),
];
// A rectangle with a corner radius it takes (a sharp one has no `r`, or 0; a
// radius over half the shorter side, which no tool stores, reads as sharp).
export const isRounded = (entity) =>
  entity?.type === 'rect' && Number(entity.r) > 0 && entity.r <= cornerRadiusMax(entity) + 1e-9;
// The entities whose lines and arcs come from here: slots, polygons and rounded rectangles.
export const isShapeLoop = (entity) => entity?.type === 'slot' || entity?.type === 'polygon' || isRounded(entity);

// ---------------------------------------------------------------- refusals
export function slotRefusal({ length, width } = {}) {
  if (!(Number.isFinite(width) && width > 0)) return 'A slot needs a width greater than zero.';
  if (!(Number.isFinite(length) && length > width + 1e-9)) return "A slot's length must be more than its width.";
  return '';
}
export function polygonRefusal({ sides, af } = {}) {
  if (!Number.isInteger(sides) || sides < POLYGON_MIN || sides > POLYGON_MAX)
    return `A polygon has ${POLYGON_MIN} to ${POLYGON_MAX} sides.`;
  if (!(Number.isFinite(af) && af > 0)) return 'A polygon needs a size greater than zero.';
  return '';
}
// The largest corner radius a rectangle takes: half its shorter side.
export const cornerRadiusMax = (rect) => {
  const [x0, y0, x1, y1] = rectBounds(rect);
  return round(Math.min(x1 - x0, y1 - y0) / 2);
};
// '' when `r` (empty or 0: sharp) fits the rectangle, else the refusal.
export function cornerRadiusRefusal(rect, r = rect?.r) {
  if (r == null || r === 0) return '';
  if (!(Number.isFinite(r) && r > 0)) return 'The corner radius must be more than zero (empty: sharp corners).';
  const most = cornerRadiusMax(rect);
  if (r > most + 1e-9) return `The corner radius can be at most half the shorter side: ${fmt(most)} mm here.`;
  return '';
}

// ---------------------------------------------------------------- slot
// Where (s along the slot, v across it) lies in the sketch.
function slotFrame({ c, length, width, angle }) {
  const t = rad(angle);
  const u = [Math.cos(t), Math.sin(t)],
    n = [-Math.sin(t), Math.cos(t)];
  const r = width / 2,
    h = length / 2 - r;
  return { r, h, at: (s, v) => rp([c[0] + u[0] * s + n[0] * v, c[1] + u[1] * s + n[1] * v]) };
}
/** The slot's lines and arcs: the lower side, the far end, the upper side, the near end. */
export function slotPieces(slot) {
  if (slotRefusal(slot)) return [];
  const { r, h, at } = slotFrame(slot);
  return [
    line(at(-h, -r), at(h, -r)),
    arc(at(h, -r), at(h, r), at(h + r, 0)),
    line(at(h, r), at(-h, r)),
    arc(at(-h, r), at(-h, -r), at(-h - r, 0)),
  ];
}
// Its key points: centre, the two end centres, the two tips, the four ends of
// the straight sides (lower near, lower far, upper far, upper near), their
// two midpoints (lower, upper).
function slotKeyPoints(slot) {
  if (slotRefusal(slot)) return [];
  const { r, h, at } = slotFrame(slot);
  return [
    { point: rp(slot.c), kind: 'center' },
    { point: at(-h, 0), kind: 'center' },
    { point: at(h, 0), kind: 'center' },
    { point: at(-h - r, 0), kind: 'quadrant' },
    { point: at(h + r, 0), kind: 'quadrant' },
    { point: at(-h, -r), kind: 'endpoint' },
    { point: at(h, -r), kind: 'endpoint' },
    { point: at(h, r), kind: 'endpoint' },
    { point: at(-h, r), kind: 'endpoint' },
    { point: at(0, -r), kind: 'midpoint' },
    { point: at(0, r), kind: 'midpoint' },
  ];
}

// ---------------------------------------------------------------- polygon
// Corner k sits half a side before flat k; flat 0 faces down at angle 0.
export function polygonCorners({ c, sides, af, angle }) {
  const R = af / 2 / Math.cos(Math.PI / sides);
  return Array.from({ length: sides }, (_, k) => {
    const t = rad(angle - 90 - 180 / sides + (k * 360) / sides);
    return rp([c[0] + R * Math.cos(t), c[1] + R * Math.sin(t)]);
  });
}
// The middle of flat k (from corner k to corner k + 1).
const flatMiddles = ({ c, sides, af, angle }) =>
  Array.from({ length: sides }, (_, k) => {
    const t = rad(angle - 90 + (k * 360) / sides);
    return rp([c[0] + (af / 2) * Math.cos(t), c[1] + (af / 2) * Math.sin(t)]);
  });
/** The polygon's sides, from the corner before the flat at `angle` − 90°. */
export function polygonPieces(polygon) {
  if (polygonRefusal(polygon)) return [];
  const corners = polygonCorners(polygon);
  return corners.map((a, k) => line(a, corners[(k + 1) % corners.length]));
}
// Its key points: centre, corners, flat middles.
function polygonKeyPoints(polygon) {
  if (polygonRefusal(polygon)) return [];
  return [
    { point: rp(polygon.c), kind: 'center' },
    ...polygonCorners(polygon).map((point) => ({ point, kind: 'endpoint' })),
    ...flatMiddles(polygon).map((point) => ({ point, kind: 'midpoint' })),
  ];
}
/** Across flats from across corners. */
export const acrossFlats = (ac, sides) => ac * Math.cos(Math.PI / sides);

// ---------------------------------------------------------------- rounded rectangle
function roundedFrame(rect) {
  const [x0, y0, x1, y1] = rectBounds(rect);
  return { x0, y0, x1, y1, r: rect.r };
}
/**
 * A rounded rectangle's lines and arcs: bottom, lower-right corner, right, …
 * the lower-left corner last. Where a radius of half the height leaves no
 * upright side, the two corners beside it are one half round (two lines and
 * two arcs); half the width likewise for the level sides, and a square with
 * a radius of half its side is two half rounds.
 */
export function roundedRectPieces(rect) {
  if (!isRounded(rect) || cornerRadiusRefusal(rect)) return [];
  const { x0, y0, x1, y1, r } = roundedFrame(rect);
  const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2];
  const k = r * Math.SQRT1_2;
  const level = x1 - x0 - 2 * r > SIDE,
    upright = y1 - y0 - 2 * r > SIDE;
  if (!upright)
    // Half rounds at the right and the left, the level sides between them (none for a disc).
    return [
      ...(level ? [line(rp([x0 + r, y0]), rp([x1 - r, y0]))] : []),
      arc(rp([x1 - r, y0]), rp([x1 - r, y1]), rp([x1, cy])),
      ...(level ? [line(rp([x1 - r, y1]), rp([x0 + r, y1]))] : []),
      arc(rp([x0 + r, y1]), rp([x0 + r, y0]), rp([x0, cy])),
    ];
  if (!level)
    // Half rounds at the bottom and the top, the upright sides between them.
    return [
      arc(rp([x0, y0 + r]), rp([x1, y0 + r]), rp([cx, y0])),
      line(rp([x1, y0 + r]), rp([x1, y1 - r])),
      arc(rp([x1, y1 - r]), rp([x0, y1 - r]), rp([cx, y1])),
      line(rp([x0, y1 - r]), rp([x0, y0 + r])),
    ];
  return [
    line(rp([x0 + r, y0]), rp([x1 - r, y0])),
    arc(rp([x1 - r, y0]), rp([x1, y0 + r]), rp([x1 - r + k, y0 + r - k])),
    line(rp([x1, y0 + r]), rp([x1, y1 - r])),
    arc(rp([x1, y1 - r]), rp([x1 - r, y1]), rp([x1 - r + k, y1 - r + k])),
    line(rp([x1 - r, y1]), rp([x0 + r, y1])),
    arc(rp([x0 + r, y1]), rp([x0, y1 - r]), rp([x0 + r - k, y1 - r + k])),
    line(rp([x0, y1 - r]), rp([x0, y0 + r])),
    arc(rp([x0, y0 + r]), rp([x0 + r, y0]), rp([x0 + r - k, y0 + r - k])),
  ];
}
// Its key points: the four arc centres (lower-left, lower-right, upper-right,
// upper-left), the eight tangent points (each side's start and end, walking
// bottom, right, top, left), the four side midpoints (same order), the centre.
function roundedKeyPoints(rect) {
  if (!isRounded(rect) || cornerRadiusRefusal(rect)) return [];
  const { x0, y0, x1, y1, r } = roundedFrame(rect);
  const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2];
  const at = (kind) => (point) => ({ point: rp(point), kind });
  return [
    ...[
      [x0 + r, y0 + r],
      [x1 - r, y0 + r],
      [x1 - r, y1 - r],
      [x0 + r, y1 - r],
    ].map(at('center')),
    ...[
      [x0 + r, y0],
      [x1 - r, y0],
      [x1, y0 + r],
      [x1, y1 - r],
      [x1 - r, y1],
      [x0 + r, y1],
      [x0, y1 - r],
      [x0, y0 + r],
    ].map(at('endpoint')),
    ...[
      [cx, y0],
      [x1, cy],
      [cx, y1],
      [x0, cy],
    ].map(at('midpoint')),
    at('center')([cx, cy]),
  ];
}

/** The lines and arcs of a slot, polygon or rounded rectangle; [] for anything else or a refused size. */
export function shapePieces(entity) {
  if (entity?.type === 'slot') return slotPieces(entity);
  if (entity?.type === 'polygon') return polygonPieces(entity);
  if (isRounded(entity)) return roundedRectPieces(entity);
  return [];
}
/** The key points of a slot, polygon or rounded rectangle, in the order documented above. */
export function shapeKeyPoints(entity) {
  if (entity?.type === 'slot') return slotKeyPoints(entity);
  if (entity?.type === 'polygon') return polygonKeyPoints(entity);
  if (isRounded(entity)) return roundedKeyPoints(entity);
  return [];
}
