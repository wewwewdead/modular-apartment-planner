import { memo, useMemo } from 'react';
import MaterialPicker from '../craftsman/components/MaterialPicker';
import FastenerPanel, { isFastenerPanelVisible } from '../craftsman/components/FastenerPanel';
import ParametricPanel from '../craftsman/components/ParametricPanel';
import ShelfSagPanel, { isShelfSagPanelVisible } from '../craftsman/components/ShelfSagPanel';
import { getMaterialSelectionState } from '../craftsman/utils/materialSelectionUtils';
import SelectionActions from './SelectionActions';
import { renderReadOnlyRows, renderEditableFields } from './EntityFieldEditors';

function RightPanel({
  document,
  selectedEntity,
  selectedIds,
  groupSelectionSummary,
  selectedMeasurements,
  selectedProfileInfo,
  isBrokenLineSelection,
  canGroupSelection,
  canUngroupSelection,
  onEntityFieldCommit,
  onVariablesChange,
  onRotateLeft,
  onRotateRight,
  onFlipHorizontal,
  onFlipVertical,
  onToggleBrokenLines,
  onGroupSelection,
  onUngroupSelection,
  onMaterialChange,
  onThicknessChange,
  onGrainAngleChange,
  activeTool,
  activeHardwareId,
  onActiveHardwareChange,
  onEntityHardwareChange,
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
              {renderEditableFields(selectedEntity, onEntityFieldCommit, document.variables || [])}
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
      {isFastenerPanelVisible(activeTool, selectedEntity) && (
        <section className="sketchStudioPanelSection">
          <p className="sketchStudioPanelEyebrow">Fastener</p>
          <div className="sketchStudioSubpanelCard">
            <FastenerPanel
              activeTool={activeTool}
              activeHardwareId={activeHardwareId}
              onActiveHardwareChange={onActiveHardwareChange}
              selectedEntity={selectedEntity}
              selectedIds={selectedIds}
              onEntityHardwareChange={onEntityHardwareChange}
              onEntityFieldCommit={onEntityFieldCommit}
            />
          </div>
        </section>
      )}
      {selectedIds.length > 0 && (
        <section className="sketchStudioPanelSection">
          <p className="sketchStudioPanelEyebrow">Materials</p>
          <div className="sketchStudioSubpanelCard">
            <MaterialPicker
              selectedMaterialId={materialSelection.selectedMaterialId}
              thickness={materialSelection.thickness}
              grainAngle={materialSelection.grainAngle}
              selectionCount={materialSelection.selectionCount}
              isMixedMaterial={materialSelection.isMixedMaterial}
              isMixedThickness={materialSelection.isMixedThickness}
              isMixedGrainAngle={materialSelection.isMixedGrainAngle}
              onMaterialChange={(materialId) => onMaterialChange(selectedIds, materialId)}
              onThicknessChange={(thickness) => onThicknessChange(selectedIds, thickness)}
              onGrainAngleChange={
                onGrainAngleChange ? (grainAngle) => onGrainAngleChange(selectedIds, grainAngle) : undefined
              }
            />
          </div>
        </section>
      )}
      {isShelfSagPanelVisible(selectedEntity) && (
        <section className="sketchStudioPanelSection">
          <p className="sketchStudioPanelEyebrow">Shelf sag</p>
          <div className="sketchStudioSubpanelCard">
            <ShelfSagPanel key={selectedEntity.id} entity={selectedEntity} />
          </div>
        </section>
      )}
      <section className="sketchStudioPanelSection">
        <p className="sketchStudioPanelEyebrow">Parametric</p>
        <div className="sketchStudioSubpanelCard">
          <ParametricPanel
            variables={document.variables || []}
            entities={document.entities}
            onVariablesChange={onVariablesChange}
          />
        </div>
      </section>
    </aside>
  );
}

export default memo(RightPanel);
