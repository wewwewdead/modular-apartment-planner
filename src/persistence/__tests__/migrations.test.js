import { describe, it, expect, beforeEach } from 'vitest';

// We need to test the migration registry in isolation, so we import the
// module fresh. The actual migration_14_to_15 is tested via deserialize.test.js.

describe('runMigrations', () => {
  // Dynamic import to get a fresh module for each test would be ideal,
  // but since the registry is a singleton Map, we test the public behavior.

  it('is importable', async () => {
    const { runMigrations, registerMigration } = await import('../migrations/index.js');
    expect(typeof runMigrations).toBe('function');
    expect(typeof registerMigration).toBe('function');
  });

  it('runs registered migration in sequence', async () => {
    // The migration_14_to_15 is already registered via the glob import in deserialize.js
    // We test the full pipeline via deserialize.test.js
    // Here we just verify the registry functions exist and have correct types
    const { runMigrations, registerMigration } = await import('../migrations/index.js');
    expect(typeof registerMigration).toBe('function');
    expect(typeof runMigrations).toBe('function');
  });

  it('throws when migration chain has a gap', async () => {
    const { runMigrations } = await import('../migrations/index.js');
    // Try to migrate from version 100 to 200 — no migration registered
    expect(() => runMigrations({}, 100, 200)).toThrow('No migration registered from schema version 100');
  });

  it('returns project unchanged when fromVersion equals targetVersion', async () => {
    const { runMigrations } = await import('../migrations/index.js');
    const project = { id: 'test' };
    const result = runMigrations(project, 15, 15);
    expect(result).toBe(project); // Same reference — no migration ran
  });
});

describe('migration auto-discovery smoke test', () => {
  it('has at least one migration registered after glob import', async () => {
    // Import deserialize to trigger the import.meta.glob side effect
    await import('../deserialize.js');
    const { runMigrations } = await import('../migrations/index.js');

    // If the glob matched 0 files, this would throw "No migration registered from schema version 14"
    const project = {
      id: 'smoke_test',
      name: 'Smoke',
      floors: [{ id: 'f1', name: 'Floor', walls: [], levelIndex: 0, elevation: 0, floorToFloorHeight: 2700 }],
    };
    expect(() => runMigrations(project, 14, 15)).not.toThrow();
  });
});

describe('migration_18_to_19 systems realization backfill', () => {
  it('adds the persisted Lambda profile and state without changing existing geometry', async () => {
    await import('../deserialize.js');
    const { runMigrations } = await import('../migrations/index.js');
    const { createProject } = await import('@/domain/models');
    const legacy = createProject('Legacy Kappa project');
    const systems = { ...legacy.building.systems };
    delete systems.realizationProfile;
    delete systems.realization;
    const result = runMigrations({ ...legacy, version: 17, building: { ...legacy.building, systems } }, 18, 19);
    expect(result.version).toBe(18);
    expect(result.building.systems.realizationProfile.id).toBe('lambda_small_apartment_systems_realization_v1');
    expect(result.building.systems.realization).toMatchObject({
      status: 'not_realized',
      generatedEntityRefs: {
        drainageRoutes: [],
        electricalRisers: [],
        panelZones: [],
        electricalPoints: [],
        waterEquipmentZones: [],
        outdoorUnitZones: [],
        slabOpenings: [],
      },
    });
    expect(result.floors).toEqual(legacy.floors);
  });
});

describe('migration_19_to_20 cost realization backfill', () => {
  it('adds the persisted Mu profile and state without changing existing geometry', async () => {
    await import('../deserialize.js');
    const { runMigrations } = await import('../migrations/index.js');
    const { createProject } = await import('@/domain/models');
    const legacy = createProject('Legacy Lambda project');
    const building = { ...legacy.building };
    delete building.costRealizationProfile;
    delete building.costRealization;
    const result = runMigrations({ ...legacy, version: 18, building }, 19, 20);
    expect(result.version).toBe(19);
    expect(result.building.costRealizationProfile.id).toBe('mu_ph_owner_feasibility_realization_v1');
    expect(result.building.costRealization).toMatchObject({
      status: 'not_realized',
      lineItemSnapshots: [],
      scenarioSnapshots: [],
      valueEngineeringOpportunities: [],
      bidStatus: 'not_a_bid',
      appraisalStatus: 'not_an_appraisal',
      professionalCostCertificationStatus: 'not_performed',
    });
    expect(result.floors).toEqual(legacy.floors);
  });
});

describe('migration_20_to_21 documentation realization backfill', () => {
  it('adds the persisted Nu profile and issue state without changing existing sheets or geometry', async () => {
    await import('../deserialize.js');
    const { runMigrations } = await import('../migrations/index.js');
    const { createProject } = await import('@/domain/models');
    const legacy = createProject('Legacy Mu project');
    const building = { ...legacy.building };
    delete building.documentationRealizationProfile;
    delete building.documentationRealization;
    const result = runMigrations({ ...legacy, version: 19, building }, 20, 21);
    expect(result.version).toBe(20);
    expect(result.building.documentationRealizationProfile.id).toBe('nu_professional_review_documentation_v1');
    expect(result.building.documentationRealization).toMatchObject({
      status: 'not_issued',
      sheetSnapshots: [],
      deliverableSnapshots: [],
      unresolvedFindingSnapshots: [],
      annotationSnapshots: [],
      permitStatus: 'not_a_permit_submission',
      constructionStatus: 'not_for_construction',
      professionalSealStatus: 'not_provided',
    });
    expect(result.floors).toEqual(legacy.floors);
    expect(result.sheets).toEqual(legacy.sheets);
  });
});

describe('migration_21_to_22 professional exchange backfill', () => {
  it('adds Xi interoperability state without changing Nu sheets or geometry', async () => {
    await import('../deserialize.js');
    const { runMigrations } = await import('../migrations/index.js');
    const { createProject } = await import('@/domain/models');
    const legacy = createProject('Legacy Nu project');
    const building = { ...legacy.building };
    delete building.professionalExchangeProfile;
    delete building.professionalExchange;
    const result = runMigrations({ ...legacy, version: 20, building }, 21, 22);
    expect(result.version).toBe(21);
    expect(result.building.professionalExchangeProfile).toMatchObject({
      id: 'xi_professional_interoperability_exchange_v1',
      ifcCertificationStatus: 'not_ifc_certified',
      permitAcceptanceStatus: 'not_accepted_or_submitted',
      professionalApprovalStatus: 'not_claimed',
    });
    expect(result.building.professionalExchange).toMatchObject({
      status: 'not_published',
      exchanges: [],
      reviewerMarkups: [],
      externalResponses: [],
    });
    expect(result.floors).toEqual(legacy.floors);
    expect(result.sheets).toEqual(legacy.sheets);
  });
});

describe('migration_22_to_23 wall-detail backfill', () => {
  it('adds disabled detailing to existing framed walls without changing geometry', async () => {
    const { migrateV22toV23 } = await import('../migrations/migration_22_to_23.js');
    const { createProject, createWall } = await import('@/domain/models');
    const legacy = createProject('Wall detail migration');
    legacy.floors[0].walls = [
      createWall({ x: 0, y: 0 }, { x: 3000, y: 0 }, 100, { assembly: { preset: 'fiber_cement' } }),
    ];
    delete legacy.floors[0].walls[0].assembly.detailing;

    const result = migrateV22toV23(legacy);

    expect(result.version).toBe(22);
    expect(result.floors[0].walls[0].assembly.detailing).toMatchObject({ enabled: false, schemaVersion: 1 });
    expect(result.floors[0].walls[0].start).toEqual({ x: 0, y: 0 });
    expect(result.floors[0].walls[0].end).toEqual({ x: 3000, y: 0 });
  });
});

describe('migration_23_to_24 wall-detail dimension backfill', () => {
  it('adds dimension settings without changing existing wall-detail entities', async () => {
    const { migrateV23toV24 } = await import('../migrations/migration_23_to_24.js');
    const { createProject, createWall } = await import('@/domain/models');
    const legacy = createProject('Wall dimension migration');
    const wall = createWall({ x: 0, y: 0 }, { x: 3000, y: 0 }, 100, {
      assembly: { preset: 'fiber_cement' },
    });
    wall.assembly.detailing = {
      schemaVersion: 1,
      enabled: true,
      activeSide: 'interior',
      jurisdictionProfileId: 'global-unverified-v1',
      sides: {
        interior: { enabled: true, layout: {}, fasteners: {} },
        exterior: { enabled: false, layout: {}, fasteners: {} },
      },
      framing: { mode: 'automatic', members: [], removedGeneratedIds: [] },
      asBuilt: { tolerance: 6, measurements: [] },
    };
    legacy.floors[0].walls = [wall];

    const result = migrateV23toV24(legacy);

    expect(result.version).toBe(23);
    expect(result.floors[0].walls[0].assembly.detailing).toMatchObject({
      schemaVersion: 2,
      sides: {
        interior: {
          dimensions: {
            showOverall: true,
            showOpenings: true,
            showPanels: false,
            showFraming: false,
            manual: [],
          },
        },
      },
    });
    expect(result.floors[0].walls[0].start).toEqual({ x: 0, y: 0 });
    expect(result.floors[0].walls[0].end).toEqual({ x: 3000, y: 0 });
  });
});

describe('migration_24_to_25 ceiling collection backfill', () => {
  it('adds an empty project-level ceilings array without touching the rest of the model', async () => {
    const { migrateV24toV25 } = await import('../migrations/migration_24_to_25.js');
    const { createProject } = await import('@/domain/models');
    const legacy = createProject('Ceiling migration');
    delete legacy.ceilings;

    const result = migrateV24toV25(legacy);

    expect(result.ceilings).toEqual([]);
    expect(result.floors).toBe(legacy.floors);
    expect(result.trussSystems).toBe(legacy.trussSystems);
    // The domain format version is unchanged by this schema-only step.
    expect(result.version).toBe(legacy.version);
  });

  it('preserves ceilings that a newer save already carried', async () => {
    const { migrateV24toV25 } = await import('../migrations/migration_24_to_25.js');
    const ceilings = [{ id: 'ceiling_1', floorId: 'floor_1' }];
    expect(migrateV24toV25({ id: 'p1', ceilings }).ceilings).toBe(ceilings);
  });
});

describe('migration_14_to_15 beam floorLevel backfill (regression)', () => {
  // Regression for a `no-undef` bug at migration_14_to_15 line 121: the beam backfill
  // loop referenced an out-of-scope `index` variable inside a `for...of floor` loop.
  // For an old v14 save containing a beam WITHOUT `floorLevel`, this branch executed and
  // threw `ReferenceError: index is not defined`, so the project failed to load.
  async function migrate(project) {
    await import('../deserialize.js');
    const { runMigrations } = await import('../migrations/index.js');
    return runMigrations(project, 14, 15);
  }

  it('backfills floorLevel from the floor elevation for a beam missing it', async () => {
    const project = {
      id: 'beam_backfill',
      name: 'Beam Backfill',
      floors: [
        {
          id: 'f1',
          name: 'Ground Floor',
          levelIndex: 0,
          elevation: 3000,
          floorToFloorHeight: 2700,
          walls: [],
          // Beam intentionally has NO floorLevel -> exercises the previously broken branch.
          beams: [{ id: 'beam1', startRef: null, endRef: null }],
        },
      ],
    };

    // Before the fix this threw ReferenceError: index is not defined.
    const result = await migrate(project);

    const migratedBeam = result.floors[0].beams[0];
    expect(migratedBeam.floorLevel).toBe(3000);
  });

  it('leaves an existing beam floorLevel untouched', async () => {
    const project = {
      id: 'beam_keep',
      name: 'Beam Keep',
      floors: [
        {
          id: 'f1',
          name: 'Ground Floor',
          levelIndex: 0,
          elevation: 0,
          floorToFloorHeight: 2700,
          walls: [],
          beams: [{ id: 'beam1', startRef: null, endRef: null, floorLevel: 1234 }],
        },
      ],
    };

    const result = await migrate(project);

    expect(result.floors[0].beams[0].floorLevel).toBe(1234);
  });
});

describe('migration_25_to_26 electrical device collection backfill', () => {
  it('adds an empty electricalDevices array to every floor', async () => {
    const { migrateV25toV26 } = await import('../migrations/migration_25_to_26.js');
    const legacy = {
      id: 'p1',
      floors: [
        { id: 'floor_1', walls: [] },
        { id: 'floor_2', walls: [] },
      ],
      version: 23,
    };

    const result = migrateV25toV26(legacy);

    expect(result.floors.map((floor) => floor.electricalDevices)).toEqual([[], []]);
    // The domain format version is unchanged by this schema-only step.
    expect(result.version).toBe(legacy.version);
  });

  it('preserves devices a newer save already carried', async () => {
    const { migrateV25toV26 } = await import('../migrations/migration_25_to_26.js');
    const floor = { id: 'floor_1', electricalDevices: [{ id: 'elec_1', wallId: 'wall_1' }] };
    expect(migrateV25toV26({ id: 'p1', floors: [floor] }).floors[0]).toBe(floor);
  });

  it('loads a v25 save through deserializeProject with the collection present', async () => {
    const { deserializeProject } = await import('../deserialize.js');
    const { createProject } = await import('@/domain/models');
    const payload = createProject('Pre-electrical save');
    payload.floors = payload.floors.map(({ electricalDevices: _devices, ...floor }) => floor);

    const { project } = deserializeProject({ schemaVersion: 25, version: payload.version, data: payload });

    expect(project.floors.every((floor) => Array.isArray(floor.electricalDevices))).toBe(true);
    expect(project.floors[0].electricalDevices).toEqual([]);
  });
});
