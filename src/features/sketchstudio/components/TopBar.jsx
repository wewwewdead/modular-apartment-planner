function getToolLabel(activeTool, tools) {
  return tools.find((tool) => tool.id === activeTool)?.label ?? activeTool;
}

function getDocumentStatusLabel(documentPersistence) {
  if (documentPersistence?.error) {
    return 'Save Error';
  }

  if (documentPersistence?.status === 'saving') {
    return 'Saving';
  }

  if (documentPersistence?.renamePending) {
    return 'Rename Pending';
  }

  if (documentPersistence?.isDirty) {
    return 'Unsaved';
  }

  if (documentPersistence?.status === 'saved') {
    return 'Saved';
  }

  if (documentPersistence?.status === 'opened') {
    return 'Opened';
  }

  if (documentPersistence?.status === 'recovered') {
    return 'Recovered';
  }

  return 'Ready';
}

function ToggleButton({ active, label, onClick }) {
  return (
    <button type="button" className={`sketchStudioBadge sketchStudioToggleBadge ${active ? 'is-active' : ''}`} onClick={onClick}>
      {label}
    </button>
  );
}

function SegmentedButton({ active, label, onClick }) {
  return (
    <button
      type="button"
      className={`sketchStudioBadge sketchStudioToggleBadge ${active ? 'is-active' : ''}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export default function TopBar({
  document,
  activeTool,
  activeLayer,
  objectDraft,
  tools,
  draft,
  orthoEnabled,
  snapEnabled,
  viewMode,
  isometricPlane,
  documentPersistence,
  canUndo,
  canRedo,
  onNewSketch,
  onOpenSketch,
  onUndo,
  onRedo,
  onCreateObject,
  onCreateBlank,
  onCreateBuildFromParts,
  onSaveSketch,
  onSaveSketchAs,
  onSaveObject,
  onToggleOrtho,
  onToggleSnap,
  onSetViewMode,
  onSetIsometricPlane,
  onDocumentNameCommit,
}) {
  return (
    <header className="sketchStudioTopBar">
      <div className="sketchStudioTopBarPrimary">
        <div className="sketchStudioTopBarBrand">
          <span className="sketchStudioTopBarEyebrow">Workspace</span>
          <h1 className="sketchStudioTopBarTitle">SketchStudio</h1>
        </div>
        <div className="sketchStudioTopBarMeta">
          <input
            type="text"
            className="sketchStudioBadge sketchStudioBadgeInput"
            defaultValue={document.name}
            key={document.name}
            onBlur={(e) => onDocumentNameCommit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.target.blur();
            }}
          />
          <span className="sketchStudioBadge">{document.units}</span>
          <span className="sketchStudioBadge">{activeLayer?.name ?? 'No Layer'}</span>
          <span className="sketchStudioBadge">{objectDraft?.id ? objectDraft.name || objectDraft.id : 'No Object Draft'}</span>
          <span className="sketchStudioBadge sketchStudioBadgeAccent">{getToolLabel(activeTool, tools)}</span>
          <span className="sketchStudioBadge">{getDocumentStatusLabel(documentPersistence)}</span>
        </div>
      </div>
      <div className="sketchStudioTopBarSecondary">
        <span className="sketchStudioTopBarNote">{draft.type ? `Drafting ${draft.type}` : 'Generic custom drafting and part assembly'}</span>
        <button type="button" className="sketchStudioInlineButton" onClick={onNewSketch}>New Sketch</button>
        <button type="button" className="sketchStudioInlineButton" onClick={onOpenSketch}>Open Sketch</button>
        <button type="button" className="sketchStudioInlineButton" onClick={onUndo} disabled={!canUndo}>Undo</button>
        <button type="button" className="sketchStudioInlineButton" onClick={onRedo} disabled={!canRedo}>Redo</button>
        <button type="button" className="sketchStudioInlineButton" onClick={onSaveSketch}>Save Sketch</button>
        <button type="button" className="sketchStudioInlineButton" onClick={onSaveSketchAs}>Save As</button>
        <button type="button" className="sketchStudioInlineButton" onClick={onCreateBlank}>New Blank</button>
        <button type="button" className="sketchStudioInlineButton" onClick={onCreateBuildFromParts}>Build From Parts</button>
        <button type="button" className="sketchStudioInlineButton" onClick={onCreateObject}>From Selection</button>
        <button type="button" className="sketchStudioInlineButton" onClick={onSaveObject} disabled={!objectDraft?.id}>Save Object</button>
        <SegmentedButton active={viewMode === 'plan'} label="Plan" onClick={() => onSetViewMode('plan')} />
        <SegmentedButton active={viewMode === 'isometric'} label="Isometric" onClick={() => onSetViewMode('isometric')} />
        {viewMode === 'isometric' ? (
          <>
            <SegmentedButton active={isometricPlane === 'top'} label="Top Plane" onClick={() => onSetIsometricPlane('top')} />
            <SegmentedButton active={isometricPlane === 'left'} label="Left Plane" onClick={() => onSetIsometricPlane('left')} />
            <SegmentedButton active={isometricPlane === 'right'} label="Right Plane" onClick={() => onSetIsometricPlane('right')} />
          </>
        ) : null}
        <ToggleButton active={snapEnabled} label={`Snap ${snapEnabled ? 'On' : 'Off'}`} onClick={onToggleSnap} />
        <ToggleButton active={orthoEnabled} label={`Ortho ${orthoEnabled ? 'On' : 'Off'}`} onClick={onToggleOrtho} />
      </div>
    </header>
  );
}
