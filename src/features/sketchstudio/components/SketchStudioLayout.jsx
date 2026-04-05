import { useRef, useState, useCallback } from 'react';
import DraftingCanvas from './DraftingCanvas';
import LeftToolbar from './LeftToolbar';
import RightPanel from './RightPanel';
import StatusBar from './StatusBar';
import TopBar from './TopBar';
import { canUseSketchOpenFilePicker } from '../utils/sketchWorkspaceFileUtils';
import CraftsmanSidebar from '../craftsman/components/CraftsmanSidebar';
import CraftsmanToggle from '../craftsman/components/CraftsmanToggle';
import ExportBar from '../craftsman/components/ExportBar';
import TemplateGallery from '../craftsman/components/TemplateGallery';
import useSketchBOM from '../craftsman/hooks/useSketchBOM';

export default function SketchStudioLayout(props) {
  const importInputRef = useRef(null);
  const {
    document,
    documentPersistence,
    canUndo,
    canRedo,
    viewport,
    ui,
    interaction,
    selection,
    hover,
    draft,
    draftPreview,
    precisionHud,
    snap,
    activeTool,
    activeLayer,
    tools,
    visibleEntities,
    selectedEntity,
    selectedEntities,
    selectedMeasurements,
    selectedHandles,
    selectionBounds,
    groupSelectionSummary,
    selectedProfileInfo,
    isBrokenLineSelection,
    constraintDiagnostics,
    jointDiagnostics,
    manufacturingPreviewEntities,
    manufacturingExportEntities,
    setActiveTool,
    toggleOrtho,
    toggleSnap,
    updateSelectedEntityField,
    rotateSelectionLeft,
    rotateSelectionRight,
    flipSelectionHorizontal,
    flipSelectionVertical,
    toggleBrokenLines,
    newSketch,
    openSketch,
    importSketchFile,
    saveSketch,
    saveSketchAs,
    undo,
    redo,
    commitDocumentName,
    precisionBindings,
    handleBindings,
    canvasBindings,
    status,
    setEntityMaterial,
    setEntityThickness,
    toggleCraftsmanMode,
    setVariables,
    addConstraint,
    updateConstraint,
    removeConstraint,
    addJoint,
    updateJoint,
    removeJoint,
    loadTemplate,
    duplicateEntities,
  } = props;

  const [showGallery, setShowGallery] = useState(false);
  const { bomRows, totalCost, costByMaterial } = useSketchBOM(document.entities);

  const handleLoadTemplate = useCallback(
    (workspace) => {
      if (
        document.entities.length > 0 &&
        !window.confirm('Loading a template will replace your current sketch. Continue?')
      )
        return;
      if (workspace?.document) {
        loadTemplate(workspace);
      }
      setShowGallery(false);
    },
    [document.entities.length, loadTemplate],
  );

  const handleOpenSketch = async () => {
    if (canUseSketchOpenFilePicker()) {
      await openSketch();
      return;
    }

    importInputRef.current?.click();
  };

  const handleImportSketchChange = async (event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    if (!file) {
      return;
    }

    await importSketchFile(file);
  };

  return (
    <main className="sketchStudioPage">
      <input
        ref={importInputRef}
        type="file"
        accept=".json,application/json"
        onChange={handleImportSketchChange}
        style={{ display: 'none' }}
      />
      <section className="sketchStudioShell">
        <TopBar
          document={document}
          activeTool={activeTool}
          activeLayer={activeLayer}
          tools={tools}
          draft={draft}
          orthoEnabled={ui.orthoEnabled}
          snapEnabled={ui.snapEnabled}
          viewMode={ui.viewMode}
          isometricPlane={ui.isometricPlane}
          documentPersistence={documentPersistence}
          canUndo={canUndo}
          canRedo={canRedo}
          onNewSketch={newSketch}
          onOpenSketch={handleOpenSketch}
          onUndo={undo}
          onRedo={redo}
          onSaveSketch={saveSketch}
          onSaveSketchAs={saveSketchAs}
          onToggleOrtho={toggleOrtho}
          onToggleSnap={toggleSnap}
          onSetViewMode={props.setViewMode}
          onSetIsometricPlane={props.setIsometricPlane}
          onDocumentNameCommit={commitDocumentName}
        >
          <CraftsmanToggle isActive={ui.craftsmanMode} onToggle={toggleCraftsmanMode} />
        </TopBar>
        <div className="sketchStudioWorkspace">
          <LeftToolbar tools={tools} activeTool={activeTool} onToolChange={setActiveTool} />
          <DraftingCanvas
            document={document}
            visibleEntities={visibleEntities}
            viewport={viewport}
            ui={ui}
            interaction={interaction}
            selection={selection}
            hover={hover}
            draft={draft}
            draftPreview={draftPreview}
            precisionHud={precisionHud}
            snap={snap}
            manufacturingPreviewEntities={ui.craftsmanMode ? manufacturingPreviewEntities : []}
            selectedHandles={selectedHandles}
            selectionBounds={selectionBounds}
            isPanning={interaction.mode === 'panning'}
            canvasBindings={canvasBindings}
            precisionBindings={precisionBindings}
            handleBindings={handleBindings}
            onUpdateEntityField={updateSelectedEntityField}
          />
          {ui.craftsmanMode ? (
            showGallery ? (
              <TemplateGallery onLoadTemplate={handleLoadTemplate} onBack={() => setShowGallery(false)} />
            ) : (
              <CraftsmanSidebar
                entities={document.entities}
                selectedEntity={selectedEntity}
                selectedEntities={selectedEntities}
                selectedIds={selection.selectedIds}
                variables={document.variables}
                constraints={document.constraints}
                joints={document.joints}
                jointDiagnostics={jointDiagnostics}
                onMaterialChange={setEntityMaterial}
                onThicknessChange={setEntityThickness}
                onVariablesChange={setVariables}
                onJointAdd={addJoint}
                onJointUpdate={updateJoint}
                onJointRemove={removeJoint}
                onLoadTemplate={() => setShowGallery(true)}
                onDuplicateEntities={duplicateEntities}
                onEntityFieldCommit={updateSelectedEntityField}
              />
            )
          ) : (
            <RightPanel
              document={document}
              selectedEntity={selectedEntity}
              selectedEntities={selectedEntities}
              selectedIds={selection.selectedIds}
              groupSelectionSummary={groupSelectionSummary}
              selectedMeasurements={selectedMeasurements}
              selectedProfileInfo={selectedProfileInfo}
              isBrokenLineSelection={isBrokenLineSelection}
              constraintDiagnostics={constraintDiagnostics}
              onEntityFieldCommit={updateSelectedEntityField}
              onVariablesChange={setVariables}
              onConstraintAdd={addConstraint}
              onConstraintUpdate={updateConstraint}
              onConstraintRemove={removeConstraint}
              onRotateLeft={rotateSelectionLeft}
              onRotateRight={rotateSelectionRight}
              onFlipHorizontal={flipSelectionHorizontal}
              onFlipVertical={flipSelectionVertical}
              onToggleBrokenLines={toggleBrokenLines}
              onMaterialChange={setEntityMaterial}
              onThicknessChange={setEntityThickness}
            />
          )}
        </div>
        {ui.craftsmanMode && (
          <ExportBar
            entities={manufacturingExportEntities}
            referenceEntities={document.entities}
            selectedIds={selection.selectedIds}
            bomRows={bomRows}
            totalCost={totalCost}
            costByMaterial={costByMaterial}
            projectName={document.name}
          />
        )}
        <StatusBar
          zoom={viewport.zoom}
          cursorWorld={status.cursorWorld}
          activeTool={activeTool}
          activeLayer={activeLayer}
          tools={tools}
          snap={snap}
          snapPoint={status.snapPoint}
          orthoEnabled={ui.orthoEnabled}
          selectedCount={selection.selectedIds.length}
          activeObjectName={status.activeObjectName}
          selectedProfileCount={status.selectedProfileCount}
          documentStatus={status.documentStatus}
          viewMode={ui.viewMode}
          isometricPlane={ui.isometricPlane}
        />
      </section>
    </main>
  );
}
