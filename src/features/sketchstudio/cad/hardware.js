import { positive, uid } from './model.js';
import {
  DRYWALL_THREADS,
  HEX_FLATS,
  LAG_THREADS,
  PHILLIPS_M,
  SCREW_TABLES,
  TAPPING_THREADS,
  TORX_A,
  TORX_A_BY_DIAMETER,
  WOOD_THREADS,
  round1,
  round2,
} from './hardwareCatalog.js';

// Conventional coarse cutting-tap drills. These are editable process choices,
// not form-tap drills or a promise of a particular thread engagement.
export const METRIC_THREADS = {
  M2: { diameter: 2, pitch: 0.4, drill: 1.6 },
  'M2.5': { diameter: 2.5, pitch: 0.45, drill: 2.05 },
  M3: { diameter: 3, pitch: 0.5, drill: 2.5 },
  M4: { diameter: 4, pitch: 0.7, drill: 3.3 },
  M5: { diameter: 5, pitch: 0.8, drill: 4.2 },
  M6: { diameter: 6, pitch: 1, drill: 5 },
  M8: { diameter: 8, pitch: 1.25, drill: 6.8 },
  M10: { diameter: 10, pitch: 1.5, drill: 8.5 },
  M12: { diameter: 12, pitch: 1.75, drill: 10.2 },
};

// ---------------------------------------------------------------- Phase N
// The screw library (docs/sketch-studio-screw-library.md): 22 screw kinds,
// each kind × head × drive × point in the one `hardware` feature.

const SOCKET_DRIVES = ['hex-socket', 'torx', 'pin-torx'];
const MACHINE_DRIVES = ['phillips', 'pozidriv', 'torx', 'slot', 'square', 'pin-torx', 'spanner', 'one-way'];
const TAPPING_DRIVES = ['phillips', 'pozidriv', 'torx', 'slot', 'square', 'pin-torx'];
const RECESS_DRIVES = ['phillips', 'pozidriv', 'torx', 'square'];
const kindOf = (label, standard, catalog, heads, drives, points, length, sizes) => ({
  label,
  standard,
  catalog,
  heads,
  drives,
  points,
  length,
  ...(sizes ? { sizes } : {}),
});
// length: the default (mm), or a rule of the thread diameter. drives: a list,
// or a list per head (self-drilling: none for the hex washer head).
export const SCREW_KINDS = {
  'socket-cap': kindOf(
    'Socket head cap screw',
    'ISO 4762 / DIN 912',
    'metric',
    ['socket-cap'],
    SOCKET_DRIVES,
    ['blunt'],
    20,
  ),
  'button-head': kindOf('Button head screw', 'ISO 7380-1', 'metric', ['button'], SOCKET_DRIVES, ['blunt'], 16),
  'countersunk-socket': kindOf(
    'Countersunk socket screw',
    'ISO 10642 / DIN 7991',
    'metric',
    ['countersunk'],
    SOCKET_DRIVES,
    ['blunt'],
    16,
  ),
  'pan-head': kindOf(
    'Pan head machine screw',
    'ISO 7045 / ISO 14583',
    'metric',
    ['pan'],
    MACHINE_DRIVES,
    ['blunt'],
    12,
  ),
  'countersunk-machine': kindOf(
    'Countersunk machine screw',
    'ISO 7046 / ISO 14581 / DIN 965',
    'metric',
    ['countersunk'],
    MACHINE_DRIVES,
    ['blunt'],
    12,
  ),
  'raised-countersunk': kindOf(
    'Raised countersunk (oval) machine screw',
    'ISO 7047 / DIN 966',
    'metric',
    ['raised-countersunk'],
    MACHINE_DRIVES,
    ['blunt'],
    12,
  ),
  'cheese-head': kindOf(
    'Cheese head screw',
    'ISO 1207 / DIN 84',
    'metric',
    ['cheese', 'fillister'],
    ['slot', 'phillips', 'pozidriv', 'torx'],
    ['blunt'],
    12,
  ),
  'truss-head': kindOf(
    'Truss (mushroom) head screw',
    'JIS B 1111 / ASME B18.6.7M',
    'metric',
    ['truss'],
    MACHINE_DRIVES,
    ['blunt'],
    12,
  ),
  'hex-flange': kindOf('Hex flange screw', 'DIN 6921 / EN 1665', 'metric', ['hex-flange'], ['none'], ['blunt'], 20),
  shoulder: kindOf('Shoulder screw', 'ISO 7379', 'metric', ['socket-cap'], ['hex-socket', 'torx'], ['blunt'], 20, [
    'M5',
    'M6',
    'M8',
    'M10',
    'M12',
  ]),
  'set-screw': kindOf(
    'Socket set screw (grub screw)',
    'ISO 4026–4029 / DIN 913–916',
    'metric',
    ['none'],
    ['hex-socket', 'torx', 'slot'],
    ['flat', 'cone', 'dog', 'cup'],
    (d) => Math.max(6, 2 * d),
  ),
  thumb: kindOf(
    'Knurled thumb screw',
    'DIN 464 / DIN 653',
    'metric',
    ['knurled-high', 'knurled-low'],
    ['none'],
    ['blunt'],
    16,
  ),
  wing: kindOf('Wing screw', 'DIN 316', 'metric', ['wing'], ['none'], ['blunt'], 20),
  'eye-bolt': kindOf('Eye bolt', 'DIN 444', 'metric', ['eye'], ['none'], ['blunt'], 30),
  carriage: kindOf(
    'Carriage bolt (mushroom head, square neck)',
    'DIN 603',
    'metric',
    ['mushroom'],
    ['none'],
    ['blunt'],
    40,
  ),
  'tapping-pan': kindOf(
    'Pan head tapping screw',
    'ISO 7049 / DIN 7981',
    'tapping',
    ['pan'],
    TAPPING_DRIVES,
    ['sharp'],
    16,
  ),
  'tapping-countersunk': kindOf(
    'Countersunk tapping screw',
    'ISO 7050 / DIN 7982',
    'tapping',
    ['countersunk', 'raised-countersunk'],
    TAPPING_DRIVES,
    ['sharp'],
    16,
  ),
  'self-drilling': kindOf(
    'Self-drilling screw',
    'DIN 7504 / ISO 15480–15482',
    'tapping',
    ['hex-washer', 'pan', 'countersunk'],
    { 'hex-washer': ['none'], pan: RECESS_DRIVES, countersunk: RECESS_DRIVES },
    ['drill'],
    19,
    ['ST3.5', 'ST4.2', 'ST4.8', 'ST5.5', 'ST6.3'],
  ),
  wood: kindOf(
    'Wood screw',
    'DIN 7997 / DIN 7995 / DIN 7996',
    'wood',
    ['countersunk', 'raised-countersunk', 'round'],
    ['pozidriv', 'phillips', 'torx', 'slot', 'square'],
    ['sharp'],
    40,
  ),
  chipboard: kindOf(
    'Chipboard screw',
    'DIN 7505',
    'wood',
    ['countersunk', 'raised-countersunk', 'pan'],
    ['torx', 'pozidriv', 'phillips', 'square'],
    ['sharp'],
    40,
  ),
  drywall: kindOf('Drywall screw', 'DIN 18182-2', 'drywall', ['bugle'], ['phillips', 'square', 'torx'], ['sharp'], 25),
  lag: kindOf('Lag / coach screw', 'DIN 571', 'lag', ['hex', 'hex-washer'], ['none'], ['sharp'], 60),
};

export const HARDWARE_TYPES = {
  bolt: 'Hex bolt',
  nut: 'Hex nut',
  washer: 'Washer',
  standoff: 'Threaded standoff',
  'clinch-nut': 'Self-clinching nut (PEM style)',
  'clinch-standoff': 'Self-clinching standoff (PEM style)',
  stud: 'Self-clinching stud (PEM style)',
  'rivet-nut': 'Rivet nut',
  insert: 'Threaded insert',
  ...Object.fromEntries(Object.entries(SCREW_KINDS).map(([key, kind]) => [key, kind.label])),
};

// The panel's <optgroup>s (spec §3), the nine Phase J kinds first.
export const HARDWARE_GROUPS = [
  {
    label: 'Bolts, nuts & spacers',
    kinds: ['bolt', 'nut', 'washer', 'standoff', 'clinch-nut', 'clinch-standoff', 'stud', 'rivet-nut', 'insert'],
  },
  {
    label: 'Machine screws',
    kinds: ['pan-head', 'countersunk-machine', 'raised-countersunk', 'cheese-head', 'truss-head', 'hex-flange'],
  },
  { label: 'Socket screws', kinds: ['socket-cap', 'button-head', 'countersunk-socket', 'shoulder', 'set-screw'] },
  { label: 'Tapping & self-drilling', kinds: ['tapping-pan', 'tapping-countersunk', 'self-drilling'] },
  { label: 'Wood & construction', kinds: ['wood', 'chipboard', 'drywall', 'lag'] },
  { label: 'Special', kinds: ['thumb', 'wing', 'eye-bolt', 'carriage'] },
];

// Head styles (spec §4.1). flush: the top rim sits on the seating plane and
// the cone runs below it. The solids are built in screwGeometry.js.
export const HEAD_STYLES = {
  hex: { label: 'Hexagon', flush: false },
  'hex-flange': { label: 'Hexagon with flange', flush: false },
  'hex-washer': { label: 'Hexagon washer head', flush: false },
  'socket-cap': { label: 'Cylindrical (socket cap)', flush: false },
  cheese: { label: 'Cheese (flat cylinder)', flush: false },
  fillister: { label: 'Fillister (domed cylinder)', flush: false },
  pan: { label: 'Pan', flush: false },
  button: { label: 'Button (dome)', flush: false },
  truss: { label: 'Truss (wide low dome)', flush: false },
  round: { label: 'Round (half dome)', flush: false },
  mushroom: { label: 'Mushroom (carriage)', flush: false },
  countersunk: { label: 'Countersunk (flat, 90°)', flush: true },
  'raised-countersunk': { label: 'Raised countersunk (oval)', flush: true },
  bugle: { label: 'Bugle (drywall)', flush: true },
  'knurled-high': { label: 'Knurled, high (DIN 464)', flush: false },
  'knurled-low': { label: 'Knurled, low (DIN 653)', flush: false },
  wing: { label: 'Wing', flush: false },
  eye: { label: 'Eye (ring)', flush: false },
  none: { label: 'No head', flush: false },
};
// Drives (spec §4.2); the recess cuts are in screwGeometry.js.
export const DRIVES = {
  none: { label: 'None (external)' },
  slot: { label: 'Slotted' },
  phillips: { label: 'Phillips (cross)' },
  pozidriv: { label: 'Pozidriv' },
  torx: { label: 'Torx (hexalobular)' },
  'pin-torx': { label: 'Security Torx (pin)' },
  'hex-socket': { label: 'Hex socket' },
  square: { label: 'Square (Robertson)' },
  spanner: { label: 'Spanner (two holes)' },
  'one-way': { label: 'One-way (slot)' },
};
// Points (spec §4.3).
export const POINTS = {
  blunt: { label: 'Blunt' },
  sharp: { label: 'Sharp (gimlet)' },
  drill: { label: 'Drill point' },
  flat: { label: 'Flat (ISO 4026)' },
  cone: { label: 'Cone (ISO 4027)' },
  dog: { label: 'Dog (ISO 4028)' },
  cup: { label: 'Cup (ISO 4029)' },
};

// Sizes (spec §5).
export const SIZE_CATALOGS = {
  metric: METRIC_THREADS,
  tapping: TAPPING_THREADS,
  wood: WOOD_THREADS,
  drywall: DRYWALL_THREADS,
  lag: LAG_THREADS,
};
const DEFAULT_SIZES = { metric: 'M6', tapping: 'ST4.2', wood: '4.0', drywall: '3.5', lag: '8' };
export const catalogOf = (kind) => SCREW_KINDS[kind]?.catalog || 'metric';
export const sizesFor = (kind) => SCREW_KINDS[kind]?.sizes || Object.keys(SIZE_CATALOGS[catalogOf(kind)]);
export const headsFor = (kind) => SCREW_KINDS[kind]?.heads || [];
export const pointsFor = (kind) => SCREW_KINDS[kind]?.points || [];
export function drivesFor(kind, head) {
  const drives = SCREW_KINDS[kind]?.drives;
  if (!drives) return [];
  return Array.isArray(drives) ? drives : drives[head] || drives[headsFor(kind)[0]];
}
// The nine Phase J kinds keep M3, so hardwareDefaults() is unchanged.
export const defaultSize = (kind) => (SCREW_KINDS[kind] ? DEFAULT_SIZES[catalogOf(kind)] : 'M3');
const validSize = (kind, size) => (sizesFor(kind).includes(size) ? size : defaultSize(kind));
export function threadFor(kind, size) {
  const { diameter, pitch } = SIZE_CATALOGS[catalogOf(kind)][validSize(kind, size)];
  return { diameter, pitch };
}
const allowed = (list, value) => (list.includes(value) ? value : list[0]);

// The standard's row for a size, else the kind's proportional rule
// (rounded to 2 dp) flagged estimated.
function row(kind, size, d, rule) {
  const found = SCREW_TABLES[kind]?.[size];
  if (found) return { ...found, estimated: false };
  return { ...Object.fromEntries(Object.entries(rule(d)).map(([k, v]) => [k, round2(v)])), estimated: true };
}

// The head / body numbers of one kind, size and head (spec §3.1–3.3).
// socket: the hex key across flats of a socket kind.
function shapeFor(kind, size, head, point, d) {
  const plain = (r, extra = {}) => ({ headDiameter: r.dk, headHeight: r.k, estimated: r.estimated, ...extra });
  switch (kind) {
    case 'socket-cap': {
      const r = row(kind, size, d, (d) => ({ dk: 1.5 * d, k: d, s: round1(0.5 * d) }));
      return plain(r, { socket: r.s });
    }
    case 'button-head': {
      const r = row(kind, size, d, (d) => ({ dk: 1.9 * d, k: 0.55 * d, s: 0.65 * d }));
      return plain(r, { socket: r.s });
    }
    case 'countersunk-socket': {
      const r = row(kind, size, d, (d) => ({ dk: 2.24 * d, k: 0.62 * d, s: 0.65 * d }));
      return plain(r, { socket: r.s });
    }
    case 'pan-head':
      return plain(row(kind, size, d, (d) => ({ dk: 2 * d, k: 0.75 * d })));
    case 'countersunk-machine':
      return plain(row(kind, size, d, (d) => ({ dk: 1.85 * d, k: 0.5 * d })));
    case 'raised-countersunk': {
      const r = row(kind, size, d, (d) => ({ dk: 1.85 * d, k: 0.5 * d, f: 0.23 * d }));
      return plain(r, { domeHeight: r.f });
    }
    case 'cheese-head': {
      const r = row(kind, size, d, (d) => ({ dk: 1.5 * d, k: 0.6 * d }));
      return plain(r, head === 'fillister' ? { domeHeight: round2(0.15 * d) } : {});
    }
    case 'truss-head':
      return plain(row(kind, size, d, (d) => ({ dk: 2.3 * d, k: 0.62 * d })));
    case 'hex-flange': {
      const r = row(kind, size, d, (d) => ({ s: HEX_FLATS[size] ?? 1.6 * d, dc: 2.3 * d, k: d }));
      return { headDiameter: r.dc, headHeight: r.k, bodyDiameter: r.s, estimated: r.estimated };
    }
    case 'shoulder': {
      const r = row(kind, size, d, (d) => ({ ds: 1.3 * d, dk: 2 * d, k: 0.9 * d, s: 0.65 * d, t: 2 * d }));
      return plain(r, { bodyDiameter: r.ds, threadLength: r.t, socket: r.s });
    }
    case 'set-screw': {
      const r = row(kind, size, d, (d) => ({ s: 0.5 * d, dp: 0.65 * d, dz: 0.5 * d, z: 0.6 * d }));
      // No head: the head fields stay at the thread diameter / 0, unused.
      return {
        headDiameter: d,
        headHeight: 0,
        bodyDiameter: point === 'cup' ? r.dz : r.dp,
        neckHeight: r.z,
        socket: r.s,
        estimated: r.estimated,
      };
    }
    case 'thumb': {
      const r = row(kind, size, d, (d) => ({ dk: 4 * d, k: 0.8 * d, ds: 2 * d, h: 2.5 * d }));
      return plain(r, { bodyDiameter: r.ds, collarHeight: head === 'knurled-low' ? 0 : round2(r.h - r.k) });
    }
    case 'wing': {
      const r = row(kind, size, d, (d) => ({
        e: 4.5 * d,
        h: 2.2 * d,
        d2: 1.6 * d,
        d3: 1.4 * d,
        g2: 0.45 * d,
        a: 0.5 * d,
      }));
      return {
        headDiameter: r.e,
        headHeight: r.h,
        bodyDiameter: r.d2,
        wingThickness: r.g2,
        estimated: r.estimated,
      };
    }
    case 'eye-bolt': {
      const r = row(kind, size, d, (d) => ({ d2: 2.3 * d, d1: d, s: 1.15 * d }));
      return { headDiameter: r.d2, headHeight: r.s, boreDiameter: r.d1, estimated: r.estimated };
    }
    case 'carriage': {
      const r = row(kind, size, d, (d) => ({ dk: 2.6 * d, k: 0.55 * d, v: d, f: 0.65 * d }));
      return plain(r, { bodyDiameter: r.v, neckHeight: r.f });
    }
    case 'tapping-pan':
      return plain(row(kind, size, d, (d) => ({ dk: 1.95 * d, k: 0.75 * d })));
    case 'tapping-countersunk': {
      const r = row(kind, size, d, (d) => ({ dk: 1.95 * d, k: 0.6 * d }));
      return plain(r, head === 'raised-countersunk' ? { domeHeight: round2(0.23 * d) } : {});
    }
    case 'self-drilling': {
      const r = row(kind, size, d, (d) => ({
        s: 1.6 * d,
        dc: 2.2 * d,
        k: 0.9 * d,
        panDk: 2 * d,
        panK: 0.75 * d,
        cskDk: 2 * d,
        cskK: 0.6 * d,
        dp: 0.85 * d,
      }));
      const common = { pointDiameter: r.dp, estimated: r.estimated };
      if (head === 'pan') return { headDiameter: r.panDk, headHeight: r.panK, ...common };
      if (head === 'countersunk') return { headDiameter: r.cskDk, headHeight: r.cskK, ...common };
      return { headDiameter: r.dc, headHeight: r.k, bodyDiameter: r.s, ...common };
    }
    case 'wood': {
      const r = row(kind, size, d, (d) => ({ dk: 1.85 * d, k: 0.55 * d }));
      if (head === 'round') return plain({ ...r, k: round2(0.65 * d) });
      return plain(r, head === 'raised-countersunk' ? { domeHeight: round2(0.23 * d) } : {});
    }
    case 'chipboard': {
      const r = row(kind, size, d, (d) => ({ dk: 2 * d, k: 0.6 * d, panDk: 2 * d, panK: 0.7 * d }));
      if (head === 'pan') return plain({ dk: r.panDk, k: r.panK, estimated: r.estimated });
      return plain(r, head === 'raised-countersunk' ? { domeHeight: round2(0.2 * d) } : {});
    }
    case 'drywall':
      return plain(row(kind, size, d, (d) => ({ dk: 2.2 * d, k: 0.6 * d })));
    case 'lag': {
      const r = row(kind, size, d, (d) => ({ s: 1.6 * d, k: 0.7 * d }));
      return { headDiameter: r.s, headHeight: r.k, estimated: r.estimated };
    }
    default:
      throw new Error('Choose a hardware type.');
  }
}

function torxFor(kind, size, d) {
  if (catalogOf(kind) === 'metric' && TORX_A[size]) return TORX_A[size];
  let best = TORX_A_BY_DIAMETER[0];
  for (const entry of TORX_A_BY_DIAMETER) if (Math.abs(entry[0] - d) < Math.abs(best[0] - d)) best = entry;
  return best[1];
}
// The default drive size (spec §4.2): across flats (hex socket, square),
// point to point (Torx), recess span (cross), slot width, hole pitch (spanner).
function driveSizeFor(drive, kind, size, d, dk, socket) {
  switch (drive) {
    case 'hex-socket':
      return socket ?? round1(0.5 * d);
    case 'phillips':
    case 'pozidriv':
      return catalogOf(kind) === 'metric' && PHILLIPS_M[size] ? PHILLIPS_M[size] : round1(0.6 * dk);
    case 'torx':
    case 'pin-torx':
      return torxFor(kind, size, d);
    case 'slot':
    case 'one-way':
      return Math.max(0.6, round1(0.2 * d));
    case 'square':
      return round1(0.55 * d);
    case 'spanner':
      return round1(0.5 * dk);
    default:
      return undefined;
  }
}

// Every derived field of a screw kind for one size and head / drive / point
// choice (invalid choices fall back to the kind's defaults).
function screwDefaults(kind, size, choice = {}) {
  const spec = SCREW_KINDS[kind];
  const at = validSize(kind, size);
  const { diameter, pitch } = threadFor(kind, at);
  const head = allowed(spec.heads, choice.head);
  const point = allowed(spec.points, choice.point);
  // drive 'none' is accepted on every kind (spec §4.2: no recess, a cheap model).
  const drive = choice.drive === 'none' ? 'none' : allowed(drivesFor(kind, head), choice.drive);
  const { socket, estimated, ...shape } = shapeFor(kind, at, head, point, diameter);
  const fields = {
    kind,
    size: at,
    pitch,
    diameter,
    length: round2(typeof spec.length === 'function' ? spec.length(diameter) : spec.length),
    bodyDiameter: diameter,
    headDiameter: shape.headDiameter,
    headHeight: shape.headHeight,
    boreDiameter: diameter,
    ...shape,
    head,
    drive,
    point,
  };
  const driveSize = driveSizeFor(drive, kind, at, diameter, shape.headDiameter, socket);
  if (driveSize !== undefined) fields.driveSize = round2(driveSize);
  return { fields, estimated };
}

// A hardware feature with every optional Phase N field filled: the single
// place old saves (no head / drive / point) get the kind defaults. The nine
// Phase J kinds come back unchanged. `estimated`: the size lies outside the
// standard's table (derived, never persisted).
export function resolveHardware(feature) {
  if (!SCREW_KINDS[feature?.kind]) return feature;
  const { fields, estimated } = screwDefaults(feature.kind, feature.size, feature);
  const defined = Object.fromEntries(Object.entries(feature).filter(([, v]) => v !== undefined && v !== null));
  return { ...fields, ...defined, head: fields.head, drive: fields.drive, point: fields.point, estimated };
}

// The keys a changed head re-derives (spec §7).
const HEAD_KEYS = ['headDiameter', 'headHeight', 'domeHeight', 'collarHeight', 'driveSize'];
const assign = (target, source, keys) => {
  for (const key of keys) {
    if (source[key] === undefined) delete target[key];
    else target[key] = source[key];
  }
  return target;
};
// A new head style: head sizes, dome, drive size (and the drive when the
// new head does not offer it) from the standard; length, material, supplier
// fields and notes kept.
export function withHead(feature, head) {
  if (!SCREW_KINDS[feature.kind]) return feature;
  const r = resolveHardware(feature);
  // The drive is kept when the new head offers it (self-drilling: the hex
  // washer head's 'none' becomes the pan head's Phillips).
  const drive = drivesFor(feature.kind, head).includes(r.drive) ? r.drive : undefined;
  const { fields } = screwDefaults(feature.kind, r.size, { head, drive, point: r.point });
  const next = assign({ ...feature, head: fields.head, drive: fields.drive }, fields, HEAD_KEYS);
  if (feature.kind === 'self-drilling') next.bodyDiameter = fields.bodyDiameter;
  return next;
}
// A new drive: only its size is re-derived.
export function withDrive(feature, drive) {
  if (!SCREW_KINDS[feature.kind]) return feature;
  const r = resolveHardware(feature);
  const { fields } = screwDefaults(feature.kind, r.size, { head: r.head, drive, point: r.point });
  return assign({ ...feature, drive: fields.drive }, fields, ['driveSize']);
}
// A new set-screw point: the point diameter and dog length re-derived.
export function withPoint(feature, point) {
  if (!SCREW_KINDS[feature.kind]) return feature;
  const r = resolveHardware(feature);
  const { fields } = screwDefaults(feature.kind, r.size, { head: r.head, drive: r.drive, point });
  return assign({ ...feature, point: fields.point }, fields, ['bodyDiameter', 'neckHeight']);
}

// The numeric fields a screw uses, in panel order (spec §7).
const SCREW_FIELD_ORDER = [
  'length',
  'diameter',
  'headDiameter',
  'headHeight',
  'bodyDiameter',
  'boreDiameter',
  'driveSize',
  'domeHeight',
  'threadLength',
  'neckHeight',
  'collarHeight',
  'wingThickness',
  'pointDiameter',
  'pitch',
];
function usesBody(r) {
  return (
    ['shoulder', 'carriage', 'wing'].includes(r.kind) ||
    ['knurled-high', 'hex-flange'].includes(r.head) ||
    (r.kind === 'self-drilling' && r.head === 'hex-washer') ||
    (r.kind === 'set-screw' && r.point !== 'cone')
  );
}
function screwUses(r) {
  const used = new Set(['length', 'diameter', 'pitch']);
  if (r.head !== 'none') used.add('headDiameter').add('headHeight');
  if (usesBody(r)) used.add('bodyDiameter');
  if (r.kind === 'eye-bolt') used.add('boreDiameter');
  if (r.drive !== 'none') used.add('driveSize');
  if (['raised-countersunk', 'fillister'].includes(r.head)) used.add('domeHeight');
  if (r.kind === 'shoulder') used.add('threadLength');
  if (r.kind === 'carriage' || (r.kind === 'set-screw' && r.point === 'dog')) used.add('neckHeight');
  if (r.head === 'knurled-high') used.add('collarHeight');
  if (r.kind === 'wing') used.add('wingThickness');
  if (r.point === 'drill') used.add('pointDiameter');
  return SCREW_FIELD_ORDER.filter((key) => used.has(key));
}
const isFlush = (head) => Boolean(HEAD_STYLES[head]?.flush);
// The width across the head top a drive recess must fit inside.
function topWidth(r, v) {
  if (r.head === 'none') return v.diameter;
  if (r.head === 'hex-flange' || (r.kind === 'self-drilling' && r.head === 'hex-washer')) return v.bodyDiameter;
  return v.headDiameter;
}

function screwDimensions(feature, parameters) {
  const r = resolveHardware(feature);
  const used = screwUses(r);
  const values = {
    headDiameter: undefined,
    headHeight: 0,
    bodyDiameter: undefined,
    boreDiameter: undefined,
    ...Object.fromEntries(used.map((key) => [key, positive(r[key], parameters, key)])),
  };
  // Unused fields: the thread diameter (rings and ghosts stay right).
  for (const key of ['headDiameter', 'bodyDiameter', 'boreDiameter']) values[key] ??= values.diameter;
  const v = values;
  if (r.head !== 'none' && v.headDiameter <= v.diameter) throw new Error('The head must be wider than the shank.');
  if (topWidth(r, v) <= v.diameter && r.head !== 'none') throw new Error('The head must be wider than the shank.');
  if (isFlush(r.head) && v.headHeight >= v.length) throw new Error('The head must be shorter than the screw.');
  if (r.kind === 'shoulder' && v.bodyDiameter <= v.diameter)
    throw new Error('The shoulder must be wider than the thread.');
  if (r.kind === 'set-screw' && r.point !== 'cone' && v.bodyDiameter >= v.diameter)
    throw new Error('The point must be narrower than the thread.');
  if (r.point === 'drill' && v.pointDiameter >= v.diameter)
    throw new Error('The point must be narrower than the thread.');
  if (
    (r.point === 'dog' && v.neckHeight >= v.length) ||
    (r.point === 'drill' && 1.6 * v.pointDiameter >= v.length - (isFlush(r.head) ? v.headHeight : 0))
  )
    throw new Error('The point must be shorter than the screw.');
  if (r.kind === 'eye-bolt' && v.boreDiameter >= v.headDiameter)
    throw new Error('The eye bore must be smaller than the eye.');
  if (r.kind === 'wing' && v.headDiameter <= v.bodyDiameter)
    throw new Error('The wings must span wider than the collar.');
  if (r.head === 'knurled-high' && v.headDiameter <= v.bodyDiameter)
    throw new Error('The knurled head must be wider than the shoulder.');
  if (r.kind === 'carriage' && v.bodyDiameter < v.diameter)
    throw new Error('The square neck must be at least as wide as the thread.');
  if (r.drive !== 'none' && v.driveSize >= topWidth(r, v)) throw new Error('The drive must fit inside the head.');
  return { ...values, kind: r.kind, head: r.head, drive: r.drive, point: r.point };
}

export function holePreset(feature, mode, size = 'M3') {
  if (mode === 'plain') return { ...feature, holeSpec: undefined };
  const thread = METRIC_THREADS[size];
  if (!thread) throw new Error('Choose a metric thread size.');
  return {
    ...feature,
    diameter:
      mode === 'tap'
        ? thread.drill
        : +(thread.diameter + (thread.diameter <= 4 ? 0.4 : thread.diameter <= 8 ? 0.6 : 1)).toFixed(2),
    holeSpec: { mode, size, pitch: thread.pitch },
  };
}
export function threadNote(feature) {
  const spec = feature.holeSpec;
  return spec
    ? `${spec.mode === 'tap' ? 'TAP' : 'CLEARANCE FOR'} ${spec.size} × ${spec.pitch}${spec.mode === 'tap' ? ' — schematic bore; threads not modeled' : ''}`
    : '';
}
// A size outside the kind's catalog falls back to the kind's default size
// (Phase N §5) instead of throwing. Derived numbers are rounded to 2 dp.
export function hardwareDefaults(kind = 'bolt', size) {
  const at = validSize(kind, size);
  if (SCREW_KINDS[kind]) {
    return {
      id: uid('hardware'),
      type: 'hardware',
      ...screwDefaults(kind, at).fields,
      material: 'Steel',
      supplierCode: '',
      installationHole: '',
      minimumSheet: '',
      notes: '',
    };
  }
  const { diameter, pitch } = METRIC_THREADS[at];
  return {
    id: uid('hardware'),
    type: 'hardware',
    kind,
    size: at,
    pitch,
    diameter,
    length: kind === 'washer' ? 1 : kind.includes('nut') ? diameter : 12,
    bodyDiameter: round2(diameter * 2),
    headDiameter: round2(diameter * 2.3),
    headHeight: round2(diameter * 0.6),
    boreDiameter: round2(kind === 'washer' ? diameter + 0.4 : diameter),
    material: 'Steel',
    supplierCode: '',
    installationHole: '',
    minimumSheet: '',
    notes: '',
  };
}
export function hardwareDimensions(feature, parameters = {}) {
  if (!HARDWARE_TYPES[feature.kind]) throw new Error('Choose a hardware type.');
  if (SCREW_KINDS[feature.kind]) return screwDimensions(feature, parameters);
  const values = Object.fromEntries(
    ['diameter', 'pitch', 'length', 'bodyDiameter', 'headDiameter', 'headHeight', 'boreDiameter'].map((key) => [
      key,
      positive(feature[key], parameters, key),
    ]),
  );
  if (!['bolt', 'stud'].includes(feature.kind) && values.boreDiameter >= values.bodyDiameter)
    throw new Error('The bore must be smaller than the hardware body.');
  if (['bolt', 'stud'].includes(feature.kind) && values.headDiameter <= values.diameter)
    throw new Error('The head must be wider than the shank.');
  if (
    ['clinch-nut', 'clinch-standoff', 'rivet-nut'].includes(feature.kind) &&
    values.headDiameter < values.bodyDiameter
  )
    throw new Error('The flange must be at least as wide as the body.');
  return values;
}

// The ordered [key, label] fields the panel shows for a feature (spec §7);
// the nine Phase J kinds keep their labels and order.
export function hardwareFieldLabels(feature) {
  const supplier = [
    ['supplierCode', 'Supplier part number'],
    ['installationHole', 'Supplier installation hole (mm)'],
    ['minimumSheet', 'Supplier minimum sheet thickness (mm)'],
    ['notes', 'Installation / finish notes'],
  ];
  if (!SCREW_KINDS[feature.kind]) {
    const shank = ['bolt', 'stud'].includes(feature.kind);
    return Object.entries({
      length: shank ? 'Shank length (mm)' : 'Body length / thickness (mm)',
      ...(shank
        ? { diameter: 'Shank diameter (mm)' }
        : {
            bodyDiameter: ['nut', 'standoff'].includes(feature.kind) ? 'Body across flats (mm)' : 'Body diameter (mm)',
            boreDiameter: 'Bore diameter (mm)',
          }),
      ...(!['nut', 'washer', 'standoff', 'insert'].includes(feature.kind)
        ? {
            headDiameter: feature.kind === 'bolt' ? 'Head across flats (mm)' : 'Flange diameter (mm)',
            headHeight: 'Head / flange height (mm)',
          }
        : {}),
      ...(feature.kind !== 'washer' ? { pitch: 'Thread pitch (mm)' } : {}),
      ...Object.fromEntries(supplier),
    });
  }
  const r = resolveHardware(feature);
  const { kind, head } = r;
  const label = {
    length:
      kind === 'shoulder'
        ? 'Shoulder length (mm)'
        : isFlush(head) || kind === 'set-screw'
          ? 'Overall length (mm)'
          : 'Shank length (mm)',
    diameter: 'Thread diameter (mm)',
    headDiameter:
      head === 'hex' || kind === 'lag'
        ? 'Head across flats (mm)'
        : head === 'hex-flange'
          ? 'Flange diameter (mm)'
          : head === 'hex-washer'
            ? 'Washer diameter (mm)'
            : head === 'wing'
              ? 'Wing span (mm)'
              : head === 'eye'
                ? 'Eye outer diameter (mm)'
                : 'Head diameter (mm)',
    headHeight:
      head === 'wing'
        ? 'Wing height (mm)'
        : head === 'eye'
          ? 'Eye thickness (mm)'
          : kind === 'thumb'
            ? 'Knurl height (mm)'
            : 'Head height (mm)',
    bodyDiameter:
      head === 'hex-flange' || head === 'hex-washer'
        ? 'Hex across flats (mm)'
        : kind === 'carriage'
          ? 'Square neck (mm)'
          : kind === 'wing'
            ? 'Collar diameter (mm)'
            : kind === 'set-screw'
              ? 'Point diameter (mm)'
              : 'Shoulder diameter (mm)',
    boreDiameter: 'Eye bore (mm)',
    driveSize: 'Drive size (mm)',
    domeHeight: 'Dome height (mm)',
    threadLength: 'Thread length (mm)',
    neckHeight: kind === 'set-screw' ? 'Dog length (mm)' : 'Neck height (mm)',
    collarHeight: 'Shoulder height (mm)',
    wingThickness: 'Wing thickness (mm)',
    pointDiameter: 'Drill point diameter (mm)',
    pitch: 'Thread pitch (mm)',
  };
  return [...screwUses(r).map((key) => [key, label[key]]), ...supplier];
}

const shown = (value) => (typeof value === 'number' ? String(round2(value)) : String(value));
// "Hexagon washer head" + " head", "Drill point" + " point": never the word twice.
const suffixed = (label, word) => (label.endsWith(word) ? label : `${label} ${word}`);
function screwNote(f) {
  const r = resolveHardware(f);
  const spec = SCREW_KINDS[r.kind];
  return [
    `${spec.label} ${spec.standard}`,
    `${r.size} × ${shown(r.pitch)} × ${shown(r.length)} mm`,
    spec.heads.length > 1 ? suffixed(HEAD_STYLES[r.head].label, 'head') : '',
    r.drive !== 'none' ? `${DRIVES[r.drive].label} ${shown(r.driveSize)}` : '',
    ['set-screw', 'self-drilling'].includes(r.kind) ? suffixed(POINTS[r.point].label, 'point') : '',
    r.estimated ? `sizes outside ${spec.standard} estimated` : '',
    'simplified envelope, no helical threads, schematic drive recess',
  ]
    .filter(Boolean)
    .join('; ');
}
export function hardwareNote(f) {
  if (SCREW_KINDS[f.kind])
    return `${screwNote(f)}${f.supplierCode ? `; Supplier: ${f.supplierCode}` : ''}${f.installationHole ? `; Installation hole Ø${f.installationHole} mm` : ''}${f.minimumSheet ? `; Minimum sheet ${f.minimumSheet} mm` : ''}${f.notes ? `; ${f.notes}` : ''}`;
  return `${HARDWARE_TYPES[f.kind]}; ${f.kind === 'washer' ? `${f.size} clearance` : `${f.size} × ${f.pitch}`}; simplified envelope, no helical threads or clinching teeth${f.supplierCode ? `; Supplier: ${f.supplierCode}` : ''}${f.installationHole ? `; Installation hole Ø${f.installationHole} mm` : ''}${f.minimumSheet ? `; Minimum sheet ${f.minimumSheet} mm` : ''}${f.notes ? `; ${f.notes}` : ''}`;
}
export function createHardware(feature) {
  hardwareDimensions(feature);
  const part = {
    id: uid('part'),
    name: `${HARDWARE_TYPES[feature.kind]} ${feature.size}`,
    material: feature.material,
    features: [feature],
  };
  return {
    part,
    instance: { id: uid('instance'), partId: part.id, position: [0, 0, 0], rotation: [0, 0, 0], visible: true },
  };
}
