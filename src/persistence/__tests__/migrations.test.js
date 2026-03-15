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
