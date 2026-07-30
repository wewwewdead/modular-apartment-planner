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
