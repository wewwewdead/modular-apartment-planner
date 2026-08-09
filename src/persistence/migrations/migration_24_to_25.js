import { registerMigration } from './index';

// Ceilings are a project-level array (each entry carries its own floorId), so a
// pre-25 save just needs the empty collection. `version` is deliberately left
// alone: this step changes only the persistence schema, and the domain format
// version (CURRENT_PROJECT_FORMAT_VERSION) is unchanged at 23.
export function migrateV24toV25(project) {
  return {
    ...project,
    ceilings: Array.isArray(project.ceilings) ? project.ceilings : [],
  };
}

registerMigration(24, 25, migrateV24toV25);
