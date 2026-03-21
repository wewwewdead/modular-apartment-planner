import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  loadSketchObjectLibrary,
  loadSketchRecovery,
  saveSketchRecovery,
  saveSketchObjectLibrary,
} from './sketchAssetStorage';

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, value);
    },
    removeItem(key) {
      store.delete(key);
    },
  };
}

describe('sketchAssetStorage', () => {
  let originalLocalStorage;

  beforeEach(() => {
    originalLocalStorage = globalThis.localStorage;
    globalThis.localStorage = createMemoryStorage();
  });

  afterEach(() => {
    globalThis.localStorage = originalLocalStorage;
  });

  it('persists sketch object library items', () => {
    saveSketchObjectLibrary([{ id: 'object-1', name: 'Cabinet' }]);
    expect(loadSketchObjectLibrary()).toEqual([{ id: 'object-1', name: 'Cabinet' }]);
  });

  it('persists sketch recovery snapshots', () => {
    saveSketchRecovery({
      kind: 'sketchstudio-workspace',
      version: 1,
      document: {
        id: 'doc-1',
        version: 1,
        name: 'Kitchen Sketch',
        units: 'mm',
        layers: [],
        entities: [],
        constraints: [],
      },
      objectDraft: null,
      viewport: { zoom: 1, panX: 0, panY: 0 },
      ui: { activeLayerId: 'default', snapEnabled: true, orthoEnabled: false },
    });

    expect(loadSketchRecovery()?.document?.name).toBe('Kitchen Sketch');
  });

  it('falls back to the legacy last sketch document when no recovery snapshot exists', () => {
    globalThis.localStorage.setItem('apartment-planner-sketch-documents', JSON.stringify([
      {
        id: 'doc-legacy',
        version: 1,
        name: 'Legacy Sketch',
        units: 'mm',
        layers: [],
        entities: [],
        constraints: [],
      },
    ]));
    globalThis.localStorage.setItem('apartment-planner-sketch-last-document-id', JSON.stringify('doc-legacy'));

    expect(loadSketchRecovery()?.name).toBe('Legacy Sketch');
  });
});
