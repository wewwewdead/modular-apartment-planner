import { describe, expect, it } from 'vitest';
import { pointInPolygon } from '@/geometry/polygon';
import { createBeam, createColumn, createFloor, createRoom } from './models';
import {
  CEILING_ATTACHMENT_MODES,
  CEILING_BOUNDARY_SOURCES,
  CEILING_OPENING_TYPES,
  CEILING_SCHEMA_VERSION,
  ceilingElevationRange,
  createCeiling,
  createCeilingDetailing,
  createCeilingDimension,
  createCeilingDimensions,
  createCeilingFace,
  createCeilingForProject,
  createCeilingFraming,
  createCeilingLightFixture,
  createCeilingLighting,
  createCeilingOpening,
  createCeilingSuspension,
  createCustomCeilingFramingMember,
  createManualCeilingFastener,
  deriveCeilingBoundaryForFloor,
  deriveCeilingDetail,
  deriveCeilingDimensions,
  deriveCeilingFasteners,
  deriveCeilingFramingMembers,
  deriveCeilingHangers,
  deriveCeilingLightFixtures,
  deriveCeilingPanels,
  deriveCeilingTakeoff,
  getCeilingLocalSpace,
  getProjectCeiling,
  getProjectCeilings,
  resolveCeilingBoundary,
  resolveCeilingDetailing,
  resolveCeilingDimensionReference,
  resolveCeilingElevations,
} from './ceilingModels';

// Plan rectangle 6000 (x) × 4000 (y). Local V flips y, so v = 4000 − y.
const RECT_BOUNDARY = [
  { x: 0, y: 0 },
  { x: 6000, y: 0 },
  { x: 6000, y: 4000 },
  { x: 0, y: 4000 },
];

// Same envelope with the plan's north-east quadrant removed. In ceiling-local
// UV the missing notch is u 3000..6000 × v 0..2000.
const L_BOUNDARY = [
  { x: 0, y: 0 },
  { x: 6000, y: 0 },
  { x: 6000, y: 2000 },
  { x: 3000, y: 2000 },
  { x: 3000, y: 4000 },
  { x: 0, y: 4000 },
];

// The same rectangle with a 300 wide bite taken 406 deep out of one long edge —
// a nick whose return is shorter than one bay of the tightest module, so the
// band that lands half across it has to be cut by the run-finder rather than
// re-anchored to an edge station.
const NICKED_BOUNDARY = [
  { x: 0, y: 0 },
  { x: 6000, y: 0 },
  { x: 6000, y: 4000 },
  { x: 3300, y: 4000 },
  { x: 3300, y: 3594 },
  { x: 3000, y: 3594 },
  { x: 3000, y: 4000 },
  { x: 0, y: 4000 },
];

function rectCeiling(options = {}) {
  return createCeiling('Ceiling', {
    id: 'ceiling_test',
    boundaryPolygon: RECT_BOUNDARY,
    baseElevation: 2700,
    ...options,
  });
}

function lCeiling(options = {}) {
  return createCeiling('L Ceiling', {
    id: 'ceiling_l',
    boundaryPolygon: L_BOUNDARY,
    ...options,
  });
}

function nickedCeiling(options = {}) {
  return createCeiling('Nicked Ceiling', {
    id: 'ceiling_nicked',
    boundaryPolygon: NICKED_BOUNDARY,
    ...options,
  });
}

describe('ceiling factories', () => {
  it('fills every field from undefined overrides', () => {
    const detailing = createCeilingDetailing();

    expect(detailing.schemaVersion).toBe(CEILING_SCHEMA_VERSION);
    expect(detailing.enabled).toBe(true);
    expect(detailing.jurisdictionProfileId).toBe('global-unverified-v1');
    expect(detailing.face.enabled).toBe(true);
    expect(detailing.face.boardThickness).toBe(4.5);
    expect(detailing.face.layout).toMatchObject({
      mode: 'grid',
      orientation: 'vertical',
      originU: 0,
      originV: 0,
      boardWidth: 1219,
      boardHeight: 2438,
      horizontalGap: 6,
      verticalGap: 6,
      jointSystem: 'express',
      customPanels: [],
    });
    expect(detailing.face.fasteners).toMatchObject({
      mode: 'generated',
      type: '',
      edgeClearance: 12,
      cornerClearance: 50,
      perimeterSpacing: 150,
      fieldSpacing: 230,
      manual: [],
      removedGeneratedIds: [],
    });
    expect(detailing.framing).toMatchObject({
      mode: 'automatic',
      material: 'light_gauge_steel',
      furringSpacing: 406,
      carrierSpacing: 1220,
      furringWidth: 50,
      furringDepth: 19,
      carrierWidth: 12,
      carrierDepth: 38,
      members: [],
      removedGeneratedIds: [],
    });
    expect(detailing.suspension).toEqual({ drop: 150, hangerSpacing: 1200 });
    expect(detailing.openings).toEqual([]);
    expect(detailing.lighting).toEqual({ fixtures: [] });
    expect(detailing.dimensions).toEqual({
      precision: 0.01,
      showOverall: true,
      showOpenings: true,
      showBoards: false,
      showFraming: false,
      manual: [],
    });
  });

  it('rejects invalid enum values and non-finite numbers', () => {
    const detailing = createCeilingDetailing({
      face: {
        layout: { mode: 'diagonal', orientation: 'sideways', boardWidth: -20, horizontalGap: -5 },
        fasteners: { mode: 'sprayed', perimeterSpacing: 'wide' },
      },
      framing: { mode: 'freehand', furringSpacing: 0, carrierDepth: Number.NaN },
      suspension: { drop: -300, hangerSpacing: undefined },
    });

    expect(detailing.face.layout.mode).toBe('grid');
    expect(detailing.face.layout.orientation).toBe('vertical');
    expect(detailing.face.layout.boardWidth).toBe(1219);
    expect(detailing.face.layout.horizontalGap).toBe(0);
    expect(detailing.face.fasteners.mode).toBe('generated');
    expect(detailing.face.fasteners.perimeterSpacing).toBe(150);
    expect(detailing.framing.mode).toBe('automatic');
    expect(detailing.framing.furringSpacing).toBe(406);
    expect(detailing.framing.carrierDepth).toBe(38);
    expect(detailing.suspension.drop).toBe(150);
    expect(detailing.suspension.hangerSpacing).toBe(1200);
  });

  it('normalizes openings through createCeilingOpening', () => {
    const opening = createCeilingOpening();
    expect(opening.id.startsWith('ceil_open_')).toBe(true);
    expect(opening).toMatchObject({ type: CEILING_OPENING_TYPES.ACCESS_HATCH, u: 0, v: 0, width: 600, height: 600 });
    expect(opening.label).toBe('');

    expect(createCeilingOpening({ type: 'downlight', u: 120, v: 240, width: 0 }).type).toBe('downlight');
    expect(createCeilingOpening({ type: 'skylight' }).type).toBe(CEILING_OPENING_TYPES.ACCESS_HATCH);
    expect(createCeilingOpening({ width: -50, height: 'tall' })).toMatchObject({ width: 600, height: 600 });

    const detailing = createCeilingDetailing({
      openings: [{ id: 'hatch', type: 'diffuser', u: 500, v: 500, width: 600, height: 600, label: 'AH-1' }],
    });
    expect(detailing.openings[0]).toMatchObject({ id: 'hatch', type: 'diffuser', label: 'AH-1' });
  });

  it('normalizes custom framing members and manual fasteners', () => {
    const member = createCustomCeilingFramingMember();
    expect(member.id.startsWith('ceil_frame_')).toBe(true);
    expect(member).toMatchObject({
      kind: 'furring',
      orientation: 'horizontal',
      depth: 19,
      material: null,
      custom: true,
    });

    const carrier = createCustomCeilingFramingMember({ orientation: 'vertical', u0: 400, u1: 10, v0: 900, v1: 100 });
    expect(carrier.kind).toBe('carrier');
    expect(carrier.u0).toBe(10);
    expect(carrier.u1).toBe(400);
    expect(carrier.v0).toBe(100);
    expect(carrier.v1).toBe(900);

    const fastener = createManualCeilingFastener();
    expect(fastener.id.startsWith('ceil_fastener_')).toBe(true);
    expect(fastener).toMatchObject({ u: 0, v: 0, type: 'corrosion_resistant_screw', note: '', custom: true });
    expect(createManualCeilingFastener({ u: 10, v: 20 }, { type: 'clip', note: 'site' })).toMatchObject({
      u: 10,
      v: 20,
      type: 'clip',
      note: 'site',
    });
  });

  it('creates a ceiling with a default boundary and manual attachment', () => {
    const ceiling = createCeiling();
    expect(ceiling.id.startsWith('ceiling_')).toBe(true);
    expect(ceiling.name).toBe('Ceiling');
    expect(ceiling.floorId).toBeNull();
    expect(ceiling.phaseId).toBeNull();
    expect(ceiling.attachment).toEqual({ mode: CEILING_ATTACHMENT_MODES.MANUAL, beamIds: [] });
    expect(ceiling.baseElevation).toBe(3000);
    expect(ceiling.boundaryPolygon).toEqual([
      { x: -3000, y: -2000 },
      { x: 3000, y: -2000 },
      { x: 3000, y: 2000 },
      { x: -3000, y: 2000 },
    ]);

    const degenerate = createCeiling('Bad', {
      boundaryPolygon: [
        { x: 0, y: 0 },
        { x: 1000, y: 0 },
      ],
    });
    expect(degenerate.boundaryPolygon).toHaveLength(4);
    expect(createCeiling('Phased', { phaseId: '' }).phaseId).toBeNull();
    expect(createCeiling('Phased', { phaseId: 'phase_1' }).phaseId).toBe('phase_1');
    expect(createCeiling('Bogus', { attachment: { mode: 'magnets' } }).attachment.mode).toBe(
      CEILING_ATTACHMENT_MODES.MANUAL,
    );
    // A save written before ceilings hung from beams: the mode is gone, so the
    // ceiling stands on the datum it stored rather than on nothing.
    expect(createCeiling('Legacy', { attachment: { mode: 'truss', trussSystemId: 'ts_1' } }).attachment).toEqual({
      mode: CEILING_ATTACHMENT_MODES.MANUAL,
      beamIds: [],
    });
    expect(
      createCeiling('Beams', { attachment: { mode: 'beam', beamIds: ['beam_a', '', 7, 'beam_a', 'beam_b'] } })
        .attachment,
    ).toEqual({ mode: CEILING_ATTACHMENT_MODES.BEAM, beamIds: ['beam_a', 'beam_b'] });
  });

  it('clones the supplied boundary instead of aliasing it', () => {
    const source = RECT_BOUNDARY.map((point) => ({ ...point }));
    const ceiling = createCeiling('Ceiling', { boundaryPolygon: source });
    source[0].x = 9999;
    expect(ceiling.boundaryPolygon[0].x).toBe(0);
  });

  it('exposes separate face/framing/suspension factories', () => {
    expect(createCeilingFace({ enabled: false }).enabled).toBe(false);
    expect(createCeilingFraming({ material: 'timber' }).material).toBe('timber');
    expect(createCeilingSuspension({ drop: 400 }).drop).toBe(400);
  });

  it('fills a light fixture from the catalog defaults', () => {
    const fixture = createCeilingLightFixture({ u: 1200, v: 800 });
    expect(fixture.id.startsWith('ceil_light_')).toBe(true);
    expect(fixture).toMatchObject({
      u: 1200,
      v: 800,
      fixtureType: 'recessed_can_6',
      bulbType: 'br30',
      colorTempK: 2700,
      lumensOverride: null,
      beamAngleDeg: null,
      dropMm: 0,
      castShadow: true,
      label: '',
    });
    expect(fixture.aim).toEqual({ tiltDeg: 0, azimuthDeg: 0 });
    expect(createCeilingLightFixture({ u: 'left', v: null })).toMatchObject({ u: 0, v: 0 });
  });

  it('refuses a fixture spec that cannot be built', () => {
    // A wafer has no socket for an A19, so the fixture's own lamp answers.
    expect(createCeilingLightFixture({}, { fixtureType: 'wafer_led', bulbType: 'a19' }).bulbType).toBe('led_disk');
    expect(createCeilingLightFixture({}, { fixtureType: 'chandelier_12' })).toMatchObject({
      fixtureType: 'recessed_can_6',
      bulbType: 'br30',
    });
    // 2750 K is not a temperature anyone sells; the lamp's own is.
    expect(createCeilingLightFixture({}, { fixtureType: 'track_head', colorTempK: 2750 }).colorTempK).toBe(3000);
    expect(createCeilingLightFixture({}, { lumensOverride: 0 }).lumensOverride).toBeNull();
    expect(createCeilingLightFixture({}, { lumensOverride: '1450' }).lumensOverride).toBe(1450);
    expect(createCeilingLightFixture({}, { beamAngleDeg: 2 }).beamAngleDeg).toBe(10);
    expect(createCeilingLightFixture({}, { beamAngleDeg: 400 }).beamAngleDeg).toBe(160);
    expect(createCeilingLightFixture({}, { beamAngleDeg: 'wide' }).beamAngleDeg).toBeNull();
    expect(createCeilingLightFixture({}, { castShadow: false }).castShadow).toBe(false);
  });

  it('clamps aim to what the fixture can actually do', () => {
    // A gimbal stops at 40°; a fixed can never leaves straight down.
    expect(createCeilingLightFixture({}, { fixtureType: 'gimbal_recessed', aim: { tiltDeg: 70 } }).aim.tiltDeg).toBe(
      40,
    );
    expect(createCeilingLightFixture({}, { fixtureType: 'gimbal_recessed', aim: { tiltDeg: -5 } }).aim.tiltDeg).toBe(0);
    expect(createCeilingLightFixture({}, { fixtureType: 'recessed_can_6', aim: { tiltDeg: 30 } }).aim.tiltDeg).toBe(0);
    expect(createCeilingLightFixture({}, { aim: { azimuthDeg: 450 } }).aim.azimuthDeg).toBe(90);
    expect(createCeilingLightFixture({}, { aim: { azimuthDeg: -90 } }).aim.azimuthDeg).toBe(270);
  });

  it('takes the drop from the fixture type, and only where something hangs', () => {
    expect(createCeilingLightFixture({}, { fixtureType: 'pendant' }).dropMm).toBe(900);
    expect(createCeilingLightFixture({}, { fixtureType: 'chandelier_5' }).dropMm).toBe(600);
    expect(createCeilingLightFixture({}, { fixtureType: 'semi_flush' }).dropMm).toBe(300);
    expect(createCeilingLightFixture({}, { fixtureType: 'pendant', dropMm: 1500 }).dropMm).toBe(1500);
    expect(createCeilingLightFixture({}, { fixtureType: 'pendant', dropMm: -200 }).dropMm).toBe(900);
    expect(createCeilingLightFixture({}, { fixtureType: 'recessed_can_4' }).dropMm).toBe(0);
  });

  it('keeps fixtures through the detailing normalizer, which every edit round-trips', () => {
    const stored = {
      id: 'ceil_light_1',
      u: 1200,
      v: 800,
      fixtureType: 'pendant',
      bulbType: 'st19',
      colorTempK: 2200,
      dropMm: 1200,
      label: 'L-1',
    };
    const once = createCeilingDetailing({ lighting: { fixtures: [stored] } });
    // createCeilingDetailing whitelists: a key it does not copy is a key the
    // user loses on their next commit, not one that merely goes unread.
    const twice = createCeilingDetailing(once);

    expect(once.lighting.fixtures).toHaveLength(1);
    expect(twice.lighting).toEqual(once.lighting);
    expect(twice.lighting.fixtures[0]).toMatchObject({ ...stored, lumensOverride: null, beamAngleDeg: null });
    expect(createCeilingLighting().fixtures).toEqual([]);
    expect(createCeilingLighting({ fixtures: 'none' }).fixtures).toEqual([]);
  });
});

// A 6000 × 4000 column grid with a ring of 250 mm beams closing it, so a
// ceiling hung from them stops at their inner faces: 125 .. 5875 × 125 .. 3875.
const RING_COLUMNS = [
  ['col_sw', 0, 0],
  ['col_se', 6000, 0],
  ['col_ne', 6000, 4000],
  ['col_nw', 0, 4000],
].map(([id, x, y]) => ({ ...createColumn(x, y, 300, 300, { height: 3200 }), id }));

function ringBeam(id, startId, endId, level) {
  return {
    ...createBeam({ kind: 'column', id: startId }, { kind: 'column', id: endId }, 250, 450, level),
    id,
  };
}

function beamRing(level, prefix = 'beam') {
  return [
    ringBeam(`${prefix}_s`, 'col_sw', 'col_se', level),
    ringBeam(`${prefix}_n`, 'col_nw', 'col_ne', level),
    ringBeam(`${prefix}_w`, 'col_sw', 'col_nw', level),
    ringBeam(`${prefix}_e`, 'col_se', 'col_ne', level),
  ];
}

describe('createCeilingForProject', () => {
  function projectWithFloor({ beams = [], columns = [] } = {}) {
    const floor = createFloor('Ground Floor', 0, { elevation: 0, floorToFloorHeight: 2800 });
    floor.rooms = [
      createRoom('Living', [
        { x: 0, y: 0 },
        { x: 5000, y: 0 },
        { x: 5000, y: 3000 },
        { x: 0, y: 3000 },
      ]),
    ];
    floor.columns = columns;
    floor.beams = beams;
    return { floor, project: { floors: [floor], trussSystems: [] } };
  }

  it('derives the boundary and elevation from the floor in manual mode', () => {
    const { floor, project } = projectWithFloor();
    const ceiling = createCeilingForProject(project);

    expect(ceiling.floorId).toBe(floor.id);
    expect(ceiling.attachment.mode).toBe(CEILING_ATTACHMENT_MODES.MANUAL);
    expect(ceiling.baseElevation).toBe(2800);
    expect(ceiling.boundaryPolygon).toEqual([
      { x: 0, y: 0 },
      { x: 5000, y: 0 },
      { x: 5000, y: 3000 },
      { x: 0, y: 3000 },
    ]);
  });

  it('hangs a new ceiling from the beams above the floor, inside their faces', () => {
    const { project } = projectWithFloor({ columns: RING_COLUMNS, beams: beamRing(3200) });

    const ceiling = createCeilingForProject(project);

    expect(ceiling.attachment).toEqual({
      mode: CEILING_ATTACHMENT_MODES.BEAM,
      beamIds: ['beam_s', 'beam_n', 'beam_w', 'beam_e'],
    });
    expect(ceiling.baseElevation).toBe(3200);
    const xs = ceiling.boundaryPolygon.map((point) => point.x);
    const ys = ceiling.boundaryPolygon.map((point) => point.y);
    expect(Math.min(...xs)).toBeCloseTo(125, 6);
    expect(Math.max(...xs)).toBeCloseTo(5875, 6);
    expect(Math.min(...ys)).toBeCloseTo(125, 6);
    expect(Math.max(...ys)).toBeCloseTo(3875, 6);
    expect(resolveCeilingBoundary(project, ceiling)).toHaveLength(4);
  });

  it('prefers the level carried by the most beams', () => {
    const { project } = projectWithFloor({
      columns: RING_COLUMNS,
      beams: [
        ...beamRing(3200),
        ringBeam('beam_high_s', 'col_sw', 'col_se', 3600),
        ringBeam('beam_high_n', 'col_nw', 'col_ne', 3600),
      ],
    });

    const ceiling = createCeilingForProject(project);

    expect(ceiling.baseElevation).toBe(3200);
    expect(ceiling.attachment.beamIds).toHaveLength(4);
  });

  it('never hangs a ceiling from the tie beams framing its own floor', () => {
    const { project } = projectWithFloor({ columns: RING_COLUMNS, beams: beamRing(0) });

    const ceiling = createCeilingForProject(project);

    expect(ceiling.attachment).toEqual({ mode: CEILING_ATTACHMENT_MODES.MANUAL, beamIds: [] });
    expect(ceiling.baseElevation).toBe(2800);
  });

  it('falls back to manual mode when the beams yield no boundary', () => {
    const { project } = projectWithFloor({
      columns: RING_COLUMNS,
      // One beam bounds nothing: there is no second face to stop at.
      beams: [ringBeam('beam_s', 'col_sw', 'col_se', 3200)],
    });

    const ceiling = createCeilingForProject(project);

    expect(ceiling.attachment.mode).toBe(CEILING_ATTACHMENT_MODES.MANUAL);
    expect(ceiling.baseElevation).toBe(2800);
    expect(ceiling.boundaryPolygon).toHaveLength(4);
  });

  it('honours an explicit manual attachment even with beams overhead', () => {
    const { project } = projectWithFloor({ columns: RING_COLUMNS, beams: beamRing(3200) });

    const ceiling = createCeilingForProject(project, { attachment: { mode: 'manual' } });

    expect(ceiling.attachment.mode).toBe(CEILING_ATTACHMENT_MODES.MANUAL);
    expect(ceiling.baseElevation).toBe(2800);
  });

  it('derives a default boundary when the floor has no geometry', () => {
    expect(deriveCeilingBoundaryForFloor(null)).toEqual([
      { x: -3000, y: -2000 },
      { x: 3000, y: -2000 },
      { x: 3000, y: 2000 },
      { x: -3000, y: 2000 },
    ]);
    expect(deriveCeilingBoundaryForFloor({ walls: [], rooms: [], slabs: [], columns: [] })).toHaveLength(4);
  });
});

describe('ceiling accessors', () => {
  it('reads ceilings off a project', () => {
    const first = rectCeiling({ id: 'ceiling_a', floorId: 'floor_1' });
    const second = rectCeiling({ id: 'ceiling_b', floorId: 'floor_2' });
    const project = { ceilings: [first, second] };

    expect(getProjectCeilings(project)).toHaveLength(2);
    expect(getProjectCeilings(project, 'floor_2')).toEqual([second]);
    expect(getProjectCeilings(null)).toEqual([]);
    expect(getProjectCeiling(project, 'ceiling_a')).toBe(first);
    expect(getProjectCeiling(project, 'nope')).toBeNull();
  });

  it('resolves detailing from a partially stored ceiling', () => {
    const detailing = resolveCeilingDetailing({ detailing: { face: { boardThickness: 6 } } });
    expect(detailing.face.boardThickness).toBe(6);
    expect(detailing.framing.furringSpacing).toBe(406);
    expect(resolveCeilingDetailing(undefined).schemaVersion).toBe(CEILING_SCHEMA_VERSION);
  });

  it('keeps the stored boundary when the support beams are gone', () => {
    const ceiling = rectCeiling({
      floorId: 'floor_1',
      attachment: { mode: 'beam', beamIds: ['beam_s', 'beam_n'] },
    });
    const project = { floors: [{ id: 'floor_1', elevation: 0, columns: RING_COLUMNS, beams: [] }] };

    expect(resolveCeilingBoundary(project, ceiling)).toEqual(RECT_BOUNDARY);
  });

  it('re-derives the boundary from the beams on every read, so moving one moves the ceiling', () => {
    const ceiling = rectCeiling({ floorId: 'floor_1', attachment: { mode: 'beam', beamIds: ['beam_s', 'beam_n'] } });
    const beams = [ringBeam('beam_s', 'col_sw', 'col_se', 3200), ringBeam('beam_n', 'col_nw', 'col_ne', 3200)];
    const project = { floors: [{ id: 'floor_1', elevation: 0, columns: RING_COLUMNS, beams }] };

    const before = resolveCeilingBoundary(project, ceiling);
    expect(Math.max(...before.map((point) => point.y))).toBeCloseTo(3875, 6);

    // Drag the north columns 1000 mm south: the beam follows them, and so does
    // the ceiling that hangs from it.
    const moved = {
      floors: [
        {
          ...project.floors[0],
          columns: RING_COLUMNS.map((column) => (column.y === 4000 ? { ...column, y: 3000 } : column)),
        },
      ],
    };
    expect(Math.max(...resolveCeilingBoundary(moved, ceiling).map((point) => point.y))).toBeCloseTo(2875, 6);
  });
});

describe('drawn ceiling boundaries', () => {
  const beamRingProject = () => ({
    floors: [
      {
        id: 'floor_1',
        elevation: 0,
        floorToFloorHeight: 2800,
        columns: RING_COLUMNS,
        beams: beamRing(3200),
        rooms: [],
        walls: [],
        slabs: [],
      },
    ],
    trussSystems: [],
  });

  const beamAttachment = { mode: 'beam', beamIds: ['beam_s', 'beam_n', 'beam_w', 'beam_e'] };

  it('normalizes the source, and only an exact "drawn" claims a hand-drawn area', () => {
    expect(createCeiling('Ceiling').boundarySource).toBe(CEILING_BOUNDARY_SOURCES.AUTO);
    expect(rectCeiling({ boundarySource: 'drawn' }).boundarySource).toBe(CEILING_BOUNDARY_SOURCES.DRAWN);
    expect(rectCeiling({ boundarySource: 'Drawn' }).boundarySource).toBe(CEILING_BOUNDARY_SOURCES.AUTO);
    expect(rectCeiling({ boundarySource: 'traced' }).boundarySource).toBe(CEILING_BOUNDARY_SOURCES.AUTO);
    expect(rectCeiling({ boundarySource: null }).boundarySource).toBe(CEILING_BOUNDARY_SOURCES.AUTO);
  });

  it('keeps the drawn outline even when the support beams resolve', () => {
    const ceiling = rectCeiling({
      floorId: 'floor_1',
      attachment: beamAttachment,
      boundarySource: CEILING_BOUNDARY_SOURCES.DRAWN,
    });

    expect(resolveCeilingBoundary(beamRingProject(), ceiling)).toEqual(RECT_BOUNDARY);
  });

  it('still lets the beams redraw an auto outline', () => {
    const ceiling = rectCeiling({ floorId: 'floor_1', attachment: beamAttachment });

    const boundary = resolveCeilingBoundary(beamRingProject(), ceiling);
    // The beam faces, not the stored 0..6000 × 0..4000 rectangle.
    expect(Math.min(...boundary.map((point) => point.x))).toBeCloseTo(125, 6);
    expect(Math.max(...boundary.map((point) => point.x))).toBeCloseTo(5875, 6);
  });

  it('hangs a drawn ceiling from the beams while keeping the area it was drawn over', () => {
    const project = beamRingProject();
    const drawn = [
      { x: 1000, y: 1000 },
      { x: 3000, y: 1000 },
      { x: 3000, y: 2500 },
      { x: 1000, y: 2500 },
    ];

    const ceiling = createCeilingForProject(project, {
      floorId: 'floor_1',
      boundaryPolygon: drawn,
      boundarySource: CEILING_BOUNDARY_SOURCES.DRAWN,
    });

    expect(ceiling.boundarySource).toBe(CEILING_BOUNDARY_SOURCES.DRAWN);
    expect(ceiling.boundaryPolygon).toEqual(drawn);
    expect(ceiling.attachment).toEqual(beamAttachment);
    expect(ceiling.baseElevation).toBe(3200);
    expect(resolveCeilingBoundary(project, ceiling)).toEqual(drawn);
  });

  it('carries the drawn area through to the panels and the derived detail', () => {
    const project = beamRingProject();
    const drawn = [
      { x: 1000, y: 1000 },
      { x: 3000, y: 1000 },
      { x: 3000, y: 2500 },
      { x: 1000, y: 2500 },
    ];
    const ceiling = createCeilingForProject(project, {
      floorId: 'floor_1',
      boundaryPolygon: drawn,
      boundarySource: CEILING_BOUNDARY_SOURCES.DRAWN,
    });

    const detail = deriveCeilingDetail(ceiling, project);
    expect(detail.length).toBeCloseTo(2000, 6);
    expect(detail.depth).toBeCloseTo(1500, 6);
  });
});

// A ceiling is built in the bay its frame encloses, so the beams say how far it
// reaches and the slab above says nothing at all — until there is no frame to
// ask, where the slab is the only shape a ceiling has left.
describe('ceiling coverage from the structure overhead', () => {
  const FLUSH_SLAB = [
    { x: 0, y: 0 },
    { x: 6000, y: 0 },
    { x: 6000, y: 4000 },
    { x: 0, y: 4000 },
  ];
  // The same plate pulled 1500 mm east of the frame.
  const CANTILEVERED_SLAB = [
    { x: 0, y: 0 },
    { x: 7500, y: 0 },
    { x: 7500, y: 4000 },
    { x: 0, y: 4000 },
  ];

  const slabAbove = (boundaryPoints) => ({
    id: 'slab_above',
    floorId: 'floor_2',
    elevation: 3200,
    thickness: 200,
    boundaryPoints,
  });

  function stackedProject(boundaryPoints, { beams = beamRing(3200) } = {}) {
    return {
      floors: [
        {
          id: 'floor_1',
          levelIndex: 0,
          elevation: 0,
          floorToFloorHeight: 3200,
          columns: RING_COLUMNS,
          beams,
          rooms: [],
          walls: [],
          slabs: [],
        },
        {
          id: 'floor_2',
          levelIndex: 1,
          elevation: 3200,
          floorToFloorHeight: 3200,
          columns: [],
          beams: [],
          rooms: [],
          walls: [],
          slabs: [slabAbove(boundaryPoints)],
        },
      ],
      trussSystems: [],
    };
  }

  const withSlabAbove = (project, boundaryPoints) => ({
    ...project,
    floors: project.floors.map((floor) =>
      floor.id === 'floor_2' ? { ...floor, slabs: [slabAbove(boundaryPoints)] } : floor,
    ),
  });

  const maxX = (points) => Math.max(...points.map((point) => point.x));

  it('snapshots a new ceiling to the beam faces rather than out to the slab edge', () => {
    const ceiling = createCeilingForProject(stackedProject(CANTILEVERED_SLAB), { floorId: 'floor_1' });

    expect(ceiling.attachment).toEqual({
      mode: CEILING_ATTACHMENT_MODES.BEAM,
      beamIds: ['beam_s', 'beam_n', 'beam_w', 'beam_e'],
    });
    expect(ceiling.baseElevation).toBe(3200);
    // The eastern beam's inner face. The 1500 mm the slab cantilevers past it
    // is left open: an AUTO ceiling traces the frame, and a ceiling wanted under
    // an overhang is drawn by hand.
    expect(maxX(ceiling.boundaryPolygon)).toBeCloseTo(5875, 6);
    expect(pointInPolygon({ x: 7000, y: 2000 }, ceiling.boundaryPolygon)).toBe(false);
  });

  it('holds the beam faces however far the slab edge above is dragged', () => {
    const project = stackedProject(FLUSH_SLAB);
    const ceiling = createCeilingForProject(project, { floorId: 'floor_1' });

    expect(maxX(resolveCeilingBoundary(project, ceiling))).toBeCloseTo(5875, 6);
    expect(maxX(resolveCeilingBoundary(withSlabAbove(project, CANTILEVERED_SLAB), ceiling))).toBeCloseTo(5875, 6);
  });

  it('re-reads the slab on every read where the beams frame nothing', () => {
    // No frame to trace, so the slab is the shape — and it is still derived on
    // every read rather than snapshotted, so dragging its edge moves the ceiling.
    const project = stackedProject(FLUSH_SLAB, { beams: [] });
    const ceiling = createCeilingForProject(project, { floorId: 'floor_1' });

    expect(maxX(resolveCeilingBoundary(project, ceiling))).toBeCloseTo(6000, 6);
    expect(maxX(resolveCeilingBoundary(withSlabAbove(project, CANTILEVERED_SLAB), ceiling))).toBeCloseTo(7500, 6);
  });

  it('leaves a drawn ceiling exactly where it was traced', () => {
    const project = stackedProject(FLUSH_SLAB);
    const drawn = [
      { x: 1000, y: 1000 },
      { x: 3000, y: 1000 },
      { x: 3000, y: 2500 },
      { x: 1000, y: 2500 },
    ];
    const ceiling = createCeilingForProject(project, {
      floorId: 'floor_1',
      boundaryPolygon: drawn,
      boundarySource: CEILING_BOUNDARY_SOURCES.DRAWN,
    });

    expect(ceiling.boundaryPolygon).toEqual(drawn);
    expect(resolveCeilingBoundary(withSlabAbove(project, CANTILEVERED_SLAB), ceiling)).toEqual(drawn);
  });

  it('takes the slab as its outline without claiming to hang from beams', () => {
    const project = stackedProject(CANTILEVERED_SLAB, { beams: [] });

    const ceiling = createCeilingForProject(project, { floorId: 'floor_1' });

    // Structure overhead beats the bounding box of everything on the floor, but
    // a slab is not something a ceiling can be hung from: the attachment stays
    // manual and the datum stays the top of the storey.
    expect(ceiling.attachment).toEqual({ mode: CEILING_ATTACHMENT_MODES.MANUAL, beamIds: [] });
    expect(ceiling.baseElevation).toBe(3200);
    expect(ceiling.boundaryPolygon).toEqual(CANTILEVERED_SLAB);
    expect(resolveCeilingBoundary(project, ceiling)).toEqual(CANTILEVERED_SLAB);
  });
});

// A 6000 × 4000 rectangle spun by `angle`, winding the same way as
// RECT_BOUNDARY. `origin` is the corner that plays RECT_BOUNDARY's (0, 0).
function rotatedRectBoundary(angle, origin = { x: 0, y: 0 }) {
  const along = { x: Math.cos(angle), y: Math.sin(angle) };
  const across = { x: -Math.sin(angle), y: Math.cos(angle) };
  return [
    { x: origin.x, y: origin.y },
    { x: origin.x + along.x * 6000, y: origin.y + along.y * 6000 },
    { x: origin.x + along.x * 6000 + across.x * 4000, y: origin.y + along.y * 6000 + across.y * 4000 },
    { x: origin.x + across.x * 4000, y: origin.y + across.y * 4000 },
  ];
}

describe('ceiling local space', () => {
  it('round-trips plan and RCP-local coordinates', () => {
    const space = getCeilingLocalSpace(RECT_BOUNDARY);
    expect(space).toMatchObject({ rotation: 0, length: 6000, depth: 4000 });
    expect(space.toLocal({ x: 1000, y: 1000 })).toEqual({ u: 1000, v: 3000 });
    expect(space.toPlan({ u: 1000, v: 3000 })).toEqual({ x: 1000, y: 1000 });

    const offset = getCeilingLocalSpace([
      { x: -2000, y: 500 },
      { x: 4000, y: 500 },
      { x: 4000, y: 3500 },
      { x: -2000, y: 3500 },
    ]);
    expect(offset).toMatchObject({ rotation: 0, length: 6000, depth: 3000 });
    const local = offset.toLocal({ x: 1000, y: 2000 });
    expect(local).toEqual({ u: 3000, v: 1500 });
    expect(offset.toPlan(local)).toEqual({ x: 1000, y: 2000 });
    // The boundary's north-west plan corner is the local origin.
    expect(offset.toLocal({ x: -2000, y: 3500 })).toEqual({ u: 0, v: 0 });
  });

  it('keeps the classic frame for a portrait plan-aligned boundary', () => {
    // The longest edges run north-south; folding modulo 90° must not turn the
    // room sideways, or every stored member on it would reinterpret.
    const space = getCeilingLocalSpace([
      { x: 0, y: 0 },
      { x: 3000, y: 0 },
      { x: 3000, y: 5000 },
      { x: 0, y: 5000 },
    ]);
    expect(space).toMatchObject({ rotation: 0, length: 3000, depth: 5000 });
    expect(space.toLocal({ x: 0, y: 5000 })).toEqual({ u: 0, v: 0 });
  });

  it('aligns U with the longest edge of a rotated boundary', () => {
    const angle = Math.PI / 6;
    const space = getCeilingLocalSpace(rotatedRectBoundary(angle, { x: 1200, y: -700 }));

    // The frame turns with the ceiling: local dimensions are the true edge
    // lengths, not the plan bounding box of the rotated shape.
    expect(space.rotation).toBeCloseTo(angle, 9);
    expect(space.length).toBeCloseTo(6000, 6);
    expect(space.depth).toBeCloseTo(4000, 6);

    // Every boundary corner lands on a corner of the local rect...
    const corners = rotatedRectBoundary(angle, { x: 1200, y: -700 }).map((point) => space.toLocal(point));
    for (const corner of corners) {
      expect(Math.min(Math.abs(corner.u), Math.abs(corner.u - 6000))).toBeLessThan(1e-6);
      expect(Math.min(Math.abs(corner.v), Math.abs(corner.v - 4000))).toBeLessThan(1e-6);
    }

    // ...and the mapping round-trips.
    const plan = { x: 2500, y: 900 };
    const roundTripped = space.toPlan(space.toLocal(plan));
    expect(roundTripped.x).toBeCloseTo(plan.x, 6);
    expect(roundTripped.y).toBeCloseTo(plan.y, 6);
  });

  it('generates framing parallel to a rotated ceiling instead of crossing it', () => {
    const ceiling = createCeiling('Rotated', {
      id: 'ceiling_rotated',
      boundaryPolygon: rotatedRectBoundary(Math.PI / 6),
    });
    const members = deriveCeilingFramingMembers(ceiling, null);
    const furring = members.filter((member) => member.kind === 'furring');
    expect(furring.length).toBeGreaterThan(0);

    // In the old north-up frame the diamond clipped every row to a different
    // stub; in the edge-aligned frame each furring row runs the full ceiling.
    for (const member of furring) {
      expect(member.u1 - member.u0).toBeCloseTo(6000, 5);
    }
  });
});

describe('ceiling elevations', () => {
  it('treats the manual base elevation as the board underside', () => {
    const elevations = resolveCeilingElevations(null, rectCeiling());
    expect(elevations).toEqual({
      attachment: 2700,
      boardUnderside: 2700,
      boardTop: 2704.5,
      furringBottom: 2704.5,
      furringTop: 2723.5,
      carrierBottom: 2723.5,
      carrierTop: 2761.5,
      // Nothing to hang from, so there is neither a soffit nor a bearing level
      // to reach down to.
      supportSoffit: null,
      supportBearing: null,
    });
    expect(ceilingElevationRange(elevations)).toEqual({ min: 2700, max: 2761.5 });
  });

  it('hangs the board below the beam tops by the suspension drop', () => {
    const project = {
      floors: [{ id: 'floor_1', elevation: 0, columns: RING_COLUMNS, beams: beamRing(3200) }],
    };
    const ceiling = rectCeiling({
      floorId: 'floor_1',
      attachment: { mode: 'beam', beamIds: ['beam_s', 'beam_n'] },
      detailing: { suspension: { drop: 250 } },
    });

    const elevations = resolveCeilingElevations(project, ceiling);
    expect(elevations.attachment).toBe(3200);
    expect(elevations.boardUnderside).toBe(2950);
    expect(elevations.boardTop).toBe(2954.5);
    expect(elevations.carrierTop).toBe(3011.5);
    // 450-deep beams, so the bay the boards hang in bottoms out at 2750.
    expect(elevations.supportSoffit).toBe(2750);
  });

  it('reaches the band down to the soffit of the beams a ceiling hangs in', () => {
    const project = {
      floors: [{ id: 'floor_1', elevation: 0, columns: RING_COLUMNS, beams: beamRing(3200) }],
    };
    const ceiling = rectCeiling({ floorId: 'floor_1', attachment: { mode: 'beam', beamIds: ['beam_s', 'beam_n'] } });

    // The boards sit at 3050, but the walls fitted under the 450-deep beams stop
    // at 2750 and still divide the bay, so the band has to see that far down.
    expect(ceilingElevationRange(resolveCeilingElevations(project, ceiling))).toEqual({ min: 2750, max: 3200 });
  });

  it('takes the lowest soffit when the supports are different depths', () => {
    const project = {
      floors: [
        {
          id: 'floor_1',
          elevation: 0,
          columns: RING_COLUMNS,
          beams: [
            ringBeam('beam_s', 'col_sw', 'col_se', 3200),
            { ...ringBeam('beam_n', 'col_nw', 'col_ne', 3200), depth: 600 },
          ],
        },
      ],
    };
    const ceiling = rectCeiling({ floorId: 'floor_1', attachment: { mode: 'beam', beamIds: ['beam_s', 'beam_n'] } });

    expect(resolveCeilingElevations(project, ceiling).supportSoffit).toBe(2600);
  });

  it('takes a beam with no usable depth at its own level', () => {
    const project = {
      floors: [
        {
          id: 'floor_1',
          elevation: 0,
          columns: RING_COLUMNS,
          beams: [{ ...ringBeam('beam_s', 'col_sw', 'col_se', 3200), depth: null }],
        },
      ],
    };
    const ceiling = rectCeiling({ floorId: 'floor_1', attachment: { mode: 'beam', beamIds: ['beam_s'] } });

    expect(resolveCeilingElevations(project, ceiling).supportSoffit).toBe(3200);
  });

  it('keeps the boards as the band bottom when they hang below the soffit', () => {
    const project = {
      floors: [{ id: 'floor_1', elevation: 0, columns: RING_COLUMNS, beams: beamRing(3200) }],
    };
    const ceiling = rectCeiling({
      floorId: 'floor_1',
      attachment: { mode: 'beam', beamIds: ['beam_s', 'beam_n'] },
      // Dropped further than the beams are deep: the boards are now the lowest
      // thing the assembly owns, and the band bottoms out on them.
      detailing: { suspension: { drop: 600 } },
    });

    const elevations = resolveCeilingElevations(project, ceiling);
    expect(elevations.boardUnderside).toBe(2600);
    expect(elevations.supportSoffit).toBe(2750);
    expect(ceilingElevationRange(elevations).min).toBe(2600);
  });

  it('reads the bearing level off the columns the support beams stand on', () => {
    const project = {
      floors: [{ id: 'floor_1', elevation: 0, columns: RING_COLUMNS, beams: beamRing(3200) }],
    };
    const ceiling = rectCeiling({ floorId: 'floor_1', attachment: { mode: 'beam', beamIds: ['beam_s', 'beam_n'] } });

    const elevations = resolveCeilingElevations(project, ceiling);

    // Beams sitting on their columns: the bearing level is the beam top, so the
    // soffit 450 below it is still the lowest thing the band has to reach.
    expect(elevations.supportBearing).toBe(3200);
    expect(elevations.supportSoffit).toBe(2750);
    expect(ceilingElevationRange(elevations).min).toBe(2750);
  });

  it('reaches the band down to the bearing when the beams are lifted off their columns', () => {
    const project = {
      floors: [{ id: 'floor_1', elevation: 0, columns: RING_COLUMNS, beams: beamRing(3800) }],
    };
    const ceiling = rectCeiling({ floorId: 'floor_1', attachment: { mode: 'beam', beamIds: ['beam_s', 'beam_n'] } });

    const elevations = resolveCeilingElevations(project, ceiling);

    // The beams have been retyped 600 above the 3200 columns carrying them —
    // further than they are deep, so the soffit rode up past the column heads to
    // 3350. Those heads are still where the support stops, and the columns get
    // built up through the gap to meet the beams, so the band bottoms out on the
    // bearing at 3200 instead of losing everything standing below the soffit.
    expect(elevations.supportSoffit).toBe(3350);
    expect(elevations.supportBearing).toBe(3200);
    expect(ceilingElevationRange(elevations)).toEqual({ min: 3200, max: 3800 });
  });

  it('takes the highest bearing when the supports stand on columns of different heights', () => {
    const columns = RING_COLUMNS.map((column) => (column.id === 'col_nw' ? { ...column, height: 2900 } : column));
    const project = { floors: [{ id: 'floor_1', elevation: 0, columns, beams: beamRing(3600) }] };
    const ceiling = rectCeiling({
      floorId: 'floor_1',
      attachment: { mode: 'beam', beamIds: ['beam_s', 'beam_n', 'beam_w', 'beam_e'] },
    });

    // The bearing level states where the bay's structure stood before the beams
    // were raised off it, and that is the highest head its supports stand on:
    // one column stopped 300 short describes its own corner, not the storey.
    expect(resolveCeilingElevations(project, ceiling).supportBearing).toBe(3200);
  });

  it('reads the tall columns of a bay whose every beam also touches a short one', () => {
    // Both beams run from a 3200 head to a 2000 stub, so the lowest head under
    // each single beam is the stub — the case a per-beam minimum gets wrong
    // twice over. Per end, the bay still reads the level its tall supports
    // stand at.
    const columns = RING_COLUMNS.map((column) =>
      column.id === 'col_se' || column.id === 'col_ne' ? { ...column, height: 2000 } : column,
    );
    const project = {
      floors: [
        {
          id: 'floor_1',
          elevation: 0,
          columns,
          beams: [ringBeam('beam_s', 'col_sw', 'col_se', 3600), ringBeam('beam_n', 'col_nw', 'col_ne', 3600)],
        },
      ],
    };
    const ceiling = rectCeiling({ floorId: 'floor_1', attachment: { mode: 'beam', beamIds: ['beam_s', 'beam_n'] } });

    expect(resolveCeilingElevations(project, ceiling).supportBearing).toBe(3200);
  });

  it('takes the column end of a beam whose other end is a bare point', () => {
    const halfPointBeam = (id, columnId, end, level) => ({
      ...createBeam({ kind: 'column', id: columnId }, { kind: 'point', ...end }, 250, 450, level),
      id,
    });
    const bearingWithStorey = (floorToFloorHeight) => {
      const project = {
        floors: [
          {
            id: 'floor_1',
            elevation: 0,
            floorToFloorHeight,
            columns: RING_COLUMNS,
            beams: [
              halfPointBeam('beam_s', 'col_sw', { x: 6000, y: 0 }, 3600),
              halfPointBeam('beam_n', 'col_nw', { x: 6000, y: 4000 }, 3600),
            ],
          },
        ],
      };
      const ceiling = rectCeiling({ floorId: 'floor_1', attachment: { mode: 'beam', beamIds: ['beam_s', 'beam_n'] } });
      return resolveCeilingElevations(project, ceiling).supportBearing;
    };

    // One end names a column and the other names nothing. The fallback answers
    // for a beam with no readable support at all, not for the half of one that
    // has it — so the 3200 heads govern whether the storey stands below them or
    // above, and neither storey can fake or overrule the answer.
    expect(bearingWithStorey(2800)).toBe(3200);
    expect(bearingWithStorey(4200)).toBe(3200);
  });

  it('ignores an end whose column is gone rather than letting it speak for the one left', () => {
    const project = {
      floors: [
        {
          id: 'floor_1',
          elevation: 0,
          // Above the columns, so a fallback let in per end would be visible: a
          // 4200 answer could only have come from the deleted end.
          floorToFloorHeight: 4200,
          columns: RING_COLUMNS.filter((column) => column.id !== 'col_se'),
          beams: [ringBeam('beam_s', 'col_sw', 'col_se', 3600)],
        },
      ],
    };
    const ceiling = rectCeiling({ floorId: 'floor_1', attachment: { mode: 'beam', beamIds: ['beam_s'] } });

    // The deleted end resolves to nothing at all — not to the storey height,
    // which would be a fallback overruling a column that is still standing.
    expect(resolveCeilingElevations(project, ceiling).supportBearing).toBe(3200);
  });

  // The same bearing statements the scalar summarises, kept as positions so a
  // caller can ask which support a particular thing stands beside instead of
  // being handed the bay's highest plane and nothing else.
  describe('as positioned bearing ends', () => {
    const bearingEnds = (project, ceiling) => resolveCeilingElevations(project, ceiling).supportBearingEnds;
    const describeEnd = (end) => `${end.x},${end.y}@${end.level}`;

    it('names every beam end of a uniform bay at its own column centre', () => {
      const project = { floors: [{ id: 'floor_1', elevation: 0, columns: RING_COLUMNS, beams: beamRing(3200) }] };
      const ceiling = rectCeiling({
        floorId: 'floor_1',
        attachment: { mode: 'beam', beamIds: ['beam_s', 'beam_n', 'beam_w', 'beam_e'] },
      });

      const ends = bearingEnds(project, ceiling);

      // Eight, not four: the ring's four beams have two ends each and every
      // corner column carries two of them. Nothing is deduplicated, because a
      // corner that two beams bear on is two statements about that corner — and
      // repeating the same position at the same level cannot change which one is
      // nearest to anything, so there is nothing to gain by collapsing them.
      expect(ends).toHaveLength(8);
      expect([...new Set(ends.map(describeEnd))].sort()).toEqual([
        '0,0@3200',
        '0,4000@3200',
        '6000,0@3200',
        '6000,4000@3200',
      ]);
    });

    it('carries the level of each end where the bay steps', () => {
      const columns = RING_COLUMNS.map((column) => (column.id === 'col_ne' ? { ...column, height: 2000 } : column));
      const project = { floors: [{ id: 'floor_1', elevation: 0, columns, beams: beamRing(3600) }] };
      const ceiling = rectCeiling({
        floorId: 'floor_1',
        attachment: { mode: 'beam', beamIds: ['beam_s', 'beam_n', 'beam_w', 'beam_e'] },
      });

      const elevations = resolveCeilingElevations(project, ceiling);

      // The stub is not averaged away and does not take the bay over: it states
      // its own corner twice, at the level it actually stops at, while the
      // scalar goes on reporting the bay's highest plane.
      expect(elevations.supportBearing).toBe(3200);
      expect(elevations.supportBearingEnds.filter((end) => end.level === 2000).map(describeEnd)).toEqual([
        '6000,4000@2000',
        '6000,4000@2000',
      ]);
    });

    it('anchors the storey-top fallback at the points a bare beam was drawn on', () => {
      const pointBeam = (id, start, end) => ({
        ...createBeam({ kind: 'point', ...start }, { kind: 'point', ...end }, 250, 450, 3600),
        id,
      });
      const project = {
        floors: [
          {
            id: 'floor_1',
            elevation: 0,
            floorToFloorHeight: 2800,
            columns: RING_COLUMNS,
            beams: [pointBeam('beam_s', { x: 0, y: 0 }, { x: 6000, y: 0 })],
          },
        ],
      };
      const ceiling = rectCeiling({ floorId: 'floor_1', attachment: { mode: 'beam', beamIds: ['beam_s'] } });

      // A beam that names no column bears on nothing readable, so both its ends
      // report the storey top — placed where that beam is, not floated over the
      // bay. Deliberately not the 3200 columns standing at those points: the
      // beam does not claim them.
      expect(bearingEnds(project, ceiling).map(describeEnd)).toEqual(['0,0@2800', '6000,0@2800']);
    });

    it('lets a deleted end contribute nothing rather than a fallback beside a live column', () => {
      const project = {
        floors: [
          {
            id: 'floor_1',
            elevation: 0,
            // Above the columns, so a fallback let in per end would be visible.
            floorToFloorHeight: 4200,
            columns: RING_COLUMNS.filter((column) => column.id !== 'col_se'),
            beams: [ringBeam('beam_s', 'col_sw', 'col_se', 3600)],
          },
        ],
      };
      const ceiling = rectCeiling({ floorId: 'floor_1', attachment: { mode: 'beam', beamIds: ['beam_s'] } });

      // One live head, one ref to a column that is gone. The live end speaks;
      // the deleted one has no place to speak from, and a storey-top entry
      // dropped at its old corner would be the field inventing a support.
      expect(bearingEnds(project, ceiling).map(describeEnd)).toEqual(['0,0@3200']);
    });

    it('says nothing at all for a ceiling with nothing to hang from', () => {
      // Absent rather than empty, so the elevations of a manual ceiling are the
      // same object they have always been — see the shape pinned by 'treats the
      // manual base elevation as the board underside' above.
      expect(bearingEnds(null, rectCeiling())).toBeUndefined();

      const project = { floors: [{ id: 'floor_1', elevation: 0, columns: RING_COLUMNS, beams: beamRing(3200) }] };
      const stranded = rectCeiling({ floorId: 'floor_1', attachment: { mode: 'beam', beamIds: ['beam_gone'] } });
      expect(bearingEnds(project, stranded)).toBeUndefined();
    });
  });

  it('falls back to the top of the storey for a beam that spans bare points', () => {
    const pointBeam = (id, start, end) => ({
      ...createBeam({ kind: 'point', ...start }, { kind: 'point', ...end }, 250, 450, 3600),
      id,
    });
    const project = {
      floors: [
        {
          id: 'floor_1',
          elevation: 0,
          floorToFloorHeight: 2800,
          columns: RING_COLUMNS,
          beams: [
            pointBeam('beam_s', { x: 0, y: 0 }, { x: 6000, y: 0 }),
            pointBeam('beam_n', { x: 0, y: 4000 }, { x: 6000, y: 4000 }),
          ],
        },
      ],
    };
    const ceiling = rectCeiling({ floorId: 'floor_1', attachment: { mode: 'beam', beamIds: ['beam_s', 'beam_n'] } });

    // Nothing named to bear on — the beam is drawn between two points, not two
    // columns — so the storey height is the only statement left about where its
    // support stops. Deliberately not the 3200 columns standing under it: the
    // beam does not claim them.
    expect(resolveCeilingElevations(project, ceiling).supportBearing).toBe(2800);
    expect(ceilingElevationRange(resolveCeilingElevations(project, ceiling)).min).toBe(2800);
  });

  it('keeps the boards as the band bottom when they hang below the bearing too', () => {
    const project = {
      floors: [{ id: 'floor_1', elevation: 0, columns: RING_COLUMNS, beams: beamRing(3200) }],
    };
    const ceiling = rectCeiling({
      floorId: 'floor_1',
      attachment: { mode: 'beam', beamIds: ['beam_s', 'beam_n'] },
      detailing: { suspension: { drop: 900 } },
    });

    // Dropped below the soffit and below the bearing: the boards win the min
    // against both, because the band is simply the lowest of the three.
    const elevations = resolveCeilingElevations(project, ceiling);
    expect(elevations.boardUnderside).toBe(2300);
    expect(elevations.supportSoffit).toBe(2750);
    expect(elevations.supportBearing).toBe(3200);
    expect(ceilingElevationRange(elevations).min).toBe(2300);
  });

  it('takes the lowest beam top when the supports disagree', () => {
    const project = {
      floors: [
        {
          id: 'floor_1',
          elevation: 0,
          columns: RING_COLUMNS,
          beams: [ringBeam('beam_s', 'col_sw', 'col_se', 3200), ringBeam('beam_n', 'col_nw', 'col_ne', 3194)],
        },
      ],
    };
    const ceiling = rectCeiling({ floorId: 'floor_1', attachment: { mode: 'beam', beamIds: ['beam_s', 'beam_n'] } });

    expect(resolveCeilingElevations(project, ceiling).attachment).toBe(3194);
  });

  it('keeps the last known plane when a beam-attached ceiling has no beam left', () => {
    const ceiling = rectCeiling({
      floorId: 'floor_1',
      baseElevation: 3200,
      attachment: { mode: 'beam', beamIds: ['beam_gone'] },
    });
    const elevations = resolveCeilingElevations({ floors: [{ id: 'floor_1', beams: [] }] }, ceiling);

    expect(elevations.attachment).toBe(3200);
    expect(elevations.boardUnderside).toBe(3050);
    // No beam left to read a soffit or a bearing off, so the boards bound the
    // band again.
    expect(elevations.supportSoffit).toBeNull();
    expect(elevations.supportBearing).toBeNull();
    expect(ceilingElevationRange(elevations).min).toBe(3050);
  });
});

describe('ceiling panels', () => {
  it('lays a deterministic board grid over the boundary', () => {
    const ceiling = rectCeiling();
    const panels = deriveCeilingPanels(ceiling, null);

    // pitch 1225 × 2444 over 6000 × 4000 -> 5 columns × 2 rows.
    expect(panels).toHaveLength(10);
    expect(panels[0].id).toBe('ceiling_test:panel:grid-c0-r0');
    expect(panels[0].localId).toBe('grid-c0-r0');
    expect(panels[0].index).toBe(1);
    expect(panels[0].label).toBe('P1');
    expect(panels[0].source).toBe('generated');
    expect(panels[0].polygonal).toBe(false);
    expect(panels[0].netArea).toBeCloseTo(panels[0].grossArea, 3);
    expect(panels[0].regions[0].outline).toHaveLength(4);
    expect(deriveCeilingPanels(ceiling, null).map((panel) => panel.id)).toEqual(panels.map((panel) => panel.id));
  });

  it('clips panels to an L-shaped boundary', () => {
    const panels = deriveCeilingPanels(lCeiling(), null);

    const clipped = panels.find((panel) => panel.u0 === 3675 && panel.v0 === 0);
    expect(clipped.polygonal).toBe(true);
    expect(clipped.grossArea).toBeCloseTo(1219 * 2438, 3);
    // Only the v 2000..2438 sliver of that board survives above the notch.
    expect(Math.abs(clipped.netArea - 1219 * 438)).toBeLessThan(1);

    const untouched = panels.find((panel) => panel.u0 === 0 && panel.v0 === 0);
    expect(untouched.polygonal).toBe(false);
    expect(Math.abs(untouched.netArea - untouched.grossArea)).toBeLessThan(1);

    // Nothing survives entirely inside the notch.
    expect(panels.every((panel) => panel.netArea > 0.01)).toBe(true);
  });

  it('subtracts openings as holes and reduces the net area', () => {
    const ceiling = rectCeiling({
      detailing: { openings: [{ id: 'hatch', u: 500, v: 500, width: 600, height: 600 }] },
    });
    const panels = deriveCeilingPanels(ceiling, null);
    const host = panels.find((panel) => panel.u0 === 0 && panel.v0 === 0);

    expect(host.polygonal).toBe(true);
    expect(host.regions).toHaveLength(1);
    expect(host.regions[0].holes).toHaveLength(1);
    expect(Math.abs(host.grossArea - host.netArea - 600 * 600)).toBeLessThan(1);
    expect(host.regions[0].holes[0][0]).toHaveProperty('u');
    expect(host.regions[0].holes[0][0]).toHaveProperty('v');
  });

  it('splits a panel when an opening crosses its edge', () => {
    const ceiling = rectCeiling({
      detailing: { openings: [{ id: 'slot', u: 400, v: -100, width: 400, height: 3000 }] },
    });
    const host = deriveCeilingPanels(ceiling, null).find((panel) => panel.u0 === 0 && panel.v0 === 0);

    expect(host.regions.length).toBeGreaterThan(1);
    expect(host.netArea).toBeLessThan(host.grossArea);
  });

  it('honours custom panel outlines', () => {
    const ceiling = rectCeiling({
      detailing: {
        face: {
          layout: {
            mode: 'custom',
            customPanels: [
              {
                id: 'cut-panel',
                label: 'Bulkhead',
                outlinePoints: [
                  { u: 0, v: 0 },
                  { u: 1000, v: 0 },
                  { u: 1000, v: 1000 },
                  { u: 500, v: 1000 },
                  { u: 500, v: 500 },
                  { u: 0, v: 500 },
                ],
              },
            ],
          },
        },
      },
    });

    const panels = deriveCeilingPanels(ceiling, null);
    expect(panels).toHaveLength(1);
    expect(panels[0].source).toBe('custom');
    expect(panels[0].label).toBe('Bulkhead');
    expect(panels[0].polygonal).toBe(true);
    expect(Math.abs(panels[0].netArea - 750000)).toBeLessThan(1);
  });

  it('returns nothing when detailing or the face is disabled', () => {
    expect(deriveCeilingPanels(rectCeiling({ detailing: { enabled: false } }), null)).toEqual([]);
    expect(deriveCeilingPanels(rectCeiling({ detailing: { face: { enabled: false } } }), null)).toEqual([]);
  });
});

/**
 * Half a ceiling in fiber cement and the rest in plywood is one ceiling with two
 * board materials, so a board may name its own. Only a board that says so
 * differs: everything else is the profile's material, and a generated grid is
 * all of it.
 */
describe('per-board ceiling materials', () => {
  const MIXED_PANELS = [
    { id: 'left', u: 0, v: 0, width: 1200, height: 2400, material: 'plywood' },
    { id: 'right', u: 1300, v: 0, width: 1200, height: 2400 },
  ];

  function mixedCeiling(overrides = {}) {
    return rectCeiling({
      detailing: { face: { layout: { mode: 'custom', customPanels: MIXED_PANELS }, ...overrides } },
    });
  }

  it('keeps a stored override only when it names a material the profile system knows', () => {
    const face = createCeilingFace({
      layout: {
        mode: 'custom',
        customPanels: [
          { id: 'a', material: 'plywood' },
          { id: 'b', material: 'unobtanium' },
          { id: 'c', material: undefined },
          { id: 'd' },
        ],
      },
    });

    expect(face.layout.customPanels[0].material).toBe('plywood');
    // Absent is the only way to say "inherit", so an unknown or cleared value
    // leaves no key behind for the derivation to trip over.
    for (const index of [1, 2, 3]) expect('material' in face.layout.customPanels[index]).toBe(false);
  });

  it('gives an overridden board its own material and the rest the profile default', () => {
    const panels = deriveCeilingPanels(mixedCeiling(), null);

    expect(panels.map((panel) => panel.material)).toEqual(['plywood', 'fiber_cement']);
  });

  it('boards a generated grid entirely in the profile material', () => {
    const plywoodCeiling = rectCeiling({ detailing: { face: { productProfileId: 'generic-plywood-ceiling-v1' } } });

    expect(deriveCeilingPanels(rectCeiling(), null).every((panel) => panel.material === 'fiber_cement')).toBe(true);
    expect(deriveCeilingPanels(plywoodCeiling, null).every((panel) => panel.material === 'plywood')).toBe(true);
  });

  it('follows the profile with the boards that never overrode it', () => {
    const panels = deriveCeilingPanels(mixedCeiling({ productProfileId: 'generic-plywood-ceiling-v1' }), null);

    // The override was already plywood, so only the inheriting board moves.
    expect(panels.map((panel) => panel.material)).toEqual(['plywood', 'plywood']);
  });
});

describe('ceiling framing', () => {
  it('runs furring across U and carriers along V with a wall angle per boundary edge', () => {
    const members = deriveCeilingFramingMembers(rectCeiling(), null);
    const furring = members.filter((member) => member.kind === 'furring');
    const carriers = members.filter((member) => member.kind === 'carrier');
    const wallAngle = members.filter((member) => member.kind === 'wall_angle');

    // Rows at 406 … 3629 between a whole member laid hard against each of the
    // two edges the boards die into. Those two edge rows stand in for the
    // module's own first and last station, which fell within a member's width
    // of them.
    expect(furring).toHaveLength(11);
    expect(furring.every((member) => member.orientation === 'horizontal' && member.depth === 19)).toBe(true);
    expect(furring.every((member) => member.u0 === 0 && member.u1 === 6000)).toBe(true);
    expect(furring[0].v0).toBe(0);
    expect(furring[0].v1).toBe(50);
    expect(furring[0].id).toBe('ceiling_test:auto:furring:e0:0');
    expect(furring.at(-1).v0).toBe(3950);
    expect(furring.at(-1).v1).toBe(4000);
    expect(furring.at(-1).id).toBe('ceiling_test:auto:furring:e1:0');
    // The module rows in between keep the ids they have always had.
    expect(furring[1].id).toBe('ceiling_test:auto:furring:1:0');
    expect(furring[1].v0).toBe(381);

    // Columns at 1220 … 4880, edge-hugging carriers at both ends.
    expect(carriers).toHaveLength(6);
    expect(carriers.every((member) => member.orientation === 'vertical' && member.depth === 38)).toBe(true);
    expect(carriers.every((member) => member.v0 === 0 && member.v1 === 4000)).toBe(true);
    expect(carriers[0]).toMatchObject({ id: 'ceiling_test:auto:carrier:e0:0', u0: 0, u1: 12 });
    expect(carriers.at(-1)).toMatchObject({ id: 'ceiling_test:auto:carrier:e1:0', u0: 5988, u1: 6000 });

    expect(wallAngle).toHaveLength(4);
    expect(wallAngle[0].start).toBeDefined();
    expect(wallAngle[0].u0).toBeUndefined();
    // Angles run half a leg inboard of the edge so the leg sits in the room
    // rather than in the wall, which takes 12.5 mm off each end of all four
    // runs: 20000 − 8 × 12.5.
    expect(
      wallAngle.reduce(
        (total, member) => total + Math.hypot(member.end.u - member.start.u, member.end.v - member.start.v),
        0,
      ),
    ).toBeCloseTo(19900, 6);
    expect(members.every((member) => member.material === 'light_gauge_steel')).toBe(true);
  });

  it('applies the framing material to generated and drawn members alike', () => {
    const ceiling = rectCeiling({
      detailing: {
        framing: {
          material: 'timber',
          // A member drawn while the ceiling was still steel: the one material
          // select governs the whole grid, so it turns timber too.
          members: [{ id: 'drawn', kind: 'furring', u0: 0, u1: 6000, v0: 100, v1: 125, material: 'light_gauge_steel' }],
        },
      },
    });
    const members = deriveCeilingFramingMembers(ceiling, null);
    expect(members.length).toBeGreaterThan(1);
    expect(members.every((member) => member.material === 'timber')).toBe(true);

    // Unknown stored values fall back to steel instead of leaking through.
    expect(createCeilingFraming({ material: 'unobtanium' }).material).toBe('light_gauge_steel');
    expect(createCeilingFraming({ material: 'timber' }).material).toBe('timber');
  });

  it('shortens furring fragments inside the L-shaped notch', () => {
    const members = deriveCeilingFramingMembers(lCeiling(), null);
    const furring = members.filter((member) => member.kind === 'furring');
    const inNotchBand = furring.filter((member) => (member.v0 + member.v1) / 2 < 2000);
    const aboveNotch = furring.filter((member) => (member.v0 + member.v1) / 2 > 2000);

    expect(inNotchBand.length).toBeGreaterThan(0);
    expect(inNotchBand.every((member) => member.u0 === 0 && Math.abs(member.u1 - 3000) < 0.01)).toBe(true);
    expect(aboveNotch.every((member) => Math.abs(member.u1 - 6000) < 0.01)).toBe(true);

    const carriers = members.filter((member) => member.kind === 'carrier');
    const notchCarriers = carriers.filter((member) => (member.u0 + member.u1) / 2 > 3000);
    expect(notchCarriers.length).toBeGreaterThan(0);
    expect(notchCarriers.every((member) => Math.abs(member.v0 - 2000) < 0.01)).toBe(true);
    expect(members.filter((member) => member.kind === 'wall_angle')).toHaveLength(6);
  });

  it('stops a band at a nick instead of sizing the member off its bounding box', () => {
    // A furring row landing half across the nick's return: what survives the
    // clip is an L, and a member sized off the box around it would run the full
    // width of the ceiling at full height, out over the missing bite.
    //
    // The nick's return is 300 long, short of one bay of the tightest module,
    // so it draws no edge station of its own — which is exactly the case the
    // run-finder still has to answer for.
    const members = deriveCeilingFramingMembers(nickedCeiling(), null);
    const straddling = members
      .filter((member) => member.kind === 'furring' && member.v0 < 406 && member.v1 > 406)
      .sort((first, second) => first.u0 - second.u0);

    expect(straddling).toHaveLength(2);
    expect(straddling[0].u0).toBeCloseTo(0, 6);
    expect(straddling[0].u1).toBeCloseTo(3000, 6);
    expect(straddling[1].u0).toBeCloseTo(3300, 6);
    expect(straddling[1].u1).toBeCloseTo(6000, 6);
  });

  it('lays a member hard against every region edge that runs with its module', () => {
    // The L's inner return at v 2000 is a face the boards die into just as much
    // as the perimeter is, so it carries a whole member with its own face on it
    // rather than whichever fraction of one the module happened to leave there.
    const members = deriveCeilingFramingMembers(lCeiling(), null);
    const furring = members.filter((member) => member.kind === 'furring');
    const carriers = members.filter((member) => member.kind === 'carrier');

    const onReturn = furring.find((member) => Math.abs(member.v0 - 2000) < 0.01);
    expect(onReturn).toMatchObject({ id: 'ceiling_l:auto:furring:e1:0', v1: 2050, u0: 0, u1: 6000 });

    // …and the return running the other way, at u 3000, carries a carrier whose
    // own face stands on it.
    const onLeg = carriers.find((member) => Math.abs(member.u1 - 3000) < 0.01);
    expect(onLeg).toMatchObject({ id: 'ceiling_l:auto:carrier:e1:0', u0: 2988, v0: 0, v1: 4000 });

    // A face shorter than one bay of the tightest module is left to the members
    // running past it: the nick's 300 mm return draws no station of its own.
    expect(
      deriveCeilingFramingMembers(nickedCeiling(), null).some(
        (member) => member.kind === 'furring' && Math.abs(member.v0 - 406) < 0.01,
      ),
    ).toBe(false);
  });

  it('frames each opening with four trimmers', () => {
    const ceiling = rectCeiling({
      detailing: { openings: [{ id: 'hatch', u: 1000, v: 1000, width: 600, height: 600 }] },
    });
    const trimmers = deriveCeilingFramingMembers(ceiling, null).filter((member) => member.kind === 'trimmer');

    expect(trimmers).toHaveLength(4);
    expect(trimmers.map((member) => member.id)).toEqual([
      'ceiling_test:auto:trimmer:hatch:bottom',
      'ceiling_test:auto:trimmer:hatch:top',
      'ceiling_test:auto:trimmer:hatch:left',
      'ceiling_test:auto:trimmer:hatch:right',
    ]);
    const bottom = trimmers[0];
    expect(bottom.v0).toBe(950);
    expect(bottom.v1).toBe(1000);
    expect(bottom.orientation).toBe('horizontal');
    expect(trimmers[2].orientation).toBe('vertical');
    expect(trimmers[2].u0).toBe(950);
    expect(trimmers[2].u1).toBe(1000);
  });

  it('honours removedGeneratedIds and appends custom members', () => {
    const baseline = deriveCeilingFramingMembers(rectCeiling(), null);
    const removedId = baseline.find((member) => member.kind === 'furring').id;
    const ceiling = rectCeiling({
      detailing: {
        framing: {
          removedGeneratedIds: [removedId],
          members: [{ id: 'custom-1', orientation: 'horizontal', u0: 0, u1: 2000, v0: 100, v1: 150 }],
        },
      },
    });

    const members = deriveCeilingFramingMembers(ceiling, null);
    expect(members.some((member) => member.id === removedId)).toBe(false);
    expect(members).toHaveLength(baseline.length);
    expect(members.at(-1)).toMatchObject({ id: 'custom-1', kind: 'furring', custom: true });
  });

  it('uses only custom members in custom framing mode', () => {
    const ceiling = rectCeiling({
      detailing: {
        framing: {
          mode: 'custom',
          members: [{ id: 'custom-1', orientation: 'vertical', u0: 0, u1: 50, v0: 0, v1: 4000 }],
        },
      },
    });

    const members = deriveCeilingFramingMembers(ceiling, null);
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ id: 'custom-1', kind: 'carrier', custom: true });
  });
});

describe('ceiling hangers', () => {
  it('places a hanger at every carrier/station crossing', () => {
    const hangers = deriveCeilingHangers(rectCeiling(), null);
    // 6 carrier columns × 5 hanger stations (0, 1200, 2400, 3600, 4000).
    expect(hangers).toHaveLength(30);
    // The corner station is on the boundary, so the rod steps in by half its
    // own width to stand beside the edge rather than across it.
    expect(hangers[0]).toMatchObject({ id: 'ceiling_test:auto:hanger:0:0', u: 5, v: 5, source: 'generated' });
    expect(hangers).toContainEqual(expect.objectContaining({ id: 'ceiling_test:auto:hanger:1:1', u: 1220, v: 1200 }));
  });

  it('drops hangers that fall outside the boundary', () => {
    const hangers = deriveCeilingHangers(lCeiling(), null);
    expect(hangers.length).toBeGreaterThan(0);
    expect(hangers.length).toBeLessThan(30);
    expect(hangers.every((hanger) => !(hanger.u > 3000 && hanger.v < 2000))).toBe(true);
    expect(hangers.some((hanger) => hanger.u > 3000 && hanger.v > 2000)).toBe(true);
  });
});

describe('ceiling fasteners', () => {
  it('generates supported perimeter and field screws inside the panels', () => {
    const ceiling = rectCeiling();
    const panels = deriveCeilingPanels(ceiling, null);
    const fasteners = deriveCeilingFasteners(ceiling, null);

    expect(fasteners.length).toBeGreaterThan(panels.length * 4);
    expect(fasteners.every((fastener) => fastener.source === 'generated')).toBe(true);
    expect(fasteners.every((fastener) => fastener.type === 'corrosion_resistant_screw')).toBe(true);
    expect(new Set(fasteners.map((fastener) => fastener.id)).size).toBe(fasteners.length);
    expect(fasteners.some((fastener) => fastener.edge === 'field')).toBe(true);
    expect(fasteners.some((fastener) => fastener.edge === 'left')).toBe(true);
    expect(fasteners.every((fastener) => fastener.u >= 0 && fastener.u <= 6000)).toBe(true);
    expect(fasteners.every((fastener) => panels.some((panel) => panel.id === fastener.panelId))).toBe(true);
  });

  it('honours removedGeneratedIds and appends manual fasteners', () => {
    const baseline = deriveCeilingFasteners(rectCeiling(), null);
    const ceiling = rectCeiling({
      detailing: {
        face: {
          fasteners: {
            removedGeneratedIds: [baseline[0].id],
            manual: [{ id: 'manual-1', u: 250, v: 250 }],
          },
        },
      },
    });

    const fasteners = deriveCeilingFasteners(ceiling, null);
    expect(fasteners.some((fastener) => fastener.id === baseline[0].id)).toBe(false);
    expect(fasteners).toHaveLength(baseline.length);
    expect(fasteners.at(-1)).toMatchObject({ id: 'manual-1', u: 250, v: 250, custom: true });
  });

  it('emits only manual fasteners in custom mode', () => {
    const ceiling = rectCeiling({
      detailing: { face: { fasteners: { mode: 'custom', manual: [{ id: 'manual-1', u: 250, v: 250 }] } } },
    });
    expect(deriveCeilingFasteners(ceiling, null)).toHaveLength(1);
  });
});

describe('derived ceiling lighting', () => {
  function litCeiling(fixtures, options = {}) {
    return rectCeiling({ ...options, detailing: { ...options.detailing, lighting: { fixtures } } });
  }

  it('puts a fixture in plan and on the board underside', () => {
    const ceiling = litCeiling([{ id: 'l1', u: 1200, v: 800 }]);
    const [fixture] = deriveCeilingLightFixtures(ceiling, null);

    // Local V is mirrored against plan y, so v 800 on a 4000-deep ceiling is
    // y 3200 — the same frame the RCP draws in.
    expect(fixture.plan).toEqual({ x: 1200, y: 3200 });
    expect(fixture.elevations).toEqual({ mountPlane: 2700, bulb: 2700 });
    expect(fixture.elevations.mountPlane).toBe(resolveCeilingElevations(null, ceiling).boardUnderside);
    expect(fixture.photometrics).toEqual({ lumens: 650, watts: 9, beamAngleDeg: 110, colorTempK: 2700 });
    expect(fixture.id).toBe('l1');
  });

  it('hangs a pendant below the plane it is fixed to', () => {
    const [pendant] = deriveCeilingLightFixtures(
      litCeiling([{ id: 'l1', u: 1200, v: 800, fixtureType: 'pendant', dropMm: 900 }]),
      null,
    );
    expect(pendant.elevations).toEqual({ mountPlane: 2700, bulb: 1800 });

    // A recessed can stores no drop, and would ignore one anyway.
    const [can] = deriveCeilingLightFixtures(litCeiling([{ id: 'l2', u: 100, v: 100, dropMm: 700 }]), null);
    expect(can.elevations.bulb).toBe(2700);
  });

  it('clamps a fixture the ceiling shrank away from', () => {
    const [fixture] = deriveCeilingLightFixtures(litCeiling([{ id: 'l1', u: 9000, v: -500 }]), null);
    expect(fixture.u).toBe(6000);
    expect(fixture.v).toBe(0);
    expect(fixture.plan).toEqual({ x: 6000, y: 4000 });
  });

  it('reads the beam-hung board underside as the mount plane', () => {
    const project = { floors: [{ id: 'floor_1', elevation: 0, columns: RING_COLUMNS, beams: beamRing(3200) }] };
    const ceiling = litCeiling([{ id: 'l1', u: 1000, v: 1000 }], {
      floorId: 'floor_1',
      attachment: { mode: 'beam', beamIds: ['beam_s', 'beam_n'] },
    });
    const [fixture] = deriveCeilingLightFixtures(ceiling, project);
    expect(fixture.elevations.mountPlane).toBe(3050);
  });

  it('draws nothing when the detailing is off', () => {
    expect(
      deriveCeilingLightFixtures(litCeiling([{ id: 'l1', u: 100, v: 100 }], { detailing: {} }), null),
    ).toHaveLength(1);
    const off = rectCeiling({ detailing: { enabled: false, lighting: { fixtures: [{ id: 'l1', u: 100, v: 100 }] } } });
    expect(deriveCeilingLightFixtures(off, null)).toEqual([]);
    expect(deriveCeilingLightFixtures(rectCeiling(), null)).toEqual([]);
  });
});

describe('ceiling takeoff and detail', () => {
  it('sums panels, framing and hangers', () => {
    const ceiling = rectCeiling();
    const panels = deriveCeilingPanels(ceiling, null);
    const takeoff = deriveCeilingTakeoff(ceiling, null);
    const installedArea = panels.reduce((total, panel) => total + panel.netArea, 0);

    expect(takeoff.enabled).toBe(true);
    expect(takeoff.panelCount).toBe(panels.length);
    expect(takeoff.installedAreaMm2).toBeCloseTo(installedArea, 3);
    expect(takeoff.stockSheetCount).toBe(Math.ceil(installedArea / (1219 * 2438)));
    expect(takeoff.fastenerCount).toBe(deriveCeilingFasteners(ceiling, null).length);
    expect(takeoff.furringLinearMm).toBeCloseTo(11 * 6000, 6);
    expect(takeoff.carrierLinearMm).toBeCloseTo(6 * 4000, 6);
    // 6000 × 4000 perimeter, less the half-leg inset at each of the 8 ends.
    expect(takeoff.wallAngleLinearMm).toBeCloseTo(19900, 6);
    expect(takeoff.trimmerLinearMm).toBe(0);
    expect(takeoff.hangerCount).toBe(30);
  });

  it('splits the boards by material, in the order the drawing uses them', () => {
    const ceiling = rectCeiling({
      detailing: {
        face: {
          layout: {
            mode: 'custom',
            customPanels: [
              { id: 'left', u: 0, v: 0, width: 1200, height: 600, material: 'plywood' },
              { id: 'middle', u: 1300, v: 0, width: 1200, height: 600 },
              { id: 'right', u: 2600, v: 0, width: 1200, height: 600, material: 'plywood' },
            ],
          },
        },
      },
    });
    const takeoff = deriveCeilingTakeoff(ceiling, null);
    const board = 1200 * 600;

    // First appearance orders the list: the plywood board is drawn first.
    expect(takeoff.materials.map((entry) => entry.material)).toEqual(['plywood', 'fiber_cement']);
    expect(takeoff.materials[0]).toMatchObject({ panelCount: 2, stockSheetCount: 1 });
    expect(takeoff.materials[0].installedAreaMm2).toBeCloseTo(2 * board, 3);
    expect(takeoff.materials[1]).toMatchObject({ panelCount: 1, stockSheetCount: 1 });
    expect(takeoff.materials[1].installedAreaMm2).toBeCloseTo(board, 3);

    // The totals are untouched: they still count the whole ceiling. Two
    // materials cost two sheets where one ceiling of the same area cost one,
    // which is exactly why the split is reported.
    expect(takeoff.panelCount).toBe(3);
    expect(takeoff.installedAreaMm2).toBeCloseTo(3 * board, 3);
    expect(takeoff.stockSheetCount).toBe(Math.ceil((3 * board) / (1219 * 2438)));
    expect(takeoff.stockSheetCount).toBe(1);
  });

  it('reports one material for a ceiling boarded in one material, and none for no boards', () => {
    expect(deriveCeilingTakeoff(rectCeiling(), null).materials).toEqual([
      {
        material: 'fiber_cement',
        panelCount: 10,
        installedAreaMm2: deriveCeilingTakeoff(rectCeiling(), null).installedAreaMm2,
        stockSheetCount: deriveCeilingTakeoff(rectCeiling(), null).stockSheetCount,
      },
    ]);
    expect(deriveCeilingTakeoff(rectCeiling({ detailing: { face: { enabled: false } } }), null).materials).toEqual([]);
  });

  it('counts the lighting by fixture and lamp together', () => {
    const ceiling = rectCeiling({
      detailing: {
        lighting: {
          fixtures: [
            { id: 'l1', u: 1000, v: 1000 },
            { id: 'l2', u: 3000, v: 1000, fixtureType: 'pendant' },
            { id: 'l3', u: 5000, v: 1000 },
          ],
        },
      },
    });
    const takeoff = deriveCeilingTakeoff(ceiling, null);

    expect(takeoff.lighting.fixtureCount).toBe(3);
    expect(takeoff.lighting.totalLumens).toBe(2 * 650 + 800);
    expect(takeoff.lighting.totalWatts).toBe(2 * 9 + 9);
    // First appearance orders the list, the same way the board materials do.
    expect(takeoff.lighting.byType).toEqual([
      { fixtureType: 'recessed_can_6', bulbType: 'br30', count: 2, totalLumens: 1300, totalWatts: 18 },
      { fixtureType: 'pendant', bulbType: 'a19', count: 1, totalLumens: 800, totalWatts: 9 },
    ]);

    expect(deriveCeilingTakeoff(rectCeiling(), null).lighting).toEqual({
      fixtureCount: 0,
      totalLumens: 0,
      totalWatts: 0,
      byType: [],
    });
  });

  it('reports a disabled takeoff without dropping the geometry keys', () => {
    const takeoff = deriveCeilingTakeoff(rectCeiling({ detailing: { face: { enabled: false } } }), null);
    expect(takeoff.enabled).toBe(false);
    expect(takeoff.panelCount).toBe(0);
    expect(takeoff.fastenerCount).toBe(0);
    expect(takeoff.furringLinearMm).toBeGreaterThan(0);
  });

  it('assembles the full ceiling detail bundle', () => {
    const ceiling = rectCeiling({
      detailing: {
        openings: [{ id: 'hatch', u: 1000, v: 1000, width: 600, height: 600 }],
        lighting: { fixtures: [{ id: 'l1', u: 2000, v: 2000 }] },
      },
    });
    const detail = deriveCeilingDetail(ceiling, null);

    expect(detail.ceilingId).toBe('ceiling_test');
    expect(detail.length).toBe(6000);
    expect(detail.depth).toBe(4000);
    expect(detail.boundaryLocal).toEqual([
      { u: 0, v: 4000 },
      { u: 6000, v: 4000 },
      { u: 6000, v: 0 },
      { u: 0, v: 0 },
    ]);
    expect(detail.openings[0]).toMatchObject({ id: 'hatch', u0: 1000, u1: 1600, v0: 1000, v1: 1600 });
    expect(detail.configuration.schemaVersion).toBe(CEILING_SCHEMA_VERSION);
    expect(detail.panels).toEqual(deriveCeilingPanels(ceiling, null));
    expect(detail.framing).toEqual(deriveCeilingFramingMembers(ceiling, null));
    expect(detail.hangers).toEqual(deriveCeilingHangers(ceiling, null));
    expect(detail.fasteners.length).toBe(detail.takeoff.fastenerCount);
    expect(detail.lightFixtures).toEqual(deriveCeilingLightFixtures(ceiling, null));
    expect(detail.lightFixtures[0]).toMatchObject({ id: 'l1', plan: { x: 2000, y: 2000 } });
    expect(detail.takeoff.lighting.fixtureCount).toBe(1);
    expect(detail.elevations.boardUnderside).toBe(2700);
    expect(detail.dimensions).toEqual(deriveCeilingDimensions(ceiling, null));
  });
});

/**
 * A reflected ceiling plan is measured the way an elevation is: the same two-point
 * model, the same rounding, the same associative anchors. What is ceiling-specific
 * is which pieces an endpoint may be taken from, and which chains the drawing
 * works out for itself.
 */
describe('ceiling dimensions', () => {
  it('normalizes stored measurements and strips the invalid ones', () => {
    const dimension = createCeilingDimension();
    expect(dimension.id.startsWith('ceiling_dim_')).toBe(true);
    expect(dimension).toMatchObject({
      mode: 'aligned',
      start: { u: 0, v: 0 },
      end: { u: 0, v: 0 },
      startRef: null,
      endRef: null,
      offset: 60,
      textOverride: '',
      tolerance: 0,
      note: '',
    });

    const messy = createCeilingDimension({
      id: 'dim_a',
      mode: 'diagonal',
      start: { u: '400', v: null },
      end: { u: 900, v: Number.NaN },
      // A reference with no anchor names nothing, so it is not a reference.
      startRef: { entityType: 'panel', entityId: 'p1' },
      endRef: { entityType: 'panel', entityId: 'p1', anchor: 'top_right', t: 4 },
      offset: 'far',
      tolerance: -3,
    });
    expect(messy.id).toBe('dim_a');
    expect(messy.mode).toBe('aligned');
    expect(messy.start).toEqual({ u: 400, v: 0 });
    expect(messy.end).toEqual({ u: 900, v: 0 });
    expect(messy.startRef).toBeNull();
    expect(messy.endRef).toEqual({ entityType: 'panel', entityId: 'p1', anchor: 'top_right', t: 1 });
    expect(messy.offset).toBe(60);
    expect(messy.tolerance).toBe(0);
  });

  it('normalizes the settings block, rejecting unlisted precisions', () => {
    expect(createCeilingDimensions({ precision: 0.5 }).precision).toBe(0.01);
    expect(createCeilingDimensions({ precision: '1' }).precision).toBe(1);
    expect(createCeilingDimensions({ showOverall: false, showBoards: true })).toMatchObject({
      showOverall: false,
      showOpenings: true,
      showBoards: true,
      showFraming: false,
    });
    expect(createCeilingDimensions({ manual: 'none' }).manual).toEqual([]);
    expect(createCeilingDimensions({ manual: [{ id: 'a' }, { id: 'b' }] }).manual.map((entry) => entry.id)).toEqual([
      'a',
      'b',
    ]);
  });

  it('carries measurements through the detailing factory, so a removed one is really gone', () => {
    const kept = { id: 'keep', start: { u: 0, v: 0 }, end: { u: 1000, v: 0 } };
    const detailing = createCeilingDetailing({
      dimensions: { precision: 0.1, showFraming: true, manual: [kept, { id: 'drop' }] },
    });
    expect(detailing.dimensions.precision).toBe(0.1);
    expect(detailing.dimensions.showFraming).toBe(true);
    expect(detailing.dimensions.manual.map((entry) => entry.id)).toEqual(['keep', 'drop']);

    const pruned = createCeilingDetailing({
      ...detailing,
      dimensions: { ...detailing.dimensions, manual: detailing.dimensions.manual.filter((e) => e.id !== 'drop') },
    });
    expect(pruned.dimensions.manual.map((entry) => entry.id)).toEqual(['keep']);
  });

  describe('reference resolution', () => {
    const context = {
      ceilingId: 'ceiling_test',
      length: 6000,
      depth: 4000,
      panels: [
        {
          id: 'ceiling_test:panel:p1',
          localId: 'p1',
          u0: 100,
          u1: 1300,
          v0: 200,
          v1: 2600,
          outlinePoints: [
            { u: 100, v: 200 },
            { u: 1300, v: 200 },
            { u: 1300, v: 2600 },
            { u: 100, v: 2600 },
          ],
        },
      ],
      members: [
        { id: 'f1', kind: 'furring', orientation: 'horizontal', u0: 0, u1: 6000, v0: 400, v1: 450 },
        { id: 'wa1', kind: 'wall_angle', start: { u: 0, v: 0 }, end: { u: 6000, v: 0 } },
      ],
      openings: [{ id: 'hatch', u0: 1000, u1: 1600, v0: 1000, v1: 1600 }],
      fasteners: [{ id: 's1', u: 250, v: 275 }],
      hangers: [{ id: 'h1', u: 1200, v: 1200 }],
      fixtures: [{ id: 'l1', u: 3000, v: 2000 }],
    };
    const resolve = (reference, fallback = { u: -1, v: -1 }) =>
      resolveCeilingDimensionReference(reference, fallback, context);

    it('reads the ceiling outline, boards, framing and openings off the drawing', () => {
      expect(resolve(null, { u: 7, v: 9 })).toEqual({ u: 7, v: 9 });
      expect(resolve({ entityType: 'ceiling', entityId: 'ceiling_test', anchor: 'top_right' })).toEqual({
        u: 6000,
        v: 4000,
      });
      // Boards answer to the id the drawing selects them by, and to their own.
      expect(resolve({ entityType: 'panel', entityId: 'p1', anchor: 'vertex_2' })).toEqual({ u: 1300, v: 2600 });
      expect(resolve({ entityType: 'panel', entityId: 'ceiling_test:panel:p1', anchor: 'center' })).toEqual({
        u: 700,
        v: 1400,
      });
      // A channel's centreline, a third of the way along it.
      expect(resolve({ entityType: 'framing', entityId: 'f1', anchor: 'axis_center', t: 0.5 })).toEqual({
        u: 3000,
        v: 425,
      });
      expect(resolve({ entityType: 'opening', entityId: 'hatch', anchor: 'bottom_left' })).toEqual({
        u: 1000,
        v: 1000,
      });
    });

    it('reads the marker points — screws, hangers and lights', () => {
      expect(resolve({ entityType: 'fastener', entityId: 's1', anchor: 'center' })).toEqual({ u: 250, v: 275 });
      expect(resolve({ entityType: 'hanger', entityId: 'h1', anchor: 'center' })).toEqual({ u: 1200, v: 1200 });
      expect(resolve({ entityType: 'fixture', entityId: 'l1', anchor: 'center' })).toEqual({ u: 3000, v: 2000 });
    });

    it('falls back to the stored point when the piece is gone or has no anchor grid', () => {
      const fallback = { u: 42, v: 84 };
      expect(resolve({ entityType: 'panel', entityId: 'deleted', anchor: 'center' }, fallback)).toEqual(fallback);
      expect(resolve({ entityType: 'fastener', entityId: 'deleted', anchor: 'center' }, fallback)).toEqual(fallback);
      expect(resolve({ entityType: 'ceiling', entityId: 'other_ceiling', anchor: 'center' }, fallback)).toEqual(
        fallback,
      );
      // A wall angle is a run of line rather than a rectangle: nothing to anchor to.
      expect(resolve({ entityType: 'framing', entityId: 'wa1', anchor: 'center' }, fallback)).toEqual(fallback);
      expect(resolve({ entityType: 'joist', entityId: 'f1', anchor: 'center' }, fallback)).toEqual(fallback);
    });
  });

  it('draws the ceiling extent by default and adds the groups that are switched on', () => {
    const plain = deriveCeilingDimensions(rectCeiling(), null);
    expect(plain.map((entry) => entry.name)).toEqual(['Overall ceiling length', 'Overall ceiling depth']);
    expect(plain.map((entry) => entry.label)).toEqual(['6000.00 mm', '4000.00 mm']);
    expect(plain.every((entry) => entry.source === 'automatic')).toBe(true);

    const opened = deriveCeilingDimensions(
      rectCeiling({
        detailing: {
          openings: [{ id: 'hatch', type: 'access_hatch', u: 1000, v: 1000, width: 600, height: 600 }],
          dimensions: { showOverall: false },
        },
      }),
      null,
    );
    // Size in both directions, plus the set-out from each edge it is offset from.
    expect(opened.map((entry) => entry.label)).toEqual(['600.00 mm', '600.00 mm', '1000.00 mm', '1000.00 mm']);
    expect(opened[0].name).toBe('access hatch width');

    const framed = deriveCeilingDimensions(
      rectCeiling({ detailing: { dimensions: { showOverall: false, showFraming: true } } }),
      null,
    );
    expect(framed.length).toBeGreaterThan(0);
    expect(framed.every((entry) => entry.name.includes('centre spacing'))).toBe(true);
  });

  it('re-reads a hand-drawn measurement off the piece it was anchored to', () => {
    const anchored = {
      id: 'dim_a',
      mode: 'horizontal',
      start: { u: 0, v: 0 },
      end: { u: 0, v: 0 },
      startRef: { entityType: 'ceiling', entityId: 'ceiling_test', anchor: 'bottom_left' },
      endRef: { entityType: 'opening', entityId: 'hatch', anchor: 'bottom_left' },
      note: 'Hatch set-out',
    };
    const ceilingAt = (u) =>
      rectCeiling({
        detailing: {
          openings: [{ id: 'hatch', type: 'access_hatch', u, v: 1000, width: 600, height: 600 }],
          dimensions: { showOverall: false, showOpenings: false, manual: [anchored] },
        },
      });

    const first = deriveCeilingDimensions(ceilingAt(1000), null);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ id: 'dim_a', name: 'Hatch set-out', source: 'custom', label: '1000.00 mm' });

    // The hatch moves; the measurement moves with it, because it stores the
    // corner rather than the number.
    expect(deriveCeilingDimensions(ceilingAt(2500), null)[0].label).toBe('2500.00 mm');
  });

  it('drops a measurement that has collapsed to nothing, and honours a typed override', () => {
    const dimensions = deriveCeilingDimensions(
      rectCeiling({
        detailing: {
          dimensions: {
            showOverall: false,
            manual: [
              { id: 'zero', start: { u: 500, v: 500 }, end: { u: 500, v: 500 } },
              { id: 'named', start: { u: 0, v: 0 }, end: { u: 1200, v: 0 }, textOverride: 'FFL to grid' },
              { id: 'toleranced', start: { u: 0, v: 0 }, end: { u: 0, v: 900 }, tolerance: 2 },
            ],
          },
        },
      }),
      null,
    );

    expect(dimensions.map((entry) => entry.id)).toEqual(['named', 'toleranced']);
    expect(dimensions[0].label).toBe('FFL to grid');
    expect(dimensions[1].label).toBe('900.00 mm ±2.00 mm');
  });

  it('says nothing at all while the ceiling is not being detailed', () => {
    expect(deriveCeilingDimensions(rectCeiling({ detailing: { enabled: false } }), null)).toEqual([]);
  });
});
