import { registerMigration } from './index';

// Ceilings gained a `boundarySource`: 'auto' hands the plan extent back to the
// support beams on every read, 'drawn' keeps the outline someone traced with the
// ceiling tool. Nothing saved before the tool existed was ever traced, so every
// stored ceiling is 'auto' — and a junk value is treated the same way
// createCeiling treats it, since only an exact 'drawn' claims a hand-drawn area.
//
// `version` is deliberately left alone: this step changes only the persistence
// schema, and the domain format version (CURRENT_PROJECT_FORMAT_VERSION) is
// unchanged at 23.

const DRAWN = 'drawn';
const AUTO = 'auto';

export function migrateV27toV28(project) {
  if (!Array.isArray(project.ceilings) || !project.ceilings.length) return project;

  return {
    ...project,
    ceilings: project.ceilings.map((ceiling) => ({
      ...ceiling,
      boundarySource: ceiling?.boundarySource === DRAWN ? DRAWN : AUTO,
    })),
  };
}

registerMigration(27, 28, migrateV27toV28);
