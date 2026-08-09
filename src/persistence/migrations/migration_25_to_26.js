import { registerMigration } from './index';

// Electrical devices (outlets/switches) are a per-floor collection, so a pre-26
// save just needs the empty array on every floor. `version` is deliberately left
// alone: this step changes only the persistence schema, and the domain format
// version (CURRENT_PROJECT_FORMAT_VERSION) is unchanged at 23.
export function migrateV25toV26(project) {
  return {
    ...project,
    floors: (project.floors || []).map((floor) =>
      Array.isArray(floor.electricalDevices) ? floor : { ...floor, electricalDevices: [] },
    ),
  };
}

registerMigration(25, 26, migrateV25toV26);
