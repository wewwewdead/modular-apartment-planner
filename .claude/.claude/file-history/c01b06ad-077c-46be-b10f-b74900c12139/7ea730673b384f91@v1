import { serializeProject } from './serialize';
import { deserializeProject } from './deserialize';
import { localStorageBackend } from './localStorageBackend';

let backend = localStorageBackend;

export function setBackend(b) {
  backend = b;
}

export async function saveProject(project) {
  const serialized = serializeProject(project);
  await backend.save(project.id, project.name, serialized);
  return serialized.savedAt;
}

export async function loadProject(projectId) {
  const json = await backend.load(projectId);
  if (!json) throw new Error('Project not found');
  return deserializeProject(json);
}

export async function listProjects() {
  return backend.list();
}

export async function deleteProject(projectId) {
  await backend.delete(projectId);
}
