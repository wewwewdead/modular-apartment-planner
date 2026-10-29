import { registerMigration } from './index';

// Walls gained a facade description: `outboardOffset` (how far the built body
// sits off the drawn axis), `stackId` (which facade it belongs to across
// storeys), and the pair `framingMode`/`bypassDrop` that says how it meets the
// floor structure. `structuralRole` joins them: it has been read by the
// coordination checks all along, but nothing ever wrote it, so no saved wall
// carries it.
//
// The backfill is unconditional and lossless because there is only one answer
// for anything saved before the fields existed: every legacy wall was drawn on
// the line it was built on, belonged to no stack, was platform-framed, and was
// never declared to be holding anything up. A stored value is kept — a project
// written by a newer build and read back by this path must not be flattened.
//
// `framingMode` and `bypassDrop` are backfilled here even though nothing reads
// them yet, so bypass framing needs no second schema bump.
//
// `version` is deliberately left alone: this step changes only the persistence
// schema, and the domain format version (CURRENT_PROJECT_FORMAT_VERSION) is
// unchanged at 23.

const PLATFORM = 'platform';
const BYPASS = 'bypass';
const NONSTRUCTURAL = 'nonstructural';

function migrateWall(wall) {
  const offset = Number(wall?.outboardOffset);
  return {
    ...wall,
    outboardOffset: Number.isFinite(offset) ? offset : 0,
    framingMode: wall?.framingMode === BYPASS ? BYPASS : PLATFORM,
    bypassDrop: wall?.bypassDrop ?? null,
    stackId: wall?.stackId ?? null,
    structuralRole: wall?.structuralRole ?? NONSTRUCTURAL,
  };
}

export function migrateV28toV29(project) {
  if (!Array.isArray(project.floors) || !project.floors.length) return project;

  return {
    ...project,
    floors: project.floors.map((floor) => ({
      ...floor,
      walls: (floor?.walls || []).map(migrateWall),
    })),
  };
}

registerMigration(28, 29, migrateV28toV29);
