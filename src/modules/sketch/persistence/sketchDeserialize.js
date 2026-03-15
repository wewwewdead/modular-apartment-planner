import { normalizeSketchObjects } from '../domain/objectModels';

export function sketchDeserialize(json) {
  if (!json || json.schemaType !== 'sketch') {
    throw new Error('Invalid sketch project data: missing or wrong schemaType');
  }

  const project = json.data;
  if (!project || !project.id || !project.name) {
    throw new Error('Invalid sketch project data: missing required fields');
  }

  // Ensure arrays exist
  project.parts = project.parts || [];
  project.assemblies = project.assemblies || [];
  project.constraints = project.constraints || [];
  project.annotations = project.annotations || [];
  project.sheets = project.sheets || [];
  project.objects = project.objects || [];

  return {
    project: normalizeSketchObjects(project),
    savedAt: json.savedAt,
  };
}
