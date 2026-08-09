import { CURRENT_SCHEMA_VERSION, CURRENT_PROJECT_FILE_VERSION } from '@/domain/projectVersion';

export function serializeProject(project) {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    version: CURRENT_PROJECT_FILE_VERSION,
    data: project,
    savedAt: new Date().toISOString(),
  };
}
