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

export const localStorageBackend = {
  async save(projectId, name, serialized) {
    const key = PROJECT_PREFIX + projectId;
    localStorage.setItem(key, JSON.stringify(serialized));

    const index = getIndex();
    const existing = index.findIndex(p => p.id === projectId);
    const entry = { id: projectId, name, savedAt: serialized.savedAt };

    if (existing >= 0) {
      index[existing] = entry;
    } else {
      index.push(entry);
    }
    saveIndex(index);
  },

  async load(projectId) {
    const key = PROJECT_PREFIX + projectId;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  },

  async list() {
    return getIndex();
  },

  async delete(projectId) {
    const key = PROJECT_PREFIX + projectId;
    localStorage.removeItem(key);
    const index = getIndex().filter(p => p.id !== projectId);
    saveIndex(index);
  },
};
