import { createEntityId } from './entityUtils';
import { remapDuplicateEntityGroups } from './groupUtils';

/**
 * Shared copy machinery for the tools that duplicate a selection through a
 * transform (mirror, array).
 *
 * WHAT COPIES
 * -----------
 * Geometry and feature entities only: line, rect, circle, ellipse, arc,
 * polyline, feature. Text, dimensions, and angle dimensions are EXCLUDED — a
 * mirrored label reads backwards and a mirrored dimension would measure geometry
 * it is not attached to. Excluded entities are returned to the caller so a
 * single toast can name the count.
 *
 * WHAT THE COPY KEEPS
 * -------------------
 * `layerId`, `locked`, `visible`, `materialId`, `thickness`, and `meta` all
 * survive. `meta.sourceRefs` does NOT: those refs point at the entities the
 * ORIGINAL was picked from, and carrying them onto a copy would silently bind
 * the copy to the original's geometry. Group membership is remapped exactly the
 * way duplicate does it — a fully copied group becomes a new group, a partially
 * copied one drops the id.
 *
 * Ids come from `createEntityId` against the running entity list, so a copy can
 * never collide with an id created earlier in the same operation.
 */

export const COPYABLE_ENTITY_TYPES = ['line', 'rect', 'circle', 'ellipse', 'arc', 'polyline', 'feature'];

export const EXCLUDED_COPY_ENTITY_TYPES = ['text', 'dimension', 'angle-dimension'];

export function isCopyableEntity(entity) {
  return COPYABLE_ENTITY_TYPES.includes(entity?.type);
}

export function stripCopyMeta(meta) {
  const { sourceRefs: _sourceRefs, ...rest } = meta && typeof meta === 'object' ? meta : {};
  return rest;
}

function getCopyIdPrefix(entity) {
  return entity?.type === 'dimension' ? 'dim' : (entity?.type ?? 'entity');
}

/**
 * Build transformed copies of `entityIds`.
 *
 * @param {Array} entities full document entity list
 * @param {Array<string>} entityIds selection
 * @param {(entity: object) => object|null} transformEntity returns the copy's
 *   full geometry-carrying shape (it may change `type`, e.g. rect -> polyline),
 *   or null to skip the entity.
 * @returns {{ entities, createdEntities, createdIds, skippedEntities, idMap }}
 */
export function createTransformedCopies(entities, entityIds, transformEntity) {
  const idSet = new Set(entityIds);
  const selected = entities.filter((entity) => idSet.has(entity.id));
  const skippedEntities = selected.filter((entity) => !isCopyableEntity(entity));
  const idMap = new Map();
  const created = [];
  let working = [...entities];

  for (const source of selected) {
    if (!isCopyableEntity(source)) {
      continue;
    }

    const shape = transformEntity(source);

    if (!shape) {
      skippedEntities.push(source);
      continue;
    }

    const id = createEntityId(getCopyIdPrefix(shape), working);
    const copy = {
      ...shape,
      id,
      layerId: source.layerId ?? 'default',
      locked: source.locked ?? false,
      visible: source.visible !== false,
      meta: stripCopyMeta(source.meta),
    };

    idMap.set(source.id, id);
    created.push(copy);
    working = [...working, copy];
  }

  const createdEntities = remapDuplicateEntityGroups(entities, created, idMap);

  return {
    entities: [...entities, ...createdEntities],
    createdEntities,
    createdIds: createdEntities.map((entity) => entity.id),
    skippedEntities,
    idMap,
  };
}

/**
 * Append several transformed batches in one pass so ids stay unique across the
 * whole operation (an array of N copies is N batches).
 */
export function createTransformedCopyBatches(entities, entityIds, transformEntityForBatch, batchCount) {
  let working = entities;
  const createdEntities = [];
  let skippedEntities = [];

  for (let batch = 0; batch < batchCount; batch += 1) {
    const result = createTransformedCopies(working, entityIds, (entity) => transformEntityForBatch(entity, batch));
    working = result.entities;
    createdEntities.push(...result.createdEntities);

    if (batch === 0) {
      skippedEntities = result.skippedEntities;
    }
  }

  return {
    entities: working,
    createdEntities,
    createdIds: createdEntities.map((entity) => entity.id),
    skippedEntities,
  };
}
