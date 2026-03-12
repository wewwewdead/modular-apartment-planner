export function serializeProject(project) {
  return {
    version: 4,
    data: project,
    savedAt: new Date().toISOString(),
  };
}
