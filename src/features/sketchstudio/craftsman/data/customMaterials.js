/**
 * Custom material registry for Craftsman Studio.
 *
 * Lets users add their own materials with real local prices so BOM costs reflect
 * actual quotes instead of catalog estimates. `data/materials.js` merges this
 * registry into the catalog, so every existing consumer of `getMaterialById()`
 * and `buildMaterialPricingDict()` picks custom materials up automatically.
 *
 * Persistence
 * - Key: `craftsmanCustomMaterials` (matches the camelCase, un-prefixed
 *   `craftsmanMode` key used for the craftsman-mode preference).
 * - Access goes through `globalThis.localStorage` guarded by try/catch (same
 *   pattern as `src/shared/sketchAssetStorage.js`) so the module also works in
 *   the Vitest `node` environment, in SSR renders and in private-mode browsers.
 * - Corrupt storage degrades gracefully: unparsable JSON or a non-array payload
 *   falls back to an empty list, and individual invalid records are dropped
 *   instead of poisoning the whole catalog.
 *
 * Ids
 * - Always prefixed with `custom-`, and validated against the set of catalog ids
 *   reserved via `reserveMaterialIds()`, so a custom material can never shadow a
 *   built-in one (even if localStorage was hand-edited).
 *
 * Shape
 * - Identical to a catalog material plus `isCustom: true`. `pricePerM2` keeps the
 *   catalog field name even for `perLinearMeter` / `perPiece` bases: it is the
 *   unit price for the selected cost basis, which is exactly how
 *   `buildMaterialPricingDict()` already feeds `materialCostUtils`.
 * - The schema is additive: `hasGrain` was added after the first release and
 *   normalizes to `false` for every record already in localStorage, so old saved
 *   customs keep full nesting rotation freedom exactly as before.
 *
 * Deletion fallback
 * - Deleting a custom material that entities still reference is allowed. Lookups
 *   then return `null`, which is the same path already taken by an unknown
 *   `materialId`: `entityBomAdapter` falls back to the raw id as the display
 *   name, `perM2` cost basis and zero stock metadata, and `computeRowCost()`
 *   resolves a missing pricing entry to a 0 unit cost. Nothing throws; the part
 *   simply stops contributing cost until it is reassigned.
 */

export const CUSTOM_MATERIALS_STORAGE_KEY = 'craftsmanCustomMaterials';
export const CUSTOM_MATERIAL_ID_PREFIX = 'custom-';
export const CUSTOM_MATERIAL_CATEGORY = 'custom';

export const COST_BASIS_OPTIONS = [
  { id: 'perM2', label: 'Per square meter', unitLabel: 'm²' },
  { id: 'perLinearMeter', label: 'Per linear meter', unitLabel: 'lm' },
  { id: 'perPiece', label: 'Per piece', unitLabel: 'pc' },
];

export const SUPPORTED_COST_BASES = COST_BASIS_OPTIONS.map((option) => option.id);

export const CUSTOM_MATERIAL_DEFAULTS = {
  category: CUSTOM_MATERIAL_CATEGORY,
  thickness: 18,
  defaultWidth: 2440,
  defaultHeight: 1220,
  costBasis: 'perM2',
  density: 600,
  hasGrain: false,
  color: '#C08A5A',
};

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const MAX_NAME_LENGTH = 80;
const MAX_CATEGORY_LENGTH = 40;

let registry = Object.freeze([]);
let hasLoaded = false;
let revision = 0;
let idCounter = 0;

const listeners = new Set();
const reservedIds = new Set();

/* ------------------------------------------------------------------ storage */

function getStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readStoredRecords() {
  const storage = getStorage();

  if (!storage) {
    return [];
  }

  let raw = null;
  try {
    raw = storage.getItem(CUSTOM_MATERIALS_STORAGE_KEY);
  } catch {
    return [];
  }

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStoredRecords(records) {
  const storage = getStorage();

  if (!storage) {
    return;
  }

  try {
    storage.setItem(CUSTOM_MATERIALS_STORAGE_KEY, JSON.stringify(records));
  } catch (err) {
    console.warn('[customMaterials] Unable to persist custom materials:', err?.message ?? err);
  }
}

/* ------------------------------------------------------------ subscriptions */

function notify() {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch (err) {
      console.error('[customMaterials] Listener failed:', err?.message ?? err);
    }
  }
}

function commit(nextRegistry, { persist = true } = {}) {
  registry = Object.freeze(nextRegistry);
  hasLoaded = true;
  revision += 1;

  if (persist) {
    writeStoredRecords(registry);
  }

  notify();
}

/**
 * Subscribe to registry changes. Pairs with `getCustomMaterials()` /
 * `getCustomMaterialsVersion()` for `useSyncExternalStore`.
 */
export function subscribeCustomMaterials(listener) {
  if (typeof listener !== 'function') {
    return () => {};
  }

  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/* -------------------------------------------------------------------- ids */

/**
 * Register catalog ids that custom materials must never reuse. Called once by
 * `data/materials.js` at module init (one-way dependency, so no import cycle).
 */
export function reserveMaterialIds(ids) {
  for (const id of ids ?? []) {
    if (typeof id === 'string' && id) {
      reservedIds.add(id);
    }
  }
}

export function isMaterialIdReserved(id) {
  return typeof id === 'string' && reservedIds.has(id);
}

export function isCustomMaterialId(id) {
  return typeof id === 'string' && id.startsWith(CUSTOM_MATERIAL_ID_PREFIX) && !reservedIds.has(id);
}

export function generateCustomMaterialId(takenIds = new Set()) {
  let candidate = '';

  do {
    idCounter += 1;
    candidate = `${CUSTOM_MATERIAL_ID_PREFIX}${Date.now().toString(36)}-${idCounter.toString(36)}`;
  } while (reservedIds.has(candidate) || takenIds.has(candidate));

  return candidate;
}

/* ------------------------------------------------------------- validation */

function parseNumber(value) {
  if (value === '' || value === null || value === undefined || typeof value === 'boolean') {
    return NaN;
  }

  const numeric = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isFinite(numeric) ? numeric : NaN;
}

function normalizeColor(value) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  return HEX_COLOR_PATTERN.test(candidate) ? candidate : CUSTOM_MATERIAL_DEFAULTS.color;
}

/**
 * Validate a user-entered (or stored) custom material draft.
 *
 * @returns {{ valid: boolean, errors: Record<string, string>, material: object|null }}
 *   `material` is a frozen, catalog-shaped object only when `valid` is true.
 *
 * Rules: non-empty name; positive thickness / stock width / stock length in mm;
 * a finite non-negative price (0 is allowed and means "no cost", e.g. offcuts);
 * a cost basis supported by `materialCostUtils`. Density and color fall back to
 * defaults rather than failing, since neither affects costing.
 */
export function validateCustomMaterialDraft(draft = {}, options = {}) {
  const errors = {};
  const takenIds = options.takenIds instanceof Set ? options.takenIds : new Set();

  const name = typeof draft.name === 'string' ? draft.name.trim() : '';
  if (!name) {
    errors.name = 'Name is required.';
  } else if (name.length > MAX_NAME_LENGTH) {
    errors.name = `Name must be ${MAX_NAME_LENGTH} characters or fewer.`;
  }

  const rawCategory = typeof draft.category === 'string' ? draft.category.trim() : '';
  const category = rawCategory || CUSTOM_MATERIAL_CATEGORY;
  if (category.length > MAX_CATEGORY_LENGTH) {
    errors.category = `Category must be ${MAX_CATEGORY_LENGTH} characters or fewer.`;
  }

  const costBasis = typeof draft.costBasis === 'string' ? draft.costBasis.trim() : '';
  if (!SUPPORTED_COST_BASES.includes(costBasis)) {
    errors.costBasis = `Cost basis must be one of: ${SUPPORTED_COST_BASES.join(', ')}.`;
  }

  const thickness = parseNumber(draft.thickness);
  if (!(thickness > 0)) {
    errors.thickness = 'Thickness must be a positive number of millimeters.';
  }

  const price = parseNumber(draft.pricePerM2 ?? draft.price);
  if (Number.isNaN(price)) {
    errors.pricePerM2 = 'Price is required and must be a number.';
  } else if (price < 0) {
    errors.pricePerM2 = 'Price cannot be negative.';
  }

  const defaultWidth = parseNumber(draft.defaultWidth);
  if (!(defaultWidth > 0)) {
    errors.defaultWidth = 'Stock width must be a positive number of millimeters.';
  }

  const defaultHeight = parseNumber(draft.defaultHeight);
  if (!(defaultHeight > 0)) {
    errors.defaultHeight = 'Stock length must be a positive number of millimeters.';
  }

  const requestedId = typeof options.id === 'string' ? options.id.trim() : '';
  if (requestedId && !isCustomMaterialId(requestedId)) {
    errors.id = `Custom material ids must start with "${CUSTOM_MATERIAL_ID_PREFIX}" and cannot reuse a catalog id.`;
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors, material: null };
  }

  const density = parseNumber(draft.density);

  return {
    valid: true,
    errors,
    material: Object.freeze({
      id: requestedId || generateCustomMaterialId(takenIds),
      name,
      category,
      thickness,
      defaultWidth,
      defaultHeight,
      pricePerM2: price,
      costBasis,
      density: density > 0 ? density : CUSTOM_MATERIAL_DEFAULTS.density,
      // Additive field: anything stored before grain existed reads as false.
      hasGrain: draft.hasGrain === true || draft.hasGrain === 'true',
      color: normalizeColor(draft.color),
      isCustom: true,
    }),
  };
}

function normalizeStoredList(records) {
  const seenIds = new Set();
  const normalized = [];

  for (const record of records) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      continue;
    }

    // A missing id is repaired with a freshly generated one; a present-but-invalid
    // id (catalog collision, wrong prefix) means the record is dropped.
    const outcome = validateCustomMaterialDraft(record, { id: record.id, takenIds: seenIds });
    if (!outcome.valid || seenIds.has(outcome.material.id)) {
      continue;
    }

    seenIds.add(outcome.material.id);
    normalized.push(outcome.material);
  }

  return normalized;
}

/* ----------------------------------------------------------------- reading */

function ensureLoaded() {
  if (hasLoaded) {
    return;
  }

  hasLoaded = true;
  registry = Object.freeze(normalizeStoredList(readStoredRecords()));
}

/** Stable array reference; changes identity only when the registry changes. */
export function getCustomMaterials() {
  ensureLoaded();
  return registry;
}

export function getCustomMaterialById(id) {
  if (!id) {
    return null;
  }

  ensureLoaded();
  return registry.find((material) => material.id === id) ?? null;
}

/** Monotonic counter usable as a `useMemo` dependency. */
export function getCustomMaterialsVersion() {
  ensureLoaded();
  return revision;
}

/** Re-read localStorage (e.g. after an external write). Does not re-persist. */
export function reloadCustomMaterials() {
  commit(normalizeStoredList(readStoredRecords()), { persist: false });
  return registry;
}

/* --------------------------------------------------------------- mutations */

export function addCustomMaterial(draft) {
  ensureLoaded();

  const takenIds = new Set(registry.map((material) => material.id));
  const outcome = validateCustomMaterialDraft(draft, { takenIds });

  if (!outcome.valid) {
    return outcome;
  }

  commit([...registry, outcome.material]);
  return outcome;
}

export function updateCustomMaterial(id, draft) {
  ensureLoaded();

  const index = registry.findIndex((material) => material.id === id);
  if (index === -1) {
    return { valid: false, errors: { id: 'Custom material not found.' }, material: null };
  }

  const outcome = validateCustomMaterialDraft(draft, { id });
  if (!outcome.valid) {
    return outcome;
  }

  const next = registry.slice();
  next[index] = outcome.material;
  commit(next);
  return outcome;
}

export function deleteCustomMaterial(id) {
  ensureLoaded();

  const next = registry.filter((material) => material.id !== id);
  if (next.length === registry.length) {
    return false;
  }

  commit(next);
  return true;
}

/** Draft that copies a catalog (or custom) material so the user can reprice it. */
export function buildDuplicateDraft(source) {
  return {
    name: `${source?.name ?? 'Material'} (my price)`,
    category: source?.category || CUSTOM_MATERIAL_CATEGORY,
    thickness: source?.thickness ?? CUSTOM_MATERIAL_DEFAULTS.thickness,
    defaultWidth: source?.defaultWidth ?? CUSTOM_MATERIAL_DEFAULTS.defaultWidth,
    defaultHeight: source?.defaultHeight ?? CUSTOM_MATERIAL_DEFAULTS.defaultHeight,
    pricePerM2: source?.pricePerM2 ?? 0,
    costBasis: source?.costBasis ?? CUSTOM_MATERIAL_DEFAULTS.costBasis,
    density: source?.density ?? CUSTOM_MATERIAL_DEFAULTS.density,
    hasGrain: source?.hasGrain === true,
    color: source?.color ?? CUSTOM_MATERIAL_DEFAULTS.color,
  };
}

export function duplicateMaterialAsCustom(source, overrides = {}) {
  return addCustomMaterial({ ...buildDuplicateDraft(source), ...overrides });
}

/** Replace the whole registry. Used by tests and by import/reset flows. */
export function replaceCustomMaterials(records = []) {
  commit(normalizeStoredList(records));
  return registry;
}
