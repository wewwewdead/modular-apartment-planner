// Standard stock sections for members (Phase P, docs/sketch-studio-angle-bar.md
// §2.7): the angle catalogue, the angle's outline and area, and a short
// label for every member section. Pure; sections here are resolved (numbers).

// Equal angles with EN 10056-1 nominal radii (mm): [width, height, thickness,
// root radius r1, toe radius r2].
const ANGLE_TABLE = [
  [20, 20, 3, 3.5, 2],
  [25, 25, 3, 3.5, 2],
  [30, 30, 3, 5, 2.5],
  [40, 40, 4, 6, 3],
  [40, 40, 5, 6, 3],
  [50, 50, 5, 7, 3.5],
  [50, 50, 6, 7, 3.5],
  [60, 60, 6, 8, 4],
  [80, 80, 8, 10, 5],
  [100, 100, 10, 12, 6],
];

// A dimension as a label shows it: at most 2 decimals, no trailing zeros.
const mm = (value) => String(Number(Number(value).toFixed(2)));

export const ANGLE_SIZES = Object.freeze(
  ANGLE_TABLE.map(([width, height, wall, rootRadius, toeRadius]) =>
    Object.freeze({
      label: `L ${mm(width)}×${mm(height)}×${mm(wall)}`,
      width,
      height,
      wall,
      rootRadius,
      toeRadius,
    }),
  ),
);

// The catalogue entry a section is exactly, or null. Every one of the five
// values must be a number equal to the entry's (an expression is Custom);
// match: 'leg' compares width, height and thickness only.
export function angleSizeOf(section, match = 'all') {
  const keys = match === 'leg' ? ['width', 'height', 'wall'] : ['width', 'height', 'wall', 'rootRadius', 'toeRadius'];
  return ANGLE_SIZES.find((size) => keys.every((key) => section?.[key] === size[key])) || null;
}

// The radii an angle of this size gets when nobody set them (Phase P.1,
// docs/sketch-studio-angle-bar.md §8.2): the catalogue's on an exact (w, h, t)
// match; otherwise the radii of the entry with the nearest thickness (a tie
// goes to the smaller entry), scaled down together until r2 ≤ t / 2 and
// r1 + r2 ≤ (min(w, h) − t) / 2, floored to 0.1 mm, so the pair always
// passes resolveSection with margin. Both 0 when an input is not a positive
// number or t ≥ min(w, h) (that section is invalid anyway). A function of the
// three values only, never of earlier radii: typing "6" on the way to "60"
// cannot ratchet the radii down.
export function angleRadiiFor({ width, height, wall } = {}) {
  const none = { rootRadius: 0, toeRadius: 0 };
  const valid = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
  if (![width, height, wall].every(valid) || wall >= Math.min(width, height)) return none;
  const exact = angleSizeOf({ width, height, wall }, 'leg');
  if (exact) return { rootRadius: exact.rootRadius, toeRadius: exact.toeRadius };
  let nearest = ANGLE_SIZES[0];
  for (const size of ANGLE_SIZES) if (Math.abs(size.wall - wall) < Math.abs(nearest.wall - wall)) nearest = size;
  const { rootRadius: r1, toeRadius: r2 } = nearest;
  const scale = Math.min(1, (0.5 * wall) / r2, (0.5 * (Math.min(width, height) - wall)) / (r1 + r2));
  // Floor (not round) to 0.1 mm keeps the margin; the epsilon absorbs float
  // noise such as 6 × (2.5 / 3) = 4.999….
  const floor = (v) => Math.floor(v * 10 + 1e-6) / 10;
  return { rootRadius: floor(r1 * scale), toeRadius: floor(r2 * scale) };
}

// True when an angle's radii are still the automatic ones for its size: both
// are numbers (an absent or expression radius was set some other way) within
// 1e-9 of angleRadiiFor(size). Leg and thickness edits then re-derive them.
// `size` is the section's { width, height, wall } as numbers (the editor
// passes them resolved, so a leg given as an =expression counts by value).
export function angleRadiiAutomatic(section, size = section) {
  const { rootRadius, toeRadius } = section || {};
  if (typeof rootRadius !== 'number' || typeof toeRadius !== 'number') return false;
  const auto = angleRadiiFor(size);
  return Math.abs(rootRadius - auto.rootRadius) <= 1e-9 && Math.abs(toeRadius - auto.toeRadius) <= 1e-9;
}

// The closed outline of an angle in member-local x, y (heel at (−w/2, −h/2),
// leg A along +x, leg B along +y), as a kernel path profile. Arcs only where
// a radius is > 0: toe arcs round the inner corner of each leg tip, the root
// arc is the concave fillet between the legs. The closing edge (leg B's
// outside, back to the heel) is the profile's close.
export function angleSectionProfile(section) {
  const { width: w, height: h, wall: t } = section;
  const r1 = section.rootRadius || 0,
    r2 = section.toeRadius || 0;
  const a = -w / 2,
    b = -h / 2,
    k = Math.SQRT1_2;
  const segments = [{ type: 'line', end: [a + w, b] }];
  const line = (end) => segments.push({ type: 'line', end });
  const arc = (end, centre, radius, sign) =>
    segments.push({ type: 'arc', end, mid: [centre[0] + sign * radius * k, centre[1] + sign * radius * k] });
  if (r2 > 0) {
    line([a + w, b + t - r2]);
    arc([a + w - r2, b + t], [a + w - r2, b + t - r2], r2, 1);
  } else line([a + w, b + t]);
  if (r1 > 0) {
    line([a + t + r1, b + t]);
    arc([a + t, b + t + r1], [a + t + r1, b + t + r1], r1, -1);
  } else line([a + t, b + t]);
  if (r2 > 0) {
    line([a + t, b + h - r2]);
    arc([a + t - r2, b + h], [a + t - r2, b + h - r2], r2, 1);
  } else line([a + t, b + h]);
  line([a, b + h]);
  return { type: 'path', start: [a, b], segments, closed: true };
}

// Cross-section area (mm²): the sharp L plus the root fillet's material,
// less the two toe roundings. 50×50×5 r7 / r3.5 → 480.3 mm².
export function angleSectionArea(section) {
  const { width: w, height: h, wall: t } = section;
  const r1 = section.rootRadius || 0,
    r2 = section.toeRadius || 0;
  return t * (w + h - t) + (1 - Math.PI / 4) * (r1 * r1 - 2 * r2 * r2);
}

// A short stock name for a resolved member section: SHS 40×40×2, RHS 60×40×3,
// CHS Ø48.3×3, Flat 40×10, Round Ø20, L 50×50×5. '' when there is none.
export function sectionLabel(section) {
  if (!section) return '';
  const { type, width, height, wall, diameter } = section;
  if (type === 'tube') return `${width === height ? 'SHS' : 'RHS'} ${mm(width)}×${mm(height)}×${mm(wall)}`;
  if (type === 'pipe') return `CHS Ø${mm(diameter)}×${mm(wall)}`;
  if (type === 'bar') return `Flat ${mm(width)}×${mm(height)}`;
  if (type === 'round-bar') return `Round Ø${mm(diameter)}`;
  if (type === 'angle') return `L ${mm(width)}×${mm(height)}×${mm(wall)}`;
  return '';
}
