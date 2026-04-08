function normalizeGroupId(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function getEntityMeta(entity) {
  return entity?.meta && typeof entity.meta === 'object' ? entity.meta : {};
}

/**
 * Build a runtime-only group membership index.
 *
 * Rebuilding the index is O(n), so the reducer should only do it after real
 * entity mutations. Once built, group member lookups are constant-time via
 * Map/Set access instead of rescanning the full entity array.
 */
export function buildGroupIndex(entities = []) {
  const index = new Map();
  for (const entity of entities) {
    const groupId = normalizeGroupId(entity?.meta?.groupId);
    if (!groupId) continue;
    let members = index.get(groupId);
    if (!members) {
      members = new Set();
      index.set(groupId, members);
    }
    members.add(entity.id);
  }
  return index;
}

function createGroupIdCandidate() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `group-${crypto.randomUUID()}`;
  }

  return `group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function createUniqueGroupId(reservedGroupIds = new Set()) {
  let nextGroupId = createGroupIdCandidate();

  while (reservedGroupIds.has(nextGroupId)) {
    nextGroupId = createGroupIdCandidate();
  }

  reservedGroupIds.add(nextGroupId);
  return nextGroupId;
}

function getEntityGroupStack(entity) {
  const meta = getEntityMeta(entity);
  return Array.isArray(meta.groupStack) ? meta.groupStack : [];
}

function updateEntityGroupId(entity, groupId) {
  const nextMeta = { ...getEntityMeta(entity) };

  if (groupId) {
    nextMeta.groupId = groupId;
  } else {
    delete nextMeta.groupId;
  }

  return {
    ...entity,
    meta: nextMeta,
  };
}

function pushEntityGroup(entity, groupId) {
  const meta = getEntityMeta(entity);
  const currentStack = getEntityGroupStack(entity);
  const currentGroupId = normalizeGroupId(meta.groupId);

  const nextStack = currentGroupId ? [...currentStack, currentGroupId] : [...currentStack];

  return {
    ...entity,
    meta: {
      ...meta,
      groupId,
      groupStack: nextStack,
    },
  };
}

function popEntityGroup(entity) {
  const meta = getEntityMeta(entity);
  const stack = getEntityGroupStack(entity);

  if (stack.length === 0) {
    return updateEntityGroupId(entity, null);
  }

  const nextStack = stack.slice(0, -1);
  const restoredGroupId = stack[stack.length - 1];

  const nextMeta = { ...meta, groupId: restoredGroupId };
  if (nextStack.length > 0) {
    nextMeta.groupStack = nextStack;
  } else {
    delete nextMeta.groupStack;
  }

  return { ...entity, meta: nextMeta };
}

export function getEntityGroupId(entity) {
  return normalizeGroupId(entity?.meta?.groupId);
}

export function createGroupId(entities = []) {
  return createUniqueGroupId(new Set(buildGroupIndex(entities).keys()));
}

export function normalizeEntityGroupMemberships(entities = []) {
  const groupIndex = buildGroupIndex(entities);
  let didChange = false;

  const normalizedEntities = entities.map((entity) => {
    const rawGroupId = entity?.meta?.groupId;
    const groupId = normalizeGroupId(rawGroupId);
    const shouldKeepGroupId = groupId && (groupIndex.get(groupId)?.size ?? 0) > 1;

    if (shouldKeepGroupId && rawGroupId === groupId) {
      return entity;
    }

    if (!shouldKeepGroupId && rawGroupId == null) {
      return entity;
    }

    didChange = true;
    return updateEntityGroupId(entity, shouldKeepGroupId ? groupId : null);
  });

  return didChange ? normalizedEntities : entities;
}

export function expandGroupedSelection(entities = [], selectedIds = [], groupIndex = null) {
  const uniqueSelectedIds = Array.from(new Set(selectedIds));

  if (!uniqueSelectedIds.length) {
    return [];
  }

  const pendingSelectedIds = new Set(uniqueSelectedIds);
  const availableEntityIds = new Set();
  const availableSelectedIds = [];
  const selectedGroupIds = new Set();

  for (const entity of entities) {
    availableEntityIds.add(entity.id);

    if (!pendingSelectedIds.has(entity.id)) {
      continue;
    }

    pendingSelectedIds.delete(entity.id);
    availableSelectedIds.push(entity.id);

    const groupId = getEntityGroupId(entity);
    if (groupId) {
      selectedGroupIds.add(groupId);
    }
  }

  if (!availableSelectedIds.length) {
    return [];
  }

  if (!selectedGroupIds.size) {
    return availableSelectedIds;
  }

  if (groupIndex) {
    const selectedIdSet = new Set(availableSelectedIds);
    const groupedIds = [];
    for (const gid of selectedGroupIds) {
      const members = groupIndex.get(gid);
      if (!members) continue;
      for (const memberId of members) {
        if (!selectedIdSet.has(memberId) && availableEntityIds.has(memberId)) {
          groupedIds.push(memberId);
        }
      }
    }
    return [...availableSelectedIds, ...groupedIds];
  }

  const selectedIdSet = new Set(availableSelectedIds);
  const groupedIds = entities
    .filter((entity) => selectedGroupIds.has(getEntityGroupId(entity)) && !selectedIdSet.has(entity.id))
    .map((entity) => entity.id);

  return [...availableSelectedIds, ...groupedIds];
}

export function hasGroupedSelection(entities = [], groupIndex = null) {
  if (!entities.length) {
    return false;
  }

  if (!groupIndex) {
    return entities.some((entity) => Boolean(getEntityGroupId(entity)));
  }

  return entities.some((entity) => {
    const groupId = getEntityGroupId(entity);
    return groupId && (groupIndex.get(groupId)?.size ?? 0) > 1;
  });
}

export function assignEntitiesToGroup(entities = [], entityIds = []) {
  const entitiesById = new Map(entities.map((entity) => [entity.id, entity]));
  const uniqueSelectedIds = Array.from(new Set(entityIds)).filter((entityId) => entitiesById.has(entityId));

  if (uniqueSelectedIds.length < 2) {
    return entities;
  }

  const selectedIdSet = new Set(uniqueSelectedIds);
  const nextGroupId = createGroupId(entities);
  const nextEntities = entities.map((entity) =>
    selectedIdSet.has(entity.id) ? pushEntityGroup(entity, nextGroupId) : entity,
  );

  return normalizeEntityGroupMemberships(nextEntities);
}

export function removeEntitiesFromGroups(entities = [], entityIds = []) {
  const selectedIdSet = new Set(entityIds);
  let didChange = false;

  const nextEntities = entities.map((entity) => {
    if (!selectedIdSet.has(entity.id) || !getEntityGroupId(entity)) {
      return entity;
    }

    didChange = true;
    return popEntityGroup(entity);
  });

  return didChange ? normalizeEntityGroupMemberships(nextEntities) : entities;
}

export function remapDuplicateEntityGroups(sourceEntities = [], duplicatedEntities = [], duplicatedIdMap = new Map()) {
  if (!duplicatedEntities.length) {
    return duplicatedEntities;
  }

  const entitiesById = new Map(sourceEntities.map((entity) => [entity.id, entity]));
  const sourceGroupIndex = buildGroupIndex(sourceEntities);
  const duplicatedCountByGroup = new Map();

  duplicatedIdMap.forEach((_, originalId) => {
    const groupId = getEntityGroupId(entitiesById.get(originalId));

    if (!groupId) {
      return;
    }

    duplicatedCountByGroup.set(groupId, (duplicatedCountByGroup.get(groupId) ?? 0) + 1);
  });

  const reservedGroupIds = new Set(sourceGroupIndex.keys());
  const remappedGroupIds = new Map();

  duplicatedCountByGroup.forEach((count, groupId) => {
    if (count >= 2 && count === (sourceGroupIndex.get(groupId)?.size ?? 0)) {
      remappedGroupIds.set(groupId, createUniqueGroupId(reservedGroupIds));
    }
  });

  let didChange = false;
  const nextEntities = duplicatedEntities.map((entity) => {
    const groupId = getEntityGroupId(entity);

    if (!groupId) {
      return entity;
    }

    didChange = true;
    return updateEntityGroupId(entity, remappedGroupIds.get(groupId) ?? null);
  });

  return didChange ? normalizeEntityGroupMemberships(nextEntities) : duplicatedEntities;
}
