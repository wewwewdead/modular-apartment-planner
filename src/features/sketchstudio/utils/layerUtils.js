function fallbackLayerName(index) {
  return `Layer ${index}`;
}

export function getLayerById(document, layerId) {
  return document.layers.find((layer) => layer.id === layerId) ?? null;
}

export function isEntityVisible(document, entity) {
  if (entity.visible === false) {
    return false;
  }

  const layer = getLayerById(document, entity.layerId);
  return layer ? layer.visible !== false : true;
}

export function isEntityEditable(document, entity) {
  if (!isEntityVisible(document, entity) || entity.locked) {
    return false;
  }

  const layer = getLayerById(document, entity.layerId);
  return layer ? layer.locked !== true : true;
}

export function getVisibleEntities(document) {
  return document.entities.filter((entity) => isEntityVisible(document, entity));
}

export function getEditableEntities(document) {
  return document.entities.filter((entity) => isEntityEditable(document, entity));
}

export function createLayer(layers, name = '') {
  const nextIndex = layers.length + 1;
  const safeName = name.trim() || fallbackLayerName(nextIndex);
  const safeId = safeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `layer-${nextIndex}`;
  let suffix = 1;
  let uniqueId = safeId;

  while (layers.some((layer) => layer.id === uniqueId)) {
    suffix += 1;
    uniqueId = `${safeId}-${suffix}`;
  }

  return {
    id: uniqueId,
    name: safeName,
    visible: true,
    locked: false,
  };
}

export function renameLayer(layers, layerId, nextName) {
  const safeName = nextName.trim();

  return layers.map((layer) => (
    layer.id === layerId
      ? { ...layer, name: safeName || layer.name }
      : layer
  ));
}

export function toggleLayerVisibility(layers, layerId) {
  return layers.map((layer) => (
    layer.id === layerId
      ? { ...layer, visible: !layer.visible }
      : layer
  ));
}

export function toggleLayerLock(layers, layerId) {
  return layers.map((layer) => (
    layer.id === layerId
      ? { ...layer, locked: !layer.locked }
      : layer
  ));
}

export function moveEntitiesToLayer(entities, entityIds, layerId) {
  const idSet = new Set(entityIds);
  return entities.map((entity) => (
    idSet.has(entity.id)
      ? { ...entity, layerId }
      : entity
  ));
}

export function getNextActiveLayer(document, preferredLayerId = null) {
  const preferred = preferredLayerId ? getLayerById(document, preferredLayerId) : null;

  if (preferred && preferred.visible !== false && preferred.locked !== true) {
    return preferred.id;
  }

  return document.layers.find((layer) => layer.visible !== false && layer.locked !== true)?.id ?? 'default';
}
