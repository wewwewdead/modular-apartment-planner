import { describe, it, expect } from 'vitest';
import { createBeam, createColumn, createProject, createWall } from '@/domain/models';
import {
  WALL_ASSEMBLY_PRESETS,
  WALL_BOARD_MATERIALS,
  createWallAssembly,
  resolveWallAssembly,
  wallAssemblyThickness,
} from '@/domain/wallAssemblies';
import { deserializeProject } from '../deserialize';
import { serializeProject } from '../serialize';

function makeEnvelope(data, overrides = {}) {
  return {
    version: 14,
    data: {
      id: 'proj_test_1',
      name: 'Test Project',
      floors: [
        {
          id: 'floor_test_1',
          name: 'Ground Floor',
          walls: [],
        },
      ],
      ...data,
    },
    savedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('deserializeProject', () => {
  describe('schema version detection', () => {
    it('reads schemaVersion when present', () => {
      const input = makeEnvelope({}, { schemaVersion: 15 });
      const { project } = deserializeProject(input);
      expect(project.id).toBe('proj_test_1');
    });

    it('falls back to version when schemaVersion is absent', () => {
      const input = makeEnvelope({}, { version: 14 });
      delete input.schemaVersion;
      const { project } = deserializeProject(input);
      expect(project.id).toBe('proj_test_1');
    });

    it('prefers schemaVersion over version', () => {
      const input = makeEnvelope({}, { schemaVersion: 15, version: 14 });
      // schemaVersion wins, so this enters the 15 -> current migration step.
      const { project } = deserializeProject(input);
      expect(project.id).toBe('proj_test_1');
    });

    it('normalizes legacy versions 1-14 to migration start 14', () => {
      // Version 1 should still work — it enters migration pipeline at 14
      const input = makeEnvelope({}, { version: 1 });
      const { project } = deserializeProject(input);
      expect(project.id).toBe('proj_test_1');
    });
  });

  describe('error handling', () => {
    it('throws CorruptedDataError for null input', () => {
      expect(() => deserializeProject(null)).toThrow('not an Apartment Planner project file');
    });

    it('throws CorruptedDataError for an object that is not a project at all', () => {
      expect(() => deserializeProject({ version: 14 })).toThrow('not an Apartment Planner project file');
    });

    it('throws CorruptedDataError for an envelope with an empty data payload', () => {
      expect(() => deserializeProject({ version: 14, data: null })).toThrow('Invalid project data');
    });

    it('throws UnsupportedVersionError for unknown version', () => {
      expect(() => deserializeProject({ version: 999, data: {} })).toThrow('Unsupported schema version');
    });

    it('throws UnsupportedVersionError for version 0', () => {
      expect(() => deserializeProject({ version: 0, data: {} })).toThrow('Unsupported schema version');
    });

    it('throws CorruptedDataError for missing project id', () => {
      const input = { version: 14, data: { name: 'Test', floors: [] } };
      expect(() => deserializeProject(input)).toThrow('Invalid project structure');
    });

    it('throws CorruptedDataError for missing project name', () => {
      const input = { version: 14, data: { id: 'proj_1', floors: [] } };
      expect(() => deserializeProject(input)).toThrow('Invalid project structure');
    });

    it('throws CorruptedDataError for missing floors', () => {
      const input = { version: 14, data: { id: 'proj_1', name: 'Test' } };
      expect(() => deserializeProject(input)).toThrow('Invalid project structure');
    });

    it('throws CorruptedDataError for floor without id', () => {
      const input = { version: 14, data: { id: 'proj_1', name: 'Test', floors: [{ walls: [] }] } };
      expect(() => deserializeProject(input)).toThrow('Invalid floor structure');
    });

    it('throws CorruptedDataError for floor without walls array', () => {
      const input = { version: 14, data: { id: 'proj_1', name: 'Test', floors: [{ id: 'f1' }] } };
      expect(() => deserializeProject(input)).toThrow('Invalid floor structure');
    });

    it('preserves error type for CorruptedDataError', () => {
      try {
        deserializeProject(null);
      } catch (e) {
        expect(e.name).toBe('CorruptedDataError');
        expect(e.code).toBe('CORRUPTED_DATA');
        return;
      }
      expect.fail('Should have thrown');
    });

    it('preserves error type for UnsupportedVersionError', () => {
      try {
        deserializeProject({ version: 999, data: {} });
      } catch (e) {
        expect(e.name).toBe('UnsupportedVersionError');
        expect(e.code).toBe('UNSUPPORTED_VERSION');
        expect(e.version).toBe(999);
        return;
      }
      expect.fail('Should have thrown');
    });
  });

  describe('migration pipeline', () => {
    it('runs migration for version 14 data', () => {
      const input = makeEnvelope({});
      const { project } = deserializeProject(input);
      // After migration, project should have backfilled fields
      expect(project.sheets).toEqual([]);
      expect(project.roofSystem).toBeNull();
      expect(project.trussSystems).toEqual([]);
      expect(project.ceilings).toEqual([]);
      expect(project.address).toBe('');
      expect(project.documentDefaults).toEqual({ drawnBy: '', checkedBy: '' });
    });

    it('migrates a v24 envelope with no ceilings up to the current schema', async () => {
      const { CURRENT_SCHEMA_VERSION } = await import('@/domain/projectVersion');
      expect(CURRENT_SCHEMA_VERSION).toBe(29);

      const { createProject } = await import('@/domain/models');
      const payload = createProject('Pre-ceiling save');
      delete payload.ceilings;
      const { project } = deserializeProject({ schemaVersion: 24, version: payload.version, data: payload });

      expect(project.ceilings).toEqual([]);
      expect(project.version).toBe(23);
    });

    it('carries stored ceilings through a current-schema round trip', async () => {
      const { createProject } = await import('@/domain/models');
      const { createCeiling } = await import('@/domain/ceilingModels');
      const payload = createProject('Ceiling save');
      const ceiling = createCeiling('Living Ceiling', { id: 'ceiling_1', floorId: payload.floors[0].id });
      payload.ceilings = [ceiling];

      const { project } = deserializeProject({ schemaVersion: 25, version: payload.version, data: payload });

      expect(project.ceilings).toHaveLength(1);
      expect(project.ceilings[0]).toMatchObject({ id: 'ceiling_1', name: 'Living Ceiling' });
    });

    it('migrates version 15 data into the coordinated building core', () => {
      const input = makeEnvelope(
        {
          sheets: [],
          roofSystem: null,
          trussSystems: [],
          address: '123 Main St',
          documentDefaults: { drawnBy: 'JM', checkedBy: 'AB' },
          phases: [],
          version: 14,
          floors: [
            {
              id: 'floor_1',
              name: 'Ground Floor',
              levelIndex: 0,
              elevation: 0,
              floorToFloorHeight: 2700,
              walls: [],
              rooms: [],
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
              railings: [],
              annotationSettings: {},
            },
          ],
        },
        { schemaVersion: 15 },
      );
      const { project } = deserializeProject(input);
      expect(project.address).toBe('123 Main St');
      expect(project.documentDefaults.drawnBy).toBe('JM');
      expect(project.version).toBe(23);
      expect(project.building.levelIds).toEqual(['floor_1']);
      expect(project.building.jurisdiction).toMatchObject({ countryCode: 'PH', unitSystem: 'metric' });
      expect(project.building.apartmentDesign).toMatchObject({ status: 'not_detailed', sourceTestFitId: null });
      expect(project.building.apartmentDesignProfile).toMatchObject({ id: 'iota_small_tropical_apartment_design_v1' });
      expect(project.building.systems.structural.realization).toMatchObject({
        status: 'not_realized',
        sourceTestFitId: null,
      });
      expect(project.building.systems.structural.realizationProfile).toMatchObject({
        id: 'kappa_small_rc_frame_realization_v1',
      });
      expect(project.building.systems.realization).toMatchObject({
        status: 'not_realized',
        professionalReviewRequired: true,
      });
      expect(project.building.systems.realizationProfile).toMatchObject({
        id: 'lambda_small_apartment_systems_realization_v1',
      });
    });

    it('preserves savedAt from envelope', () => {
      const input = makeEnvelope({}, { savedAt: '2025-06-15T12:00:00.000Z' });
      const { savedAt } = deserializeProject(input);
      expect(savedAt).toBe('2025-06-15T12:00:00.000Z');
    });
  });

  describe('backfill (migration 14→15)', () => {
    it('backfills empty floor arrays', () => {
      const input = makeEnvelope({
        floors: [
          {
            id: 'floor_1',
            name: 'Floor',
            walls: [],
          },
        ],
      });
      const { project } = deserializeProject(input);
      const floor = project.floors[0];
      expect(floor.rooms).toEqual([]);
      expect(floor.doors).toEqual([]);
      expect(floor.windows).toEqual([]);
      expect(floor.columns).toEqual([]);
      expect(floor.beams).toEqual([]);
      expect(floor.stairs).toEqual([]);
      expect(floor.landings).toEqual([]);
      expect(floor.fixtures).toEqual([]);
      expect(floor.annotations).toEqual([]);
      expect(floor.slabs).toEqual([]);
      expect(floor.sectionCuts).toEqual([]);
    });

    it('backfills door defaults', () => {
      const input = makeEnvelope({
        floors: [
          {
            id: 'floor_1',
            name: 'Floor',
            walls: [{ id: 'w1', height: 2700, startAttachment: null, endAttachment: null }],
            doors: [{ id: 'd1', wallId: 'w1', position: 0.5 }],
          },
        ],
      });
      const { project } = deserializeProject(input);
      const door = project.floors[0].doors[0];
      expect(door.type).toBe('swing');
      expect(typeof door.height).toBe('number');
      expect(typeof door.sillHeight).toBe('number');
    });

    it('backfills window defaults', () => {
      const input = makeEnvelope({
        floors: [
          {
            id: 'floor_1',
            name: 'Floor',
            walls: [{ id: 'w1', height: 2700, startAttachment: null, endAttachment: null }],
            windows: [{ id: 'win1', wallId: 'w1', position: 0.5 }],
          },
        ],
      });
      const { project } = deserializeProject(input);
      const win = project.floors[0].windows[0];
      expect(win.type).toBe('standard');
      expect(win.openDirection).toBe('left');
      expect(typeof win.height).toBe('number');
      expect(typeof win.sillHeight).toBe('number');
    });

    it('migrates single slab to slabs array', () => {
      const slab = { id: 'slab_1', boundaryPoints: [], thickness: 200, elevation: 0 };
      const input = makeEnvelope({
        floors: [
          {
            id: 'floor_1',
            name: 'Floor',
            walls: [],
            slab,
          },
        ],
      });
      const { project } = deserializeProject(input);
      const floor = project.floors[0];
      expect(floor.slab).toBeUndefined();
      expect(floor.slabs).toHaveLength(1);
      expect(floor.slabs[0].id).toBe('slab_1');
    });

    it('migrates single sectionCut to sectionCuts array', () => {
      const sectionCut = { id: 'sc_1', startPoint: { x: 0, y: 0 }, endPoint: { x: 1000, y: 0 } };
      const input = makeEnvelope({
        floors: [
          {
            id: 'floor_1',
            name: 'Floor',
            walls: [],
            sectionCut,
          },
        ],
      });
      const { project } = deserializeProject(input);
      const floor = project.floors[0];
      expect(floor.sectionCut).toBeUndefined();
      expect(floor.sectionCuts).toHaveLength(1);
      expect(floor.sectionCuts[0].id).toBe('sc_1');
    });
  });
});

describe('rainscreen board layers survive a save and reload', () => {
  it('round-trips the material and rebuilds the same wall thickness', () => {
    const project = createProject('Rainscreen test');
    const wall = createWall({ x: 0, y: 0 }, { x: 6000, y: 0 }, 100, {
      height: 5400,
      assembly: createWallAssembly(WALL_ASSEMBLY_PRESETS.FIBER_CEMENT, {
        exterior: { material: WALL_BOARD_MATERIALS.RAINSCREEN },
      }),
    });
    project.floors[0].walls = [wall];

    // Through the real file shape — JSON, not a structuredClone — because the
    // point is that a new material string needs no schema of its own.
    const reloaded = deserializeProject(JSON.parse(JSON.stringify(serializeProject(project)))).project;
    const assembly = resolveWallAssembly(reloaded.floors[0].walls[0]);

    expect(assembly.exterior).toEqual({
      material: 'rainscreen',
      thickness: 8,
      layerCount: 1,
      overhangStart: 0,
      overhangEnd: 0,
    });
    expect(assembly.interior).toEqual({
      material: 'fiber_cement',
      thickness: 6,
      layerCount: 1,
      overhangStart: 0,
      overhangEnd: 0,
    });
    // 75 of stud + 6 of lining + 8 of cassette.
    expect(wallAssemblyThickness(assembly)).toBe(89);
    expect(wallAssemblyThickness(assembly)).toBe(wallAssemblyThickness(resolveWallAssembly(wall)));
  });
});

describe('board overhangs survive a save and reload', () => {
  it('round-trips both edges of both faces with no schema of their own', () => {
    const project = createProject('Corner lap test');
    const wall = createWall({ x: 0, y: 0 }, { x: 6000, y: 0 }, 100, {
      height: 3000,
      assembly: createWallAssembly(WALL_ASSEMBLY_PRESETS.MIXED_BOARD, {
        interior: { overhangStart: 15 },
        // The corner detail as a builder sets it: this board laps the wall it
        // meets at one end and is lapped by it at the other.
        exterior: { overhangStart: 137, overhangEnd: -137 },
      }),
    });
    project.floors[0].walls = [wall];

    // Same reasoning as the rainscreen case above: two more numbers on a layer
    // that is already stored need no schema bump, and the proof is the file.
    const reloaded = deserializeProject(JSON.parse(JSON.stringify(serializeProject(project)))).project;
    const assembly = resolveWallAssembly(reloaded.floors[0].walls[0]);

    expect(assembly.exterior.overhangStart).toBe(137);
    expect(assembly.exterior.overhangEnd).toBe(-137);
    expect(assembly.interior.overhangStart).toBe(15);
    expect(assembly.interior.overhangEnd).toBe(0);
    // Cladding runs past the end; it never gets any thicker for doing it.
    expect(wallAssemblyThickness(assembly)).toBe(wallAssemblyThickness(resolveWallAssembly(wall)));
  });
});

describe('a ceiling saved on the storey datum heals on load', () => {
  it('comes back hanging from the beams that were under it all along', () => {
    const project = createProject('Stranded ceiling test');
    const floor = project.floors[0];
    floor.floorToFloorHeight = 3000;
    const column = (id, x, y) => ({ ...createColumn(x, y, 300, 300, { height: 2700 }), id });
    const beam = (id, startId, endId) => ({
      ...createBeam({ kind: 'column', id: startId }, { kind: 'column', id: endId }, 250, 450, 2700),
      id,
    });
    floor.columns = [column('col_sw', 0, 0), column('col_se', 9000, 0), column('col_nw', 0, 6000)];
    floor.beams = [beam('beam_s', 'col_sw', 'col_se'), beam('beam_w', 'col_sw', 'col_nw')];
    // What the creation bug wrote to disk: manual, on the storey top, with beams
    // sitting 300 mm below it.
    project.ceilings = [
      {
        id: 'ceiling_1',
        name: 'Ceiling',
        floorId: floor.id,
        phaseId: null,
        attachment: { mode: 'manual', beamIds: [] },
        boundarySource: 'auto',
        boundaryPolygon: [
          { x: 0, y: 0 },
          { x: 9000, y: 0 },
          { x: 9000, y: 6000 },
          { x: 0, y: 6000 },
        ],
        baseElevation: 3000,
        detailing: { enabled: true },
      },
    ];

    // Through the real file shape, because the claim is about what a project
    // already saved does when it is opened again — no schema bump involved.
    const reloaded = deserializeProject(JSON.parse(JSON.stringify(serializeProject(project)))).project;

    expect(reloaded.ceilings[0].attachment).toEqual({ mode: 'beam', beamIds: ['beam_s', 'beam_w'] });
    expect(reloaded.ceilings[0].baseElevation).toBe(2700);
  });
});
