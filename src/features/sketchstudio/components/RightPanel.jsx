import { memo, useMemo } from 'react';
import MaterialPicker from '../craftsman/components/MaterialPicker';
import { getMaterialSelectionState } from '../craftsman/utils/materialSelectionUtils';
import SelectionActions from './SelectionActions';
import ConstraintsSection from './ConstraintsSection';
import { renderReadOnlyRows, renderEditableFields } from './ConstraintForm';

function RightPanel({
  document,
  selectedEntity,
  selectedEntities,
  selectedIds,
  groupSelectionSummary,
  selectedMeasurements,
  selectedProfileInfo,
  isBrokenLineSelection,
  canGroupSelection,
  canUngroupSelection,
  constraintDiagnostics,
  onEntityFieldCommit,
  onVariablesChange,
  onConstraintAdd,
  onConstraintUpdate,
  onConstraintRemove,
  onRotateLeft,
  onRotateRight,
  onFlipHorizontal,
  onFlipVertical,
  onToggleBrokenLines,
  onGroupSelection,
  onUngroupSelection,
  onMaterialChange,
  onThicknessChange,
}) {
  const materialSelection = useMemo(
    () => getMaterialSelectionState(document.entities, selectedIds),
    [document.entities, selectedIds],
  );

  return (
    <aside className="sketchStudioRightPanel">
      <section className="sketchStudioPanelSection">
        <p className="sketchStudioPanelEyebrow">Selection</p>
        {selectedEntity ? (
          <>
            <h2 className="sketchStudioPanelTitle">{selectedEntity.id}</h2>
            <SelectionActions
              isBrokenLineSelection={isBrokenLineSelection}
              canGroupSelection={canGroupSelection}
              canUngroupSelection={canUngroupSelection}
              onRotateLeft={onRotateLeft}
              onRotateRight={onRotateRight}
              onFlipHorizontal={onFlipHorizontal}
              onFlipVertical={onFlipVertical}
              onToggleBrokenLines={onToggleBrokenLines}
              onGroupSelection={onGroupSelection}
              onUngroupSelection={onUngroupSelection}
            />
            <div className="sketchStudioPropertyList">
              <div className="sketchStudioPropertyRow">
                <span className="sketchStudioPropertyKey">Type</span>
                <span className="sketchStudioPropertyValue">{selectedEntity.type}</span>
              </div>
              <div className="sketchStudioPropertyRow">
                <span className="sketchStudioPropertyKey">Layer</span>
                <span className="sketchStudioPropertyValue">{selectedEntity.layerId}</span>
              </div>
              {renderReadOnlyRows(selectedMeasurements)}
            </div>
            <div className="sketchStudioPropertyList sketchStudioEditableList">
              {renderEditableFields(selectedEntity, onEntityFieldCommit)}
            </div>
          </>
        ) : groupSelectionSummary ? (
          <>
            <SelectionActions
              isBrokenLineSelection={isBrokenLineSelection}
              canGroupSelection={canGroupSelection}
              canUngroupSelection={canUngroupSelection}
              onRotateLeft={onRotateLeft}
              onRotateRight={onRotateRight}
              onFlipHorizontal={onFlipHorizontal}
              onFlipVertical={onFlipVertical}
              onToggleBrokenLines={onToggleBrokenLines}
              onGroupSelection={onGroupSelection}
              onUngroupSelection={onUngroupSelection}
            />
            <div className="sketchStudioPlaceholderCard">
              <p className="sketchStudioPlaceholderText">{groupSelectionSummary.count} entities selected</p>
              <p className="sketchStudioPlaceholderSubtext">
                {groupSelectionSummary.types}
                {selectedProfileInfo
                  ? ` \u2022 ${selectedProfileInfo.count} profile source${selectedProfileInfo.count > 1 ? 's' : ''}`
                  : ''}
              </p>
            </div>
          </>
        ) : (
          <div className="sketchStudioPlaceholderCard">
            <p className="sketchStudioPlaceholderText">No selection</p>
            <p className="sketchStudioPlaceholderSubtext">Select an entity to inspect and edit it here.</p>
          </div>
        )}
      </section>
      {selectedIds.length > 0 && (
        <section className="sketchStudioPanelSection">
          <p className="sketchStudioPanelEyebrow">Materials</p>
          <div className="sketchStudioSubpanelCard">
            <MaterialPicker
              selectedMaterialId={materialSelection.selectedMaterialId}
              thickness={materialSelection.thickness}
              selectionCount={materialSelection.selectionCount}
              isMixedMaterial={materialSelection.isMixedMaterial}
              isMixedThickness={materialSelection.isMixedThickness}
              onMaterialChange={(materialId) => onMaterialChange(selectedIds, materialId)}
              onThicknessChange={(thickness) => onThicknessChange(selectedIds, thickness)}
            />
          </div>
        </section>
      )}
      <ConstraintsSection
        document={document}
        selectedIds={selectedIds}
        selectedEntities={selectedEntities}
        diagnostics={constraintDiagnostics || []}
        onVariablesChange={onVariablesChange}
        onConstraintAdd={onConstraintAdd}
        onConstraintUpdate={onConstraintUpdate}
        onConstraintRemove={onConstraintRemove}
      />
    </aside>
  );
}

export default memo(RightPanel);
