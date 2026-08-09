import { describe, expect, it } from 'vitest';
import { createFloor, createRoom } from './models';
import { createTrussSystem } from './trussModels';
import {
  CEILING_ATTACHMENT_MODES,
  CEILING_OPENING_TYPES,
  CEILING_SCHEMA_VERSION,
  createCeiling,
  createCeilingDetailing,
  createCeilingFace,
  createCeilingForProject,
  createCeilingFraming,
  createCeilingOpening,
  createCeilingSuspension,
  createCustomCeilingFramingMember,
  createManualCeilingFastener,
  deriveCeilingBoundaryForFloor,
  deriveCeilingDetail,
  deriveCeilingFasteners,
  deriveCeilingFramingMembers,
  deriveCeilingHangers,
  deriveCeilingPanels,
  deriveCeilingTakeoff,
  getCeilingLocalSpace,
  getProjectCeiling,
  getProjectCeilings,
  resolveCeilingBoundary,
  resolveCeilingDetailing,
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
    expect(ceiling.attachment).toEqual({ mode: CEILING_ATTACHMENT_MODES.MANUAL, trussSystemId: null });
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
});

describe('createCeilingForProject', () => {
  function projectWithFloor() {
    const floor = createFloor('Ground Floor', 0, { elevation: 0, floorToFloorHeight: 2800 });
    floor.rooms = [
      createRoom('Living', [
        { x: 0, y: 0 },
        { x: 5000, y: 0 },
        { x: 5000, y: 3000 },
        { x: 0, y: 3000 },
      ]),
    ];
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

  it('takes the plan boundary from an attached truss system', () => {
    const { floor, project } = projectWithFloor();
    const trussSystem = createTrussSystem('Roof trusses', {
      floorId: floor.id,
      baseElevation: 3200,
      trussInstances: [
        {
          trussTypeId: 'truss_type_gable',
          span: 6000,
          startPoint: { x: 0, y: 0 },
          endPoint: { x: 0, y: 4000 },
          count: 5,
          spacing: 1000,
        },
      ],
    });
    project.trussSystems = [trussSystem];

    const ceiling = createCeilingForProject(project, {
      attachment: { mode: 'truss', trussSystemId: trussSystem.id },
    });

    expect(ceiling.attachment).toEqual({ mode: CEILING_ATTACHMENT_MODES.TRUSS, trussSystemId: trussSystem.id });
    expect(ceiling.baseElevation).toBe(3200);
    const xs = ceiling.boundaryPolygon.map((point) => point.x);
    const ys = ceiling.boundaryPolygon.map((point) => point.y);
    // Bearing to bearing: the 300 mm overhangs at each end of the span carry the
    // roof, not the ceiling, so the boundary is the 6000 span itself.
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(6000, 6);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(4000, 6);
    expect(resolveCeilingBoundary(project, ceiling)).toHaveLength(4);
  });

  it('falls back to manual mode when the truss system yields no boundary', () => {
    const { project } = projectWithFloor();
    project.trussSystems = [{ id: 'truss_system_stub', baseElevation: 3400, trussInstances: [] }];

    const ceiling = createCeilingForProject(project, {
      attachment: { mode: 'truss', trussSystemId: 'truss_system_stub' },
    });

    expect(ceiling.attachment.mode).toBe(CEILING_ATTACHMENT_MODES.MANUAL);
    expect(ceiling.baseElevation).toBe(2800);
    expect(ceiling.boundaryPolygon).toHaveLength(4);
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

  it('keeps the stored boundary when a truss system cannot be resolved', () => {
    const ceiling = rectCeiling({ attachment: { mode: 'truss', trussSystemId: 'missing' } });
    expect(resolveCeilingBoundary({ trussSystems: [] }, ceiling)).toEqual(RECT_BOUNDARY);
  });
});

describe('ceiling local space', () => {
  it('round-trips plan and RCP-local coordinates', () => {
    const space = getCeilingLocalSpace(RECT_BOUNDARY);
    expect(space).toMatchObject({ originX: 0, originY: 0, maxY: 4000, length: 6000, depth: 4000 });
    expect(space.toLocal({ x: 1000, y: 1000 })).toEqual({ u: 1000, v: 3000 });
    expect(space.toPlan({ u: 1000, v: 3000 })).toEqual({ x: 1000, y: 1000 });

    const offset = getCeilingLocalSpace([
      { x: -2000, y: 500 },
      { x: 4000, y: 500 },
      { x: 4000, y: 3500 },
      { x: -2000, y: 3500 },
    ]);
    expect(offset).toMatchObject({ originX: -2000, originY: 500, maxY: 3500, length: 6000, depth: 3000 });
    const local = offset.toLocal({ x: 1000, y: 2000 });
    expect(local).toEqual({ u: 3000, v: 1500 });
    expect(offset.toPlan(local)).toEqual({ x: 1000, y: 2000 });
    // The boundary's north-west plan corner is the local origin.
    expect(offset.toLocal({ x: -2000, y: 3500 })).toEqual({ u: 0, v: 0 });
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
    });
  });

  it('hangs the board below the truss attachment plane by the suspension drop', () => {
    const project = { trussSystems: [{ id: 'truss_system_stub', baseElevation: 3200, trussInstances: [] }] };
    const ceiling = rectCeiling({
      attachment: { mode: 'truss', trussSystemId: 'truss_system_stub' },
      detailing: { suspension: { drop: 250 } },
    });

    const elevations = resolveCeilingElevations(project, ceiling);
    expect(elevations.attachment).toBe(3200);
    expect(elevations.boardUnderside).toBe(2950);
    expect(elevations.boardTop).toBe(2954.5);
    expect(elevations.carrierTop).toBe(3011.5);
  });

  it('falls back to zero when a truss-attached ceiling has no resolvable system', () => {
    const ceiling = rectCeiling({ attachment: { mode: 'truss', trussSystemId: 'missing' } });
    expect(resolveCeilingElevations({ trussSystems: [] }, ceiling).attachment).toBe(0);
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

describe('ceiling framing', () => {
  it('runs furring across U and carriers along V with a wall angle per boundary edge', () => {
    const members = deriveCeilingFramingMembers(rectCeiling(), null);
    const furring = members.filter((member) => member.kind === 'furring');
    const carriers = members.filter((member) => member.kind === 'carrier');
    const wallAngle = members.filter((member) => member.kind === 'wall_angle');

    // Rows at 0, 406 … 3654 plus the closing row at the far edge.
    expect(furring).toHaveLength(11);
    expect(furring.every((member) => member.orientation === 'horizontal' && member.depth === 19)).toBe(true);
    expect(furring.every((member) => member.u0 === 0 && member.u1 === 6000)).toBe(true);
    expect(furring[0].v0).toBe(0);
    expect(furring[0].v1).toBe(25);
    expect(furring[0].id).toBe('ceiling_test:auto:furring:0:0');

    // Columns at 0, 1220 … 4880 plus the closing column at the far edge.
    expect(carriers).toHaveLength(6);
    expect(carriers.every((member) => member.orientation === 'vertical' && member.depth === 38)).toBe(true);
    expect(carriers.every((member) => member.v0 === 0 && member.v1 === 4000)).toBe(true);

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

  it('reports a disabled takeoff without dropping the geometry keys', () => {
    const takeoff = deriveCeilingTakeoff(rectCeiling({ detailing: { face: { enabled: false } } }), null);
    expect(takeoff.enabled).toBe(false);
    expect(takeoff.panelCount).toBe(0);
    expect(takeoff.fastenerCount).toBe(0);
    expect(takeoff.furringLinearMm).toBeGreaterThan(0);
  });

  it('assembles the full ceiling detail bundle', () => {
    const ceiling = rectCeiling({
      detailing: { openings: [{ id: 'hatch', u: 1000, v: 1000, width: 600, height: 600 }] },
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
    expect(detail.elevations.boardUnderside).toBe(2700);
  });
});
