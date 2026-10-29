import { describe, it, expect } from 'vitest';
import { createBeam } from '@/domain/models';
import { createCeiling, deriveCeilingDetail } from '@/domain/ceilingModels';
import { fixtureBounceIntensity, fixtureLightIntensity, kelvinToRgb } from './lightingMath';
import {
  CEILING_BOARD_THICKNESS,
  CEILING_CARRIER_DEPTH,
  CEILING_FURRING_DEPTH,
  CEILING_WALL_ANGLE_LEG,
} from '@/domain/defaults';
import { buildPreviewScene } from '@/three/scene/buildPreviewScene';
import { buildCeilingPreviewObjects } from './ceilingGeometry';

const BOUNDARY = [
  { x: 1000, y: 500 },
  { x: 5000, y: 500 },
  { x: 5000, y: 3500 },
  { x: 1000, y: 3500 },
];

const MANUAL_BASE_ELEVATION = 2700;
const SUPPORT_BASE_ELEVATION = 3000;
const SUPPORT_DROP = 150;

// Two 250 mm beams whose inner faces land on BOUNDARY: a ceiling hung from them
// derives exactly the rectangle the manual ceiling stores, so the two fixtures
// differ only in what holds them up.
const SUPPORT_BEAMS = [
  {
    ...createBeam(
      { kind: 'point', x: 1000, y: 375 },
      { kind: 'point', x: 5000, y: 375 },
      250,
      450,
      SUPPORT_BASE_ELEVATION,
    ),
    id: 'beam_south',
  },
  {
    ...createBeam(
      { kind: 'point', x: 1000, y: 3625 },
      { kind: 'point', x: 5000, y: 3625 },
      250,
      450,
      SUPPORT_BASE_ELEVATION,
    ),
    id: 'beam_north',
  },
];

function createFloor() {
  return {
    id: 'floor_1',
    name: 'Ground',
    elevation: 0,
    floorToFloorHeight: 3000,
    walls: [],
    rooms: [],
    slabs: [],
    columns: [],
    beams: SUPPORT_BEAMS,
    stairs: [],
    landings: [],
    fixtures: [],
    railings: [],
  };
}

function createProject(ceilings = []) {
  return {
    floors: [createFloor()],
    trussSystems: [],
    ceilings,
  };
}

function manualCeiling(overrides = {}) {
  return createCeiling('Manual ceiling', {
    id: 'ceiling_manual',
    floorId: 'floor_1',
    boundaryPolygon: BOUNDARY,
    baseElevation: MANUAL_BASE_ELEVATION,
    ...overrides,
  });
}

function beamCeiling(overrides = {}) {
  return createCeiling('Beam ceiling', {
    id: 'ceiling_beam',
    floorId: 'floor_1',
    boundaryPolygon: BOUNDARY,
    attachment: { mode: 'beam', beamIds: SUPPORT_BEAMS.map((beam) => beam.id) },
    detailing: { suspension: { drop: SUPPORT_DROP } },
    ...overrides,
  });
}

function byDetailKind(descriptors, kind) {
  return descriptors.filter((descriptor) => descriptor.metadata.ceilingDetailKind === kind);
}

function byFramingKind(descriptors, kind) {
  return descriptors.filter((descriptor) => descriptor.metadata.framingKind === kind);
}

describe('buildCeilingPreviewObjects', () => {
  /**
   * The RCP editor highlights the selected board in its 3D pane by matching its
   * own selection id against this metadata, so every part has to answer to the
   * id the drawing knows it by — the bare panel id, not the ceiling-qualified
   * one the descriptor is keyed on.
   */
  it('names each part by the id the RCP editor selects it with', () => {
    const ceiling = manualCeiling();
    const project = createProject([ceiling]);
    const detail = deriveCeilingDetail(ceiling, project);
    const descriptors = buildCeilingPreviewObjects(ceiling, project);

    const boardIds = new Set(byDetailKind(descriptors, 'panel').map((entry) => entry.metadata.ceilingDetailElementId));
    expect(boardIds.size).toBeGreaterThan(0);
    for (const panel of detail.panels) expect(boardIds.has(panel.localId)).toBe(true);

    const memberIds = new Set(
      byDetailKind(descriptors, 'framing').map((entry) => entry.metadata.ceilingDetailElementId),
    );
    for (const member of detail.framing) expect(memberIds.has(member.id)).toBe(true);

    // Every part carries one, so nothing in the pane is unpickable.
    for (const descriptor of descriptors) {
      expect(typeof descriptor.metadata.ceilingDetailElementId).toBe('string');
    }
  });

  it('builds a manual ceiling as boards, grid framing and wall angles with no hangers', () => {
    const ceiling = manualCeiling();
    const project = createProject([ceiling]);
    const descriptors = buildCeilingPreviewObjects(ceiling, project);

    const boards = byDetailKind(descriptors, 'panel');
    expect(boards.length).toBeGreaterThan(0);
    for (const board of boards) {
      expect(board.geometry).toBe('prism');
      expect(board.materialKey).toBe('ceilingBoard');
      // Manual mode hangs nothing: the stored base elevation IS the board underside.
      expect(board.baseElevation).toBe(MANUAL_BASE_ELEVATION);
      expect(board.height).toBe(CEILING_BOARD_THICKNESS);
      expect(board.metadata.ceilingId).toBe('ceiling_manual');
      expect(board.metadata.floorId).toBe('floor_1');
    }

    expect(byDetailKind(descriptors, 'hanger')).toHaveLength(0);

    const boardTop = MANUAL_BASE_ELEVATION + CEILING_BOARD_THICKNESS;
    const furring = byFramingKind(descriptors, 'furring');
    expect(furring.length).toBeGreaterThan(0);
    for (const member of furring) {
      expect(member.geometry).toBe('box');
      expect(member.materialKey).toBe('ceilingFraming');
      expect(member.baseElevation).toBe(boardTop);
      expect(member.size.y).toBe(CEILING_FURRING_DEPTH);
    }

    const carriers = byFramingKind(descriptors, 'carrier');
    expect(carriers.length).toBeGreaterThan(0);
    for (const member of carriers) {
      expect(member.baseElevation).toBe(boardTop + CEILING_FURRING_DEPTH);
      expect(member.size.y).toBe(CEILING_CARRIER_DEPTH);
    }

    const wallAngles = byFramingKind(descriptors, 'wall_angle');
    expect(wallAngles).toHaveLength(4);
    for (const angle of wallAngles) {
      expect(angle.geometry).toBe('segment3d');
      expect(angle.crossSection).toEqual({ width: CEILING_WALL_ANGLE_LEG, height: CEILING_WALL_ANGLE_LEG });
      expect(angle.start.y).toBeCloseTo(boardTop + CEILING_WALL_ANGLE_LEG / 2, 6);
      expect(angle.end.y).toBeCloseTo(boardTop + CEILING_WALL_ANGLE_LEG / 2, 6);
    }

    for (const descriptor of descriptors) {
      expect(['prism', 'box', 'segment3d']).toContain(descriptor.geometry);
      expect(descriptor.kind).toBe('ceiling');
      expect(descriptor.metadata.sourceId).toBe('ceiling_manual');
      for (const key of ['minX', 'maxX', 'minY', 'maxY', 'minElevation', 'maxElevation']) {
        expect(Number.isFinite(descriptor.bounds[key])).toBe(true);
      }
      expect(descriptor.bounds.maxElevation).toBeGreaterThanOrEqual(descriptor.bounds.minElevation);
    }
  });

  it('maps ceiling-local UV back to plan coordinates (V flip) and into world space', () => {
    const ceiling = manualCeiling();
    const project = createProject([ceiling]);
    const descriptors = buildCeilingPreviewObjects(ceiling, project);

    // Wall angles ring the boundary half a leg (12.5 mm) inboard, so their
    // world x/z must reproduce the boundary corners pulled that far toward the
    // middle — this is the V-flip round trip under test.
    const corners = byFramingKind(descriptors, 'wall_angle')
      .map((angle) => `${angle.start.x.toFixed(1)},${angle.start.z.toFixed(1)}`)
      .sort();
    const centre = { x: 3000, y: 2000 };
    expect(corners).toEqual(
      BOUNDARY.map((point) => {
        const inset = {
          x: point.x + Math.sign(centre.x - point.x) * 12.5,
          y: point.y + Math.sign(centre.y - point.y) * 12.5,
        };
        return `${inset.x.toFixed(1)},${inset.y.toFixed(1)}`;
      }).sort(),
    );

    for (const board of byDetailKind(descriptors, 'panel')) {
      for (const point of board.outline) {
        expect(point.x).toBeGreaterThanOrEqual(1000 - 1e-6);
        expect(point.x).toBeLessThanOrEqual(5000 + 1e-6);
        expect(point.y).toBeGreaterThanOrEqual(500 - 1e-6);
        expect(point.y).toBeLessThanOrEqual(3500 + 1e-6);
      }
    }

    // Every framing box sits inside the boundary footprint.
    for (const member of byDetailKind(descriptors, 'framing').filter((entry) => entry.geometry === 'box')) {
      expect(member.center.x).toBeGreaterThanOrEqual(1000);
      expect(member.center.x).toBeLessThanOrEqual(5000);
      expect(member.center.y).toBeGreaterThanOrEqual(500);
      expect(member.center.y).toBeLessThanOrEqual(3500);
      expect(member.size.x).toBeGreaterThan(0);
      expect(member.size.z).toBeGreaterThan(0);
      expect(member.rotation).toBe(0);
    }
  });

  it('maps the chosen board and frame materials to their palette keys', () => {
    const ceiling = manualCeiling({
      detailing: {
        face: { productProfileId: 'generic-plywood-ceiling-v1' },
        framing: { material: 'timber' },
      },
    });
    const project = createProject([ceiling]);
    const descriptors = buildCeilingPreviewObjects(ceiling, project);

    const boards = byDetailKind(descriptors, 'panel');
    expect(boards.length).toBeGreaterThan(0);
    for (const board of boards) {
      expect(board.materialKey).toBe('ceilingBoardPlywood');
    }

    const framing = byDetailKind(descriptors, 'framing');
    expect(framing.length).toBeGreaterThan(0);
    for (const member of framing) {
      expect(member.materialKey).toBe('ceilingFramingTimber');
    }

    // Suspension rods stay steel whatever carries the boards.
    const hung = beamCeiling({
      detailing: { suspension: { drop: SUPPORT_DROP }, framing: { material: 'timber' } },
    });
    const hangers = byDetailKind(buildCeilingPreviewObjects(hung, createProject([hung])), 'hanger');
    expect(hangers.length).toBeGreaterThan(0);
    for (const hanger of hangers) {
      expect(hanger.materialKey).toBe('ceilingHanger');
    }
  });

  /**
   * A ceiling may be boarded in more than one material, so the palette key is a
   * property of the board rather than of the ceiling: overriding one board has
   * to change that board's prisms and leave every other board alone.
   */
  it('gives each board the palette key of its own material', () => {
    const ceiling = manualCeiling({
      detailing: {
        face: {
          layout: {
            mode: 'custom',
            customPanels: [
              { id: 'ply-board', u: 0, v: 0, width: 1200, height: 2400, material: 'plywood' },
              { id: 'profile-board', u: 1300, v: 0, width: 1200, height: 2400 },
            ],
          },
        },
      },
    });
    const descriptors = buildCeilingPreviewObjects(ceiling, createProject([ceiling]));
    const boardKeys = (localId) =>
      byDetailKind(descriptors, 'panel')
        .filter((entry) => entry.metadata.ceilingDetailElementId === localId)
        .map((entry) => entry.materialKey);

    expect(boardKeys('ply-board').length).toBeGreaterThan(0);
    expect(new Set(boardKeys('ply-board'))).toEqual(new Set(['ceilingBoardPlywood']));
    // The ceiling's profile is fiber cement, and the board that said nothing
    // still follows it.
    expect(new Set(boardKeys('profile-board'))).toEqual(new Set(['ceilingBoard']));
  });

  it('carries the ceiling frame rotation into framing and hanger boxes', () => {
    const angle = Math.PI / 6;
    const along = { x: Math.cos(angle), y: Math.sin(angle) };
    const across = { x: -Math.sin(angle), y: Math.cos(angle) };
    const origin = { x: 1000, y: 500 };
    const corner = (a, b) => ({ x: origin.x + along.x * a + across.x * b, y: origin.y + along.y * a + across.y * b });
    const ceiling = manualCeiling({
      boundaryPolygon: [corner(0, 0), corner(4000, 0), corner(4000, 3000), corner(0, 3000)],
    });
    const project = createProject([ceiling]);
    const descriptors = buildCeilingPreviewObjects(ceiling, project);

    const boxes = descriptors.filter((descriptor) => descriptor.geometry === 'box');
    expect(boxes.length).toBeGreaterThan(0);
    for (const box of boxes) {
      expect(box.rotation).toBeCloseTo(angle, 9);

      // The centre projected onto the ceiling's own axes sits inside its edges.
      const dx = box.center.x - origin.x;
      const dy = box.center.y - origin.y;
      expect(dx * along.x + dy * along.y).toBeGreaterThanOrEqual(-1e-6);
      expect(dx * along.x + dy * along.y).toBeLessThanOrEqual(4000 + 1e-6);
      expect(dx * across.x + dy * across.y).toBeGreaterThanOrEqual(-1e-6);
      expect(dx * across.x + dy * across.y).toBeLessThanOrEqual(3000 + 1e-6);

      // Bounds trace the spun footprint, not an unrotated rect around the centre.
      const cos = Math.abs(Math.cos(box.rotation));
      const sin = Math.abs(Math.sin(box.rotation));
      expect(box.bounds.maxX - box.bounds.minX).toBeCloseTo(box.size.x * cos + box.size.z * sin, 6);
      expect(box.bounds.maxY - box.bounds.minY).toBeCloseTo(box.size.x * sin + box.size.z * cos, 6);
    }
  });

  it('drops a beam-attached ceiling below the attachment plane and hangs it back up', () => {
    const ceiling = beamCeiling();
    const project = createProject([ceiling]);
    const descriptors = buildCeilingPreviewObjects(ceiling, project);

    const boardUnderside = SUPPORT_BASE_ELEVATION - SUPPORT_DROP;
    expect(boardUnderside).toBe(2850);
    for (const board of byDetailKind(descriptors, 'panel')) {
      expect(board.baseElevation).toBe(boardUnderside);
    }

    const gridDepth = CEILING_BOARD_THICKNESS + CEILING_FURRING_DEPTH + CEILING_CARRIER_DEPTH;
    const hangers = byDetailKind(descriptors, 'hanger');
    expect(hangers.length).toBeGreaterThan(0);
    for (const hanger of hangers) {
      expect(hanger.geometry).toBe('box');
      expect(hanger.materialKey).toBe('ceilingHanger');
      expect(hanger.size.y).toBeCloseTo(SUPPORT_DROP - gridDepth, 6);
      expect(hanger.baseElevation).toBeCloseTo(boardUnderside + gridDepth, 6);
      expect(hanger.baseElevation + hanger.size.y).toBeCloseTo(SUPPORT_BASE_ELEVATION, 6);
    }
  });

  it('matches the derived detail counts one descriptor per region, member and hanger', () => {
    const ceiling = beamCeiling();
    const project = createProject([ceiling]);
    const detail = deriveCeilingDetail(ceiling, project);
    const descriptors = buildCeilingPreviewObjects(ceiling, project);

    const regionCount = detail.panels.reduce((total, panel) => total + panel.regions.length, 0);
    const rectMembers = detail.framing.filter((member) => member.kind !== 'wall_angle');
    const wallAngles = detail.framing.filter((member) => member.kind === 'wall_angle');

    expect(byDetailKind(descriptors, 'panel')).toHaveLength(regionCount);
    expect(byDetailKind(descriptors, 'framing').filter((entry) => entry.geometry === 'box')).toHaveLength(
      rectMembers.length,
    );
    expect(byFramingKind(descriptors, 'wall_angle')).toHaveLength(wallAngles.length);
    expect(byDetailKind(descriptors, 'hanger')).toHaveLength(detail.hangers.length);
    expect(new Set(descriptors.map((descriptor) => descriptor.id)).size).toBe(descriptors.length);
    // Fasteners stay out of the main scene even though the detail derives them.
    expect(detail.fasteners.length).toBeGreaterThan(0);
    expect(descriptors.some((descriptor) => descriptor.metadata.ceilingDetailKind === 'fastener')).toBe(false);
  });

  it('returns nothing for disabled detailing, a disabled face or a degenerate boundary', () => {
    const project = createProject();

    expect(buildCeilingPreviewObjects(manualCeiling({ detailing: { enabled: false } }), project)).toEqual([]);
    expect(buildCeilingPreviewObjects(manualCeiling({ detailing: { face: { enabled: false } } }), project)).toEqual([]);
    expect(buildCeilingPreviewObjects(null, project)).toEqual([]);

    const degenerate = manualCeiling();
    degenerate.boundaryPolygon = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ];
    expect(buildCeilingPreviewObjects(degenerate, project)).toEqual([]);
  });
});

describe('buildPreviewScene ceilings', () => {
  it('adds ceiling descriptors to their floor objects and source key', () => {
    const ceiling = manualCeiling();
    const project = createProject([ceiling]);
    const scene = buildPreviewScene(project);
    const floor = scene.floors.find((entry) => entry.floorId === 'floor_1');

    const ceilingObjects = floor.objects.filter((descriptor) => descriptor.metadata?.ceilingId === 'ceiling_manual');
    expect(ceilingObjects).toHaveLength(buildCeilingPreviewObjects(ceiling, project).length);
    expect(ceilingObjects.every((descriptor) => descriptor.metadata.floorId === 'floor_1')).toBe(true);

    // Cache correctness: the ceiling source array must be reachable by reference.
    expect(floor.sourceKey.ceilings).toEqual([ceiling]);
    expect(floor.sourceKey.ceilings[0]).toBe(ceiling);
    expect(floor.bounds.maxElevation).toBeGreaterThanOrEqual(MANUAL_BASE_ELEVATION);
  });

  it('keeps a ceiling off floors it does not belong to', () => {
    const ceiling = manualCeiling({ floorId: 'floor_2' });
    const project = createProject([ceiling]);
    const scene = buildPreviewScene(project);
    const floor = scene.floors.find((entry) => entry.floorId === 'floor_1');

    expect(floor.objects.filter((descriptor) => descriptor.metadata?.ceilingId)).toHaveLength(0);
    expect(floor.sourceKey.ceilings).toEqual([]);
  });
});

/**
 * A hole in the boards is not a fitting. Every opening is finished with a trim
 * that laps onto the boards, and what sits inside the trim says which kind of
 * opening it is — a hatch lid, a downlight lens, a diffuser face — with the can
 * or neck it needs above, if the ceiling has the plenum for it. All of it
 * answers to the opening's own id, so the RCP editor can light the whole fitting
 * from one selection.
 */
describe('ceiling opening fittings', () => {
  const OPENINGS = [
    { id: 'op_hatch', type: 'access_hatch', u: 200, v: 200, width: 600, height: 600 },
    { id: 'op_light', type: 'downlight', u: 1200, v: 400, width: 200, height: 200 },
    { id: 'op_air', type: 'diffuser', u: 2000, v: 400, width: 400, height: 400 },
    { id: 'op_cut', type: 'custom', u: 2800, v: 400, width: 300, height: 300 },
  ];

  function openingParts(descriptors, openingId) {
    return descriptors.filter((entry) => entry.metadata.ceilingDetailElementId === openingId);
  }

  it('trims every opening, whatever it is for', () => {
    const ceiling = beamCeiling({ detailing: { suspension: { drop: SUPPORT_DROP }, openings: OPENINGS } });
    const descriptors = buildCeilingPreviewObjects(ceiling, createProject([ceiling]));
    const elevations = deriveCeilingDetail(ceiling, createProject([ceiling])).elevations;

    for (const opening of OPENINGS) {
      const trim = openingParts(descriptors, opening.id).find((entry) => entry.id.endsWith(':trim'));
      expect(trim, opening.type).toBeDefined();
      expect(trim.metadata.ceilingDetailKind).toBe('opening');
      // A ring: it laps onto the boards and is empty over the cut itself.
      expect(trim.holes).toHaveLength(1);
      // Below the boards, where it can be seen from the room.
      expect(trim.baseElevation).toBeLessThan(elevations.boardUnderside);
    }
  });

  it('puts a fitting in the cut for the kinds that have one, and nothing in a bare cut-out', () => {
    const ceiling = beamCeiling({ detailing: { suspension: { drop: SUPPORT_DROP }, openings: OPENINGS } });
    const descriptors = buildCeilingPreviewObjects(ceiling, createProject([ceiling]));

    const faceMaterial = (id) =>
      openingParts(descriptors, id).find((entry) => entry.id.endsWith(':face'))?.materialKey ?? null;
    expect(faceMaterial('op_hatch')).toBe('ceilingHatch');
    expect(faceMaterial('op_light')).toBe('ceilingLuminaire');
    expect(faceMaterial('op_air')).toBe('ceilingDiffuser');
    // A custom cut-out is a hole made for something this model does not know
    // about; it gets its trim and no invented fitting.
    expect(faceMaterial('op_cut')).toBeNull();
    expect(openingParts(descriptors, 'op_cut')).toHaveLength(1);
  });

  it('hangs a can only where there is plenum to hang it in', () => {
    const hung = beamCeiling({ detailing: { suspension: { drop: SUPPORT_DROP }, openings: OPENINGS } });
    const withPlenum = buildCeilingPreviewObjects(hung, createProject([hung]));
    const can = openingParts(withPlenum, 'op_light').find((entry) => entry.id.endsWith(':housing'));
    expect(can).toBeDefined();
    expect(can.size.y).toBeGreaterThan(0);
    // It starts at the board top and stops at or below the attachment plane —
    // never inside the structure the ceiling hangs from.
    const elevations = deriveCeilingDetail(hung, createProject([hung])).elevations;
    expect(can.baseElevation).toBeCloseTo(elevations.boardTop, 6);
    expect(can.baseElevation + can.size.y).toBeLessThanOrEqual(elevations.attachment + 1e-6);

    // A manual ceiling hangs from nothing: its boards are its own datum, so
    // there is no void above them to put a can in.
    const flat = manualCeiling({ detailing: { openings: OPENINGS } });
    const flatParts = buildCeilingPreviewObjects(flat, createProject([flat]));
    expect(openingParts(flatParts, 'op_light').some((entry) => entry.id.endsWith(':housing'))).toBe(false);
    // The face is still there — a downlight in a flat ceiling is still a downlight.
    expect(openingParts(flatParts, 'op_light').some((entry) => entry.id.endsWith(':face'))).toBe(true);
  });
});

/**
 * Screws are the one part of a ceiling drawn only for the editor that is working
 * on it: several hundred discs are worth their cost at a metre away and are dead
 * weight in a view of a whole building.
 */
describe('ceiling fasteners in 3D', () => {
  it('draws none unless asked', () => {
    const ceiling = manualCeiling();
    const project = createProject([ceiling]);

    expect(byDetailKind(buildCeilingPreviewObjects(ceiling, project), 'fastener')).toHaveLength(0);
    const asked = buildCeilingPreviewObjects(ceiling, project, { fasteners: true });
    expect(byDetailKind(asked, 'fastener').length).toBeGreaterThan(10);
  });

  it('drives each head up into the boards, named by the id the editor selects', () => {
    const ceiling = manualCeiling();
    const project = createProject([ceiling]);
    const detail = deriveCeilingDetail(ceiling, project);
    const heads = byDetailKind(buildCeilingPreviewObjects(ceiling, project, { fasteners: true }), 'fastener');

    expect(heads).toHaveLength(detail.fasteners.length);
    const ids = new Set(heads.map((entry) => entry.metadata.ceilingDetailElementId));
    for (const fastener of detail.fasteners) expect(ids.has(fastener.id)).toBe(true);

    for (const head of heads) {
      expect(head.geometry).toBe('fastener');
      // Vertical, unlike a wall screw: the head faces the room below, and the
      // whole of it sits under the boards rather than inside them.
      expect(head.axis).toBe('vertical');
      expect(head.baseElevation + head.size.y).toBeCloseTo(detail.elevations.boardUnderside, 6);
    }
  });
});

/**
 * Every luminaire is two descriptors — the fitting you can see and the beam it
 * throws — and the renderer needs both to be true at once: a lamp drawn 900 mm
 * down a cord that lights the room from the ceiling plane is a lamp nobody
 * believes. The third thing a lit room needs, the light it throws back at
 * itself, belongs to the room rather than to any one lamp and is counted once
 * per patch of ceiling — see the aggregation suite below.
 *
 * The ceiling under test is plan-aligned and 4000 × 3000 over BOUNDARY, so
 * ceiling-local u maps to plan x + 1000 and v maps to plan y measured back from
 * 3500 — the V flip the RCP draws in.
 */
describe('ceiling luminaires in 3D', () => {
  const BOARD_UNDERSIDE = MANUAL_BASE_ELEVATION;
  const LIGHT_CLEARANCE = 25;

  const FIXTURES = [
    { id: 'lt_can', u: 1000, v: 1000, fixtureType: 'recessed_can_6' },
    { id: 'lt_pendant', u: 2000, v: 1500, fixtureType: 'pendant' },
    { id: 'lt_troffer', u: 3000, v: 500, fixtureType: 'troffer_2x4' },
    { id: 'lt_track', u: 500, v: 2000, fixtureType: 'track_head', aim: { tiltDeg: 90, azimuthDeg: 0 } },
  ];

  function litCeiling(fixtures = FIXTURES, overrides = {}) {
    return manualCeiling({ ...overrides, detailing: { ...overrides.detailing, lighting: { fixtures } } });
  }

  function litDescriptors(fixtures = FIXTURES, overrides = {}) {
    const ceiling = litCeiling(fixtures, overrides);
    return buildCeilingPreviewObjects(ceiling, createProject([ceiling]));
  }

  const partsOf = (descriptors, fixtureId) =>
    descriptors.filter((entry) => entry.metadata.ceilingDetailElementId === fixtureId);
  const housingOf = (descriptors, fixtureId) =>
    partsOf(descriptors, fixtureId).find((entry) => entry.geometry === 'ceilingLightFixture');
  const lightOf = (descriptors, fixtureId) =>
    partsOf(descriptors, fixtureId).find((entry) => entry.id.endsWith(':light'));
  /** The room's own fills, which answer to the ceiling rather than to a fixture. */
  const bouncesOf = (descriptors) => descriptors.filter((entry) => entry.role === 'bounce');

  it('fixes the fitting to the board underside and drops the light clear of it', () => {
    const descriptors = litDescriptors();
    const housing = housingOf(descriptors, 'lt_can');
    const light = lightOf(descriptors, 'lt_can');

    expect(housing.center).toEqual({ x: 2000, y: 2500 });
    expect(housing.baseElevation).toBe(BOARD_UNDERSIDE);
    expect(housing.dropMm).toBe(0);
    expect(housing.materialKey).toBe('ceilingLuminaire');
    expect(housing.aperture).toEqual({ radiusMm: 95 });
    expect(housing.bulb).toEqual({ diameterMm: 95, lengthMm: 136, count: 1, flat: false });
    // Plan x is world x, plan y is world z, and the source hangs 25 mm below the
    // housing so it is not standing inside its own meshes.
    expect(light.position).toEqual({ x: 2000, y: BOARD_UNDERSIDE - LIGHT_CLEARANCE, z: 2500 });
    expect(light.aim).toMatchObject({ x: 0, z: 0 });
    expect(light.aim.y).toBeCloseTo(-1, 12);
    expect(light.distanceMm).toBe(0);
    expect(light.penumbra).toBe(0.35);
    expect(light.castShadow).toBe(true);
  });

  it('hangs a pendant lamp the whole of its drop below the ceiling', () => {
    const descriptors = litDescriptors();
    const housing = housingOf(descriptors, 'lt_pendant');
    const light = lightOf(descriptors, 'lt_pendant');

    expect(housing.dropMm).toBe(900);
    expect(housing.baseElevation).toBe(BOARD_UNDERSIDE);
    expect(light.position.y).toBe(BOARD_UNDERSIDE - 900 - LIGHT_CLEARANCE);
    // The bounds have to reach down to what is hanging, or the camera fits to a
    // ceiling with a pendant sticking out of it.
    expect(housing.bounds.minElevation).toBeLessThan(BOARD_UNDERSIDE - 900);
    expect(housing.bounds.maxElevation).toBe(BOARD_UNDERSIDE);
  });

  it('gives a beamed lamp a cone and an omnidirectional one a point', () => {
    const descriptors = litDescriptors();

    // A 2×4 panel throws 120°, which is a 60° half-angle.
    const troffer = lightOf(descriptors, 'lt_troffer');
    expect(troffer.lightType).toBe('spot');
    expect(troffer.angleRad).toBeCloseTo(Math.PI / 3, 6);
    expect(housingOf(descriptors, 'lt_troffer').aperture).toEqual({ widthMm: 603, lengthMm: 1213 });

    // A bare A19 in a pendant has no beam at all.
    const pendant = lightOf(descriptors, 'lt_pendant');
    expect(pendant.lightType).toBe('point');
    expect(pendant.angleRad).toBeNull();

    // No cone can open past a hemisphere, whatever a lamp claims.
    const wide = lightOf(litDescriptors([{ id: 'lt_wide', u: 500, v: 500, beamAngleDeg: 160 }]), 'lt_wide');
    expect(wide.angleRad).toBeLessThan(Math.PI / 2);
  });

  it('carries the lamp’s own photometry and colour into the light', () => {
    const descriptors = litDescriptors();
    const can = lightOf(descriptors, 'lt_can');

    // BR30: 650 lm through a 110° cone, warm white.
    expect(can.intensity).toBeCloseTo(fixtureLightIntensity(650, 110), 6);
    expect(can.intensity).toBeGreaterThan(1e6);
    expect(can.color).toEqual(kelvinToRgb(2700));
    expect(housingOf(descriptors, 'lt_can').emissive.color).toEqual(can.color);

    // Five candles are one luminaire with five candles' worth of light, not five
    // lights: the chandelier's arms glow from its emissive material instead.
    const chandelier = litDescriptors([{ id: 'lt_chandelier', u: 1000, v: 1000, fixtureType: 'chandelier_5' }]);
    expect(partsOf(chandelier, 'lt_chandelier')).toHaveLength(2);
    expect(lightOf(chandelier, 'lt_chandelier').intensity).toBeCloseTo(fixtureLightIntensity(1500, null), 6);
    expect(housingOf(chandelier, 'lt_chandelier').bulb.count).toBe(5);
  });

  /**
   * A lamp the scene-wide light budget cannot afford to run is not simply put
   * out: the descriptor carries where its flux goes instead, and how much of it
   * arrives once it is spread over the sphere rather than thrown through the
   * beam. Without both of those the budget would be a dimmer switch.
   */
  it('tells each lamp which fill its flux falls back to, and how much of it', () => {
    const descriptors = litDescriptors();
    const bounceIds = new Set(bouncesOf(descriptors).map((entry) => entry.id));

    for (const fixture of FIXTURES) {
      const light = lightOf(descriptors, fixture.id);
      expect(light.role).toBe('lamp');
      expect(bounceIds.has(light.bounceLightId)).toBe(true);
      expect(light.fillIntensity).toBeGreaterThan(0);
    }

    // The same flux, omnidirectional: a 650 lm can through a 110° cone reads far
    // brighter on axis than the same 650 lm spread over the whole sphere.
    const can = lightOf(descriptors, 'lt_can');
    expect(can.fillIntensity).toBeCloseTo(fixtureLightIntensity(650, null), 6);
    expect(can.fillIntensity).toBeLessThan(can.intensity);
  });

  it('aims a tilted head along the ceiling’s own frame', () => {
    const straight = lightOf(litDescriptors(), 'lt_track');
    // Tilted to the horizontal along +U, which on a plan-aligned ceiling is plan
    // east — world +x.
    expect(straight.aim.x).toBeCloseTo(1, 12);
    expect(straight.aim.y).toBeCloseTo(0, 12);
    expect(straight.aim.z).toBeCloseTo(0, 12);
    expect(housingOf(litDescriptors(), 'lt_track').aim).toEqual(straight.aim);

    // The same fixture on a ceiling whose edges pulled its frame around points
    // along the rotated U, not along plan east.
    const angle = Math.PI / 6;
    const along = { x: Math.cos(angle), y: Math.sin(angle) };
    const across = { x: -Math.sin(angle), y: Math.cos(angle) };
    const origin = { x: 1000, y: 500 };
    const corner = (a, b) => ({ x: origin.x + along.x * a + across.x * b, y: origin.y + along.y * a + across.y * b });
    const rotated = litDescriptors([FIXTURES[3]], {
      boundaryPolygon: [corner(0, 0), corner(4000, 0), corner(4000, 3000), corner(0, 3000)],
    });
    const rotatedLight = lightOf(rotated, 'lt_track');
    expect(rotatedLight.aim.x).toBeCloseTo(Math.cos(angle), 9);
    expect(rotatedLight.aim.z).toBeCloseTo(Math.sin(angle), 9);
    expect(housingOf(rotated, 'lt_track').rotation).toBeCloseTo(angle, 9);
  });

  it('answers every part to the id the RCP editor selects the fixture by', () => {
    const descriptors = litDescriptors();

    for (const fixture of FIXTURES) {
      const parts = partsOf(descriptors, fixture.id);
      expect(parts, fixture.id).toHaveLength(2);
      for (const part of parts) {
        expect(part.kind).toBe('ceiling');
        expect(part.metadata.ceilingDetailKind).toBe('fixture');
        expect(part.metadata.ceilingId).toBe('ceiling_manual');
        expect(part.metadata.sourceId).toBe('ceiling_manual');
      }
      expect(new Set(parts.map((part) => part.id)).size).toBe(2);
    }

    // The fill answers to the ceiling and to nothing smaller: it stands in for
    // every lamp in its cell at once, so there is no one fixture for the RCP
    // editor to select it as.
    for (const bounce of bouncesOf(descriptors)) {
      expect(bounce.metadata.ceilingDetailElementId).toBeUndefined();
      expect(bounce.metadata.ceilingDetailKind).toBe('bounce');
      expect(bounce.metadata.sourceId).toBe('ceiling_manual');
    }
  });

  it('draws the fixtures whether or not the screws are asked for', () => {
    const ceiling = manualCeiling({ detailing: { lighting: { fixtures: FIXTURES } } });
    const project = createProject([ceiling]);

    const plain = byDetailKind(buildCeilingPreviewObjects(ceiling, project), 'fixture');
    const detailed = byDetailKind(buildCeilingPreviewObjects(ceiling, project, { fasteners: true }), 'fixture');
    expect(plain).toHaveLength(FIXTURES.length * 2);
    expect(detailed).toHaveLength(plain.length);

    // And nothing at all when the ceiling itself is switched off.
    const off = manualCeiling({ detailing: { enabled: false, lighting: { fixtures: FIXTURES } } });
    expect(buildCeilingPreviewObjects(off, createProject([off]))).toEqual([]);
  });
});

/**
 * The indirect field a lit room throws back at itself, as one lamp per patch of
 * ceiling rather than one per fitting.
 *
 * The whole argument for aggregating is that the stand-in was already uniform —
 * so the thing these have to prove is that nothing was lost in the sum: the same
 * total flux, entering at the same plane, from the place inside the cell the
 * light actually comes from. And that a room bigger than one patch still gets a
 * fill at both ends of it rather than one bright one in the middle.
 */
describe('ceiling bounce light aggregation', () => {
  const BOARD_UNDERSIDE = MANUAL_BASE_ELEVATION;

  const litCeiling = (fixtures, overrides = {}) =>
    manualCeiling({ ...overrides, detailing: { ...overrides.detailing, lighting: { fixtures } } });

  function build(fixtures, overrides = {}) {
    const ceiling = litCeiling(fixtures, overrides);
    const project = createProject([ceiling]);
    return {
      bounces: buildCeilingPreviewObjects(ceiling, project).filter((entry) => entry.role === 'bounce'),
      lamps: buildCeilingPreviewObjects(ceiling, project).filter((entry) => entry.role === 'lamp'),
      fixtures: deriveCeilingDetail(ceiling, project).lightFixtures,
    };
  }

  const FOUR_CANS = [
    { id: 'lt_a', u: 800, v: 800, fixtureType: 'recessed_can_6' },
    { id: 'lt_b', u: 2400, v: 800, fixtureType: 'recessed_can_6' },
    { id: 'lt_c', u: 800, v: 2200, fixtureType: 'recessed_can_6' },
    { id: 'lt_d', u: 2400, v: 2200, fixtureType: 'recessed_can_6' },
  ];

  it('replaces a room’s worth of fills with one, carrying all of their flux', () => {
    const { bounces, fixtures } = build(FOUR_CANS);

    // Four cans over a 4 × 3 m ceiling are one patch, so one fill.
    expect(bounces).toHaveLength(1);

    const expected = fixtures.reduce(
      (total, fixture) => total + fixtureBounceIntensity(fixture.photometrics.lumens),
      0,
    );
    expect(bounces[0].intensity).toBeCloseTo(expected, 6);
    // Not a rounding of one can's worth: the sum is what the room receives.
    expect(bounces[0].intensity).toBeCloseTo(fixtureBounceIntensity(650) * 4, 6);
  });

  it('sets the fill in the mounting plane at the centre of the flux, not of the fittings', () => {
    // A panel worth several cans, off to one side of them. The fill has to be
    // pulled toward it, because that is where the light in the room is.
    const mixed = [
      { id: 'lt_can', u: 500, v: 1500, fixtureType: 'recessed_can_6' },
      { id: 'lt_panel', u: 3500, v: 1500, fixtureType: 'troffer_2x4' },
    ];
    const { bounces, fixtures } = build(mixed);
    expect(bounces).toHaveLength(1);

    const weights = fixtures.map((fixture) => fixtureBounceIntensity(fixture.photometrics.lumens));
    const total = weights[0] + weights[1];
    const expectedX = (fixtures[0].plan.x * weights[0] + fixtures[1].plan.x * weights[1]) / total;
    const expectedZ = (fixtures[0].plan.y * weights[0] + fixtures[1].plan.y * weights[1]) / total;

    expect(bounces[0].position.x).toBeCloseTo(expectedX, 6);
    expect(bounces[0].position.z).toBeCloseTo(expectedZ, 6);
    // The panel outshines the can, so the fill sits past the midpoint of the two.
    expect(weights[1]).toBeGreaterThan(weights[0]);
    expect(bounces[0].position.x).toBeGreaterThan((fixtures[0].plan.x + fixtures[1].plan.x) / 2);

    // Set exactly in the mounting plane, not below it with the lamps: the ceiling
    // is then edge-on to it and picks up nothing, which is what stops a ring of
    // light appearing around every recessed can.
    expect(bounces[0].position.y).toBe(BOARD_UNDERSIDE);
  });

  it('is a shadowless omnidirectional point, whatever the lamps under it are', () => {
    // A pendant hangs its lamp 900 mm down and a track head throws a cone; the
    // light the room gives back does neither.
    const { bounces } = build([
      { id: 'lt_pendant', u: 1000, v: 1000, fixtureType: 'pendant' },
      { id: 'lt_track', u: 2000, v: 2000, fixtureType: 'track_head', aim: { tiltDeg: 90, azimuthDeg: 0 } },
    ]);

    expect(bounces).toHaveLength(1);
    expect(bounces[0].lightType).toBe('point');
    expect(bounces[0].angleRad).toBeNull();
    expect(bounces[0].castShadow).toBe(false);
    expect(bounces[0].distanceMm).toBe(0);
    expect(bounces[0].aim).toEqual({ x: 0, y: -1, z: 0 });
    expect(bounces[0].position.y).toBe(BOARD_UNDERSIDE);
  });

  it('gives an open plan a fill per patch, and still spends the same flux', () => {
    // 14 m long: three 6 m cells across it, with lamps in the first and the third.
    const wide = {
      boundaryPolygon: [
        { x: 1000, y: 500 },
        { x: 15000, y: 500 },
        { x: 15000, y: 3500 },
        { x: 1000, y: 3500 },
      ],
    };
    const { bounces, fixtures } = build(
      [
        { id: 'lt_west', u: 1000, v: 1500, fixtureType: 'recessed_can_6' },
        { id: 'lt_east', u: 13000, v: 1500, fixtureType: 'recessed_can_6' },
      ],
      wide,
    );

    expect(bounces).toHaveLength(2);
    // One at each end, not one bright one in the middle — the fill has to reach
    // the far corner of a room it is standing in for.
    expect(bounces[0].position.x).toBeCloseTo(2000, 6);
    expect(bounces[1].position.x).toBeCloseTo(14000, 6);

    const expected = fixtures.reduce(
      (total, fixture) => total + fixtureBounceIntensity(fixture.photometrics.lumens),
      0,
    );
    const emitted = bounces.reduce((total, bounce) => total + bounce.intensity, 0);
    expect(emitted).toBeCloseTo(expected, 6);
  });

  it('names its cells the same way twice, so a rebuild reuses them', () => {
    const first = build(FOUR_CANS);
    const second = build(FOUR_CANS);
    expect(second.bounces.map((entry) => entry.id)).toEqual(first.bounces.map((entry) => entry.id));
    // And every lamp points at one that exists.
    const ids = new Set(first.bounces.map((entry) => entry.id));
    for (const lamp of first.lamps) expect(ids.has(lamp.bounceLightId)).toBe(true);
  });

  it('mixes colour temperature by flux rather than picking one', () => {
    const { bounces } = build([
      { id: 'lt_warm', u: 1000, v: 1500, fixtureType: 'recessed_can_6', colorTempK: 2700 },
      { id: 'lt_cool', u: 3000, v: 1500, fixtureType: 'recessed_can_6', colorTempK: 5000 },
    ]);

    const warm = kelvinToRgb(2700);
    const cool = kelvinToRgb(5000);
    expect(bounces).toHaveLength(1);
    // Two equal lamps, so the mean of the two — between them on every channel,
    // and equal to neither.
    expect(bounces[0].color.b).toBeCloseTo((warm.b + cool.b) / 2, 6);
    expect(bounces[0].color.b).toBeGreaterThan(warm.b);
    expect(bounces[0].color.b).toBeLessThan(cool.b);
  });

  it('emits nothing for a ceiling with no lamps on it', () => {
    expect(build([]).bounces).toEqual([]);
  });
});
