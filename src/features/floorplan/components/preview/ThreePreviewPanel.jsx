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
import {
  RENDER_STYLE_PRESETS,
  persistInteriorLightsPreference,
  persistNightModePreference,
  persistRenderStylePreference,
  persistWalkPhysicsPreference,
  readInteriorLightsPreference,
  readNightModePreference,
  readRenderStylePreference,
  readWalkPhysicsPreference,
} from './renderStyle';
import CompassOverlay from '@/features/floorplan/components/CompassOverlay';
import { ExpandIcon, CollapseIcon } from '@/ui/ToolbarIcons';
import styles from './ThreePreviewPanel.module.css';

// ~15 scene rebuilds a second while the project is changing every frame.
const MIN_SCENE_REBUILD_INTERVAL_MS = 66;

/**
 * `assemblySelection` puts the wall and ceiling detail editors in charge of the
 * highlight: pass `{ kind, id, side }` for the board, member, screw, or hanger
 * that is selected in the drawing, or `null` for nothing. Passing it at all
 * takes the plan's own selection out of the picture — inside an assembly editor
 * the only selection that means anything is the editor's — and `selectionAccent`
 * then decides the colour: green for a plan object, orange for a piece of
 * material. `onAssemblyPick` receives the same shape back when one is clicked
 * here, so the two panes stay on the same piece.
 */
export default function ThreePreviewPanel({
  project,
  activeFloorId,
  isFocused = false,
  onToggleFocus,
  className = '',
  applyPhaseFilter = true,
  assemblySelection,
  selectionAccent = 'plan',
  onAssemblyPick,
}) {
  const assemblyDriven = assemblySelection !== undefined;
  // Taken apart here so the overlay effect depends on three primitives: a caller
  // that rebuilds the selection object every render must not cost a rebuilt
  // overlay every render.
  const assemblyPartKind = assemblySelection?.kind || null;
  const assemblyPartId = assemblySelection?.id || null;
  const assemblyPartSide = assemblySelection?.side || null;
  const viewportRef = useRef(null);
  const containerRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const compassNeedleRef = useRef(null);
  const sceneCacheRef = useRef(null);
  const [previewScope, setPreviewScope] = useState('all');
  const [navigationMode, setNavigationMode] = useState('inspect');
  const [renderStyle, setRenderStyle] = useState(readRenderStylePreference);
  const [interiorLightsOn, setInteriorLightsOn] = useState(readInteriorLightsPreference);
  const [nightMode, setNightMode] = useState(readNightModePreference);
  const [walkUiState, setWalkUiState] = useState(() => ({
    navigationMode: 'inspect',
    isLocked: false,
    canLock: false,
    physicsMode: readWalkPhysicsPreference(),
  }));
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
        // An assembly editor is looking at one wall or one ceiling from a metre
        // away, so it gets the parts a whole-building view cannot afford —
        // every ceiling screw. Same switch as the selection: this pane belongs
        // to an editor, so it draws what the editor is editing.
        assemblyDetail: assemblyDriven,
      }),
    [filteredProject, activeFloorId, visibleFloorIds, hiddenWallBoards, assemblyDriven],
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
      // Inside an assembly editor a click is about the piece of material, not
      // about the wall or ceiling it belongs to, and the plan's selection is no
      // business of this pane. A part-less mesh there — the odd support beam
      // kept for context — clears the selection rather than selecting the beam.
      if (assemblyDriven) {
        onAssemblyPick?.(target?.part || null);
        return;
      }

      if (!target?.sourceId || !target?.kind) {
        editorDispatch({ type: 'DESELECT' });
        return;
      }

      if (target.floorId && target.floorId !== activeFloorId) {
        editorDispatch({ type: 'SET_ACTIVE_FLOOR', floorId: target.floorId });
      }

      editorDispatch({ type: 'SELECT_OBJECT', id: target.sourceId, objectType: target.kind });
    },
    [activeFloorId, assemblyDriven, editorDispatch, onAssemblyPick],
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
    viewportRef.current?.setWalkPhysicsMode(readWalkPhysicsPreference());
    viewportRef.current?.setWalkUiHandler(setWalkUiState);
    viewportRef.current?.setWalkExitHandler(() => {
      setNavigationMode('inspect');
    });
  }, []);

  // The viewport owns the mode (the C key toggles it mid-walk); the panel just
  // mirrors it into storage.
  useEffect(() => {
    persistWalkPhysicsPreference(walkUiState.physicsMode);
  }, [walkUiState.physicsMode]);

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

    const selection = assemblyDriven
      ? { part: assemblyPartId ? { kind: assemblyPartKind, id: assemblyPartId, side: assemblyPartSide } : null }
      : { selectedId, selectedType };
    const overlay = buildSelectionOverlay(meshMap, selection, viewport.materialPalette, selectionAccent);
    viewport.setSelectionOverlay(overlay);
  }, [
    assemblyDriven,
    assemblyPartKind,
    assemblyPartId,
    assemblyPartSide,
    selectedId,
    selectedType,
    selectionAccent,
    sceneBuildId,
  ]);

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
    viewportRef.current?.setInteriorLighting({ lightsOn: interiorLightsOn, night: nightMode });
    persistInteriorLightsPreference(interiorLightsOn);
    persistNightModePreference(nightMode);
  }, [interiorLightsOn, nightMode]);

  useEffect(() => {
    viewportRef.current?.setActiveFloorContext(walkFloorContext);
  }, [walkFloorContext]);

  const resetLabel = navigationMode === 'walk' ? 'Reset Walk' : 'Reset View';
  const walkPhysicsOn = walkUiState.physicsMode;
  const walkControlsHint = walkPhysicsOn
    ? 'Walk: W/A/S/D · Jump: Space · Run: Shift · No-clip: C · Exit: Esc'
    : 'Fly: W/A/S/D · Up/Down: R/F · Faster: Shift · Physics: C · Exit: Esc';
  const primaryFooter =
    navigationMode === 'walk'
      ? walkUiState.isLocked
        ? `Look: mouse · ${walkControlsHint}`
        : `Click preview to capture mouse · ${walkControlsHint}`
      : 'Orbit: drag · Pan: right drag · Zoom: wheel · Inspect: click object';
  const secondaryFooter =
    navigationMode === 'walk'
      ? walkPhysicsOn
        ? 'Physical walk: gravity holds you to the floors, walls are solid, and the stairs are how you change levels.'
        : 'No-clip flight: free movement through anything. Press C to land back in the physical walk.'
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
          <div className={styles.modeToggle} role="group" aria-label="Preview interior lighting">
            <button
              type="button"
              className={interiorLightsOn ? styles.modeButtonActive : styles.modeButton}
              onClick={() => setInteriorLightsOn((on) => !on)}
              title="Switch the ceiling light fixtures on or off in the preview"
              aria-pressed={interiorLightsOn}
            >
              Lights
            </button>
            <button
              type="button"
              className={nightMode ? styles.modeButtonActive : styles.modeButton}
              onClick={() => setNightMode((on) => !on)}
              title="Night: no sun and no daylight, so the fixtures light the model on their own"
              aria-pressed={nightMode}
            >
              Night
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
            <div className={styles.walkModeRow} role="group" aria-label="Walk collision mode">
              <button
                type="button"
                className={walkPhysicsOn ? styles.walkModeButtonActive : styles.walkModeButton}
                onClick={() => viewportRef.current?.setWalkPhysicsMode(true)}
                aria-pressed={walkPhysicsOn}
                title="Physical walk: gravity, solid walls and floors, stairs, jumping"
              >
                Physical
              </button>
              <button
                type="button"
                className={!walkPhysicsOn ? styles.walkModeButtonActive : styles.walkModeButton}
                onClick={() => viewportRef.current?.setWalkPhysicsMode(false)}
                aria-pressed={!walkPhysicsOn}
                title="No-clip: free flight through walls and floors"
              >
                No-clip
              </button>
            </div>
            <span className={styles.walkOverlayBody}>
              {walkUiState.isLocked
                ? walkPhysicsOn
                  ? 'W/A/S/D walk, Space jumps, Shift runs, and the stairs take you between floors. Step off an open slab edge and you will fall. C switches to no-clip, Esc exits.'
                  : 'Noclip flight is live. W/S follow the camera view, A/D strafe, R/F move up and down, Shift goes faster. C drops you back into the physical walk, Esc exits.'
                : walkPhysicsOn
                  ? 'Click inside the preview to capture the mouse, then walk the building on foot — gravity, walls and stairs are real here.'
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
