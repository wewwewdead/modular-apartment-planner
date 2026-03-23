import { UndoIcon, RedoIcon, NewIcon, SaveIcon, LoadIcon, SnapIcon } from '@/ui/ToolbarIcons';

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

function SketchTooltip({ label, shortcut, children }) {
  return (
    <span className="sketchStudioTooltipWrap">
      {children}
      <span className="sketchStudioTooltip">
        {label}
        {shortcut ? <kbd className="sketchStudioTooltipKbd">{shortcut}</kbd> : null}
      </span>
    </span>
  );
}

function SegmentedControl({ label, options, value, onChange }) {
  const activeIndex = options.findIndex((o) => o.value === value);
  const count = options.length;
  return (
    <div
      className="sketchStudioSegmented"
      role="radiogroup"
      aria-label={label}
      style={{ '--ss-seg-count': count, '--ss-seg-active': activeIndex }}
    >
      <div className="sketchStudioSegmentedIndicator" />
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={opt.value === value}
          className={`sketchStudioSegmentedBtn ${opt.value === value ? 'is-active' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function ToggleButton({ active, label, icon: Icon, onClick }) {
  return (
    <button
      type="button"
      className={`sketchStudioToggle ${active ? 'is-active' : ''}`}
      onClick={onClick}
      aria-pressed={active}
    >
      {Icon ? <Icon className="sketchStudioToggleIcon" /> : null}
      <span>{label}</span>
    </button>
  );
}

export default function TopBar({
  document,
  activeTool,
  activeLayer,
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
  onSaveSketch,
  onSaveSketchAs,
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
          <span className="sketchStudioBadge sketchStudioBadgeAccent">{getToolLabel(activeTool, tools)}</span>
          <span className="sketchStudioBadge">{getDocumentStatusLabel(documentPersistence)}</span>
        </div>
      </div>

      <div className="sketchStudioTopBarSecondary">
        <span className="sketchStudioTopBarNote">
          {draft.type ? `Drafting ${draft.type}` : 'Ready'}
        </span>

        <span className="sketchStudioTopBarDivider" aria-hidden="true" />

        <div className="sketchStudioTopBarGroup" role="group" aria-label="File operations">
          <button type="button" className="sketchStudioFileBtn" onClick={onNewSketch} aria-label="New Sketch">
            <NewIcon className="sketchStudioFileBtnIcon" /> New
          </button>
          <button type="button" className="sketchStudioFileBtn" onClick={onOpenSketch} aria-label="Open Sketch">
            <LoadIcon className="sketchStudioFileBtnIcon" /> Open
          </button>
          <button type="button" className="sketchStudioFileBtn" onClick={onSaveSketch} aria-label="Save Sketch">
            <SaveIcon className="sketchStudioFileBtnIcon" /> Save
          </button>
          <button type="button" className="sketchStudioFileBtn" onClick={onSaveSketchAs} aria-label="Save As">
            Save As
          </button>
        </div>

        <span className="sketchStudioTopBarDivider" aria-hidden="true" />

        <div className="sketchStudioTopBarGroup" role="group" aria-label="History">
          <SketchTooltip label="Undo" shortcut="Ctrl+Z">
            <button
              type="button"
              className="sketchStudioIconBtn"
              onClick={onUndo}
              disabled={!canUndo}
              aria-label="Undo"
            >
              <UndoIcon className="sketchStudioIconBtnSvg" />
            </button>
          </SketchTooltip>
          <SketchTooltip label="Redo" shortcut="Ctrl+Shift+Z">
            <button
              type="button"
              className="sketchStudioIconBtn"
              onClick={onRedo}
              disabled={!canRedo}
              aria-label="Redo"
            >
              <RedoIcon className="sketchStudioIconBtnSvg" />
            </button>
          </SketchTooltip>
        </div>

        <span className="sketchStudioTopBarDivider" aria-hidden="true" />

        <SegmentedControl
          label="View mode"
          options={[
            { value: 'plan', label: 'Plan' },
            { value: 'isometric', label: 'Iso' },
          ]}
          value={viewMode}
          onChange={onSetViewMode}
        />

        {viewMode === 'isometric' ? (
          <SegmentedControl
            label="Isometric plane"
            options={[
              { value: 'top', label: 'Top' },
              { value: 'left', label: 'Left' },
              { value: 'right', label: 'Right' },
            ]}
            value={isometricPlane}
            onChange={onSetIsometricPlane}
          />
        ) : null}

        <span className="sketchStudioTopBarDivider" aria-hidden="true" />

        <div className="sketchStudioTopBarGroup" role="group" aria-label="Drawing aids">
          <ToggleButton active={snapEnabled} label="Snap" icon={SnapIcon} onClick={onToggleSnap} />
          <ToggleButton active={orthoEnabled} label="Ortho" onClick={onToggleOrtho} />
        </div>
      </div>
    </header>
  );
}
