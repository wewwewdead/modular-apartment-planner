import { describe, expect, it } from 'vitest';
import { BUILDING_COMMANDS, executeBuildingCommand } from './buildingCommands';
import {
  createBeam,
  createColumn,
  createDoor,
  createFixture,
  createProject,
  createRoom,
  createSlab,
  createWall,
  createWindow,
} from './models';
import { QUANTITY_PROVENANCE, deriveQuantityTakeoff } from './quantityTakeoff';

function makeMeasuredProject() {
  const project = createProject('Measured apartment');
  const floor = project.floors[0];
  const wall = { ...createWall({ x: 0, y: 0 }, { x: 5000, y: 0 }), id: 'wall_1' };
  const firstColumn = { ...createColumn(0, 0), id: 'column_1' };
  const secondColumn = { ...createColumn(4000, 0), id: 'column_2' };
  floor.walls = [wall];
  floor.doors = [{ ...createDoor(wall.id, 1000), id: 'door_1' }];
  floor.windows = [{ ...createWindow(wall.id, 3000), id: 'window_1' }];
  floor.columns = [firstColumn, secondColumn];
  floor.beams = [
    { ...createBeam({ kind: 'column', id: firstColumn.id }, { kind: 'column', id: secondColumn.id }), id: 'beam_1' },
  ];
  floor.slabs = [
    createSlab(floor.id, [
      { x: 0, y: 0 },
      { x: 5000, y: 0 },
      { x: 5000, y: 4000 },
      { x: 0, y: 4000 },
    ]),
  ];
  floor.rooms = [
    createRoom('Unit', [
      { x: 0, y: 0 },
      { x: 5000, y: 0 },
      { x: 5000, y: 4000 },
      { x: 0, y: 4000 },
    ]),
  ];
  floor.fixtures = [createFixture('toilet', 1000, 1000), createFixture('bed', 2500, 2000)];
  return project;
}

describe('quantity takeoff', () => {
  it('derives traceable geometry quantities and deducts wall openings', () => {
    const takeoff = deriveQuantityTakeoff(makeMeasuredProject());
    const byId = new Map(takeoff.items.map((entry) => [entry.id, entry]));

    expect(byId.get('concrete')).toMatchObject({
      quantity: 4.99,
      unit: 'm³',
      provenance: QUANTITY_PROVENANCE.EXACT_GEOMETRY,
    });
    expect(byId.get('masonry').quantity).toBeCloseTo(11.67);
    expect(byId.get('paint').quantity).toBeCloseTo(23.34);
    expect(byId.get('formwork').quantity).toBeCloseTo(31.8);
    expect(byId.get('floor_finish').quantity).toBeCloseTo(20);
    expect(byId.get('doors').quantity).toBe(1);
    expect(byId.get('windows').quantity).toBe(1);
    expect(byId.get('plumbing_fixtures').quantity).toBe(1);
    expect(byId.get('reinforcement')).toMatchObject({
      quantity: 0,
      provenance: QUANTITY_PROVENANCE.ALLOWANCE,
    });
    expect(takeoff.warnings).toContain(
      'Reinforcement is unquantified until an explicit kg/m³ allowance is configured.',
    );
  });

  it('deducts modeled slab openings from concrete, soffit formwork, and slab-based finishes', () => {
    const project = makeMeasuredProject();
    project.floors[0].rooms = [];
    project.floors[0].slabs[0].openings = [
      {
        id: 'opening_1',
        purpose: 'stair',
        boundaryPoints: [
          { x: 1000, y: 1000 },
          { x: 2000, y: 1000 },
          { x: 2000, y: 2000 },
          { x: 1000, y: 2000 },
        ],
      },
    ];

    const takeoff = deriveQuantityTakeoff(project);
    const byId = new Map(takeoff.items.map((entry) => [entry.id, entry]));

    expect(byId.get('concrete').quantity).toBeCloseTo(4.79);
    expect(byId.get('concrete').inputs.slabOpeningsDeductedM2).toBeCloseTo(1);
    expect(byId.get('formwork').quantity).toBeCloseTo(30.8);
    expect(byId.get('floor_finish')).toMatchObject({
      quantity: 19,
      provenance: QUANTITY_PROVENANCE.CONFIGURED_ASSEMBLY,
    });
  });

  it('separates framed board-wall quantities from masonry and includes double-wall framing', () => {
    const project = makeMeasuredProject();
    project.floors[0].walls[0].assembly = {
      preset: 'fiber_cement',
      system: 'framed',
      interior: { material: 'fiber_cement', thickness: 6, layerCount: 1 },
      exterior: { material: 'plywood', thickness: 12, layerCount: 2 },
      framing: {
        material: 'light_gauge_steel',
        studWidth: 50,
        studDepth: 75,
        spacing: 400,
        startOffset: 0,
        nogginRows: 1,
        frameCount: 2,
        frameGap: 25,
      },
    };

    const byId = new Map(deriveQuantityTakeoff(project).items.map((entry) => [entry.id, entry]));
    expect(byId.has('masonry')).toBe(false);
    expect(byId.get('fiber_cement_board').quantity).toBeCloseTo(11.67);
    expect(byId.get('plywood_board').quantity).toBeCloseTo(23.34);
    expect(byId.get('wall_framing').quantity).toBeGreaterThan(40);
    expect(byId.get('wall_framing')).toMatchObject({
      provenance: QUANTITY_PROVENANCE.CONFIGURED_ASSEMBLY,
      inputs: { openingFramingIncluded: true, framedWallCount: 1 },
    });
  });

  it('counts modeled electrical points exactly and labels excavation as a configured allowance', () => {
    const project = makeMeasuredProject();
    project.building.systems.electrical.panelZones = [{ id: 'panel_1', kind: 'electrical_panel' }];
    project.building.systems.electrical.points = [
      { id: 'point_1', kind: 'outlet', floorId: project.floors[0].id, panelZoneId: 'panel_1' },
      { id: 'point_2', kind: 'light', floorId: project.floors[0].id, panelZoneId: 'panel_1' },
    ];
    const result = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.CONFIGURE_QUANTITY_PROFILE,
      reinforcementAllowanceKgPerM3: null,
      excavationDepth: 800,
      unitRates: { electricalPoint: 1200, excavation: 450 },
    });
    expect(result.ok, result.error?.message).toBe(true);
    const takeoff = deriveQuantityTakeoff(result.project);
    expect(takeoff.items.find((entry) => entry.id === 'electrical_points')).toMatchObject({
      quantity: 2,
      provenance: QUANTITY_PROVENANCE.EXACT_GEOMETRY,
      pricingBasis: 'legacy_user_entered_total_rate',
    });
    expect(takeoff.items.find((entry) => entry.id === 'excavation')).toMatchObject({
      quantity: 16,
      provenance: QUANTITY_PROVENANCE.ALLOWANCE,
      inputs: { groundSlabAreaM2: 20, excavationDepthMm: 800 },
    });
    expect(takeoff.warnings).not.toContain(
      'Excavation is unquantified until an explicit planning depth is configured.',
    );
  });

  it('applies explicit allowances and user rates without presenting an unpriced total as complete', () => {
    const project = makeMeasuredProject();
    const result = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.CONFIGURE_QUANTITY_PROFILE,
      reinforcementAllowanceKgPerM3: 100,
      unitRates: {
        concrete: 7000,
        reinforcement: 70,
        masonry: null,
        formwork: null,
        floorFinish: null,
        paint: null,
        roofing: null,
        door: null,
        window: null,
        plumbingFixture: null,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.changes.domain).toContainEqual(
      expect.objectContaining({ entityType: 'quantityProfile', operation: 'replace' }),
    );
    const takeoff = deriveQuantityTakeoff(result.project);
    const reinforcement = takeoff.items.find((entry) => entry.id === 'reinforcement');
    expect(reinforcement.quantity).toBeCloseTo(499);
    expect(reinforcement.estimatedCost).toBeCloseTo(34_930);
    expect(takeoff.pricedItemCount).toBe(2);
    expect(takeoff.unpricedItemCount).toBeGreaterThan(0);
    expect(takeoff.totalEstimatedCost).toBeCloseTo(69_860);
  });

  it('rejects negative allowances and rates', () => {
    const project = makeMeasuredProject();
    const allowance = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.CONFIGURE_QUANTITY_PROFILE,
      reinforcementAllowanceKgPerM3: -1,
      unitRates: {},
    });
    expect(allowance).toMatchObject({ ok: false, error: { code: 'invalid-reinforcement-allowance' } });

    const rate = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.CONFIGURE_QUANTITY_PROFILE,
      reinforcementAllowanceKgPerM3: null,
      unitRates: { concrete: -1 },
    });
    expect(rate).toMatchObject({ ok: false, error: { code: 'invalid-quantity-rate' } });
  });
});
