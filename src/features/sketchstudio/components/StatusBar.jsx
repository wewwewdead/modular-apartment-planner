import { memo } from 'react';

function getToolLabel(activeTool, tools) {
  return tools.find((tool) => tool.id === activeTool)?.label ?? activeTool;
}

function StatusBar({
  zoom,
  cursorWorld,
  activeTool,
  activeLayer,
  tools,
  snap,
  snapPoint,
  orthoEnabled,
  selectedCount,
  activeObjectName,
  selectedProfileCount,
  documentStatus,
  viewMode,
  isometricPlane,
}) {
  return (
    <footer className="sketchStudioStatusBar">
      <div className="sketchStudioStatusGroup">
        <span className="sketchStudioStatusItem">Tool {getToolLabel(activeTool, tools)}</span>
        <span className="sketchStudioStatusItem">Layer {activeLayer?.name ?? '-'}</span>
        <span className="sketchStudioStatusItem">Zoom {Math.round(zoom * 100)}%</span>
        <span className="sketchStudioStatusItem">X {cursorWorld.x.toFixed(1)}</span>
        <span className="sketchStudioStatusItem">Y {cursorWorld.y.toFixed(1)}</span>
      </div>
      <div className="sketchStudioStatusGroup">
        <span className="sketchStudioStatusItem">Snap {snap.snapType ?? '-'}</span>
        <span className="sketchStudioStatusItem">
          Snap Pt {snapPoint ? `${snapPoint.x.toFixed(1)}, ${snapPoint.y.toFixed(1)}` : '-'}
        </span>
        <span className="sketchStudioStatusItem">Ortho {orthoEnabled ? 'On' : 'Off'}</span>
        <span className="sketchStudioStatusItem">
          View {viewMode === 'isometric' ? `Iso ${isometricPlane}` : 'Plan'}
        </span>
        <span className="sketchStudioStatusItem">Selected {selectedCount}</span>
        <span className="sketchStudioStatusItem">Profiles {selectedProfileCount}</span>
        <span className="sketchStudioStatusItem">Object {activeObjectName ?? '-'}</span>
        <span className="sketchStudioStatusItem">Sketch {documentStatus ?? 'idle'}</span>
        <span className="sketchStudioStatusHint">
          Esc cancels, Enter commits exact input, Ctrl+S saves the current sketch file
        </span>
      </div>
    </footer>
  );
}

export default memo(StatusBar);
