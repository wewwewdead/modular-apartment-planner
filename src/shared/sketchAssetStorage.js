export const SKETCH_STORAGE_CHANGED_EVENT = 'sketch-storage-changed';
const SKETCH_RECOVERY_KEY = 'apartment-planner-sketch-recovery';
const LEGACY_SKETCH_DOCUMENT_LIBRARY_KEY = 'apartment-planner-sketch-documents';
const LEGACY_SKETCH_LAST_DOCUMENT_ID_KEY = 'apartment-planner-sketch-last-document-id';

function getStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readJson(key, fallback = []) {
  const storage = getStorage();

  if (!storage) {
    return fallback;
  }

  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  const storage = getStorage();

  if (!storage) {
    return;
  }

  try {
    storage.setItem(key, JSON.stringify(value));
    if (typeof globalThis.dispatchEvent === 'function' && typeof globalThis.CustomEvent === 'function') {
      globalThis.dispatchEvent(new CustomEvent(SKETCH_STORAGE_CHANGED_EVENT, {
        detail: { key },
      }));
    }
  } catch (err) {
    if (err?.name === 'QuotaExceededError') {
      throw new Error('Storage quota exceeded. Try removing unused assets to free space.');
    }
    throw err;
  }
}

function removeValue(key) {
  const storage = getStorage();

  if (!storage) {
    return;
  }

  storage.removeItem(key);
}

function loadLegacySketchDocumentLibrary() {
  return readJson(LEGACY_SKETCH_DOCUMENT_LIBRARY_KEY, []);
}

function loadLegacyLastSketchDocumentId() {
  const value = readJson(LEGACY_SKETCH_LAST_DOCUMENT_ID_KEY, null);
  return typeof value === 'string' ? value : null;
}

function loadLegacyLastSketchDocument() {
  const lastDocumentId = loadLegacyLastSketchDocumentId();
  if (!lastDocumentId) {
    return null;
  }

  return loadLegacySketchDocumentLibrary().find((item) => item.id === lastDocumentId) || null;
}

export function saveSketchRecovery(workspaceSnapshot) {
  try {
    writeJson(SKETCH_RECOVERY_KEY, {
      ...workspaceSnapshot,
      recoveredAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[SketchRecoveryStorage]', err.message);
    throw err;
  }

  return workspaceSnapshot;
}

export function loadSketchRecovery() {
  const recovery = readJson(SKETCH_RECOVERY_KEY, null);
  if (recovery) {
    return recovery;
  }

  return loadLegacyLastSketchDocument();
}

export function clearSketchRecovery() {
  removeValue(SKETCH_RECOVERY_KEY);
}
