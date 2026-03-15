import { describe, it, expect } from 'vitest';
import { deserializeProject } from '../deserialize';

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
      // schemaVersion 15 means no migration needed — project passes through
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
      expect(() => deserializeProject(null)).toThrow('Invalid project data');
    });

    it('throws CorruptedDataError for missing data field', () => {
      expect(() => deserializeProject({ version: 14 })).toThrow('Invalid project data');
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
      expect(project.address).toBe('');
      expect(project.documentDefaults).toEqual({ drawnBy: '', checkedBy: '' });
    });

    it('skips migration for version 15 data', () => {
      // Version 15 data should pass through without migration
      const input = makeEnvelope(
        {
          sheets: [],
          roofSystem: null,
          trussSystems: [],
          address: '123 Main St',
          documentDefaults: { drawnBy: 'JM', checkedBy: 'AB' },
          phases: [],
          version: 14,
          floors: [{
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
          }],
        },
        { schemaVersion: 15 },
      );
      const { project } = deserializeProject(input);
      expect(project.address).toBe('123 Main St');
      expect(project.documentDefaults.drawnBy).toBe('JM');
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
        floors: [{
          id: 'floor_1',
          name: 'Floor',
          walls: [],
        }],
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
        floors: [{
          id: 'floor_1',
          name: 'Floor',
          walls: [{ id: 'w1', height: 2700, startAttachment: null, endAttachment: null }],
          doors: [{ id: 'd1', wallId: 'w1', position: 0.5 }],
        }],
      });
      const { project } = deserializeProject(input);
      const door = project.floors[0].doors[0];
      expect(door.type).toBe('swing');
      expect(typeof door.height).toBe('number');
      expect(typeof door.sillHeight).toBe('number');
    });

    it('backfills window defaults', () => {
      const input = makeEnvelope({
        floors: [{
          id: 'floor_1',
          name: 'Floor',
          walls: [{ id: 'w1', height: 2700, startAttachment: null, endAttachment: null }],
          windows: [{ id: 'win1', wallId: 'w1', position: 0.5 }],
        }],
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
        floors: [{
          id: 'floor_1',
          name: 'Floor',
          walls: [],
          slab,
        }],
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
        floors: [{
          id: 'floor_1',
          name: 'Floor',
          walls: [],
          sectionCut,
        }],
      });
      const { project } = deserializeProject(input);
      const floor = project.floors[0];
      expect(floor.sectionCut).toBeUndefined();
      expect(floor.sectionCuts).toHaveLength(1);
      expect(floor.sectionCuts[0].id).toBe('sc_1');
    });
  });
});
