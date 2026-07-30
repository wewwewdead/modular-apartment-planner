import { describe, it, expect } from 'vitest';
import { deserializeProject } from '../deserialize';
import { isRawProject, LEGACY_SCHEMA_VERSION, normalizeProjectEnvelope } from '../projectEnvelope';

// A minimal but realistic project payload — the object the serializer has always nested
// under `data`, matching the factory output of createProject().
function makeProjectPayload(overrides = {}) {
  return {
    id: 'proj_mmh5hhtx_0',
    name: 'Legacy Project',
    createdAt: '2026-03-08T02:46:00.837Z',
    updatedAt: '2026-03-15T02:44:32.056Z',
    floors: [
      {
        id: 'floor_mmh5hhtx_1',
        name: 'Ground Floor',
        walls: [],
      },
    ],
    version: 14,
    ...overrides,
  };
}

describe('normalizeProjectEnvelope', () => {
  describe('historical envelope shapes written by serializeProject', () => {
    // f5854ab "first commit" — { version: 1, data, savedAt }
    it('accepts the v1 envelope from the first commit', () => {
      const input = { version: 1, data: makeProjectPayload(), savedAt: '2026-03-08T03:00:00.000Z' };
      const { project, savedAt } = deserializeProject(input);
      expect(project.id).toBe('proj_mmh5hhtx_0');
      expect(savedAt).toBe('2026-03-08T03:00:00.000Z');
    });

    // f0340f9 — { version: 4, data, savedAt }
    it('accepts the v4 envelope', () => {
      const input = { version: 4, data: makeProjectPayload(), savedAt: '2026-03-12T03:00:00.000Z' };
      const { project } = deserializeProject(input);
      expect(project.id).toBe('proj_mmh5hhtx_0');
    });

    // 0aba1ad — { version: CURRENT_PROJECT_FILE_VERSION, data, savedAt }, no schemaVersion
    it('accepts the version-only envelope with no schemaVersion field', () => {
      const input = { version: 14, data: makeProjectPayload(), savedAt: '2026-03-15T03:00:00.000Z' };
      const { project } = deserializeProject(input);
      expect(project.id).toBe('proj_mmh5hhtx_0');
    });

    // fee0e15 — current { schemaVersion, version, data, savedAt }
    it('accepts the current schemaVersion envelope', () => {
      const input = {
        schemaVersion: 15,
        version: 14,
        data: makeProjectPayload(),
        savedAt: '2026-07-30T03:00:00.000Z',
      };
      const { project } = deserializeProject(input);
      expect(project.id).toBe('proj_mmh5hhtx_0');
    });

    it('leaves an envelope untouched rather than rewrapping it', () => {
      const input = { schemaVersion: 15, version: 14, data: makeProjectPayload(), savedAt: 'x' };
      expect(normalizeProjectEnvelope(input)).toBe(input);
    });
  });

  describe('bare project payload (no envelope)', () => {
    it('wraps a bare project object and runs it through the migration pipeline', () => {
      const { project } = deserializeProject(makeProjectPayload());
      expect(project.id).toBe('proj_mmh5hhtx_0');
      // Proof it went through migration 14 -> 15, not just straight through.
      expect(project.sheets).toEqual([]);
      expect(project.roofSystem).toBeNull();
      expect(project.trussSystems).toEqual([]);
      expect(project.documentDefaults).toEqual({ drawnBy: '', checkedBy: '' });
    });

    it('treats a bare project with no schemaVersion as legacy', () => {
      const envelope = normalizeProjectEnvelope(makeProjectPayload());
      expect(envelope.schemaVersion).toBe(LEGACY_SCHEMA_VERSION);
      expect(envelope.data.id).toBe('proj_mmh5hhtx_0');
    });

    it('does not read a bare project`s own version field as a schema version', () => {
      // project.version is the domain format version, not the persistence schema version.
      const envelope = normalizeProjectEnvelope(makeProjectPayload({ version: 3 }));
      expect(envelope.schemaVersion).toBe(LEGACY_SCHEMA_VERSION);
    });

    it('honours an explicit schemaVersion on a bare project', () => {
      const envelope = normalizeProjectEnvelope(makeProjectPayload({ schemaVersion: 15 }));
      expect(envelope.schemaVersion).toBe(15);
    });

    it('falls back to updatedAt for savedAt when the bare project has none', () => {
      const { savedAt } = deserializeProject(makeProjectPayload());
      expect(savedAt).toBe('2026-03-15T02:44:32.056Z');
    });

    it('prefers an explicit savedAt on a bare project', () => {
      const { savedAt } = deserializeProject(makeProjectPayload({ savedAt: '2026-05-01T00:00:00.000Z' }));
      expect(savedAt).toBe('2026-05-01T00:00:00.000Z');
    });
  });

  describe('{ project } wrapper shape', () => {
    it('unwraps a { version, project } wrapper', () => {
      const input = { version: 14, project: makeProjectPayload(), savedAt: '2026-04-01T00:00:00.000Z' };
      const { project, savedAt } = deserializeProject(input);
      expect(project.id).toBe('proj_mmh5hhtx_0');
      expect(savedAt).toBe('2026-04-01T00:00:00.000Z');
    });

    it('honours top-level version as the schema version on a wrapper', () => {
      const envelope = normalizeProjectEnvelope({ version: 15, project: makeProjectPayload() });
      expect(envelope.schemaVersion).toBe(15);
    });

    it('treats a wrapper with no version as legacy', () => {
      const envelope = normalizeProjectEnvelope({ project: makeProjectPayload() });
      expect(envelope.schemaVersion).toBe(LEGACY_SCHEMA_VERSION);
    });
  });

  describe('idempotence across entry points', () => {
    it('normalizing an already-normalized envelope is a no-op', () => {
      const once = normalizeProjectEnvelope(makeProjectPayload());
      const twice = normalizeProjectEnvelope(once);
      expect(twice).toBe(once);
      expect(twice.data.id).toBe('proj_mmh5hhtx_0');
    });

    it('deserializes the same project from bare, wrapped and enveloped forms', () => {
      const bare = deserializeProject(makeProjectPayload()).project;
      const wrapped = deserializeProject({ project: makeProjectPayload() }).project;
      const enveloped = deserializeProject({ version: 14, data: makeProjectPayload() }).project;
      expect(wrapped).toEqual(bare);
      expect(enveloped).toEqual(bare);
    });
  });

  describe('rejects non-project JSON', () => {
    it('rejects null', () => {
      expect(() => deserializeProject(null)).toThrow('not an Apartment Planner project file');
    });

    it('rejects a primitive', () => {
      expect(() => deserializeProject('hello')).toThrow('not an Apartment Planner project file');
    });

    it('rejects an array', () => {
      expect(() => deserializeProject([makeProjectPayload()])).toThrow('not an Apartment Planner project file');
    });

    it('rejects an arbitrary JSON object', () => {
      expect(() => deserializeProject({ foo: 'bar', nested: { a: 1 } })).toThrow(
        'not an Apartment Planner project file',
      );
    });

    it('rejects a package.json-like file', () => {
      const input = { name: 'my-app', version: '1.0.0', dependencies: { react: '^19.0.0' } };
      expect(() => deserializeProject(input)).toThrow('not an Apartment Planner project file');
    });

    it('rejects an object with a version but nothing else', () => {
      expect(() => deserializeProject({ version: 14 })).toThrow('not an Apartment Planner project file');
    });

    it('rejects an object whose floors is not an array', () => {
      expect(() => deserializeProject({ id: 'proj_1', name: 'x', floors: 'nope' })).toThrow(
        'not an Apartment Planner project file',
      );
    });

    it('rejects an object with floors but no id', () => {
      expect(() => deserializeProject({ name: 'x', floors: [] })).toThrow('not an Apartment Planner project file');
    });

    it('throws CorruptedDataError with the CORRUPTED_DATA code', () => {
      try {
        deserializeProject({ foo: 'bar' });
      } catch (e) {
        expect(e.name).toBe('CorruptedDataError');
        expect(e.code).toBe('CORRUPTED_DATA');
        return;
      }
      expect.fail('Should have thrown');
    });
  });

  describe('SketchStudio files get a distinct message', () => {
    it('rejects a serialized SketchStudio workspace by kind', () => {
      const input = {
        kind: 'sketchstudio-workspace',
        version: 1,
        document: { id: 'doc_1', name: 'Desk', units: 'mm', layers: [], entities: [], constraints: [] },
        viewport: { zoom: 1, panX: 0, panY: 0 },
        ui: {},
        savedAt: '2026-07-01T00:00:00.000Z',
      };
      expect(() => deserializeProject(input)).toThrow('SketchStudio sketch');
    });

    it('rejects a bare SketchStudio document by structure', () => {
      const input = {
        id: 'doc_1',
        name: 'Desk',
        units: 'mm',
        version: 1,
        layers: [{ id: 'default' }],
        entities: [],
        constraints: [],
      };
      expect(() => deserializeProject(input)).toThrow('SketchStudio sketch');
    });
  });

  describe('damaged project files stay strict', () => {
    it('reports an envelope with a null data payload as corrupted, not as a foreign file', () => {
      expect(() => deserializeProject({ version: 14, data: null })).toThrow('Invalid project data');
    });

    it('reports an envelope with a non-object data payload as corrupted', () => {
      expect(() => deserializeProject({ version: 14, data: 'oops' })).toThrow('Invalid project data');
    });

    it('still reports a structurally broken project inside an envelope', () => {
      expect(() => deserializeProject({ version: 14, data: { id: 'p1', name: 'x' } })).toThrow(
        'Invalid project structure',
      );
    });

    it('still reports a broken floor inside an envelope', () => {
      const input = { version: 14, data: { id: 'p1', name: 'x', floors: [{ id: 'f1' }] } };
      expect(() => deserializeProject(input)).toThrow('Invalid floor structure');
    });

    it('still reports unsupported schema versions on an envelope', () => {
      expect(() => deserializeProject({ version: 999, data: {} })).toThrow('Unsupported schema version');
    });
  });

  describe('isRawProject fingerprint', () => {
    it.each([
      ['bare project', makeProjectPayload(), true],
      ['empty floors array is still a project', { id: 'p1', floors: [] }, true],
      ['missing floors', { id: 'p1', name: 'x' }, false],
      ['empty id', { id: '', floors: [] }, false],
      ['non-string id', { id: 7, floors: [] }, false],
      ['array', [], false],
      ['null', null, false],
    ])('%s -> %s', (_label, value, expected) => {
      expect(isRawProject(value)).toBe(expected);
    });
  });
});
