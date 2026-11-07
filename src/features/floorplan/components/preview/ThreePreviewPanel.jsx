import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditorState } from '@/features/floorplan/context/FloorplanContext';
import { filterProjectByPhase } from '@/domain/phaseFilter';
import { buildPreviewScene } from '@/three/scene/buildPreviewScene';
import { buildSelectionOverlay } from './buildPreviewObjects';
import { createPreviewSceneCache } from './previewSceneCache';
import { resolveLightPoolPolicy } from './fixtureLightPool';
import { createPreviewViewport } from './createPreviewViewport';
import { previewPickHit } from './previewPick';
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
import { CameraIcon, ExpandIcon, CollapseIcon } from '@/ui/ToolbarIcons';
import { VIEW_PRESET_OPTIONS } from './previewCameraMath';
import { PALETTE_LOOKS } from './materials';
import { resolveRoofAppearance } from '@/domain/roofCoveringCatalog';
import { isTypingTarget } from '@/utils/keyboard';
import {
  DEFAULT_VIEW_MODE,
  VIEW_MODES,
  VIEW_MODE_COPY,
  VIEW_MODE_ORDER,
  imageFileSuffix,
  isSeeThrough,
  nextViewMode,
} from './viewMode';
import { LOADING_COPY, LoadingBar, LoadingPill, PanePlaceholder, Spinner, useDelayedFlag } from '@/ui/loading';
import styles from './ThreePreviewPanel.module.css';

// ~15 scene rebuilds a second while the project is changing every frame.
const MIN_SCENE_REBUILD_INTERVAL_MS = 66;

/**
 * `My House` + `iso_northeast` → `my-house-iso_northeast.png`, and
 * `my-house-iso_northeast-xray.png` for a picture taken in X-ray.
 */
function imageFileName(projectName, viewPreset, viewMode = DEFAULT_VIEW_MODE) {
  const base =
    String(projectName || 'model')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'model';
  return `${base}-${viewPreset || 'view'}${imageFileSuffix(viewMode)}.png`;
}

/**
 * Hand a data URL to the browser as a download. A plain anchor works the same
 * in the browser and in the desktop shell, and needs nothing from the network.
 */
function downloadDataUrl(dataUrl, fileName) {
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/**
 * The project as it stood when the pane went to sleep, for as long as it sleeps.
 *
 * Gating the rebuild effect stops a sleeping pane building geometry it cannot
 * show; this stops the work one level above that. The scene descriptor is
 * memoised on the project, so without the hold every edit committed behind the
 * overlay rebuilds the whole building's descriptors for an answer nobody reads,
 * and re-runs the sun effect — a traversal of the world root — on the way past.
 * On the playground project that lands inside the noise of a single commit, and
 * it is here anyway: a suspended pane doing arithmetic on a project it cannot
 * draw is a bug waiting for a bigger building.
 *
 * Captured on the edge into suspension rather than tracked continuously, so the
 * awake path — the one a plan drag runs fifteen times a second — does no state
 * work at all and hands back the live value untouched. Waking returns to the
 * live project, and it is that change which asks for the one catch-up build.
 */
function useHeldWhileSuspended(value, suspended) {
  const [snapshot, setSnapshot] = useState({ suspended, value });

  if (snapshot.suspended !== suspended) {
    setSnapshot({ suspended, value });
  }

  return suspended ? snapshot.value : value;
}

/**
 * `assemblySelection` puts the wall and ceiling detail editors in charge of the
 * highlight: pass `{ kind, id, side }` for the board, member, screw, or hanger
 * that is selected in the drawing, or `null` for nothing. Passing it at all
 * takes the plan's own selection out of the picture — inside an assembly editor
 * the only selection that means anything is the editor's — and `selectionAccent`
 * then decides the colour: green for a plan object, orange for a piece of
 * material. `onAssemblyPick` receives the same shape back when one is clicked
 * here, so the two panes stay on the same piece.
 *
 * `suspended` is for the pane that is still mounted but no longer on screen —
 * the main workspace's preview while a wall or ceiling detail editor is open
 * over the top of it. It stops rebuilding scenes and stops asking for frames,
 * without unmounting, so the camera and the walk pose survive the overlay; the
 * edits made behind it are caught up in one rebuild when it comes back.
 *
 * Until its first picture is on the canvas the pane is covered by a
 * placeholder (docs/loading-states.md §5.2, §5.4): `loadingLabel` while the
 * scene is built, `compilingLabel` while its programs link, `loadingDetail`
 * from 2 s, the caller's `silhouette` breathing underneath, and `loadingSince`
 * so the timeline carries on from the Suspense fallback the caller showed
 * first. `paneKind` names the pane for scripts (`data-preview-pane`), and
 * `placeholderTone` matches the ground the picture will arrive on.
 */
function ThreePreviewPanelBody({
  onRetryViewport,
  project,
  activeFloorId,
  isFocused = false,
  onToggleFocus,
  className = '',
  applyPhaseFilter = true,
  assemblySelection,
  selectionAccent = 'plan',
  onAssemblyPick,
  suspended = false,
  paneKind = 'model',
  loadingLabel = LOADING_COPY.mainPreview,
  compilingLabel,
  loadingDetail,
  silhouette = null,
  loadingSince,
  placeholderTone = 'dark',
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
  // Fixed for the pane's life, like the viewport it is built into: an assembly
  // editor's pane keeps the classic palette, every model view is the white model.
  const lookRef = useRef(assemblyDriven ? PALETTE_LOOKS.CLASSIC : PALETTE_LOOKS.WHITE_MODEL);
  const resizeObserverRef = useRef(null);
  const compassNeedleRef = useRef(null);
  const sceneCacheRef = useRef(null);
  // Read once, at mount, like the look: the scene cache is built with it and
  // lives as long as the viewport does. An assembly editor's pane is pre-warmed
  // for its first lamps; the model views pay nothing until they have one.
  const lightPoolKindRef = useRef(assemblyDriven ? 'assembly' : 'model');
  const [previewScope, setPreviewScope] = useState('all');
  const [navigationMode, setNavigationMode] = useState('inspect');
  const [renderStyle, setRenderStyle] = useState(readRenderStylePreference);
  const [interiorLightsOn, setInteriorLightsOn] = useState(readInteriorLightsPreference);
  const [nightMode, setNightMode] = useState(readNightModePreference);
  // Solid / X-ray / Wireframe. Pane-local and never persisted, like the floor
  // scope: every pane opens solid, and an assembly pane keeps its own.
  const [viewMode, setViewMode] = useState(DEFAULT_VIEW_MODE);
  const sectionRef = useRef(null);
  // Whether the pointer is over the picture, for the X / Shift+X keys.
  const hoveredRef = useRef(false);
  // Which View preset is on screen. The viewport reports back when an orbit
  // takes the camera off it, so the menu never claims a view you have left.
  const [viewPreset, setViewPreset] = useState('free');
  // Whether the progressive refine has finished; Save image waits for it.
  const [refined, setRefined] = useState(false);
  // The viewport's road to a first picture (see `setLoadStatusHandler`).
  // `presented` latches: after the first frame, a rebuild keeps the model on
  // screen and only says it is catching up.
  const [loadStatus, setLoadStatus] = useState({ phase: 'building', parallelShaderCompile: true });
  const [presented, setPresented] = useState(false);
  const [viewportError, setViewportError] = useState(null);
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
    hiddenCeilingBoards,
    dispatch: editorDispatch,
  } = useEditorState();

  const awakeProject = useHeldWhileSuspended(project, suspended);

  const filteredProject = useMemo(
    () => (applyPhaseFilter ? filterProjectByPhase(awakeProject, activePhaseId, phaseViewMode) : awakeProject),
    [awakeProject, activePhaseId, phaseViewMode, applyPhaseFilter],
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
        // An assembly editor's pane draws the wall or ceiling it is editing and
        // keeps its own layer switches for what to leave out, so the plan's
        // "strip the boards and look at the frame" must not follow the object
        // in here — the preview project reuses the real wall/ceiling id, and
        // passing these would silently unboard the drawing being worked on.
        hiddenWallBoards: assemblyDriven ? undefined : hiddenWallBoards,
        hiddenCeilingBoards: assemblyDriven ? undefined : hiddenCeilingBoards,
        // An assembly editor is looking at one wall or one ceiling from a metre
        // away, so it gets the parts a whole-building view cannot afford —
        // every ceiling screw. Same switch as the selection: this pane belongs
        // to an editor, so it draws what the editor is editing.
        assemblyDetail: assemblyDriven,
      }),
    [filteredProject, activeFloorId, visibleFloorIds, hiddenWallBoards, hiddenCeilingBoards, assemblyDriven],
  );

  const activeFloor = useMemo(
    () => (project?.floors || []).find((floor) => floor.id === activeFloorId) || null,
    [project?.floors, activeFloorId],
  );
  // A walk over every object in the scene, for two numbers in the status line.
  // Keyed on the descriptor, which is already the thing that changes when the
  // counts do.
  const { visibleCount, visibleFloorCount } = useMemo(() => {
    let objects = 0;
    let floors = 0;
    for (const floor of sceneDescriptor.floors) {
      if (!floor.visible) continue;
      objects += floor.objects.length;
      if (floor.floorId !== sceneDescriptor.roofLayerId) floors += 1;
    }
    return { visibleCount: objects, visibleFloorCount: floors };
  }, [sceneDescriptor]);
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
    (target, hit) => {
      // Inside an assembly editor a click is about the piece of material, not
      // about the wall or ceiling it belongs to, and the plan's selection is no
      // business of this pane. A part-less mesh there — the odd support beam
      // kept for context — clears the selection rather than selecting the beam.
      // The second argument says where the click landed, in plan terms, for an
      // editor that places things from here (the ceiling editor's Light tool).
      if (assemblyDriven) {
        onAssemblyPick?.(target?.part || null, previewPickHit(target, hit));
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

    let viewport;
    try {
      viewport = createPreviewViewport(containerRef.current, { look: lookRef.current });
    } catch (error) {
      // No WebGL context (blocked, lost, or a driver three refuses): the
      // placeholder becomes the error instead of a box that never fills.
      console.warn('[preview] Could not start the 3D viewport:', error);
      queueMicrotask(() => setViewportError(error));
      return undefined;
    }
    viewportRef.current = viewport;
    sceneCacheRef.current = createPreviewSceneCache({ lightPool: resolveLightPoolPolicy(lightPoolKindRef.current) });

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

  // The roof's colours are a palette mutation, not part of the scene build, so
  // a colour change never re-triangulates anything. Keyed on the primitives:
  // the roof object is re-normalized on every edit, its colours rarely change.
  // Runs right after the viewport is created on mount (effects run in order),
  // so the first frame already carries the project's colours. An assembly
  // editor's pane keeps the classic palette untouched.
  // The gable-end infill colour lives on the truss systems (RT-2), so they
  // key the memo too.
  const roofAppearanceSource = assemblyDriven ? null : project?.roofSystem || null;
  const closureAppearanceSource = assemblyDriven ? null : project?.trussSystems || null;
  const roofAppearanceKey = useMemo(() => {
    const appearance = resolveRoofAppearance(roofAppearanceSource, closureAppearanceSource || []);
    return appearance ? JSON.stringify(appearance) : '';
  }, [roofAppearanceSource, closureAppearanceSource]);
  const roofAppearance = useMemo(() => (roofAppearanceKey ? JSON.parse(roofAppearanceKey) : null), [roofAppearanceKey]);
  const roofColourHex = roofAppearance?.covering?.hex;
  const closureColourHex = roofAppearance?.closures?.[0]?.hex;

  useEffect(() => {
    if (!roofAppearanceKey) return;
    viewportRef.current?.applyRoofAppearance(JSON.parse(roofAppearanceKey));
  }, [roofAppearanceKey]);

  useEffect(() => {
    viewportRef.current?.setPickHandler(handlePreviewPick);
  }, [handlePreviewPick]);

  useEffect(() => {
    const viewport = viewportRef.current;
    viewport?.setViewPresetHandler(setViewPreset);
    viewport?.setRenderStatusHandler(({ converged }) => setRefined(converged));
    viewport?.setLoadStatusHandler((status) => {
      setLoadStatus(status);
      if (status.phase === 'ready') setPresented(true);
    });
    return () => {
      viewport?.setViewPresetHandler(null);
      viewport?.setRenderStatusHandler(null);
      viewport?.setLoadStatusHandler(null);
    };
  }, []);

  const handleViewPresetChange = useCallback(
    (nextPreset) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      // A preset is an inspect-mode view: choosing one steps out of the walk.
      if (navigationMode !== 'inspect') {
        viewport.setNavigationMode('inspect');
        setNavigationMode('inspect');
      }
      viewport.setViewPreset(nextPreset);
      setViewPreset(viewport.getViewPreset());
    },
    [navigationMode],
  );

  const handleSaveImage = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const dataUrl = viewport.captureImage();
    if (!dataUrl) return;
    downloadDataUrl(dataUrl, imageFileName(project?.name, viewPreset, viewMode));
  }, [project?.name, viewPreset, viewMode]);

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
    // A suspended pane holds its project still, so this effect rarely has
    // anything to say while it is asleep — but the floor, the scope and the
    // board switches are not part of that hold, and one of them changing behind
    // an overlay must not rebuild a scene nobody is looking at. `suspended` is
    // a dependency, so waking up re-runs this and the catch-up build happens
    // then, once, for whatever the total of those changes came to.
    if (suspended) return undefined;

    const runBuild = () => {
      lastBuildAt.current = performance.now();
      // Incremental build: reuse THREE groups for floors whose source geometry is
      // unchanged (immutable reducer updates preserve floor object identity), and
      // only rebuild floors that actually changed.
      const { root, batchRoot, meshMap, lightsChanged } = sceneCache.build(sceneDescriptor, viewport.materialPalette);
      meshMapRef.current = meshMap;
      viewport.setWorld(root, sceneDescriptor.bounds, sceneDescriptor.groundLevel, { batchRoot, lightsChanged });
      setSceneBuildId((id) => id + 1);
    };

    const sinceLastBuild = performance.now() - lastBuildAt.current;
    if (sinceLastBuild >= MIN_SCENE_REBUILD_INTERVAL_MS) {
      runBuild();
      return undefined;
    }

    const timer = setTimeout(runBuild, MIN_SCENE_REBUILD_INTERVAL_MS - sinceLastBuild);
    return () => clearTimeout(timer);
  }, [sceneDescriptor, suspended]);

  // After the rebuild effect, deliberately: going to sleep has to cancel the
  // frame the build above may just have asked for, and waking has to ask for
  // one after the world it is going to draw has been put back.
  useEffect(() => {
    viewportRef.current?.setSuspended(suspended);
  }, [suspended]);

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
    viewportRef.current?.setViewMode?.(viewMode);
  }, [viewMode]);

  /*
   * X toggles X-ray, Shift+X toggles Wireframe (§3.9) — while the pointer is
   * over the picture, the pane holds focus, or the walk holds the mouse. Never
   * while typing, never with Ctrl/Cmd/Alt (Ctrl+X is the plan's cut), and never
   * from a pane that is asleep under an assembly editor.
   */
  const walkLocked = walkUiState.isLocked;
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (suspended || event.repeat) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (String(event.key).toLowerCase() !== 'x') return;
      if (isTypingTarget(event.target)) return;
      const section = sectionRef.current;
      const focused = Boolean(section && document.activeElement && section.contains(document.activeElement));
      if (!hoveredRef.current && !focused && !walkLocked) return;
      event.preventDefault();
      setViewMode((mode) => nextViewMode(mode, { wireframe: event.shiftKey }));
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [suspended, walkLocked]);

  useEffect(() => {
    viewportRef.current?.setInteriorLighting({ lightsOn: interiorLightsOn, night: nightMode });
    persistInteriorLightsPreference(interiorLightsOn);
    persistNightModePreference(nightMode);
  }, [interiorLightsOn, nightMode]);

  useEffect(() => {
    viewportRef.current?.setActiveFloorContext(walkFloorContext);
  }, [walkFloorContext]);

  /*
   * Loading, in the order the pane goes through it. Before the first picture:
   * the placeholder, its words naming the build and then the compile. After
   * it: a woken pane re-drawing the edits made behind an overlay keeps the old
   * picture up under a thin bar, with words only if it takes a while.
   */
  const firstPictureState = viewportError
    ? 'error'
    : presented
      ? 'ready'
      : loadStatus.phase === 'compiling'
        ? 'compiling'
        : 'loading';
  const placeholderLabel =
    firstPictureState === 'compiling' ? compilingLabel || loadingLabel : loadingLabel || LOADING_COPY.mainPreview;
  const placeholderDetail =
    firstPictureState === 'compiling' && !loadStatus.parallelShaderCompile
      ? LOADING_COPY.mainThreadCompile
      : loadingDetail;
  const catchingUp = presented && !suspended && (loadStatus.phase === 'waking' || loadStatus.phase === 'compiling');
  // Realistic keeps refining after the camera stops; say so, but not for the
  // moment-long restarts an orbit causes.
  const refining = useDelayedFlag(presented && renderStyle === 'realistic' && !refined, {
    delayMs: 300,
    minVisibleMs: 400,
  });

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
  const viewModeCopy = VIEW_MODE_COPY[viewMode] || VIEW_MODE_COPY[VIEW_MODES.SOLID];
  const secondaryFooter =
    navigationMode === 'walk'
      ? walkPhysicsOn
        ? 'Physical walk: gravity holds you to the floors, walls are solid, and the stairs are how you change levels.'
        : 'No-clip flight: free movement through anything. Press C to land back in the physical walk.'
      : isSeeThrough(viewMode)
        ? viewModeCopy.footer
        : renderStyle === 'realistic'
          ? 'Realistic: sky lighting, ambient occlusion, soft sun shadows. The image keeps refining for a moment after the camera stops.'
          : 'Shaded: flat drawing view with outlines and the ground grid.';

  return (
    <section
      ref={sectionRef}
      className={`${styles.panel} ${className}`}
      data-preview-pane={paneKind}
      data-view-mode={viewMode}
      data-loading-state={firstPictureState}
      aria-busy={firstPictureState === 'ready' || firstPictureState === 'error' ? 'false' : 'true'}
      data-roof-colour={roofColourHex}
      data-closure-colour={closureColourHex}
    >
      <div className={`${styles.header} ${isFocused ? styles.headerFocused : ''}`}>
        <div className={styles.titleGroup}>
          <span className={styles.eyebrow}>3D Preview</span>
          <span className={styles.title}>
            {activeFloor
              ? `${visibleFloorCount === 1 ? '1 floor' : `${visibleFloorCount} floors`} · ${visibleCount} objects${viewModeCopy.titleSuffix}`
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
          <div className={styles.modeToggle} role="group" aria-label={VIEW_MODE_COPY.groupLabel}>
            {VIEW_MODE_ORDER.map((mode) => (
              <button
                key={mode}
                type="button"
                className={viewMode === mode ? styles.modeButtonActive : styles.modeButton}
                onClick={() => setViewMode(mode)}
                title={VIEW_MODE_COPY[mode].title}
                aria-label={VIEW_MODE_COPY[mode].name}
                aria-pressed={viewMode === mode}
              >
                {VIEW_MODE_COPY[mode].label}
              </button>
            ))}
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
          {/* An assembly editor's pane is a working view of one wall or ceiling:
              the presentation presets and Save image belong to the model views. */}
          {!assemblyDriven ? (
            <select
              className={styles.viewSelect}
              value={viewPreset}
              onChange={(e) => handleViewPresetChange(e.target.value)}
              title="Iso views look at the model from a corner; Front, Rear, Left and Right are true orthographic elevations."
              aria-label="Preview view preset"
            >
              {VIEW_PRESET_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          ) : null}
          <button type="button" className={styles.button} onClick={() => viewportRef.current?.resetView()}>
            {resetLabel}
          </button>
          {!assemblyDriven ? (
            <button
              type="button"
              className={`${styles.button} ${styles.saveImageButton}`}
              onClick={handleSaveImage}
              disabled={!refined || !sceneDescriptor.hasVisibleObjects}
              title={refined ? 'Save the picture on screen as a PNG' : LOADING_COPY.refiningTooltip}
              aria-label="Save image"
            >
              <CameraIcon />
              <span>Save image</span>
            </button>
          ) : null}
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

      <div
        className={`${styles.viewportWrap} ${isFocused ? styles.viewportWrapFocused : ''}`}
        // Focusable from a click, never by Tab, so the X key keeps working
        // after the pointer has left the picture for the pane's own controls.
        tabIndex={-1}
        onPointerDown={(event) => {
          // Explicitly: the orbit controls take the pointer, and a canvas that
          // swallows the press may leave focus wherever it was.
          if (!event.currentTarget.contains(document.activeElement)) {
            event.currentTarget.focus({ preventScroll: true });
          }
        }}
        onPointerEnter={() => {
          hoveredRef.current = true;
        }}
        onPointerLeave={() => {
          hoveredRef.current = false;
        }}
      >
        <div ref={containerRef} className={styles.viewport} />
        <PanePlaceholder
          overlay
          tone={placeholderTone}
          active={firstPictureState !== 'ready'}
          state={firstPictureState === 'ready' ? 'loading' : firstPictureState}
          label={placeholderLabel}
          detail={placeholderDetail}
          showDetail={firstPictureState === 'compiling' && Boolean(placeholderDetail)}
          silhouette={silhouette}
          since={loadingSince}
          error={viewportError ? { message: LOADING_COPY.previewFailed, onRetry: onRetryViewport } : null}
        />
        <LoadingBar active={catchingUp} placement="region" tone={placeholderTone} />
        <LoadingPill active={catchingUp} label={LOADING_COPY.catchingUp} placement="region" tone={placeholderTone} />
        <CompassOverlay className={styles.compassDock} needleRef={compassNeedleRef} />
        {/* Over the picture, not in the footer: anything that changed the pane's
            size would restart the very refine it reports on. */}
        {refining ? (
          <span className={styles.refining} role="status">
            <Spinner />
            {LOADING_COPY.refining}
          </span>
        ) : null}
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

/*
 * "Try again" after a failed start remounts the whole pane: every effect that
 * wires the viewport up runs once per mount, so a fresh mount is the only
 * honest retry.
 */
function ThreePreviewPanel(props) {
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return <ThreePreviewPanelBody key={attempt} {...props} onRetryViewport={retry} />;
}

export default memo(ThreePreviewPanel);
