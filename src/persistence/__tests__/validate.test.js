import { describe, it, expect } from 'vitest';
import {
  validateProjectStructure,
  validateProjectReferences,
  repairBrokenReferences,
  validateAndRepair,
} from '../validate';
import { createCanonicalBuilding } from '@/domain/buildingModels';

function makeProject(overrides = {}) {
  const project = {
    id: 'proj_1',
    name: 'Test',
    floors: [
      {
        id: 'floor_1',
        walls: [{ id: 'w1' }],
        doors: [],
        windows: [],
        columns: [],
        beams: [],
        stairs: [],
        landings: [],
        fixtures: [],
        annotations: [],
        slabs: [],
        sectionCuts: [],
        rooms: [],
        railings: [],
      },
    ],
    phases: [],
    sheets: [],
    roofSystem: null,
    trussSystems: [],
    ...overrides,
  };
  if (!Object.prototype.hasOwnProperty.call(overrides, 'building')) {
    project.building = createCanonicalBuilding(project.id, project.floors);
  }
  return project;
}

describe('validateProjectStructure', () => {
  it('returns no errors for a valid project', () => {
    const errors = validateProjectStructure(makeProject());
    expect(errors).toEqual([]);
  });

  it('returns errors for null project', () => {
    const errors = validateProjectStructure(null);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('returns errors for missing id', () => {
    const errors = validateProjectStructure(makeProject({ id: '' }));
    expect(errors.some((e) => e.path === 'id')).toBe(true);
  });

  it('returns errors for missing name', () => {
    const errors = validateProjectStructure(makeProject({ name: '' }));
    expect(errors.some((e) => e.path === 'name')).toBe(true);
  });

  it('returns errors for empty floors', () => {
    const errors = validateProjectStructure(makeProject({ floors: [] }));
    expect(errors.some((e) => e.path === 'floors')).toBe(true);
  });

  it('returns errors for floor without id', () => {
    const errors = validateProjectStructure(
      makeProject({
        floors: [{ walls: [] }],
      }),
    );
    expect(errors.some((e) => e.path.includes('floors[0]'))).toBe(true);
  });

  it('returns errors for floor without walls array', () => {
    const errors = validateProjectStructure(
      makeProject({
        floors: [{ id: 'f1' }],
      }),
    );
    expect(errors.some((e) => e.path.includes('floors[0]'))).toBe(true);
  });

  it('returns errors for door without id', () => {
    const errors = validateProjectStructure(
      makeProject({
        floors: [{ id: 'f1', walls: [], doors: [{ wallId: 'w1' }] }],
      }),
    );
    expect(errors.some((e) => e.message.includes('Door missing id'))).toBe(true);
  });

  it('returns errors for door without wallId', () => {
    const errors = validateProjectStructure(
      makeProject({
        floors: [{ id: 'f1', walls: [], doors: [{ id: 'd1' }] }],
      }),
    );
    expect(errors.some((e) => e.message.includes('missing wallId'))).toBe(true);
  });
});

describe('validateProjectReferences', () => {
  it('returns no warnings for a valid project', () => {
    const warnings = validateProjectReferences(makeProject());
    expect(warnings).toEqual([]);
  });

  it('flags doors referencing non-existent walls', () => {
    const project = makeProject({
      floors: [
        {
          id: 'f1',
          walls: [{ id: 'w1' }],
          doors: [{ id: 'd1', wallId: 'w_nonexistent' }],
          windows: [],
          columns: [],
          beams: [],
          stairs: [],
          landings: [],
          fixtures: [],
          annotations: [],
          slabs: [],
          sectionCuts: [],
          rooms: [],
          railings: [],
        },
      ],
    });
    const warnings = validateProjectReferences(project);
    expect(warnings.some((w) => w.message.includes('non-existent wall'))).toBe(true);
  });

  it('flags windows referencing non-existent walls', () => {
    const project = makeProject({
      floors: [
        {
          id: 'f1',
          walls: [{ id: 'w1' }],
          doors: [],
          windows: [{ id: 'win1', wallId: 'w_nonexistent' }],
          columns: [],
          beams: [],
          stairs: [],
          landings: [],
          fixtures: [],
          annotations: [],
          slabs: [],
          sectionCuts: [],
          rooms: [],
          railings: [],
        },
      ],
    });
    const warnings = validateProjectReferences(project);
    expect(warnings.some((w) => w.message.includes('non-existent wall'))).toBe(true);
  });

  it('flags objects with non-existent phaseId', () => {
    const project = makeProject({
      phases: [{ id: 'phase_1' }],
      floors: [
        {
          id: 'f1',
          walls: [{ id: 'w1', phaseId: 'phase_nonexistent' }],
          doors: [],
          windows: [],
          columns: [],
          beams: [],
          stairs: [],
          landings: [],
          fixtures: [],
          annotations: [],
          slabs: [],
          sectionCuts: [],
          rooms: [],
          railings: [],
        },
      ],
    });
    const warnings = validateProjectReferences(project);
    expect(warnings.some((w) => w.message.includes('non-existent phase'))).toBe(true);
  });

  it('flags slab supports that do not exist on the host floor', () => {
    const project = makeProject();
    project.floors[0].slabs = [
      {
        id: 'slab_1',
        floorId: 'floor_1',
        boundaryPoints: [],
        supportRefs: [{ kind: 'beam', id: 'beam_missing' }],
        openings: [],
      },
    ];

    expect(validateProjectReferences(project)).toContainEqual(
      expect.objectContaining({ message: 'supportRef references non-existent beam beam_missing' }),
    );
  });

  it('flags broken Delta service, egress, and stair-opening relationships', () => {
    const project = makeProject();
    project.floors[0].rooms = [{ id: 'room_1', points: [] }];
    project.floors[0].stairs = [
      {
        id: 'stair_1',
        coordination: {
          clearanceOpeningRef: { floorId: 'floor_1', slabId: 'slab_missing', openingId: 'opening_missing' },
        },
      },
    ];
    project.building.systems.plumbing.drainageRoutes = [
      { id: 'drain_1', floorId: 'floor_missing', sourceShaftId: 'shaft_missing' },
    ];
    project.building.systems.egress.routes = [
      { id: 'route_1', floorId: 'floor_1', fromRoomId: 'room_1', exitId: 'exit_missing' },
    ];

    const warnings = validateProjectReferences(project);
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining('clearanceOpeningRef') }),
        expect.objectContaining({ message: expect.stringContaining('Drainage route references') }),
        expect.objectContaining({ message: expect.stringContaining('Egress route references') }),
      ]),
    );
  });
});

describe('repairBrokenReferences', () => {
  it('clears room membership that references a missing unit instance', () => {
    const project = makeProject();
    project.floors[0].rooms = [
      {
        id: 'room_1',
        name: 'Studio',
        points: [],
        unitInstanceId: 'unit_missing',
        spaceRequirementId: 'sleeping',
      },
    ];

    const repaired = validateAndRepair(project);
    expect(repaired.floors[0].rooms[0]).toMatchObject({
      unitInstanceId: null,
      spaceRequirementId: null,
    });
  });

  it('removes doors referencing non-existent walls', () => {
    const project = makeProject({
      floors: [
        {
          id: 'f1',
          walls: [{ id: 'w1' }],
          doors: [
            { id: 'd1', wallId: 'w1' },
            { id: 'd2', wallId: 'w_gone' },
          ],
          windows: [],
          columns: [],
          beams: [],
          stairs: [],
          landings: [],
          fixtures: [],
          annotations: [],
          slabs: [],
          sectionCuts: [],
          rooms: [],
          railings: [],
        },
      ],
    });
    const repaired = repairBrokenReferences(project);
    expect(repaired.floors[0].doors).toHaveLength(1);
    expect(repaired.floors[0].doors[0].id).toBe('d1');
  });

  it('nullifies invalid phaseId on walls', () => {
    const project = makeProject({
      phases: [{ id: 'phase_1' }],
      floors: [
        {
          id: 'f1',
          walls: [{ id: 'w1', phaseId: 'phase_gone' }],
          doors: [],
          windows: [],
          columns: [],
          beams: [],
          stairs: [],
          landings: [],
          fixtures: [],
          annotations: [],
          slabs: [],
          sectionCuts: [],
          rooms: [],
          railings: [],
        },
      ],
    });
    const repaired = repairBrokenReferences(project);
    expect(repaired.floors[0].walls[0].phaseId).toBeNull();
  });

  it('does not modify valid references', () => {
    const project = makeProject({
      phases: [{ id: 'phase_1' }],
      floors: [
        {
          id: 'f1',
          walls: [{ id: 'w1', phaseId: 'phase_1' }],
          doors: [{ id: 'd1', wallId: 'w1', phaseId: 'phase_1' }],
          windows: [],
          columns: [],
          beams: [],
          stairs: [],
          landings: [],
          fixtures: [],
          annotations: [],
          slabs: [],
          sectionCuts: [],
          rooms: [],
          railings: [],
        },
      ],
    });
    const repaired = repairBrokenReferences(project);
    expect(repaired.floors[0].walls[0].phaseId).toBe('phase_1');
    expect(repaired.floors[0].doors[0].wallId).toBe('w1');
  });

  it('removes broken slab support references while preserving valid supports and openings', () => {
    const project = makeProject();
    project.floors[0].beams = [{ id: 'beam_1' }];
    project.floors[0].slabs = [
      {
        id: 'slab_1',
        floorId: 'floor_1',
        boundaryPoints: [],
        supportRefs: [
          { kind: 'beam', id: 'beam_1' },
          { kind: 'beam', id: 'beam_missing' },
        ],
        openings: [
          {
            id: 'opening_1',
            boundaryPoints: [
              { x: 0, y: 0 },
              { x: 1, y: 0 },
              { x: 0, y: 1 },
            ],
          },
        ],
      },
    ];

    const repaired = repairBrokenReferences(project);
    expect(repaired.floors[0].slabs[0].supportRefs).toEqual([{ kind: 'beam', id: 'beam_1' }]);
    expect(repaired.floors[0].slabs[0].openings).toHaveLength(1);
  });

  it('repairs broken Delta system relationships without discarding valid modeled geometry', () => {
    const project = makeProject();
    project.floors[0].rooms = [{ id: 'room_1', points: [] }];
    project.floors[0].stairs = [
      {
        id: 'stair_1',
        coordination: {
          minimumHeadroom: 2000,
          clearanceOpeningRef: { floorId: 'floor_1', slabId: 'slab_missing', openingId: 'opening_missing' },
        },
      },
    ];
    project.building.systems.plumbing.drainageRoutes = [
      { id: 'drain_1', floorId: 'floor_missing', sourceShaftId: 'shaft_missing' },
    ];
    project.building.systems.egress.exits = [{ id: 'exit_1', floorId: 'floor_missing', point: { x: 0, y: 0 } }];
    project.building.systems.egress.routes = [
      { id: 'route_1', floorId: 'floor_1', fromRoomId: 'room_1', exitId: 'exit_1', points: [] },
    ];

    const repaired = repairBrokenReferences(project);
    expect(repaired.floors[0].stairs[0].coordination).toEqual({
      minimumHeadroom: 2000,
      clearanceOpeningRef: null,
    });
    expect(repaired.floors[0].rooms).toHaveLength(1);
    expect(repaired.building.systems.plumbing.drainageRoutes).toEqual([]);
    expect(repaired.building.systems.egress).toMatchObject({ exits: [], routes: [] });
  });
});

describe('validateAndRepair', () => {
  it('throws ProjectValidationError for structurally invalid projects', () => {
    expect(() => validateAndRepair({ id: '', name: '', floors: [] })).toThrow('Project failed structural validation');
  });

  it('returns project unchanged when references are valid', () => {
    const project = makeProject();
    const result = validateAndRepair(project);
    expect(result.id).toBe('proj_1');
    expect(result.floors).toHaveLength(1);
  });

  it('auto-repairs broken references and returns fixed project', () => {
    const project = makeProject({
      floors: [
        {
          id: 'f1',
          walls: [{ id: 'w1' }],
          doors: [{ id: 'd1', wallId: 'w_broken' }],
          windows: [],
          columns: [],
          beams: [],
          stairs: [],
          landings: [],
          fixtures: [],
          annotations: [],
          slabs: [],
          sectionCuts: [],
          rooms: [],
          railings: [],
        },
      ],
    });
    const result = validateAndRepair(project);
    // Broken door should be removed
    expect(result.floors[0].doors).toHaveLength(0);
  });

  it('rejects malformed feasibility collections and assembly rate keys', () => {
    const project = makeProject();
    project.building.quantityProfile = {
      ...project.building.quantityProfile,
      priceProfiles: {},
      assemblies: [{ id: 'assembly_unknown', rateKey: 'unknown' }],
      scenarios: [],
    };

    const errors = validateProjectStructure(project);
    expect(errors.map((entry) => entry.path)).toContain('building.quantityProfile.priceProfiles');
    expect(errors.map((entry) => entry.path)).toContain('building.quantityProfile.assemblies[0]');
  });

  it('reports broken feasibility profile and active-scenario references', () => {
    const project = makeProject();
    project.building.quantityProfile = {
      ...project.building.quantityProfile,
      priceProfiles: [{ id: 'prices_valid' }],
      scenarios: [{ id: 'scenario_broken', priceProfileId: 'prices_missing' }],
      activeScenarioId: 'scenario_missing',
    };

    const warnings = validateProjectReferences(project);
    expect(warnings.some((entry) => entry.path === 'feasibilityScenario scenario_broken')).toBe(true);
    expect(warnings.some((entry) => entry.path === 'building.quantityProfile.activeScenarioId')).toBe(true);
  });

  it('repairs broken feasibility references without discarding valid scenarios', () => {
    const project = makeProject();
    project.building.quantityProfile = {
      ...project.building.quantityProfile,
      priceProfiles: [{ id: 'prices_valid', name: 'Valid prices' }],
      scenarios: [
        { id: 'scenario_valid', name: 'Valid', priceProfileId: 'prices_valid' },
        { id: 'scenario_broken', name: 'Broken', priceProfileId: 'prices_missing' },
      ],
      activeScenarioId: 'scenario_broken',
    };

    const repaired = repairBrokenReferences(project);
    expect(repaired.building.quantityProfile.scenarios.map((entry) => entry.id)).toEqual(['scenario_valid']);
    expect(repaired.building.quantityProfile.activeScenarioId).toBe('scenario_valid');
  });

  it('validates and repairs the active professional-review revision reference', () => {
    const project = makeProject();
    project.building.documentation = {
      reviewItems: [],
      revisionSnapshots: [
        { id: 'revision_a', code: 'A', label: 'Review', date: '2026-08-01', author: 'Owner', entityRecords: [] },
      ],
      activeRevisionId: 'revision_missing',
    };

    expect(validateProjectReferences(project)).toContainEqual(
      expect.objectContaining({ path: 'building.documentation.activeRevisionId' }),
    );
    expect(repairBrokenReferences(project).building.documentation.activeRevisionId).toBe('revision_a');
  });

  it('rejects malformed professional-handoff collections', () => {
    const project = makeProject();
    project.building.assumptions = {};
    project.building.documentation = { reviewItems: {}, revisionSnapshots: [] };
    const errors = validateProjectStructure(project);
    expect(errors.map((entry) => entry.path)).toEqual(
      expect.arrayContaining(['building.assumptions', 'building.documentation.reviewItems']),
    );
  });
});

describe('Eta relationship persistence', () => {
  it('reports and repairs broken parking, equipment, electrical-point, and roof-drain references', () => {
    const project = makeProject();
    project.building.site.parkingPlan = {
      profile: {},
      bays: [{ id: 'bay_valid' }],
      accessRoutes: [{ id: 'access_1', servedBayIds: ['bay_valid', 'bay_missing'], points: [] }],
    };
    project.building.systems.electrical.panelZones = [
      {
        id: 'panel_valid',
        kind: 'electrical_panel',
        location: 'floor',
        floorId: 'floor_1',
        servedFloorIds: ['floor_1', 'floor_missing'],
      },
      {
        id: 'panel_bad_floor',
        kind: 'electrical_panel',
        location: 'floor',
        floorId: 'floor_missing',
        servedFloorIds: [],
      },
    ];
    project.building.systems.electrical.points = [
      { id: 'point_valid', floorId: 'floor_1', panelZoneId: 'panel_valid' },
      { id: 'point_bad', floorId: 'floor_1', panelZoneId: 'panel_missing' },
    ];
    project.building.systems.water.equipmentZones = [
      { id: 'tank_1', kind: 'water_tank', location: 'ground', servedFloorIds: ['floor_1', 'floor_missing'] },
    ];
    project.roofSystem = {
      id: 'roof_1',
      roofPlanes: [{ id: 'plane_valid' }],
      drains: [
        {
          id: 'drain_1',
          catchmentPlaneIds: ['plane_valid', 'plane_missing'],
          outletRef: { kind: 'plumbing_shaft', id: 'shaft_missing' },
        },
      ],
    };

    const warningPaths = validateProjectReferences(project).map((entry) => entry.path);
    expect(warningPaths).toEqual(
      expect.arrayContaining([
        'parkingAccessRoute access_1',
        'equipmentZone panel_valid',
        'equipmentZone panel_bad_floor',
        'electricalPoint point_bad',
        'roofDrain drain_1',
      ]),
    );

    const repaired = repairBrokenReferences(project);
    expect(repaired.building.site.parkingPlan.accessRoutes[0].servedBayIds).toEqual(['bay_valid']);
    expect(repaired.building.systems.electrical.panelZones.map((entry) => entry.id)).toEqual(['panel_valid']);
    expect(repaired.building.systems.electrical.panelZones[0].servedFloorIds).toEqual(['floor_1']);
    expect(repaired.building.systems.electrical.points.map((entry) => entry.id)).toEqual(['point_valid']);
    expect(repaired.building.systems.water.equipmentZones[0].servedFloorIds).toEqual(['floor_1']);
    expect(repaired.roofSystem.drains[0]).toMatchObject({ catchmentPlaneIds: ['plane_valid'], outletRef: null });
  });

  it('rejects malformed Eta collections', () => {
    const project = makeProject();
    project.building.site.parkingPlan = { bays: {}, accessRoutes: [] };
    project.building.systems.electrical.panelZones = {};
    project.building.systems.electrical.points = {};
    project.building.systems.water.equipmentZones = {};
    project.building.systems.mechanical.outdoorUnitZones = {};
    expect(validateProjectStructure(project).map((entry) => entry.path)).toEqual(
      expect.arrayContaining([
        'building.site.parkingPlan.bays',
        'building.systems.electrical.panelZones',
        'building.systems.electrical.points',
        'building.systems.water.equipmentZones',
        'building.systems.mechanical.outdoorUnitZones',
      ]),
    );
  });
});

describe('Theta test-fit persistence', () => {
  it('validates test-fit collections and reports broken option relationships', () => {
    const malformed = makeProject();
    malformed.building.testFitOptions = {};
    expect(validateProjectStructure(malformed)).toContainEqual(
      expect.objectContaining({ path: 'building.testFitOptions' }),
    );

    const project = makeProject();
    project.building.testFitOptions = [
      {
        id: 'fit_1',
        floorPlans: [{ levelIndex: 0, blocks: [{ id: 'unit_1', kind: 'unit', unitTypeId: 'missing_type' }] }],
        proposedGrid: { xOffsets: [], yOffsets: [] },
      },
    ];
    project.building.selectedTestFitId = 'fit_missing';
    project.building.acceptedTestFitId = 'fit_missing';
    const warningPaths = validateProjectReferences(project).map((entry) => entry.path);
    expect(warningPaths).toEqual(
      expect.arrayContaining(['testFitOption fit_1', 'building.selectedTestFitId', 'building.acceptedTestFitId']),
    );
  });

  it('repairs broken test-fit references without altering valid alternatives', () => {
    const project = makeProject();
    project.building.unitTypes = [{ id: 'studio_type' }];
    const option = (id, unitTypeId) => ({
      id,
      floorPlans: [{ levelIndex: 0, blocks: [{ id: `${id}_unit`, kind: 'unit', unitTypeId }] }],
      proposedGrid: { xOffsets: [], yOffsets: [] },
    });
    project.building.testFitOptions = [option('fit_valid', 'studio_type'), option('fit_broken', 'missing_type')];
    project.building.selectedTestFitId = 'fit_valid';
    project.building.acceptedTestFitId = 'fit_broken';

    const repaired = repairBrokenReferences(project);
    expect(repaired.building.testFitOptions.map((entry) => entry.id)).toEqual(['fit_valid']);
    expect(repaired.building.selectedTestFitId).toBe('fit_valid');
    expect(repaired.building.acceptedTestFitId).toBeNull();
  });
});

describe('Iota apartment-design persistence', () => {
  it('rejects malformed design state and reports broken source and unit relationships', () => {
    const malformed = makeProject();
    malformed.building.apartmentDesign.generatedEntityRefs.rooms = {};
    expect(validateProjectStructure(malformed)).toContainEqual(
      expect.objectContaining({ path: 'building.apartmentDesign.generatedEntityRefs.rooms' }),
    );

    const project = makeProject();
    project.building.apartmentDesign = {
      ...project.building.apartmentDesign,
      status: 'detailed',
      sourceTestFitId: 'fit_missing',
      detailedUnitInstanceIds: ['unit_missing'],
    };
    const paths = validateProjectReferences(project).map((entry) => entry.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        'building.apartmentDesign.sourceTestFitId',
        'building.apartmentDesign.detailedUnitInstanceIds',
      ]),
    );
  });

  it('repairs invalid design relationships back to an honest undetailed state', () => {
    const project = makeProject();
    project.building.apartmentDesign = {
      ...project.building.apartmentDesign,
      status: 'detailed',
      sourceTestFitId: 'fit_missing',
      inputSignature: 'stale',
      detailedUnitInstanceIds: ['unit_missing'],
    };
    const repaired = repairBrokenReferences(project).building.apartmentDesign;
    expect(repaired).toMatchObject({
      status: 'not_detailed',
      sourceTestFitId: null,
      inputSignature: '',
      detailedUnitInstanceIds: [],
    });
  });
});

describe('Kappa structural-realization persistence', () => {
  it('rejects malformed realization state and reports broken source and generated relationships', () => {
    const malformed = makeProject();
    malformed.building.systems.structural.realization.generatedEntityRefs.beams = {};
    expect(validateProjectStructure(malformed)).toContainEqual(
      expect.objectContaining({ path: 'building.systems.structural.realization.generatedEntityRefs.beams' }),
    );

    const project = makeProject();
    project.building.systems.structural.realization = {
      ...project.building.systems.structural.realization,
      status: 'realized',
      sourceTestFitId: 'fit_missing',
      generatedEntityRefs: { columnStacks: ['stack_missing'], columns: ['column_missing'], beams: ['beam_missing'] },
    };
    const paths = validateProjectReferences(project).map((entry) => entry.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        'building.systems.structural.realization.sourceTestFitId',
        'building.systems.structural.realization.generatedEntityRefs.columnStacks',
        'building.systems.structural.realization.generatedEntityRefs.columns',
        'building.systems.structural.realization.generatedEntityRefs.beams',
      ]),
    );
  });

  it('repairs broken realization relationships back to an honest unrealized state', () => {
    const project = makeProject();
    project.building.systems.structural.realization = {
      ...project.building.systems.structural.realization,
      status: 'realized',
      sourceTestFitId: 'fit_missing',
      sourceApartmentDesignSignature: 'old-design',
      inputSignature: 'old-structure',
      generatedEntityRefs: { columnStacks: ['stack_missing'], columns: ['column_missing'], beams: ['beam_missing'] },
      skippedBeamSegments: [{ floorId: 'floor_1', openingIds: ['opening_missing'] }],
    };
    const repaired = repairBrokenReferences(project).building.systems.structural.realization;
    expect(repaired).toMatchObject({
      status: 'not_realized',
      sourceTestFitId: null,
      sourceApartmentDesignSignature: '',
      inputSignature: '',
      generatedEntityRefs: { columnStacks: [], columns: [], beams: [] },
      skippedBeamSegments: [],
    });
  });
});
