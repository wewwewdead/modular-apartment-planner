// Phase N (docs/sketch-studio-screw-library.md §3–§5): the per-size default
// tables of the 22 screw kinds, as published by the standards (sources in the
// spec §12). Values in mm. A size missing from a table is filled by the kind's
// proportional rule in hardware.js and flagged `estimated`.

export const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
export const round1 = (value) => Math.round((value + Number.EPSILON) * 10) / 10;

// Non-metric thread catalogs (metric = METRIC_THREADS in hardware.js).
export const TAPPING_THREADS = {
  'ST2.9': { diameter: 2.9, pitch: 1.1 },
  'ST3.5': { diameter: 3.5, pitch: 1.3 },
  'ST4.2': { diameter: 4.2, pitch: 1.4 },
  'ST4.8': { diameter: 4.8, pitch: 1.6 },
  'ST5.5': { diameter: 5.5, pitch: 1.8 },
  'ST6.3': { diameter: 6.3, pitch: 1.8 },
};
export const WOOD_THREADS = {
  '3.0': { diameter: 3, pitch: 1.35 },
  3.5: { diameter: 3.5, pitch: 1.6 },
  '4.0': { diameter: 4, pitch: 1.8 },
  4.5: { diameter: 4.5, pitch: 2 },
  '5.0': { diameter: 5, pitch: 2.2 },
  '6.0': { diameter: 6, pitch: 2.6 },
};
export const DRYWALL_THREADS = {
  3.5: { diameter: 3.5, pitch: 1.6 },
  3.9: { diameter: 3.9, pitch: 1.7 },
  4.2: { diameter: 4.2, pitch: 1.8 },
  4.8: { diameter: 4.8, pitch: 2.1 },
};
export const LAG_THREADS = {
  5: { diameter: 5, pitch: 2.1 },
  6: { diameter: 6, pitch: 2.5 },
  8: { diameter: 8, pitch: 3.5 },
  10: { diameter: 10, pitch: 4.5 },
  12: { diameter: 12, pitch: 5.5 },
};

// Builds { size: { column: value } } from a column-major listing.
const table = (sizes, columns) =>
  Object.fromEntries(
    sizes.map((size, i) => [size, Object.fromEntries(Object.entries(columns).map(([key, list]) => [key, list[i]]))]),
  );
const M_ALL = ['M2', 'M2.5', 'M3', 'M4', 'M5', 'M6', 'M8', 'M10', 'M12'];
const M_FROM3 = ['M3', 'M4', 'M5', 'M6', 'M8', 'M10', 'M12'];
const M_TO10 = ['M2', 'M2.5', 'M3', 'M4', 'M5', 'M6', 'M8', 'M10'];
const ST_ALL = ['ST2.9', 'ST3.5', 'ST4.2', 'ST4.8', 'ST5.5', 'ST6.3'];
const WOOD_ALL = ['3.0', '3.5', '4.0', '4.5', '5.0', '6.0'];

export const SCREW_TABLES = {
  // 1 ISO 4762
  'socket-cap': table(M_ALL, {
    dk: [3.8, 4.5, 5.5, 7, 8.5, 10, 13, 16, 18],
    k: [2, 2.5, 3, 4, 5, 6, 8, 10, 12],
    s: [1.5, 2, 2.5, 3, 4, 5, 6, 8, 10],
  }),
  // 2 ISO 7380-1
  'button-head': table(M_FROM3, {
    dk: [5.7, 7.6, 9.5, 10.5, 14, 17.5, 21],
    k: [1.65, 2.2, 2.75, 3.3, 4.4, 5.5, 6.6],
    s: [2, 2.5, 3, 4, 5, 6, 8],
  }),
  // 3 ISO 10642 (theoretical dk = 2.24·d, k = 0.62·d)
  'countersunk-socket': table(M_FROM3, {
    dk: [6.72, 8.96, 11.2, 13.44, 17.92, 22.4, 26.88],
    k: [1.86, 2.48, 3.1, 3.72, 4.96, 6.2, 7.44],
    s: [2, 2.5, 3, 4, 5, 6, 8],
  }),
  // 4 ISO 7045
  'pan-head': table(M_TO10, {
    dk: [4, 5, 5.6, 8, 9.5, 12, 16, 20],
    k: [1.6, 2.1, 2.4, 3.1, 3.7, 4.6, 6, 7.5],
  }),
  // 5 DIN 965 / ISO 7046 (the DIN 965 column for M8/M10; ISO 7046 lists 15.8 / 18.3)
  'countersunk-machine': table(M_TO10, {
    dk: [3.8, 4.7, 5.6, 7.5, 9.2, 11, 14.5, 18],
    k: [1.2, 1.5, 1.65, 2.2, 2.5, 3, 4, 5],
  }),
  // 6 ISO 7047 / DIN 966: the same dk, k plus the dome height f
  'raised-countersunk': table(M_TO10, {
    dk: [3.8, 4.7, 5.6, 7.5, 9.2, 11, 14.5, 18],
    k: [1.2, 1.5, 1.65, 2.2, 2.5, 3, 4, 5],
    f: [0.5, 0.6, 0.7, 1, 1.2, 1.4, 2, 2.3],
  }),
  // 7 ISO 1207
  'cheese-head': table(M_TO10, {
    dk: [3.8, 4.5, 5.5, 7, 8.5, 10, 13, 16],
    k: [1.4, 1.8, 2, 2.6, 3.3, 3.9, 5, 6],
  }),
  // 8 JIS B 1111
  'truss-head': table(['M3', 'M4', 'M5', 'M6', 'M8'], {
    dk: [6.9, 9.4, 11.8, 14, 17.8],
    k: [1.9, 2.5, 3.1, 3.7, 4.8],
  }),
  // 9 DIN 6921: s across flats, dc flange, k height
  'hex-flange': table(['M5', 'M6', 'M8', 'M10', 'M12'], {
    s: [8, 10, 13, 15, 16],
    dc: [11.8, 14.2, 18, 22.3, 26.6],
    k: [5.4, 6.6, 8.1, 9.2, 11.5],
  }),
  // 10 ISO 7379: ds shoulder, dk/k head, s socket, t thread length
  shoulder: table(['M5', 'M6', 'M8', 'M10', 'M12'], {
    ds: [6.5, 8, 10, 13, 16],
    dk: [10, 13, 16, 18, 24],
    k: [4.5, 5.5, 7, 9, 11],
    s: [3, 4, 5, 6, 8],
    t: [9.5, 11.5, 13.5, 16, 18],
  }),
  // 11 ISO 4026–4029: s socket, dp flat/dog point, dz cup, z dog length
  'set-screw': table(M_FROM3, {
    s: [1.5, 2, 2.5, 3, 4, 5, 6],
    dp: [2, 2.5, 3.5, 4, 5.5, 7, 8.5],
    dz: [1.4, 2, 2.5, 3, 5, 6, 8],
    z: [1.75, 2.25, 2.75, 3.25, 4.3, 5.3, 6.3],
  }),
  // 12 DIN 464 / DIN 653: dk knurl, k knurl height, ds shoulder, h overall (high)
  thumb: table(['M3', 'M4', 'M5', 'M6', 'M8', 'M10'], {
    dk: [12, 16, 20, 24, 30, 36],
    k: [2.5, 3.5, 4, 5, 6, 8],
    ds: [6, 8, 10, 12, 16, 20],
    h: [7.5, 9.5, 11.5, 15, 18, 23],
  }),
  // 13 DIN 316 (column mapping per the spec §3.1: e span, h height, d2 collar,
  // d3 hub, g2 wing thickness, a collar height)
  wing: table(['M4', 'M5', 'M6', 'M8', 'M10', 'M12'], {
    e: [18, 24, 30, 36, 48, 62],
    h: [8.5, 11, 15, 18, 23, 31],
    d2: [6, 8, 10, 13, 17, 20],
    d3: [5.5, 7.5, 9, 10.5, 14.5, 17.5],
    g2: [1.7, 2.3, 2.7, 3.6, 4.6, 5.6],
    a: [2.1, 2.4, 3, 4, 4.5, 5.3],
  }),
  // 14 DIN 444 form B: d2 eye outer, d1 eye bore, s eye thickness
  'eye-bolt': table(['M6', 'M8', 'M10', 'M12'], {
    d2: [14, 18, 20, 25],
    d1: [6, 8, 10, 12],
    s: [7, 9, 12, 14],
  }),
  // 15 DIN 603: dk dome, k height, v square neck, f neck height
  carriage: table(['M5', 'M6', 'M8', 'M10', 'M12'], {
    dk: [13, 16, 20, 24, 30],
    k: [3.1, 3.5, 4.5, 5, 6.5],
    v: [5, 6, 8, 10, 12],
    f: [3, 4, 5, 6, 8],
  }),
  // 16 ISO 7049 / DIN 7981
  'tapping-pan': table(ST_ALL, {
    dk: [5.6, 6.9, 8.2, 9.5, 10.8, 12.5],
    k: [2.2, 2.6, 3.05, 3.55, 3.95, 4.55],
  }),
  // 17 ISO 7050 / DIN 7982
  'tapping-countersunk': table(ST_ALL, {
    dk: [5.5, 6.8, 8.1, 9.5, 10.8, 12.4],
    k: [1.7, 2.1, 2.5, 3, 3.3, 3.8],
  }),
  // 18 DIN 7504 K (hex washer s/dc/k), N (pan dk/k), P (countersunk dk/k), dp drill point
  'self-drilling': table(['ST3.5', 'ST4.2', 'ST4.8', 'ST5.5', 'ST6.3'], {
    s: [5.5, 7, 8, 8, 10],
    dc: [8.3, 8.8, 10.5, 11, 13.5],
    k: [3.4, 4.1, 4.3, 5.4, 5.9],
    panDk: [7, 8, 9.5, 11, 12],
    panK: [2.6, 3.1, 3.7, 4, 4.6],
    cskDk: [7.3, 8.4, 9.3, 10.3, 11.3],
    cskK: [2.35, 2.6, 2.8, 3, 3.15],
    dp: [2.8, 3.6, 4.1, 4.8, 5.8],
  }),
  // 19 DIN 7997 (countersunk; DIN 7995 raised, DIN 7996 round)
  wood: table(WOOD_ALL, {
    dk: [5.6, 6.5, 7.5, 8.3, 9.2, 11],
    k: [1.65, 1.93, 2.2, 2.35, 2.5, 3],
  }),
  // 20 DIN 7505: countersunk and pan heads
  chipboard: table(WOOD_ALL, {
    dk: [6, 7, 8, 9, 10, 12],
    k: [1.9, 2.1, 2.5, 2.7, 3, 3.6],
    panDk: [6, 7, 8, 9, 10, 12],
    panK: [2.37, 2.72, 2.92, 3.15, 3.65, 4.25],
  }),
  // 21 DIN 18182-2 TN (bugle; dk from supplier tables)
  drywall: table(['3.5', '3.9', '4.2', '4.8'], {
    dk: [8, 8.2, 8.5, 9],
    k: [2.1, 2.35, 2.5, 2.9],
  }),
  // 22 DIN 571 (2016 nominal s, k)
  lag: table(['5', '6', '8', '10', '12'], {
    s: [8, 10, 13, 17, 19],
    k: [3.5, 4, 5.5, 7, 8],
  }),
};

// ISO 4017 hexagon across flats for the small DIN 6921 sizes (rule rows).
export const HEX_FLATS = { M2: 4, 'M2.5': 5, M3: 5.5, M4: 7 };

// ISO 7045 cross recess span m.
export const PHILLIPS_M = { M2: 2.2, 'M2.5': 2.7, M3: 3.1, M4: 4.6, M5: 5.2, M6: 6.8, M8: 9, M10: 10.2 };

// ISO 10664 hexalobular point-to-point A: by metric size, else by thread
// diameter (tapping, wood and drywall sizes).
export const TORX_A = {
  M2: 1.75,
  'M2.5': 2.4,
  M3: 2.74,
  M4: 3.86,
  M5: 4.43,
  M6: 5.52,
  M8: 7.82,
  M10: 8.83,
  M12: 11.35,
};
export const TORX_A_BY_DIAMETER = [
  [2.9, 2.74],
  [3, 2.74],
  [3.5, 3.27],
  [3.9, 3.86],
  [4, 3.86],
  [4.2, 3.86],
  [4.5, 4.43],
  [4.8, 4.43],
  [5, 4.43],
  [5.5, 4.43],
  [6, 5.52],
  [6.3, 5.52],
];

// ---------------------------------------------------------------- Phase O
// The rivet library (docs/sketch-studio-rivet-library.md §3, §5): the six
// pitch-less size catalogs (the key is the body Ø) and the per-size tables.
// Key order is kept by the lists: integer-like object keys ('2', '10') would
// otherwise be enumerated before '2.5'.
const sized = (keys) => Object.fromEntries(keys.map((key) => [key, { diameter: Number(key) }]));
export const RIVET_SIZE_LISTS = {
  blind: ['2.4', '3.0', '3.2', '4.0', '4.8', '5.0', '6.0', '6.4'],
  solid: ['1', '1.2', '1.6', '2', '2.5', '3', '3.5', '4', '5', '6', '8', '10', '12', '16'],
  tube: ['2', '2.5', '3', '4', '5', '6', '8', '10'],
  structural: ['4.8', '6.4', '8.0', '9.5', '12.7'],
  spr: ['3.3', '5.3'],
  push: ['5', '6', '6.3', '8', '10'],
};
export const BLIND_SIZES = sized(RIVET_SIZE_LISTS.blind);
export const SOLID_SIZES = sized(RIVET_SIZE_LISTS.solid);
export const TUBE_SIZES = sized(RIVET_SIZE_LISTS.tube);
export const STRUCTURAL_SIZES = sized(RIVET_SIZE_LISTS.structural);
export const SPR_SIZES = sized(RIVET_SIZE_LISTS.spr);
export const PUSH_SIZES = sized(RIVET_SIZE_LISTS.push);

const BLIND_FOUR = ['3.2', '4.0', '4.8', '6.4'];
const M_NUT = ['M3', 'M4', 'M5', 'M6', 'M8', 'M10', 'M12'];
export const RIVET_TABLES = {
  // 1 ISO 15977 protruding (dome) head, ISO 15978 / DIN 7337 B 120°
  // countersunk, large flange (manufacturer); mandrel d1; default length and
  // the mid of its ISO 15977 grip range; mandrel protrusion as supplied.
  'blind-open': table(RIVET_SIZE_LISTS.blind, {
    domeDk: [4.8, 6, 6.5, 8, 9.5, 9.5, 12, 13],
    domeK: [0.8, 1, 1, 1.3, 1.5, 1.6, 2, 2.2],
    cskDk: [4.8, 6, 6, 7.5, 9, 9, 11, 12],
    cskK: [0.55, 0.9, 0.9, 1, 1.2, 1.2, 1.5, 1.6],
    lfDk: [7, 9, 9.5, 12, 16, 16, 18, 19],
    lfK: [1, 1.1, 1.2, 1.5, 1.9, 1.9, 2.3, 2.5],
    dm: [1.55, 2, 2, 2.45, 2.95, 2.95, 3.5, 3.9],
    l: [6, 8, 8, 10, 10, 10, 12, 12],
    g: [2, 4, 4, 5, 5, 5, 4.5, 4.5],
    ml: [27, 27, 27, 27, 27, 27, 30, 30],
  }),
  // 2 ISO 15973–15976 closed end: the heads and mandrel of blind-open.
  'blind-closed': table(BLIND_FOUR, { l: [8, 9.5, 11, 14], g: [2.5, 4, 4.5, 6] }),
  // 3–4 manufacturer-typical lengths and grips.
  'blind-multigrip': table(BLIND_FOUR, { l: [9.5, 11, 13, 16], g: [4, 4.5, 5, 7] }),
  'blind-peel': table(BLIND_FOUR, { l: [9, 12, 15, 18], g: [2, 3, 4, 5] }),
  // 5 Monobolt / Magna-Lok style lengths and grips.
  'blind-structural': table(['4.8', '6.4', '9.5', '12.7'], { l: [11, 14.5, 20, 26], g: [4, 5, 8, 10] }),
  // 6 drive / pin rivet tables.
  'blind-drive': table(BLIND_FOUR, { l: [6, 8, 10, 12], g: [2.5, 3, 4, 4.5] }),
  // 7 DIN 660 round, DIN 661 / 302 countersunk 90°, DIN 662 oval (raised
  // countersunk, dome w), DIN 674 flat round (pan); 10–16 from DIN 124 / 302
  // and IS 1929 (approximate); rule values where the DIN table has no row.
  solid: table(RIVET_SIZE_LISTS.solid, {
    roundDk: [1.8, 2.1, 2.8, 3.5, 4.4, 5.2, 6.2, 7, 8.8, 10.5, 14, 16, 19, 25],
    roundK: [0.6, 0.7, 1, 1.2, 1.5, 1.8, 2.1, 2.4, 3, 3.6, 4.8, 7, 8.4, 11],
    cskDk: [1.8, 2.1, 2.8, 3.5, 4.4, 5.2, 6.2, 7, 8.8, 10.5, 14, 16, 19, 25],
    cskK: [0.4, 0.45, 0.6, 0.75, 0.95, 1.1, 1.35, 1.5, 1.9, 2.25, 3, 3, 3.5, 4.5],
    ovalDk: [2, 2.4, 3.2, 4, 5, 6, 7, 8, 10, 12, 16, 20, 24, 32],
    ovalK: [0.5, 0.6, 0.8, 1, 1.2, 1.5, 1.8, 2.1, 2.5, 3, 4, 5, 6, 8],
    ovalW: [0.33, 0.4, 0.53, 0.67, 0.8, 1, 1.17, 1.4, 1.7, 2, 2.67, 3.33, 4, 5.33],
    panDk: [2.25, 2.7, 3.6, 4.5, 5.6, 6.8, 7.8, 9, 11.2, 13.5, 18, 22.5, 27, 36],
    panK: [0.5, 0.6, 0.8, 1, 1.3, 1.5, 1.8, 2, 2.5, 3, 4, 5, 6, 8],
  }),
  // 8 DIN 7338 flat head, tube bore d4 and depth t, default length.
  'semi-tubular': table(['3', '4', '5', '6', '8', '10'], {
    flatDk: [5.5, 7.5, 9.5, 11.5, 15.5, 18],
    flatK: [0.8, 1, 1, 1.2, 1.2, 1.4],
    bore: [1.7, 2.7, 3.5, 4.2, 6, 7.5],
    boreDepth: [3.5, 4, 4, 6, 8, 10],
    l: [6, 8, 10, 12, 16, 20],
  }),
  // 9 DIN 7340 default lengths.
  tubular: table(RIVET_SIZE_LISTS.tube, { l: [5, 6, 8, 10, 12, 15, 20, 25] }),
  // 11 Henrob / Böllhoff countersunk SPR heads and lengths.
  'self-piercing': table(RIVET_SIZE_LISTS.spr, { cskDk: [5.5, 7.75], cskK: [0.7, 1.05], l: [5, 6] }),
  // 12 PEM / Böllhoff blind rivet nuts (±1 mm between manufacturers).
  'blind-rivet-nut': table(M_NUT, {
    body: [5, 6, 7, 9, 11, 13, 16],
    flatDk: [7, 9, 10, 13, 16, 17, 20],
    flatK: [0.8, 1, 1, 1.5, 1.5, 1.5, 2],
    reducedDk: [6, 7, 8, 10, 12, 14, 17],
    reducedK: [0.5, 0.6, 0.6, 0.8, 1, 1, 1.2],
    cskDk: [6.5, 9, 10, 12, 14.5, 17, 20],
    cskK: [0.75, 1.5, 1.5, 1.5, 1.75, 2, 2],
    l: [9, 11, 12.5, 14.5, 17, 20, 24],
    g: [1, 1.5, 1.5, 2, 2.5, 3, 3.5],
  }),
  // 13 blind rivet studs.
  'blind-rivet-stud': table(['M4', 'M5', 'M6', 'M8'], {
    body: [6, 7, 9, 11],
    flatDk: [9, 10, 13, 16],
    flatK: [1, 1, 1.5, 1.5],
    reducedDk: [7, 8, 10, 12],
    reducedK: [0.6, 0.6, 0.8, 1],
    l: [8, 9, 11, 13],
    t: [10, 12, 16, 20],
    g: [1.5, 1.5, 2, 2.5],
  }),
  // 14 Huck C6L / Magna-Grip default grips.
  lockbolt: table(RIVET_SIZE_LISTS.structural, { g: [4, 6, 8, 10, 12] }),
};
