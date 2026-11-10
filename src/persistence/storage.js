import { serializeProject } from './serialize';
import { deserializeProject } from './deserialize';
import { localStorageBackend } from './localStorageBackend';
import { validateBackend } from './backendInterface';
import { isStarterDraft } from './draftPruning';

let backend = localStorageBackend;

export function setBackend(b) {
  backend = validateBackend(b);
}

export async function saveProject(project, options = {}) {
  const serialized = serializeProject(project, options);
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

// Drafts already found to hold work, by id → the savedAt they were checked at:
// a later prune skips them until they are saved again.
const contentDrafts = new Map();

/**
 * Clears out browser drafts that hold nothing: entries and stored drafts that
 * no longer match up, and drafts that are still the untouched starter project.
 * Never the open project (`keepId`), and never a draft with work in it. Runs on
 * app start and after a successful save; a backend that cannot enumerate its
 * drafts is left alone. Returns the ids removed.
 */
export async function pruneDrafts({ keepId = null } = {}) {
  if (typeof backend.prune !== 'function') return [];
  const removed = await backend.prune({
    keepId,
    isKnownContent: (entry) => contentDrafts.has(entry.id) && contentDrafts.get(entry.id) === entry.savedAt,
    isDisposable: (draft) => {
      const starter = isStarterDraft(draft);
      if (!starter && draft?.savedAt !== undefined) {
        // Remembered against the index's savedAt, which save() writes from the draft's.
        contentDrafts.set(draft?.data?.id, draft.savedAt);
      }
      return starter;
    },
  });
  for (const id of removed) contentDrafts.delete(id);
  return removed;
}
