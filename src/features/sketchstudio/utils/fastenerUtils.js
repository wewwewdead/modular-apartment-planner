/**
 * Fastener placement rules shared by the fastener tool, the reducer, and the
 * hardware pickers.
 *
 * A user-placed fastener is a normal subtractive feature entity that also
 * carries the catalog id of the hardware it stands for:
 *
 *   { type: 'feature', featureType: 'hole', operation: 'subtract', shape: 'circle',
 *     cx, cy, diameter: <pilotDiameter>, hardwareId, targetPartId, depth, through }
 *
 * The BOM bills any feature carrying `hardwareId` as a counted hardware row, so
 * this module is the single place that decides which hole a catalog item drills.
 * It is the one core module that reads the craftsman material catalog; every
 * other core module goes through these helpers instead of importing the catalog.
 */
import { getHardwareById, getHardwareItems } from '../craftsman/data/materials';

/** Catalog item the fastener tool places until the user picks another one. */
export const DEFAULT_FASTENER_HARDWARE_ID = 'hw-screw-8-32';

/**
 * Kinds that pass clean through the part they are placed on. A bolt is clamped
 * by a nut on the far side, so its hole is a through hole with no drilling
 * depth; every other kind is driven into the material and stops at the
 * fastener's own length.
 */
const THROUGH_FASTENER_KINDS = new Set(['machine-bolt']);

/** Entity types a fastener can be anchored to (the stock a part is cut from). */
const TARGETABLE_PART_TYPES = new Set(['rect', 'circle', 'polyline', 'line']);

export const FASTENER_KIND_LABELS = {
  'wood-screw': 'Wood screws',
  'machine-bolt': 'Bolts',
  'pocket-screw': 'Pocket screws',
  dowel: 'Dowels',
  confirmat: 'Confirmat screws',
  'threaded-insert': 'Threaded inserts',
  hinge: 'Hinges',
  handle: 'Handles & pulls',
};

export function getFastenerKindLabel(kind) {
  return FASTENER_KIND_LABELS[kind] ?? (kind ? String(kind) : 'Hardware');
}

/**
 * Drilling data for a catalog hardware id: the pilot hole it needs, whether that
 * hole passes through, and the head/length figures previews and callouts use.
 * Returns null for anything that is not catalog hardware so callers can leave
 * the entity untouched.
 */
export function getFastenerDrillingDefaults(hardwareId) {
  const hardware = getHardwareById(hardwareId);
  const fastener = hardware?.fastener;
  const diameter = Number(fastener?.pilotDiameter);

  if (!hardware || !Number.isFinite(diameter) || diameter <= 0) {
    return null;
  }

  const length = Number(fastener.length) || null;
  const through = THROUGH_FASTENER_KINDS.has(fastener.kind);

  return {
    hardwareId: hardware.id,
    name: hardware.name,
    kind: fastener.kind ?? null,
    diameter,
    headDiameter: Number(fastener.headDiameter) || diameter,
    length,
    countersink: fastener.countersink === true,
    depth: through ? null : length,
    through,
  };
}

/**
 * Boring pattern for a catalog hardware id, or null when the item is a plain
 * fastener (or not hardware at all). Pattern hardware - hinges, handles - is
 * placed as a set of holes anchored to a part edge; hole positions are
 * millimetres in the pattern frame (`along` the edge, `inset` into the part).
 * The first hole is the primary: the placed feature that carries the catalog
 * id, so a pattern always bills exactly one piece.
 */
export function getHardwarePattern(hardwareId) {
  const hardware = getHardwareById(hardwareId);
  const pattern = hardware?.pattern;

  if (!pattern || !Array.isArray(pattern.holes) || !pattern.holes.length) {
    return null;
  }

  return {
    hardwareId: hardware.id,
    name: hardware.name,
    kind: pattern.kind ?? 'hinge',
    anchor: pattern.anchor === 'center' ? 'center' : 'edge',
    summary: pattern.summary ?? '',
    holes: pattern.holes,
  };
}

/** A feature entity that stands for a catalog fastener. */
export function isFastenerEntity(entity) {
  return entity?.type === 'feature' && typeof entity.hardwareId === 'string' && Boolean(entity.hardwareId);
}

/** The part a fastener clicked on top of belongs to, when it landed on one. */
export function resolveFastenerTargetPartId(entity) {
  return entity && TARGETABLE_PART_TYPES.has(entity.type) ? entity.id : null;
}

/** `createFeatureEntity` config for a single-click fastener placement. */
export function buildFastenerFeatureConfig(hardwareId, point, options = {}) {
  const defaults = getFastenerDrillingDefaults(hardwareId);

  if (!defaults || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    return null;
  }

  return {
    featureType: 'hole',
    operation: 'subtract',
    shape: 'circle',
    cx: point.x,
    cy: point.y,
    diameter: defaults.diameter,
    hardwareId: defaults.hardwareId,
    targetPartId: options.targetPartId ?? null,
    depth: defaults.depth,
    through: defaults.through,
    meta: options.meta ?? {},
  };
}

/**
 * Re-point an existing feature at another catalog item: the pilot diameter and
 * the drilling defaults follow the new hardware. Returns the entity unchanged
 * when it is not a feature or the id is not catalog hardware.
 */
export function applyHardwareToFeatureEntity(entity, hardwareId) {
  if (entity?.type !== 'feature') {
    return entity;
  }

  if (!hardwareId) {
    return entity.hardwareId ? { ...entity, hardwareId: null } : entity;
  }

  const defaults = getFastenerDrillingDefaults(hardwareId);

  if (!defaults) {
    return entity;
  }

  return {
    ...entity,
    hardwareId: defaults.hardwareId,
    diameter: defaults.diameter,
    depth: defaults.depth,
    through: defaults.through,
  };
}

/** Catalog hardware grouped by fastener kind, for pickers. */
export function groupHardwareByFastenerKind(items = getHardwareItems()) {
  const groups = new Map();

  for (const item of items) {
    const kind = item.fastener?.kind ?? item.pattern?.kind ?? 'other';
    const group = groups.get(kind);

    if (group) {
      group.items.push(item);
    } else {
      groups.set(kind, { id: kind, label: getFastenerKindLabel(kind), items: [item] });
    }
  }

  return [...groups.values()];
}
