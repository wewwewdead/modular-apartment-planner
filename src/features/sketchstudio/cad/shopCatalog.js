// Shop data for sheet metal (docs/sketch-studio-fab-shop.md §8): stock,
// K-factors, air-bend tooling and the rules that turn them into numbers.
// Pure: no three, no DOM, no WASM; the kernel worker and the panels share it,
// so every number a panel shows comes from here or from sheetMetal.js.
// All values are defaults a user may override per bend or per part.

// §8.1. radiusOfV: inside radius as a fraction of the die V opening;
// minRadius: the smallest inside radius, as a multiple of t; springback90:
// degrees at a 90° bend; colour: the bare metal in the viewport.
export const SHEET_STOCK = Object.freeze({
  spcc: Object.freeze({
    key: 'spcc',
    name: 'SPCC cold-rolled steel',
    rm: 330,
    yieldStrength: 210,
    modulus: 205,
    density: 7.85,
    radiusOfV: 0.16,
    hardness: 'medium',
    springback90: 1.0,
    minRadius: 0.63,
    thicknesses: Object.freeze([0.6, 0.8, 1.0, 1.2, 1.6, 2.0, 2.3, 3.2]),
    colour: '#8f979e',
  }),
  secc: Object.freeze({
    key: 'secc',
    name: 'SECC galvanised steel',
    rm: 330,
    yieldStrength: 210,
    modulus: 205,
    density: 7.85,
    radiusOfV: 0.16,
    hardness: 'medium',
    springback90: 1.0,
    minRadius: 0.63,
    thicknesses: Object.freeze([0.6, 0.8, 1.0, 1.2, 1.6, 2.0, 2.3, 3.2]),
    colour: '#a7afb3',
  }),
  sus304: Object.freeze({
    key: 'sus304',
    name: 'SUS304 stainless',
    rm: 579,
    yieldStrength: 215,
    modulus: 193,
    density: 7.93,
    radiusOfV: 0.21,
    hardness: 'hard',
    springback90: 2.5,
    minRadius: 0.63,
    thicknesses: Object.freeze([0.8, 1.0, 1.2, 1.5, 2.0, 3.0]),
    colour: '#bfc5c9',
  }),
  a5052: Object.freeze({
    key: 'a5052',
    name: 'A5052-H32 aluminium',
    rm: 228,
    yieldStrength: 193,
    modulus: 70.3,
    density: 2.68,
    radiusOfV: 0.135,
    hardness: 'soft',
    springback90: 2.0,
    minRadius: 0.63,
    thicknesses: Object.freeze([0.8, 1.0, 1.2, 1.5, 2.0, 3.0]),
    colour: '#ccd2d6',
  }),
  a6061: Object.freeze({
    key: 'a6061',
    name: 'A6061-T6 aluminium',
    rm: 310,
    yieldStrength: 276,
    modulus: 68.9,
    density: 2.7,
    radiusOfV: 0.17,
    hardness: 'hard',
    springback90: 3.0,
    minRadius: 1.5,
    thicknesses: Object.freeze([1.0, 1.6, 2.0, 3.2]),
    colour: '#c3c9ce',
  }),
});
export const STOCK_KEYS = Object.freeze(Object.keys(SHEET_STOCK));
export const DEFAULT_STOCK = 'spcc';

/** A stock entry by key; an unknown key is an error naming it. */
export function stockOf(key) {
  const stock = SHEET_STOCK[key];
  if (!stock) throw new Error(`Unknown sheet stock: ${key}`);
  return stock;
}

/** The stock whose display name is `material` (part.material), or null. */
export const stockByName = (material) => Object.values(SHEET_STOCK).find((s) => s.name === material) || null;

// §8.2: K-factor for air bending by r/t and hardness.
const K_TABLE = Object.freeze({
  soft: [0.33, 0.4, 0.5],
  medium: [0.38, 0.43, 0.5],
  hard: [0.4, 0.45, 0.5],
});
export function kFactorFor(radius, thickness, hardness = 'medium') {
  const row = K_TABLE[hardness];
  if (!row) throw new Error(`Unknown stock hardness: ${hardness}`);
  const ratio = radius / thickness;
  return ratio < 1 ? row[0] : ratio <= 3 ? row[1] : row[2];
}

// §8.4 tooling, numbers only (SM-1 needs the tip radius, V and shoulder
// radius; the section polygons come with the press-brake station). `use`
// (docs/sketch-studio-brake-flip-tooling.md §4.1): one plain line on what the
// tool is for, for the station's blade picker.
const freezeOutline = (outline) =>
  Object.freeze({
    flank: Object.freeze(outline.flank),
    back: Object.freeze(outline.back.map((p) => Object.freeze(p))),
    front: Object.freeze(outline.front.map((p) => Object.freeze(p))),
  });
// Brake flip tooling §5.6 (BT-2): the radius punch holders as the Amada High
// Tonnage catalogue (2021, p. 4) draws them, read from the PDF's own vector
// drawings (PyMuPDF): HH-015 100 high, HH-016 103.5, both 41 wide. Each
// drawing is scaled across by its printed width and up by its printed height
// (they agree to 0.4 % on the HH-015; the HH-016 drawing is 5 % wider than its
// 41 mm, so the two axes are scaled apart). `outline`: the right half of the
// holder's section from the outer corner of its foot (z 0: the foot's tips,
// where the ruler hangs below) up to its shoulder (z = height), y from the
// punch line; the left half is its mirror. The foot is a V cradle the round
// ruler sits in, chamfered outside, under a narrower neck and a 41 mm head.
// Schematic: the 1 mm chamfer the drawings put on one shoulder corner only
// (the section stays its own mirror), the 0.6 mm step between the HH-015's
// foot and its neck kept as drawn.
export const RADIUS_HOLDERS = Object.freeze({
  'HH-015': Object.freeze({
    key: 'HH-015',
    height: 100,
    width: 41,
    outline: Object.freeze(
      [
        [12.86, 0],
        [19.52, 12.33],
        [19.52, 20.33],
        [12.38, 27.96],
        [13.0, 27.96],
        [13.0, 72.67],
        [20.5, 80.13],
        [20.5, 100],
      ].map((p) => Object.freeze(p)),
    ),
  }),
  'HH-016': Object.freeze({
    key: 'HH-016',
    height: 103.5,
    width: 41,
    outline: Object.freeze(
      [
        [20.0, 0],
        [20.5, 0.55],
        [20.5, 23.56],
        [13.05, 31.02],
        [13.05, 76.03],
        [20.5, 83.49],
        [20.5, 103.5],
      ].map((p) => Object.freeze(p)),
    ),
  }),
});
export const PUNCHES = Object.freeze({
  'straight-88': Object.freeze({
    key: 'straight-88',
    name: 'Straight 88°',
    angle: 88,
    radius: 0.8,
    height: 66.5,
    load: 1000,
    use: 'Everyday bends.',
  }),
  'straight-88-sharp': Object.freeze({
    key: 'straight-88-sharp',
    name: 'Straight 88° sharp',
    angle: 88,
    radius: 0.25,
    height: 66.5,
    load: 1000,
    use: 'Thin sheet and a tight inside radius.',
  }),
  // Brake blades §4.2 (BT-1): goosenecks from the Tecnostamp "Red Line –
  // Amada-Promecam Style" catalogue (pilses.com/image/catalog/catalogos-pdf/
  // utillaje-amada-promecam.pdf) p. 15: code 11.147 (88°, R0.80, H 104.50,
  // 50 t/m, head 56 wide) and code 11.148 (88°, R0.80, H 145.00, 70 t/m, head
  // 75). `outline`: each body as the catalogue draws it, read from the PDF's
  // own vector drawing (scaled by the row's printed H and head width, which
  // agree to 0.1 %), in the section frame of `punchSection` (mm from the tip,
  // +y the backgauge side): the throat opens to the operator (−y), the body
  // leans back over the tip. `flank`: where each tip flank (44° from
  // vertical) ends; `back`: the back of the body from that flank up to the
  // clamp shoulder (z = height); `front`: from the shoulder down the front of
  // the head, round the throat to the front flank. The back rises at 47.5°
  // from the tip, the throat reaches 20.3 mm (29.3 on the deep one) behind
  // the tip line. Schematic: the 13 mm tang (it sits 13.5 mm behind the tip
  // in the drawing; the simulator's clamps stand centred on the punch line,
  // as for every punch) and the 0.35 mm step at the foot of the back flank.
  'gooseneck-88': Object.freeze({
    key: 'gooseneck-88',
    name: 'Gooseneck 88°',
    angle: 88,
    radius: 0.8,
    height: 104.5,
    load: 500,
    use: 'A flange already standing that would hit a straight punch: its throat makes room for it.',
    outline: freezeOutline({
      flank: { back: 6.95, front: 6.0 },
      back: [
        [49.0, 53.4],
        [49.0, 92.5],
        [37.0, 104.5],
      ],
      front: [
        [-6.0, 104.5],
        [-7.0, 103.5],
        [-7.0, 94.8],
        [14.5, 73.3],
        [17.7, 69.1],
        [19.6, 64.3],
        [20.3, 59.2],
        [19.7, 54.1],
        [17.6, 49.2],
        [-6.0, 8.2],
      ],
    }),
  }),
  'gooseneck-88-deep': Object.freeze({
    key: 'gooseneck-88-deep',
    name: 'Gooseneck 88° deep',
    angle: 88,
    radius: 0.8,
    height: 145,
    load: 700,
    use: 'Deep channels and return flanges: a deeper throat than the gooseneck, and taller.',
    outline: freezeOutline({
      flank: { back: 7.4, front: 7.0 },
      back: [
        [8.6, 9.5],
        [68.0, 74.3],
        [68.0, 125.1],
        [48.0, 145],
      ],
      front: [
        [-6.0, 145],
        [-7.0, 144.1],
        [-7.0, 132.1],
        [23.5, 101.6],
        [26.5, 97.7],
        [28.5, 93.2],
        [29.3, 88.4],
        [28.9, 83.5],
        [27.3, 78.7],
        [-7.0, 8.4],
      ],
    }),
  }),
  'acute-30': Object.freeze({
    key: 'acute-30',
    name: 'Acute 30°',
    angle: 30,
    radius: 0.6,
    height: 80,
    load: 500,
    use: 'Bends past 90°, in an acute 30° die.',
  }),
  // Shop floor §6.2: a tall straight punch for deep boxes (Tecnostamp Red Line
  // Amada-Promecam 11.228: 88°, R0.80, H 105, 100 t/m). Its body is drawn as
  // the straight blade (assumed: the catalogue drawing was not read).
  'straight-88-tall': Object.freeze({
    key: 'straight-88-tall',
    name: 'Straight 88° tall',
    angle: 88,
    radius: 0.8,
    height: 105,
    load: 1000,
    use: 'Deep boxes: it holds the clamps higher, so taller flanges pass under them.',
  }),
  ...Object.fromEntries(
    [
      // Round-bend spec §12.3 (RB-2): radius punches, a full round nose of
      // radius R that forms an inside radius of R in one hit. Amada High
      // Tonnage catalogue (2021), "Radius Ruler" HT-R10 … HT-R30 on a radius
      // punch holder, read from the PDF: height (ruler on its holder) 114.3,
      // 125.1, 135.9, 146.7, 157.4; 1300 kN/m; ruler width 2 R (the HT-R10
      // row prints 10.0, taken as a misprint for 20). The holder: HH-015 (100
      // high) under the R10 … R20 and HH-016 (103.5) under the R25 and R30,
      // both 41 wide (the HH-015 drawing carries the R10, R12.5, R15, R17.5
      // and R20 circles in its cradle, brake blades §11). `angle` is null: a
      // round nose has no flank angle.
      [10, 114.3, 'HH-015'],
      [15, 125.1, 'HH-015'],
      [20, 135.9, 'HH-015'],
      [25, 146.7, 'HH-016'],
      [30, 157.4, 'HH-016'],
    ].map(([r, height, holder]) => [
      `radius-${r}`,
      Object.freeze({
        key: `radius-${r}`,
        name: `Radius R${r}`,
        round: true,
        angle: null,
        radius: r,
        width: 2 * r,
        height,
        holder: Object.freeze({ height: RADIUS_HOLDERS[holder].height, width: RADIUS_HOLDERS[holder].width }),
        holderOutline: RADIUS_HOLDERS[holder].outline,
        load: 1300,
        use: `Round bends in one hit: R${r} inside.`,
      }),
    ]),
  ),
});
export const DEFAULT_PUNCH = 'straight-88';
/** The radius punches (§12.3), narrowest first. */
export const RADIUS_PUNCHES = Object.freeze(
  Object.values(PUNCHES)
    .filter((p) => p.round)
    .sort((a, b) => a.radius - b.radius),
);
/** The radius punch whose nose is `radius` (to 0.01 mm), or null. */
export const radiusPunchFor = (radius) =>
  RADIUS_PUNCHES.find((p) => Number.isFinite(radius) && Math.abs(p.radius - radius) < 0.005) || null;
/** The radius punch nearest `radius` (the smaller on a tie), for a station switching to Radius punch. */
export const nearestRadiusPunch = (radius) =>
  RADIUS_PUNCHES.reduce((best, p) =>
    Math.abs(p.radius - (Number(radius) || 0)) < Math.abs(best.radius - (Number(radius) || 0)) - 1e-9 ? p : best,
  );

// `height` per die: the 88° and 30° dies stand 80 high; the wide 60° dies
// are deeper (their V is deeper at 60°). `use` (brake blades §4.1) by the
// die's angle: what that family of dies is for.
const DIE_USE = Object.freeze({
  88: 'Everyday bends, up to 92°: the narrower the V, the thinner the sheet.',
  30: 'Bends past 90°, with the acute punch.',
  60: 'Round bends with a radius punch: a wide V.',
});
const die = (v, angle, shoulderRadius, width, load, height = 80) =>
  Object.freeze({
    key: `v${v}-${angle}`,
    name: `V${v} ${angle}°`,
    v,
    angle,
    shoulderRadius,
    width,
    height,
    load,
    use: DIE_USE[angle],
  });
export const DIES = Object.freeze(
  Object.fromEntries(
    [
      die(6, 88, 0.8, 14, 1000),
      die(8, 88, 1.0, 14, 1000),
      die(10, 88, 1.2, 18, 1000),
      die(12, 88, 1.5, 18, 1000),
      die(16, 88, 2.0, 24, 1000),
      die(20, 88, 2.0, 30, 1000),
      die(25, 88, 3.0, 35, 1000),
      die(8, 30, 1.0, 18, 400),
      die(12, 30, 1.5, 24, 400),
      die(16, 30, 2.0, 30, 400),
      // Round-bend spec §12.3 (RB-2): wide dies for the radius punches. Amada
      // High Tonnage catalogue (2021), 1-V 60° dies, read from the PDF: V,
      // shoulder radius, width and 1300 kN/m from each row; the height from
      // the row's drawing (its Height field prints 0.0). The section is drawn
      // as a plain block that wide (the drawings show a narrower upper body on
      // the V50 – V100, not modelled).
      die(32, 60, 5, 60, 1300, 80),
      die(40, 60, 5, 60, 1300, 80),
      die(50, 60, 6, 80, 1300, 85),
      die(63, 60, 8, 80, 1300, 95),
      die(80, 60, 10, 100, 1300, 100),
      die(100, 60, 12, 135, 1300, 125),
    ].map((d) => [d.key, d]),
  ),
);

export function punchOf(key) {
  const punch = PUNCHES[key ?? DEFAULT_PUNCH];
  if (!punch) throw new Error(`Unknown punch: ${key}`);
  return punch;
}
export function dieOf(key) {
  const found = DIES[key];
  if (!found) throw new Error(`Unknown die: ${key}`);
  return found;
}

// §8.3: V ≥ m·t, m = 6 up to 2.5 mm, 8 up to 8, 10 up to 10, 12 above
// (Amada table); the smallest 88° die that is wide enough, else the widest.
export const dieOpeningFactor = (t) => (t <= 2.5 ? 6 : t <= 8 ? 8 : t <= 10 ? 10 : 12);
// Round-bend spec §12.3: a radius punch wants V ≥ 2.2 × (R + t) (Harsle's
// radius air bending rule, 2.2 – 2.5; the lower bound is the minimum).
export const RADIUS_DIE_FACTOR = 2.2;
/** The narrowest die opening a radius punch takes: 2.2 × (R + t). */
export const radiusDieOpening = (punch, thickness) => RADIUS_DIE_FACTOR * (punch.radius + thickness);
const punchEntryOf = (punch) => (typeof punch === 'string' ? PUNCHES[punch] || null : punch || null);
/**
 * The automatic die: for a radius punch (`punch`, a key or an entry) the
 * narrowest catalogue die with V ≥ 2.2 × (R + t), else the widest; for any
 * other punch, or none, the §8.3 rule above.
 */
export function defaultDie(thickness, punch = null) {
  const entry = punchEntryOf(punch);
  if (entry?.round) {
    // Narrowest first; on a tie of V the wider die angle.
    const dies = Object.values(DIES).sort((a, b) => a.v - b.v || b.angle - a.angle);
    const wanted = radiusDieOpening(entry, thickness);
    return dies.find((d) => d.v >= wanted - 1e-9) || dies.at(-1);
  }
  const dies = Object.values(DIES)
    .filter((d) => d.angle === 88)
    .sort((a, b) => a.v - b.v);
  const wanted = dieOpeningFactor(thickness) * thickness;
  return dies.find((d) => d.v >= wanted - 1e-9) || dies.at(-1);
}

// Air bend: r = max(punch tip radius, radiusOfV × V); below 0.63 t the bend
// turns sharp and the radius stays at 0.63 t.
export const SHARP_RATIO = 0.63;
export function airBendRadius(stock, thickness, punch, dieEntry) {
  const formed = Math.max(punch.radius, stock.radiusOfV * dieEntry.v);
  const sharp = formed < SHARP_RATIO * thickness;
  return { radius: sharp ? SHARP_RATIO * thickness : formed, sharp };
}

/** Largest bend angle a die allows: 180° − die angle (88° → 92°). */
export const maxBendAngle = (dieEntry) => 180 - dieEntry.angle;

/** Minimum flat distance from the bend line to the leg's end: V / (2 cos(A/2)) + shoulder radius. */
export const minLeg = (dieEntry, angle) =>
  dieEntry.v / (2 * Math.cos((angle * Math.PI) / 360)) + dieEntry.shoulderRadius;

/** A cut-out closer than this to the bend line distorts: 2.5 t + r. */
export const distortionDistance = (thickness, radius) => 2.5 * thickness + radius;

/** Air-bend force in kN: 1.42 · Rm · t² · L / (1000 · V). */
export const tonnage = (stock, thickness, length, dieEntry) =>
  (1.42 * stock.rm * thickness * thickness * length) / (1000 * dieEntry.v);

/** Springback in degrees (display only): springback90 × (A / 90) × √clamp(r/t, 1, 8). */
export const springback = (stock, angle, radius, thickness) =>
  stock.springback90 * (angle / 90) * Math.sqrt(Math.min(8, Math.max(1, radius / thickness)));

// Ram depth below the die top (display only), from three-point contact: die
// top at y = 0, shoulder radius Rd, die angle δ, φ = (A + springback)/2.
export function ramDepth({ v, thickness, radius, angle, springback: overbend = 0, shoulderRadius, dieAngle }) {
  const rad = Math.PI / 180;
  const phi = ((angle + overbend) / 2) * rad;
  const c = v / 2 + shoulderRadius * Math.tan(((90 - dieAngle / 2) / 2) * rad);
  const yc = (radius + thickness + shoulderRadius - c * Math.sin(phi)) / Math.cos(phi) - shoulderRadius;
  return thickness - (yc - radius);
}

// Finish gloss → viewport roughness (§7).
export const FINISH_ROUGHNESS = Object.freeze({ matte: 0.9, satin: 0.6, gloss: 0.25, texture: 0.95 });

// ---------------------------------------------------------------- press brakes (§8.4, SM-2)
// Generic machines sized like the Amada HFE M2 series, named by capacity only.
// force kN; bed, stroke, open height, throat mm; speeds mm/s; backgauge travel
// mm from the punch line (assumed). `beam` is the schematic thickness of the
// ram and the bed (the station draws and checks them as prisms that wide).
// `holder` (shop floor §6.2): the sectional punch holders (Promecam
// "intermediates") between the punch and the ram, set up over the punch's
// sections only, so the full-length ram stands `height` above the punch.
// Height: the standard 100 mm working height (Rolleri INT100, Wilson Z1
// #43000: 130 overall, 100 useful, 1000 kN/m). Width across the bed (Y) is
// an assumption (no catalogue states it): the punch's 26 mm clamp shoulder.
export const BACKGAUGE = Object.freeze({ min: 5, max: 600 });
export const PUNCH_HOLDER = Object.freeze({ height: 100, width: 26 });
const brake = (tonnes, metres, bed) =>
  Object.freeze({
    key: `brake-${tonnes}-${metres * 1000}`,
    name: `${tonnes} t × ${metres} m press brake`,
    force: tonnes * 10,
    bed,
    stroke: 200,
    openHeight: 470,
    throat: 420,
    speeds: Object.freeze({ approach: 100, bend: 10, return: 100 }),
    backgauge: BACKGAUGE,
    beam: 60,
    holder: PUNCH_HOLDER,
  });
export const MACHINES = Object.freeze(
  Object.fromEntries([brake(50, 2, 2090), brake(80, 2.5, 2570), brake(100, 3, 3110)].map((m) => [m.key, m])),
);
export const MACHINE_KEYS = Object.freeze(Object.keys(MACHINES));
export const DEFAULT_MACHINE = 'brake-50-2000';
export function machineOf(key) {
  const found = MACHINES[key ?? DEFAULT_MACHINE];
  if (!found) throw new Error(`Unknown press brake: ${key}`);
  return found;
}

/**
 * The automatic die for a thickness, saying whether the catalogue has one wide
 * enough: { die, wanted (the V the m × t rule asks for, or a radius punch's
 * 2.2 × (R + t)), fits }. `defaultDie` silently takes the widest when none
 * is; the station reports it.
 */
export function suggestedDie(thickness, punch = null) {
  const die = defaultDie(thickness, punch);
  const entry = punchEntryOf(punch);
  const wanted = entry?.round ? radiusDieOpening(entry, thickness) : dieOpeningFactor(thickness) * thickness;
  return { die, wanted, fits: die.v >= wanted - 1e-9 };
}

/**
 * The tooling's load limit in kN: each tool's kN/m over the length of it
 * under the bend (brake tool length §3.3), the weaker of the two. `length`
 * the punch's (and, without `dieLength`, the die's): the bend's own when the
 * tooling is fitted to it.
 */
export const toolingLimit = (punch, dieEntry, length, dieLength = length) =>
  dieLength === length
    ? (Math.min(punch.load, dieEntry.load) * length) / 1000
    : Math.min(punch.load * length, dieEntry.load * dieLength) / 1000;

// Brake tool length (docs/sketch-studio-brake-tool-length.md §3.2): the
// shortest section a sectional punch or die set is made of. Amada Tooling
// Price List 2025 (online.flippingbook.com/view/67613920/5), p. 5:
// "Sectionalized Punch (100mm are ears): 100, 10, 15, 15, 20, 40, 50, 150,
// 300, 100 = 800 mm" and "Sectionalized Die: 100, 10, 15, 15, 20, 40, 50,
// 150, 400 = 800 mm"; AccurTool's 835 mm sectioned set (100, 10, 15, 20, 40,
// 50, 200, 300, 100) agrees on 10.
export const SHORTEST_SECTION = 10;

// Section polygons (y across the bed, z up; counter-clockwise; no repeated
// end point), generated from the numbers above. Punches: tip at the origin,
// clamp shoulder (26 mm wide) at z = height. Dies: top at z = 0, the V centred
// on y = 0, body `width` wide and 80 high.
const PUNCH_SHOULDER = 13;
const ARC_POINTS = 6;
const deg = Math.PI / 180;
// The tip arc of radius r between two flanks at ±half from vertical, left to right.
function tipArc(radius, half) {
  const points = [];
  for (let i = 0; i <= ARC_POINTS; i++) {
    // From the left flank's tangent point round the bottom to the right one.
    const a = -Math.PI / 2 - (Math.PI / 2 - half) + ((Math.PI - 2 * half) * i) / ARC_POINTS;
    points.push([radius * Math.cos(a), radius + radius * Math.sin(a)]);
  }
  return points;
}
// The z at which a flank tangent to the tip arc reaches half-width `w`.
const flankTop = (radius, half, w) =>
  radius * (1 - Math.sin(half)) + ((w - radius * Math.cos(half)) / Math.sin(half)) * Math.cos(half);

// A radius punch's nose: samples over its half circle.
const NOSE_POINTS = 16;

/**
 * A punch's section: a straight blade, a gooseneck as its catalogue drawing
 * has it (its `outline`, brake blades §4.2), or a radius punch (§12.3): its
 * round ruler of radius R, the circle up to where it enters its holder's V
 * cradle, then the holder as the catalogue draws it (`holderOutline`, brake
 * flip tooling §5.6) to the punch's height. `reverse` (§4.2): the punch
 * turned round in its clamps, the section mirrored (a gooseneck's throat to
 * the backgauge).
 */
export function punchSection(punch, reverse = false) {
  if (reverse)
    return punchSection(punch)
      .map(([y, z]) => [-y, z])
      .reverse();
  if (punch.round) {
    const r = punch.radius,
      h = punch.height,
      z = h - punch.holder.height;
    // The holder's foot tips stand z above the nose; the circle crosses that
    // level at ± r cos(a) and runs on inside the cradle (filled: the ruler
    // and the V hold it there).
    const a = Math.asin(Math.max(-1, Math.min(1, (z - r) / r)));
    const arc = (from, to, count) =>
      Array.from({ length: count + 1 }, (_, i) => {
        const t = from + ((to - from) * i) / count;
        return [r * Math.cos(t), r + r * Math.sin(t)];
      });
    const upper = Math.max(1, Math.ceil((Math.abs(a) / Math.PI) * NOSE_POINTS));
    // From the left crossing down to the equator, the nose from the left side
    // round the bottom to the right one (centre (0, R)), up to the right crossing.
    const nose =
      a > 1e-9
        ? [
            ...arc(Math.PI - a, Math.PI, upper).slice(0, -1),
            ...arc(Math.PI, 2 * Math.PI, NOSE_POINTS),
            ...arc(0, a, upper).slice(1),
          ]
        : arc(Math.PI - a, 2 * Math.PI + a, NOSE_POINTS);
    const right = (
      punch.holderOutline || [
        [punch.holder.width / 2, 0],
        [punch.holder.width / 2, punch.holder.height],
      ]
    ).map(([y, dz]) => [y, z + dz]);
    return [...nose, ...right, ...right.map(([y, zz]) => [-y, zz]).reverse()];
  }
  const half = (punch.angle / 2) * deg,
    h = punch.height,
    r = punch.radius;
  const arc = tipArc(r, half);
  if (punch.outline) {
    const { flank, back, front } = punch.outline;
    // Back (+y) up to the shoulder, then down the front (−y): the neck leans back, the throat opens to the front.
    return [
      ...arc,
      [flank.back, flankTop(r, half, flank.back)],
      ...back.map((p) => [...p]),
      ...front.map((p) => [...p]),
      [-flank.front, flankTop(r, half, flank.front)],
    ];
  }
  const w = punch.key.endsWith('sharp') ? 3.5 : 4,
    z = flankTop(r, half, w);
  return [
    ...arc,
    [w, z],
    [w, h - 14],
    [PUNCH_SHOULDER, h - 5],
    [PUNCH_SHOULDER, h],
    [-PUNCH_SHOULDER, h],
    [-PUNCH_SHOULDER, h - 5],
    [-w, h - 14],
    [-w, z],
  ];
}

/** Is a punch's section its own mirror image (Reverse punch changes nothing)? Brake blades §4.2. */
export function punchSymmetric(punch) {
  const ring = punchSection(punch);
  return ring.every(([y, z]) => ring.some(([v, w]) => Math.abs(v + y) < 1e-6 && Math.abs(w - z) < 1e-6));
}

/**
 * Where a die's shoulder radius centre sits: y = ±c, z = −Rd, with
 * c = V/2 + Rd·tan((90° − δ/2)/2) (the same c as `ramDepth`).
 */
export const shoulderOffset = (dieEntry) =>
  dieEntry.v / 2 + dieEntry.shoulderRadius * Math.tan(((90 - dieEntry.angle / 2) / 2) * deg);

/** A single-V die's section: flanks at δ/2 from vertical, rounded shoulders, a 1 mm groove at the bottom of the V. */
export function dieSection(dieEntry) {
  const half = (dieEntry.angle / 2) * deg,
    rd = dieEntry.shoulderRadius,
    c = shoulderOffset(dieEntry),
    w = dieEntry.width / 2;
  const depth = dieEntry.v / 2 / Math.tan(half);
  // The right shoulder, from the die top (90°) round to the flank (180° − δ/2), centre (c, −rd).
  const shoulder = [];
  for (let i = 0; i <= ARC_POINTS; i++) {
    const a = Math.PI / 2 + ((Math.PI / 2 - half) * i) / ARC_POINTS;
    shoulder.push([c + rd * Math.cos(a), -rd + rd * Math.sin(a)]);
  }
  const groove = Math.min(0.5, dieEntry.v / 20);
  const right = [
    [w, -dieEntry.height],
    [w, 0],
    ...shoulder,
    [groove, -depth + groove / Math.tan(half)],
    [groove, -depth - 1],
  ];
  const left = right.map(([y, z]) => [-y, z]).reverse();
  return [...right, ...left];
}

// ---------------------------------------------------------------- laser (§8.5, SM-4)
// The shop's one laser, the default 2 kW fiber (model.fabrication.shop.laser).
export const LASERS = Object.freeze({
  'fiber-2kw': Object.freeze({ key: 'fiber-2kw', name: '2 kW fiber laser' }),
});
export const DEFAULT_LASER = 'fiber-2kw';
// Stock sheets on the laser table (model.fabrication.shop.sheet), the long
// side along X: `width` × `height` mm as the table holds them.
const laserSheet = (short, long) =>
  Object.freeze({ key: `${short}x${long}`, name: `${short} × ${long} mm`, width: long, height: short });
export const LASER_SHEETS = Object.freeze(
  Object.fromEntries([laserSheet(1219, 2438), laserSheet(1250, 2500), laserSheet(1500, 3000)].map((s) => [s.key, s])),
);
export const LASER_SHEET_KEYS = Object.freeze(Object.keys(LASER_SHEETS));
export const DEFAULT_LASER_SHEET = '1219x2438';
export function laserSheetOf(key) {
  const found = LASER_SHEETS[key ?? DEFAULT_LASER_SHEET];
  if (!found) throw new Error(`Unknown stock sheet: ${key}`);
  return found;
}
/** Kerf (the width the beam burns away): 0.10 mm for t ≤ 2, 0.15 for t ≤ 3, 0.25 above. */
export const laserKerf = (thickness) => (thickness <= 2 ? 0.1 : thickness <= 3 ? 0.15 : 0.25);
// Cutting speed of the 2 kW fiber, m/min by thickness (mm), per stock family.
export const LASER_SPEEDS = Object.freeze({
  steel: Object.freeze([
    [1, 25],
    [2, 5.5],
    [3, 4.0],
    [6, 2.3],
  ]),
  stainless: Object.freeze([
    [1, 30],
    [2, 10],
    [3, 5.8],
    [6, 1.0],
  ]),
  aluminium: Object.freeze([
    [1, 26],
    [2, 11.5],
    [3, 5.8],
    [6, 0.75],
  ]),
});
// The table's range: thinner sheet is cut at the 1 mm speed and pierce, thicker at 6 mm (both flagged).
export const LASER_RANGE = Object.freeze({ min: 1, max: 6 });
const STOCK_FAMILY = Object.freeze({
  spcc: 'steel',
  secc: 'steel',
  sus304: 'stainless',
  a5052: 'aluminium',
  a6061: 'aluminium',
});
/** The laser table a stock is cut by: 'steel', 'stainless' or 'aluminium'. */
export const laserFamily = (stock) => STOCK_FAMILY[typeof stock === 'string' ? stock : stock?.key] || 'steel';
const clampRange = (t) => Math.min(LASER_RANGE.max, Math.max(LASER_RANGE.min, t));
/** Cutting speed in m/min, interpolated on thickness in the stock family's table (clamped to 1 – 6 mm). */
export function laserSpeed(stock, thickness) {
  const table = LASER_SPEEDS[laserFamily(stock)];
  const t = clampRange(thickness);
  for (let i = 1; i < table.length; i++) {
    const [t0, v0] = table[i - 1],
      [t1, v1] = table[i];
    if (t <= t1 + 1e-12) return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
  }
  return table.at(-1)[1];
}
/** Pierce time in s: 0.1 s at 1 mm rising linearly to 1 s at 6 mm (clamped). */
export const pierceTime = (thickness) => 0.1 + ((clampRange(thickness) - 1) * 0.9) / 5;
/** Laser time in s: pierces × pierce time + cut length / speed (§8.5). */
export const laserCutTime = ({ cutLength, pierces, stock, thickness }) =>
  pierces * pierceTime(thickness) + cutLength / ((laserSpeed(stock, thickness) * 1000) / 60);
// The shop's nesting: copies stand this far apart on the sheet (≥ kerf + 2 mm
// for every kerf above), and clear of the sheet edge by this margin.
export const LASER_PART_GAP = 3;
export const LASER_SHEET_MARGIN = 10;

// ---------------------------------------------------------------- paint, print (§8.6, SM-3)
// Powder coating: film 70 µm (50 – 125), specific gravity 1.5, transfer
// efficiency 0.6; coverage m²/kg = 1000 / (SG × µm) × TE; cure 200 °C part
// temperature for 10 min. Holes below 1.0 mm are likely to fill.
export const POWDER = Object.freeze({
  film: 70,
  minFilm: 50,
  maxFilm: 125,
  gravity: 1.5,
  transfer: 0.6,
  cureTemperature: 200,
  cureMinutes: 10,
  fillHole: 1.0,
});
export const powderCoverage = (film, gravity = POWDER.gravity, transfer = POWDER.transfer) =>
  (1000 / (gravity * film)) * transfer;
export const FINISH_GLOSS_NAMES = Object.freeze({ matte: 'Matte', satin: 'Satin', gloss: 'Gloss', texture: 'Texture' });

// RAL Classic: a common shop selection. The hex values are screen
// approximations of the printed RAL cards (RAL publishes no sRGB values).
const ral = (code, name, colour) => Object.freeze({ code, name: `RAL ${code} ${name}`, colour });
export const RAL_CLASSIC = Object.freeze([
  ral(1003, 'Signal yellow', '#f9a800'),
  ral(1021, 'Colza yellow', '#f6b600'),
  ral(1023, 'Traffic yellow', '#f7b500'),
  ral(2004, 'Pure orange', '#e25303'),
  ral(3000, 'Flame red', '#a72920'),
  ral(3020, 'Traffic red', '#bb1e10'),
  ral(5002, 'Ultramarine blue', '#00387b'),
  ral(5010, 'Gentian blue', '#004f7c'),
  ral(5012, 'Light blue', '#0089b6'),
  ral(5015, 'Sky blue', '#007cb0'),
  ral(6005, 'Moss green', '#0f4336'),
  ral(6011, 'Reseda green', '#587f40'),
  ral(7015, 'Slate grey', '#4f5358'),
  ral(7016, 'Anthracite grey', '#383e42'),
  ral(7021, 'Black grey', '#2f3234'),
  ral(7024, 'Graphite grey', '#474a50'),
  ral(7032, 'Pebble grey', '#b9b9a8'),
  ral(7035, 'Light grey', '#c5c7c4'),
  ral(7040, 'Window grey', '#9da3a6'),
  ral(8017, 'Chocolate brown', '#45302b'),
  ral(9003, 'Signal white', '#ecece7'),
  ral(9005, 'Jet black', '#0e0e10'),
  ral(9006, 'White aluminium', '#a1a1a0'),
  ral(9007, 'Grey aluminium', '#878581'),
  ral(9010, 'Pure white', '#f1ece1'),
  ral(9016, 'Traffic white', '#f1f0ea'),
]);
/** The RAL entry whose name or colour matches, or null (a custom colour). */
export const ralOf = ({ name, colour } = {}) =>
  RAL_CLASSIC.find((r) => r.name === name) ||
  RAL_CLASSIC.find((r) => colour && r.colour === String(colour).toLowerCase()) ||
  null;

// Printing (Protocase): silk-screen text at least 9 pt, artwork at least
// 6.35 mm from the face edge and never over a bend zone; UV flatbed and
// silk-screen need a flat face; pad printing is for small marks (it takes a
// curved face too). 1 pt = 25.4 / 72 mm.
export const PRINT_RULES = Object.freeze({ minPoint: 9, edgeDistance: 6.35 });
export const POINT_MM = 25.4 / 72;
export const PRINT_METHOD_NAMES = Object.freeze({ silk: 'Silk-screen', uv: 'UV flatbed', pad: 'Pad print' });
