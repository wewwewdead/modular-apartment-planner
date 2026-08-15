import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import builtInMaterials from '../data/materials';
import {
  CUSTOM_MATERIALS_STORAGE_KEY,
  CUSTOM_MATERIAL_ID_PREFIX,
  SUPPORTED_COST_BASES,
  addCustomMaterial,
  deleteCustomMaterial,
  duplicateMaterialAsCustom,
  getCustomMaterialById,
  getCustomMaterials,
  getCustomMaterialsVersion,
  isCustomMaterialId,
  reloadCustomMaterials,
  replaceCustomMaterials,
  subscribeCustomMaterials,
  updateCustomMaterial,
  validateCustomMaterialDraft,
} from '../data/customMaterials';

function createMemoryStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
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

function readStored() {
  return JSON.parse(globalThis.localStorage.getItem(CUSTOM_MATERIALS_STORAGE_KEY));
}

const validDraft = {
  name: 'Local 18mm Birch',
  category: 'plywood',
  thickness: 18,
  defaultWidth: 2500,
  defaultHeight: 1250,
  pricePerM2: 51.5,
  costBasis: 'perM2',
  density: 690,
  color: '#AABBCC',
};

describe('customMaterials registry', () => {
  let originalLocalStorage;

  beforeEach(() => {
    originalLocalStorage = globalThis.localStorage;
    globalThis.localStorage = createMemoryStorage();
    reloadCustomMaterials();
  });

  afterEach(() => {
    globalThis.localStorage = originalLocalStorage;
  });

  describe('load / save', () => {
    it('starts empty when nothing is stored', () => {
      expect(getCustomMaterials()).toEqual([]);
    });

    it('persists added materials to localStorage and reloads them', () => {
      const outcome = addCustomMaterial(validDraft);

      expect(outcome.valid).toBe(true);
      expect(readStored()).toHaveLength(1);
      expect(readStored()[0].name).toBe('Local 18mm Birch');

      // A fresh read of storage yields the same material.
      reloadCustomMaterials();
      expect(getCustomMaterials()).toHaveLength(1);
      expect(getCustomMaterialById(outcome.material.id)?.pricePerM2).toBe(51.5);
    });

    it('flags custom materials with isCustom and trims the name', () => {
      const { material } = addCustomMaterial({ ...validDraft, name: '  Shop Ply  ' });

      expect(material.name).toBe('Shop Ply');
      expect(material.isCustom).toBe(true);
    });

    it('updates an existing material in place without changing its id', () => {
      const { material } = addCustomMaterial(validDraft);
      const outcome = updateCustomMaterial(material.id, { ...validDraft, pricePerM2: 63 });

      expect(outcome.valid).toBe(true);
      expect(outcome.material.id).toBe(material.id);
      expect(getCustomMaterials()).toHaveLength(1);
      expect(getCustomMaterialById(material.id).pricePerM2).toBe(63);
      expect(readStored()[0].pricePerM2).toBe(63);
    });

    it('reports an error when updating an unknown id', () => {
      const outcome = updateCustomMaterial('custom-missing', validDraft);

      expect(outcome.valid).toBe(false);
      expect(outcome.errors.id).toBeTruthy();
    });

    it('deletes materials and persists the removal', () => {
      const { material } = addCustomMaterial(validDraft);

      expect(deleteCustomMaterial(material.id)).toBe(true);
      expect(getCustomMaterials()).toEqual([]);
      expect(readStored()).toEqual([]);
      expect(getCustomMaterialById(material.id)).toBeNull();
      expect(deleteCustomMaterial(material.id)).toBe(false);
    });

    it('notifies subscribers and bumps the version on every change', () => {
      const listener = vi.fn();
      const unsubscribe = subscribeCustomMaterials(listener);
      const before = getCustomMaterialsVersion();

      const { material } = addCustomMaterial(validDraft);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(getCustomMaterialsVersion()).toBe(before + 1);

      deleteCustomMaterial(material.id);
      expect(listener).toHaveBeenCalledTimes(2);
      expect(getCustomMaterialsVersion()).toBe(before + 2);

      unsubscribe();
      addCustomMaterial(validDraft);
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('keeps a stable list reference between mutations', () => {
      addCustomMaterial(validDraft);
      expect(getCustomMaterials()).toBe(getCustomMaterials());
    });
  });

  describe('validation', () => {
    it('rejects an empty name', () => {
      const outcome = validateCustomMaterialDraft({ ...validDraft, name: '   ' });

      expect(outcome.valid).toBe(false);
      expect(outcome.errors.name).toBeTruthy();
      expect(outcome.material).toBeNull();
    });

    it('rejects non-positive or non-numeric thickness', () => {
      for (const thickness of [0, -4, '', 'thick', null]) {
        expect(validateCustomMaterialDraft({ ...validDraft, thickness }).errors.thickness).toBeTruthy();
      }
    });

    it('rejects negative and non-numeric prices but allows zero', () => {
      expect(validateCustomMaterialDraft({ ...validDraft, pricePerM2: -1 }).errors.pricePerM2).toBeTruthy();
      expect(validateCustomMaterialDraft({ ...validDraft, pricePerM2: 'free' }).errors.pricePerM2).toBeTruthy();
      expect(validateCustomMaterialDraft({ ...validDraft, pricePerM2: '' }).errors.pricePerM2).toBeTruthy();
      expect(validateCustomMaterialDraft({ ...validDraft, pricePerM2: 0 }).valid).toBe(true);
    });

    it('rejects non-positive stock dimensions', () => {
      expect(validateCustomMaterialDraft({ ...validDraft, defaultWidth: 0 }).errors.defaultWidth).toBeTruthy();
      expect(validateCustomMaterialDraft({ ...validDraft, defaultHeight: -2 }).errors.defaultHeight).toBeTruthy();
    });

    it('only accepts cost bases supported by materialCostUtils', () => {
      expect(SUPPORTED_COST_BASES).toEqual(['perM2', 'perLinearMeter', 'perPiece']);

      for (const costBasis of SUPPORTED_COST_BASES) {
        expect(validateCustomMaterialDraft({ ...validDraft, costBasis }).valid).toBe(true);
      }

      expect(validateCustomMaterialDraft({ ...validDraft, costBasis: 'perFoot' }).errors.costBasis).toBeTruthy();
      expect(validateCustomMaterialDraft({ ...validDraft, costBasis: undefined }).errors.costBasis).toBeTruthy();
    });

    it('accepts numeric strings from form inputs', () => {
      const outcome = validateCustomMaterialDraft({
        ...validDraft,
        thickness: '12.5',
        pricePerM2: ' 33.25 ',
        defaultWidth: '3000',
        defaultHeight: '1500',
      });

      expect(outcome.valid).toBe(true);
      expect(outcome.material.thickness).toBe(12.5);
      expect(outcome.material.pricePerM2).toBe(33.25);
      expect(outcome.material.defaultWidth).toBe(3000);
    });

    it('defaults category, density and invalid colors instead of failing', () => {
      const outcome = validateCustomMaterialDraft({
        ...validDraft,
        category: '',
        density: 'heavy',
        color: 'not-a-color',
      });

      expect(outcome.valid).toBe(true);
      expect(outcome.material.category).toBe('custom');
      expect(outcome.material.density).toBe(600);
      expect(outcome.material.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });

    it('does not persist an invalid draft', () => {
      const outcome = addCustomMaterial({ ...validDraft, name: '' });

      expect(outcome.valid).toBe(false);
      expect(getCustomMaterials()).toEqual([]);
    });
  });

  describe('id collision avoidance', () => {
    it('generates prefixed, unique ids', () => {
      const first = addCustomMaterial(validDraft).material;
      const second = addCustomMaterial({ ...validDraft, name: 'Second' }).material;

      expect(first.id.startsWith(CUSTOM_MATERIAL_ID_PREFIX)).toBe(true);
      expect(second.id.startsWith(CUSTOM_MATERIAL_ID_PREFIX)).toBe(true);
      expect(first.id).not.toBe(second.id);
    });

    it('never produces an id that a built-in catalog material already uses', () => {
      const builtInIds = new Set(builtInMaterials.map((material) => material.id));

      for (const id of builtInIds) {
        expect(id.startsWith(CUSTOM_MATERIAL_ID_PREFIX)).toBe(false);
        expect(isCustomMaterialId(id)).toBe(false);
      }

      for (let index = 0; index < 25; index += 1) {
        const { material } = addCustomMaterial({ ...validDraft, name: `Material ${index}` });
        expect(builtInIds.has(material.id)).toBe(false);
      }
    });

    it('refuses an explicit id that reuses a catalog id or drops the prefix', () => {
      expect(validateCustomMaterialDraft(validDraft, { id: 'birch-plywood-18' }).errors.id).toBeTruthy();
      expect(validateCustomMaterialDraft(validDraft, { id: 'my-material' }).errors.id).toBeTruthy();
      expect(validateCustomMaterialDraft(validDraft, { id: 'custom-abc' }).valid).toBe(true);
    });
  });

  describe('corrupted or missing storage', () => {
    it('falls back to an empty list for unparsable JSON', () => {
      globalThis.localStorage = createMemoryStorage({ [CUSTOM_MATERIALS_STORAGE_KEY]: '{not json' });
      expect(reloadCustomMaterials()).toEqual([]);
    });

    it('falls back to an empty list for a non-array payload', () => {
      globalThis.localStorage = createMemoryStorage({
        [CUSTOM_MATERIALS_STORAGE_KEY]: JSON.stringify({ id: 'custom-1' }),
      });
      expect(reloadCustomMaterials()).toEqual([]);
    });

    it('drops individual invalid records but keeps the valid ones', () => {
      globalThis.localStorage = createMemoryStorage({
        [CUSTOM_MATERIALS_STORAGE_KEY]: JSON.stringify([
          null,
          'nope',
          { id: 'custom-ok', ...validDraft },
          { id: 'custom-bad-price', ...validDraft, pricePerM2: -5 },
          { id: 'custom-bad-basis', ...validDraft, costBasis: 'perFoot' },
          { id: 'birch-plywood-18', ...validDraft, name: 'Catalog Hijack' },
        ]),
      });

      const loaded = reloadCustomMaterials();

      expect(loaded.map((material) => material.id)).toEqual(['custom-ok']);
      expect(getCustomMaterialById('birch-plywood-18')).toBeNull();
    });

    it('repairs records that lost their id and de-duplicates repeated ids', () => {
      globalThis.localStorage = createMemoryStorage({
        [CUSTOM_MATERIALS_STORAGE_KEY]: JSON.stringify([
          { ...validDraft, name: 'No Id' },
          { id: 'custom-dupe', ...validDraft, name: 'First' },
          { id: 'custom-dupe', ...validDraft, name: 'Second' },
        ]),
      });

      const loaded = reloadCustomMaterials();

      expect(loaded).toHaveLength(2);
      expect(loaded[0].id.startsWith(CUSTOM_MATERIAL_ID_PREFIX)).toBe(true);
      expect(loaded.filter((material) => material.id === 'custom-dupe')).toHaveLength(1);
      expect(getCustomMaterialById('custom-dupe').name).toBe('First');
    });

    it('works without any localStorage at all', () => {
      globalThis.localStorage = undefined;

      expect(() => reloadCustomMaterials()).not.toThrow();
      expect(getCustomMaterials()).toEqual([]);
      expect(addCustomMaterial(validDraft).valid).toBe(true);
      expect(getCustomMaterials()).toHaveLength(1);
    });

    it('survives a storage that throws on write', () => {
      globalThis.localStorage = {
        getItem: () => null,
        setItem: () => {
          throw new Error('QuotaExceededError');
        },
        removeItem: () => {},
      };
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      reloadCustomMaterials();

      expect(() => addCustomMaterial(validDraft)).not.toThrow();
      expect(getCustomMaterials()).toHaveLength(1);
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  describe('duplicate from catalog', () => {
    it('copies a built-in material into an editable custom entry', () => {
      const source = builtInMaterials.find((material) => material.id === 'birch-plywood-18');
      const { valid, material } = duplicateMaterialAsCustom(source);

      expect(valid).toBe(true);
      expect(material.id).not.toBe(source.id);
      expect(material.isCustom).toBe(true);
      expect(material.name).toContain(source.name);
      expect(material.category).toBe(source.category);
      expect(material.thickness).toBe(source.thickness);
      expect(material.defaultWidth).toBe(source.defaultWidth);
      expect(material.costBasis).toBe(source.costBasis);
      expect(material.pricePerM2).toBe(source.pricePerM2);
    });

    it('applies overrides such as the user local price', () => {
      const source = builtInMaterials.find((material) => material.id === 'steel-sq-25');
      const { material } = duplicateMaterialAsCustom(source, { name: 'Steel SQ 25 (my yard)', pricePerM2: 4.15 });

      expect(material.name).toBe('Steel SQ 25 (my yard)');
      expect(material.pricePerM2).toBe(4.15);
      expect(material.costBasis).toBe('perLinearMeter');
    });
  });

  describe('replaceCustomMaterials', () => {
    it('replaces the whole registry and persists it', () => {
      replaceCustomMaterials([{ id: 'custom-seed', ...validDraft, name: 'Seeded' }]);

      expect(getCustomMaterials()).toHaveLength(1);
      expect(getCustomMaterialById('custom-seed').name).toBe('Seeded');
      expect(readStored()[0].id).toBe('custom-seed');

      replaceCustomMaterials([]);
      expect(getCustomMaterials()).toEqual([]);
    });
  });

  describe('grain flag (additive schema)', () => {
    it('defaults to false for a draft that never mentions grain', () => {
      const outcome = validateCustomMaterialDraft(validDraft);
      expect(outcome.valid).toBe(true);
      expect(outcome.material.hasGrain).toBe(false);
    });

    it('records an explicit grain flag, including the string form a form field sends', () => {
      expect(validateCustomMaterialDraft({ ...validDraft, hasGrain: true }).material.hasGrain).toBe(true);
      expect(validateCustomMaterialDraft({ ...validDraft, hasGrain: 'true' }).material.hasGrain).toBe(true);
      expect(validateCustomMaterialDraft({ ...validDraft, hasGrain: false }).material.hasGrain).toBe(false);
    });

    it('normalizes an old stored record - written before grain existed - to grain free', () => {
      globalThis.localStorage.setItem(
        CUSTOM_MATERIALS_STORAGE_KEY,
        JSON.stringify([{ ...validDraft, id: 'custom-legacy', isCustom: true }]),
      );

      const loaded = reloadCustomMaterials();
      expect(loaded).toHaveLength(1);
      expect(loaded[0].hasGrain).toBe(false);
    });

    it('carries the grain flag through a duplicate-as-custom', () => {
      const grained = builtInMaterials.find((material) => material.hasGrain === true);
      const plain = builtInMaterials.find((material) => material.category === 'mdf');

      expect(duplicateMaterialAsCustom(grained).material.hasGrain).toBe(true);
      expect(duplicateMaterialAsCustom(plain).material.hasGrain).toBe(false);
    });
  });
});
