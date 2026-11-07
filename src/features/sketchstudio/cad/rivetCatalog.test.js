// Phase O (docs/sketch-studio-rivet-library.md §10): the rivet catalog and
// rules, pure (no OpenCascade).
import { describe, expect, it } from 'vitest';
import {
  BODIES,
  HARDWARE_GROUPS,
  HARDWARE_TYPES,
  HEAD_STYLES,
  METRIC_THREADS,
  RIVET_KINDS,
  SIZE_CATALOGS,
  STATES,
  catalogOf,
  createHardware,
  defaultSize,
  drivesFor,
  hardwareDefaults,
  hardwareDimensions,
  hardwareFieldLabels,
  hardwareMaterial,
  hardwareNote,
  headsFor,
  pointsFor,
  resolveHardware,
  sizesFor,
  threadFor,
  withBody,
  withDrive,
  withHead,
  withPoint,
  withState,
} from './hardware.js';
import { hardwareName, hardwareRadius } from './placementHardware.js';
import { placeClick, placementView } from './placementTool.js';
import { face, placeDraft, world } from './placementCuts.fixtures.js';

// The 31 kinds before Phase O, literally: labels and default-size BOM notes.
const OLD_TYPES = {
  bolt: 'Hex bolt',
  nut: 'Hex nut',
  washer: 'Washer',
  standoff: 'Threaded standoff',
  'clinch-nut': 'Self-clinching nut (PEM style)',
  'clinch-standoff': 'Self-clinching standoff (PEM style)',
  stud: 'Self-clinching stud (PEM style)',
  'rivet-nut': 'Rivet nut',
  insert: 'Threaded insert',
  'socket-cap': 'Socket head cap screw',
  'button-head': 'Button head screw',
  'countersunk-socket': 'Countersunk socket screw',
  'pan-head': 'Pan head machine screw',
  'countersunk-machine': 'Countersunk machine screw',
  'raised-countersunk': 'Raised countersunk (oval) machine screw',
  'cheese-head': 'Cheese head screw',
  'truss-head': 'Truss (mushroom) head screw',
  'hex-flange': 'Hex flange screw',
  shoulder: 'Shoulder screw',
  'set-screw': 'Socket set screw (grub screw)',
  thumb: 'Knurled thumb screw',
  wing: 'Wing screw',
  'eye-bolt': 'Eye bolt',
  carriage: 'Carriage bolt (mushroom head, square neck)',
  'tapping-pan': 'Pan head tapping screw',
  'tapping-countersunk': 'Countersunk tapping screw',
  'self-drilling': 'Self-drilling screw',
  wood: 'Wood screw',
  chipboard: 'Chipboard screw',
  drywall: 'Drywall screw',
  lag: 'Lag / coach screw',
};
const OLD_NOTES = {
  bolt: 'Hex bolt; M3 × 0.5; simplified envelope, no helical threads or clinching teeth',
  nut: 'Hex nut; M3 × 0.5; simplified envelope, no helical threads or clinching teeth',
  washer: 'Washer; M3 clearance; simplified envelope, no helical threads or clinching teeth',
  standoff: 'Threaded standoff; M3 × 0.5; simplified envelope, no helical threads or clinching teeth',
  'clinch-nut': 'Self-clinching nut (PEM style); M3 × 0.5; simplified envelope, no helical threads or clinching teeth',
  'clinch-standoff':
    'Self-clinching standoff (PEM style); M3 × 0.5; simplified envelope, no helical threads or clinching teeth',
  stud: 'Self-clinching stud (PEM style); M3 × 0.5; simplified envelope, no helical threads or clinching teeth',
  'rivet-nut': 'Rivet nut; M3 × 0.5; simplified envelope, no helical threads or clinching teeth',
  insert: 'Threaded insert; M3 × 0.5; simplified envelope, no helical threads or clinching teeth',
  'socket-cap':
    'Socket head cap screw ISO 4762 / DIN 912; M6 × 1 × 20 mm; Hex socket 5; simplified envelope, no helical threads, schematic drive recess',
  'button-head':
    'Button head screw ISO 7380-1; M6 × 1 × 16 mm; Hex socket 4; simplified envelope, no helical threads, schematic drive recess',
  'countersunk-socket':
    'Countersunk socket screw ISO 10642 / DIN 7991; M6 × 1 × 16 mm; Hex socket 4; simplified envelope, no helical threads, schematic drive recess',
  'pan-head':
    'Pan head machine screw ISO 7045 / ISO 14583; M6 × 1 × 12 mm; Phillips (cross) 6.8; simplified envelope, no helical threads, schematic drive recess',
  'countersunk-machine':
    'Countersunk machine screw ISO 7046 / ISO 14581 / DIN 965; M6 × 1 × 12 mm; Phillips (cross) 6.8; simplified envelope, no helical threads, schematic drive recess',
  'raised-countersunk':
    'Raised countersunk (oval) machine screw ISO 7047 / DIN 966; M6 × 1 × 12 mm; Phillips (cross) 6.8; simplified envelope, no helical threads, schematic drive recess',
  'cheese-head':
    'Cheese head screw ISO 1207 / DIN 84; M6 × 1 × 12 mm; Cheese (flat cylinder) head; Slotted 1.2; simplified envelope, no helical threads, schematic drive recess',
  'truss-head':
    'Truss (mushroom) head screw JIS B 1111 / ASME B18.6.7M; M6 × 1 × 12 mm; Phillips (cross) 6.8; simplified envelope, no helical threads, schematic drive recess',
  'hex-flange':
    'Hex flange screw DIN 6921 / EN 1665; M6 × 1 × 20 mm; simplified envelope, no helical threads, schematic drive recess',
  shoulder:
    'Shoulder screw ISO 7379; M6 × 1 × 20 mm; Hex socket 4; simplified envelope, no helical threads, schematic drive recess',
  'set-screw':
    'Socket set screw (grub screw) ISO 4026–4029 / DIN 913–916; M6 × 1 × 12 mm; Hex socket 3; Flat (ISO 4026) point; simplified envelope, no helical threads, schematic drive recess',
  thumb:
    'Knurled thumb screw DIN 464 / DIN 653; M6 × 1 × 16 mm; Knurled, high (DIN 464) head; simplified envelope, no helical threads, schematic drive recess',
  wing: 'Wing screw DIN 316; M6 × 1 × 20 mm; simplified envelope, no helical threads, schematic drive recess',
  'eye-bolt': 'Eye bolt DIN 444; M6 × 1 × 30 mm; simplified envelope, no helical threads, schematic drive recess',
  carriage:
    'Carriage bolt (mushroom head, square neck) DIN 603; M6 × 1 × 40 mm; simplified envelope, no helical threads, schematic drive recess',
  'tapping-pan':
    'Pan head tapping screw ISO 7049 / DIN 7981; ST4.2 × 1.4 × 16 mm; Phillips (cross) 4.9; simplified envelope, no helical threads, schematic drive recess',
  'tapping-countersunk':
    'Countersunk tapping screw ISO 7050 / DIN 7982; ST4.2 × 1.4 × 16 mm; Countersunk (flat, 90°) head; Phillips (cross) 4.9; simplified envelope, no helical threads, schematic drive recess',
  'self-drilling':
    'Self-drilling screw DIN 7504 / ISO 15480–15482; ST4.2 × 1.4 × 19 mm; Hexagon washer head; Drill point; simplified envelope, no helical threads, schematic drive recess',
  wood: 'Wood screw DIN 7997 / DIN 7995 / DIN 7996; 4.0 × 1.8 × 40 mm; Countersunk (flat, 90°) head; Pozidriv 4.5; simplified envelope, no helical threads, schematic drive recess',
  chipboard:
    'Chipboard screw DIN 7505; 4.0 × 1.8 × 40 mm; Countersunk (flat, 90°) head; Torx (hexalobular) 3.86; simplified envelope, no helical threads, schematic drive recess',
  drywall:
    'Drywall screw DIN 18182-2; 3.5 × 1.6 × 25 mm; Phillips (cross) 4.8; simplified envelope, no helical threads, schematic drive recess',
  lag: 'Lag / coach screw DIN 571; 8 × 3.5 × 60 mm; Hexagon head; simplified envelope, no helical threads, schematic drive recess',
};

const RIVET_KEYS = [
  'blind-open',
  'blind-closed',
  'blind-multigrip',
  'blind-peel',
  'blind-structural',
  'blind-drive',
  'solid',
  'semi-tubular',
  'tubular',
  'split',
  'self-piercing',
  'blind-rivet-nut',
  'blind-rivet-stud',
  'lockbolt',
  'push-rivet',
];
const strip = ({ id, ...rest }) => (expect(id).toMatch(/^hardware-/), rest);
const BLIND = ['2.4', '3.0', '3.2', '4.0', '4.8', '5.0', '6.0', '6.4'];
const FOUR = ['3.2', '4.0', '4.8', '6.4'];
// Every size × allowed head × both states (× both bodies) of a kind.
const variants = (kind) =>
  sizesFor(kind).flatMap((size) =>
    headsFor(kind).flatMap((head) =>
      ['set', 'unset'].flatMap((state) => {
        const f = withState(withHead(hardwareDefaults(kind, size), head), state);
        return kind.startsWith('blind-rivet-') ? [withBody(f, 'round'), withBody(f, 'hex')] : [f];
      }),
    ),
  );
const errorOf = (f) => {
  try {
    hardwareDimensions(f);
    return '';
  } catch (e) {
    return e.message;
  }
};

describe('the kinds', () => {
  it('has exactly the 15 rivet kinds in spec order, after the 31 old kinds, which are unchanged', () => {
    expect(Object.keys(RIVET_KINDS)).toEqual(RIVET_KEYS);
    expect(Object.keys(HARDWARE_TYPES)).toHaveLength(46);
    expect(Object.entries(HARDWARE_TYPES).slice(0, 31)).toEqual(Object.entries(OLD_TYPES));
    expect(Object.keys(HARDWARE_TYPES).slice(31)).toEqual(RIVET_KEYS);
    RIVET_KEYS.forEach((key) => expect(HARDWARE_TYPES[key]).toBe(RIVET_KINDS[key].label));
    expect(HARDWARE_TYPES['blind-open']).toBe('Blind rivet, open end (pop rivet)');
    expect(HARDWARE_TYPES['blind-rivet-nut']).toBe('Blind rivet nut (rivnut)');
    // The Phase J PEM-style rivet nut stays.
    expect(HARDWARE_TYPES['rivet-nut']).toBe('Rivet nut');
  });
  it('groups every kind once in nine groups, the first six unchanged', () => {
    expect(HARDWARE_GROUPS.map((g) => g.label)).toEqual([
      'Bolts, nuts & spacers',
      'Machine screws',
      'Socket screws',
      'Tapping & self-drilling',
      'Wood & construction',
      'Special',
      'Blind rivets',
      'Solid, tubular & special rivets',
      'Blind rivet nuts & studs',
    ]);
    expect(HARDWARE_GROUPS[6].kinds).toEqual(RIVET_KEYS.slice(0, 6));
    expect(HARDWARE_GROUPS[7].kinds).toEqual([
      'solid',
      'semi-tubular',
      'tubular',
      'split',
      'self-piercing',
      'lockbolt',
      'push-rivet',
    ]);
    expect(HARDWARE_GROUPS[8].kinds).toEqual(['blind-rivet-nut', 'blind-rivet-stud']);
    const all = HARDWARE_GROUPS.flatMap((g) => g.kinds);
    expect(all).toHaveLength(46);
    expect([...all].sort()).toEqual(Object.keys(HARDWARE_TYPES).sort());
  });
  it('offers the heads of §3, no drive and no point', () => {
    expect(Object.fromEntries(RIVET_KEYS.map((kind) => [kind, headsFor(kind)]))).toEqual({
      'blind-open': ['dome', 'countersunk-120', 'large-flange'],
      'blind-closed': ['dome', 'countersunk-120'],
      'blind-multigrip': ['dome', 'large-flange', 'countersunk-120'],
      'blind-peel': ['dome', 'large-flange'],
      'blind-structural': ['dome', 'countersunk-120'],
      'blind-drive': ['dome'],
      solid: ['round', 'countersunk', 'raised-countersunk', 'pan', 'universal', 'countersunk-100'],
      'semi-tubular': ['flat', 'truss'],
      tubular: ['flat', 'round'],
      split: ['round', 'countersunk'],
      'self-piercing': ['countersunk', 'flat'],
      'blind-rivet-nut': ['flat', 'reduced', 'countersunk'],
      'blind-rivet-stud': ['flat', 'reduced'],
      lockbolt: ['dome', 'countersunk-100'],
      'push-rivet': ['flat'],
    });
    for (const kind of RIVET_KEYS) {
      headsFor(kind).forEach((head) => expect(HEAD_STYLES[head], `${kind} ${head}`).toBeTruthy());
      expect(drivesFor(kind, headsFor(kind)[0])).toEqual([]);
      expect(pointsFor(kind)).toEqual([]);
    }
    // The seven new head styles, appended after the 19 of Phase N.
    expect(Object.keys(HEAD_STYLES).slice(19)).toEqual([
      'dome',
      'large-flange',
      'countersunk-120',
      'countersunk-100',
      'universal',
      'flat',
      'reduced',
    ]);
    expect(Object.keys(HEAD_STYLES).filter((h) => HEAD_STYLES[h].flush)).toEqual([
      'countersunk',
      'raised-countersunk',
      'bugle',
      'countersunk-120',
      'countersunk-100',
    ]);
    expect(STATES).toEqual({ set: { label: 'Installed (set)' }, unset: { label: 'As supplied (unset)' } });
    expect(BODIES).toEqual({ round: { label: 'Round body' }, hex: { label: 'Hexagon body' } });
  });
});

describe('sizes', () => {
  it('lists each catalog in order and the restricted kinds', () => {
    expect(sizesFor('blind-open')).toEqual(BLIND);
    for (const kind of ['blind-closed', 'blind-multigrip', 'blind-peel', 'blind-drive'])
      expect(sizesFor(kind), kind).toEqual(FOUR);
    expect(sizesFor('blind-structural')).toEqual(['4.8', '6.4', '9.5', '12.7']);
    expect(sizesFor('solid')).toEqual([
      '1',
      '1.2',
      '1.6',
      '2',
      '2.5',
      '3',
      '3.5',
      '4',
      '5',
      '6',
      '8',
      '10',
      '12',
      '16',
    ]);
    expect(sizesFor('semi-tubular')).toEqual(['3', '4', '5', '6', '8', '10']);
    expect(sizesFor('tubular')).toEqual(['2', '2.5', '3', '4', '5', '6', '8', '10']);
    expect(sizesFor('split')).toEqual(['2', '2.5', '3', '4', '5']);
    expect(sizesFor('self-piercing')).toEqual(['3.3', '5.3']);
    expect(sizesFor('blind-rivet-nut')).toEqual(['M3', 'M4', 'M5', 'M6', 'M8', 'M10', 'M12']);
    expect(sizesFor('blind-rivet-stud')).toEqual(['M4', 'M5', 'M6', 'M8']);
    expect(sizesFor('lockbolt')).toEqual(['4.8', '6.4', '8.0', '9.5', '12.7']);
    expect(sizesFor('push-rivet')).toEqual(['5', '6', '6.3', '8', '10']);
    expect(Object.keys(SIZE_CATALOGS)).toEqual([
      'metric',
      'tapping',
      'wood',
      'drywall',
      'lag',
      'blind',
      'solid',
      'tube',
      'structural',
      'spr',
      'push',
    ]);
    expect(SIZE_CATALOGS.metric).toBe(METRIC_THREADS);
    // Every rivet size is in its catalog; the diameter is the key, no pitch.
    for (const kind of RIVET_KEYS)
      for (const size of sizesFor(kind)) expect(SIZE_CATALOGS[catalogOf(kind)][size], `${kind} ${size}`).toBeTruthy();
    expect(threadFor('blind-open', '4.8')).toEqual({ diameter: 4.8, pitch: undefined });
    expect(threadFor('solid', '1.2')).toEqual({ diameter: 1.2, pitch: undefined });
    expect(threadFor('blind-rivet-nut', 'M8')).toEqual({ diameter: 8, pitch: 1.25 });
  });
  it('falls back to the kind default size instead of throwing (spec §9)', () => {
    expect(Object.fromEntries(RIVET_KEYS.map((kind) => [kind, defaultSize(kind)]))).toEqual({
      'blind-open': '4.8',
      'blind-closed': '4.8',
      'blind-multigrip': '4.8',
      'blind-peel': '4.8',
      'blind-structural': '6.4',
      'blind-drive': '4.8',
      solid: '4',
      'semi-tubular': '4',
      tubular: '4',
      split: '4',
      'self-piercing': '5.3',
      'blind-rivet-nut': 'M6',
      'blind-rivet-stud': 'M6',
      lockbolt: '6.4',
      'push-rivet': '6',
    });
    expect(hardwareDefaults('blind-open', 'M6').size).toBe('4.8');
    expect(hardwareDefaults('solid', '4.8').size).toBe('4');
    expect(hardwareDefaults('blind-rivet-nut', 'M2').size).toBe('M6');
    expect(hardwareDefaults('lockbolt', '3.2').size).toBe('6.4');
    expect(hardwareDefaults('blind-structural', '8.0').size).toBe('6.4');
    expect(strip(hardwareDefaults())).toEqual({
      type: 'hardware',
      kind: 'bolt',
      size: 'M3',
      pitch: 0.5,
      diameter: 3,
      length: 12,
      bodyDiameter: 6,
      headDiameter: 6.9,
      headHeight: 1.8,
      boreDiameter: 3,
      material: 'Steel',
      supplierCode: '',
      installationHole: '',
      minimumSheet: '',
      notes: '',
    });
  });
  it('has a table row for every size a tabled kind offers: estimated is never set; an old size resolves to the default', () => {
    for (const kind of RIVET_KEYS)
      for (const size of sizesFor(kind)) expect(resolveHardware(hardwareDefaults(kind, size)).estimated).toBe(false);
    // A size injected from an old save outside the catalog.
    const injected = { ...hardwareDefaults('blind-open', '4.8'), size: '7.7' };
    const r = resolveHardware(injected);
    expect(r.size).toBe('4.8');
    expect(r.estimated).toBe(false);
    expect(hardwareNote(injected)).not.toContain('estimated');
  });
});

describe('defaults per kind (spec §3, §10)', () => {
  it('blind rivets: open, closed, multi-grip, peel, structural, drive', () => {
    const open = hardwareDefaults('blind-open', '4.8');
    expect(open).toMatchObject({
      head: 'dome',
      state: 'set',
      headDiameter: 9.5,
      headHeight: 1.5,
      mandrelDiameter: 2.95,
      length: 10,
      grip: 5,
      bulbDiameter: 7.2,
      bulbHeight: 3.12,
      mandrelLength: 27,
      material: 'Aluminum',
    });
    expect('pitch' in open).toBe(false);
    expect('body' in open).toBe(false);
    expect(withHead(open, 'countersunk-120')).toMatchObject({ headDiameter: 9, headHeight: 1.2 });
    expect(withHead(open, 'large-flange')).toMatchObject({ headDiameter: 16, headHeight: 1.9 });
    expect(hardwareDefaults('blind-closed', '6.4')).toMatchObject({
      headDiameter: 13,
      headHeight: 2.2,
      mandrelDiameter: 3.9,
      length: 14,
      grip: 6,
    });
    expect(hardwareDefaults('blind-multigrip', '4.8')).toMatchObject({ length: 13, grip: 5, bulbHeight: 5.28 });
    expect(hardwareDefaults('blind-peel', '4.0')).toMatchObject({ bulbDiameter: 11.2, bulbHeight: 0.6 });
    expect(hardwareDefaults('blind-structural', '6.4')).toMatchObject({
      headDiameter: 13.44,
      headHeight: 2.88,
      mandrelDiameter: 3.97,
      length: 14.5,
      grip: 5,
      bulbHeight: 4.48,
      material: 'Steel',
    });
    const drive = hardwareDefaults('blind-drive', '4.8');
    expect(drive).toMatchObject({
      headDiameter: 9.6,
      headHeight: 2.06,
      mandrelDiameter: 2.16,
      length: 10,
      grip: 4,
      bulbDiameter: 6.24,
    });
    expect('bulbHeight' in drive).toBe(false);
  });
  it('solid rivets: the six heads', () => {
    const solid = hardwareDefaults('solid', '4');
    expect(solid).toMatchObject({
      head: 'round',
      headDiameter: 7,
      headHeight: 2.4,
      grip: 6,
      length: 12,
      bulbDiameter: 6,
      bulbHeight: 2,
    });
    expect(withHead(solid, 'countersunk')).toMatchObject({ headDiameter: 7, headHeight: 1.5 });
    expect(withHead(solid, 'raised-countersunk')).toMatchObject({ headDiameter: 8, headHeight: 2.1, domeHeight: 1.4 });
    expect(withHead(solid, 'pan')).toMatchObject({ headDiameter: 9, headHeight: 2 });
    expect(withHead(solid, 'universal')).toMatchObject({ headDiameter: 7.6, headHeight: 1.7 });
    expect(withHead(solid, 'countersunk-100')).toMatchObject({ headDiameter: 7.2, headHeight: 1.34 });
    // The dome height goes when the head no longer has one.
    expect('domeHeight' in withHead(withHead(solid, 'raised-countersunk'), 'pan')).toBe(false);
  });
  it('tubular, split and self-piercing rivets', () => {
    expect(hardwareDefaults('semi-tubular', '4')).toMatchObject({
      head: 'flat',
      headDiameter: 7.5,
      headHeight: 1,
      boreDiameter: 2.7,
      boreDepth: 4,
      length: 8,
      grip: 5.6,
      bulbDiameter: 5.8,
      bulbHeight: 1.2,
    });
    expect(hardwareDefaults('tubular', '4')).toMatchObject({
      headDiameter: 6,
      headHeight: 0.8,
      boreDiameter: 3.2,
      length: 10,
      grip: 7.6,
      material: 'Brass',
    });
    expect(hardwareDefaults('split', '3')).toMatchObject({
      headDiameter: 5.7,
      headHeight: 1.35,
      length: 12,
      grip: 8.4,
      bulbDiameter: 10.2,
      bulbHeight: 1.2,
    });
    expect(hardwareDefaults('self-piercing', '5.3')).toMatchObject({
      head: 'countersunk',
      headDiameter: 7.75,
      headHeight: 1.05,
      boreDiameter: 2.92,
      boreDepth: 3.6,
      length: 6,
      grip: 4.8,
      bulbDiameter: 7.42,
    });
  });
  it('blind rivet nuts and studs: thread, body, flange and the body select', () => {
    const nut = hardwareDefaults('blind-rivet-nut', 'M6');
    expect(nut).toMatchObject({
      bodyDiameter: 9,
      headDiameter: 13,
      headHeight: 1.5,
      boreDiameter: 6,
      pitch: 1,
      length: 14.5,
      grip: 2,
      bulbDiameter: 11.7,
      bulbHeight: 3.15,
      body: 'round',
    });
    expect(withHead(nut, 'countersunk')).toMatchObject({ headDiameter: 12, headHeight: 1.5 });
    const hex = withBody(nut, 'hex');
    expect(hex.body).toBe('hex');
    const { body: _hexBody, ...hexRest } = hex;
    const { body: _roundBody, ...nutRest } = nut;
    expect(hexRest).toEqual(nutRest);
    expect(hardwareDefaults('blind-rivet-stud', 'M6')).toMatchObject({
      bodyDiameter: 9,
      headDiameter: 13,
      headHeight: 1.5,
      length: 11,
      threadLength: 16,
      grip: 2,
      pitch: 1,
      body: 'round',
    });
    // withBody leaves every other kind alone; withDrive / withPoint every rivet.
    const open = hardwareDefaults('blind-open');
    expect(withBody(open, 'hex')).toBe(open);
    expect(withDrive(open, 'torx')).toBe(open);
    expect(withPoint(open, 'cone')).toBe(open);
    expect(withState(hardwareDefaults('bolt'), 'unset').state).toBeUndefined();
  });
  it('lockbolt and push rivet', () => {
    expect(hardwareDefaults('lockbolt', '6.4')).toMatchObject({
      head: 'dome',
      headDiameter: 11.52,
      headHeight: 2.56,
      bulbDiameter: 9.92,
      bulbHeight: 7.68,
      grip: 6,
      length: 29.68,
    });
    expect(hardwareDefaults('push-rivet', '6')).toMatchObject({
      headDiameter: 15,
      headHeight: 1.2,
      mandrelDiameter: 3,
      length: 12,
      grip: 4.8,
      bulbDiameter: 8.4,
      mandrelLength: 4.8,
      material: 'Nylon',
    });
  });
  it('only the rivet nut and stud carry a pitch; withState sets only the state', () => {
    for (const kind of RIVET_KEYS)
      expect('pitch' in hardwareDefaults(kind), kind).toBe(kind.startsWith('blind-rivet-'));
    const open = hardwareDefaults('blind-open', '4.8');
    const unset = withState(open, 'unset');
    const { state: s1, ...a } = open;
    const { state: s2, ...b } = unset;
    expect([s1, s2]).toEqual(['set', 'unset']);
    expect(a).toEqual(b);
  });
});

describe('rules', () => {
  it('every default of every kind × size × head × state (× body) is valid', () => {
    let count = 0;
    for (const kind of RIVET_KEYS)
      for (const f of variants(kind)) {
        expect(errorOf(f), `${kind} ${f.size} ${f.head} ${f.state} ${f.body || ''}`).toBe('');
        count++;
      }
    expect(count).toBe(526);
  });
  it('rejects each impossible rivet with its sentence (spec §6)', () => {
    const open = hardwareDefaults('blind-open', '4.8');
    const nut = hardwareDefaults('blind-rivet-nut', 'M6');
    const cases = [
      [{ ...open, headDiameter: 4.8 }, 'The head must be wider than the shank.'],
      [{ ...nut, headDiameter: 8.9 }, 'The flange must be at least as wide as the body.'],
      [{ ...withHead(nut, 'countersunk'), headDiameter: 9 }, 'The head must be wider than the body.'],
      [{ ...nut, bodyDiameter: 6, bulbDiameter: 8 }, 'The body must be wider than the thread.'],
      [{ ...withHead(open, 'countersunk-120'), grip: 1.1 }, 'The head must not be deeper than the grip.'],
      [{ ...open, grip: 10 }, 'The grip must be shorter than the rivet.'],
      [{ ...hardwareDefaults('lockbolt', '6.4'), grip: 22 }, 'The pin must reach past the collar.'],
      [{ ...open, bulbHeight: 5.01 }, 'The upset must fit in the rivet tail.'],
      [{ ...open, bulbDiameter: 4.8 }, 'The upset must be wider than the body.'],
      [{ ...nut, bulbDiameter: 9 }, 'The upset must be wider than the body.'],
      [{ ...open, mandrelDiameter: 4.8 }, 'The mandrel must be narrower than the body.'],
      [{ ...hardwareDefaults('push-rivet', '6'), mandrelDiameter: 6 }, 'The pin must be narrower than the body.'],
      [{ ...hardwareDefaults('semi-tubular', '4'), boreDiameter: 4 }, 'The bore must be smaller than the rivet body.'],
      [{ ...nut, boreDiameter: 9 }, 'The bore must be smaller than the rivet body.'],
      [{ ...hardwareDefaults('semi-tubular', '4'), boreDepth: 8 }, 'The bore must be shorter than the rivet.'],
    ];
    for (const [f, message] of cases) expect(errorOf(f), message).toBe(message);
    // Equality is allowed for a flush head: the M4 countersunk rivet nut, k = grip = 1.5.
    expect(withHead(hardwareDefaults('blind-rivet-nut', 'M4'), 'countersunk')).toMatchObject({
      headHeight: 1.5,
      grip: 1.5,
    });
    expect(errorOf(withHead(hardwareDefaults('blind-rivet-nut', 'M4'), 'countersunk'))).toBe('');
    // A field the state does not use is not validated.
    expect(errorOf({ ...open, mandrelLength: -1 })).toBe('');
    expect(errorOf({ ...withState(open, 'unset'), bulbHeight: 99 })).toBe('');
    expect(errorOf({ ...withState(open, 'unset'), mandrelLength: -1 })).toMatch(/mandrelLength/);
  });
  it('evaluates parametric expressions in every new field', () => {
    const open = {
      ...hardwareDefaults('blind-open', '4.8'),
      grip: '=w/4',
      bulbDiameter: '=w*36/100',
      bulbHeight: '=w/8',
      mandrelDiameter: '=w/10',
    };
    expect(hardwareDimensions(open, { w: 20 })).toMatchObject({
      grip: 5,
      bulbDiameter: 7.2,
      bulbHeight: 2.5,
      mandrelDiameter: 2,
    });
    expect(hardwareDimensions({ ...withState(open, 'unset'), mandrelLength: '=w' }, { w: 20 }).mandrelLength).toBe(20);
    const semi = { ...hardwareDefaults('semi-tubular', '4'), boreDepth: '=w/5' };
    expect(hardwareDimensions(semi, { w: 20 }).boreDepth).toBe(4);
    const stud = { ...hardwareDefaults('blind-rivet-stud', 'M6'), threadLength: '=w' };
    expect(hardwareDimensions(stud, { w: 20 }).threadLength).toBe(20);
  });
});

describe('notes, labels and rings', () => {
  it('keeps the 31 old BOM notes byte for byte', () => {
    for (const [kind, note] of Object.entries(OLD_NOTES)) expect(hardwareNote(hardwareDefaults(kind)), kind).toBe(note);
  });
  it('writes the rivet BOM note (spec §6)', () => {
    const note = hardwareNote(hardwareDefaults('blind-open', '4.8'));
    for (const part of ['ISO 15977', '4.8 × 10 mm', 'Dome (protruding) head', 'grip 5 mm, installed', 'mandrel Ø2.95'])
      expect(note).toContain(part);
    expect(note).toBe(
      'Blind rivet, open end (pop rivet) ISO 15977–15984 / DIN 7337; 4.8 × 10 mm; Dome (protruding) head; grip 5 mm, installed; mandrel Ø2.95; simplified envelope: blind-side upset schematic, no threads, grooves or knurls',
    );
    expect(hardwareNote({ ...hardwareDefaults('blind-rivet-nut', 'M6'), body: 'hex', supplierCode: 'RN-6' })).toBe(
      'Blind rivet nut (rivnut) manufacturer (PEM / Böllhoff tables); M6 × 1 × 14.5 mm; Flat (thin disc) head; hexagon body; grip 2 mm, installed; proportional defaults, no standard table; simplified envelope: blind-side upset schematic, no threads, grooves or knurls; Supplier: RN-6',
    );
    expect(hardwareNote(hardwareDefaults('blind-rivet-stud', 'M6'))).toContain(
      'M6 × 1, body 11 mm, stud 16 mm; Flat (thin disc) head; round body',
    );
    expect(hardwareNote(withState(hardwareDefaults('lockbolt'), 'unset'))).toContain(
      'grip 6 mm, as supplied; proportional defaults, no standard table; collar not shown as supplied',
    );
    expect(hardwareNote(hardwareDefaults('lockbolt'))).not.toContain('collar not shown');
    expect(hardwareNote(hardwareDefaults('push-rivet'))).toContain('pin Ø3');
    expect(hardwareNote(hardwareDefaults('blind-drive'))).toContain('pin Ø2.16');
    // One head: no head part; no mandrel field: no mandrel part.
    expect(hardwareNote(hardwareDefaults('push-rivet'))).not.toContain('head;');
    expect(hardwareNote(hardwareDefaults('solid'))).not.toContain('mandrel');
    expect(hardwareNote(hardwareDefaults('solid'))).not.toContain('proportional defaults');
    for (const kind of RIVET_KEYS.filter((k) => !RIVET_KINDS[k].tabled))
      expect(hardwareNote(hardwareDefaults(kind)), kind).toContain('proportional defaults, no standard table');
    for (const kind of RIVET_KEYS) expect(hardwareNote(hardwareDefaults(kind)), kind).not.toContain('undefined');
    expect(RIVET_KEYS.filter((k) => RIVET_KINDS[k].tabled)).toEqual([
      'blind-open',
      'blind-closed',
      'solid',
      'semi-tubular',
    ]);
  });
  it('labels the fields per kind and state (spec §7)', () => {
    const labels = (f) => hardwareFieldLabels(f).map(([, label]) => label);
    const keys = (f) => hardwareFieldLabels(f).map(([key]) => key);
    const supplier = [
      'Supplier part number',
      'Supplier installation hole (mm)',
      'Supplier minimum sheet thickness (mm)',
      'Installation / finish notes',
    ];
    const open = hardwareDefaults('blind-open', '4.8');
    expect(labels(open)).toEqual([
      'Body length (mm)',
      'Grip / clamped thickness (mm)',
      'Body diameter (mm)',
      'Head diameter (mm)',
      'Head height (mm)',
      'Mandrel diameter (mm)',
      'Bulb diameter (mm)',
      'Bulb height (mm)',
      ...supplier,
    ]);
    // Mandrel protrusion only as supplied, the upset height only when set.
    expect(keys(withState(open, 'unset'))).toContain('mandrelLength');
    expect(keys(withState(open, 'unset'))).not.toContain('bulbHeight');
    expect(keys(open)).not.toContain('mandrelLength');
    expect(labels(withHead(open, 'countersunk-120'))[0]).toBe('Overall length (mm)');
    expect(labels(withHead(open, 'large-flange'))[3]).toBe('Flange diameter (mm)');
    expect(labels(hardwareDefaults('blind-rivet-nut'))).toEqual([
      'Body length (mm)',
      'Grip / clamped thickness (mm)',
      'Thread diameter (mm)',
      'Flange diameter (mm)',
      'Flange thickness (mm)',
      'Body diameter (mm)',
      'Thread bore (mm)',
      'Bulge diameter (mm)',
      'Bulge height (mm)',
      'Thread pitch (mm)',
      ...supplier,
    ]);
    expect(labels(withBody(hardwareDefaults('blind-rivet-nut'), 'hex'))).toContain('Body across flats (mm)');
    expect(labels(hardwareDefaults('blind-rivet-stud'))).toEqual([
      'Body length below flange (mm)',
      'Grip / clamped thickness (mm)',
      'Thread diameter (mm)',
      'Flange diameter (mm)',
      'Flange thickness (mm)',
      'Body diameter (mm)',
      'Stud length above flange (mm)',
      'Bulge diameter (mm)',
      'Bulge height (mm)',
      'Thread pitch (mm)',
      ...supplier,
    ]);
    expect(labels(withHead(hardwareDefaults('solid'), 'raised-countersunk')).slice(0, 8)).toEqual([
      'Overall length (mm)',
      'Grip / clamped thickness (mm)',
      'Body diameter (mm)',
      'Head diameter (mm)',
      'Head height (mm)',
      'Dome height (mm)',
      'Shop head diameter (mm)',
      'Shop head height (mm)',
    ]);
    expect(labels(hardwareDefaults('semi-tubular')).slice(5, 9)).toEqual([
      'Tube bore diameter (mm)',
      'Tube bore depth (mm)',
      'Rolled lip diameter (mm)',
      'Rolled lip height (mm)',
    ]);
    expect(keys(hardwareDefaults('tubular'))).not.toContain('boreDepth');
    expect(labels(hardwareDefaults('blind-peel')).slice(-6, -4)).toEqual(['Petal span (mm)', 'Petal thickness (mm)']);
    expect(labels(hardwareDefaults('split')).slice(-6, -4)).toEqual(['Leg span (mm)', 'Leg thickness (mm)']);
    expect(labels(hardwareDefaults('blind-drive'))).toEqual([
      'Body length (mm)',
      'Grip / clamped thickness (mm)',
      'Body diameter (mm)',
      'Head diameter (mm)',
      'Head height (mm)',
      'Pin diameter (mm)',
      'Flared tail diameter (mm)',
      ...supplier,
    ]);
    expect(labels(withState(hardwareDefaults('blind-drive'), 'unset'))).toContain('Pin protrusion (mm)');
    expect(labels(hardwareDefaults('self-piercing'))).toContain('Flared tail diameter (mm)');
    expect(labels(hardwareDefaults('lockbolt')).slice(0, 1)).toEqual(['Pin length (mm)']);
    expect(labels(hardwareDefaults('lockbolt')).slice(-6, -4)).toEqual(['Collar diameter (mm)', 'Collar height (mm)']);
    expect(labels(withState(hardwareDefaults('lockbolt'), 'unset'))).not.toContain('Collar height (mm)');
    expect(labels(hardwareDefaults('push-rivet'))).toEqual([
      'Body length (mm)',
      'Grip / clamped thickness (mm)',
      'Panel hole diameter (mm)',
      'Head diameter (mm)',
      'Head height (mm)',
      'Pin diameter (mm)',
      'Expanded leg diameter (mm)',
      ...supplier,
    ]);
  });
  it('rings the near-side head (spec §9)', () => {
    expect(hardwareRadius(hardwareDefaults('blind-open', '4.8'))).toBe(4.75);
    expect(hardwareRadius(hardwareDefaults('lockbolt', '6.4'))).toBe(5.76);
    expect(hardwareRadius(hardwareDefaults('blind-rivet-nut', 'M6'))).toBe(6.5);
    expect(hardwareName(hardwareDefaults('blind-open', '4.8'))).toBe('Blind rivet, open end (pop rivet) 4.8');
    expect(createHardware(hardwareDefaults('solid', '4')).part.name).toBe('Solid rivet 4');
    expect(createHardware(hardwareDefaults('blind-rivet-nut', 'M6')).part).toMatchObject({
      name: 'Blind rivet nut (rivnut) M6',
      material: 'Steel',
    });
    expect(hardwareMaterial('blind-open')).toBe('Aluminum');
    expect(hardwareMaterial('bolt')).toBe('Steel');
  });
  // The single free seat's ghost prism: rivet bodies run into the face like
  // bolts and screws (placementCuts.js hardwareView); a standoff stands out.
  it('the free-seat ghost of a rivet points into the face', () => {
    const w = world();
    const ghost = (feature) =>
      placementView(
        placeClick(placeDraft(w, 'hardware', { hardware: feature }), face(w, [120, 60, 18], [0, 0, 1]), w.ctx),
        w.ctx,
      ).shape;
    expect(ghost(hardwareDefaults('blind-open'))).toMatchObject({ kind: 'prism', value: -10 });
    expect(ghost(hardwareDefaults('lockbolt')).value).toBe(-29.68);
    expect(ghost(hardwareDefaults('bolt')).value).toBe(-12);
    expect(ghost(hardwareDefaults('standoff')).value).toBe(12);
  });
});
