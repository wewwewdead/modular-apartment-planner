const INDEX_KEY = 'apartment-planner-projects';
const PROJECT_PREFIX = 'apartment-planner-project-';

function getIndex() {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveIndex(index) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

// The index as stored, or null when it cannot be trusted (unparseable or not
// a list). Pruning does nothing then: with no index, every draft looks orphaned.
function readIndexStrict() {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (raw === null) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function storedProjectIds() {
  const ids = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(PROJECT_PREFIX)) ids.push(key.slice(PROJECT_PREFIX.length));
  }
  return ids;
}

// A stored draft parsed, or undefined when its text is not JSON at all.
function readStored(id) {
  try {
    return JSON.parse(localStorage.getItem(PROJECT_PREFIX + id));
  } catch {
    return undefined;
  }
}

export const localStorageBackend = {
  async save(projectId, name, serialized) {
    const key = PROJECT_PREFIX + projectId;
    const index = getIndex();
    const existing = index.findIndex((p) => p.id === projectId);
    // A failed project write (a full quota) leaves the stored value as it was.
    localStorage.setItem(key, JSON.stringify(serialized));

    const entry = { id: projectId, name, savedAt: serialized.savedAt };

    if (existing >= 0) {
      index[existing] = entry;
    } else {
      index.push(entry);
    }
    try {
      saveIndex(index);
    } catch (err) {
      // A new draft the index cannot list is unreachable from Open Project and
      // still holds its share of the quota, so it goes. One already listed
      // stays listed and keeps its new content.
      if (existing < 0) localStorage.removeItem(key);
      throw err;
    }
  },

  async load(projectId) {
    const key = PROJECT_PREFIX + projectId;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  },

  async list() {
    return getIndex();
  },

  /**
   * Removes what nobody can reach or nothing was made in (see storage.pruneDrafts):
   * index entries whose draft is gone; drafts the index does not list, unless
   * they hold work (`isDisposable` false for a readable draft); and listed
   * drafts `isDisposable` says hold nothing. `keepId` (the open project) and
   * any draft `isKnownContent(entry)` vouches for are never read or removed.
   * Returns the ids removed.
   */
  async prune({ keepId = null, isDisposable, isKnownContent = () => false } = {}) {
    const index = readIndexStrict();
    if (!index) return [];
    const stored = new Set(storedProjectIds());
    const listed = new Map(index.map((entry) => [entry.id, entry]));
    const removed = [];

    for (const id of stored) {
      if (id === keepId) continue;
      const entry = listed.get(id);
      if (entry && isKnownContent(entry)) continue;
      const draft = readStored(id);
      // A listed draft that cannot be read stays listed: Open Project says so
      // and the user decides. An unlisted one is unreachable either way.
      const disposable = entry
        ? draft !== undefined && isDisposable(draft)
        : draft === undefined || isDisposable(draft);
      if (!disposable) continue;
      localStorage.removeItem(PROJECT_PREFIX + id);
      removed.push(id);
    }

    const nextIndex = index.filter(
      (entry) => entry.id === keepId || (stored.has(entry.id) && !removed.includes(entry.id)),
    );
    if (nextIndex.length !== index.length) saveIndex(nextIndex);
    return removed;
  },

  async delete(projectId) {
    const key = PROJECT_PREFIX + projectId;
    localStorage.removeItem(key);
    const index = getIndex().filter((p) => p.id !== projectId);
    saveIndex(index);
  },
};
