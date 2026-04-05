function normalizeMaterialId(materialId) {
  return materialId || null;
}

function normalizeThickness(thickness) {
  const parsedThickness = Number(thickness);
  return Number.isFinite(parsedThickness) && parsedThickness > 0 ? parsedThickness : null;
}

export function getMaterialSelectionState(entities = [], selectedIds = []) {
  const selectedEntityMap = new Map(
    entities
      .filter((entity) => selectedIds.includes(entity.id))
      .map((entity) => [entity.id, entity]),
  );
  const selectedEntities = selectedIds
    .map((entityId) => selectedEntityMap.get(entityId))
    .filter(Boolean);

  const materialValues = Array.from(new Set(selectedEntities.map((entity) => normalizeMaterialId(entity.materialId))));
  const thicknessValues = Array.from(new Set(selectedEntities.map((entity) => normalizeThickness(entity.thickness))));

  return {
    selectionCount: selectedEntities.length,
    selectedMaterialId: materialValues.length === 1 ? materialValues[0] : null,
    thickness: thicknessValues.length === 1 ? thicknessValues[0] : null,
    isMixedMaterial: materialValues.length > 1,
    isMixedThickness: thicknessValues.length > 1,
  };
}

