import { CURRENT_SCHEMA_VERSION, CURRENT_PROJECT_FILE_VERSION } from '@/domain/projectVersion';

/**
 * Attach a wind-climate snapshot to the SERIALIZED copy of a project.
 *
 * Immutable, and deliberately not a reducer action: the snapshot is a fetch
 * result, and a fetch result on the undo stack is the bug plan amendment 14
 * removed. It reaches the file at explicit save time and never enters the live
 * project state as an edit; a project LOADED from a file carries it as inert
 * data that nothing mutates for the rest of the session.
 */
function withSiteWindClimateSnapshot(project, windClimateSnapshot) {
  const building = project?.building;
  if (!building || typeof building !== 'object' || Array.isArray(building)) return project;
  return {
    ...project,
    building: {
      ...building,
      site: { ...(building.site || {}), windClimateSnapshot },
    },
  };
}

/**
 * `windClimateSnapshot` is supplied by the EXPLICIT save path only (Ctrl+S /
 * Save). Autosave passes nothing and therefore writes whatever snapshot the
 * project was loaded with, unchanged — an automatic write must not silently
 * replace the climate the user's file records.
 */
export function serializeProject(project, { windClimateSnapshot = null } = {}) {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    version: CURRENT_PROJECT_FILE_VERSION,
    data: windClimateSnapshot ? withSiteWindClimateSnapshot(project, windClimateSnapshot) : project,
    savedAt: new Date().toISOString(),
  };
}
