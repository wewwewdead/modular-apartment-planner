import { CURRENT_PROJECT_FILE_VERSION } from '@/domain/projectVersion';

export function serializeProject(project) {
  return {
    version: CURRENT_PROJECT_FILE_VERSION,
    data: project,
    savedAt: new Date().toISOString(),
  };
}
