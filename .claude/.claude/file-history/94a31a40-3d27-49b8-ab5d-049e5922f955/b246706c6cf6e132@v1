import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditor } from '@/app/EditorProvider';
import { buildPreviewScene } from '@/three/scene/buildPreviewScene';
import { buildPreviewObjectRoot } from './buildPreviewObjects';
import { createPreviewViewport } from './createPreviewViewport';
import { getOrderedFloors } from '@/domain/floorModels';
import { getPreviewInspection } from './previewInspection';
import { resolveWalkFloorContext } from './resolveWalkFloorContext';
import CompassOverlay from '@/ui/CompassOverlay';
import { ExpandIcon, CollapseIcon } from '@/ui/ToolbarIcons';
import styles from './ThreePreviewPanel.module.css';

export default function ThreePreviewPanel({ project, activeFloorId, isMaximized = false, onToggleMaximize, className = '' }) {
  const viewportRef = useRef(null);
  const containerRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const compassNeedleRef = useRef(null);
  const [previewScope, setPreviewScope] = useState('all');
  const [navigationMode, setNavigationMode] = useState('inspect');
  const [walkUiState, setWalkUiState] = useState({
    navigationMode: 'inspect',
    isLocked: false,
    canLock: false,
  });
  const { selectedId, selectedType, dispatch: editorDispatch } = useEditor();

  const orderedFloors = useMemo(() => getOrderedFloors(project), [project]);

  const visibleFloorIds = useMemo(() => {
    if (previewScope === 'all') return undefined;
    if (orderedFloors.some((f) => f.id === previewScope)) return [previewScope];
    return undefined;
  }, [previewScope, orderedFloors]);

  const sceneDescriptor = useMemo(() => buildPreviewScene(project, {
    activeFloorId,
    visibleFloorIds,
  }), [project, activeFloorId, visibleFloorIds]);

  const activeFloor = (project?.floors || []).find((floor) => floor.id === activeFloorId) || null;
  const visibleCount = sceneDescriptor.floors
    .filter((floor) => floor.visible)
    .reduce((count, floor) => count + floor.objects.length, 0);
  const visibleFloorCount = sceneDescriptor.floors.filter((floor) => floor.visible).length;
  const inspection = useMemo(
    () => getPreviewInspection(project, selectedType, selectedId),
    [project, selectedId, selectedType]
  );
  const walkFloorContext = useMemo(
    () => resolveWalkFloorContext(sceneDescriptor, activeFloorId),
    [sceneDescriptor, activeFloorId]
  );
  const visibleInspection = inspection && sceneDescriptor.visibleFloorIds.includes(inspection.floorId)
    ? inspection
    : null;
  const handlePreviewScopeChange = useCallback((nextScope) => {
    setPreviewScope(nextScope);

    if (nextScope === 'all') return;
    if (!orderedFloors.some((floor) => floor.id === nextScope)) return;
    if (nextScope !== activeFloorId) {
      editorDispatch({ type: 'SET_ACTIVE_FLOOR', floorId: nextScope });
    }
  }, [activeFloorId, editorDispatch, orderedFloors]);
  const handlePreviewPick = useCallback((target) => {
    if (!target?.sourceId || !target?.kind) {
      editorDispatch({ type: 'DESELECT' });
      return;
    }

    if (target.floorId && target.floorId !== activeFloorId) {
      editorDispatch({ type: 'SET_ACTIVE_FLOOR', floorId: target.floorId });
    }

    editorDispatch({ type: 'SELECT_OBJECT', id: target.sourceId, objectType: target.kind });
  }, [activeFloorId, editorDispatch]);

  useEffect(() => {
    if (!containerRef.current) return undefined;

    const viewport = createPreviewViewport(containerRef.current);
    viewportRef.current = viewport;

    if ('ResizeObserver' in window) {
      const observer = new ResizeObserver(() => {
        viewport.resize();
      });
      observer.observe(containerRef.current);
      resizeObserverRef.current = observer;
    }

    viewport.resize();

    return () => {
      resizeObserverRef.current?.disconnect?.();
      resizeObserverRef.current = null;
      viewport.dispose();
      viewportRef.current = null;
    };
  }, []);

  useEffect(() => {
    viewportRef.current?.setPickHandler(handlePreviewPick);
  }, [handlePreviewPick]);

  useEffect(() => {
    viewportRef.current?.setPickContext({ activeFloorId });
  }, [activeFloorId]);

  useEffect(() => {
    viewportRef.current?.setWalkUiHandler(setWalkUiState);
    viewportRef.current?.setWalkExitHandler(() => {
      setNavigationMode('inspect');
    });
  }, []);

  useEffect(() => {
    viewportRef.current?.setCompassHeadingHandler((headingDeg) => {
      if (!compassNeedleRef.current) return;
      compassNeedleRef.current.style.setProperty('--compass-heading', `${headingDeg}deg`);
    });

    return () => {
      viewportRef.current?.setCompassHeadingHandler(null);
    };
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const root = buildPreviewObjectRoot(sceneDescriptor, viewport.materialPalette, {
      selectedId,
      selectedType,
    });
    viewport.setWorld(root, sceneDescriptor.bounds, sceneDescriptor.groundLevel);
  }, [sceneDescriptor, selectedId, selectedType]);

  useEffect(() => {
    viewportRef.current?.setNavigationMode(navigationMode);
  }, [navigationMode]);

  useEffect(() => {
    viewportRef.current?.setActiveFloorContext(walkFloorContext);
  }, [walkFloorContext]);

  const resetLabel = navigationMode === 'walk' ? 'Reset Walk' : 'Reset View';
  const primaryFooter = navigationMode === 'walk'
    ? (walkUiState.isLocked
      ? 'Look: mouse · Fly: W/A/S/D · Up/Down: R/F · Faster: Shift · Exit: Esc'
      : 'Walk: click preview to capture mouse · Fly: W/A/S/D · Up/Down: R/F · Faster: Shift · Exit: Esc')
    : 'Orbit: drag · Pan: right drag · Zoom: wheel · Inspect: click object';
  const secondaryFooter = navigationMode === 'walk'
    ? 'Ghost walk is noclip flight now, still read-only and collision-free.'
    : 'Perspective preview, future-ready for presets and floor visibility.';

  return (
    <section className={`${styles.panel} ${className}`}>
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <span className={styles.eyebrow}>3D Preview</span>
          <span className={styles.title}>
            {activeFloor
              ? `${visibleFloorCount === 1 ? '1 floor' : `${visibleFloorCount} floors`} · ${visibleCount} objects`
              : 'No active floor'}
          </span>
        </div>
        <div className={styles.actions}>
          <div className={styles.modeToggle} role="group" aria-label="Preview navigation mode">
            <button
              type="button"
              className={navigationMode === 'inspect' ? styles.modeButtonActive : styles.modeButton}
              onClick={() => setNavigationMode('inspect')}
              aria-pressed={navigationMode === 'inspect'}
            >
              Inspect
            </button>
            <button
              type="button"
              className={navigationMode === 'walk' ? styles.modeButtonActive : styles.modeButton}
              onClick={() => setNavigationMode('walk')}
              aria-pressed={navigationMode === 'walk'}
            >
              Walk
            </button>
          </div>
          <select
            className={styles.floorSelect}
            value={previewScope}
            onChange={(e) => handlePreviewScopeChange(e.target.value)}
          >
            <option value="all">All Floors</option>
            {orderedFloors.map((floor) => (
              <option key={floor.id} value={floor.id}>{floor.name}</option>
            ))}
          </select>
          <button
            type="button"
            className={styles.button}
            onClick={() => viewportRef.current?.resetView()}
          >
            {resetLabel}
          </button>
          {onToggleMaximize && (
            <button
              type="button"
              className={`${styles.button} ${styles.iconButton}`}
              onClick={onToggleMaximize}
              title={isMaximized ? 'Restore split view' : 'Maximize preview'}
              aria-label={isMaximized ? 'Restore split view' : 'Maximize preview'}
            >
              {isMaximized ? <CollapseIcon /> : <ExpandIcon />}
            </button>
          )}
        </div>
      </div>

      <div className={styles.viewportWrap}>
        <div ref={containerRef} className={styles.viewport} />
        <CompassOverlay className={styles.compassDock} needleRef={compassNeedleRef} />
        {navigationMode === 'walk' && (
          <div className={styles.walkOverlay}>
            <span className={styles.walkOverlayTitle}>
              {walkUiState.isLocked ? 'Walk Mode Active' : 'Walk Mode Ready'}
            </span>
            <span className={styles.walkOverlayBody}>
              {walkUiState.isLocked
                ? 'Noclip flight is live. W/S follow the camera view, A/D strafe, R/F move up and down, Shift goes faster, and Esc exits.'
                : 'Click inside the preview to capture the mouse, then use W/A/S/D for noclip flight and R/F for vertical movement.'}
            </span>
          </div>
        )}
        {visibleInspection && (
          <div className={styles.inspectCard}>
            <span className={styles.inspectEyebrow}>Selected Object</span>
            <span className={styles.inspectTitle}>{visibleInspection.title}</span>
            <span className={styles.inspectMeta}>{visibleInspection.subtitle}</span>
            <div className={styles.inspectGrid}>
              {visibleInspection.rows.map((row) => (
                <div key={`${visibleInspection.id}-${row.label}`} className={styles.inspectRow}>
                  <span className={styles.inspectLabel}>{row.label}</span>
                  <span className={styles.inspectValue}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {!sceneDescriptor.hasVisibleObjects && (
          <div className={styles.emptyState}>
            <span className={styles.emptyTitle}>Scene Empty</span>
            <span className={styles.emptyBody}>
              Add walls, slab, columns, beams, stairs, doors, or windows to populate the read-only preview.
            </span>
          </div>
        )}
      </div>

      <div className={styles.footer}>
        <span>{primaryFooter}</span>
        <span>{secondaryFooter}</span>
      </div>
    </section>
  );
}
