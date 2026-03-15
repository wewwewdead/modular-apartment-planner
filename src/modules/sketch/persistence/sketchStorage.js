import { sketchLocalStorageBackend } from './sketchLocalStorageBackend';
import { sketchSerialize } from './sketchSerialize';
import { sketchDeserialize } from './sketchDeserialize';

export async function saveSketchProject(project) {
  const serialized = sketchSerialize(project);
  await sketchLocalStorageBackend.save(project.id, project.name, serialized);
  return serialized.savedAt;
}

export async function loadSketchProject(id) {
  const json = await sketchLocalStorageBackend.load(id);
  if (!json) return null;
  return sketchDeserialize(json);
}

export async function listSketchProjects() {
  return sketchLocalStorageBackend.list();
}

export async function deleteSketchProject(id) {
  return sketchLocalStorageBackend.delete(id);
}
