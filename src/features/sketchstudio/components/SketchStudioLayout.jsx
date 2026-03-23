import { useRef } from 'react';
import DraftingCanvas from './DraftingCanvas';
import LeftToolbar from './LeftToolbar';
import RightPanel from './RightPanel';
import StatusBar from './StatusBar';
import TopBar from './TopBar';
import { canUseSketchOpenFilePicker } from '../utils/sketchWorkspaceFileUtils';

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
    selectedMeasurements,
    selectedHandles,
    selectionBounds,
    groupSelectionSummary,
    selectedProfileInfo,
    isBrokenLineSelection,
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
  } = props;

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
        />
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
            selectedHandles={selectedHandles}
            selectionBounds={selectionBounds}
            isPanning={interaction.mode === 'panning'}
            canvasBindings={canvasBindings}
            precisionBindings={precisionBindings}
            handleBindings={handleBindings}
          />
          <RightPanel
            selectedEntity={selectedEntity}
            groupSelectionSummary={groupSelectionSummary}
            selectedMeasurements={selectedMeasurements}
            selectedProfileInfo={selectedProfileInfo}
            isBrokenLineSelection={isBrokenLineSelection}
            onEntityFieldCommit={updateSelectedEntityField}
            onRotateLeft={rotateSelectionLeft}
            onRotateRight={rotateSelectionRight}
            onFlipHorizontal={flipSelectionHorizontal}
            onFlipVertical={flipSelectionVertical}
            onToggleBrokenLines={toggleBrokenLines}
          />
        </div>
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
