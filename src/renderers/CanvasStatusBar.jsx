import { memo } from 'react';
import { RenderProfilerScope, useRenderProfile } from './renderProfiling';
import styles from './SvgCanvas.module.css';

const CanvasStatusBar = memo(function CanvasStatusBar({
  cursorPos,
  zoomPercent,
  viewMode,
  modelTarget,
  displayedTool,
  activePhaseId,
  phaseViewMode,
  phases,
  roofHiddenByPhase,
  floorTrussSystems,
  trussesHiddenByPhase,
  activeTool,
  TOOLS,
  liveWallBearing,
  selectionCount,
  hasRoofSectionCut,
  hasTrussSectionCut,
  floorSectionCutCount,
  roofSectionMessage,
  trussSectionMessage,
  floorRoofSectionMessage,
  floorRailingSectionMessage,
  pastePreview,
}) {
  useRenderProfile('CanvasStatusBar', {
    cursorX: Math.round(cursorPos.x),
    cursorY: Math.round(cursorPos.y),
    zoomPercent,
    viewMode,
    modelTarget,
    displayedTool,
    activePhaseId,
    liveWallBearing,
    selectionCount,
    hasRoofSectionCut,
    hasTrussSectionCut,
    floorSectionCutCount,
    pastePreviewActive: Boolean(pastePreview?.active),
  });

  return (
    <RenderProfilerScope name="CanvasStatusBar">
      <div className={styles.statusBar} role="status" aria-live="polite">
        <span className={styles.statusCoords}>X: {Math.round(cursorPos.x)} mm</span>
        <span className={styles.statusCoords}>Y: {Math.round(cursorPos.y)} mm</span>
        <span className={styles.statusContext}>Zoom: {zoomPercent}%</span>
        <span className={styles.statusContext}>View: {viewMode}</span>
        <span className={styles.statusContext}>Mode: {modelTarget}</span>
        <span className={styles.statusTool}>{displayedTool}</span>
        {activePhaseId && (
          <span className={styles.statusContext}>
            Phase: {(phases || []).find((p) => p.id === activePhaseId)?.name || 'Unknown'} ({phaseViewMode})
          </span>
        )}
        {modelTarget === 'roof' && roofHiddenByPhase && (
          <span className={styles.statusContext}>Roof: hidden by phase filter</span>
        )}
        {modelTarget === 'truss' && !floorTrussSystems.length && (
          <span className={styles.statusContext}>
            {trussesHiddenByPhase ? 'Trusses: hidden by phase filter' : 'Trusses: none on active floor'}
          </span>
        )}
        {modelTarget === 'truss' && activeTool === TOOLS.TRUSS_DRAW && (
          <span className={styles.statusContext}>Draw: select two support beams</span>
        )}
        {liveWallBearing && <span className={styles.statusContext}>Bearing: {liveWallBearing}</span>}
        {selectionCount > 0 && <span className={styles.statusContext}>Selection: {selectionCount} objects</span>}
        {modelTarget === 'roof' && viewMode === 'section_view' && !hasRoofSectionCut && (
          <span className={styles.statusContext}>Section: add a floor section cut</span>
        )}
        {modelTarget === 'truss' && viewMode === 'section_view' && !hasTrussSectionCut && (
          <span className={styles.statusContext}>Section: add a floor section cut</span>
        )}
        {modelTarget === 'floor' && viewMode === 'section_view' && !floorSectionCutCount && (
          <span className={styles.statusContext}>Section: add a floor section cut</span>
        )}
        {modelTarget === 'roof' && viewMode === 'section_view' && hasRoofSectionCut && roofSectionMessage && (
          <span className={styles.statusContext}>Roof Section: {roofSectionMessage}</span>
        )}
        {modelTarget === 'truss' && viewMode === 'section_view' && hasTrussSectionCut && trussSectionMessage && (
          <span className={styles.statusContext}>Truss Section: {trussSectionMessage}</span>
        )}
        {modelTarget === 'floor' && viewMode === 'section_view' && floorRoofSectionMessage && (
          <span className={styles.statusContext}>Roof Section: {floorRoofSectionMessage}</span>
        )}
        {modelTarget === 'floor' && viewMode === 'section_view' && floorRailingSectionMessage && (
          <span className={styles.statusContext}>Railing Section: {floorRailingSectionMessage}</span>
        )}
        {modelTarget === 'floor' && pastePreview?.active && (
          <span className={styles.statusContext}>Paste: click to place</span>
        )}
      </div>
    </RenderProfilerScope>
  );
});

export default CanvasStatusBar;
