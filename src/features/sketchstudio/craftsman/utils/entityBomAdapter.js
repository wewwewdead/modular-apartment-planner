import { getEntityManufacturingGeometry, getMaterialStockKind } from './entityManufacturingGeometry';
import { getEntityGrainAngle } from './grainUtils';
import { getHardwareById, resolveHardwareIdForFastener } from '../data/materials';

const BOM_ELIGIBLE_TYPES = new Set(['rect', 'line', 'circle', 'polyline']);

// Joinery kinds that consume a catalog fastener. Anything else (dado, finger
// joint, ...) is cut geometry only and must not produce a hardware row.
const JOINERY_FASTENER_KINDS = new Set(['pocket-screw', 'dowel']);

// Kinds whose catalog item is chosen from the drilled diameter rather than from
// the kind's default (a dowel joint's hole diameter is the dowel diameter).
const DIAMETER_MATCHED_FASTENER_KINDS = new Set(['dowel']);

export function isEntityBomEligible(entity) {
  return BOM_ELIGIBLE_TYPES.has(entity?.type) && Boolean(entity?.materialId);
}

/** Hardware id explicitly placed on a feature entity by the user. */
export function getEntityHardwareId(entity) {
  if (entity?.type !== 'feature') {
    return null;
  }

  return typeof entity.hardwareId === 'string' && entity.hardwareId ? entity.hardwareId : null;
}

function getJoineryFabrication(entity) {
  return entity?.meta?.joinery?.fabrication ?? entity?.meta?.fabrication ?? null;
}

/**
 * One drilled joinery hole needs 0 or 1 fasteners, and a single fastener is
 * usually drilled twice (a pocket screw bores the source part and pilots the
 * target part; a dowel is drilled into both parts). `fastenerKey` collapses each
 * of those pairs — and any feature that appears in both the preview and the
 * export entity set — back onto one physical fastener.
 */
function getJoineryFastenerRequest(entity) {
  if (entity?.type !== 'feature') {
    return null;
  }

  const joinery = entity.meta?.joinery ?? null;
  const kind = getJoineryFabrication(entity)?.hardware?.kind ?? null;
  if (!kind || !JOINERY_FASTENER_KINDS.has(kind)) {
    return null;
  }

  return {
    kind,
    fastenerKey: buildJoineryFastenerKey(entity, joinery),
    diameter: DIAMETER_MATCHED_FASTENER_KINDS.has(kind) ? Number(entity.diameter) || null : null,
  };
}

function buildJoineryFastenerKey(entity, joinery) {
  // Operation ids are `${jointId}:${operationKind}:${partId}:${index}`, so joint
  // id + index identifies the fastener independently of which part was drilled.
  const operationId = typeof joinery?.operationId === 'string' ? joinery.operationId : '';
  const segments = operationId ? operationId.split(':') : [];

  if (segments.length > 1) {
    return `${joinery?.jointId || segments[0]}#${segments[segments.length - 1]}`;
  }

  return `${joinery?.jointId || 'joint'}#${entity.id}`;
}

function getEntityLabel(entity) {
  if (entity.meta?.label) {
    return entity.meta.label;
  }

  switch (entity.type) {
    case 'rect':
      return 'Panel';
    case 'line':
      return 'Strip';
    case 'circle':
      return 'Disc';
    case 'polyline':
      return 'Profile';
    default:
      return 'Part';
  }
}

function roundDimension(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/** Hardware rows are counted, so every stock dimension is left empty. */
function buildHardwareBomRow(entity, hardwareId, hardware) {
  return {
    partId: entity.id,
    partName: hardware?.name ?? hardwareId,
    role: 'hardware',
    material: hardwareId,
    materialName: hardware?.name ?? hardwareId,
    thickness: 0,
    width: 0,
    height: 0,
    areaMm2: null,
    stockLength: null,
    stockSectionWidth: 0,
    costBasis: 'perPiece',
    stockKind: 'piece',
    defaultStockWidth: 0,
    defaultStockLength: 0,
    dimensionAccuracy: 'exact',
    dimensionNote: '',
    quantity: 1,
    hardwareId,
    fastenerKind: hardware?.fastener?.kind ?? hardware?.pattern?.kind ?? null,
  };
}

export function isHardwareBomRow(row) {
  return row?.stockKind === 'piece' || row?.role === 'hardware';
}

/**
 * A `resolveHardwareIdForFastener` that remembers its answers for the life of one
 * build.
 *
 * Resolving a joinery fastener scans the whole merged catalog, and a document
 * with a dozen pocket screws asks the identical (kind, diameter) question a
 * dozen times. The cache is deliberately per-instance and never module-level:
 * the catalog is not static - custom materials merge in from the localStorage
 * registry and change whenever the user edits them - so a cache that outlived a
 * build would answer from a catalog that no longer exists. Callers create one
 * resolver per pass and drop it, which makes staleness structurally impossible.
 *
 * `lookup` is injectable so tests can count how often the catalog is really hit.
 */
export function createFastenerHardwareResolver(lookup = resolveHardwareIdForFastener) {
  const cache = new Map();

  return function resolveFastenerHardwareId(kind, diameter = null) {
    if (!kind) {
      return null;
    }

    // Mirrors the lookup's own rule: only a positive, finite diameter selects a
    // specific item, so every other value shares the kind's default answer.
    const numeric = Number(diameter);
    const key = `${kind}|${Number.isFinite(numeric) && numeric > 0 ? numeric : ''}`;

    if (cache.has(key)) {
      return cache.get(key);
    }

    const hardwareId = lookup(kind, diameter);
    cache.set(key, hardwareId);
    return hardwareId;
  };
}

/**
 * The catalog item a single feature stands for - the id the user placed, or the
 * one a joinery operation resolves to - or null when the feature consumes no
 * hardware.
 *
 * Unlike `entityToHardwareBomRow` this does NOT dedupe: it answers per feature,
 * so callers that need every drill site (drawing annotations, for instance) can
 * ask about each hole while the BOM keeps billing one screw per pair of holes.
 * Pass a `createFastenerHardwareResolver()` instance when asking about many
 * features in one pass.
 */
export function getEntityFastenerHardwareId(entity, resolveHardwareId = resolveHardwareIdForFastener) {
  const placedHardwareId = getEntityHardwareId(entity);
  if (placedHardwareId) {
    return placedHardwareId;
  }

  const request = getJoineryFastenerRequest(entity);
  return request ? resolveHardwareId(request.kind, request.diameter) : null;
}

export function entityToBomRow(entity, materialCatalog) {
  if (!isEntityBomEligible(entity)) {
    return null;
  }

  const material = materialCatalog?.[entity.materialId] ?? null;
  const geometry = getEntityManufacturingGeometry(entity, material);
  const thickness = entity.thickness ?? material?.thickness ?? 0;

  return {
    partId: entity.id,
    partName: getEntityLabel(entity),
    role: entity.type,
    material: entity.materialId,
    materialName: material?.name ?? entity.materialId ?? '',
    thickness,
    width: roundDimension(geometry.width),
    height: roundDimension(geometry.height),
    areaMm2: geometry.areaMm2 != null ? roundDimension(geometry.areaMm2) : null,
    stockLength: geometry.stockLength != null ? roundDimension(geometry.stockLength) : null,
    stockSectionWidth: geometry.stockSectionWidth != null ? roundDimension(geometry.stockSectionWidth) : 0,
    costBasis: material?.costBasis ?? 'perM2',
    stockKind: getMaterialStockKind(material),
    defaultStockWidth: material?.defaultWidth ?? 0,
    defaultStockLength: material?.defaultHeight ?? 0,
    dimensionAccuracy: geometry.dimensionAccuracy,
    dimensionNote: geometry.dimensionNote,
    // Grain travels with the row so the cut-list optimizer can honour it without
    // reaching back into the entity list or the material catalog.
    hasGrain: material?.hasGrain === true,
    grainAngle: getEntityGrainAngle(entity),
    quantity: 1,
  };
}

/**
 * A single-fastener row for a feature entity, or `null` when the feature carries
 * no hardware. `seenFastenerKeys` is mutated so repeated drilling operations for
 * the same physical fastener only bill once.
 */
export function entityToHardwareBomRow(
  entity,
  materialCatalog,
  seenFastenerKeys = new Set(),
  resolveHardwareId = resolveHardwareIdForFastener,
) {
  const placedHardwareId = getEntityHardwareId(entity);

  if (placedHardwareId) {
    const key = `entity:${entity.id}`;
    if (seenFastenerKeys.has(key)) {
      return null;
    }
    seenFastenerKeys.add(key);

    return buildHardwareBomRow(
      entity,
      placedHardwareId,
      materialCatalog?.[placedHardwareId] ?? getHardwareById(placedHardwareId),
    );
  }

  const request = getJoineryFastenerRequest(entity);
  if (!request) {
    return null;
  }

  const key = `joinery:${request.fastenerKey}`;
  if (seenFastenerKeys.has(key)) {
    return null;
  }

  const hardwareId = resolveHardwareId(request.kind, request.diameter);
  if (!hardwareId) {
    return null;
  }

  seenFastenerKeys.add(key);

  return buildHardwareBomRow(entity, hardwareId, materialCatalog?.[hardwareId] ?? getHardwareById(hardwareId));
}

export function entitiesToBomRows(entities, materialCatalog) {
  const rows = [];
  const seenFastenerKeys = new Set();
  // One resolver for this pass: every joinery hole of the same joint asks the
  // catalog the same question, and the memo dies with the call.
  const resolveHardwareId = createFastenerHardwareResolver();

  for (const entity of entities) {
    const row = entityToBomRow(entity, materialCatalog);
    if (row) {
      rows.push(row);
      continue;
    }

    const hardwareRow = entityToHardwareBomRow(entity, materialCatalog, seenFastenerKeys, resolveHardwareId);
    if (hardwareRow) {
      rows.push(hardwareRow);
    }
  }

  return rows;
}

/**
 * Sketch entities plus the fastener-bearing features joinery generated.
 *
 * Parts always come from the document so the manufacturing entity set's cloned
 * copies can never double-count a panel; only its synthetic joinery features are
 * added. Returns the original array when there is no joinery hardware so the BOM
 * memo keeps its input identity.
 */
export function buildBomEntityList(documentEntities = [], manufacturingEntities = []) {
  const joineryHardware = manufacturingEntities.filter(
    (entity) => entity?.meta?.joineryGenerated && getJoineryFastenerRequest(entity),
  );

  return joineryHardware.length ? [...documentEntities, ...joineryHardware] : documentEntities;
}
