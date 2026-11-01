// Phase N (docs/sketch-studio-screw-library.md §10): the screw catalog and
// rules, pure (no OpenCascade).
import { describe, expect, it } from 'vitest';
import {
  DRIVES,
  HARDWARE_GROUPS,
  HARDWARE_TYPES,
  HEAD_STYLES,
  METRIC_THREADS,
  POINTS,
  SCREW_KINDS,
  SIZE_CATALOGS,
  defaultSize,
  drivesFor,
  hardwareDefaults,
  hardwareDimensions,
  hardwareFieldLabels,
  hardwareNote,
  headsFor,
  pointsFor,
  resolveHardware,
  sizesFor,
  threadFor,
  withDrive,
  withHead,
  withPoint,
} from './hardware.js';
import { hardwareRadius } from './placementHardware.js';

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
};
const SCREW_KEYS = [
  'socket-cap',
  'button-head',
  'countersunk-socket',
  'pan-head',
  'countersunk-machine',
  'raised-countersunk',
  'cheese-head',
  'truss-head',
  'hex-flange',
  'shoulder',
  'set-screw',
  'thumb',
  'wing',
  'eye-bolt',
  'carriage',
  'tapping-pan',
  'tapping-countersunk',
  'self-drilling',
  'wood',
  'chipboard',
  'drywall',
  'lag',
];
const strip = ({ id, ...rest }) => (expect(id).toMatch(/^hardware-/), rest);
// Every allowed head × drive (× point) of every size of a kind.
const variants = (kind) =>
  sizesFor(kind).flatMap((size) =>
    headsFor(kind).flatMap((head) => {
      const headed = withHead(hardwareDefaults(kind, size), head);
      return drivesFor(kind, headed.head).flatMap((drive) =>
        pointsFor(kind).map((point) => withPoint(withDrive(headed, drive), point)),
      );
    }),
  );

describe('the kinds', () => {
  it('has exactly the 22 screw kinds in spec order, after the nine Phase J kinds, unchanged', () => {
    expect(Object.keys(SCREW_KINDS)).toEqual(SCREW_KEYS);
    expect(Object.keys(HARDWARE_TYPES)).toHaveLength(31);
    expect(Object.entries(HARDWARE_TYPES).slice(0, 9)).toEqual(Object.entries(OLD_TYPES));
    SCREW_KEYS.forEach((key) => expect(HARDWARE_TYPES[key]).toBe(SCREW_KINDS[key].label));
    expect(HARDWARE_TYPES['socket-cap']).toBe('Socket head cap screw');
    expect(HARDWARE_TYPES.lag).toBe('Lag / coach screw');
  });
  it('groups every kind once, the nine old kinds first', () => {
    expect(HARDWARE_GROUPS.map((g) => g.label)).toEqual([
      'Bolts, nuts & spacers',
      'Machine screws',
      'Socket screws',
      'Tapping & self-drilling',
      'Wood & construction',
      'Special',
    ]);
    expect(HARDWARE_GROUPS[0].kinds).toEqual(Object.keys(OLD_TYPES));
    expect(HARDWARE_GROUPS.flatMap((g) => g.kinds).sort()).toEqual(Object.keys(HARDWARE_TYPES).sort());
  });
  it('names every head, drive and point a kind allows', () => {
    for (const kind of SCREW_KEYS) {
      headsFor(kind).forEach((head) => {
        expect(HEAD_STYLES[head]).toBeTruthy();
        drivesFor(kind, head).forEach((drive) => expect(DRIVES[drive]).toBeTruthy());
      });
      pointsFor(kind).forEach((point) => expect(POINTS[point]).toBeTruthy());
    }
    expect(drivesFor('self-drilling', 'hex-washer')).toEqual(['none']);
    expect(drivesFor('self-drilling', 'pan')).toEqual(['phillips', 'pozidriv', 'torx', 'square']);
    expect(headsFor('wood')).toEqual(['countersunk', 'raised-countersunk', 'round']);
    expect(pointsFor('set-screw')).toEqual(['flat', 'cone', 'dog', 'cup']);
    expect(headsFor('bolt')).toEqual([]);
  });
});

describe('sizes', () => {
  it('lists each catalog and the restricted kinds', () => {
    expect(sizesFor('bolt')).toEqual(Object.keys(METRIC_THREADS));
    expect(sizesFor('socket-cap')).toEqual(Object.keys(METRIC_THREADS));
    expect(sizesFor('shoulder')).toEqual(['M5', 'M6', 'M8', 'M10', 'M12']);
    expect(sizesFor('tapping-pan')).toEqual(['ST2.9', 'ST3.5', 'ST4.2', 'ST4.8', 'ST5.5', 'ST6.3']);
    expect(sizesFor('self-drilling')).toEqual(['ST3.5', 'ST4.2', 'ST4.8', 'ST5.5', 'ST6.3']);
    expect(sizesFor('wood')).toEqual(['3.0', '3.5', '4.0', '4.5', '5.0', '6.0']);
    expect(sizesFor('chipboard')).toEqual(sizesFor('wood'));
    expect(sizesFor('drywall')).toEqual(['3.5', '3.9', '4.2', '4.8']);
    expect(sizesFor('lag')).toEqual(['5', '6', '8', '10', '12']);
    expect(SIZE_CATALOGS.metric).toBe(METRIC_THREADS);
    expect(threadFor('tapping-pan', 'ST4.2')).toEqual({ diameter: 4.2, pitch: 1.4 });
    expect(threadFor('wood', '4.0')).toEqual({ diameter: 4, pitch: 1.8 });
    expect(threadFor('lag', '8')).toEqual({ diameter: 8, pitch: 3.5 });
  });
  it('falls back to the kind default size instead of throwing (spec §9)', () => {
    expect(defaultSize('bolt')).toBe('M3');
    expect(defaultSize('socket-cap')).toBe('M6');
    expect(defaultSize('shoulder')).toBe('M6');
    expect(defaultSize('tapping-pan')).toBe('ST4.2');
    expect(defaultSize('wood')).toBe('4.0');
    expect(defaultSize('drywall')).toBe('3.5');
    expect(defaultSize('lag')).toBe('8');
    expect(hardwareDefaults('wood', 'M6').size).toBe('4.0');
    expect(hardwareDefaults('shoulder', 'M3').size).toBe('M6');
    expect(hardwareDefaults('self-drilling', 'ST2.9').size).toBe('ST4.2');
    expect(hardwareDefaults('bolt', '4.0').size).toBe('M3');
  });
});

describe('the nine Phase J kinds', () => {
  it('hardwareDefaults() is the Phase J bolt M3 field for field (6.9 to 2 dp)', () => {
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
    expect(Object.keys(hardwareDefaults())).toEqual([
      'id',
      'type',
      'kind',
      'size',
      'pitch',
      'diameter',
      'length',
      'bodyDiameter',
      'headDiameter',
      'headHeight',
      'boreDiameter',
      'material',
      'supplierCode',
      'installationHole',
      'minimumSheet',
      'notes',
    ]);
  });
  it('keeps the Phase J numbers (to 2 dp) for every kind and size', () => {
    for (const kind of Object.keys(OLD_TYPES))
      for (const [size, { diameter, pitch }] of Object.entries(METRIC_THREADS)) {
        const f = hardwareDefaults(kind, size);
        const old = {
          kind,
          size,
          pitch,
          diameter,
          length: kind === 'washer' ? 1 : kind.includes('nut') ? diameter : 12,
          bodyDiameter: diameter * 2,
          headDiameter: diameter * 2.3,
          headHeight: diameter * 0.6,
          boreDiameter: kind === 'washer' ? diameter + 0.4 : diameter,
        };
        for (const [key, value] of Object.entries(old))
          typeof value === 'number' ? expect(f[key]).toBeCloseTo(value, 2) : expect(f[key]).toBe(value);
        expect(f.head).toBeUndefined();
        expect(resolveHardware(f)).toBe(f);
      }
  });
  it('keeps the Phase J BOM note byte for byte', () => {
    expect(hardwareNote(hardwareDefaults())).toBe(
      'Hex bolt; M3 × 0.5; simplified envelope, no helical threads or clinching teeth',
    );
    expect(
      hardwareNote({
        ...hardwareDefaults('washer', 'M6'),
        supplierCode: 'S-1',
        installationHole: '6.4',
        minimumSheet: '1.5',
        notes: 'zinc',
      }),
    ).toBe(
      'Washer; M6 clearance; simplified envelope, no helical threads or clinching teeth; Supplier: S-1; Installation hole Ø6.4 mm; Minimum sheet 1.5 mm; zinc',
    );
  });
  it('keeps the Phase J field labels and order', () => {
    const supplier = [
      ['supplierCode', 'Supplier part number'],
      ['installationHole', 'Supplier installation hole (mm)'],
      ['minimumSheet', 'Supplier minimum sheet thickness (mm)'],
      ['notes', 'Installation / finish notes'],
    ];
    const body = (across) => [
      ['length', 'Body length / thickness (mm)'],
      ['bodyDiameter', across ? 'Body across flats (mm)' : 'Body diameter (mm)'],
      ['boreDiameter', 'Bore diameter (mm)'],
    ];
    const flange = [
      ['headDiameter', 'Flange diameter (mm)'],
      ['headHeight', 'Head / flange height (mm)'],
    ];
    const pitch = [['pitch', 'Thread pitch (mm)']];
    const expected = {
      bolt: [
        ['length', 'Shank length (mm)'],
        ['diameter', 'Shank diameter (mm)'],
        ['headDiameter', 'Head across flats (mm)'],
        ['headHeight', 'Head / flange height (mm)'],
        ...pitch,
      ],
      nut: [...body(true), ...pitch],
      washer: [...body(false)],
      standoff: [...body(true), ...pitch],
      'clinch-nut': [...body(false), ...flange, ...pitch],
      'clinch-standoff': [...body(false), ...flange, ...pitch],
      stud: [['length', 'Shank length (mm)'], ['diameter', 'Shank diameter (mm)'], ...flange, ...pitch],
      'rivet-nut': [...body(false), ...flange, ...pitch],
      insert: [...body(false), ...pitch],
    };
    for (const [kind, list] of Object.entries(expected))
      expect(hardwareFieldLabels(hardwareDefaults(kind))).toEqual([...list, ...supplier]);
  });
});

describe('per-size defaults (spec §3)', () => {
  it('socket, button and countersunk socket screws', () => {
    expect(hardwareDefaults('socket-cap', 'M6')).toMatchObject({
      headDiameter: 10,
      headHeight: 6,
      driveSize: 5,
      drive: 'hex-socket',
      head: 'socket-cap',
      point: 'blunt',
      length: 20,
    });
    expect(hardwareDefaults('countersunk-socket', 'M6')).toMatchObject({ headDiameter: 13.44, headHeight: 3.72 });
    expect(hardwareDefaults('button-head', 'M8')).toMatchObject({ headDiameter: 14, headHeight: 4.4, driveSize: 5 });
  });
  it('machine screws', () => {
    expect(hardwareDefaults('pan-head', 'M4')).toMatchObject({
      headDiameter: 8,
      headHeight: 3.1,
      drive: 'phillips',
      driveSize: 4.6,
    });
    expect(hardwareDefaults('raised-countersunk', 'M5')).toMatchObject({
      headDiameter: 9.2,
      headHeight: 2.5,
      domeHeight: 1.2,
    });
    expect(hardwareDefaults('countersunk-machine', 'M8')).toMatchObject({ headDiameter: 14.5, headHeight: 4 });
    expect(hardwareDefaults('cheese-head', 'M6')).toMatchObject({ headDiameter: 10, headHeight: 3.9, drive: 'slot' });
    expect(withHead(hardwareDefaults('cheese-head', 'M6'), 'fillister')).toMatchObject({ domeHeight: 0.9 });
    expect(hardwareDefaults('truss-head', 'M6')).toMatchObject({ headDiameter: 14, headHeight: 3.7 });
    expect(hardwareDefaults('hex-flange', 'M8')).toMatchObject({
      bodyDiameter: 13,
      headDiameter: 18,
      headHeight: 8.1,
      drive: 'none',
    });
  });
  it('shoulder, set, thumb, wing, eye and carriage', () => {
    expect(hardwareDefaults('shoulder', 'M8')).toMatchObject({
      bodyDiameter: 10,
      headDiameter: 16,
      headHeight: 7,
      threadLength: 13.5,
      driveSize: 5,
    });
    expect(hardwareDefaults('set-screw', 'M6')).toMatchObject({
      head: 'none',
      point: 'flat',
      bodyDiameter: 4,
      driveSize: 3,
      length: 12,
    });
    expect(hardwareDefaults('set-screw', 'M3').length).toBe(6);
    expect(hardwareDefaults('thumb', 'M6')).toMatchObject({
      headDiameter: 24,
      headHeight: 5,
      bodyDiameter: 12,
      collarHeight: 10,
    });
    expect(hardwareDefaults('wing', 'M6')).toMatchObject({
      headDiameter: 30,
      headHeight: 15,
      bodyDiameter: 10,
      wingThickness: 2.7,
    });
    expect(hardwareDefaults('eye-bolt', 'M8')).toMatchObject({ headDiameter: 18, boreDiameter: 8, headHeight: 9 });
    expect(hardwareDefaults('carriage', 'M8')).toMatchObject({
      headDiameter: 20,
      headHeight: 4.5,
      bodyDiameter: 8,
      neckHeight: 5,
    });
    expect(hardwareDefaults('carriage', 'M5')).toMatchObject({ headDiameter: 13, headHeight: 3.1, neckHeight: 3 });
  });
  it('tapping and self-drilling screws', () => {
    expect(hardwareDefaults('tapping-pan', 'ST4.2')).toMatchObject({
      headDiameter: 8.2,
      headHeight: 3.05,
      pitch: 1.4,
      diameter: 4.2,
      point: 'sharp',
    });
    expect(hardwareDefaults('tapping-countersunk', 'ST4.8')).toMatchObject({ headDiameter: 9.5, headHeight: 3 });
    const drilling = hardwareDefaults('self-drilling', 'ST4.8');
    expect(drilling).toMatchObject({
      head: 'hex-washer',
      bodyDiameter: 8,
      headDiameter: 10.5,
      headHeight: 4.3,
      pointDiameter: 4.1,
      drive: 'none',
      point: 'drill',
    });
    expect(drilling.driveSize).toBeUndefined();
    expect(withHead(drilling, 'pan')).toMatchObject({ headDiameter: 9.5, headHeight: 3.7, drive: 'phillips' });
    expect(withHead(drilling, 'countersunk')).toMatchObject({ headDiameter: 9.3, headHeight: 2.8 });
    expect(withHead(withHead(drilling, 'pan'), 'hex-washer')).toMatchObject({
      bodyDiameter: 8,
      headDiameter: 10.5,
      drive: 'none',
    });
  });
  it('wood, chipboard, drywall and lag screws', () => {
    const wood = hardwareDefaults('wood', '4.0');
    expect(wood).toMatchObject({ headDiameter: 7.5, headHeight: 2.2, drive: 'pozidriv', pitch: 1.8, point: 'sharp' });
    expect(withHead(wood, 'round').headHeight).toBe(2.6);
    expect(withHead(wood, 'raised-countersunk')).toMatchObject({ headHeight: 2.2, domeHeight: 0.92 });
    expect(hardwareDefaults('chipboard', '5.0')).toMatchObject({
      headDiameter: 10,
      headHeight: 3,
      drive: 'torx',
      driveSize: 4.43,
    });
    expect(withHead(hardwareDefaults('chipboard', '5.0'), 'pan')).toMatchObject({ headDiameter: 10, headHeight: 3.65 });
    expect(hardwareDefaults('drywall', '3.5')).toMatchObject({
      head: 'bugle',
      headDiameter: 8,
      headHeight: 2.1,
      pitch: 1.6,
    });
    const lag = hardwareDefaults('lag', '8');
    expect(lag).toMatchObject({ head: 'hex', headDiameter: 13, headHeight: 5.5, drive: 'none', point: 'sharp' });
  });
  it('flags sizes outside the standard table as estimated', () => {
    for (const [kind, size] of [
      ['button-head', 'M2'],
      ['truss-head', 'M12'],
      ['eye-bolt', 'M4'],
      ['hex-flange', 'M3'],
      ['pan-head', 'M12'],
    ])
      expect(resolveHardware(hardwareDefaults(kind, size)).estimated).toBe(true);
    for (const [kind, size] of [
      ['button-head', 'M3'],
      ['truss-head', 'M6'],
      ['eye-bolt', 'M8'],
      ['socket-cap', 'M2'],
      ['wood', '4.0'],
    ])
      expect(resolveHardware(hardwareDefaults(kind, size)).estimated).toBe(false);
    // The rule rows, rounded to 2 dp.
    expect(hardwareDefaults('button-head', 'M2.5')).toMatchObject({ headDiameter: 4.75, headHeight: 1.38 });
    expect(hardwareDefaults('hex-flange', 'M3')).toMatchObject({ bodyDiameter: 5.5, headDiameter: 6.9 });
  });
  it('derives drive sizes per drive', () => {
    const pan = hardwareDefaults('pan-head', 'M6');
    expect(withDrive(pan, 'torx').driveSize).toBe(5.52);
    expect(withDrive(pan, 'pin-torx').driveSize).toBe(5.52);
    expect(withDrive(pan, 'slot').driveSize).toBe(1.2);
    expect(withDrive(pan, 'square').driveSize).toBe(3.3);
    expect(withDrive(pan, 'spanner').driveSize).toBe(6);
    expect(withDrive(pan, 'pozidriv').driveSize).toBe(6.8);
    expect(withDrive(hardwareDefaults('pan-head', 'M2'), 'slot').driveSize).toBe(0.6);
    expect(withDrive(hardwareDefaults('tapping-pan', 'ST3.5'), 'torx').driveSize).toBe(3.27);
    expect(hardwareDefaults('tapping-pan', 'ST4.2').driveSize).toBe(4.9);
    // A drive the kind does not offer falls back to its default.
    expect(withDrive(pan, 'hex-socket').drive).toBe('phillips');
  });
});

describe('editing', () => {
  it('a head change re-derives the head and keeps length, material, supplier and notes', () => {
    const wood = { ...hardwareDefaults('wood', '4.0'), length: 55, material: 'Brass', supplierCode: 'W', notes: 'n' };
    const round = withHead(wood, 'round');
    expect(round).toMatchObject({ head: 'round', headHeight: 2.6, length: 55, material: 'Brass', supplierCode: 'W' });
    expect(round.notes).toBe('n');
    expect(round.domeHeight).toBeUndefined();
    expect(withHead(hardwareDefaults('thumb', 'M6'), 'knurled-low').collarHeight).toBe(0);
  });
  it('a point change re-derives the point diameter and dog length', () => {
    const set = hardwareDefaults('set-screw', 'M6');
    expect(withPoint(set, 'cup')).toMatchObject({ point: 'cup', bodyDiameter: 3, neckHeight: 3.25 });
    expect(withPoint(withPoint(set, 'cup'), 'dog')).toMatchObject({ point: 'dog', bodyDiameter: 4 });
  });
  it("drive 'none' is accepted on every screw kind (no recess) and drops the drive size", () => {
    const cap = withDrive(hardwareDefaults('socket-cap', 'M6'), 'none');
    expect(cap.drive).toBe('none');
    expect(cap.driveSize).toBeUndefined();
    expect(resolveHardware(cap).drive).toBe('none');
    expect(hardwareFieldLabels(cap).map(([key]) => key)).not.toContain('driveSize');
    expect(hardwareNote(cap)).not.toContain('Hex socket');
    expect(withDrive(cap, 'torx')).toMatchObject({ drive: 'torx', driveSize: 5.52 });
  });
  it('an old save without head / drive / point resolves the kind defaults', () => {
    const saved = { ...hardwareDefaults('pan-head', 'M5') };
    delete saved.head;
    delete saved.drive;
    delete saved.driveSize;
    delete saved.point;
    expect(resolveHardware(saved)).toMatchObject({ head: 'pan', drive: 'phillips', driveSize: 5.2, point: 'blunt' });
    expect(() => hardwareDimensions(saved)).not.toThrow();
    expect(hardwareNote(saved)).toContain('Phillips (cross) 5.2');
    // An unknown head falls back too.
    expect(resolveHardware({ ...saved, head: 'bogus' }).head).toBe('pan');
  });
  it('evaluates parametric expressions in the new fields', () => {
    const shoulder = { ...hardwareDefaults('shoulder', 'M8'), threadLength: '=t/2', driveSize: '=t/8' };
    const values = hardwareDimensions(shoulder, { t: 30 });
    expect(values).toMatchObject({ threadLength: 15, driveSize: 3.75, kind: 'shoulder', head: 'socket-cap' });
    expect(() => hardwareDimensions(shoulder, {})).toThrow();
  });
});

describe('validation (spec §6, §9)', () => {
  const fails = (feature, message) => expect(() => hardwareDimensions(feature)).toThrow(message);
  it('every default of every kind × size × head × drive × point is valid', () => {
    let count = 0;
    for (const kind of SCREW_KEYS)
      for (const f of variants(kind)) {
        expect(() => hardwareDimensions(f), `${kind} ${f.size} ${f.head} ${f.drive} ${f.point}`).not.toThrow();
        count += 1;
      }
    expect(count).toBeGreaterThan(800);
  });
  it('rejects a head no wider than the shank', () =>
    fails({ ...hardwareDefaults('pan-head', 'M6'), headDiameter: 6 }, 'The head must be wider than the shank.'));
  it('rejects a countersunk head as long as the screw', () =>
    fails(
      { ...hardwareDefaults('countersunk-socket', 'M6'), headHeight: 16 },
      'The head must be shorter than the screw.',
    ));
  it('rejects a shoulder no wider than the thread', () =>
    fails({ ...hardwareDefaults('shoulder', 'M6'), bodyDiameter: 6 }, 'The shoulder must be wider than the thread.'));
  it('rejects a set-screw point as wide as the thread', () =>
    fails({ ...hardwareDefaults('set-screw', 'M6'), bodyDiameter: 6 }, 'The point must be narrower than the thread.'));
  it('rejects an eye bore as wide as the eye', () =>
    fails({ ...hardwareDefaults('eye-bolt', 'M8'), boreDiameter: 18 }, 'The eye bore must be smaller than the eye.'));
  it('rejects wings no wider than the collar', () =>
    fails({ ...hardwareDefaults('wing', 'M6'), bodyDiameter: 30 }, 'The wings must span wider than the collar.'));
  it('rejects a knurled head no wider than its shoulder', () =>
    fails(
      { ...hardwareDefaults('thumb', 'M6'), bodyDiameter: 24 },
      'The knurled head must be wider than the shoulder.',
    ));
  it('rejects a square neck narrower than the thread', () =>
    fails(
      { ...hardwareDefaults('carriage', 'M8'), bodyDiameter: 7 },
      'The square neck must be at least as wide as the thread.',
    ));
  it('rejects a drive recess wider than the head', () => {
    fails({ ...hardwareDefaults('socket-cap', 'M6'), driveSize: 10 }, 'The drive must fit inside the head.');
    fails({ ...hardwareDefaults('set-screw', 'M6'), driveSize: 6 }, 'The drive must fit inside the head.');
    // Drive none: the size is not checked.
    expect(() => hardwareDimensions({ ...hardwareDefaults('lag', '8'), driveSize: 99 })).not.toThrow();
  });
  it('rejects a dog or drill point as long as the screw', () => {
    fails({ ...withPoint(hardwareDefaults('set-screw', 'M6'), 'dog'), neckHeight: 12 }, 'The point must be shorter');
    fails({ ...hardwareDefaults('self-drilling', 'ST4.8'), length: 6 }, 'The point must be shorter');
  });
  it('keeps the old messages for the old kinds and the positive-number rule', () => {
    fails({ ...hardwareDefaults('nut', 'M6'), boreDiameter: 20 }, 'The bore must be smaller than the hardware body.');
    fails({ ...hardwareDefaults('wood', '4.0'), driveSize: 0 }, 'driveSize must be greater than zero.');
    fails({ ...hardwareDefaults(), kind: 'nail' }, 'Choose a hardware type.');
  });
});

describe('notes, labels and rings', () => {
  it('writes the screw BOM note (spec §6)', () => {
    const note = hardwareNote(hardwareDefaults('socket-cap', 'M6'));
    expect(note).toBe(
      'Socket head cap screw ISO 4762 / DIN 912; M6 × 1 × 20 mm; Hex socket 5; simplified envelope, no helical threads, schematic drive recess',
    );
    expect(hardwareNote({ ...hardwareDefaults('wood', '4.0'), supplierCode: 'SPAX-1' })).toBe(
      'Wood screw DIN 7997 / DIN 7995 / DIN 7996; 4.0 × 1.8 × 40 mm; Countersunk (flat, 90°) head; Pozidriv 4.5; simplified envelope, no helical threads, schematic drive recess; Supplier: SPAX-1',
    );
    expect(hardwareNote(hardwareDefaults('set-screw', 'M6'))).toContain('Hex socket 3; Flat (ISO 4026) point');
    expect(hardwareNote(hardwareDefaults('self-drilling', 'ST4.8'))).toBe(
      'Self-drilling screw DIN 7504 / ISO 15480–15482; ST4.8 × 1.6 × 19 mm; Hexagon washer head; Drill point; simplified envelope, no helical threads, schematic drive recess',
    );
    expect(hardwareNote(hardwareDefaults('eye-bolt', 'M4'))).toContain('sizes outside DIN 444 estimated');
    expect(hardwareNote(hardwareDefaults('lag', '8'))).not.toContain('None (external)');
  });
  it('labels the fields per kind and head (spec §7)', () => {
    const keys = (f) => hardwareFieldLabels(f).map(([key]) => key);
    const labels = (f) => Object.fromEntries(hardwareFieldLabels(f));
    expect(keys(hardwareDefaults('socket-cap'))).toEqual([
      'length',
      'diameter',
      'headDiameter',
      'headHeight',
      'driveSize',
      'pitch',
      'supplierCode',
      'installationHole',
      'minimumSheet',
      'notes',
    ]);
    expect(labels(hardwareDefaults('socket-cap')).length).toBe('Shank length (mm)');
    expect(labels(hardwareDefaults('wood')).length).toBe('Overall length (mm)');
    expect(labels(hardwareDefaults('set-screw')).length).toBe('Overall length (mm)');
    expect(labels(hardwareDefaults('shoulder'))).toMatchObject({
      length: 'Shoulder length (mm)',
      bodyDiameter: 'Shoulder diameter (mm)',
      threadLength: 'Thread length (mm)',
    });
    expect(labels(hardwareDefaults('lag'))).toMatchObject({ headDiameter: 'Head across flats (mm)' });
    expect(labels(hardwareDefaults('lag')).driveSize).toBeUndefined();
    expect(labels(hardwareDefaults('hex-flange'))).toMatchObject({
      headDiameter: 'Flange diameter (mm)',
      bodyDiameter: 'Hex across flats (mm)',
    });
    expect(labels(hardwareDefaults('self-drilling'))).toMatchObject({
      headDiameter: 'Washer diameter (mm)',
      bodyDiameter: 'Hex across flats (mm)',
      pointDiameter: 'Drill point diameter (mm)',
    });
    expect(labels(hardwareDefaults('wing'))).toMatchObject({
      headDiameter: 'Wing span (mm)',
      headHeight: 'Wing height (mm)',
      bodyDiameter: 'Collar diameter (mm)',
      wingThickness: 'Wing thickness (mm)',
    });
    expect(labels(hardwareDefaults('eye-bolt'))).toMatchObject({
      headDiameter: 'Eye outer diameter (mm)',
      headHeight: 'Eye thickness (mm)',
      boreDiameter: 'Eye bore (mm)',
    });
    expect(labels(hardwareDefaults('thumb'))).toMatchObject({
      headHeight: 'Knurl height (mm)',
      bodyDiameter: 'Shoulder diameter (mm)',
      collarHeight: 'Shoulder height (mm)',
    });
    expect(labels(hardwareDefaults('carriage'))).toMatchObject({
      bodyDiameter: 'Square neck (mm)',
      neckHeight: 'Neck height (mm)',
    });
    expect(labels(withPoint(hardwareDefaults('set-screw'), 'dog'))).toMatchObject({
      bodyDiameter: 'Point diameter (mm)',
      neckHeight: 'Dog length (mm)',
    });
    expect(keys(withPoint(hardwareDefaults('set-screw'), 'cone'))).not.toContain('bodyDiameter');
    expect(labels(hardwareDefaults('raised-countersunk')).domeHeight).toBe('Dome height (mm)');
  });
  it('rings the overall width: set screw d/2, wing e/2, eye d2/2 (spec §9)', () => {
    expect(hardwareRadius(hardwareDefaults('set-screw', 'M6'))).toBe(3);
    expect(hardwareRadius(hardwareDefaults('wing', 'M6'))).toBe(15);
    expect(hardwareRadius(hardwareDefaults('eye-bolt', 'M8'))).toBe(9);
    expect(hardwareRadius(hardwareDefaults('socket-cap', 'M6'))).toBe(5);
    expect(hardwareRadius(withHead(hardwareDefaults('self-drilling', 'ST4.8'), 'pan'))).toBe(4.75);
  });
});
