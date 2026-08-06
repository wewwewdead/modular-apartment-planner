import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditor } from '@/features/floorplan/context/FloorplanContext';
import { filterProjectByPhase } from '@/domain/phaseFilter';
import { buildPreviewScene } from '@/three/scene/buildPreviewScene';
import { buildSelectionOverlay } from './buildPreviewObjects';
import { createPreviewSceneCache } from './previewSceneCache';
import { createPreviewViewport } from './createPreviewViewport';
import { getOrderedFloors } from '@/domain/floorModels';
import { getPreviewInspection } from './previewInspection';
import { resolveWalkFloorContext } from './resolveWalkFloorContext';
import { computeSunVector } from '@/analysis/sunStudyRunner';
import { useWindStudy } from '@/features/floorplan/context/WindStudyContext';
import CompassOverlay from '@/features/floorplan/components/CompassOverlay';
import { ExpandIcon, CollapseIcon } from '@/ui/ToolbarIcons';
import styles from './ThreePreviewPanel.module.css';

const WIND_DIRECTION_LABELS = [
  'N',
  'NNE',
  'NE',
  'ENE',
  'E',
  'ESE',
  'SE',
  'SSE',
  'S',
  'SSW',
  'SW',
  'WSW',
  'W',
  'WNW',
  'NW',
  'NNW',
];

function directionLabel(directionDeg) {
  return WIND_DIRECTION_LABELS[Math.round((directionDeg || 0) / 22.5) % WIND_DIRECTION_LABELS.length];
}

export default function ThreePreviewPanel({
  project,
  activeFloorId,
  isMaximized = false,
  onToggleMaximize,
  className = '',
  applyPhaseFilter = true,
}) {
  const viewportRef = useRef(null);
  const containerRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const compassNeedleRef = useRef(null);
  const sceneCacheRef = useRef(null);
  const [previewScope, setPreviewScope] = useState('all');
  const [navigationMode, setNavigationMode] = useState('inspect');
  const [showWind3d, setShowWind3d] = useState(true);
  const [wind3dMode, setWind3dMode] = useState('outdoor');
  const [walkUiState, setWalkUiState] = useState({
    navigationMode: 'inspect',
    isLocked: false,
    canLock: false,
  });
  const { selectedId, selectedType, activePhaseId, phaseViewMode, sunStudy, dispatch: editorDispatch } = useEditor();
  const wind = useWindStudy();
  const activeWind3dMode = wind.study?.mode === 'direction' ? wind3dMode : 'outdoor';

  const filteredProject = useMemo(
    () => (applyPhaseFilter ? filterProjectByPhase(project, activePhaseId, phaseViewMode) : project),
    [project, activePhaseId, phaseViewMode, applyPhaseFilter],
  );

  const orderedFloors = useMemo(() => getOrderedFloors(project), [project]);

  const visibleFloorIds = useMemo(() => {
    if (previewScope === 'all') return undefined;
    if (orderedFloors.some((f) => f.id === previewScope)) return [previewScope];
    return undefined;
  }, [previewScope, orderedFloors]);

  const sceneDescriptor = useMemo(
    () =>
      buildPreviewScene(filteredProject, {
        activeFloorId,
        visibleFloorIds,
      }),
    [filteredProject, activeFloorId, visibleFloorIds],
  );

  const activeFloor = (project?.floors || []).find((floor) => floor.id === activeFloorId) || null;
  const visibleCount = sceneDescriptor.floors
    .filter((floor) => floor.visible)
    .reduce((count, floor) => count + floor.objects.length, 0);
  const visibleFloorCount = sceneDescriptor.floors.filter(
    (floor) => floor.visible && floor.floorId !== sceneDescriptor.roofLayerId,
  ).length;
  const inspection = useMemo(
    () => getPreviewInspection(project, selectedType, selectedId),
    [project, selectedId, selectedType],
  );
  const walkFloorContext = useMemo(
    () => resolveWalkFloorContext(sceneDescriptor, activeFloorId),
    [sceneDescriptor, activeFloorId],
  );
  const visibleInspection =
    inspection && sceneDescriptor.visibleFloorIds.includes(inspection.floorId) ? inspection : null;
  const handlePreviewScopeChange = useCallback(
    (nextScope) => {
      setPreviewScope(nextScope);

      if (nextScope === 'all') return;
      if (!orderedFloors.some((floor) => floor.id === nextScope)) return;
      if (nextScope !== activeFloorId) {
        editorDispatch({ type: 'SET_ACTIVE_FLOOR', floorId: nextScope });
      }
    },
    [activeFloorId, editorDispatch, orderedFloors],
  );
  const handlePreviewPick = useCallback(
    (target) => {
      if (!target?.sourceId || !target?.kind) {
        editorDispatch({ type: 'DESELECT' });
        return;
      }

      if (target.floorId && target.floorId !== activeFloorId) {
        editorDispatch({ type: 'SET_ACTIVE_FLOOR', floorId: target.floorId });
      }

      editorDispatch({ type: 'SELECT_OBJECT', id: target.sourceId, objectType: target.kind });
    },
    [activeFloorId, editorDispatch],
  );

  useEffect(() => {
    if (!containerRef.current) return undefined;

    const viewport = createPreviewViewport(containerRef.current);
    viewportRef.current = viewport;
    sceneCacheRef.current = createPreviewSceneCache();

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
      // Dispose viewport first (removes worldRoot from scene without disposing,
      // since the cache owns those geometries), then let the cache dispose the
      // per-floor groups it built.
      viewport.dispose();
      viewportRef.current = null;
      sceneCacheRef.current?.dispose();
      sceneCacheRef.current = null;
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

  // Scene structure effect: rebuild only when project data / phase filter / floor visibility changes
  const meshMapRef = useRef(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    const sceneCache = sceneCacheRef.current;
    if (!viewport || !sceneCache) return;

    // Incremental build: reuse THREE groups for floors whose source geometry is
    // unchanged (immutable reducer updates preserve floor object identity), and
    // only rebuild floors that actually changed.
    const { root, meshMap } = sceneCache.build(sceneDescriptor, viewport.materialPalette);
    meshMapRef.current = meshMap;
    viewport.setWorld(root, sceneDescriptor.bounds, sceneDescriptor.groundLevel);
  }, [sceneDescriptor]);

  // Selection effect: swap overlay meshes without rebuilding the scene.
  // Re-runs when the selection changes OR when the scene was rebuilt
  // (setWorld clears the overlay, and the meshMap identity changes), so a
  // selected object stays highlighted after an unrelated geometry edit.
  useEffect(() => {
    const viewport = viewportRef.current;
    const meshMap = meshMapRef.current;
    if (!viewport || !meshMap) return;

    const overlay = buildSelectionOverlay(meshMap, { selectedId, selectedType }, viewport.materialPalette);
    viewport.setSelectionOverlay(overlay);
  }, [selectedId, selectedType, sceneDescriptor]);

  // Aim the key light at the real sun whenever the study or the site moves.
  // Only the sun vector is needed here — the shadows themselves come from the
  // renderer's shadow map, not from the 2D projection.
  const sunLight = useMemo(() => computeSunVector({ project: filteredProject, sunStudy }), [filteredProject, sunStudy]);

  useEffect(() => {
    viewportRef.current?.setSun(sunLight);
  }, [sunLight]);

  useEffect(() => {
    viewportRef.current?.setWindStudy?.(showWind3d ? wind.study : null, {
      stale: wind.stale,
      mode: activeWind3dMode,
    });
  }, [activeWind3dMode, showWind3d, wind.stale, wind.study]);

  useEffect(() => {
    viewportRef.current?.setNavigationMode(navigationMode);
  }, [navigationMode]);

  useEffect(() => {
    viewportRef.current?.setActiveFloorContext(walkFloorContext);
  }, [walkFloorContext]);

  const resetLabel = navigationMode === 'walk' ? 'Reset Walk' : 'Reset View';
  const primaryFooter =
    navigationMode === 'walk'
      ? walkUiState.isLocked
        ? 'Look: mouse · Fly: W/A/S/D · Up/Down: R/F · Faster: Shift · Exit: Esc'
        : 'Walk: click preview to capture mouse · Fly: W/A/S/D · Up/Down: R/F · Faster: Shift · Exit: Esc'
      : 'Orbit: drag · Pan: right drag · Zoom: wheel · Inspect: click object';
  const secondaryFooter =
    navigationMode === 'walk'
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
              <option key={floor.id} value={floor.id}>
                {floor.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={`${styles.button} ${showWind3d && wind.settings?.enabled ? styles.analysisButtonActive : ''}`}
            onClick={() => setShowWind3d((current) => !current)}
            aria-pressed={showWind3d}
            disabled={!wind.settings?.enabled}
            title={wind.settings?.enabled ? 'Toggle the 3D wind field' : 'Enable Pedestrian Wind first'}
          >
            3D Wind
          </button>
          {showWind3d && wind.settings?.enabled && (
            <select
              className={styles.floorSelect}
              value={activeWind3dMode}
              onChange={(event) => setWind3dMode(event.target.value)}
              aria-label="3D wind display"
            >
              <option value="outdoor">Outdoor flow</option>
              <option value="ventilation" disabled={wind.study?.mode !== 'direction'}>
                Room airflow
              </option>
            </select>
          )}
          <button type="button" className={styles.button} onClick={() => viewportRef.current?.resetView()}>
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
        {showWind3d && wind.settings?.enabled && (
          <div className={styles.windBadge} data-stale={wind.stale || undefined}>
            <span className={styles.windBadgeTitle}>
              {activeWind3dMode === 'ventilation' ? 'Room airflow network' : 'Outdoor wind field'}
            </span>
            <span>
              {wind.status === 'running'
                ? 'Solving updated flow…'
                : wind.study
                  ? activeWind3dMode === 'ventilation'
                    ? `${wind.study.ventilation?.summary.crossVentilatedRoomCount || 0} cross-flow rooms · ${(
                        wind.study.ventilation?.summary.meanAirChangesPerHour || 0
                      ).toFixed(1)} mean ACH`
                    : `${
                        wind.study.mode === 'direction'
                          ? 'Animated velocity'
                          : `Comfort map + prevailing ${directionLabel(
                              wind.study.representativeFlow?.directionDeg,
                            )} flow`
                      } · ${(wind.study.sliceHeight / 1000).toFixed(1)} m slice`
                  : 'Waiting for wind result…'}
            </span>
            {activeWind3dMode === 'ventilation' && wind.study && (
              <span>Blue = inlet · orange = outlet / transfer · room colour = ACH</span>
            )}
          </div>
        )}
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
