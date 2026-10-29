import { memo, useEffect, useRef } from 'react';
import { RenderProfilerScope, useRenderProfile } from './renderProfiling';
import styles from './SvgCanvas.module.css';

/**
 * The live cursor coordinates.
 *
 * The canvas writes these straight into the DOM through `cursorChannelRef` — a ref
 * holding a setter this publishes on mount — instead of passing a position down
 * as a prop. The position changes on every hover frame, and a prop would make
 * the whole canvas re-render to move two numbers.
 *
 * The spans render a fixed placeholder, so a re-render of the status bar for
 * some other reason produces the same virtual text and React leaves the DOM
 * alone: what the canvas wrote survives.
 */
const CursorReadout = memo(function CursorReadout({ cursorChannelRef }) {
  const xRef = useRef(null);
  const yRef = useRef(null);

  useEffect(() => {
    if (!cursorChannelRef) return undefined;
    cursorChannelRef.current = (point) => {
      if (xRef.current) xRef.current.textContent = `X: ${Math.round(point.x)} mm`;
      if (yRef.current) yRef.current.textContent = `Y: ${Math.round(point.y)} mm`;
    };
    return () => {
      cursorChannelRef.current = null;
    };
  }, [cursorChannelRef]);

  return (
    <>
      <span ref={xRef} className={styles.statusCoords}>
        X: 0 mm
      </span>
      <span ref={yRef} className={styles.statusCoords}>
        Y: 0 mm
      </span>
    </>
  );
});

const CanvasStatusBar = memo(function CanvasStatusBar({
  cursorChannelRef,
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
  coordinationIssues = [],
}) {
  useRenderProfile('CanvasStatusBar', {
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
        <CursorReadout cursorChannelRef={cursorChannelRef} />
        <span className={styles.statusContext}>Zoom: {zoomPercent}%</span>
        <span className={styles.statusContext}>View: {viewMode}</span>
        <span className={styles.statusContext}>Mode: {modelTarget}</span>
        <span className={styles.statusTool}>{displayedTool}</span>
        <span className={styles.statusContext}>
          Coordination:{' '}
          {coordinationIssues.length
            ? `${coordinationIssues.length} finding${coordinationIssues.length === 1 ? '' : 's'}`
            : 'no current findings'}
        </span>
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
