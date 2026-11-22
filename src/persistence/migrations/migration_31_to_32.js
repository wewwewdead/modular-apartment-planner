import { registerMigration } from './index';

// A project holds a list of roofs, one per truss system at most
// (docs/multi-roof.md §2): `project.roofSystem`, the single nullable slot,
// becomes `project.roofSystems`. Before this a second roof could only replace
// the first, so a file saved at schema 31 has at most one roof and the step is
// lossless: that roof, untouched and with its id, becomes the only entry; no
// roof becomes an empty list. The old key is removed, not kept as an alias —
// nothing reads it after this step.
//
// A list already present (a file written by a newer build and read back by this
// path) is kept; the duplicate-id and one-roof-per-truss repairs on every load
// are validate.js's, not this step's.
//
// `version` is deliberately left alone: this step changes only the persistence
// schema; the domain format version (CURRENT_PROJECT_FORMAT_VERSION) is
// unchanged at 23.

export function migrateV31toV32(project) {
  if (!project || typeof project !== 'object') return project;

  const { roofSystem, ...rest } = project;
  const legacyRoof = roofSystem && typeof roofSystem === 'object' ? roofSystem : null;
  const storedRoofs = Array.isArray(project.roofSystems) ? project.roofSystems : [];
  const roofSystems =
    legacyRoof && !storedRoofs.some((entry) => entry?.id && entry.id === legacyRoof.id)
      ? [legacyRoof, ...storedRoofs]
      : storedRoofs;

  return { ...rest, roofSystems };
}

registerMigration(31, 32, migrateV31toV32);
