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

function buildGroupCounts(entities = []) {
  return entities.reduce((counts, entity) => {
    const groupId = normalizeGroupId(entity?.meta?.groupId);

    if (!groupId) {
      return counts;
    }

    counts.set(groupId, (counts.get(groupId) ?? 0) + 1);
    return counts;
  }, new Map());
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
  return createUniqueGroupId(new Set(buildGroupCounts(entities).keys()));
}

export function normalizeEntityGroupMemberships(entities = []) {
  const counts = buildGroupCounts(entities);
  let didChange = false;

  const normalizedEntities = entities.map((entity) => {
    const rawGroupId = entity?.meta?.groupId;
    const groupId = normalizeGroupId(rawGroupId);
    const shouldKeepGroupId = groupId && (counts.get(groupId) ?? 0) > 1;

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

export function expandGroupedSelection(entities = [], selectedIds = []) {
  const entitiesById = new Map(entities.map((entity) => [entity.id, entity]));
  const uniqueSelectedIds = Array.from(new Set(selectedIds)).filter((entityId) => entitiesById.has(entityId));

  if (!uniqueSelectedIds.length) {
    return [];
  }

  const selectedIdSet = new Set(uniqueSelectedIds);
  const selectedGroupIds = new Set(
    uniqueSelectedIds.map((entityId) => getEntityGroupId(entitiesById.get(entityId))).filter(Boolean),
  );

  if (!selectedGroupIds.size) {
    return uniqueSelectedIds;
  }

  const groupedIds = entities
    .filter((entity) => selectedGroupIds.has(getEntityGroupId(entity)) && !selectedIdSet.has(entity.id))
    .map((entity) => entity.id);

  return [...uniqueSelectedIds, ...groupedIds];
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
  const totalCountByGroup = buildGroupCounts(sourceEntities);
  const duplicatedCountByGroup = new Map();

  duplicatedIdMap.forEach((_, originalId) => {
    const groupId = getEntityGroupId(entitiesById.get(originalId));

    if (!groupId) {
      return;
    }

    duplicatedCountByGroup.set(groupId, (duplicatedCountByGroup.get(groupId) ?? 0) + 1);
  });

  const reservedGroupIds = new Set(totalCountByGroup.keys());
  const remappedGroupIds = new Map();

  duplicatedCountByGroup.forEach((count, groupId) => {
    if (count >= 2 && count === totalCountByGroup.get(groupId)) {
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
