import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import * as THREE from 'three';
import { useSketch } from '../app/SketchProvider';
import { useSketchEditor } from '../app/SketchEditorProvider';
import { buildSketchPreviewRoot } from './buildSketchPreview';
import { getSketchInspection } from './sketchPreviewInspection';
import { createPreviewViewport } from '@/three/viewer/createPreviewViewport';
import { disposeScene } from '@/three/viewer/disposeScene';
import { create3dHandler } from '../editor/handlers3d/index';
import { createSelectHandler3d } from '../editor/handlers3d/selectHandler3d';
import { createDrawingPlaneOverlay } from './DrawingPlaneOverlay';
import { createExtrusionPreview } from './ExtrusionPreview';
import { createSnapOverlay } from './SnapOverlay';
import { createAxisIndicator } from './AxisIndicator';
import { createTransformGizmo } from './TransformGizmo';
import { createInferenceCache } from '../editor/inferenceCache';
import { GROUND_PLANE, cameraPlaneFromDirection } from '../domain/drawingPlane';
import { getPartCorners } from '../domain/partGeometry';
import { CONSTRUCTION_ANNOTATION_TYPES, getConstructionAnnotations, signedDistanceToPlane } from '../domain/constructionModels';
import { SKETCH_TOOL_SHORTCUTS } from '../editor/tools';
import CompassOverlay from '@/ui/CompassOverlay';
import styles from './SketchViewport.module.css';

/**
 * Primary 3D editing viewport.
 * Wraps createPreviewViewport with tool event routing, raycasting, and overlays.
 */
export default function SketchViewport() {
  const containerRef = useRef(null);
  const viewportRef = useRef(null);
  const rootRef = useRef(null);
  const overlayRef = useRef(null);
  const extrusionPreviewRef = useRef(null);
  const snapOverlayRef = useRef(null);
  const transformGizmoRef = useRef(null);
  const inferenceCacheRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const compassNeedleRef = useRef(null);
  const movementPlaneRef = useRef(null);
  const pointerDownRef = useRef(null);
  const navigationModifierRef = useRef(false);
  const moveModifierRef = useRef(false);
  const moveDragRoutingRef = useRef(false);

  const { project, dispatch } = useSketch();
  const {
    activeTool, selectedId, selectedType, toolState,
    activeAssemblyId, snapEnabled, statusMessage,
    drawingPlane, planeMode, planeLocked, emptyStateDismissed, clipboard,
    dispatch: editorDispatch,
  } = useSketchEditor();

  const [cursorCoords, setCursorCoords] = useState({ x: 0, y: 0, z: 0 });
  const [navigationModifierActive, setNavigationModifierActive] = useState(false);
  const [moveModifierActive, setMoveModifierActive] = useState(false);

  // Create inference cache (stable ref)
  if (!inferenceCacheRef.current) {
    inferenceCacheRef.current = createInferenceCache();
  }

  const inspection = useMemo(
    () => getSketchInspection(project, selectedId, selectedType),
    [project, selectedId, selectedType]
  );
  const toolInteractionActive = !!(
    toolState.dragging
    || toolState.drawing
    || toolState.drawingProfile
    || toolState.drawingGuideLine
    || toolState.drawingLine
    || toolState.drawingFreeform
    || toolState.extruding
    || toolState.moving
    || toolState.rotating
    || toolState.measuring
    || toolState.pasting
  );

  // Build the 3D tool handler — pass inferenceCache
  const tool = useMemo(() => {
    return create3dHandler({
      dispatch,
      editorDispatch,
      project,
      activeTool,
      activeAssemblyId,
      snapEnabled,
      selectedId,
      selectedType,
      drawingPlane: drawingPlane || GROUND_PLANE,
      inferenceCache: snapEnabled ? inferenceCacheRef.current : null,
    });
  }, [dispatch, editorDispatch, project, activeTool, activeAssemblyId, snapEnabled, selectedId, selectedType, drawingPlane]);
  const moveTool = useMemo(() => {
    return createSelectHandler3d({
      dispatch,
      editorDispatch,
      project,
      activeAssemblyId,
      snapEnabled,
      selectedId,
      selectedType,
      inferenceCache: snapEnabled ? inferenceCacheRef.current : null,
    });
  }, [dispatch, editorDispatch, project, activeAssemblyId, snapEnabled, selectedId, selectedType]);

  const constructionAnnotations = useMemo(
    () => getConstructionAnnotations(project.annotations || []),
    [project.annotations]
  );
  const activeSectionPlanes = useMemo(
    () => constructionAnnotations.filter((annotation) => (
      annotation.type === CONSTRUCTION_ANNOTATION_TYPES.SECTION_PLANE
      && annotation.visible !== false
      && annotation.enabled !== false
    )),
    [constructionAnnotations]
  );

  // Parts visible in 3D
  const visibleParts = useMemo(() => {
    return project.parts.filter(
      (part) => (
        part.type !== 'cutout'
        && part.type !== 'hole'
        && isPartVisibleForSections(part, activeSectionPlanes)
      )
    );
  }, [project.parts, activeSectionPlanes]);

  // Initialize viewport
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const viewport = createPreviewViewport(container);
    viewport.setNavigationMode('inspect');
    viewport.setInspectLeftButtonRotateEnabled(navigationModifierRef.current);
    viewport.setNavigationModifierActive(navigationModifierRef.current);
    viewportRef.current = viewport;

    // Drawing plane overlay
    const overlay = createDrawingPlaneOverlay();
    overlayRef.current = overlay;

    // Extrusion preview
    const extPreview = createExtrusionPreview();
    extrusionPreviewRef.current = extPreview;

    // Snap overlay
    const snapOvl = createSnapOverlay();
    snapOverlayRef.current = snapOvl;

    // Axis indicator (corner gizmo)
    const axisInd = createAxisIndicator();
    viewport.setAxisIndicator(axisInd);

    // Transform gizmo
    const transformGiz = createTransformGizmo();
    transformGizmoRef.current = transformGiz;

    if ('ResizeObserver' in window) {
      const observer = new ResizeObserver(() => viewport.resize());
      observer.observe(container);
      resizeObserverRef.current = observer;
    }

    viewport.setCompassHeadingHandler((headingDeg) => {
      if (!compassNeedleRef.current) return;
      compassNeedleRef.current.style.setProperty('--compass-heading', `${headingDeg}deg`);
    });

    // Disable the built-in pick handler since we handle our own events
    viewport.setPickHandler(null);
    viewport.resize();

    // Listen for camera preset events from toolbar
    const handleCameraPreset = (e) => {
      const { preset } = e.detail || {};
      if (preset && viewport.setProjectionPreset) {
        viewport.setProjectionPreset(preset);
      }
    };
    window.addEventListener('sketch-camera-preset', handleCameraPreset);

    return () => {
      window.removeEventListener('sketch-camera-preset', handleCameraPreset);
      resizeObserverRef.current?.disconnect?.();
      resizeObserverRef.current = null;
      overlay.dispose();
      extPreview.dispose();
      snapOvl.dispose();
      axisInd.dispose();
      transformGiz.dispose();
      if (rootRef.current) {
        disposeScene(rootRef.current, { disposeMaterials: true });
        rootRef.current = null;
      }
      viewport.dispose();
      viewportRef.current = null;
    };
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.setNavigationModifierActive(navigationModifierActive);
    viewport.setInspectLeftButtonRotateEnabled(navigationModifierActive);
  }, [navigationModifierActive]);

  useEffect(() => {
    if (!toolInteractionActive || !navigationModifierRef.current) return;
    navigationModifierRef.current = false;
    setNavigationModifierActive(false);
  }, [toolInteractionActive]);

  useEffect(() => {
    const setModifierState = (active) => {
      if (navigationModifierRef.current === active) return;
      navigationModifierRef.current = active;
      viewportRef.current?.setNavigationModifierActive(active);
      viewportRef.current?.setInspectLeftButtonRotateEnabled(active);
      setNavigationModifierActive(active);
    };

    const handleKeyDown = (e) => {
      if (e.code !== 'Space' || isEditableEventTarget(e.target)) return;
      e.preventDefault();
      if (!toolInteractionActive) {
        setModifierState(true);
      }
    };

    const handleKeyUp = (e) => {
      if (e.code !== 'Space') return;
      setModifierState(false);
    };

    const handleWindowBlur = () => {
      setModifierState(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [toolInteractionActive]);

  useEffect(() => {
    const setMoveState = (active) => {
      if (moveModifierRef.current === active) return;
      moveModifierRef.current = active;
      setMoveModifierActive(active);
    };

    const handleKeyDown = (e) => {
      if (isEditableEventTarget(e.target)) return;
      if (e.key === 'Control' || e.ctrlKey) {
        setMoveState(true);
      }
    };

    const handleKeyUp = (e) => {
      if (e.key === 'Control') {
        setMoveState(false);
      }
    };

    const handleWindowBlur = () => {
      setMoveState(false);
      moveDragRoutingRef.current = false;
      if (toolState.dragging && (toolState.dragPartId || toolState.dragAssemblyId || toolState.dragObjectId)) {
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: {
            dragging: false,
            startPoint: null,
            dragPartId: null,
            dragAssemblyId: null,
            dragObjectId: null,
            snapResult: null,
          },
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [editorDispatch, toolState.dragging, toolState.dragPartId, toolState.dragAssemblyId, toolState.dragObjectId]);

  // Rebuild scene when parts or selection change
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    if (rootRef.current) {
      disposeScene(rootRef.current, { disposeMaterials: true });
    }

    const root = buildSketchPreviewRoot(
      visibleParts,
      { selectedId, selectedType },
      constructionAnnotations
    );
    rootRef.current = root;

    // Add overlay groups to root
    if (overlayRef.current) {
      root.add(overlayRef.current.group);
    }
    if (extrusionPreviewRef.current) {
      root.add(extrusionPreviewRef.current.group);
    }
    if (snapOverlayRef.current) {
      root.add(snapOverlayRef.current.group);
    }
    if (transformGizmoRef.current) {
      root.add(transformGizmoRef.current.group);
    }

    const box = new THREE.Box3();
    root.updateMatrixWorld(true);
    let hasGeometryBounds = false;
    root.children.forEach((child) => {
      if (child.userData?.previewTarget?.kind === 'part') {
        box.expandByObject(child);
        hasGeometryBounds = true;
      }
    });

    if (!hasGeometryBounds) {
      box.expandByObject(root);
    }

    if (box.isEmpty()) {
      box.set(
        new THREE.Vector3(-500, 0, -300),
        new THREE.Vector3(500, 800, 300)
      );
    }

    viewport.setWorld(root, {
      min: { x: box.min.x, y: box.min.y, z: box.min.z },
      max: { x: box.max.x, y: box.max.y, z: box.max.z },
    }, 0);
  }, [visibleParts, selectedId, selectedType, constructionAnnotations]);

  // Update drawing plane overlay
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    const plane = drawingPlane || GROUND_PLANE;
    const isDrawTool = [
      'solid',
      'panel',
      'leg',
      'frame',
      'line',
      'guide_point',
      'guide_line',
      'reference_plane',
      'section_plane',
    ].includes(activeTool);

    if (isDrawTool) {
      overlay.setPlane(plane, 50, 2000);
    } else {
      overlay.clearGrid();
    }
  }, [drawingPlane, activeTool]);

  // Update freeform preview
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    if (toolState.drawingFreeform && (toolState.freeformPoints || []).length > 0) {
      overlay.setPreviewFreeform3d(toolState.freeformPoints, toolState.currentFreeformPoint);
    }
  }, [toolState.drawingFreeform, toolState.freeformPoints, toolState.currentFreeformPoint]);

  // Camera-aligned plane tracking
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const isDrawTool = [
      'solid',
      'panel',
      'leg',
      'frame',
      'line',
      'freeform',
      'guide_point',
      'guide_line',
      'reference_plane',
      'section_plane',
    ].includes(activeTool);
    if (!isDrawTool || planeMode !== 'camera' || planeLocked || drawingPlane?.sourcePartId) return;

    let rafId = null;
    let lastDir = null;

    const tick = () => {
      const camera = viewport.getCamera?.();
      if (camera) {
        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);

        // Convert Three.js camera direction to domain coords
        const domainDir = { x: camDir.x, y: camDir.z, z: camDir.y };

        // Throttle: only update if direction changed significantly
        if (lastDir) {
          const dot = domainDir.x * lastDir.x + domainDir.y * lastDir.y + domainDir.z * lastDir.z;
          if (dot > 0.999) {
            rafId = requestAnimationFrame(tick);
            return;
          }
        }

        lastDir = { ...domainDir };
        const origin = { x: 0, y: 0, z: 0 };
        const plane = cameraPlaneFromDirection(domainDir, origin);
        editorDispatch({ type: 'SET_DRAWING_PLANE', plane });
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      if (rafId != null) cancelAnimationFrame(rafId);
    };
  }, [activeTool, planeMode, planeLocked, drawingPlane?.sourcePartId, editorDispatch]);

  // Update drawing preview
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    if (toolState.drawingProfile && (toolState.profilePoints || []).length > 0) {
      const plane = drawingPlane || GROUND_PLANE;
      overlay.setPreviewPolygon(plane, toolState.profilePoints, toolState.currentLocal);
    } else if (toolState.drawingGuideLine && toolState.guideLineStartLocal && toolState.guideLineCurrentLocal) {
      const plane = toolState.guideLinePlane || drawingPlane || GROUND_PLANE;
      overlay.setPreviewPolygon(
        plane,
        [toolState.guideLineStartLocal],
        toolState.guideLineCurrentLocal
      );
    } else if (toolState.drawingLine && (toolState.linePoints || []).length > 0) {
      const plane = drawingPlane || GROUND_PLANE;
      overlay.setPreviewPolygon(plane, toolState.linePoints, toolState.currentLocal);
    } else if (toolState.drawing && toolState.startLocal && toolState.currentLocal) {
      const plane = drawingPlane || GROUND_PLANE;
      overlay.setPreviewRect(plane, toolState.startLocal, toolState.currentLocal);
    } else {
      overlay.clearPreview();
    }
  }, [
    toolState.drawingProfile,
    toolState.profilePoints,
    toolState.drawingGuideLine,
    toolState.guideLinePlane,
    toolState.guideLineStartLocal,
    toolState.guideLineCurrentLocal,
    toolState.drawingLine,
    toolState.linePoints,
    toolState.drawing,
    toolState.startLocal,
    toolState.currentLocal,
    drawingPlane,
  ]);

  // Update extrusion preview
  useEffect(() => {
    const preview = extrusionPreviewRef.current;
    if (!preview) return;

    if (toolState.extruding && toolState.sourcePart && toolState.faceId) {
      preview.update(toolState.sourcePart, toolState.faceId, toolState.extrusionDistance || 0);
    } else {
      preview.clear();
    }
  }, [toolState.extruding, toolState.sourcePart, toolState.faceId, toolState.extrusionDistance]);

  // Update snap overlay from toolState
  useEffect(() => {
    const snapOvl = snapOverlayRef.current;
    if (!snapOvl) return;

    if (toolState.snapResult && snapEnabled) {
      snapOvl.updateSnapIndicator(toolState.snapResult);

      // For flush snaps, highlight the target part's face
      const inf = toolState.snapResult.inference;
      if (inf && inf.type === 'faceFlush' && inf.partId && inf.faceId) {
        const targetPart = project.parts.find((p) => p.id === inf.partId);
        snapOvl.updateHoverFace(targetPart, inf.faceId);
      }
    } else {
      snapOvl.updateSnapIndicator(null);
    }
  }, [toolState.snapResult, snapEnabled, project.parts]);

  // Update face hover highlight from toolState
  useEffect(() => {
    const snapOvl = snapOverlayRef.current;
    if (!snapOvl) return;

    if (toolState.hoverPartId && toolState.hoverFaceId && snapEnabled) {
      const part = project.parts.find((p) => p.id === toolState.hoverPartId);
      snapOvl.updateHoverFace(part, toolState.hoverFaceId);
    } else {
      snapOvl.updateHoverFace(null, null);
    }
  }, [toolState.hoverPartId, toolState.hoverFaceId, snapEnabled, project.parts]);

  // Update transform gizmo for move/rotate tools
  useEffect(() => {
    const gizmo = transformGizmoRef.current;
    if (!gizmo) return;

    const isTransformTool = activeTool === 'move' || activeTool === 'rotate';
    if (!isTransformTool || !selectedId) {
      gizmo.clear();
      return;
    }

    const part = project.parts.find((p) => p.id === selectedId);
    if (!part) {
      gizmo.clear();
      return;
    }

    // Convert domain position to Three.js coords: x=x, y=z, z=y
    const pos = {
      x: part.position.x + (part.width || 0) / 2,
      y: part.position.z + (part.thickness || part.height || 0) / 2,
      z: part.position.y + (part.depth || 0) / 2,
    };
    gizmo.update(pos, toolState.axisLock || null);
  }, [activeTool, selectedId, project.parts, toolState.axisLock]);

  // Raycasting helper
  const raycast = useCallback((e) => {
    const viewport = viewportRef.current;
    if (!viewport || !rootRef.current) return null;

    const renderer = viewport.getDomElement?.();
    const camera = viewport.getCamera?.();
    if (!renderer || !camera) return null;

    const rect = renderer.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    const pointer = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -(((e.clientY - rect.top) / rect.height) * 2 - 1)
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, camera);

    // Raycast against world objects (excluding overlay groups)
    const hits = raycaster.intersectObject(rootRef.current, true);

    let partId = null;
    let objectId = null;
    let point = null;
    let faceNormal = null;

    for (const hit of hits) {
      // Skip overlay objects
      if (isOverlayObject(hit.object)) continue;

      point = { x: hit.point.x, y: hit.point.y, z: hit.point.z };

      // Get face normal
      if (hit.face) {
        const normal = hit.face.normal.clone();
        hit.object.updateMatrixWorld();
        const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
        normal.applyMatrix3(normalMatrix).normalize();
        faceNormal = { x: normal.x, y: normal.y, z: normal.z };
      }

      // Resolve to part/object
      const target = resolvePickTarget(hit.object);
      if (target) {
        if (target.kind === 'part') {
          partId = target.sourceId;
        } else if (target.kind === 'object') {
          objectId = target.sourceId;
          // Also find a part for the hit
          partId = findPartIdFromObjectHit(hit.object, project);
        }
        break;
      }
    }

    // Compute drawing plane intersection
    const plane = drawingPlane || GROUND_PLANE;
    const threePlane = domainPlaneToThreePlane(plane);
    const drawingPlanePoint3 = new THREE.Vector3();
    const hasPlaneHit = raycaster.ray.intersectPlane(threePlane, drawingPlanePoint3);
    const drawingPlanePoint = hasPlaneHit
      ? { x: drawingPlanePoint3.x, y: drawingPlanePoint3.z, z: drawingPlanePoint3.y } // Three.js -> domain
      : null;

    // Compute movement plane (camera-perpendicular through drag start or hit point)
    const movementOrigin = point || (hasPlaneHit ? { x: drawingPlanePoint3.x, y: drawingPlanePoint3.y, z: drawingPlanePoint3.z } : null);
    let planePoint = null;
    if (movementOrigin && movementPlaneRef.current) {
      const mvPoint = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(movementPlaneRef.current, mvPoint)) {
        planePoint = { x: mvPoint.x, y: mvPoint.y, z: mvPoint.z };
      }
    }

    // Update cursor coords (convert Three.js -> domain: x=x, y=z, z=y)
    if (point) {
      setCursorCoords({
        x: Math.round(point.x),
        y: Math.round(point.z), // Three.js Z = domain Y
        z: Math.round(point.y), // Three.js Y = domain Z
      });
    } else if (drawingPlanePoint) {
      setCursorCoords({
        x: Math.round(drawingPlanePoint.x),
        y: Math.round(drawingPlanePoint.y),
        z: Math.round(drawingPlanePoint.z),
      });
    }

    return { partId, objectId, point, faceNormal, drawingPlanePoint, planePoint };
  }, [project, drawingPlane]);

  // Set up movement plane when drag starts
  useEffect(() => {
    if (toolState.dragging && toolState.startPoint) {
      const viewport = viewportRef.current;
      const camera = viewport?.getCamera?.();
      if (camera) {
        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);
        const origin = new THREE.Vector3(toolState.startPoint.x, toolState.startPoint.y, toolState.startPoint.z);
        movementPlaneRef.current = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, origin);
      }
    } else if (!toolState.dragging) {
      movementPlaneRef.current = null;
    }
  }, [toolState.dragging, toolState.startPoint]);

  const shouldRouteCtrlMove = useCallback((event) => {
    if (navigationModifierRef.current) return false;
    if (moveDragRoutingRef.current) return true;
    if (!(event?.ctrlKey || moveModifierRef.current)) return false;
    return !toolInteractionActive;
  }, [toolInteractionActive]);

  // Pointer event handlers
  const handlePointerDown = useCallback((e) => {
    // Right-click and middle-click are handled by OrbitControls
    if (e.button !== 0) return;
    if (navigationModifierRef.current) {
      pointerDownRef.current = null;
      return;
    }

    // Paste mode: place copy at click location
    if (toolState.pasting && clipboard) {
      const pasteHit = raycast(e);
      if (pasteHit) {
        const targetPosition = pasteHit.drawingPlanePoint
          || (pasteHit.point ? { x: pasteHit.point.x, y: pasteHit.point.z, z: pasteHit.point.y } : null);

        if (targetPosition) {
          if (clipboard.type === 'assembly') {
            dispatch({
              type: 'ASSEMBLY_PASTE',
              assemblyData: clipboard.snapshot,
              memberParts: clipboard.memberParts,
              targetPosition,
            });
          } else {
            dispatch({
              type: 'PART_PASTE',
              partData: clipboard.snapshot,
              children: clipboard.children || [],
              targetPosition,
            });
          }
          editorDispatch({ type: 'UPDATE_TOOL_STATE', payload: { pasting: false } });
          editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Pasted' });
          return;
        }
      }
    }

    pointerDownRef.current = { x: e.clientX, y: e.clientY };

    const intersection = raycast(e);
    if (!intersection) return;
    const activePointerTool = shouldRouteCtrlMove(e) ? moveTool : tool;
    moveDragRoutingRef.current = activePointerTool === moveTool;

    // Set up movement plane for drag
    if (intersection.point) {
      const viewport = viewportRef.current;
      const camera = viewport?.getCamera?.();
      if (camera) {
        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);
        const origin = new THREE.Vector3(intersection.point.x, intersection.point.y, intersection.point.z);
        movementPlaneRef.current = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, origin);
      }
    }

    activePointerTool.onPointerDown(intersection, e, toolState, viewportRef.current);
  }, [raycast, tool, moveTool, toolState, shouldRouteCtrlMove, clipboard, dispatch, editorDispatch]);

  const handlePointerMove = useCallback((e) => {
    if (navigationModifierRef.current) return;

    const isActive = toolInteractionActive || moveDragRoutingRef.current;
    const activePointerTool = moveDragRoutingRef.current || shouldRouteCtrlMove(e) ? moveTool : tool;

    // Always raycast for hover/snap feedback (even when idle)
    if (e.buttons === 0 && !isActive) {
      // Idle hover — call onHover for snap preview
      if (activePointerTool.onHover && snapEnabled) {
        const intersection = raycast(e);
        if (intersection) {
          activePointerTool.onHover(intersection, e, toolState, viewportRef.current);
        }
      }
      return;
    }

    const intersection = raycast(e);
    if (!intersection) return;

    activePointerTool.onPointerMove(intersection, e, toolState, viewportRef.current);
  }, [raycast, tool, moveTool, toolInteractionActive, toolState, snapEnabled, shouldRouteCtrlMove]);

  const handlePointerUp = useCallback((e) => {
    if (e.button !== 0) return;
    if (navigationModifierRef.current) {
      pointerDownRef.current = null;
      return;
    }

    // Check if this was a click vs drag (for OrbitControls compatibility)
    const down = pointerDownRef.current;
    pointerDownRef.current = null;

    if (down) {
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      if (Math.hypot(dx, dy) > 5 && !toolState.dragging && !toolState.drawing && !toolState.drawingProfile && !toolState.drawingGuideLine && !toolState.drawingLine && !toolState.drawingFreeform && !toolState.extruding && !toolState.moving && !toolState.rotating && !toolState.measuring) {
        // Was an orbit gesture, not a tool interaction
        moveDragRoutingRef.current = false;
        return;
      }
    }

    const intersection = raycast(e);
    const activePointerTool = moveDragRoutingRef.current || shouldRouteCtrlMove(e) ? moveTool : tool;
    activePointerTool.onPointerUp(intersection, e, toolState, viewportRef.current);
    moveDragRoutingRef.current = false;
  }, [raycast, tool, moveTool, toolState, shouldRouteCtrlMove]);

  const handleDoubleClick = useCallback((e) => {
    if (navigationModifierRef.current) return;
    const intersection = raycast(e);
    if (intersection && tool.onDoubleClick) {
      tool.onDoubleClick(intersection, e, toolState);
    }
  }, [raycast, tool, toolState]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
      if (e.code === 'Space') return;

      if (e.key === 'Escape') {
        if (activeAssemblyId) {
          tool.onKeyDown(e, toolState, selectedId);
          return;
        }
        editorDispatch({ type: 'SET_TOOL', tool: 'select' });
        return;
      }

      // Copy/paste shortcuts
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && selectedId) {
        e.preventDefault();
        if (selectedType === 'assembly') {
          const assembly = project.assemblies.find((a) => a.id === selectedId);
          const members = project.parts.filter((p) => p.assemblyId === selectedId);
          editorDispatch({
            type: 'SET_CLIPBOARD',
            data: { type: 'assembly', snapshot: structuredClone(assembly), memberParts: structuredClone(members) },
          });
        } else {
          const part = project.parts.find((p) => p.id === selectedId);
          const children = project.parts.filter((p) => p.parentId === selectedId);
          editorDispatch({
            type: 'SET_CLIPBOARD',
            data: { type: 'part', snapshot: structuredClone(part), children: structuredClone(children) },
          });
        }
        editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Copied. Press Ctrl+V to paste.' });
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v' && clipboard) {
        e.preventDefault();
        editorDispatch({ type: 'UPDATE_TOOL_STATE', payload: { pasting: true } });
        editorDispatch({ type: 'SET_STATUS_MESSAGE', message: 'Click to place copy' });
        return;
      }

      if (!e.ctrlKey && !e.metaKey) {
        // Quick-rotate (Q / Shift+Q) and flip (Shift+X/Y/Z) — route to active tool handler
        if (e.key.toLowerCase() === 'q' && selectedId) {
          tool.onKeyDown(e, toolState, selectedId);
          return;
        }
        if (e.shiftKey && ['x', 'y', 'z'].includes(e.key.toLowerCase()) && selectedId) {
          tool.onKeyDown(e, toolState, selectedId);
          return;
        }

        // When move/rotate tool is active, route X/Y/Z to the handler for axis locking
        const axisKeys = ['x', 'y', 'z'];
        if (axisKeys.includes(e.key.toLowerCase()) && (activeTool === 'move' || activeTool === 'rotate')) {
          tool.onKeyDown(e, toolState, selectedId);
          return;
        }

        const toolKey = SKETCH_TOOL_SHORTCUTS[e.key.toLowerCase()];
        if (toolKey) {
          editorDispatch({ type: 'SET_TOOL', tool: toolKey });
          return;
        }

        // Push/pull shortcut
        if (e.key.toLowerCase() === 'e') {
          editorDispatch({ type: 'SET_TOOL', tool: 'pushpull' });
          return;
        }
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        tool.onKeyDown(e, toolState, selectedId);
        return;
      }

      tool.onKeyDown(e, toolState, selectedId);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editorDispatch, selectedId, selectedType, activeAssemblyId, tool, toolState, project, clipboard]);

  // Status message auto-clear
  useEffect(() => {
    if (!statusMessage) return undefined;
    const timer = window.setTimeout(() => {
      editorDispatch({ type: 'CLEAR_STATUS_MESSAGE' });
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [statusMessage, editorDispatch]);

  // Draw dimension label
  const drawDimLabel = toolState.drawing && toolState.startLocal && toolState.currentLocal
    ? `${Math.round(Math.abs(toolState.currentLocal.u - toolState.startLocal.u))} x ${Math.round(Math.abs(toolState.currentLocal.v - toolState.startLocal.v))} mm`
    : null;
  const profileLabel = toolState.drawingProfile
    ? `Profile: ${(toolState.profilePoints || []).length} pts`
    : toolState.drawingGuideLine
      ? 'Guide line'
    : toolState.drawingLine
      ? `Line: ${(toolState.linePoints || []).length} pts`
      : toolState.drawingFreeform
        ? `Freeform: ${(toolState.freeformPoints || []).length} pts`
        : null;

  // Extrusion numeric input display
  const numericDisplay = toolState.extruding && toolState.numericInput
    ? toolState.numericInput
    : null;

  const extrusionLabel = toolState.extruding && toolState.extrusionDistance
    ? `${Math.round(toolState.extrusionDistance)} mm`
    : null;

  // Snap type indicator
  const snapTypeLabel = toolState.snapResult?.inference?.type || null;

  const hasParts = project.parts.length > 0;
  const hasAssemblies = project.assemblies.length > 0;
  const showEmptyState = !hasParts && !hasAssemblies && !emptyStateDismissed;
  const isComponentPlacementTool = ['panel', 'leg', 'frame'].includes(activeTool);
  const isConstructionTool = ['guide_point', 'guide_line', 'reference_plane', 'section_plane'].includes(activeTool);
  const placementModuleMode = toolState.placementModuleMode || (activeAssemblyId ? 'current' : 'new');
  const activeAssemblyName = activeAssemblyId
    ? project.assemblies.find((assembly) => assembly.id === activeAssemblyId)?.name || 'Current Module'
    : 'New Module';
  const navigationHint = navigationModifierActive
    ? 'Orbit camera'
    : toolState.pasting
      ? 'Click to place copy, Escape to cancel'
      : isComponentPlacementTool
        ? 'Hover a face to attach, drag to size'
        : isConstructionTool
          ? 'Click to place guides and planes, use active plane or pick a face'
          : 'Middle-drag to orbit, Right-drag to pan, Scroll to zoom';
  const moveHint = moveDragRoutingRef.current || moveModifierActive
    ? 'Ctrl + drag: move'
    : 'Ctrl + drag to move';
  const canvasCursor = navigationModifierActive
    ? 'grab'
    : toolState.pasting
      ? 'copy'
      : moveDragRoutingRef.current
        ? moveTool.getCursor(toolState)
        : moveModifierActive && !toolInteractionActive
          ? 'grab'
          : tool.getCursor(toolState);

  return (
    <div className={styles.viewport}>
      <div
        ref={containerRef}
        className={styles.canvas}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        style={{ cursor: canvasCursor }}
      />

      <CompassOverlay className={styles.compassDock} needleRef={compassNeedleRef} />

      {/* Overlay controls */}
      <div className={styles.overlayControls}>
        <button
          type="button"
          className={styles.overlayBtn}
          onClick={() => viewportRef.current?.resetView()}
        >
          Reset View
        </button>
      </div>

      {isComponentPlacementTool && (
        <div className={styles.placementChooser}>
          <span className={styles.placementLabel}>Module</span>
          {activeAssemblyId ? (
            <>
              <button
                type="button"
                className={`${styles.placementToggle} ${placementModuleMode === 'current' ? styles.placementToggleActive : ''}`}
                onClick={() => editorDispatch({
                  type: 'UPDATE_TOOL_STATE',
                  payload: { placementModuleMode: 'current' },
                })}
              >
                {activeAssemblyName}
              </button>
              <button
                type="button"
                className={`${styles.placementToggle} ${placementModuleMode === 'new' ? styles.placementToggleActive : ''}`}
                onClick={() => editorDispatch({
                  type: 'UPDATE_TOOL_STATE',
                  payload: { placementModuleMode: 'new' },
                })}
              >
                New Module
              </button>
            </>
          ) : (
            <span className={styles.placementBadge}>Creates a new module</span>
          )}
        </div>
      )}

      {/* Inspection card */}
      {inspection && (
        <div className={styles.inspectCard}>
          <span className={styles.inspectEyebrow}>
            {selectedType === 'object' ? 'Selected Object' : selectedType === 'assembly' ? 'Selected Module' : 'Selected Part'}
          </span>
          <span className={styles.inspectTitle}>{inspection.title}</span>
          <span className={styles.inspectMeta}>{inspection.subtitle}</span>
          <div className={styles.inspectGrid}>
            {inspection.rows.map((row) => (
              <div key={`${inspection.id}-${row.label}`} className={styles.inspectRow}>
                <span className={styles.inspectLabel}>{row.label}</span>
                <span className={styles.inspectValue}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dimension label during draw */}
      {drawDimLabel && (
        <div className={styles.dimLabel} style={{ bottom: 44, left: '50%', transform: 'translateX(-50%)' }}>
          {drawDimLabel}
        </div>
      )}

      {profileLabel && !drawDimLabel && (
        <div className={styles.dimLabel} style={{ bottom: 44, left: '50%', transform: 'translateX(-50%)' }}>
          {profileLabel}
        </div>
      )}

      {/* Extrusion distance label */}
      {extrusionLabel && !numericDisplay && (
        <div className={styles.dimLabel} style={{ bottom: 44, left: '50%', transform: 'translateX(-50%)' }}>
          {extrusionLabel}
        </div>
      )}

      {/* Numeric input for push/pull */}
      {toolState.extruding && (
        <div className={styles.numericInput}>
          <span className={styles.numericInputLabel}>Distance:</span>
          {numericDisplay || '...'}
          <span className={styles.numericInputLabel}>mm</span>
        </div>
      )}

      {/* Empty state */}
      {showEmptyState && (
        <div className={styles.emptyState}>
          <span className={styles.emptyTitle}>3D Workspace</span>
          <span className={styles.emptyBody}>
            Create a free-canvas object, add modules, then sketch profiles or attach primitives directly to faces in 3D.
            Add guides, reference planes, and section planes to shape larger assemblies. Orbit: middle-drag or Space+drag. Pan: right-drag. Zoom: scroll.
          </span>
        </div>
      )}

      {/* Status bar */}
      <div className={styles.statusBar} role="status" aria-live="polite">
        <span className={styles.statusContext}>3D</span>
        <span className={styles.statusCoords}>X: {cursorCoords.x} mm</span>
        <span className={styles.statusCoords}>Y: {cursorCoords.y} mm</span>
        <span className={styles.statusCoords}>Z: {cursorCoords.z} mm</span>
        {activeAssemblyId && (
          <span className={styles.statusContext} style={{ color: '#4682B4', fontWeight: 600 }}>
            Focus: {project.assemblies.find((a) => a.id === activeAssemblyId)?.name || 'Module'}
          </span>
        )}
        {snapTypeLabel && (
          <span className={styles.statusSnap}>
            Snap: {snapTypeLabel}
          </span>
        )}
        <span className={styles.statusContext}>
          {navigationHint}
        </span>
        <span className={styles.statusContext}>
          {moveHint}
        </span>
        <span className={styles.statusTool}>{activeTool}</span>
      </div>

      {/* Toast notifications */}
      {statusMessage && (
        <div className={styles.toast}>
          {statusMessage}
          <div className={styles.toastProgress} />
        </div>
      )}
    </div>
  );
}

// Helpers

function isEditableEventTarget(target) {
  return !!(
    target
    && (target.tagName === 'INPUT'
      || target.tagName === 'TEXTAREA'
      || target.isContentEditable)
  );
}

function isOverlayObject(obj) {
  let current = obj;
  while (current) {
    if (current.name === 'DrawingPlaneOverlay' || current.name === 'ExtrusionPreview' ||
        current.name === 'PlaneGrid' || current.name === 'DrawPreview' ||
        current.name === 'SnapOverlay' || current.name === 'AlignmentGuides') {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function resolvePickTarget(object) {
  let current = object;
  while (current) {
    if (current.userData?.previewTarget) {
      return current.userData.previewTarget;
    }
    current = current.parent;
  }
  return null;
}

function findPartIdFromObjectHit(object, project) {
  const target = resolvePickTarget(object);
  if (!target) return null;
  if (target.kind === 'part') return target.sourceId;

  // Object hit - find first matching part
  const part = project.parts.find((p) => p.objectId === target.sourceId && p.type !== 'dimension' && p.type !== 'cutout' && p.type !== 'hole');
  return part?.id || null;
}

/**
 * Convert a domain drawing plane to a Three.js Plane.
 * Domain: x=x, y=y, z=z -> Three.js: x=x, y=z, z=y
 */
function domainPlaneToThreePlane(plane) {
  const threeNormal = new THREE.Vector3(
    plane.normal.x,
    plane.normal.z, // domain Z -> Three.js Y
    plane.normal.y  // domain Y -> Three.js Z
  ).normalize();

  const threeOrigin = new THREE.Vector3(
    plane.origin.x,
    plane.origin.z, // domain Z -> Three.js Y
    plane.origin.y  // domain Y -> Three.js Z
  );

  return new THREE.Plane().setFromNormalAndCoplanarPoint(threeNormal, threeOrigin);
}

function isPartVisibleForSections(part, sectionPlanes) {
  if (!sectionPlanes?.length || part.type === 'dimension') return true;

  const corners = getPartCorners(part);
  if (!corners.length) return true;

  return sectionPlanes.every((section) => (
    corners.some((corner) => signedDistanceToPlane(corner, section.plane) <= 0.5)
  ));
}
