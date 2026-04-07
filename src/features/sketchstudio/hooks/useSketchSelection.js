import { useMemo } from 'react';
import { getEntityHandles } from '../utils/handleUtils';
import { getEntityMeasurementRows, resolveSourceReferenceFromEntities } from '../utils/entityUtils';
import { formatDimensionText, measureDistance } from '../utils/dimensionUtils';
import { getSelectedProfileInfo } from '../utils/objectUtils';
import { computeSelectionBounds } from '../utils/transformUtils';

export default function useSketchSelection(state) {
  const selectedIds = state.selection.selectedIds;

  const selectedEntities = useMemo(
    () => state.document.entities.filter((entity) => selectedIds.includes(entity.id)),
    [state.document.entities, selectedIds],
  );

  const selectedEntity = useMemo(
    () =>
      selectedIds.length === 1
        ? (state.document.entities.find((entity) => entity.id === selectedIds[0]) ?? null)
        : null,
    [state.document.entities, selectedIds],
  );

  const selectedHandles = useMemo(
    () => (selectedIds.length === 1 ? getEntityHandles(selectedEntity) : []),
    [selectedEntity, selectedIds.length],
  );

  const selectionBounds = useMemo(
    () => computeSelectionBounds(selectedEntities, state.document.entities),
    [selectedEntities, state.document.entities],
  );

  const selectedProfileInfo = useMemo(() => getSelectedProfileInfo(selectedEntities), [selectedEntities]);

  const selectedMeasurements = useMemo(() => {
    if (selectedEntity?.type !== 'dimension') {
      return getEntityMeasurementRows(selectedEntity);
    }

    const sourceRefs = selectedEntity.meta?.sourceRefs ?? [];
    const p1 = resolveSourceReferenceFromEntities(state.document.entities, sourceRefs[0], selectedEntity.p1);
    const p2 = resolveSourceReferenceFromEntities(state.document.entities, sourceRefs[1], selectedEntity.p2);
    return [
      ['Subtype', selectedEntity.subtype],
      ['Offset', selectedEntity.offset],
      ['Value', formatDimensionText(measureDistance(p1, p2, selectedEntity.subtype), selectedEntity.units)],
    ];
  }, [selectedEntity, state.document.entities]);

  const isBrokenLineSelection = useMemo(
    () => selectedEntities.length > 0 && selectedEntities.every((entity) => entity.meta?.lineStyle === 'broken'),
    [selectedEntities],
  );

  const hasGroupedSelection = useMemo(
    () => selectedEntities.some((entity) => Boolean(entity.meta?.groupId)),
    [selectedEntities],
  );

  const groupSelectionSummary = useMemo(() => {
    if (!selectedEntities.length) {
      return null;
    }

    const typeCounts = selectedEntities.reduce((accumulator, entity) => {
      accumulator[entity.type] = (accumulator[entity.type] ?? 0) + 1;
      return accumulator;
    }, {});

    return {
      count: selectedEntities.length,
      types: Object.entries(typeCounts)
        .map(([type, count]) => `${type} x${count}`)
        .join(', '),
    };
  }, [selectedEntities]);

  return {
    selectedIds,
    selectedEntities,
    selectedEntity,
    selectedHandles,
    selectionBounds,
    selectedProfileInfo,
    selectedMeasurements,
    isBrokenLineSelection,
    hasGroupedSelection,
    groupSelectionSummary,
  };
}
