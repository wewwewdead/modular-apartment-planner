import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import MaterialEditorPanel from '../components/MaterialEditorPanel';
import MaterialPicker from '../components/MaterialPicker';
import { reloadCustomMaterials, replaceCustomMaterials } from '../data/customMaterials';

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

const CUSTOM_SHEET = {
  id: 'custom-sheet',
  name: 'Quoted 18mm Ply',
  category: 'plywood',
  thickness: 18,
  defaultWidth: 2500,
  defaultHeight: 1250,
  pricePerM2: 100,
  costBasis: 'perM2',
  density: 690,
  color: '#AABBCC',
};

describe('custom material UI', () => {
  let originalLocalStorage;

  beforeEach(() => {
    originalLocalStorage = globalThis.localStorage;
    globalThis.localStorage = createMemoryStorage();
    reloadCustomMaterials();
  });

  afterEach(() => {
    globalThis.localStorage = originalLocalStorage;
  });

  it('renders the editor empty state with a duplicate-from-catalog picker', () => {
    const markup = renderToStaticMarkup(<MaterialEditorPanel />);

    expect(markup).toContain('No custom materials yet.');
    expect(markup).toContain('Add Custom Material');
    expect(markup).toContain('Duplicate From Catalog');
    expect(markup).toContain('18mm Birch Plywood');
  });

  it('lists custom materials with a custom badge and their unit price', () => {
    replaceCustomMaterials([CUSTOM_SHEET]);
    const markup = renderToStaticMarkup(<MaterialEditorPanel />);

    expect(markup).toContain('Quoted 18mm Ply');
    expect(markup).toContain('Custom');
    expect(markup).toContain('$100/m²');
    expect(markup).toContain('Edit');
    expect(markup).toContain('Delete');
  });

  it('offers custom materials in the picker and keeps catalog materials read-only', () => {
    replaceCustomMaterials([CUSTOM_SHEET]);
    const markup = renderToStaticMarkup(
      <MaterialPicker
        selectedMaterialId="birch-plywood-18"
        thickness={18}
        onMaterialChange={vi.fn()}
        onThicknessChange={vi.fn()}
      />,
    );

    expect(markup).toContain('My Materials');
    expect(markup).toContain('Quoted 18mm Ply');
    expect(markup).toContain('Duplicate As Custom');
  });

  it('keeps showing a deleted material id in the picker instead of silently clearing it', () => {
    const markup = renderToStaticMarkup(
      <MaterialPicker
        selectedMaterialId="custom-deleted"
        thickness={18}
        onMaterialChange={vi.fn()}
        onThicknessChange={vi.fn()}
      />,
    );

    expect(markup).toContain('custom-deleted (unavailable)');
    expect(markup).toContain('costed at $0');
    expect(markup).not.toContain('Duplicate As Custom');
  });
});
