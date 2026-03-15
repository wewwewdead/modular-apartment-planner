export function sketchSerialize(project) {
  return {
    schemaType: 'sketch',
    schemaVersion: 2,
    data: project,
    savedAt: new Date().toISOString(),
  };
}
