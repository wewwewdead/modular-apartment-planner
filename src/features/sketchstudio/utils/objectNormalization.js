import { OBJECT_CATEGORIES, OBJECT_TYPES, DEFAULT_CATEGORY, DEFAULT_OBJECT_TYPE } from './objectTypeConstants';
import { migrateLegacyObjectDraft } from './genericObjectUtils';

const VALID_OBJECT_TYPES = new Set(Object.values(OBJECT_TYPES));
const VALID_CATEGORIES = new Set(Object.values(OBJECT_CATEGORIES));

const PANEL_ROLES = new Set([
  'panel', 'shelf', 'top', 'bottom', 'side', 'back', 'front', 'divider', 'generic',
]);
const RAIL_ROLES = new Set(['leg', 'support', 'brace', 'rail']);
const PROFILE_ROLES = new Set(['door', 'drawer-front', 'custom-profile']);

export function inferPartKind(role) {
  if (RAIL_ROLES.has(role)) return 'rail';
  if (PROFILE_ROLES.has(role)) return 'profile';
  return 'panel';
}

export function normalizePartFields(part) {
  if (!part) return part;

  const normalized = { ...part };
  const origin = normalized.parametric?.origin;
  const existingTransform = normalized.transform || {};

  if (!normalized.kind) {
    normalized.kind = inferPartKind(normalized.role || 'generic');
  }

  normalized.transform = {
    x: Number(existingTransform.x) || Number(origin?.x) || 0,
    y: Number(existingTransform.y) || Number(origin?.y) || 0,
    z: Number(existingTransform.z) || Number(origin?.z) || 0,
    rotation: Number(existingTransform.rotation) || 0,
    mirrorX: existingTransform.mirrorX === true,
    mirrorY: existingTransform.mirrorY === true,
  };

  return normalized;
}

export function normalizeObjectDraft(draft) {
  if (!draft) return draft;

  const normalized = migrateLegacyObjectDraft(draft);

  if (!normalized.objectType || !VALID_OBJECT_TYPES.has(normalized.objectType)) {
    normalized.objectType = DEFAULT_OBJECT_TYPE;
  }

  if (!normalized.category || !VALID_CATEGORIES.has(normalized.category)) {
    normalized.category = DEFAULT_CATEGORY;
  }

  if (Array.isArray(normalized.parts)) {
    normalized.parts = normalized.parts.map(normalizePartFields);
  }

  return normalized;
}
