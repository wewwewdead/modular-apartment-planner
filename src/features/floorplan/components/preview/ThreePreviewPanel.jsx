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
import { RENDER_STYLE_PRESETS, persistRenderStylePreference, readRenderStylePreference } from './renderStyle';
import CompassOverlay from '@/features/floorplan/components/CompassOverlay';
import { ExpandIcon, CollapseIcon } from '@/ui/ToolbarIcons';
import styles from './ThreePreviewPanel.module.css';

// ~15 scene rebuilds a second while the project is changing every frame.
const MIN_SCENE_REBUILD_INTERVAL_MS = 66;

export default function ThreePreviewPanel({
  project,
  activeFloorId,
  isFocused = false,
  onToggleFocus,
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
  const [renderStyle, setRenderStyle] = useState(readRenderStylePreference);
  const [walkUiState, setWalkUiState] = useState({
    navigationMode: 'inspect',
    isLocked: false,
    canLock: false,
  });
  const {
    selectedId,
    selectedType,
    activePhaseId,
    phaseViewMode,
    sunStudy,
    hiddenWallBoards,
    dispatch: editorDispatch,
  } = useEditor();

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
        hiddenWallBoards,
      }),
    [filteredProject, activeFloorId, visibleFloorIds, hiddenWallBoards],
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
  const lastBuildAt = useRef(0);
  const [sceneBuildId, setSceneBuildId] = useState(0);

  /*
   * Rebuilding a floor re-triangulates every mesh on it — several milliseconds
   * of a 16 ms frame, plus the GPU buffer churn of disposing what it replaces.
   * A drag changes the project on every frame, so an unthrottled rebuild spends
   * most of the plan editor's frame budget on the preview beside it. Capping the
   * rate keeps the preview live (still ~15 updates a second) while leaving the
   * frame to the canvas the pointer is actually in.
   *
   * The trailing build is what makes this safe: the effect re-runs for each new
   * descriptor and its cleanup cancels the timer it scheduled, so the last
   * descriptor of a drag always gets built — the preview never settles on a
   * stale scene.
   */
  useEffect(() => {
    const viewport = viewportRef.current;
    const sceneCache = sceneCacheRef.current;
    if (!viewport || !sceneCache) return undefined;

    const runBuild = () => {
      lastBuildAt.current = performance.now();
      // Incremental build: reuse THREE groups for floors whose source geometry is
      // unchanged (immutable reducer updates preserve floor object identity), and
      // only rebuild floors that actually changed.
      const { root, meshMap } = sceneCache.build(sceneDescriptor, viewport.materialPalette);
      meshMapRef.current = meshMap;
      viewport.setWorld(root, sceneDescriptor.bounds, sceneDescriptor.groundLevel);
      setSceneBuildId((id) => id + 1);
    };

    const sinceLastBuild = performance.now() - lastBuildAt.current;
    if (sinceLastBuild >= MIN_SCENE_REBUILD_INTERVAL_MS) {
      runBuild();
      return undefined;
    }

    const timer = setTimeout(runBuild, MIN_SCENE_REBUILD_INTERVAL_MS - sinceLastBuild);
    return () => clearTimeout(timer);
  }, [sceneDescriptor]);

  // Selection effect: swap overlay meshes without rebuilding the scene.
  // Re-runs when the selection changes OR when the scene was rebuilt
  // (setWorld clears the overlay, and the meshMap identity changes), so a
  // selected object stays highlighted after an unrelated geometry edit.
  // Keyed on the build counter rather than the descriptor: a throttled
  // descriptor has no meshes yet, and re-highlighting against the previous
  // meshMap would point the overlay at meshes that are about to be replaced.
  useEffect(() => {
    const viewport = viewportRef.current;
    const meshMap = meshMapRef.current;
    if (!viewport || !meshMap) return;

    const overlay = buildSelectionOverlay(meshMap, { selectedId, selectedType }, viewport.materialPalette);
    viewport.setSelectionOverlay(overlay);
  }, [selectedId, selectedType, sceneBuildId]);

  // Aim the key light at the real sun whenever the study or the site moves.
  // Only the sun vector is needed here — the shadows themselves come from the
  // renderer's shadow map, not from the 2D projection.
  const sunLight = useMemo(() => computeSunVector({ project: filteredProject, sunStudy }), [filteredProject, sunStudy]);

  useEffect(() => {
    viewportRef.current?.setSun(sunLight);
  }, [sunLight]);

  useEffect(() => {
    viewportRef.current?.setNavigationMode(navigationMode);
  }, [navigationMode]);

  useEffect(() => {
    viewportRef.current?.setRenderStyle(renderStyle);
    persistRenderStylePreference(renderStyle);
  }, [renderStyle]);

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
      : renderStyle === 'realistic'
        ? 'Realistic: sky lighting, ambient occlusion, soft sun shadows. The image keeps refining for a moment after the camera stops.'
        : 'Shaded: flat drawing view with outlines and the ground grid.';

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
            value={renderStyle}
            onChange={(e) => setRenderStyle(e.target.value)}
            title="Realistic adds sky lighting, ambient occlusion and soft sun shadows; Shaded is the flat drawing view."
            aria-label="Preview render style"
          >
            {Object.entries(RENDER_STYLE_PRESETS).map(([name, preset]) => (
              <option key={name} value={name}>
                {preset.label}
              </option>
            ))}
          </select>
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
          <button type="button" className={styles.button} onClick={() => viewportRef.current?.resetView()}>
            {resetLabel}
          </button>
          {onToggleFocus && (
            <button
              type="button"
              className={`${styles.button} ${styles.iconButton}`}
              onClick={onToggleFocus}
              title={isFocused ? 'Exit focus mode (Esc)' : 'Focus preview — fills the window'}
              aria-label={isFocused ? 'Exit focus mode' : 'Focus preview'}
              aria-pressed={isFocused}
            >
              {isFocused ? <CollapseIcon /> : <ExpandIcon />}
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
