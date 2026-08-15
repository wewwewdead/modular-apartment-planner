import { normalizeGrainAngle } from './grainUtils';

function normalizeMaterialId(materialId) {
  return materialId || null;
}

function normalizeThickness(thickness) {
  const parsedThickness = Number(thickness);
  return Number.isFinite(parsedThickness) && parsedThickness > 0 ? parsedThickness : null;
}

export function getMaterialSelectionState(entities = [], selectedIds = []) {
  const selectedEntityMap = new Map(
    entities.filter((entity) => selectedIds.includes(entity.id)).map((entity) => [entity.id, entity]),
  );
  const selectedEntities = selectedIds.map((entityId) => selectedEntityMap.get(entityId)).filter(Boolean);

  const materialValues = Array.from(new Set(selectedEntities.map((entity) => normalizeMaterialId(entity.materialId))));
  const thicknessValues = Array.from(new Set(selectedEntities.map((entity) => normalizeThickness(entity.thickness))));
  // Grain is an axis, not a direction, so 0 and 180 are the same selection.
  const grainAngleValues = Array.from(
    new Set(selectedEntities.map((entity) => normalizeGrainAngle(entity.grainAngle))),
  );

  return {
    selectionCount: selectedEntities.length,
    selectedMaterialId: materialValues.length === 1 ? materialValues[0] : null,
    thickness: thicknessValues.length === 1 ? thicknessValues[0] : null,
    grainAngle: grainAngleValues.length === 1 ? grainAngleValues[0] : null,
    isMixedMaterial: materialValues.length > 1,
    isMixedThickness: thicknessValues.length > 1,
    isMixedGrainAngle: grainAngleValues.length > 1,
  };
}
