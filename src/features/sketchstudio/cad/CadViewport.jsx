import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { mapPlacement } from './placement.js';
import { instanceMatrix, instanceOrientation } from './movement.js';
import {
  RING_SIZE,
  gizmoRingRadius,
  localToWorldTurn,
  ringHandlesOnly,
  startDial,
  worldToLocalTurn,
  worldTurn,
} from './rotateDial.js';
import { faceFrame, faceOutline, meshAdjacency, segmentsInPlane, toPlane, uprightAxes } from './sketchPlane.js';
import { createPlacementLayer } from './placementLayer.js';
import { STATION_VIEW, createShopLayer } from './shopLayer.js';
import {
  CLICK_PX,
  COMMIT_DEGREES,
  axisTravel,
  brakeHint,
  dragChip,
  fingerL,
  fingerReadout as fingerReadoutWords,
  gripChip as brakeGripChip,
  gripDrag as brakeGripDrag,
  reachChip,
  slideChip,
  slideReadout,
  slideSnap,
  typedL,
  typedSlide,
} from './brakeHands.js';
import BrakeSideView from './BrakeSideView.jsx';
import {
  CURVED_HINT,
  LABEL_CORNER,
  ORIGIN_PLANES,
  PICK_HINT,
  PLANE_NAMES,
  REST_HINT,
  faceHint,
  planeHint,
  planeLabel,
  planeTiles,
} from './originPlanes.js';
import { faceCentroid } from './placementTool.js';
import { entityPolyline } from './sketchProfile.js';
import { gizmoAxes, snapBoxDelta, snapThreshold } from './boxSnap.js';
import {
  SNAP_PX,
  anchorWorld,
  displayedInstanceMatrix,
  formatMm,
  markGeometry,
  markOffset,
  markSnapPoints,
  measureCandidates,
  mmPerPixelAt,
  pendingDelta,
} from './marks.js';
import { attachmentRoot } from './groups.js';
import {
  AXIS_COLORS,
  rotationReadout,
  snapLabel,
  translationReadout,
  typeKey,
  typedHtml,
  typedRotation,
  typedTranslation,
  typingSupported,
} from './gizmoHud.js';
import {
  BODY_COLORS,
  DEFAULT_VIEW_MODE,
  EDGE_ALPHA,
  EDGE_COLOR,
  EDGE_RENDER_ORDER,
  VIEW_MODE_COPY,
  bodyAppearance,
  bodyLook,
  createMaterialCache,
  isHardwarePart,
  isSeeThrough,
  resolveViewMode,
} from './viewMode.js';

export default function CadViewport({
  ref,
  snapshot,
  model,
  selectedId,
  // Part groups (docs/sketch-studio-part-groups.md §4.4): every selected part
  // (a group's members; drives the selected look and Isolate), and what the
  // gizmo moves: the instance id, a group id, 'selection', or null.
  selectedIds: selectedIdsProp,
  movingKey: movingKeyProp,
  onSelect,
  isolated,
  view,
  perspective,
  exploded,
  // Solid / X-ray / Wireframe (viewMode.js); pane-local state in the workspace.
  viewMode = DEFAULT_VIEW_MODE,
  section,
  fitKey,
  previewShown = false,
  moveEnabled,
  moveSnap = 1,
  transformMode = 'translate',
  rotateSnap = 15,
  rotateSpace = 'world',
  pivotPick = false,
  onMove,
  onRotate,
  moveHint,
  ready,
  focusTarget,
  holeMode,
  onPlaceHole,
  onMoveHole,
  onCancelHole,
  sketchMode = null,
  sketchSupportId = null,
  onPickSketchFace,
  pickHint,
  // Origin plane tiles (originPlanes.js): { visible, offset } from the
  // workspace; a tile or label click calls onPickSketchPlane(plane, offset).
  planes = null,
  onPickSketchPlane,
  measureMode = false,
  marks = [],
  selectedMarkId = null,
  hideMarks = false,
  onMeasure,
  onSelectMark,
  // Direct placement (placementTool.js placementView) and its callbacks.
  placement = null,
  onPlace,
  onPlacementDrag,
  onPlacementCancelDrag,
  onPlacementFinish,
  // Sheet metal (docs/sketch-studio-fab-shop.md §7): { instanceId, fold, flat }
  // while the selected sheet-metal part is unfolded or folding back, else null.
  sheetView = null,
  // The press brake station (§9 SM-2, brakeStation.js stationView) or null;
  // onBrakeStrokeEnd(token) when a stroke the station started has run.
  brakeView = null,
  onBrakeStrokeEnd,
  // Hands on the sheet (docs/sketch-studio-brake-hands-on.md HO-1): null, or
  // { shown (the station is being set up), lined (a punch line is picked),
  // flip, turn (each act's outcome, brakeHands.js brakeOutcome, or null), ms }
  // from the workspace; onBrakeGrip('flip' | 'turn') when a handle is
  // clicked or dragged past 90°: the act, exactly as the panel makes it.
  brakeGrip = null,
  onBrakeGrip,
  // Flange gaps (docs/sketch-studio-corner-gaps.md §3.3): null, or the row
  // hovered in the press brake's card, { at, flat ([P, Q] in each piece's flat
  // frame), overlap }: a marker between its two points on the part.
  brakeGap = null,
  // A handle approached whose outcome is not worked out yet (a heavy part, §5.4): the workspace works it out now.
  onBrakeGripWant,
  // HO-2 (§6): onBrakeEdge(index) an edge of the sheet clicked (the flat-blank
  // card's onPickEdge); onBrakeFingers({ start } | { distance } | { end } |
  // { cancel }) the backgauge fingers dragged (each new L at most once a
  // frame, through the card's own onDistance path; cancel puts the line back
  // as it was); onBrakeFocus('distance' | 'punch' | 'die') the fingers or a
  // blade clicked: the panel's field or picker.
  onBrakeEdge,
  onBrakeFingers,
  onBrakeFocus,
  // Piece pick PK-2 (docs/sketch-studio-piece-pick.md §6.1): onBrakePiece(index, { add }) a piece of
  // the line clicked on the sheet (`add` with Ctrl, Shift or Meta held): the flat-blank card's onPiece.
  onBrakePiece,
  // The sheet slid by hand (docs/sketch-studio-sheet-slide.md §6.1): onBrakeSlide({ start } |
  // { slide } | { end } | { cancel }), slide the sheet's move along the bed (mm, positive to the
  // right) at most once a frame, as the fingers' onBrakeFingers; cancel puts the slide back.
  onBrakeSlide,
  // The paint and print stations (§9 SM-3): null, or { station, stage, pick
  // ('part' | 'face' | null), hint, targets (instance ids outlined: what the
  // booth paints), printId }. While set, viewport clicks go to
  // onShopPick(info) instead of the selection, and a print can be dragged on
  // its face (onShopPrintMove(id, local origin)).
  shopPick = null,
  onShopPick,
  onShopPrintMove,
  // The replay's mask (shopLayer.js setHidden): the instance ids not made yet
  // at its point of the film, or null.
  filmHidden = null,
  // The replay (docs/sketch-studio-shop-floor.md §8): null, or { key, ids (the
  // product's instances), brake (it has press brake hits) } while it plays: the product is framed as it starts
  // and the camera (the press brake's saved one too) put back as it ends.
  film = null,
  // Draw's outlines (shopRoute.js shopOutlineView: [{ id, ready, chosen,
  // rings }]) while the Draw station or Cut's picker is open, else null.
  shopOutlines = null,
  // Cut's picker (docs/sketch-studio-cut-pick.md §4.2): onPickOutline(sketchId)
  // for a click inside a ready outline that no part in front takes; null
  // (Draw) leaves the outlines unclickable and every click as before.
  onPickOutline = null,
}) {
  const host = useRef(null),
    hudRef = useRef(null),
    gripChipRef = useRef(null),
    measureHudRef = useRef(null),
    placementHudRef = useRef(null),
    labelsRef = useRef(null),
    sketchDimLabelsRef = useRef(null),
    shopLabelsRef = useRef(null),
    planeLabelsRef = useRef(null),
    sceneRef = useRef(null),
    selectionCallback = useRef(onSelect),
    moveCallback = useRef(onMove),
    rotateCallback = useRef(onRotate);
  // The committed model has parts (a model opened with parts gets the
  // one-time first-geometry fit; an empty one never does).
  const hasInstances = Boolean(model?.instances?.length);
  // Without the group props (older callers, tests) the single selection is both.
  const selectedIds = selectedIdsProp ?? (selectedId ? [selectedId] : []);
  const selectedKey = selectedIds.join('|');
  const movingKey = movingKeyProp === undefined ? selectedId : movingKeyProp;
  // A group or several parts: one rigid body with World axes only (§3.5).
  const movingBody = Boolean(movingKey) && !(selectedIds.length === 1 && selectedIds[0] === movingKey);
  useImperativeHandle(
    ref,
    () => ({
      // World bounds as displayed, including a placement the worker has not
      // rebuilt yet, so turns chain without waiting for the kernel.
      getInstanceBounds(id) {
        const group = sceneRef.current?.group.children.find((g) => g.userData.instanceId === id);
        if (!group) return null;
        const box = new THREE.Box3().setFromObject(group);
        return box.isEmpty() ? null : [box.min.toArray(), box.max.toArray()];
      },
      // The union of the displayed world boxes of these parts' visible
      // groups (a group's pivot, flip and mate centre), or null.
      getBounds(ids) {
        const ctx = sceneRef.current;
        if (!ctx) return null;
        const box = unionBox(ctx.group.children.filter((g) => g.visible && ids.includes(g.userData.instanceId)));
        return box.isEmpty() ? null : [box.min.toArray(), box.max.toArray()];
      },
      getCanvas: () => sceneRef.current?.renderer.domElement || null,
      // A gizmo drag is in progress (keyboard shortcuts wait for it to end);
      // a press on the press brake's grip counts (its Esc is the drag's).
      isDragging: () =>
        Boolean(
          sceneRef.current?.drag ||
          sceneRef.current?.transform.dragging ||
          sceneRef.current?.placementLayer?.isDragging() ||
          sceneRef.current?.gripPressed?.(),
        ),
      // Hands on the sheet (§5.5): a toolbar button hovered or focused lights its handle; null puts it out.
      lightBrakeHand: (kind) => sceneRef.current?.lightGrip?.(kind || null),
      // World point the gizmo turns about: the bounding-box centre, or a
      // picked point (Rotate about: Picked point).
      getPivot: () => {
        const ctx = sceneRef.current;
        return ctx?.movingId ? ctx.pivot.position.toArray() : null;
      },
      // Sketch-plane coordinates [u, v] under a screen point, or null when the
      // view ray is parallel to the plane.
      planePoint(clientX, clientY, frame) {
        const ctx = sceneRef.current;
        if (!ctx) return null;
        const point = ctx.rayAt({ clientX, clientY }).ray.intersectPlane(planeOf(frame), new THREE.Vector3());
        return point ? toPlane(frame, point.toArray()).slice(0, 2) : null;
      },
      // Model edges lying in the sketch plane, as sketch-plane segments.
      planeEdges(frame, tolerance = 0.01) {
        const ctx = sceneRef.current;
        if (!ctx) return [];
        const segments = [];
        ctx.group.updateMatrixWorld(true);
        for (const group of ctx.group.children) {
          if (!group.visible) continue;
          const edges = group.children[1];
          const positions = edges.geometry.getAttribute('position');
          if (!positions) continue;
          const a = new THREE.Vector3(),
            b = new THREE.Vector3();
          for (let i = 0; i + 1 < positions.count; i += 2) {
            a.fromBufferAttribute(positions, i).applyMatrix4(edges.matrixWorld);
            b.fromBufferAttribute(positions, i + 1).applyMatrix4(edges.matrixWorld);
            segments.push([a.toArray(), b.toArray()]);
          }
        }
        return segmentsInPlane(frame, segments, tolerance);
      },
      setSketchOverlay(overlay) {
        const ctx = sceneRef.current;
        if (!ctx) return;
        drawSketchOverlay(ctx.sketchLayer, overlay);
        ctx.syncSketchDimLabels?.();
        ctx.render();
      },
      // `watcher()` after every camera change (a frame at most), until the returned function is called.
      watchView(watcher) {
        return sceneRef.current?.watchView?.(watcher) || (() => {});
      },
      // Measure: the first picked point (world) while the second is awaited.
      measureState: () => ({ first: sceneRef.current?.measureFirst?.point || null }),
      cancelMeasure: () => sceneRef.current?.cancelMeasure(),
      // Diagonal of the visible parts' world box (sizes a new mark's offset).
      getSceneSpan: () => sceneRef.current?.sceneSpan() || 0,
      // Live pose of every displayed part: Map instanceId → { matrix, placement, visible, bounds }.
      getGroupPoses: () => sceneRef.current?.groupPoses(true) || new Map(),
      // World snap points of the drawn marks: both ends and the midpoint of each.
      getMarkPoints: () => markSnapPoints(sceneRef.current?.drawnMarks || []).map((p) => p.point),
      // Where a new Board or Tube lands (docs/sketch-studio-cad.md, Start):
      // the ground (z = 0) under the centre of the view, or the orbit target's
      // ground point when the centre ray never meets the ground (a front or
      // side view). Snapped to the Move grid (1 mm when moving freely), so an
      // untouched default view gives exactly the origin.
      viewDropPoint() {
        const ctx = sceneRef.current;
        if (!ctx) return null;
        return groundDropPoint(ctx.camera, ctx.controls.target, ctx.snap);
      },
    }),
    [],
  );
  useEffect(() => {
    selectionCallback.current = onSelect;
  }, [onSelect]);
  const outlineCallback = useRef(onPickOutline);
  useEffect(() => {
    outlineCallback.current = onPickOutline;
    // Off: the cursor this viewport set over an outline goes too.
    if (!onPickOutline) sceneRef.current?.clearOutlineHover?.();
  }, [onPickOutline]);
  useEffect(() => {
    moveCallback.current = onMove;
  }, [onMove]);
  useEffect(() => {
    rotateCallback.current = onRotate;
  }, [onRotate]);
  const holeCallbacks = useRef({});
  useEffect(() => {
    holeCallbacks.current = { onPlaceHole, onMoveHole, onCancelHole, onPickSketchFace, onPickSketchPlane };
  }, [onPlaceHole, onMoveHole, onCancelHole, onPickSketchFace, onPickSketchPlane]);
  const placementCallbacks = useRef({});
  useEffect(() => {
    placementCallbacks.current = { onPlace, onPlacementDrag, onPlacementCancelDrag, onPlacementFinish };
  }, [onPlace, onPlacementDrag, onPlacementCancelDrag, onPlacementFinish]);
  const markCallbacks = useRef({});
  useEffect(() => {
    markCallbacks.current = { onMeasure, onSelectMark };
  }, [onMeasure, onSelectMark]);
  const strokeCallback = useRef(onBrakeStrokeEnd);
  useEffect(() => {
    strokeCallback.current = onBrakeStrokeEnd;
  }, [onBrakeStrokeEnd]);
  const gripCallback = useRef({
    onBrakeGrip,
    onBrakeGripWant,
    onBrakeEdge,
    onBrakeFingers,
    onBrakeFocus,
    onBrakePiece,
    onBrakeSlide,
  });
  useEffect(() => {
    gripCallback.current = {
      onBrakeGrip,
      onBrakeGripWant,
      onBrakeEdge,
      onBrakeFingers,
      onBrakeFocus,
      onBrakePiece,
      onBrakeSlide,
    };
  }, [onBrakeGrip, onBrakeGripWant, onBrakeEdge, onBrakeFingers, onBrakeFocus, onBrakePiece, onBrakeSlide]);
  const shopCallbacks = useRef({});
  useEffect(() => {
    shopCallbacks.current = { onShopPick, onShopPrintMove };
  }, [onShopPick, onShopPrintMove]);
  // The press brake's poses for the side view (BrakeSideView): the shop layer
  // hands each one here and the card rewrites itself — never a React render
  // per stroke frame. The last pose goes to a listener as it subscribes.
  const stationPoses = useRef({ last: null, listeners: new Set() });
  const subscribeStation = useCallback((listener) => {
    const poses = stationPoses.current;
    poses.listeners.add(listener);
    listener(poses.last);
    return () => poses.listeners.delete(listener);
  }, []);
  const [error, setError] = useState(null);
  const placing = Boolean(placement);
  const shownViewMode = resolveViewMode(viewMode);
  // Which Measure click is next, and whether the last click found nothing (the hint line).
  const [measureStage, setMeasureStage] = useState('first');
  const [measureMissed, setMeasureMissed] = useState(false);
  // The hint for the origin plane tile or face under the cursor ('' = none).
  // Set only when what is hovered changes, never per frame.
  const [hoverHint, setHoverHint] = useState('');
  const planesVisible = Boolean(planes?.visible),
    planesOffset = Number(planes?.offset) || 0;
  useEffect(() => {
    const element = host.current;
    let renderer;
    try {
      // The discrete GPU where there is one, as the planner's preview asks (B1.6).
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch (e) {
      // External renderer initialization can fail before its event callbacks exist.
      setError(e.message);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.localClippingEnabled = true;
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#e7ebef');
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1e7);
    camera.up.set(0, 0, 1);
    camera.position.set(1500, -1800, 1400);
    // TransformControls must receive pointer-down first to suspend orbiting
    // before OrbitControls handles a drag on an axis.
    const transform = new TransformControls(camera, renderer.domElement);
    transform.setMode('translate');
    transform.setSpace('world');
    transform.setSize(MOVE_SIZE);
    // Rotate shows the three axis rings only; the dial below owns their angle.
    ringHandlesOnly(transform);
    const helper = transform.getHelper();
    scene.add(helper);
    const pivot = new THREE.Object3D();
    scene.add(pivot);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    const group = new THREE.Group();
    scene.add(group);
    const holeHandles = new THREE.Group();
    scene.add(holeHandles);
    // Sketch geometry lives in plane coordinates; the layer matrix is the frame.
    const sketchLayer = new THREE.Group();
    sketchLayer.matrixAutoUpdate = false;
    scene.add(sketchLayer);
    // Where a dragged part snapped to another part's bounding-box face.
    const snapLayer = new THREE.Group();
    scene.add(snapLayer);
    // Rotate drag feedback: the swept sector, its radials and a ghost of the
    // start pose (see createRotateFeedback).
    const rotateLayer = new THREE.Group();
    scene.add(rotateLayer);
    // Dimension marks (persistent) and the Measure tool's live feedback.
    const markLayer = new THREE.Group();
    markLayer.renderOrder = 34;
    scene.add(markLayer);
    const measureLayer = new THREE.Group();
    measureLayer.renderOrder = 36;
    scene.add(measureLayer);
    // Origin plane tiles: their own layer, never in `group`, so selection,
    // hole, measure and placement raycasts never see them.
    const planeLayer = new THREE.Group();
    planeLayer.name = 'origin-planes';
    scene.add(planeLayer);
    // The flat face under the cursor while picking where to sketch.
    const pickLayer = new THREE.Group();
    pickLayer.name = 'sketch-pick';
    scene.add(pickLayer);
    // Draw's outlines on the ground (docs/sketch-studio-outline-edit-sheet-nest.md
    // §3.5): their own layer, never in `group`, so no raycast sees them.
    const outlineLayer = new THREE.Group();
    outlineLayer.name = 'shop-outlines';
    scene.add(outlineLayer);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x6e7989, 2.8));
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(300, -400, 800);
    scene.add(light);
    const grid = new THREE.GridHelper(10000, 100, 0xa6b0bb, 0xd1d7dd);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -0.5;
    scene.add(grid);
    const axes = new THREE.AxesHelper(150);
    scene.add(axes);
    const ctx = {
      renderer,
      scene,
      camera,
      controls,
      group,
      grid,
      transform,
      pivot,
      holeHandles,
      sketchLayer,
      snapLayer,
      rotateLayer,
      markLayer,
      measureLayer,
      planeLayer,
      pickLayer,
      outlineLayer,
      shopOutlineCount: 0,
      planes: { visible: false, size: 0, offset: 0, tiles: {}, hovered: null, key: '' },
      drawnMarks: [],
      rotateSnap: 15,
      rotateSpace: 'world',
      hasFitted: false,
      // The parts' body and edge materials: shared, kept for the viewport's
      // life and disposed only on unmount, so a view mode, a sketch dim or an
      // edit never destroys a linked program (docs/sketch-studio-xray-mode.md §3.4).
      materials: createMaterialCache(),
      viewMode: DEFAULT_VIEW_MODE,
      lastRenderMs: null,
    };
    // The handle under the pointer and whether it is being dragged, plus the
    // rotate state (browser checks).
    element.cadGizmo = () => ({
      axis: transform.axis,
      dragging: Boolean(transform.dragging),
      mode: ctx.transformMode,
      space: ctx.rotateSpace,
      pivot: pivot.position.toArray(),
      orientation: pivot.quaternion.toArray(),
      dial: ctx.drag?.dial?.mode || null,
      feedback: rotateLayer.children.map((c) => c.name),
      picked: ctx.pickedPivot || null,
      // What the gizmo moves: the selection key and the parts it carries.
      moving: ctx.movingId || null,
      movingIds: (ctx.movingGroups || []).map((g) => g.userData.instanceId),
    });
    // The view mode as drawn (browser checks): linked programs, cached
    // materials, the last render's duration and every part's look.
    element.cadViewMode = () => ({
      mode: ctx.viewMode,
      programs: renderer.info?.programs?.length ?? 0,
      materials: ctx.materials.size(),
      lastRenderMs: ctx.lastRenderMs,
      // Draw's outlines on show in the view (§3.5 of the outline-edit spec), the
      // chosen ones (Cut's picker: those selected) and whether a click picks them.
      shopOutlines: ctx.shopOutlineCount,
      shopOutlinesChosen: ctx.shopOutlinesChosen || [],
      shopOutlinesPickable: Boolean(outlineCallback.current),
      bodies: group.children.map((g) => {
        const [mesh, edges] = g.children;
        const box = new THREE.Box3().setFromObject(g);
        return {
          id: g.userData.instanceId,
          partId: g.userData.partId,
          visible: g.visible,
          opacity: mesh.material.opacity,
          transparent: mesh.material.transparent,
          depthWrite: mesh.material.depthWrite,
          renderOrder: mesh.renderOrder,
          color: `#${mesh.material.color.getHexString()}`,
          edgeOpacity: edges.material.opacity,
          edgeColor: `#${edges.material.color.getHexString()}`,
          edgeRenderOrder: edges.renderOrder,
          // World box as displayed (aims pixel probes).
          bounds: box.isEmpty() ? null : [box.min.toArray(), box.max.toArray()],
        };
      }),
    });
    // Screen position (client px) of a world point; used by browser checks
    // to aim at a part or gizmo without reading pixels.
    element.cadProject = (point) => {
      ctx.camera.updateMatrixWorld();
      const v = new THREE.Vector3(...point).project(ctx.camera);
      const rect = renderer.domElement.getBoundingClientRect();
      return [rect.left + ((v.x + 1) / 2) * rect.width, rect.top + ((1 - v.y) / 2) * rect.height];
    };
    // The same in canvas px, the frame ctx.pointer uses (the rotate dial).
    const projectPx = (point) => {
      const v = new THREE.Vector3(...point).project(ctx.camera);
      const rect = renderer.domElement.getBoundingClientRect();
      return [((v.x + 1) / 2) * rect.width, ((1 - v.y) / 2) * rect.height];
    };
    // Unit vector from a world point toward the viewer, as TransformControls
    // measures it: the reversed view direction for an orthographic camera.
    const eyeAt = (point) =>
      ctx.camera.isOrthographicCamera
        ? ctx.camera.getWorldDirection(new THREE.Vector3()).negate().toArray()
        : ctx.camera.position.clone().sub(point).normalize().toArray();
    sceneRef.current = ctx;
    // Client-independent screen spot of a world point in the canvas, and
    // whether it is off the canvas or behind the camera.
    const canvasSpot = (point, rect) => {
      const v = new THREE.Vector3(...point).project(ctx.camera);
      const x = ((v.x + 1) / 2) * rect.width,
        y = ((1 - v.y) / 2) * rect.height;
      return [x, y, v.z > 1 || x < 0 || y < 0 || x > rect.width || y > rect.height];
    };
    // Mark labels follow every frame: orbit, zoom, resize and drags all render.
    const placeLabels = () => {
      const container = labelsRef.current;
      if (!container || !ctx.drawnMarks.length) return;
      const rect = renderer.domElement.getBoundingClientRect();
      ctx.camera.updateMatrixWorld();
      ctx.drawnMarks.forEach(({ geometry }, i) => {
        const label = container.children[i];
        if (!label) return;
        const [x, y, hidden] = canvasSpot(geometry.labelAt, rect);
        label.hidden = hidden;
        label.style.left = `${x}px`;
        label.style.top = `${y}px`;
      });
    };
    // Sketch dimension labels (docs/sketch-studio-sketch-dimensions.md §3.4):
    // the sketcher hands each dimension as plain data through setSketchOverlay
    // ({ id, segments, labelAt, text, value, selected, preview }, sketch-plane
    // mm). The chips are rebuilt only when the id list changes, their text set
    // in place, and placed every frame like the mark labels. They let clicks
    // through: selecting is the sketcher's own hit test.
    const sketchDimensions = () => sketchLayer.userData.overlay?.dimensions || [];
    const sketchSpot = ([u, v], rect) =>
      canvasSpot(new THREE.Vector3(u, v, 0).applyMatrix4(sketchLayer.matrix).toArray(), rect);
    ctx.syncSketchDimLabels = () => {
      const container = sketchDimLabelsRef.current;
      if (!container) return;
      const dimensions = sketchDimensions();
      if (
        container.children.length !== dimensions.length ||
        dimensions.some((d, i) => container.children[i].dataset.dimensionId !== d.id)
      )
        container.replaceChildren(
          ...dimensions.map((d) => {
            const label = document.createElement('span');
            label.className = 'cad-sketch-dim-label';
            label.dataset.dimensionId = d.id;
            return label;
          }),
        );
      dimensions.forEach((d, i) => {
        const label = container.children[i];
        if (label.textContent !== d.text) label.textContent = d.text;
        label.classList.toggle('is-selected', Boolean(d.selected));
        label.classList.toggle('is-preview', Boolean(d.preview));
      });
    };
    const placeSketchDimLabels = () => {
      const container = sketchDimLabelsRef.current;
      const dimensions = sketchDimensions();
      if (!container || !dimensions.length) return;
      const rect = renderer.domElement.getBoundingClientRect();
      ctx.camera.updateMatrixWorld();
      dimensions.forEach((d, i) => {
        const label = container.children[i];
        if (!label) return;
        const [x, y, hidden] = sketchSpot(d.labelAt, rect);
        label.hidden = hidden;
        label.style.left = `${x}px`;
        label.style.top = `${y}px`;
      });
    };
    // Browser checks: each sketch dimension's label (client px) and state.
    element.cadSketchDimensions = () => {
      const rect = renderer.domElement.getBoundingClientRect();
      ctx.camera.updateMatrixWorld();
      return sketchDimensions().map((d) => {
        const [x, y, hidden] = sketchSpot(d.labelAt, rect);
        return {
          id: d.id,
          text: d.text,
          value: d.value,
          x: rect.left + x,
          y: rect.top + y,
          hidden,
          selected: Boolean(d.selected),
          preview: Boolean(d.preview),
        };
      });
    };
    // Browser checks (docs/sketch-studio-hand-drawing.md §5.5): the selection,
    // the box being dragged and the construction lines, as drawn.
    element.cadSketchOverlay = () => {
      const overlay = sketchLayer.userData.overlay;
      const drawn = (name) => sketchLayer.children.filter((o) => o.name === name);
      const look = (o) => ({
        ids: o.userData.entityIds || (o.userData.entityId ? [o.userData.entityId] : []),
        dashed: Boolean(o.material.isLineDashedMaterial),
        color: `#${o.material.color.getHexString()}`,
      });
      const [box] = drawn('sketch-box');
      // HD-2 (§6.1, §6.5): the zero's marker and Check's, as drawn.
      const [zero] = drawn('sketch-zero');
      // HD-3 (§7.3, §7.4): an action's ghost and a drag's offset, as drawn.
      const [ghost] = drawn('sketch-ghost');
      const [moved] = drawn('sketch-entity').filter((o) => !o.userData.batch);
      // HD-4 (§8.1): the red cut an Edit tool previews (its piece count and colour), and the preview's count.
      const [cut] = drawn('sketch-cut');
      return {
        ghost: ghost ? ghost.userData.count : 0,
        cut: cut ? cut.userData.count : 0,
        cutColor: cut ? `#${cut.material.color.getHexString()}` : null,
        preview: drawn('sketch-preview').length,
        dragOffset: moved?.userData.offset || null,
        markerSize: overlay?.markerSize ?? null,
        selectedIds: overlay?.selectedIds || [],
        selected: drawn('sketch-entity')
          .filter((o) => !o.userData.batch)
          .map(look),
        box: box ? { mode: box.userData.mode, ...look(box) } : null,
        construction: drawn('sketch-construction').map(look),
        zero: zero ? { at: zero.userData.at, color: `#${zero.material.color.getHexString()}` } : null,
        problems: drawn('sketch-problem').map((o) => ({
          id: o.userData.problemId,
          at: o.userData.at,
          radius: o.userData.radius,
          focused: o.userData.focused,
          color: `#${o.material.color.getHexString()}`,
        })),
      };
    };
    // The camera as a key (where it is, how it looks, the canvas's size): a
    // render with a new one tells the view's watchers, once a frame
    // (docs/sketch-studio-hand-drawing.md §7.0: the sketcher's marker sizes).
    ctx.viewWatchers = new Set();
    const viewKey = () => {
      const camera = ctx.camera;
      return [
        ...camera.position.toArray(),
        ...camera.quaternion.toArray(),
        camera.zoom,
        ...camera.projectionMatrix.elements,
        renderer.domElement.width,
        renderer.domElement.height,
      ].join(',');
    };
    let viewTold = null,
      viewTelling = false,
      // Cancels the frame that will tell the watchers (cleared on unmount).
      stopTelling = null;
    const tellView = () => {
      viewTelling = false;
      stopTelling = null;
      for (const watcher of [...ctx.viewWatchers]) watcher();
    };
    ctx.watchView = (watcher) => {
      ctx.viewWatchers.add(watcher);
      viewTold = viewKey();
      return () => ctx.viewWatchers.delete(watcher);
    };
    // Work that must happen before every draw (the press brake's grip, the
    // placement handles after an orbit step): the layers push theirs here, so
    // what they lay out is drawn in the same frame, never a frame later.
    ctx.beforeRender = [];
    const layout = () => {
      for (const hook of ctx.beforeRender) hook();
      // Spent by the hooks above: an orbit step has been laid out.
      ctx.viewMoved = false;
    };
    // One draw per React commit (docs/perf-pass-3.md §5 B1.1). While the
    // effects of a commit run (`ctx.committing`, opened and closed by the two
    // deps-less effects round the others), a render asked for, by an effect,
    // a layer or a listener an effect sets off (the gizmo's attach, the
    // controls' update), lays out at once, so whatever a later effect reads is
    // as it would have been, and the draw itself waits for the commit's last
    // effect: one frame, with the commit's final state. Outside a commit
    // (events, animation frames) a render draws at once, as it always has.
    const render = () => {
      if (!ctx.committing) return draw();
      layout();
      ctx.renderPending = true;
    };
    const draw = () => {
      ctx.renderPending = false;
      const start = performance.now();
      layout();
      // Out of sight (B1.6: the drawing focus hides the model view with
      // display: none, the ResizeObserver says so): no pixels to draw. The
      // scene graph is brought up to date as a draw would (picks and browser
      // checks read it) and the draw waits until the viewport has a size again.
      if (ctx.hidden) {
        scene.updateMatrixWorld();
        ctx.camera.updateMatrixWorld();
        ctx.renderPending = true;
        return;
      }
      renderer.render(scene, ctx.camera);
      ctx.lastRenderMs = performance.now() - start;
      placeLabels();
      placeSketchDimLabels();
      ctx.placePlaneLabels?.();
      ctx.shopLayer?.placeLabels();
      if (ctx.viewWatchers.size) {
        const key = viewKey();
        if (key !== viewTold && !viewTelling) {
          viewTold = key;
          viewTelling = true;
          if (typeof requestAnimationFrame === 'function') {
            const frame = requestAnimationFrame(tellView);
            stopTelling = () => cancelAnimationFrame(frame);
          } else {
            const timer = setTimeout(tellView, 16);
            stopTelling = () => clearTimeout(timer);
          }
        }
      }
    };
    ctx.render = render;
    // The name the effects use: in a commit it is the same deferred render.
    ctx.requestRender = render;
    // The commit's last effect: the one draw, if anything asked for one.
    ctx.flushRender = () => {
      if (!ctx.committing) return;
      ctx.committing = false;
      if (ctx.renderPending) draw();
    };
    // An orbit, pan or zoom: the layers that keep a size on screen lay out
    // again before this draw (ctx.viewMoved, read by their beforeRender hooks).
    controls.addEventListener('change', () => {
      ctx.viewMoved = true;
      render();
    });
    let drag = null,
      consumedPointer = false,
      // A ring click in Picked point mode, handed on to pointerUp as a pick.
      pickClick = false;
    // Floating readout beside the cursor while a gizmo drag is active: the
    // angle or move so far, and any exact value being typed.
    const hud = hudRef.current;
    if (hud) hud.hidden = true;
    let typed = '';
    // Below-right of the cursor, flipped to the left / above it near the
    // right / bottom edge so the readout never leaves the viewport.
    // `size`: { width, height, w, h } measured already (a readout rewritten every
    // move keeps its size: no layout forced per move), else read now.
    const placeBox = (node, size = null) => {
      if (!node || !ctx.pointer) return;
      const [px, py] = ctx.pointer;
      let x = px + HUD_OFFSET,
        y = py + HUD_OFFSET;
      const width = size ? size.width : element.clientWidth,
        height = size ? size.height : element.clientHeight;
      if (width && height) {
        const w = size ? size.w : node.offsetWidth,
          h = size ? size.h : node.offsetHeight;
        if (x + w > width - HUD_MARGIN) x = px - HUD_OFFSET - w;
        if (y + h > height - HUD_MARGIN) y = py - HUD_OFFSET - h;
        x = Math.max(HUD_MARGIN, Math.min(x, width - HUD_MARGIN - w));
        y = Math.max(HUD_MARGIN, Math.min(y, height - HUD_MARGIN - h));
      }
      node.style.left = `${x}px`;
      node.style.top = `${y}px`;
    };
    const placeHud = () => placeBox(hud);
    // Live poses of the displayed parts (a pending placement and a drag included).
    const groupPoses = (withBounds = false) => {
      const poses = new Map();
      if (withBounds) group.updateMatrixWorld(true);
      for (const g of group.children) {
        g.updateMatrix();
        const pose = {
          matrix: withBounds ? g.matrix.clone() : g.matrix,
          placement: g.userData.placement,
          visible: g.visible,
        };
        if (withBounds) {
          const box = new THREE.Box3().setFromObject(g);
          pose.bounds = box.isEmpty() ? null : [box.min.toArray(), box.max.toArray()];
        }
        poses.set(g.userData.instanceId, pose);
      }
      return poses;
    };
    ctx.groupPoses = groupPoses;
    const sceneSpan = () => {
      const box = new THREE.Box3();
      group.updateMatrixWorld(true);
      for (const g of group.children) if (g.visible) box.expandByObject(g);
      return box.isEmpty() ? 0 : box.getSize(new THREE.Vector3()).length();
    };
    ctx.sceneSpan = sceneSpan;
    // Persistent marks: one LineSegments per drawn mark (dimension line,
    // extensions, ticks) plus a label button, updated in place while the same
    // marks stay drawn. A mark whose part is missing or hidden is not drawn.
    const syncLabels = () => {
      const container = labelsRef.current;
      if (!container) return;
      const ids = ctx.drawnMarks.map((d) => d.mark.id);
      if (container.children.length !== ids.length || ids.some((id, i) => container.children[i].dataset.markId !== id))
        container.replaceChildren(
          ...ids.map((id) => {
            const label = document.createElement('button');
            label.type = 'button';
            label.className = 'cad-mark-label';
            label.dataset.markId = id;
            label.title = 'Select this mark';
            label.addEventListener('pointerdown', (event) => event.stopPropagation());
            label.addEventListener('click', (event) => {
              event.stopPropagation();
              markCallbacks.current.onSelectMark?.(id);
            });
            return label;
          }),
        );
      ctx.drawnMarks.forEach(({ mark, geometry }, i) => {
        const label = container.children[i];
        label.textContent = formatMm(geometry.value);
        label.classList.toggle('is-selected', mark.id === ctx.selectedMarkId);
      });
    };
    const updateMarks = () => {
      const poses = groupPoses();
      const drawn = [];
      if (!ctx.hideMarks)
        for (const mark of ctx.marks || []) {
          const A = anchorWorld(mark.from, poses),
            B = anchorWorld(mark.to, poses);
          if (A && B) drawn.push({ mark, A, B, geometry: markGeometry(mark, A, B) });
        }
      ctx.drawnMarks = drawn;
      const same =
        markLayer.children.length === drawn.length &&
        drawn.every((d, i) => markLayer.children[i].userData.markId === d.mark.id);
      if (!same) {
        clearLayer(markLayer);
        for (const { mark } of drawn) {
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MARK_POINTS * 3), 3));
          const line = new THREE.LineSegments(
            geometry,
            new THREE.LineBasicMaterial({ color: MARK_COLOR, depthTest: false, transparent: true }),
          );
          line.name = 'mark';
          line.userData.markId = mark.id;
          line.renderOrder = 34;
          line.frustumCulled = false;
          markLayer.add(line);
        }
      }
      drawn.forEach(({ mark, geometry }, i) => {
        const line = markLayer.children[i];
        const position = line.geometry.getAttribute('position');
        [geometry.dimension, ...geometry.extensions, ...geometry.ticks]
          .flat()
          .forEach((p, j) => position.setXYZ(j, p[0], p[1], p[2]));
        position.needsUpdate = true;
        line.material.color.set(mark.id === ctx.selectedMarkId ? MARK_SELECTED_COLOR : MARK_COLOR);
      });
      syncLabels();
      // Prints ride the poses just shown too (a drag included).
      ctx.shopLayer?.syncPoses();
    };
    ctx.updateMarks = updateMarks;
    // Measure tool: the snapped point under the pointer, a marker there, and
    // after the first click a rubber band plus a preview of the mark.
    const measureHud = measureHudRef.current,
      labels = labelsRef.current;
    if (measureHud) measureHud.hidden = true;
    const measureAt = (event) => {
      const caster = rayAt(event);
      const hits = caster
        .intersectObjects(group.children, true)
        .filter((hit) => hit.object.isMesh && hit.object.parent.visible);
      // X-ray / Wireframe: a glass body hides nothing, so the occluder is the
      // first body that is opaque in this mode (none in Wireframe).
      const occluder = isSeeThrough(ctx.viewMode) ? hits.find((hit) => hit.object.material.opacity === 1) : hits[0];
      const rect = renderer.domElement.getBoundingClientRect();
      group.updateMatrixWorld(true);
      const projected = new THREE.Vector3();
      const candidates = (hit) =>
        measureCandidates({
          pointer: [event.clientX - rect.left, event.clientY - rect.top],
          groups: group.children.map((g) => ({
            instanceId: g.userData.instanceId,
            matrix: g.matrix,
            placement: g.userData.placement,
            bounds: g.userData.bounds,
            visible: g.visible,
            positions: g.children[1]?.geometry.getAttribute('position')?.array,
          })),
          marks: markSnapPoints(ctx.drawnMarks),
          ray: caster.ray,
          camera: ctx.camera,
          project: (v) => {
            projected.copy(v).project(ctx.camera);
            return [((projected.x + 1) / 2) * rect.width, ((1 - projected.y) / 2) * rect.height];
          },
          hit: hit ? { point: hit.point.toArray(), instanceId: hit.object.userData.instanceId } : null,
          height: rect.height,
        });
      const found = candidates(occluder);
      // Nothing to snap to and no solid face behind the glass: the glass face
      // under the cursor is still a point on a part.
      if (!found && hits[0] && hits[0] !== occluder) return candidates(hits[0]);
      return found;
    };
    const drawMeasure = () => {
      clearLayer(measureLayer);
      if (!ctx.measureMode) return;
      const rect = renderer.domElement.getBoundingClientRect();
      ctx.camera.updateMatrixWorld();
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(ctx.camera.quaternion),
        up = new THREE.Vector3(0, 1, 0).applyQuaternion(ctx.camera.quaternion);
      // A screen-facing square, MEASURE_MARKER_PX from its centre to a side.
      const marker = (point) => {
        const r = MEASURE_MARKER_PX * mmPerPixelAt(ctx.camera, point, rect.height);
        const c = new THREE.Vector3(...point);
        const corner = (u, v) =>
          c
            .clone()
            .addScaledVector(right, u * r)
            .addScaledVector(up, v * r)
            .toArray();
        return [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1), corner(-1, -1)];
      };
      const first = ctx.measureFirst,
        hover = ctx.measureHover;
      if (first) measureLayer.add(overlayLine(marker(first.point), 'measure-first'));
      if (hover) measureLayer.add(overlayLine(marker(hover.point), 'measure-cursor'));
      if (first && hover) {
        measureLayer.add(overlayLine([first.point, hover.point], 'measure-band', 0.6));
        const offset = markOffset({
          from: first.anchor,
          to: hover.anchor,
          A: first.point,
          B: hover.point,
          poses: groupPoses(true),
          span: sceneSpan(),
        });
        const preview = markGeometry({ along: 'aligned', offset }, first.point, hover.point);
        measureLayer.add(
          overlayLine([preview.dimension, ...preview.extensions, ...preview.ticks].flat(), 'measure-preview', 1, true),
        );
      }
    };
    // Before the first point: the snap kind under the cursor; after it: the
    // straight distance, the axis deltas and the snap kind.
    const updateMeasureHud = () => {
      if (!measureHud) return;
      if (!ctx.measureMode || !ctx.pointer) {
        measureHud.hidden = true;
        measureHud.innerHTML = '';
        return;
      }
      const first = ctx.measureFirst,
        hover = ctx.measureHover;
      let html = 'Point at a part';
      if (hover && !first) html = `<span class="cad-gizmo-snap">${hover.kind}</span>`;
      else if (hover) {
        const d = hover.point.map((v, i) => v - first.point[i]);
        html =
          `<span class="cad-gizmo-value">${formatMm(Math.hypot(...d))} mm</span>` +
          ['X', 'Y', 'Z']
            .map((name, i) => ` · <span class="cad-axis-${name.toLowerCase()}">Δ${name}</span> ${formatMm(d[i])}`)
            .join('') +
          ` · <span class="cad-gizmo-snap">${hover.kind}</span>`;
      }
      measureHud.innerHTML = html;
      measureHud.hidden = false;
      placeBox(measureHud);
    };
    const showMissed = (missed) => {
      if (ctx.measureMissed === missed) return;
      ctx.measureMissed = missed;
      setMeasureMissed(missed);
    };
    const refreshMeasure = () => {
      drawMeasure();
      updateMeasureHud();
      render();
    };
    // Esc with a first point (the workspace calls this), or the tool ending.
    ctx.cancelMeasure = () => {
      ctx.measureFirst = null;
      setMeasureStage('first');
      if (!ctx.measureMode) {
        ctx.measureHover = null;
        showMissed(false);
      }
      refreshMeasure();
    };
    const measureMove = (event) => {
      if (!ctx.measureMode || event.buttons) return;
      ctx.measureHover = measureAt(event);
      if (ctx.measureHover) showMissed(false);
      refreshMeasure();
    };
    // Two clicks make a mark; a click on nothing is ignored.
    const measureClick = (event) => {
      const picked = measureAt(event);
      ctx.measureHover = picked;
      showMissed(!picked);
      const first = ctx.measureFirst;
      if (picked && !first) {
        ctx.measureFirst = picked;
        setMeasureStage('second');
      } else if (picked && Math.hypot(...picked.point.map((v, i) => v - first.point[i])) >= 1e-6) {
        ctx.measureFirst = null;
        setMeasureStage('first');
        markCallbacks.current.onMeasure?.({
          from: first.anchor,
          to: picked.anchor,
          fromWorld: first.point,
          toWorld: picked.point,
        });
      }
      refreshMeasure();
    };
    // Browser checks: the tool state and where each mark label sits (client px).
    element.cadMarks = () => {
      const rect = renderer.domElement.getBoundingClientRect();
      ctx.camera.updateMatrixWorld();
      return {
        measuring: Boolean(ctx.measureMode),
        first: ctx.measureFirst?.point || null,
        snapKind: ctx.measureHover?.kind || null,
        labels: ctx.drawnMarks.map(({ mark, geometry }) => {
          const [x, y] = canvasSpot(geometry.labelAt, rect);
          return {
            id: mark.id,
            text: formatMm(geometry.value),
            x: rect.left + x,
            y: rect.top + y,
            selected: mark.id === ctx.selectedMarkId,
          };
        }),
      };
    };
    // The drawn mark point within SNAP_PX of a canvas point, if any.
    const markPointNear = (screen) => {
      let best = null,
        bestDistance = SNAP_PX;
      for (const { point } of markSnapPoints(ctx.drawnMarks)) {
        const v = new THREE.Vector3(...point).project(ctx.camera);
        if (v.z > 1) continue;
        const [x, y] = projectPx(point);
        const distance = Math.hypot(x - screen[0], y - screen[1]);
        if (distance <= bestDistance) {
          best = point;
          bestDistance = distance;
        }
      }
      return best;
    };
    const hideHud = () => {
      typed = '';
      if (!hud) return;
      hud.hidden = true;
      hud.innerHTML = '';
    };
    const updateHud = () => {
      if (!hud || !drag) return hideHud();
      const handle = transform.axis;
      let html;
      if (drag.mode === 'rotate') {
        // The applied turn, read in the ring's frame (the part's own axes in Local).
        const turn = worldToLocalTurn(drag.turn, drag.attach.toArray());
        // Counted like the dial, so a sweep past ±180° (or a full turn) keeps its sign and size.
        html = rotationReadout(turn, handle, { space: drag.space, near: drag.dial ? drag.swept : null }).html;
        if (drag.dial) html += snapLabel(ctx.rotateSnap, ctx.altDown).html;
      } else html = translationReadout(pivot.position.clone().sub(drag.start).toArray(), ctx.lastSnaps || []).html;
      if (typingSupported(drag.mode, handle)) html += typedHtml(typed, drag.mode);
      hud.innerHTML = html;
      hud.hidden = false;
      placeHud();
    };
    // Show drag.turn: the gizmo at turn · attach and the displayed meshes
    // (one part, or every part of a group) spun about the gizmo center; the
    // kernel rebuild follows on release.
    const showTurn = () => {
      const turn = new THREE.Quaternion(...drag.turn);
      pivot.quaternion.multiplyQuaternions(turn, drag.attach);
      const c = drag.start;
      const motion = new THREE.Matrix4()
        .makeTranslation(c.x, c.y, c.z)
        .multiply(new THREE.Matrix4().makeRotationFromQuaternion(turn))
        .multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z));
      drag.motion = motion;
      moveGroups(drag.groups, motion);
      updateMarks();
    };
    const dialOptions = () => ({ snap: ctx.rotateSnap, free: Boolean(ctx.altDown) });
    const applyDial = (result) => {
      drag.turn = result.quaternion;
      drag.swept = result.snapped;
      showTurn();
      drawRotateFeedback(drag.feedback, {
        center: drag.start,
        axis: drag.dial.axis,
        radius: drag.radius,
        start: result.start,
        degrees: result.snapped,
      });
      updateHud();
      render();
    };
    // Registered when a ring drag starts, so it runs after TransformControls'
    // own pointermove on the same event: the dial has the last word on the
    // pivot, and this is the one render per move.
    const dialMove = (event) => {
      if (!drag?.dial) return;
      const rect = renderer.domElement.getBoundingClientRect();
      ctx.altDown = event.altKey;
      applyDial(drag.dial.update([event.clientX - rect.left, event.clientY - rect.top], dialOptions()));
    };
    const endRotateFeedback = () => {
      renderer.domElement.removeEventListener('pointermove', dialMove);
      clearRotateFeedback(rotateLayer);
    };
    // Geometry a rebuild replaced mid-drag that the rotate ghost still drew
    // (see the snapshot effect): released once the drag is over.
    const releaseDeferredGeometry = () => {
      for (const geometry of ctx.deferredGeometry) geometry.dispose();
      ctx.deferredGeometry = [];
    };
    ctx.deferredGeometry = [];
    const cancelDrag = () => {
      drawSnapHighlights(snapLayer, null);
      endRotateFeedback();
      releaseDeferredGeometry();
      hideHud();
      if (!drag) return;
      pivot.position.copy(drag.start);
      pivot.quaternion.copy(drag.attach);
      moveGroups(drag.groups, null);
      updateMarks();
      drag = null;
      ctx.drag = null;
      transform.dragging = false;
      controls.enabled = true;
      render();
    };
    ctx.cancelDrag = cancelDrag;
    transform.addEventListener('dragging-changed', (event) => {
      controls.enabled = !event.value;
    });
    transform.addEventListener('mouseDown', () => {
      // The boolean tool gizmo (direct placement) owns this drag.
      if (ctx.toolGizmo) {
        consumedPointer = true;
        ctx.placementLayer.toolDown();
        return;
      }
      // The part, or every part of a group (attached ones too: they move on screen).
      const moving = (ctx.movingGroups || []).filter((g) => g.parent === ctx.group);
      if (!moving.length) return;
      consumedPointer = true;
      typed = '';
      ctx.lastSnaps = [];
      drag = {
        groups: moving.map((g) => {
          g.updateMatrix();
          return { group: g, start: g.matrix.clone() };
        }),
        id: ctx.movingId,
        mode: ctx.transformMode,
        start: pivot.position.clone(),
        grab: ctx.pointer ? [...ctx.pointer] : null,
        // Identity in World space; the part's orientation in Local space.
        attach: pivot.quaternion.clone(),
        space: ctx.rotateSpace,
        turn: [0, 0, 0, 1],
      };
      const unit = drag.mode === 'rotate' && AXIS_UNITS[transform.axis];
      if (unit) {
        // A ring drag: the dial owns the angle from here on.
        ctx.camera.updateMatrixWorld();
        drag.radius = gizmoRingRadius(ctx.camera, drag.start.toArray());
        drag.dial = startDial({
          pivot: drag.start.toArray(),
          pointer: ctx.pointer || projectPx(drag.start.toArray()),
          axis: new THREE.Vector3(...unit).applyQuaternion(drag.attach).toArray(),
          eye: eyeAt(drag.start),
          radius: drag.radius,
          project: projectPx,
        });
        drag.feedback = createRotateFeedback(rotateLayer, drag.groups, AXIS_COLORS[transform.axis]);
        renderer.domElement.addEventListener('pointermove', dialMove);
        // Readout and start radial from the moment of the grab.
        applyDial(drag.dial.refresh(dialOptions()));
      }
      if (drag.mode !== 'rotate') {
        // World boxes at drag start: the moving parts (one union box) and
        // every other visible part.
        ctx.group.updateMatrixWorld(true);
        const toBox = (box) => (box.isEmpty() ? null : { min: box.min.toArray(), max: box.max.toArray() });
        drag.box = toBox(unionBox(moving));
        drag.others = ctx.group.children
          .filter((g) => !moving.includes(g) && g.visible)
          .map((g) => toBox(new THREE.Box3().setFromObject(g)))
          .filter(Boolean);
        // Drawn mark points (not those riding on the moving parts) pull a face or the centre.
        drag.markPoints = markSnapPoints(ctx.drawnMarks, {
          exclude: new Set(moving.map((g) => g.userData.instanceId)),
        }).map((p) => p.point);
        const scene = new THREE.Box3().setFromObject(ctx.group);
        drag.threshold = snapThreshold(scene.isEmpty() ? 0 : scene.getSize(new THREE.Vector3()).length());
      }
      ctx.drag = drag;
    });
    transform.addEventListener('objectChange', () => {
      if (ctx.toolGizmo) return ctx.placementLayer.toolChange();
      if (drag?.mode === 'rotate') {
        if (drag.dial) {
          // TransformControls just applied its tangent-travel angle to the
          // pivot; put the dial's turn back. dialMove draws this move.
          pivot.quaternion.multiplyQuaternions(new THREE.Quaternion(...drag.turn), drag.attach);
          return;
        }
        drag.turn = worldTurn(pivot.quaternion.toArray(), drag.attach.toArray());
        showTurn();
      } else if (drag) {
        const delta = pivot.position.clone().sub(drag.start);
        if (ctx.snap > 0) delta.set(...delta.toArray().map((n) => Math.round(n / ctx.snap) * ctx.snap));
        // Snap 0 or holding Alt moves freely; otherwise faces snap flush or
        // aligned to nearby parts along the axes this handle moves.
        let snaps = [];
        if (ctx.snap > 0 && !ctx.altDown && drag.box) {
          const result = snapBoxDelta(drag.box, delta.toArray(), drag.others, {
            threshold: drag.threshold,
            axes: gizmoAxes(transform.axis),
            points: drag.markPoints,
          });
          delta.set(...result.delta);
          snaps = result.snaps;
        }
        drawSnapHighlights(
          snapLayer,
          drag.box && snaps.length ? { box: drag.box, delta: delta.toArray(), snaps } : null,
        );
        ctx.lastSnaps = snaps;
        pivot.position.copy(drag.start).add(delta);
        drag.motion = new THREE.Matrix4().makeTranslation(delta.x, delta.y, delta.z);
        moveGroups(drag.groups, drag.motion);
        updateMarks();
      }
      updateHud();
      render();
    });
    // During a ring drag dialMove renders each move; TransformControls'
    // change in between would only draw its own, discarded angle. A move or
    // tool-gizmo drag's pointer move sends change then objectChange: the
    // objectChange listener draws it once, after the snap and the parts have
    // moved, so the change before it would only draw a stale frame.
    transform.addEventListener('change', () => {
      if (drag?.dial) return;
      if (transform.dragging && (drag || ctx.placementLayer?.toolDragging())) return;
      render();
    });
    transform.addEventListener('mouseUp', () => {
      if (ctx.toolGizmo) return ctx.placementLayer.toolUp();
      drawSnapHighlights(snapLayer, null);
      endRotateFeedback();
      releaseDeferredGeometry();
      hideHud();
      if (!drag) return;
      const completed = drag;
      drag = null;
      ctx.drag = null;
      if (completed.mode === 'rotate') {
        // A world turn about the world pivot, whatever the gizmo space.
        const turn = completed.dial
          ? completed.turn
          : worldTurn(pivot.quaternion.toArray(), completed.attach.toArray());
        pivot.quaternion.copy(completed.attach);
        // Rotate about: Picked point. The rings cover much of a small part,
        // so a click on one (no travel) picks the point under it instead.
        const travel =
          completed.grab && ctx.pointer
            ? Math.hypot(ctx.pointer[0] - completed.grab[0], ctx.pointer[1] - completed.grab[1])
            : Infinity;
        if (ctx.pivotPick && travel <= CLICK_PX) {
          moveGroups(completed.groups, null);
          pickClick = true;
          render();
          return;
        }
        render();
        if (2 * Math.acos(Math.min(1, Math.abs(turn[3]))) > 1e-6)
          rotateCallback.current?.(completed.id, turn, completed.start.toArray());
        return;
      }
      const delta = pivot.position.clone().sub(completed.start).toArray();
      if (delta.some((value) => Math.abs(value) > 1e-6)) moveCallback.current?.(completed.id, delta);
    });
    let holeDrag = null;
    // Only a live hole drag hands the orbit back: the hole effect calls this
    // on every rebuild, which may land in the middle of another owner's drag.
    const cancelHoleDrag = () => {
      if (!holeDrag) return;
      holeDrag.handle.position.copy(holeDrag.start);
      holeDrag = null;
      controls.enabled = true;
      render();
    };
    ctx.cancelHoleDrag = cancelHoleDrag;
    // Alt frees the box snap while moving and the angle snap while turning.
    // Pressing or releasing it mid-turn re-applies the dial at once.
    const trackAlt = (event) => {
      const changed = ctx.altDown !== event.altKey;
      ctx.altDown = event.altKey;
      if (event.key === 'Alt' && (drag || ctx.gripPressed?.())) event.preventDefault(); // keep the menu bar out of a drag
      if (changed && drag?.dial) applyDial(drag.dial.refresh(dialOptions()));
      if (changed) ctx.gripAlt?.();
    };
    const releaseAlt = () => {
      ctx.altDown = false;
    };
    window.addEventListener('keyup', trackAlt);
    window.addEventListener('blur', releaseAlt);
    const keyDown = (event) => {
      trackAlt(event);
      // A press brake handle in the hand: Esc puts the sheet back, digits + Enter set the angle.
      if (ctx.gripKey?.(event)) return;
      // A placement handle drag: Esc cancels it, digits + Enter set a value.
      if (ctx.placementLayer?.key(event)) return;
      // A print dragged on its face: Esc puts it back.
      if (event.key === 'Escape' && ctx.cancelPrintDrag?.()) {
        event.preventDefault();
        return;
      }
      if (event.key === 'Escape' && ctx.holeMode) {
        event.preventDefault();
        cancelHoleDrag();
        holeCallbacks.current.onCancelHole?.();
      }
      if (event.key === 'Escape' && drag) {
        event.preventDefault();
        cancelDrag();
        return;
      }
      // An exact value typed during a single-axis drag: Enter applies it about
      // the ring's axis (rotate) or along the arrow's axis (move).
      if (!drag || !typingSupported(drag.mode, transform.axis) || event.ctrlKey || event.metaKey || event.altKey)
        return;
      if (event.target instanceof HTMLElement && event.target.closest('input, select, textarea')) return;
      if (event.key === 'Enter') {
        const value = Number(typed);
        if (!typed || !Number.isFinite(value)) return;
        event.preventDefault();
        const completed = drag,
          handle = transform.axis;
        cancelDrag();
        if (completed.mode === 'rotate') {
          // About the ring's axis: the part's own axis in Local space.
          const local = typedRotation(handle, value);
          const turn = local && localToWorldTurn(local, completed.attach.toArray());
          if (turn && Math.abs(value) > 1e-9) rotateCallback.current?.(completed.id, turn, completed.start.toArray());
        } else {
          const delta = typedTranslation(handle, value);
          if (delta && Math.abs(value) > 1e-9) moveCallback.current?.(completed.id, delta);
        }
        return;
      }
      const next = typeKey(typed, event.key);
      if (next == null) return;
      event.preventDefault();
      typed = next;
      updateHud();
    };
    window.addEventListener('keydown', keyDown);
    window.addEventListener('blur', cancelDrag);
    renderer.domElement.addEventListener('pointercancel', cancelDrag);
    window.addEventListener('blur', cancelHoleDrag);
    renderer.domElement.addEventListener('pointercancel', cancelHoleDrag);
    const resize = () => {
      const width = element.clientWidth,
        height = element.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height);
      const cam = ctx.camera;
      if (cam.isPerspectiveCamera) cam.aspect = width / height;
      else {
        cam.left = (-ctx.span * width) / height / 2;
        cam.right = -cam.left;
        cam.top = ctx.span / 2;
        cam.bottom = -cam.top;
      }
      cam.updateProjectionMatrix();
      render();
    };
    ctx.resize = resize;
    // A viewport of no size is out of sight (draw holds its draws); back in
    // sight, the resize draws what was held.
    const observer = new ResizeObserver(() => {
      ctx.hidden = !element.clientWidth || !element.clientHeight;
      resize();
    });
    observer.observe(element);
    resize();
    let down;
    const rayAt = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      // The camera may have moved (focus, zoom) since the last frame.
      ctx.camera.updateMatrixWorld();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(
        new THREE.Vector2(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          1 - ((event.clientY - rect.top) / rect.height) * 2,
        ),
        ctx.camera,
      );
      return ray;
    };
    ctx.rayAt = rayAt;
    // Origin plane tiles (docs/sketch-studio-start-sketch.md §4.2): shown on
    // an empty model at rest and while picking where a new sketch goes. A
    // tile or its label starts a sketch on that plane; while picking, the
    // nearest of the model and the tiles under the cursor wins.
    const planeChips = {};
    const planeLabels = planeLabelsRef.current;
    const sketchPicking = () => ctx.sketchMode === 'pick' && ctx.planes.visible;
    const showHoverHint = (text) => {
      if (ctx.hoverHint === text) return;
      ctx.hoverHint = text;
      setHoverHint(text);
    };
    const setTileHover = (plane) => {
      if (ctx.planes.hovered === plane) return;
      ctx.planes.hovered = plane;
      for (const object of planeLayer.children) {
        const on = object.userData.plane === plane;
        if (object.isMesh) object.material.opacity = on ? TILE_HOVER_ALPHA : TILE_ALPHA;
        else object.material.color.set(on ? TILE_EDGE_HOVER : TILE_EDGE);
      }
      for (const name of ORIGIN_PLANES) planeChips[name]?.classList.toggle('is-hovered', name === plane);
    };
    // The face outline is rebuilt only when the hovered face changes.
    const outlineFace = (info) => {
      if (ctx.outlinedFace === info) return;
      ctx.outlinedFace = info;
      clearLayer(pickLayer);
      if (!info?.outlineWorld?.length) return;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(info.outlineWorld.flat(2), 3));
      const line = new THREE.LineSegments(
        geometry,
        new THREE.LineBasicMaterial({ color: PICK_COLOR, depthTest: false, transparent: true }),
      );
      line.name = 'pick-face';
      line.renderOrder = 37;
      line.frustumCulled = false;
      pickLayer.add(line);
    };
    const clearPlaneHover = () => {
      setTileHover(null);
      ctx.hoverFace = null;
      outlineFace(null);
      showHoverHint('');
      renderer.domElement.style.cursor = '';
    };
    ctx.clearPlaneHover = () => {
      clearPlaneHover();
      render();
    };
    // What a click here would pick: a tile, a flat or curved face (while
    // picking), another model hit, or nothing. `pickedFace` copies the whole
    // mesh, so a hover on a triangle of the face already outlined reuses it.
    const planeTarget = (event, fresh = false) => {
      const caster = rayAt(event);
      const modelHit = caster
        .intersectObjects(group.children, true)
        .find((hit) => hit.object.isMesh && hit.object.parent.visible);
      const tileHit = ctx.planes.visible
        ? caster.intersectObjects(
            planeLayer.children.filter((o) => o.isMesh),
            false,
          )[0]
        : null;
      // A face lying in a tile's plane (a part built from the origin) wins the tie.
      if (tileHit && (!modelHit || tileHit.distance < modelHit.distance - TILE_TIE_MM))
        return { kind: 'plane', plane: tileHit.object.userData.plane };
      if (!modelHit) return null;
      if (!sketchPicking()) return { kind: 'model' };
      const cached = ctx.hoverFace;
      let info;
      if (!fresh && cached?.object === modelHit.object && cached.triangles.has(modelHit.faceIndex)) info = cached.info;
      else {
        info = pickedFace(modelHit);
        ctx.hoverFace = {
          object: modelHit.object,
          triangles: new Set(info.triangles || [modelHit.faceIndex]),
          info,
        };
      }
      return { kind: info.planar ? 'face' : 'curved', info };
    };
    const partName = (partId) => ctx.model?.parts.find((p) => p.id === partId)?.name;
    const showPlaneTarget = (target) => {
      setTileHover(target?.kind === 'plane' ? target.plane : null);
      outlineFace(target?.kind === 'face' ? target.info : null);
      showHoverHint(
        target?.kind === 'plane'
          ? planeHint(target.plane, ctx.planes.offset)
          : target?.kind === 'face'
            ? faceHint(partName(target.info.partId))
            : target?.kind === 'curved'
              ? CURVED_HINT
              : '',
      );
      renderer.domElement.style.cursor = target?.kind === 'plane' || target?.kind === 'face' ? 'pointer' : '';
      render();
    };
    const pickPlane = (plane) => {
      const offset = ctx.planes.offset;
      clearPlaneHover();
      holeCallbacks.current.onPickSketchPlane?.(plane, offset);
    };
    // Hover runs at most once per animation frame, from the latest pointer.
    let hoverFrame = 0,
      hoverPointer = null;
    const runPlaneHover = () => {
      hoverFrame = 0;
      const pointer = hoverPointer;
      hoverPointer = null;
      if (!pointer) return;
      if (!ctx.planes.visible && !sketchPicking()) return;
      showPlaneTarget(planeTarget(pointer));
    };
    const planeMove = (event) => {
      // A held button is an orbit or pan; hover waits for it to end.
      if (event.buttons || (!ctx.planes.visible && !sketchPicking())) return;
      hoverPointer = { clientX: event.clientX, clientY: event.clientY };
      if (!hoverFrame) hoverFrame = requestAnimationFrame(runPlaneHover);
    };
    const planeLeave = () => {
      if (hoverFrame) cancelAnimationFrame(hoverFrame);
      hoverFrame = 0;
      hoverPointer = null;
      if (ctx.planes.hovered || ctx.outlinedFace || ctx.hoverHint) ctx.clearPlaneHover();
    };
    renderer.domElement.addEventListener('pointermove', planeMove);
    renderer.domElement.addEventListener('pointerleave', planeLeave);
    if (planeLabels)
      planeLabels.replaceChildren(
        ...ORIGIN_PLANES.map((plane) => {
          const chip = document.createElement('button');
          chip.type = 'button';
          chip.className = 'cad-plane-label';
          chip.dataset.plane = plane;
          chip.textContent = planeLabel(plane);
          chip.title = `Start a sketch on the ${PLANE_NAMES[plane]} plane (${plane})`;
          chip.hidden = true;
          chip.addEventListener('pointerdown', (event) => event.stopPropagation());
          chip.addEventListener('pointerenter', () => {
            setTileHover(plane);
            outlineFace(null);
            showHoverHint(planeHint(plane, ctx.planes.offset));
            render();
          });
          chip.addEventListener('pointerleave', () => {
            if (ctx.planes.hovered === plane) ctx.clearPlaneHover();
          });
          chip.addEventListener('click', (event) => {
            event.stopPropagation();
            pickPlane(plane);
          });
          planeChips[plane] = chip;
          return chip;
        }),
      );
    // Labels at each tile's (+S/2, +S/2) corner, pushed outward on screen
    // (away from the tile's centre) so they sit clear of the tile, and kept
    // inside the canvas when that corner is off it (hidden only behind the camera).
    ctx.placePlaneLabels = () => {
      if (!ctx.planes.visible) return;
      const rect = renderer.domElement.getBoundingClientRect();
      ctx.camera.updateMatrixWorld();
      const spots = ORIGIN_PLANES.map((plane) => {
        const chip = planeChips[plane];
        const corners = ctx.planes.tiles[plane];
        if (!chip || !corners) return null;
        const anchor = corners[LABEL_CORNER];
        const centre = [0, 1, 2].map((i) => (corners[0][i] + corners[2][i]) / 2);
        const [x, y] = canvasSpot(anchor, rect);
        const [cx, cy] = canvasSpot(centre, rect);
        const behind = new THREE.Vector3(...anchor).project(ctx.camera).z > 1;
        const length = Math.hypot(x - cx, y - cy) || 1;
        return { chip, x, y, behind, dx: (x - cx) / length, dy: (y - cy) / length };
      });
      // Read every size before writing any position (one layout pass).
      const sizes = spots.map((s) => s && [s.chip.offsetWidth, s.chip.offsetHeight]);
      spots.forEach((s, i) => {
        if (!s) return;
        const [w, h] = sizes[i];
        const push = LABEL_GAP_PX + (Math.abs(s.dx) * w) / 2 + (Math.abs(s.dy) * h) / 2;
        // The chip is centred on its position (translate −50%); keep it whole on the canvas.
        const clamp = (value, half, extent) =>
          extent > 2 * (half + HUD_MARGIN)
            ? Math.max(half + HUD_MARGIN, Math.min(value, extent - half - HUD_MARGIN))
            : value;
        s.chip.hidden = s.behind;
        s.chip.style.left = `${clamp(s.x + s.dx * push, w / 2, rect.width)}px`;
        s.chip.style.top = `${clamp(s.y + s.dy * push, h / 2, rect.height)}px`;
      });
    };
    // Show, move (offset) or hide the tiles; sized from the displayed model.
    ctx.syncPlanes = (visible, offset) => {
      const box = new THREE.Box3();
      group.updateMatrixWorld(true);
      for (const g of group.children) if (g.visible) box.expandByObject(g);
      const next = planeTiles({ bounds: box.isEmpty() ? null : [box.min.toArray(), box.max.toArray()], offset });
      const key = visible ? `${next.size}|${next.offset}` : '';
      ctx.planes.size = next.size;
      if (key === ctx.planes.key) return;
      clearPlaneHover();
      clearLayer(planeLayer);
      ctx.planes = { visible, size: next.size, offset: next.offset, tiles: next.tiles, hovered: null, key };
      for (const plane of ORIGIN_PLANES) {
        const chip = planeChips[plane];
        if (chip) {
          chip.hidden = !visible;
          chip.classList.remove('is-hovered');
        }
        if (!visible) continue;
        const corners = next.tiles[plane].flat();
        const fillGeometry = new THREE.BufferGeometry();
        fillGeometry.setAttribute('position', new THREE.Float32BufferAttribute(corners, 3));
        fillGeometry.setIndex([0, 1, 2, 0, 2, 3]);
        const fill = new THREE.Mesh(
          fillGeometry,
          new THREE.MeshBasicMaterial({
            color: TILE_COLOR,
            transparent: true,
            opacity: TILE_ALPHA,
            depthWrite: false,
            side: THREE.DoubleSide,
            // A part face lying in the plane draws over the tile, not through it.
            polygonOffset: true,
            polygonOffsetFactor: 1,
            polygonOffsetUnits: 1,
          }),
        );
        fill.name = `plane-${plane}`;
        fill.userData.plane = plane;
        fill.renderOrder = 1;
        const edgeGeometry = new THREE.BufferGeometry();
        edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(corners, 3));
        const edge = new THREE.LineLoop(edgeGeometry, new THREE.LineBasicMaterial({ color: TILE_EDGE }));
        edge.name = `plane-edge-${plane}`;
        edge.userData.plane = plane;
        edge.renderOrder = 2;
        planeLayer.add(fill, edge);
      }
      render();
    };
    // Browser checks: the tiles as drawn and the one under the cursor.
    element.cadPlanes = () => ({
      visible: Boolean(ctx.planes.visible),
      size: ctx.planes.size,
      offset: ctx.planes.offset,
      hovered: ctx.planes.hovered || null,
      // Segments of the flat face outlined under the cursor while picking (0 = none).
      outline: ctx.outlinedFace?.outlineWorld?.length || 0,
      tiles: ctx.planes.visible
        ? Object.fromEntries(ORIGIN_PLANES.map((plane) => [plane, ctx.planes.tiles[plane].map((p) => [...p])]))
        : {},
    });
    // Direct placement: ghosts, handles and clicks for the guided operations.
    const placementLayer = createPlacementLayer({
      ctx,
      renderer,
      hud: placementHudRef.current,
      callbacks: placementCallbacks,
      rayAt,
      pickedFace,
      placeBox,
    });
    ctx.placementLayer = placementLayer;
    element.cadPlacement = () => placementLayer.state();
    // The fabrication shop's preview, machines and records (shopLayer.js).
    const shopLayer = createShopLayer({
      ctx,
      labels: shopLabelsRef.current,
      // A hit made puts the operator's view back on the part (a re-run is view only).
      onStrokeEnd: (token, run) => {
        if (run?.commit) frameStation(ctx, STATION_VIEW, ctx.camera.isPerspectiveCamera);
        strokeCallback.current?.(token);
      },
      onStationPose: (pose) => {
        const poses = stationPoses.current;
        poses.last = pose;
        for (const listener of poses.listeners) listener(pose);
      },
      // The layer ended the grip drag itself: the press in the hand goes with it.
      onGripEnd: () => ctx.dropGrip?.(),
    });
    ctx.shopLayer = shopLayer;
    // The press brake's grip keeps its size on screen and its place on the sheet.
    ctx.beforeRender.push(() => shopLayer.layoutGrip());
    // Browser checks: the press brake station (null when closed: its
    // machine, tooling, the bend in the die, its angle, the punch tip, the
    // stroke and a collision shown), the unfold state and its bend labels,
    // and the shop records on show.
    element.cadShop = () => ({
      station: null,
      ...shopLayer.state(),
      prints: ctx.shopModel?.prints || [],
      // The paint or print station's pick (SM-3): what is under the cursor.
      pick: ctx.shopPick
        ? {
            station: ctx.shopPick.station,
            stage: ctx.shopPick.stage,
            hover: ctx.shopHover?.kind || null,
            dragging: Boolean(printDrag),
          }
        : null,
    });
    // ------------------------------------------------ the paint and print stations (SM-3)
    // Picks on the displayed kernel meshes: the face under the cursor
    // (pickedFace: the triangle and its coplanar neighbours), or the part. The
    // hovered face's outline lives in its own layer, outside `group`.
    const shopHoverLayer = new THREE.Group();
    shopHoverLayer.name = 'shop-hover';
    scene.add(shopHoverLayer);
    const modelHit = (caster) =>
      caster.intersectObjects(group.children, true).find((h) => h.object.isMesh && h.object.parent.visible) || null;
    // World → the part's own frame through its displayed pose.
    const toPartFrame = (g, point, direction = null) => {
      g.updateMatrix();
      const inverse = displayedInstanceMatrix(g.matrix, g.userData.placement).invert();
      return direction
        ? new THREE.Vector3(...direction).transformDirection(inverse).toArray()
        : new THREE.Vector3(...point).applyMatrix4(inverse).toArray();
    };
    // `info`: the hit's pickedFace (the point is always the hit's own).
    const faceTarget = (hit, info = pickedFace(hit)) => {
      const g = hit.object.parent;
      const x = uprightAxes(info.normal).x;
      const point = hit.point.toArray();
      return {
        kind: 'face',
        instanceId: info.instanceId,
        point,
        normal: info.normal,
        planar: info.planar,
        outline: info.outlineWorld || [],
        x,
        local: {
          point: toPartFrame(g, point),
          normal: toPartFrame(g, null, info.normal),
          x: toPartFrame(g, null, x),
        },
      };
    };
    // The hover's face, as planeTarget keeps it (docs/perf-pass-3.md §5 B1.5):
    // a hover on a triangle of the face already found, the part where it was,
    // reuses that pick. Clicks and browser checks always pick afresh.
    const hoverFace = (hit) => {
      const cached = ctx.shopFace;
      const pose = hit.object.matrixWorld.elements;
      if (
        cached?.object === hit.object &&
        cached.triangles.has(hit.faceIndex) &&
        cached.pose.every((value, i) => value === pose[i])
      )
        return cached.info;
      const info = pickedFace(hit);
      ctx.shopFace = {
        object: hit.object,
        pose: [...hit.object.matrixWorld.elements],
        triangles: new Set(info.triangles || [hit.faceIndex]),
        info,
      };
      return info;
    };
    // What a click would pick for the open station (`hover`: for the hover frame).
    const shopTarget = (event, hover = false) => {
      const pick = ctx.shopPick?.pick;
      if (!pick) return null;
      const hit = modelHit(rayAt(event));
      if (pick === 'part') return hit ? { kind: 'part', instanceId: hit.object.userData.instanceId } : null;
      return hit ? faceTarget(hit, hover ? hoverFace(hit) : pickedFace(hit)) : null;
    };
    // Browser checks: what a click at a client point would pick for the open station.
    element.cadShopTarget = (clientX, clientY) => {
      const target = shopTarget({ clientX, clientY });
      return target ? { kind: target.kind, instanceId: target.instanceId } : null;
    };
    // A flat face's outline (its segments, world), drawn over the parts.
    const outlineLine = (segments) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(segments.flat(2), 3));
      const line = new THREE.LineSegments(
        geometry,
        new THREE.LineBasicMaterial({ color: SHOP_FACE_COLOR, depthTest: false, transparent: true }),
      );
      line.name = 'shop-hover-face';
      line.renderOrder = 38;
      line.frustumCulled = false;
      return line;
    };
    const showShopHover = (target) => {
      ctx.shopHover = target;
      const outline = target?.kind === 'face' && target.planar && target.outline.length ? target.outline : null;
      // The same face again (hoverFace): its outline is already drawn.
      if (!outline || shopHoverLayer.userData.outline !== outline) {
        clearLayer(shopHoverLayer);
        shopHoverLayer.userData.outline = outline;
        if (outline) shopHoverLayer.add(outlineLine(outline));
      }
      showHoverHint(
        target?.kind === 'face' && !target.planar && ctx.shopPick?.pick === 'face'
          ? 'Curved face: pad printing only'
          : target?.kind === 'face'
            ? 'Face'
            : target?.kind === 'part'
              ? partName(ctx.model?.instances.find((i) => i.id === target.instanceId)?.partId) || 'Part'
              : '',
      );
      renderer.domElement.style.cursor = target ? 'pointer' : '';
      render();
    };
    ctx.drawShopPick = () => {
      if (!ctx.shopPick?.pick) {
        clearLayer(shopHoverLayer);
        shopHoverLayer.userData.outline = null;
        ctx.shopHover = null;
        if (!ctx.shopPick) showHoverHint('');
      }
      render();
    };
    let shopFrame = 0,
      shopPointer = null;
    const runShopHover = () => {
      shopFrame = 0;
      const pointer = shopPointer;
      shopPointer = null;
      if (!pointer || !ctx.shopPick?.pick || printDrag) return;
      showShopHover(shopTarget(pointer, true));
    };
    const shopMove = (event) => {
      if (event.buttons || !ctx.shopPick?.pick) return;
      shopPointer = { clientX: event.clientX, clientY: event.clientY };
      if (!shopFrame) shopFrame = requestAnimationFrame(runShopHover);
    };
    const shopClick = (event) => {
      const target = shopTarget(event);
      showShopHover(target);
      if (target) shopCallbacks.current.onShopPick?.(target);
    };
    renderer.domElement.addEventListener('pointermove', shopMove);
    // Off the canvas nothing is under the cursor.
    const shopLeave = () => {
      if (shopFrame) cancelAnimationFrame(shopFrame);
      shopFrame = 0;
      shopPointer = null;
      if (ctx.shopHover) showShopHover(null);
    };
    renderer.domElement.addEventListener('pointerleave', shopLeave);
    // ------------------------------------------------ Cut's picker (docs/sketch-studio-cut-pick.md §4.2)
    // A click inside a ready outline on the ground (z = 0) toggles it, unless
    // a part in front of that point takes the ray; only while the workspace
    // hands onPickOutline (the picker open), so Draw's outlines stay unclickable.
    const ground = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const outlineTarget = (caster, hit = modelHit(caster)) => {
      if (!outlineCallback.current || !ctx.outlinePick?.length) return null;
      const point = caster.ray.intersectPlane(ground, new THREE.Vector3());
      if (!point || (hit && hit.distance <= caster.ray.origin.distanceTo(point))) return null;
      return outlineAt(ctx.outlinePick, point.x, point.y);
    };
    // The cursor says an outline can be clicked; only the cursor this sets is put back.
    ctx.outlineHover = false;
    const showOutlineHover = (on) => {
      if (on === ctx.outlineHover) return;
      ctx.outlineHover = on;
      renderer.domElement.style.cursor = on ? 'pointer' : '';
    };
    ctx.clearOutlineHover = () => showOutlineHover(false);
    let outlineFrame = 0,
      outlinePointer = null;
    const runOutlineHover = () => {
      outlineFrame = 0;
      const pointer = outlinePointer;
      outlinePointer = null;
      if (pointer) showOutlineHover(Boolean(outlineTarget(rayAt(pointer))));
    };
    const outlineMove = (event) => {
      if (event.buttons || !outlineCallback.current) return;
      outlinePointer = { clientX: event.clientX, clientY: event.clientY };
      if (!outlineFrame) outlineFrame = requestAnimationFrame(runOutlineHover);
    };
    const outlineLeave = () => {
      if (outlineFrame) cancelAnimationFrame(outlineFrame);
      outlineFrame = 0;
      outlinePointer = null;
      showOutlineHover(false);
    };
    renderer.domElement.addEventListener('pointermove', outlineMove);
    renderer.domElement.addEventListener('pointerleave', outlineLeave);
    // Browser checks: the outline a click at a client point would toggle, or null.
    element.cadOutlineAt = (clientX, clientY) => outlineTarget(rayAt({ clientX, clientY }));
    // A print dragged on its face (the print station): capture phase, so the
    // press never reaches OrbitControls; a press without travel selects it.
    let printDrag = null;
    const printDown = (event) => {
      if (ctx.shopPick?.station !== 'print' || event.button !== 0) return;
      const caster = rayAt(event);
      const picked = shopLayer.pickPrint(caster);
      const frame = picked && shopLayer.printWorld(picked.id);
      if (!frame) return;
      event.stopImmediatePropagation();
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
        new THREE.Vector3(...frame.normal),
        new THREE.Vector3(...frame.origin),
      );
      const on = caster.ray.intersectPlane(plane, new THREE.Vector3()) || new THREE.Vector3(...frame.origin);
      printDrag = {
        id: picked.id,
        plane,
        offset: new THREE.Vector3(...frame.origin).sub(on),
        start: [event.clientX, event.clientY],
        origin: frame.origin,
        moved: false,
      };
      controls.enabled = false;
      renderer.domElement.setPointerCapture?.(event.pointerId);
    };
    const printMove = (event) => {
      if (!printDrag) return;
      event.stopImmediatePropagation();
      if (Math.hypot(event.clientX - printDrag.start[0], event.clientY - printDrag.start[1]) > CLICK_PX)
        printDrag.moved = true;
      if (!printDrag.moved) return;
      const on = rayAt(event).ray.intersectPlane(printDrag.plane, new THREE.Vector3());
      if (!on) return;
      printDrag.origin = on.add(printDrag.offset).toArray();
      shopLayer.previewPrint(printDrag.id, printDrag.origin);
      render();
    };
    const endPrintDrag = (event, cancelled = false) => {
      const drag = printDrag;
      printDrag = null;
      controls.enabled = true;
      if (event?.pointerId != null && renderer.domElement.hasPointerCapture?.(event.pointerId))
        renderer.domElement.releasePointerCapture(event.pointerId);
      if (cancelled || !drag.moved) {
        shopLayer.resetPrint(drag.id);
        render();
        if (!cancelled) shopCallbacks.current.onShopPick?.({ kind: 'print', printId: drag.id });
        return;
      }
      const print = ctx.shopModel?.prints?.find((p) => p.id === drag.id);
      const g = print && group.children.find((c) => c.userData.instanceId === print.instanceId);
      if (!g) {
        shopLayer.resetPrint(drag.id);
        render();
        return;
      }
      shopCallbacks.current.onShopPrintMove?.(drag.id, toPartFrame(g, drag.origin));
    };
    const printUp = (event) => {
      if (!printDrag) return;
      event.stopImmediatePropagation();
      endPrintDrag(event);
    };
    const printCancel = () => {
      if (!printDrag) return false;
      endPrintDrag(null, true);
      return true;
    };
    ctx.cancelPrintDrag = printCancel;
    // Every press first forgets the last one: a press a capture-phase drag
    // takes (the print, the grip, the fingers, a placement or hole handle)
    // never reaches pointerDown, so its release, after an Esc or a drag the
    // layer ended, must not be measured against an older press as a click.
    // Registered before the first of them.
    const forgetDown = () => {
      down = null;
    };
    renderer.domElement.addEventListener('pointerdown', forgetDown, true);
    renderer.domElement.addEventListener('pointerdown', printDown, true);
    renderer.domElement.addEventListener('pointermove', printMove, true);
    renderer.domElement.addEventListener('pointerup', printUp, true);
    renderer.domElement.addEventListener('pointercancel', printCancel);
    window.addEventListener('blur', printCancel);
    // ------------------------------------------------ the press brake's grip (hands on the sheet, HO-1)
    // Flip sheet and Turn sheet around as handles on the sheet (shopLayer.js,
    // brakeGrip.js), after the print drag's pattern: a capture-phase press
    // keeps the press from OrbitControls; a press without travel (CLICK_PX)
    // acts; past it the sheet follows the dial (rotateDial.js startDial, the
    // rings' rule) along the turn the act makes, and a release at 90° or more
    // makes the act (onBrakeGrip), under it the sheet eases back. Esc, a
    // right press, a lost pointer or the window losing focus put it back.
    const gripChip = gripChipRef.current;
    if (gripChip) gripChip.hidden = true;
    // HO-2 (§6): after the grip, the rest of the set-up in reach (the
    // shop layer's handPick, brakeHands.js HAND_ORDER): `reachHover` what the
    // pointer is over (the fingers, a blade or the machine, an edge), and
    // `fingerPress` the backgauge fingers in the hand. The fingers take their
    // press as a handle does (a drag sets L, a click opens the L field); a
    // blade or an edge acts on the click (pointerUp's brakeClick), so a drag
    // that starts on the machine still orbits.
    let gripPress = null,
      gripHover = null,
      gripFocus = null,
      reachHover = null,
      fingerPress = null,
      // The sheet slid by hand (sheet slide §6.1): the arrow in the hand.
      slidePress = null;
    ctx.gripPressed = () => Boolean(gripPress || fingerPress || slidePress);
    const canvasPoint = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      return [event.clientX - rect.left, event.clientY - rect.top];
    };
    // `tone`: the second line's class ('is-ok' | 'is-stop' by `ok`, or 'is-typed': quiet).
    const writeChip = (title, outcome = null, ok = false, tone = null) => {
      if (!gripChip) return;
      const [head, line] = gripChip.children;
      head.textContent = title;
      line.textContent = outcome || '';
      line.hidden = !outcome;
      line.className = `cad-grip-chip-outcome ${tone || (ok ? 'is-ok' : 'is-stop')}`;
      gripChip.hidden = false;
    };
    const hideChip = () => {
      if (gripChip) gripChip.hidden = true;
    };
    // By the handle (its right, or its left near the view's right edge), kept in the view.
    const chipByHandle = (kind) => {
      const spot = ctx.shopLayer.gripSpot(kind);
      if (!gripChip || !spot) return hideChip();
      const outcome = kind === 'slide' ? null : ctx.shopLayer.gripOutcome(kind);
      // Slide sheet (sheet slide §6.1) says where the sheet stands, no outcome.
      const words =
        kind === 'slide' ? { title: slideChip(ctx.brakeGrip?.slide), outcome: null } : brakeGripChip(kind, outcome);
      writeChip(words.title, words.outcome, Boolean(outcome?.ok));
      const width = element.clientWidth,
        height = element.clientHeight;
      const w = gripChip.offsetWidth,
        h = gripChip.offsetHeight;
      let x = spot.x + spot.radius + 10,
        y = spot.y - h / 2;
      if (width && x + w > width - HUD_MARGIN) x = spot.x - spot.radius - 10 - w;
      if (width && height) {
        x = Math.max(HUD_MARGIN, Math.min(x, width - HUD_MARGIN - w));
        y = Math.max(HUD_MARGIN, Math.min(y, height - HUD_MARGIN - h));
      }
      gripChip.style.left = `${x}px`;
      gripChip.style.top = `${y}px`;
    };
    // A handle approached: its outcome, when the workspace has not worked it out yet.
    const wantGrip = (kind) => {
      if (kind && kind !== 'slide' && !ctx.shopLayer.gripOutcome(kind)) gripCallback.current.onBrakeGripWant?.(kind);
    };
    // The chip of a thing in reach (HO-2): by the cursor, in the words the workspace's offer gives.
    const chipByPointer = (target) => {
      const grip = ctx.brakeGrip;
      const words = reachChip(target, {
        fingers: grip?.fingers || null,
        edges: grip?.edges || [],
        picked: grip?.edge ?? null,
        pieces: grip?.pieces || [],
      });
      if (!words?.title) return hideChip();
      writeChip(words.title, words.line, false, 'is-typed');
      placeBox(gripChip);
    };
    // A handle and the fingers are grabbed; a blade and an edge are clicked; the rest only name themselves.
    const reachCursor = (target) =>
      target?.kind === 'fingers'
        ? target.offered
          ? 'grab'
          : ''
        : ['blade', 'edge', 'piece'].includes(target?.kind)
          ? 'pointer'
          : '';
    // Only the station's own cursors are put back: another tool's stays.
    const setCursor = (cursor) => {
      if (cursor || ['grab', 'pointer'].includes(renderer.domElement.style.cursor))
        renderer.domElement.style.cursor = cursor;
    };
    // The handle lit: the toolbar's (hovered or focused) first, else the
    // pointer's; with no handle lit, the thing in reach under the pointer.
    const showGripHot = () => {
      if (gripPress) return;
      if (fingerPress) return fingerReadout();
      if (slidePress) return slideReadoutChip();
      const kind = ctx.shopLayer.gripLight(gripFocus || gripHover);
      wantGrip(kind);
      // A lit handle puts out whatever else was lit.
      const reach = ctx.shopLayer.reachLight(kind ? null : reachHover);
      // The piece the panel names (piece pick §5.5) is lit with nothing under the pointer: no cursor, no chip for it.
      const pointed = reachHover ? reach : null;
      setCursor(gripHover && kind === gripHover ? 'grab' : reachCursor(pointed));
      if (kind) chipByHandle(kind);
      else if (pointed) chipByPointer(pointed);
      else hideChip();
    };
    ctx.lightGrip = (kind) => {
      gripFocus = kind;
      showGripHot();
    };
    let gripFrame = 0,
      gripPointer = null;
    const sameTarget = (a, b) =>
      (a?.kind ?? null) === (b?.kind ?? null) &&
      a?.index === b?.index &&
      a?.blade === b?.blade &&
      a?.part === b?.part &&
      Boolean(a?.offered) === Boolean(b?.offered);
    const runGripHover = () => {
      gripFrame = 0;
      const pointer = gripPointer;
      gripPointer = null;
      if (!pointer || gripPress || fingerPress || slidePress || !ctx.shopLayer.stationOpen()) return;
      // In order (HO-2 §6.3): a handle, the fingers, a blade or the machine (a ray, cast only if needed), an edge.
      const target = ctx.shopLayer.handPick(pointer.at, () => rayAt(pointer.client));
      const kind = target?.kind === 'grip' ? target.handle : null;
      const reach = target && target.kind !== 'grip' ? target : null;
      if (kind === gripHover && sameTarget(reach, reachHover) && (kind || reach || !gripFocus)) {
        // The same thing: a chip by the cursor follows it.
        if (reach && !kind && !gripFocus && gripChip && !gripChip.hidden) placeBox(gripChip);
        return;
      }
      gripHover = kind;
      reachHover = reach;
      showGripHot();
    };
    const gripHoverMove = (event) => {
      if (event.buttons || gripPress || fingerPress || slidePress || !ctx.shopLayer.stationOpen()) return;
      gripPointer = { at: canvasPoint(event), client: { clientX: event.clientX, clientY: event.clientY } };
      if (!gripFrame) gripFrame = requestAnimationFrame(runGripHover);
    };
    const gripLeave = () => {
      if (gripFrame) cancelAnimationFrame(gripFrame);
      gripFrame = 0;
      gripPointer = null;
      if ((!gripHover && !reachHover) || gripPress || fingerPress || slidePress) return;
      gripHover = reachHover = null;
      showGripHot();
    };
    // The readout by the cursor while a handle is in the hand.
    const gripReadout = () => {
      if (!gripPress?.dial) return;
      writeChip(dragChip(gripPress.kind, gripPress.degrees));
      const typed = gripPress.typed;
      const line = gripChip?.children[1];
      if (line) {
        line.textContent = typed ? `${typed} ° · Enter applies · Esc cancels` : 'Type an angle · Enter applies';
        line.hidden = false;
        line.className = 'cad-grip-chip-outcome is-typed';
      }
      placeBox(gripChip);
    };
    const applyGrip = (result) => {
      gripPress.degrees = result.snapped;
      ctx.shopLayer.gripTo(brakeGripDrag({ travel: Infinity, degrees: result.snapped }).progress);
      gripReadout();
    };
    ctx.gripAlt = () => {
      if (gripPress?.dial) applyGrip(gripPress.dial.refresh({ snap: ctx.rotateSnap, free: Boolean(ctx.altDown) }));
      // The fingers in the hand: L again in the steps Alt now asks for.
      ctx.fingerAlt?.();
      ctx.slideAlt?.();
    };
    const gripDown = (event) => {
      if (!ctx.shopLayer.stationOpen()) return;
      // A right press mid-drag puts the sheet's slide back (sheet slide §6.1).
      if (slidePress) {
        event.stopImmediatePropagation();
        if (event.button !== 0) endSlide(event, { cancel: true });
        return;
      }
      // A right press mid-drag puts the fingers back (HO-2).
      if (fingerPress) {
        event.stopImmediatePropagation();
        if (event.button !== 0) endFinger(event, { cancel: true });
        return;
      }
      // A right press mid-drag puts the sheet back.
      if (gripPress) {
        if (event.button !== 0) {
          event.stopImmediatePropagation();
          endGrip(event, true);
        }
        return;
      }
      if (event.button !== 0) return;
      const point = canvasPoint(event);
      const target = ctx.shopLayer.handPick(point, () => rayAt(event));
      // The fingers where they are a handle (HO-2 §6.2); a blade or an edge waits for the click.
      if (target?.kind === 'fingers' && target.offered) return fingerDown(event, point);
      // The arrow (sheet slide §6.1) is taken as the fingers are: a drag slides, a click opens the field.
      if (target?.kind === 'grip' && target.handle === 'slide') return slideDown(event, point);
      const kind = target?.kind === 'grip' ? target.handle : null;
      if (!kind) return;
      event.stopImmediatePropagation();
      trackPointer(event);
      gripPress = { kind, start: point, dial: null, degrees: 0, typed: '', clickOnly: false };
      wantGrip(kind);
      controls.enabled = false;
      renderer.domElement.setPointerCapture?.(event.pointerId);
      renderer.domElement.style.cursor = 'grabbing';
    };
    const gripMove = (event) => {
      if (slidePress) return slideMove(event);
      if (fingerPress) return fingerMove(event);
      if (!gripPress) return;
      event.stopImmediatePropagation();
      trackPointer(event);
      const point = canvasPoint(event);
      ctx.altDown = event.altKey;
      if (!gripPress.dial) {
        if (gripPress.clickOnly || Math.hypot(point[0] - gripPress.start[0], point[1] - gripPress.start[1]) <= CLICK_PX)
          return;
        const start = ctx.shopLayer.gripStart(gripPress.kind);
        // The act's turn is not known yet (§5.4): the press acts as a click.
        if (!start) {
          gripPress.clickOnly = true;
          return;
        }
        ctx.camera.updateMatrixWorld();
        hideChip();
        gripPress.dial = startDial({
          pivot: start.pivot,
          pointer: gripPress.start,
          axis: start.axis,
          eye: eyeAt(new THREE.Vector3(...start.pivot)),
          radius: start.radius,
          project: projectPx,
        });
      }
      applyGrip(gripPress.dial.update(point, { snap: ctx.rotateSnap, free: Boolean(ctx.altDown) }));
    };
    // Let go: a click acts, a drag past 90° acts (the sheet carries on from
    // where it is), under it or cancelled the sheet goes back.
    const endGrip = (event, cancelled = false, degrees = null) => {
      const press = gripPress;
      if (!press) return;
      gripPress = null;
      controls.enabled = true;
      if (event?.pointerId != null && renderer.domElement.hasPointerCapture?.(event.pointerId))
        renderer.domElement.releasePointerCapture(event.pointerId);
      renderer.domElement.style.cursor = '';
      gripHover = null;
      hideChip();
      if (!press.dial) {
        if (!cancelled) gripCallback.current.onBrakeGrip?.(press.kind);
        else ctx.shopLayer.gripLight(gripFocus);
        return;
      }
      const swept = degrees ?? press.degrees;
      const commit = !cancelled && Math.abs(swept) >= COMMIT_DEGREES;
      if (commit && degrees != null) ctx.shopLayer.gripTo(brakeGripDrag({ travel: Infinity, degrees }).progress);
      if (ctx.shopLayer.gripRelease(commit)) gripCallback.current.onBrakeGrip?.(press.kind);
    };
    const gripUp = (event) => {
      if (slidePress) {
        event.stopImmediatePropagation();
        endSlide(event);
        return;
      }
      if (fingerPress) {
        event.stopImmediatePropagation();
        endFinger(event);
        return;
      }
      if (!gripPress) return;
      event.stopImmediatePropagation();
      endGrip(event);
    };
    const gripCancel = () => {
      endSlide(null, { cancel: true });
      endFinger(null, { cancel: true });
      endGrip(null, true);
    };
    // The shop layer ended the drag itself (a new view under it, the grip
    // hidden, the station closed; shopLayer.js onGripEnd): the press ends
    // with it, the orbit back, and its release does nothing.
    ctx.dropGrip = () => {
      if (!gripPress) return;
      gripPress = null;
      controls.enabled = true;
      renderer.domElement.style.cursor = '';
      gripHover = null;
      hideChip();
    };
    // ------------------------------------------------ the backgauge fingers in the hand (HO-2 §6.2)
    // Pressed: a press without travel is a click (the panel's L field takes
    // focus); past CLICK_PX the drag is on. L is measured along the machine's
    // Y where the pointer's ray meets the horizontal plane through the
    // fingers (or, that plane seen edge on, along +Y as drawn), from the L the
    // drag started from: whole mm, a tenth with Alt, never below 0
    // (brakeHands.js fingerL). Each new L goes to the workspace at most once a
    // frame, at once when none went this frame (onBrakeFingers({ distance }):
    // the card's own onDistance path), so the sheet rides with the fingers as
    // the station poses it. Digits + Enter set L exactly; Esc, a right press,
    // a lost pointer or the window losing focus put the line back as it was.
    let fingerFrame = 0;
    const planeAt = (client, z) => {
      const ray = rayAt(client).ray;
      // Seen edge on, the plane's crossing runs away: the drawn axis serves instead.
      if (Math.abs(ray.direction.z) < 0.2) return null;
      return ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -z), new THREE.Vector3());
    };
    const fingerDown = (event, point) => {
      const start = ctx.shopLayer.fingerStart();
      const from = Number(ctx.brakeGrip?.fingers?.L);
      if (!start || !Number.isFinite(from)) return;
      event.stopImmediatePropagation();
      trackPointer(event);
      fingerPress = {
        start: point,
        client: { clientX: event.clientX, clientY: event.clientY },
        plane: start.z,
        axis: start.axis,
        origin: null,
        from,
        L: from,
        sent: from,
        dragging: false,
        typed: '',
        positions: 0,
      };
      controls.enabled = false;
      renderer.domElement.setPointerCapture?.(event.pointerId);
      renderer.domElement.style.cursor = 'grabbing';
    };
    const sendL = (press = fingerPress) => {
      if (!press?.dragging || press.L === press.sent) return;
      press.sent = press.L;
      press.positions += 1;
      gripCallback.current.onBrakeFingers?.({ distance: press.L });
    };
    const queueL = () => {
      if (fingerFrame) return;
      sendL();
      fingerFrame = requestAnimationFrame(() => {
        fingerFrame = 0;
        if (fingerPress && fingerPress.L !== fingerPress.sent) queueL();
      });
    };
    // The readout by the cursor: L and the flange the station reads for it (the panel's own figure).
    // Dragged onto a made bend's line, or seated on it (tight bends §7.4 (f)): the L the fingers
    // stand at and the bend, "L 29 mm · on bend 1".
    const fingerReadout = () => {
      const press = fingerPress;
      if (!press?.dragging) return;
      const offer = ctx.brakeGrip?.fingers;
      const at = (L) => L != null && Math.abs(L - press.L) < 1e-9;
      const on = offer?.on != null && (at(offer.L) || at(offer.from)) ? offer.on : null;
      const flange = on == null && at(offer?.L) ? offer.flange : null;
      // Gauged off a made flange (skin gauge §4.7): the stop the fingers stand against.
      const off = at(offer?.L) ? (offer.off ?? null) : null;
      const words = fingerReadoutWords(on != null ? offer.L : press.L, flange, on, off);
      writeChip(
        words,
        press.typed ? `${press.typed} mm · Enter applies · Esc cancels` : 'Type L · Enter applies',
        false,
        'is-typed',
      );
      // Measured when its text grows or shrinks (the flange arriving, a digit more, typing), never
      // per move: a size kept from the first words let a longer readout run off the view's right edge.
      const lines = `${words.length}:${press.typed.length}`;
      if (gripChip && (!press.box || press.box.lines !== lines))
        press.box = {
          lines,
          width: element.clientWidth,
          height: element.clientHeight,
          w: gripChip.offsetWidth + 12,
          h: gripChip.offsetHeight,
        };
      placeBox(gripChip, press.box);
    };
    const fingerMove = (event) => {
      const press = fingerPress;
      event.stopImmediatePropagation();
      trackPointer(event);
      const point = canvasPoint(event);
      ctx.altDown = event.altKey;
      if (!press.dragging) {
        if (Math.hypot(point[0] - press.start[0], point[1] - press.start[1]) <= CLICK_PX) return;
        press.dragging = true;
        press.origin = planeAt(press.client, press.plane);
        ctx.shopLayer.fingerHold(true);
        gripCallback.current.onBrakeFingers?.({ start: true });
      }
      press.at = { point, client: { clientX: event.clientX, clientY: event.clientY } };
      fingerTo();
    };
    // L where the pointer is now (and again when Alt is pressed or let go).
    const fingerTo = () => {
      const press = fingerPress;
      if (!press?.dragging || !press.at) return;
      const on = press.origin && planeAt(press.at.client, press.plane);
      const travel = on
        ? on.y - press.origin.y
        : axisTravel([press.at.point[0] - press.start[0], press.at.point[1] - press.start[1]], press.axis);
      press.L = fingerL(press.from, travel, { free: Boolean(ctx.altDown) });
      queueL();
      fingerReadout();
    };
    // Let go: a click opens the field; a drag's last L goes; `cancel` puts the line back; `typed` sets L exactly.
    const endFinger = (event, { cancel = false, typed = null } = {}) => {
      const press = fingerPress;
      if (!press) return;
      fingerPress = null;
      controls.enabled = true;
      if (event?.pointerId != null && renderer.domElement.hasPointerCapture?.(event.pointerId))
        renderer.domElement.releasePointerCapture(event.pointerId);
      renderer.domElement.style.cursor = '';
      reachHover = null;
      hideChip();
      ctx.shopLayer.fingerHold(false);
      if (!press.dragging) {
        if (!cancel) gripCallback.current.onBrakeFocus?.('distance');
        return;
      }
      if (cancel) {
        gripCallback.current.onBrakeFingers?.({ cancel: true });
        return;
      }
      if (typed != null) press.L = typed;
      sendL(press);
      gripCallback.current.onBrakeFingers?.({ end: true });
      ctx.lastFingerDrag = { positions: press.positions, from: press.from, to: press.L };
    };
    ctx.fingerAlt = () => fingerTo();
    // ------------------------------------------------ the sheet slid by hand (docs/sketch-studio-sheet-slide.md §6.1)
    // Pressed on the arrow: a press without travel is a click (the panel's Sheet
    // slide field takes focus, as the fingers' L does); past CLICK_PX the sheet
    // is in the hand: the pointer's travel along the bed's axis on the canvas
    // (axisTravel) is the sheet's move, caught by the detents (brakeHands.js
    // slideSnap: whole mm, a tenth with Alt, which passes through them), stopped
    // where too little of the punch would stand over the pieces. The layer draws
    // the sheet there at once (slideTo, view only) and the new slide goes to the
    // workspace at most once a frame (onBrakeSlide({ slide })); nothing of the
    // station is worked out per move. Digits + Enter set it exactly; Esc, a right
    // press, a lost pointer or the window losing focus put it back.
    let slideFrame = 0;
    const slideDown = (event, point) => {
      const start = ctx.shopLayer.slideStart();
      const offer = ctx.brakeGrip?.slide;
      if (!start || !offer?.offered) return;
      event.stopImmediatePropagation();
      trackPointer(event);
      slidePress = {
        start: point,
        axis: start.axis,
        offer,
        from: start.value,
        value: start.value,
        sent: start.value,
        dragging: false,
        typed: '',
        positions: 0,
        at: null,
      };
      controls.enabled = false;
      renderer.domElement.setPointerCapture?.(event.pointerId);
      renderer.domElement.style.cursor = 'grabbing';
    };
    const sendSlide = (press = slidePress) => {
      if (!press?.dragging || press.value === press.sent) return;
      press.sent = press.value;
      press.positions += 1;
      gripCallback.current.onBrakeSlide?.({ slide: press.value });
    };
    const queueSlide = () => {
      if (slideFrame) return;
      sendSlide();
      slideFrame = requestAnimationFrame(() => {
        slideFrame = 0;
        if (slidePress && slidePress.value !== slidePress.sent) queueSlide();
      });
    };
    const slideReadoutChip = () => {
      const press = slidePress;
      if (!press?.dragging) return;
      const words = slideReadout(press.offer, press.value);
      writeChip(
        words,
        press.typed
          ? `${press.typed} mm · Enter applies · Esc cancels`
          : 'Type a slide (− for the left) · Enter applies',
        false,
        'is-typed',
      );
      const lines = `${words.length}:${press.typed.length}`;
      if (gripChip && (!press.box || press.box.lines !== lines))
        press.box = {
          lines,
          width: element.clientWidth,
          height: element.clientHeight,
          w: gripChip.offsetWidth + 12,
          h: gripChip.offsetHeight,
        };
      placeBox(gripChip, press.box);
    };
    const slideToPointer = () => {
      const press = slidePress;
      if (!press?.dragging || !press.at) return;
      const travel = axisTravel([press.at[0] - press.start[0], press.at[1] - press.start[1]], press.axis);
      const pxPerMm = Math.hypot(press.axis[0], press.axis[1]);
      press.value = slideSnap(press.from + travel, press.offer, pxPerMm, { free: Boolean(ctx.altDown) });
      ctx.shopLayer.slideTo(press.value);
      queueSlide();
      slideReadoutChip();
    };
    const slideMove = (event) => {
      const press = slidePress;
      event.stopImmediatePropagation();
      trackPointer(event);
      const point = canvasPoint(event);
      ctx.altDown = event.altKey;
      if (!press.dragging) {
        if (Math.hypot(point[0] - press.start[0], point[1] - press.start[1]) <= CLICK_PX) return;
        press.dragging = true;
        ctx.shopLayer.slideHold(true, press.from);
        gripCallback.current.onBrakeSlide?.({ start: true });
      }
      press.at = point;
      slideToPointer();
    };
    // Let go: a click opens the field; a drag's last slide goes; cancel puts it back; typed sets it exactly.
    const endSlide = (event, { cancel = false, typed = null } = {}) => {
      const press = slidePress;
      if (!press) return;
      slidePress = null;
      controls.enabled = true;
      if (event?.pointerId != null && renderer.domElement.hasPointerCapture?.(event.pointerId))
        renderer.domElement.releasePointerCapture(event.pointerId);
      renderer.domElement.style.cursor = '';
      gripHover = null;
      hideChip();
      if (!press.dragging) {
        if (!cancel) gripCallback.current.onBrakeFocus?.('slide');
        return;
      }
      if (typed != null) {
        press.value = Math.min(press.offer.max, Math.max(press.offer.min, typed));
        ctx.shopLayer.slideTo(press.value);
      }
      ctx.shopLayer.slideHold(false);
      if (cancel) {
        gripCallback.current.onBrakeSlide?.({ cancel: true });
        return;
      }
      sendSlide(press);
      gripCallback.current.onBrakeSlide?.({ end: true });
      ctx.lastSlideDrag = { positions: press.positions, from: press.from, to: press.value };
    };
    ctx.slideAlt = () => slideToPointer();
    ctx.dropSlide = () => endSlide(null, { cancel: true });
    // The station no longer being set up (a stroke, a scrub, the replay, closed): the fingers are let go, the line put back.
    ctx.dropFingers = () => endFinger(null, { cancel: true });
    // Esc puts the sheet back (and leaves the line picked: the brake's own Esc
    // waits, isDragging); digits + Enter set the angle exactly, as the rings do.
    ctx.gripKey = (event) => {
      // The sheet in the hand (sheet slide §6.1): Esc puts the slide back; digits (a leading minus:
      // the left) + Enter set it exactly.
      if (slidePress) {
        if (event.key === 'Escape') {
          event.preventDefault();
          endSlide(null, { cancel: true });
          return true;
        }
        if (!slidePress.dragging || event.ctrlKey || event.metaKey || event.altKey) return true;
        if (event.key === 'Enter') {
          event.preventDefault();
          const value = typedSlide(slidePress.typed);
          if (value != null) endSlide(null, { typed: value });
          return true;
        }
        const next = typeKey(slidePress.typed, event.key);
        if (next != null) {
          event.preventDefault();
          slidePress.typed = next;
          slideReadoutChip();
        }
        return true;
      }
      // The fingers in the hand (HO-2): Esc puts the line back, digits + Enter set L exactly.
      if (fingerPress) {
        if (event.key === 'Escape') {
          event.preventDefault();
          endFinger(null, { cancel: true });
          return true;
        }
        if (!fingerPress.dragging || event.ctrlKey || event.metaKey || event.altKey) return true;
        if (event.key === 'Enter') {
          event.preventDefault();
          const value = typedL(fingerPress.typed);
          if (value != null) endFinger(null, { typed: value });
          return true;
        }
        const next = typeKey(fingerPress.typed, event.key);
        if (next != null) {
          event.preventDefault();
          fingerPress.typed = next;
          fingerReadout();
        }
        return true;
      }
      if (!gripPress) return false;
      if (event.key === 'Escape') {
        event.preventDefault();
        gripCancel();
        return true;
      }
      if (!gripPress.dial || event.ctrlKey || event.metaKey || event.altKey) return true;
      if (event.key === 'Enter') {
        const value = Number(gripPress.typed);
        event.preventDefault();
        if (gripPress.typed && Number.isFinite(value)) endGrip(null, false, value);
        return true;
      }
      const next = typeKey(gripPress.typed, event.key);
      if (next != null) {
        event.preventDefault();
        gripPress.typed = next;
        gripReadout();
      }
      return true;
    };
    renderer.domElement.addEventListener('pointerdown', gripDown, true);
    renderer.domElement.addEventListener('pointermove', gripMove, true);
    renderer.domElement.addEventListener('pointerup', gripUp, true);
    renderer.domElement.addEventListener('pointermove', gripHoverMove);
    renderer.domElement.addEventListener('pointerleave', gripLeave);
    renderer.domElement.addEventListener('pointercancel', gripCancel);
    window.addEventListener('blur', gripCancel);
    // The station changed under the pointer (a new pose, the station closed): the chip waits for the next move.
    ctx.refreshGrip = () => showGripHot();
    ctx.resetGripHover = () => {
      gripHover = null;
      // The fingers in the hand keep their readout through the poses their drag makes.
      if (fingerPress) return;
      reachHover = null;
      if (!gripPress) {
        ctx.shopLayer.gripLight(gripFocus);
        ctx.shopLayer.reachLight(null);
        hideChip();
        setCursor('');
      }
    };
    // A click at the station (pointerUp, no travel) on what is in reach (HO-2):
    // an edge goes to the backgauge (the card's onPickEdge), a blade opens its
    // picker; the fingers and the grip take their own presses, the machine's
    // other parts only name themselves.
    ctx.brakeClick = (event) => {
      const target = ctx.shopLayer.handPick(canvasPoint(event), () => rayAt(event));
      if (target?.kind === 'edge') gripCallback.current.onBrakeEdge?.(target.index);
      // A piece of the line (piece pick §6.1): bend only it; Ctrl, Shift or Meta: in or out.
      else if (target?.kind === 'piece')
        gripCallback.current.onBrakePiece?.(target.index, {
          add: Boolean(event.ctrlKey || event.shiftKey || event.metaKey),
        });
      else if (target?.kind === 'blade') gripCallback.current.onBrakeFocus?.(target.blade);
    };
    // Browser checks: what a press at a client point would reach, and where the blades can be pressed.
    element.cadBrakeHand = (clientX, clientY) => {
      const rect = renderer.domElement.getBoundingClientRect();
      return ctx.shopLayer.handPick([clientX - rect.left, clientY - rect.top], () => rayAt({ clientX, clientY }));
    };
    element.cadBrakeSpots = () => ctx.shopLayer.bladeSpots();
    // Browser checks: where the camera stands and looks (world mm), and its projection.
    element.cadCamera = () => ({
      position: ctx.camera.position.toArray(),
      target: ctx.controls.target.toArray(),
      perspective: Boolean(ctx.camera.isPerspectiveCamera),
      span: ctx.span,
    });
    // Browser checks: the Move holes handles (one per hole, one per centre of a row).
    element.cadHoleHandles = () =>
      holeHandles.children.map((h) => ({
        featureId: h.userData.featureId,
        index: h.userData.index || 0,
        locked: Boolean(h.userData.locked),
        at: h.position.toArray(),
      }));
    // Capture phase, like the hole handles: a grabbed handle keeps the
    // press from OrbitControls and TransformControls.
    const placementDown = (event) => {
      trackPointer(event);
      if (!placementLayer.down(event)) return;
      event.stopImmediatePropagation();
      renderer.domElement.setPointerCapture?.(event.pointerId);
    };
    const placementMove = (event) => {
      trackPointer(event);
      if (placementLayer.move(event)) event.stopImmediatePropagation();
    };
    const placementUp = (event) => {
      if (!placementLayer.up(event)) return;
      event.stopImmediatePropagation();
      if (renderer.domElement.hasPointerCapture?.(event.pointerId))
        renderer.domElement.releasePointerCapture(event.pointerId);
    };
    const placementDouble = () => placementLayer.doubleClick();
    // Double-click a part with no tool running: open the group under the
    // cursor one level (§3.3). The placement layer's own dblclick keeps
    // priority (it listens first and only acts while placing); the two
    // clicks before it have already selected the group. Whether a tool
    // owns the click is pointerUp's order alone: `selectClick` says its
    // second click reached the selection.
    const selectDouble = (event) => {
      if (!ctx.selectClick || event.button !== 0) return;
      const hit = rayAt(event)
        .intersectObjects(group.children, true)
        .find((h) => h.object.isMesh && h.object.parent.visible);
      if (hit) selectionCallback.current?.(hit.object.userData.instanceId, { open: true });
    };
    const placementCancel = () => placementLayer.cancelDrag();
    renderer.domElement.addEventListener('pointerdown', placementDown, true);
    renderer.domElement.addEventListener('pointermove', placementMove, true);
    renderer.domElement.addEventListener('pointerup', placementUp, true);
    renderer.domElement.addEventListener('dblclick', placementDouble);
    renderer.domElement.addEventListener('dblclick', selectDouble);
    renderer.domElement.addEventListener('pointercancel', placementCancel);
    window.addEventListener('blur', placementCancel);
    const holeDown = (event) => {
      if (ctx.holeMode !== 'move' || event.button !== 0) return;
      // Handles added since the last render have no world matrix yet.
      holeHandles.updateMatrixWorld(true);
      const hit = rayAt(event).intersectObjects(holeHandles.children)[0];
      if (!hit || hit.object.userData.locked) return;
      event.stopImmediatePropagation();
      const handle = hit.object;
      const normal = new THREE.Vector3(...handle.userData.direction);
      holeDrag = {
        handle,
        start: handle.position.clone(),
        plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, new THREE.Vector3(...handle.userData.position)),
      };
      controls.enabled = false;
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const holeMove = (event) => {
      if (!holeDrag) return;
      event.stopImmediatePropagation();
      const point = rayAt(event).ray.intersectPlane(holeDrag.plane, new THREE.Vector3());
      if (point) {
        holeDrag.point = point.toArray();
        holeDrag.handle.position.copy(point);
        render();
      }
    };
    const holeUp = (event) => {
      if (!holeDrag) return;
      event.stopImmediatePropagation();
      const completed = holeDrag;
      holeDrag = null;
      controls.enabled = true;
      if (renderer.domElement.hasPointerCapture(event.pointerId))
        renderer.domElement.releasePointerCapture(event.pointerId);
      if (
        completed.point &&
        new THREE.Vector3(...completed.point).distanceTo(new THREE.Vector3(...completed.handle.userData.position)) >
          1e-6
      )
        holeCallbacks.current.onMoveHole?.(
          completed.handle.userData.featureId,
          completed.point,
          completed.handle.userData.index || 0,
        );
      else completed.handle.position.copy(completed.start);
      render();
    };
    renderer.domElement.addEventListener('pointerdown', holeDown, true);
    renderer.domElement.addEventListener('pointermove', holeMove, true);
    renderer.domElement.addEventListener('pointerup', holeUp, true);
    const trackPointer = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      ctx.pointer = [event.clientX - rect.left, event.clientY - rect.top];
      if (hud && !hud.hidden) placeHud();
      if (measureHud && !measureHud.hidden) placeBox(measureHud);
    };
    renderer.domElement.addEventListener('pointermove', trackPointer);
    // After trackPointer, so the readout sits by this move's pointer.
    renderer.domElement.addEventListener('pointermove', measureMove);
    // Capture phase: the grab point is known before TransformControls'
    // pointerdown starts a drag (a touch or pen press has no hover first).
    renderer.domElement.addEventListener('pointerdown', trackPointer, true);
    const pointerDown = (event) => {
      trackPointer(event);
      if (!transform.dragging) consumedPointer = false;
      down = [event.clientX, event.clientY];
    };
    const pointerUp = (event) => {
      const ringClick = pickClick;
      pickClick = false;
      // Whether this click reached the selection (a dblclick opens a group only then).
      ctx.selectClick = false;
      if (consumedPointer) {
        consumedPointer = false;
        if (!ringClick) {
          down = null;
          return;
        }
      }
      if (!down || Math.hypot(event.clientX - down[0], event.clientY - down[1]) > CLICK_PX || event.button !== 0)
        return;
      // Measuring: clicks pick points, never the selection.
      if (ctx.measureMode) {
        measureClick(event);
        return;
      }
      // Placing an operation: clicks place or pick, never select.
      if (ctx.placementLayer.click(event)) return;
      // The press brake owns the viewport: its picks are its own (an edge of the sheet, a blade; HO-2) and the flat map's.
      if (ctx.shopLayer.stationOpen()) {
        ctx.brakeClick?.(event);
        return;
      }
      // The paint and print stations pick on the parts, never select.
      if (ctx.shopPick) {
        if (ctx.shopPick.pick) shopClick(event);
        return;
      }
      const rect = element.getBoundingClientRect(),
        pointer = new THREE.Vector2(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          (-(event.clientY - rect.top) / rect.height) * 2 + 1,
        );
      const ray = new THREE.Raycaster();
      ctx.camera.updateMatrixWorld();
      ray.setFromCamera(pointer, ctx.camera);
      const hit = ray
        .intersectObjects(group.children, true)
        .find((hit) => hit.object.isMesh && hit.object.parent.visible);
      // While drawing, clicks belong to the sketcher (it listens on the canvas).
      if (ctx.sketchMode === 'draw') return;
      // Origin plane tiles: a tile starts a sketch on its plane; while
      // picking, a flat face sketches on the face and a curved one only says so.
      if (ctx.planes.visible && (!ctx.sketchMode || sketchPicking())) {
        const target = planeTarget(event, true);
        if (target?.kind === 'plane') {
          pickPlane(target.plane);
          return;
        }
        if (sketchPicking()) {
          if (target?.kind === 'face') {
            clearPlaneHover();
            holeCallbacks.current.onPickSketchFace?.(target.info);
          } else if (target?.kind === 'curved') showPlaneTarget(target);
          return;
        }
      }
      if (ctx.sketchMode === 'pick') {
        if (hit) holeCallbacks.current.onPickSketchFace?.(pickedFace(hit));
        return;
      }
      if (ctx.holeMode) {
        if (ctx.holeMode === 'place' && hit?.object.userData.instanceId === ctx.holeSelectedId) {
          const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
          const normals = hit.object.geometry.getAttribute('normal');
          const planar = [hit.face.a, hit.face.b, hit.face.c].every(
            (i) =>
              Math.abs(new THREE.Vector3().fromBufferAttribute(normals, i).normalize().dot(hit.face.normal)) > 0.99999,
          );
          // A mark point near the cursor, dropped square onto the face, is
          // where the hole goes, exactly (no hole-snap rounding).
          const canvas = renderer.domElement.getBoundingClientRect();
          const mark = markPointNear([event.clientX - canvas.left, event.clientY - canvas.top]);
          if (mark) {
            const onFace = new THREE.Plane()
              .setFromNormalAndCoplanarPoint(normal, hit.point)
              .projectPoint(new THREE.Vector3(...mark), new THREE.Vector3());
            holeCallbacks.current.onPlaceHole?.(onFace.toArray(), normal.toArray(), planar, { exact: true });
          } else holeCallbacks.current.onPlaceHole?.(hit.point.toArray(), normal.toArray(), planar);
        }
        return;
      }
      // Rotate about: Picked point. A click on the selected part moves the
      // pivot there instead of re-selecting it.
      if (ctx.pivotPick && ctx.transformMode === 'rotate' && ctx.movingId) {
        const canvas = renderer.domElement.getBoundingClientRect();
        if (pickPivot(hit, [event.clientX - canvas.left, event.clientY - canvas.top])) return;
      }
      // A ring click that missed the part keeps the selection.
      if (ringClick) return;
      // Cut's picker (cut-pick §4.2): a click inside an outline toggles it; a
      // part in front takes it as below; a miss keeps the picker open.
      if (outlineCallback.current) {
        const outline = outlineTarget(ray, hit);
        if (outline) {
          outlineCallback.current(outline);
          return;
        }
        if (!hit && !ctx.shopLayer.pick(ray)) return;
      }
      ctx.selectClick = true;
      // Shift / Ctrl / Cmd+click adds or removes the part's group or the
      // part (the workspace resolves groups, §3.3). An unfolded sheet-metal
      // part is its preview (outside the group): a click on it keeps it.
      const id = hit?.object.userData.instanceId || ctx.shopLayer.pick(ray) || null;
      if (event.shiftKey || event.ctrlKey || event.metaKey) selectionCallback.current(id, { toggle: true });
      else selectionCallback.current(id);
    };
    // A bounding-box corner of the selected part within PIVOT_SNAP_PX of the
    // click, else the exact surface point under it. A corner snaps even when
    // the ray just misses the part (the open end of a tube). Corners that
    // line up on screen (a box seen square-on) resolve to the one nearest the
    // clicked surface, or nearest the viewer: the visible one. Returns
    // whether a pivot was picked.
    // A group (§3.5): any of its parts' corners or surfaces; the point is kept
    // in the frame of its anchor member (ctx.movingInstance).
    const pickPivot = (hit, screen) => {
      const { instance, parameters } = ctx.movingInstance || {};
      const moving = ctx.movingGroups || [];
      if (!instance || !moving.length) return false;
      const onPart = moving.some((g) => g.userData.instanceId === hit?.object.userData.instanceId);
      const reference = onPart ? hit.point : ctx.camera.position;
      let best = null,
        bestDepth = Infinity;
      for (const selected of moving) {
        selected.updateMatrix();
        const [min, max] = selected.userData.bounds;
        for (const x of [min[0], max[0]])
          for (const y of [min[1], max[1]])
            for (const z of [min[2], max[2]]) {
              const corner = new THREE.Vector3(x, y, z).applyMatrix4(selected.matrix);
              const [cx, cy] = projectPx(corner.toArray());
              if (Math.hypot(cx - screen[0], cy - screen[1]) > PIVOT_SNAP_PX) continue;
              const depth = corner.distanceTo(reference);
              if (depth < bestDepth) {
                best = corner;
                bestDepth = depth;
              }
            }
      }
      if (!best && !onPart) return false;
      const point = best || hit.point.clone();
      const local = point.clone().applyMatrix4(instanceMatrix(instance, parameters).invert());
      ctx.pickedPivot = { id: ctx.movingId, local: local.toArray(), corner: Boolean(best) };
      pivot.position.copy(point);
      render();
      return true;
    };
    renderer.domElement.addEventListener('pointerdown', pointerDown);
    renderer.domElement.addEventListener('pointerup', pointerUp);
    return () => {
      // Nothing left to draw: a commit's fallback flush (below) finds it closed.
      ctx.committing = false;
      ctx.renderPending = false;
      observer.disconnect();
      stopTelling?.();
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', trackAlt);
      window.removeEventListener('blur', releaseAlt);
      delete element.cadProject;
      delete element.cadGizmo;
      delete element.cadMarks;
      delete element.cadPlacement;
      delete element.cadShop;
      delete element.cadShopTarget;
      delete element.cadBrakeHand;
      delete element.cadBrakeSpots;
      delete element.cadCamera;
      delete element.cadHoleHandles;
      delete element.cadPlanes;
      if (hoverFrame) cancelAnimationFrame(hoverFrame);
      if (shopFrame) cancelAnimationFrame(shopFrame);
      renderer.domElement.removeEventListener('pointermove', shopMove);
      renderer.domElement.removeEventListener('pointerleave', shopLeave);
      if (outlineFrame) cancelAnimationFrame(outlineFrame);
      renderer.domElement.removeEventListener('pointermove', outlineMove);
      renderer.domElement.removeEventListener('pointerleave', outlineLeave);
      delete element.cadOutlineAt;
      renderer.domElement.removeEventListener('pointerdown', forgetDown, true);
      renderer.domElement.removeEventListener('pointerdown', printDown, true);
      renderer.domElement.removeEventListener('pointermove', printMove, true);
      renderer.domElement.removeEventListener('pointerup', printUp, true);
      renderer.domElement.removeEventListener('pointercancel', printCancel);
      window.removeEventListener('blur', printCancel);
      if (gripFrame) cancelAnimationFrame(gripFrame);
      if (fingerFrame) cancelAnimationFrame(fingerFrame);
      renderer.domElement.removeEventListener('pointerdown', gripDown, true);
      renderer.domElement.removeEventListener('pointermove', gripMove, true);
      renderer.domElement.removeEventListener('pointerup', gripUp, true);
      renderer.domElement.removeEventListener('pointermove', gripHoverMove);
      renderer.domElement.removeEventListener('pointerleave', gripLeave);
      renderer.domElement.removeEventListener('pointercancel', gripCancel);
      window.removeEventListener('blur', gripCancel);
      clearLayer(shopHoverLayer);
      renderer.domElement.removeEventListener('pointermove', planeMove);
      renderer.domElement.removeEventListener('pointerleave', planeLeave);
      clearLayer(planeLayer);
      clearLayer(pickLayer);
      clearLayer(outlineLayer);
      planeLabels?.replaceChildren();
      renderer.domElement.removeEventListener('pointerdown', placementDown, true);
      renderer.domElement.removeEventListener('pointermove', placementMove, true);
      renderer.domElement.removeEventListener('pointerup', placementUp, true);
      renderer.domElement.removeEventListener('dblclick', placementDouble);
      renderer.domElement.removeEventListener('dblclick', selectDouble);
      renderer.domElement.removeEventListener('pointercancel', placementCancel);
      window.removeEventListener('blur', placementCancel);
      placementLayer.dispose();
      shopLayer.dispose();
      renderer.domElement.removeEventListener('pointermove', trackPointer);
      renderer.domElement.removeEventListener('pointermove', measureMove);
      clearLayer(markLayer);
      clearLayer(measureLayer);
      labels?.replaceChildren();
      renderer.domElement.removeEventListener('pointerdown', trackPointer, true);
      drawSnapHighlights(snapLayer, null);
      disposeSnapMaterials(snapLayer);
      endRotateFeedback();
      window.removeEventListener('blur', cancelDrag);
      window.removeEventListener('blur', cancelHoleDrag);
      renderer.domElement.removeEventListener('pointercancel', cancelHoleDrag);
      renderer.domElement.removeEventListener('pointerdown', holeDown, true);
      renderer.domElement.removeEventListener('pointermove', holeMove, true);
      renderer.domElement.removeEventListener('pointerup', holeUp, true);
      renderer.domElement.removeEventListener('pointercancel', cancelDrag);
      renderer.domElement.removeEventListener('pointerdown', pointerDown);
      renderer.domElement.removeEventListener('pointerup', pointerUp);
      drawSketchOverlay(sketchLayer, null);
      scene.remove(helper);
      transform.dispose();
      controls.dispose();
      renderer.dispose();
      // The parts borrow the cache's materials: their geometry here, the
      // materials once through the cache; every other layer disposes its own.
      group.traverse((obj) => obj.geometry?.dispose());
      group.clear();
      ctx.materials.dispose();
      scene.traverse((obj) => {
        obj.geometry?.dispose();
        if (obj.material) (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((m) => m.dispose());
      });
      renderer.domElement.remove();
      sceneRef.current = null;
    };
  }, []);
  // Opens the commit (B1.1, see `render` above): the renders the effects
  // below ask for wait, and the last effect of all draws once. Should an
  // effect in between throw, the microtask still closes the commit and draws.
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    ctx.committing = true;
    queueMicrotask(ctx.flushRender);
  });
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    ctx.cancelHoleDrag();
    ctx.holeMode = ready ? holeMode : holeMode ? 'waiting' : null;
    ctx.holeSelectedId = selectedId;
    ctx.holeHandles.children.forEach((h) => {
      h.geometry.dispose();
      h.material.dispose();
    });
    ctx.holeHandles.clear();
    const instance = snapshot?.instances.find((i) => i.id === selectedId);
    const part = model.parts.find((p) => p.id === instance?.partId);
    const metrics = snapshot?.parts.find((p) => p.id === part?.id)?.features;
    if (holeMode === 'move' && ready && instance) {
      part?.features.forEach((f, index) => {
        const cut = metrics?.[f.id]?.cut;
        if (
          f.type !== 'hole' ||
          f.suppressed ||
          !cut ||
          part.features
            .slice(index + 1)
            .some((f) => !f.suppressed && ['transform', 'mirror', 'pattern'].includes(f.type))
        )
          return;
        const direction = mapPlacement(cut.direction, instance.placement, true);
        const radius = Math.max(Number(f.diameter) / 2 || 2, ctx.span * 0.004 || 2);
        // A hole row (Phase K): one handle per centre; any of them moves the row.
        const centres = metrics[f.id].row?.centres?.length ? metrics[f.id].row.centres : [cut.position];
        centres.forEach((centre, index) => {
          const position = mapPlacement(centre, instance.placement);
          const handle = new THREE.Mesh(
            new THREE.SphereGeometry(radius, 16, 10),
            new THREE.MeshBasicMaterial({
              color: f.positionLocked ? '#8795a4' : '#ffb43b',
              depthTest: false,
              transparent: true,
              opacity: 0.85,
            }),
          );
          handle.renderOrder = 10;
          handle.position.set(...position);
          handle.userData = { featureId: f.id, index, position, direction, locked: f.positionLocked };
          ctx.holeHandles.add(handle);
        });
      });
    }
    ctx.requestRender();
  }, [holeMode, ready, selectedId, snapshot, model]);
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    // Geometry only: the materials belong to ctx.materials and outlive the meshes.
    // A rebuild can land mid-drag (placement edits chain while the kernel
    // works): the dragged parts' edge geometry is what a rotate drag's ghost
    // draws, so it is released when the drag ends rather than here.
    const draggedGroups = new Set((ctx.drag?.groups || []).map((d) => d.group));
    ctx.group.traverse((obj) => {
      if (!obj.geometry) return;
      if (obj.isLineSegments && draggedGroups.has(obj.parent)) ctx.deferredGeometry.push(obj.geometry);
      else obj.geometry.dispose();
    });
    ctx.group.clear();
    for (const item of snapshot?.instances || []) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', floatAttribute(item.mesh.vertices));
      geometry.setAttribute('normal', floatAttribute(item.mesh.normals));
      // The kernel sends a Uint32Array, which `setIndex` would take as an
      // attribute itself; a plain array (test fixtures) still goes straight in.
      const triangles = item.mesh.triangles;
      geometry.setIndex(
        triangles instanceof Uint32Array
          ? new THREE.BufferAttribute(triangles, 1)
          : ArrayBuffer.isView(triangles)
            ? new THREE.Uint32BufferAttribute(triangles, 1)
            : triangles,
      );
      // Placeholders: the pose effect below gives each part its real look.
      const mesh = new THREE.Mesh(geometry, ctx.materials.body(BODY_COLORS.metal, 1, { depthWrite: true }));
      mesh.userData.instanceId = item.id;
      const lineGeometry = new THREE.BufferGeometry();
      lineGeometry.setAttribute('position', floatAttribute(item.edges.lines));
      const edges = new THREE.LineSegments(lineGeometry, ctx.materials.edge(EDGE_COLOR, EDGE_ALPHA.solid));
      // Every pick in the viewport wants the body (each keeps only mesh hits),
      // and testing a ray against thousands of edge segments per pointer move
      // was most of a pick's cost. Measure reads edge positions directly.
      edges.raycast = () => {};
      const group = new THREE.Group();
      group.userData = {
        instanceId: item.id,
        partId: item.partId,
        bounds: item.bounds,
        placement: item.placement,
      };
      group.add(mesh, edges);
      ctx.group.add(group);
    }
    ctx.requestRender();
  }, [snapshot]);
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    const mode = resolveViewMode(viewMode);
    ctx.viewMode = mode;
    const plane = section == null ? null : new THREE.Plane(new THREE.Vector3(0, 0, -1), section);
    // Section: one call clips every cached body and edge material.
    ctx.materials.setClippingPlanes(plane ? [plane] : []);
    const selected = new Set(selectedKey ? selectedKey.split('|') : []);
    const meshed = new Map((snapshot?.instances || []).map((item) => [item.id, item.placement]));
    // Each group's instance and part, looked up once per run (B1.6), the
    // first of an id winning as `find` did.
    const firstById = (list) => {
      const byId = new Map();
      for (const entry of list) if (!byId.has(entry.id)) byId.set(entry.id, entry);
      return byId;
    };
    const instances = firstById(model.instances),
      parts = firstById(model.parts);
    // Isolate shows the selection: one part or every part of a group. The
    // shop layer asks too when its preview hands a part back.
    const shown = (group) => {
      const instance = instances.get(group.userData.instanceId);
      return instance?.visible !== false && (!isolated || selected.has(group.userData.instanceId));
    };
    ctx.groupShown = shown;
    // The shop layer draws this model's records (the effects below run after this one).
    ctx.shopModel = model;
    const finishes = new Map((model.finishes || []).map((f) => [f.instanceId, f]));
    // What the paint booth will paint: outlined, so its colour still shows (§7: selection wins).
    const shopTargets = new Set(shopPick?.targets || []);
    ctx.group.children.forEach((group, index) => {
      const instance = instances.get(group.userData.instanceId);
      const part = parts.get(group.userData.partId);
      // A sheet-metal part unfolded in the shop layer: its preview stands in.
      group.visible = shown(group) && !ctx.shopLayer.hides(group.userData.instanceId);
      // The model commits before the worker rebuilds, so show the committed
      // placement at once by moving the old mesh by (new pose) · (meshed pose)⁻¹;
      // an attached part rides its attachment root's delta (marks.pendingDelta).
      if (!ctx.drag?.groups.some((d) => d.group === group)) {
        const delta =
          instance && group.userData.placement
            ? pendingDelta(model, instance.id, (id) => meshed.get(id), snapshot?.parameters || {})
            : new THREE.Matrix4();
        delta.decompose(group.position, group.quaternion, group.scale);
        if (exploded) group.position.z += index * 85;
      }
      // While placing an operation the part keeps its own colour, so the
      // blue ghost and handles read against it.
      const selectedLook = selected.has(group.userData.instanceId) && !sketchMode && !placing;
      // While drawing a sketch the model stays visible but dimmed; the part
      // being sketched on is a little stronger than the rest.
      const support = sketchMode === 'draw' && group.userData.instanceId === sketchSupportId;
      const dim = sketchMode === 'draw' ? (support ? 0.5 : 0.28) : 1;
      // The view mode decides which bodies are glass (viewMode.js); the look
      // is a swap between cached materials, never a flag flipped in place.
      const look = bodyAppearance({ mode, selected: selectedLook, hardware: isHardwarePart(part), support, dim });
      const [mesh, edges] = group.children;
      // Colour (docs/sketch-studio-fab-shop.md §7): selection, then the paint
      // finish (gloss → roughness), then bare sheet stock, then wood / metal.
      const { color, roughness } = bodyLook(part, selectedLook, finishes.get(group.userData.instanceId));
      group.userData.look = { color, roughness };
      mesh.material = ctx.materials.body(color, look.opacity, { depthWrite: look.depthWrite, roughness });
      mesh.renderOrder = look.renderOrder;
      const target = shopTargets.has(group.userData.instanceId);
      edges.material = ctx.materials.edge(
        look.edgeColorKey === 'selected' || target ? BODY_COLORS.selected : EDGE_COLOR,
        target ? 1 : look.edgeOpacity,
      );
      edges.renderOrder = EDGE_RENDER_ORDER;
    });
    // A rebuild that landed mid-drag replaced the dragged parts' groups. The
    // drag carries on with the new ones: each starts from the pose just shown
    // for it (the same place on screen) and takes the drag's motion so far.
    if (ctx.drag) {
      for (const dragged of ctx.drag.groups) {
        if (dragged.group.parent === ctx.group) continue;
        const replacement = ctx.group.children.find((g) => g.userData.instanceId === dragged.group.userData.instanceId);
        if (!replacement) continue;
        ctx.movingGroups = ctx.movingGroups.map((g) => (g === dragged.group ? replacement : g));
        replacement.updateMatrix();
        dragged.group = replacement;
        dragged.start = replacement.matrix.clone();
        if (ctx.drag.motion) moveGroups([dragged], ctx.drag.motion);
      }
    }
    // Marks ride on the poses just shown.
    ctx.updateMarks();
    ctx.shopLayer.sync();
    ctx.requestRender();
  }, [
    snapshot,
    model,
    selectedKey,
    isolated,
    exploded,
    section,
    sketchMode,
    sketchSupportId,
    placing,
    viewMode,
    shopPick,
  ]);
  // The shop layer's sheet-metal preview, after the poses above (it stands in
  // for one of those groups).
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    ctx.shopModel = model;
    ctx.shopLayer.setView(sheetView);
  }, [sheetView, snapshot, model, selectedKey, isolated, exploded, viewMode]);
  // The replay (§8), before the press brake below (which frames each of the
  // film's hits and puts its own saved camera back after them): as it starts
  // the camera, the brake's saved camera and its key are kept and the
  // product is framed from the isometric side; as it ends every one of them
  // is put back, so an open press brake comes back on the camera it had.
  const filmKey = film?.key || null;
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx || filmKey === (ctx.filmKey || null)) return;
    if (filmKey) {
      ctx.filmSaved ||= {
        camera: ctx.camera,
        target: ctx.controls.target.clone(),
        span: ctx.span,
        savedCamera: ctx.savedCamera || null,
        brakeKey: ctx.brakeKey || null,
        brakeOpenedView: ctx.brakeOpenedView,
      };
      ctx.savedCamera = null;
      ctx.brakeKey = null;
      frameGroups(ctx, new Set(film.ids), perspective);
      // Its hits will show the press brake: its shader programs are linked ahead (shopLayer.js).
      if (film.brake) ctx.shopLayer.prepareStation();
    } else if (ctx.filmSaved) {
      const saved = ctx.filmSaved;
      ctx.filmSaved = null;
      applyCamera(ctx, saved.camera, saved.target, saved.span);
      ctx.savedCamera = saved.savedCamera;
      ctx.brakeKey = saved.brakeKey;
      ctx.brakeOpenedView = saved.brakeOpenedView;
    }
    ctx.filmKey = filmKey;
    // A new film frames once; its ids are the product's as it starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filmKey]);
  // The press brake station, after the poses above (it hides every part).
  // Opening it frames the part in the machine from the operator's side (each
  // hit made frames it again, see onStrokeEnd); leaving puts the camera back
  // where it was.
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    ctx.shopLayer.setStation(brakeView);
    const key = brakeView?.key || null;
    if (key === (ctx.brakeKey || null)) return;
    if (key && !ctx.brakeKey) {
      ctx.savedCamera = { camera: ctx.camera, target: ctx.controls.target.clone(), span: ctx.span };
      // The standard view in force as the station opens: Fit keeps the operator's view until another is chosen.
      ctx.brakeOpenedView = view;
    }
    if (key) frameStation(ctx, STATION_VIEW, perspective);
    else if (ctx.savedCamera) {
      const { camera, target, span } = ctx.savedCamera;
      ctx.savedCamera = null;
      applyCamera(ctx, camera, target, span);
    }
    ctx.brakeKey = key;
    // A new station frames once; poses and model edits never move the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brakeView, snapshot, model, selectedKey, isolated, exploded, viewMode]);
  // Hands on the sheet (HO-1): whether the grip shows and both acts'
  // outcomes, after the station above. A new pose drops the chip until the
  // pointer moves again (the handle may stand elsewhere now).
  useEffect(() => {
    sceneRef.current?.resetGripHover?.();
  }, [brakeView]);
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    ctx.shopLayer.setGrip(brakeView ? brakeGrip : null);
    if (!(brakeView && brakeGrip?.shown)) {
      ctx.dropFingers?.();
      ctx.dropSlide?.();
    }
    // The words of the things in reach (HO-2): the fingers' offer, the edges, the edge at the backgauge.
    ctx.brakeGrip = brakeView ? brakeGrip : null;
    // An outcome arriving while a handle is lit: its chip says it now.
    ctx.refreshGrip?.();
  }, [brakeGrip, brakeView]);
  // The hovered flange gap's marker, after the station above (a new station clears it).
  useEffect(() => {
    sceneRef.current?.shopLayer.setGap(brakeView && brakeGap ? brakeGap : null);
  }, [brakeGap, brakeView]);
  // The shop's records (SM-3): print decals on the parts as shown, after the
  // poses, the unfold view and the station above (each hides parts).
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    ctx.shopLayer.setRecords(model);
    ctx.requestRender();
  }, [snapshot, model, selectedKey, isolated, exploded, viewMode, section, sheetView, brakeView]);
  // The open station's pick: what clicks pick.
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    ctx.shopPick = shopPick;
    if (!shopPick) ctx.cancelPrintDrag?.();
    ctx.drawShopPick();
  }, [shopPick]);
  // The replay's mask, after the poses above (the pose effect asks
  // shopLayer.hides, so a re-pose keeps the mask).
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    ctx.shopLayer.setHidden(filmHidden);
  }, [filmHidden, snapshot, model, selectedKey, isolated, exploded, viewMode]);
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    ctx.marks = marks || [];
    ctx.selectedMarkId = selectedMarkId;
    ctx.hideMarks = hideMarks;
    ctx.updateMarks();
    ctx.requestRender();
  }, [marks, snapshot, model, selectedMarkId, hideMarks, isolated, exploded]);
  // Origin plane tiles, after the poses above so the size follows the
  // displayed model; a new mesh drops the cached hovered face.
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    ctx.model = model;
    ctx.syncPlanes(planesVisible, planesOffset);
  }, [planesVisible, planesOffset, snapshot, model, selectedKey, isolated, exploded]);
  useEffect(() => {
    sceneRef.current?.clearPlaneHover();
  }, [snapshot]);
  // Draw's outlines (docs/sketch-studio-outline-edit-sheet-nest.md §3.5):
  // rebuilt only when the workspace hands a new list (it builds one per
  // outline set and chosen row, and null on every other panel); one render,
  // no camera move, nothing per frame.
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    drawShopOutlines(ctx.outlineLayer, shopOutlines);
    ctx.shopOutlineCount = shopOutlines?.length || 0;
    ctx.shopOutlinesChosen = (shopOutlines || []).filter((o) => o.chosen).map((o) => o.id);
    // What a click can pick under Cut's picker (cut-pick §4.2), built here, once per list.
    ctx.outlinePick = outlinePickAreas(shopOutlines);
    ctx.requestRender();
  }, [shopOutlines]);
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    ctx.measureMode = measureMode;
    // Entering or leaving the tool starts from a clean slate.
    ctx.cancelMeasure();
  }, [measureMode]);
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    ctx.sketchMode = sketchMode;
    ctx.selectClick = false;
    ctx.clearPlaneHover();
    // Left button draws while sketching; right-drag pans and the wheel zooms.
    ctx.controls.enableRotate = sketchMode !== 'draw';
  }, [sketchMode]);
  useEffect(() => {
    // A picked pivot belongs to one selection; a new one starts at the centre.
    const ctx = sceneRef.current;
    if (!ctx) return;
    ctx.pickedPivot = null;
    ctx.pivotPick = pivotPick;
  }, [movingKey, pivotPick]);
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    ctx.placing = placing;
    ctx.placementLayer.setView(placement);
  }, [placement, placing]);
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    // A boolean tool drag keeps the gizmo until it ends (the next view re-runs this).
    if (ctx.toolGizmo && ctx.placementLayer.isDragging()) return;
    // So does a part drag: a rebuild landing mid-drag (the previous drop's)
    // must not snap the part back. The pose effect has already moved the drag
    // onto the rebuilt groups.
    if (ctx.drag) return;
    ctx.cancelDrag();
    ctx.transform.detach();
    ctx.placementLayer.detachTool();
    ctx.movingId = null;
    ctx.movingGroups = [];
    ctx.movingInstance = null;
    const ids = selectedKey ? selectedKey.split('|') : [];
    // The displayed parts the gizmo carries: the selected part, or every
    // visible part of a group or multi-selection (§3.5).
    const moving = movingKey ? ctx.group.children.filter((g) => g.visible && ids.includes(g.userData.instanceId)) : [];
    if (moveEnabled && moving.length && !exploded) {
      ctx.group.updateMatrixWorld(true);
      // The centre of the union of the displayed boxes (one part: its own box).
      if (movingBody) unionBox(moving).getCenter(ctx.pivot.position);
      else {
        const [min, max] = moving[0].userData.bounds;
        moving[0].updateMatrix();
        ctx.pivot.position.set(...min.map((value, i) => (value + max[i]) / 2)).applyMatrix4(moving[0].matrix);
      }
      // A group keeps a picked pivot in the frame of its anchor member: the
      // first free part (no attachment) in model order, whose pose a move edits.
      const anchorId = movingBody ? ids.find((id) => attachmentRoot(model, id) === id) || null : movingKey;
      const instance = model.instances.find((i) => i.id === anchorId);
      const rotating = transformMode === 'rotate';
      // A picked pivot is kept in the part's own frame, so it stays on the
      // same spot of the part through later moves and turns.
      const picked = rotating && pivotPick && ctx.pickedPivot?.id === movingKey && instance;
      if (picked)
        ctx.pivot.position
          .set(...ctx.pickedPivot.local)
          .applyMatrix4(instanceMatrix(instance, snapshot?.parameters || {}));
      // Local space: the rings follow the part's current orientation (never a group's).
      const local = rotating && rotateSpace === 'local' && !movingBody && instance;
      if (local) ctx.pivot.quaternion.copy(instanceOrientation(instance, snapshot?.parameters || {}));
      else ctx.pivot.quaternion.identity();
      ctx.rotateSpace = local ? 'local' : 'world';
      ctx.transform.setSpace(ctx.rotateSpace);
      ctx.transform.setSize(rotating ? RING_SIZE : MOVE_SIZE);
      ctx.transformMode = transformMode;
      ctx.transform.setMode(transformMode);
      ctx.transform.attach(ctx.pivot);
      // Snap distance from this placement, not the absolute world coordinate.
      ctx.transform.setTranslationSnap(null);
      ctx.movingId = movingKey;
      ctx.movingGroups = moving;
      ctx.movingInstance = instance ? { instance, parameters: snapshot?.parameters || {} } : null;
    } else if (placement?.toolGizmo && !exploded) ctx.placementLayer.attachTool(transformMode);
    ctx.requestRender();
  }, [
    snapshot,
    model,
    selectedKey,
    movingKey,
    movingBody,
    moveEnabled,
    exploded,
    isolated,
    transformMode,
    rotateSpace,
    pivotPick,
    placement,
  ]);
  useEffect(() => {
    const ctx = sceneRef.current;
    if (ctx) ctx.snap = moveSnap;
  }, [moveSnap]);
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    // The dial snaps the ring angle itself (so it can count past ±180° and
    // honour Alt); TransformControls' own snap would only quantise the
    // tangent-travel angle the dial overrides.
    ctx.rotateSnap = rotateSnap;
    ctx.transform.setRotationSnap(null);
  }, [rotateSnap]);
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    // The one-time fit belongs to a model opened with parts: an empty model's
    // camera is already framed, so a part added in this session never moves it.
    if (!hasInstances) ctx.hasFitted = true;
    // The press brake frames its own scene, whatever the kernel is doing.
    const station = ctx.shopLayer.stationOpen();
    if (!ready && !station) return;
    const viewChanged = ctx.lastView !== view || ctx.lastPerspective !== perspective || ctx.lastFitKey !== fitKey;
    // The one-time fit frames committed geometry only, never an operation
    // preview: a first preview on an empty model must not move the camera.
    const committedGeometry = !previewShown && Boolean(snapshot?.instances.length);
    const firstGeometry = !station && !ctx.hasFitted && committedGeometry;
    if (!viewChanged && !firstGeometry) return;
    ctx.lastView = view;
    ctx.lastPerspective = perspective;
    ctx.lastFitKey = fitKey;
    ctx.hasFitted ||= committedGeometry;
    // The press brake hides every part: Fit and the standard views frame the
    // station (the part and the tooling round it) instead, Fit from the
    // operator's side until another standard view is chosen.
    if (station) {
      frameStation(
        ctx,
        view === ctx.brakeOpenedView ? STATION_VIEW : STANDARD_VIEWS[view] || STANDARD_VIEWS.isometric,
        perspective,
      );
      return;
    }
    const bounds = new THREE.Box3().setFromObject(ctx.group),
      center = new THREE.Vector3(),
      size = new THREE.Vector3();
    if (bounds.isEmpty()) {
      center.set(0, 0, 0);
      size.set(600, 600, 600);
    } else {
      bounds.getCenter(center);
      bounds.getSize(size);
    }
    const span = Math.max(size.x, size.y, size.z, 100) * 1.6;
    ctx.span = span;
    const next = perspective
      ? new THREE.PerspectiveCamera(40, 1, 0.1, 1e7)
      : new THREE.OrthographicCamera(-span, span, span, -span, 0.1, 1e7);
    const dir = new THREE.Vector3(...(STANDARD_VIEWS[view] || STANDARD_VIEWS.isometric)).normalize();
    next.up.set(0, Math.abs(dir.z) > 0.999 ? 1 : 0, Math.abs(dir.z) > 0.999 ? 0 : 1);
    next.position.copy(center).addScaledVector(dir, span * 1.7);
    next.lookAt(center);
    ctx.camera = next;
    ctx.transform.camera = next;
    ctx.controls.object = next;
    ctx.controls.target.copy(center);
    ctx.controls.update();
    ctx.resize();
  }, [view, perspective, fitKey, snapshot, ready, previewShown, hasInstances]);
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx || !focusTarget) return;
    const target = new THREE.Vector3(...focusTarget.position);
    const normal = new THREE.Vector3(...focusTarget.normal).normalize();
    ctx.span = focusTarget.span;
    // A wheel zoom of an orthographic camera is its `zoom`: back to 1, so the span is what is framed.
    if (ctx.camera.isOrthographicCamera && ctx.camera.zoom !== 1) ctx.camera.zoom = 1;
    // An explicit up (a sketch's +v axis) makes the view square to the sketch.
    if (focusTarget.up) ctx.camera.up.set(...focusTarget.up);
    else ctx.camera.up.set(0, Math.abs(normal.z) > 0.999 ? 1 : 0, Math.abs(normal.z) > 0.999 ? 0 : 1);
    ctx.camera.position.copy(target).addScaledVector(normal, ctx.span * 1.7);
    ctx.controls.target.copy(target);
    ctx.camera.lookAt(target);
    ctx.controls.update();
    ctx.resize();
  }, [focusTarget]);
  // The last effect (B1.1): the commit's one draw, with every effect above applied.
  // Keep it last: an effect declared after it would draw on its own again.
  useEffect(() => {
    sceneRef.current?.flushRender();
  });
  return (
    <div ref={host} className="cad-viewport" aria-label="Solid model viewport" data-view-mode={shownViewMode}>
      <div ref={hudRef} className="cad-gizmo-hud" aria-label="Gizmo readout" />
      {/* The press brake's grip chip (hands on the sheet §5.2): the toolbar's Sheet buttons say the same to a screen reader. */}
      <div ref={gripChipRef} className="cad-grip-chip" aria-hidden="true">
        <div className="cad-grip-chip-title" />
        <div className="cad-grip-chip-outcome" />
      </div>
      <div ref={measureHudRef} className="cad-measure-hud" aria-label="Measure readout" />
      <div ref={placementHudRef} className="cad-placement-hud" aria-label="Placement readout" />
      <div ref={labelsRef} className="cad-mark-labels" aria-label="Dimension marks" />
      <div ref={sketchDimLabelsRef} className="cad-sketch-dim-labels" aria-label="Sketch dimensions" />
      <div ref={shopLabelsRef} className="cad-shop-labels" aria-label="Bend lines" />
      <div ref={planeLabelsRef} className="cad-plane-labels" aria-label="Origin planes" />
      {brakeView && <BrakeSideView subscribe={subscribeStation} />}
      {error && <p role="alert">3D display unavailable: {error}</p>}
      <div className="cad-viewport-hint">
        {isSeeThrough(shownViewMode) && <div className="cad-view-mode-hint">{VIEW_MODE_COPY[shownViewMode].hint}</div>}
        {measureMode && (
          <div>
            {measureStage === 'second'
              ? 'Click the second point · Esc clears the first point'
              : 'Measure: click the first point · corners, edge midpoints and marks snap · Esc cancels'}
            {measureMissed ? ' · Point at a part' : ''}
          </div>
        )}
        {placement?.hint && <div className="cad-placement-hint">{placement.hint}</div>}
        {sketchMode === 'pick' && <div className="cad-pick-hint">{pickHint || hoverHint || PICK_HINT}</div>}
        {shopPick?.hint && (
          <div className="cad-pick-hint">
            {shopPick.hint}
            {hoverHint ? ` · ${hoverHint}` : ''}
          </div>
        )}
        {!sketchMode && planesVisible && !measureMode && !placement && (
          <div className="cad-pick-hint">{hoverHint || REST_HINT}</div>
        )}
        {sketchMode === 'draw' && (
          <div>Click to draw · Shift locks horizontal/vertical · Right-drag pans · Scroll zooms</div>
        )}
        {holeMode === 'place' && (
          <div>Click a surface of the selected part to place a hole · mark points snap exactly · Esc finishes</div>
        )}
        {holeMode === 'move' && (
          <div>Drag an orange hole center along its plane · Gray centers are locked · Esc cancels</div>
        )}
        {moveEnabled && transformMode === 'rotate' && pivotPick && (
          <div>
            {movingBody
              ? 'Click a point on the selected group to turn about it · corners snap'
              : 'Click a point on the selected part to turn about it · corners snap'}
          </div>
        )}
        {moveEnabled && transformMode === 'rotate'
          ? `Drag a red/green/blue ring around the centre to turn about ${rotateSpace === 'local' ? "the part's own " : ''}X/Y/Z · Alt turns freely · type an angle + Enter · [ ] turn about Z, Shift+[ ] about X · M move · Esc cancels · `
          : moveEnabled
            ? 'Drag the center freely, a plane square, or X/Y/Z arrows · R rotate · Esc cancels · '
            : ''}
        {measureMode
          ? 'Drag background to orbit · Right drag to pan · Scroll to zoom'
          : brakeView
            ? // The press brake (hands on the sheet §5.5): the station's own line, then the view's.
              `${brakeGrip ? `${brakeHint(brakeGrip.lined, brakeGrip.mode, brakeGrip.pieces?.length || 0)} · ` : ''}Drag background to orbit · Right drag to pan · Scroll to zoom`
            : !sketchMode &&
              (placement || shopPick
                ? 'Drag background to orbit · Right drag to pan · Scroll to zoom'
                : 'Drag background to orbit · Right drag to pan · Scroll to zoom · Click a part to select')}
        {moveHint && <div>{moveHint}</div>}
      </div>
    </div>
  );
}

// The standard views: from the target toward the camera.
const STANDARD_VIEWS = Object.freeze({
  top: [0, 0, 1],
  bottom: [0, 0, -1],
  front: [0, -1, 0],
  rear: [0, 1, 0],
  left: [-1, 0, 0],
  right: [1, 0, 0],
  isometric: [1, -1, 0.8],
});
// Put a camera in charge: OrbitControls, the gizmo and the frustum follow it.
function applyCamera(ctx, camera, target, span) {
  ctx.camera = camera;
  ctx.transform.camera = camera;
  ctx.controls.object = camera;
  ctx.controls.target.copy(target);
  ctx.span = span;
  ctx.controls.update();
  ctx.resize();
}
// Frame the kernel groups of `ids` (a product the replay plays, §8) from the
// isometric side in a fresh camera, as Fit frames the whole model.
function frameGroups(ctx, ids, perspective) {
  const bounds = new THREE.Box3();
  for (const group of ctx.group.children) if (ids.has(group.userData.instanceId)) bounds.expandByObject(group);
  if (bounds.isEmpty()) return;
  const center = bounds.getCenter(new THREE.Vector3()),
    size = bounds.getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.y, size.z, 100) * 1.6;
  const camera = perspective
    ? new THREE.PerspectiveCamera(40, 1, 0.1, 1e7)
    : new THREE.OrthographicCamera(-span, span, span, -span, 0.1, 1e7);
  const dir = new THREE.Vector3(...STANDARD_VIEWS.isometric).normalize();
  camera.up.set(0, 0, 1);
  camera.position.copy(center).addScaledVector(dir, span * 1.7);
  camera.lookAt(center);
  applyCamera(ctx, camera, center, span);
}
// Frame the press brake station (shopLayer.stationFocus: the part and the
// tooling round it) from `direction` (toward the camera), in a fresh camera of
// the projection asked for. Orbit, pan and zoom stay free afterwards.
function frameStation(ctx, direction, perspective) {
  const focus = ctx.shopLayer.stationFocus();
  if (!focus) return;
  const dir = new THREE.Vector3(...direction).normalize();
  const up = new THREE.Vector3(0, Math.abs(dir.z) > 0.999 ? 1 : 0, Math.abs(dir.z) > 0.999 ? 0 : 1);
  // The box's extent across the view (the screen's right and up), so the
  // frame is as tight as the view direction allows, centred on the box as seen.
  const right = new THREE.Vector3().crossVectors(up, dir).normalize();
  const upright = new THREE.Vector3().crossVectors(dir, right);
  const [min, max] = focus.box;
  const centre = new THREE.Vector3(...focus.centre);
  let x0 = Infinity,
    x1 = -Infinity,
    y0 = Infinity,
    y1 = -Infinity;
  for (const x of [min[0], max[0]])
    for (const y of [min[1], max[1]])
      for (const z of [min[2], max[2]]) {
        const p = new THREE.Vector3(x, y, z).sub(centre);
        const a = p.dot(right),
          b = p.dot(upright);
        [x0, x1, y0, y1] = [Math.min(x0, a), Math.max(x1, a), Math.min(y0, b), Math.max(y1, b)];
      }
  centre.addScaledVector(right, (x0 + x1) / 2).addScaledVector(upright, (y0 + y1) / 2);
  // The station's cards (the side view, the flat blank) stand in a column on
  // the left: the machine is framed in the rest of the view, so the target
  // moves left by half the column (the orbit turns about it, as after a pan).
  const canvas = ctx.renderer.domElement;
  const width = canvas.clientWidth || 1,
    height = canvas.clientHeight || 1;
  const bounds = canvas.getBoundingClientRect();
  const cards = canvas.closest('.cad-model-view')?.querySelectorAll('.cad-brake-side, .cad-brake-map') || [];
  let reserve = 0;
  for (const card of cards) {
    const rect = card.getBoundingClientRect();
    if (rect.width && rect.left - bounds.left < width / 2) reserve = Math.max(reserve, rect.right - bounds.left + 8);
  }
  reserve = Math.min(reserve, width * 0.45);
  const free = width - reserve;
  const span = Math.max(y1 - y0, ((x1 - x0) * height) / free, 100) * STATION_MARGIN;
  centre.addScaledVector(right, -((reserve / 2) * span) / height);
  const camera = perspective
    ? new THREE.PerspectiveCamera(40, 1, 0.1, 1e7)
    : new THREE.OrthographicCamera(-span, span, span, -span, 0.1, 1e7);
  camera.up.copy(up);
  const depth = new THREE.Vector3(...max).sub(new THREE.Vector3(...min)).length();
  camera.position.copy(centre).addScaledVector(dir, perspective ? span * 1.4 + depth / 2 : Math.max(span * 1.7, depth));
  camera.lookAt(centre);
  applyCamera(ctx, camera, centre, span);
  ctx.render();
}
// Room round the station's frame (the cards over the viewport sit at its sides).
const STATION_MARGIN = 1.35;
// The paint and print stations' picks: the outline of the flat face under the cursor.
const SHOP_FACE_COLOR = '#1c7ed6';

// Move gizmo size (the rotate rings use RING_SIZE: a larger dial is easier
// to grab and finer to turn).
const MOVE_SIZE = 0.85;
// HUD: offset from the cursor and the gap kept to the viewport edge (px).
const HUD_OFFSET = 18;
const HUD_MARGIN = 6;
// A picked pivot snaps to a bounding-box corner this close on screen (px).
const PIVOT_SNAP_PX = 8;
const AXIS_UNITS = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };
// Sector resolution: one triangle per 5° of sweep.
const SECTOR_SEGMENTS = 72;
// Dimension marks: purple, orange when selected (SKETCH_COLORS.selected).
const MARK_COLOR = '#8a3fc6';
const MARK_SELECTED_COLOR = '#e2541c';
// Points per mark: the dimension line, two extensions and two ticks.
const MARK_POINTS = 10;
// Measure cursor marker: centre to side (px).
const MEASURE_MARKER_PX = 6;
// Origin plane tiles: resting / hovered fill alpha and edge colour, the
// hovered-face outline, the label gap (px) and the tie that a face lying in
// a tile's plane wins (mm along the ray).
const TILE_COLOR = '#287fb3';
const TILE_ALPHA = 0.06;
const TILE_HOVER_ALPHA = 0.22;
const TILE_EDGE = '#8fa6b8';
const TILE_EDGE_HOVER = '#246e9a';
const PICK_COLOR = '#287fb3';
const LABEL_GAP_PX = 4;
const TILE_TIE_MM = 0.01;

// A part's xyz buffer (docs/perf-pass-3.md §5 B1.2). The kernel transfers
// its tessellation as Float32Arrays the snapshot holds and nothing writes:
// the attribute takes the array itself, where Float32BufferAttribute would
// copy it (a second copy of every part on every rebuild). Plain arrays (test
// fixtures) and any other typed array are converted as before. Bounds stay
// three's to compute: the kernel's `bounds` is OpenCascade's box, which may be
// looser than the tessellation and would move every box read off a part.
function floatAttribute(array) {
  return array instanceof Float32Array
    ? new THREE.BufferAttribute(array, 3)
    : new THREE.Float32BufferAttribute(array, 3);
}

// Dispose a layer's own geometry and materials and empty it.
function clearLayer(layer) {
  layer.traverse((obj) => {
    if (obj === layer) return;
    obj.geometry?.dispose();
    obj.material?.dispose();
  });
  layer.clear();
}

// A world-space overlay line for the Measure tool (drawn over the model).
function overlayLine(points, name, opacity = 1, segments = false) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
  const material = new THREE.LineBasicMaterial({ color: MARK_COLOR, transparent: true, opacity, depthTest: false });
  const line = segments ? new THREE.LineSegments(geometry, material) : new THREE.Line(geometry, material);
  line.name = name;
  line.renderOrder = 36;
  line.frustumCulled = false;
  return line;
}

// Rotate drag feedback, built once per drag and updated in place per move:
// a ghost of each moving part's edges at its start pose (sharing the edge
// geometry, so it is never disposed here), the swept sector, its arc, and
// radials to the start and current angle. `moving`: [{ group, start }].
function createRotateFeedback(layer, moving, color) {
  clearRotateFeedback(layer);
  const overlay = (object, name, order) => {
    object.name = name;
    object.renderOrder = order;
    object.frustumCulled = false;
    layer.add(object);
    return object;
  };
  for (const { group, start } of moving) {
    const edges = group.children[1];
    if (!edges?.geometry) continue;
    const ghost = new THREE.LineSegments(
      edges.geometry,
      new THREE.LineBasicMaterial({ color: '#3e4e5f', transparent: true, opacity: 0.3, depthTest: false }),
    );
    ghost.userData.sharedGeometry = true;
    ghost.matrixAutoUpdate = false;
    ghost.matrix.copy(start);
    ghost.matrixWorldNeedsUpdate = true;
    overlay(ghost, 'rotate-ghost', 35);
  }
  const buffer = (count) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setDrawRange(0, 0);
    return geometry;
  };
  const sector = overlay(
    new THREE.Mesh(
      buffer(SECTOR_SEGMENTS * 3),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
      }),
    ),
    'rotate-sector',
    41,
  );
  const lineMaterial = (opacity) =>
    new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false });
  const arc = overlay(new THREE.Line(buffer(SECTOR_SEGMENTS + 1), lineMaterial(0.8)), 'rotate-arc', 42);
  const radials = overlay(new THREE.LineSegments(buffer(4), lineMaterial(1)), 'rotate-radials', 42);
  return { sector, arc, radials };
}

// Fill the sector from the start direction through `degrees` about the axis
// (a full disc past one turn).
function drawRotateFeedback(feedback, { center, axis, radius, start, degrees }) {
  if (!feedback || !start) return;
  const a = new THREE.Vector3(...axis);
  const from = new THREE.Vector3(...start);
  const sweep = THREE.MathUtils.degToRad(Math.sign(degrees) * Math.min(Math.abs(degrees), 360));
  const n = Math.max(1, Math.ceil((Math.abs(sweep) / (Math.PI * 2)) * SECTOR_SEGMENTS));
  const rim = (i) =>
    from
      .clone()
      .applyAxisAngle(a, (sweep * i) / n)
      .multiplyScalar(radius)
      .add(center);
  const sector = feedback.sector.geometry.getAttribute('position'),
    arc = feedback.arc.geometry.getAttribute('position'),
    radials = feedback.radials.geometry.getAttribute('position');
  let previous = rim(0);
  arc.setXYZ(0, previous.x, previous.y, previous.z);
  for (let i = 1; i <= n; i++) {
    const next = rim(i);
    sector.setXYZ((i - 1) * 3, center.x, center.y, center.z);
    sector.setXYZ((i - 1) * 3 + 1, previous.x, previous.y, previous.z);
    sector.setXYZ((i - 1) * 3 + 2, next.x, next.y, next.z);
    arc.setXYZ(i, next.x, next.y, next.z);
    previous = next;
  }
  const first = rim(0),
    last = from.clone().applyAxisAngle(a, THREE.MathUtils.degToRad(degrees)).multiplyScalar(radius).add(center);
  radials.setXYZ(0, center.x, center.y, center.z);
  radials.setXYZ(1, first.x, first.y, first.z);
  radials.setXYZ(2, center.x, center.y, center.z);
  radials.setXYZ(3, last.x, last.y, last.z);
  for (const attribute of [sector, arc, radials]) attribute.needsUpdate = true;
  // No sector at 0°: just the start radial.
  feedback.sector.geometry.setDrawRange(0, degrees ? n * 3 : 0);
  feedback.arc.geometry.setDrawRange(0, degrees ? n + 1 : 0);
  feedback.radials.geometry.setDrawRange(0, 4);
}

// The ghost borrows the part's edge geometry, so only its material is ours.
function clearRotateFeedback(layer) {
  for (const object of layer.children) {
    if (!object.userData.sharedGeometry) object.geometry?.dispose();
    object.material?.dispose();
  }
  layer.clear();
}

// Each moving part's group at `motion` · its drag-start matrix (motion null:
// back at the start). One part or every part of a group moves rigidly.
function moveGroups(moving, motion) {
  for (const { group, start } of moving) {
    const matrix = motion ? motion.clone().multiply(start) : start;
    matrix.decompose(group.position, group.quaternion, group.scale);
  }
}

// The world box around several displayed part groups.
function unionBox(groups) {
  const box = new THREE.Box3();
  for (const g of groups) box.expandByObject(g);
  return box;
}

// The ground point under the centre of the view (NDC 0, 0; perspective or
// orthographic), rounded to `snap` (1 mm when 0). A centre ray that runs
// along the ground or points away from it falls back to the orbit target.
function groundDropPoint(camera, target, snap) {
  camera.updateMatrixWorld();
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(0, 0), camera);
  // A ray within ~0.0001° of level counts as parallel: front/side views would
  // otherwise meet the ground kilometres away through rounding noise.
  const hit =
    Math.abs(ray.ray.direction.z) > 1e-6
      ? ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), new THREE.Vector3())
      : null;
  const ground = hit ? [hit.x, hit.y] : [target.x, target.y];
  const step = snap > 0 ? snap : 1;
  // + 0 turns a rounded -0 into 0.
  return [...ground.map((n) => Math.round(n / step) * step + 0), 0];
}

const planeOf = (frame) =>
  new THREE.Plane().setFromNormalAndCoplanarPoint(
    new THREE.Vector3(...frame.normal),
    new THREE.Vector3(...frame.origin),
  );

// What a face pick keeps per part mesh (docs/perf-pass-3.md §5 B1.5), so a
// newly hovered face costs the face, not the mesh: its index, the triangles
// at each vertex (sketchPlane.meshAdjacency, built once) and the vertices
// brought to world space so far under the pose they were taken at; a new pose
// starts that copy over. Held by the geometry: a rebuild's new geometry
// starts afresh and the old entry goes with the old geometry.
const faceMeshes = new WeakMap();
function faceMesh(mesh) {
  const geometry = mesh.geometry;
  const source = geometry.getAttribute('position');
  const indexArray = geometry.index ? geometry.index.array : null;
  let entry = faceMeshes.get(geometry);
  if (!entry || entry.source !== source || entry.indexArray !== indexArray) {
    const index = indexArray || Array.from({ length: source.count }, (_, i) => i);
    entry = {
      source,
      indexArray,
      index,
      adjacency: meshAdjacency(index, source.count),
      pose: null,
      world: new Float64Array(source.count * 3),
      done: new Uint8Array(source.count),
    };
    faceMeshes.set(geometry, entry);
  }
  const pose = mesh.matrixWorld.elements;
  if (!entry.pose || entry.pose.some((value, i) => value !== pose[i])) {
    entry.pose = [...pose];
    entry.done.fill(0);
  }
  return entry;
}

// The flat face under a pick: its plane frame (see sketchPlane.faceFrame) and
// its outline in sketch coordinates, taken from the displayed (world) mesh.
function pickedFace(hit) {
  const mesh = hit.object;
  mesh.updateMatrixWorld(true);
  const geometry = mesh.geometry;
  const normals = geometry.getAttribute('normal');
  const planar = [hit.face.a, hit.face.b, hit.face.c].every(
    (i) => Math.abs(new THREE.Vector3().fromBufferAttribute(normals, i).normalize().dot(hit.face.normal)) > 0.99999,
  );
  const normal = hit.face.normal.clone().transformDirection(mesh.matrixWorld).toArray();
  const info = {
    instanceId: mesh.userData.instanceId,
    partId: mesh.parent.userData.partId,
    point: hit.point.toArray(),
    normal,
    planar,
  };
  if (!planar) return info;
  // Only the vertices the face and its rim of neighbours use go to world
  // space, each once per pose (faceMesh); the same numbers the whole-mesh copy gave.
  const { source, index, adjacency, world, done } = faceMesh(mesh);
  const v = new THREE.Vector3();
  const point = (i) => {
    if (!done[i]) {
      v.fromBufferAttribute(source, i).applyMatrix4(mesh.matrixWorld);
      world[i * 3] = v.x;
      world[i * 3 + 1] = v.y;
      world[i * 3 + 2] = v.z;
      done[i] = 1;
    }
    return [world[i * 3], world[i * 3 + 1], world[i * 3 + 2]];
  };
  const outline = faceOutline(world, index, hit.faceIndex, normal, undefined, { adjacency, point });
  // The centroid reads every corner of the face's triangles.
  for (const t of outline.triangles) for (let k = 0; k < 3; k++) point(index[t * 3 + k]);
  const frame = faceFrame(normal, outline.points);
  return {
    ...info,
    frame,
    outline: segmentsInPlane(frame, outline.segments, 0.05),
    // For direct placement: the face's world outline, its centroid and triangles.
    outlineWorld: outline.segments,
    centre: faceCentroid(world, index, outline.triangles),
    triangles: outline.triangles,
  };
}

// Box snap outline colours: flush orange, aligned blue, a mark purple.
const SNAP_COLORS = { flush: '#e0861a', aligned: '#2f9be6', mark: MARK_COLOR, 'mark centre': MARK_COLOR };
// Outline the moving box's face at each snapped plane (for a centre snap, the
// moving box's outline through its middle at that plane).
// One material per colour, kept on the layer for the viewport's life
// (docs/perf-pass-3.md §5 B1.3): a material disposed and made again on every
// drag step was the only user of its program, so three destroyed and
// relinked it each move (the placement layer's overlay materials had the
// same bug). disposeSnapMaterials releases them on unmount.
function snapMaterial(layer, color) {
  const cache = (layer.userData.materials ||= new Map());
  let material = cache.get(color);
  if (!material) cache.set(color, (material = new THREE.LineBasicMaterial({ color, depthTest: false })));
  return material;
}
function disposeSnapMaterials(layer) {
  for (const material of layer.userData.materials?.values() || []) material.dispose();
  layer.userData.materials = null;
}
function drawSnapHighlights(layer, state) {
  layer.traverse((obj) => {
    if (obj === layer) return;
    obj.geometry?.dispose();
  });
  layer.clear();
  if (!state) return;
  const min = state.box.min.map((v, i) => v + state.delta[i]),
    max = state.box.max.map((v, i) => v + state.delta[i]);
  for (const snap of state.snaps) {
    const [a, b] = [0, 1, 2].filter((i) => i !== snap.axis);
    const corner = (u, v) => {
      const p = [0, 0, 0];
      p[snap.axis] = snap.value;
      p[a] = u;
      p[b] = v;
      return p;
    };
    const ring = [corner(min[a], min[b]), corner(max[a], min[b]), corner(max[a], max[b]), corner(min[a], max[b])];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([...ring, ring[0]].flat(), 3));
    const line = new THREE.Line(geometry, snapMaterial(layer, SNAP_COLORS[snap.kind] || SNAP_COLORS.aligned));
    line.renderOrder = 40;
    line.name = `snap-${snap.kind}`;
    line.userData.snap = snap;
    layer.add(line);
  }
}

const SKETCH_COLORS = {
  grid: '#b4c1cd',
  axisU: '#d24c4c',
  axisV: '#3d9a4f',
  boundary: '#e0861a',
  entity: '#14558f',
  selected: '#e2541c',
  preview: '#2f9be6',
  snap: '#e2541c',
  free: '#6c7c8c',
  // The selection box (docs/sketch-studio-hand-drawing.md §5.1): inside, touching.
  boxInside: '#1f6fd1',
  boxTouching: '#2f8f3f',
  // Check's markers (docs/sketch-studio-hand-drawing.md §6.5).
  problem: '#d22f27',
};
// A closed ring of `steps` chords round `center` (plane mm).
const circlePoints = ([u, v], radius, steps) =>
  Array.from({ length: steps + 1 }, (_, i) => [
    u + radius * Math.cos((i / steps) * Math.PI * 2),
    v + radius * Math.sin((i / steps) * Math.PI * 2),
  ]);
// Every entity's polyline as LineSegments pairs.
function polylineSegments(entities) {
  const segments = [];
  for (const entity of entities) {
    const points = entityPolyline(entity);
    for (let i = 1; i < points.length; i++) segments.push(points[i - 1], points[i]);
  }
  return segments;
}
// LineSegments pairs drawn dashed (`dash` mm on, about two thirds of it off), on top like lineObject's.
function dashedSegments(points, color, dash, order = 30) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      points.flatMap((p) => [p[0], p[1], 0]),
      3,
    ),
  );
  const material = new THREE.LineDashedMaterial({
    color,
    dashSize: dash,
    gapSize: dash * 0.6,
    transparent: true,
    depthTest: false,
  });
  const line = new THREE.LineSegments(geometry, material);
  line.computeLineDistances();
  line.renderOrder = order;
  return line;
}
// Explicit draw order (depth testing is off): grid and axes, then model
// edges, then the sketch, the rubber band and the snap marker on top.
function lineObject(points, color, opacity = 1, segments = false, order = 30) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      points.flatMap((p) => [p[0], p[1], 0]),
      3,
    ),
  );
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false });
  const line = segments ? new THREE.LineSegments(geometry, material) : new THREE.Line(geometry, material);
  line.renderOrder = order;
  return line;
}

// Draw's outlines (§3.5 of docs/sketch-studio-outline-edit-sheet-nest.md):
// the shop's accent for those ready to cut, its warning colour for the rest
// (cad.css --shop-accent, --shop-warn). WebGL draws every line one pixel wide,
// so the chosen outline is the heavier one by being opaque (the others are
// faded) and, when it is a blank, by a light fill of its face.
const OUTLINE_COLORS = { ready: '#287fb3', problem: '#a8620b' };
function drawShopOutlines(layer, outlines) {
  clearLayer(layer);
  for (const outline of outlines || []) {
    const color = outline.ready ? OUTLINE_COLORS.ready : OUTLINE_COLORS.problem;
    for (const ring of outline.rings) {
      const points = ring.closed ? [...ring.points, ring.points[0]] : ring.points;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(
          points.flatMap(([x, y]) => [x, y, 0]),
          3,
        ),
      );
      const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: outline.chosen ? 1 : 0.6 });
      const line = new THREE.Line(geometry, material);
      line.name = 'shop-outline';
      line.userData.sketchId = outline.id;
      line.renderOrder = 26;
      layer.add(line);
    }
    if (outline.chosen && outline.ready && outline.rings.length) {
      const [outer, ...holes] = outline.rings.map((r) => r.points.map(([x, y]) => new THREE.Vector2(x, y)));
      const shape = new THREE.Shape(outer);
      shape.holes = holes.map((h) => new THREE.Path(h));
      const fill = new THREE.Mesh(
        new THREE.ShapeGeometry(shape),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.14,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      fill.name = 'shop-outline-fill';
      fill.renderOrder = 25;
      layer.add(fill);
    }
  }
}

// Cut's picker (docs/sketch-studio-cut-pick.md §4.2): what a click on the
// ground can pick, built once per outline list (never per pointer move). A
// ready outline is the whole drawing inside its outer ring (cut-outs
// included: a one-pixel line is hard to hit); one that is not ready is not
// picked. [{ id, ring, box, area }].
function outlinePickAreas(outlines) {
  return (outlines || []).flatMap((outline) => {
    const ring = outline.ready && outline.rings[0]?.closed ? outline.rings[0].points : null;
    if (!ring || ring.length < 3) return [];
    const xs = ring.map((p) => p[0]),
      ys = ring.map((p) => p[1]);
    const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    return [{ id: outline.id, ring, box, area: (box[2] - box[0]) * (box[3] - box[1]) }];
  });
}
// The outline under a ground point: the smallest one holding it (an outline
// drawn inside another's cut-out is the one meant), or null.
function outlineAt(areas, x, y) {
  let best = null;
  for (const area of areas) {
    const [x0, y0, x1, y1] = area.box;
    if (x < x0 || x > x1 || y < y0 || y > y1 || (best && best.area <= area.area)) continue;
    let inside = false;
    const ring = area.ring;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i],
        [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) best = area;
  }
  return best?.id || null;
}

// The sketch overlay: grid, plane axes, snappable model edges, the drawn
// entities, the rubber-band preview and the snap marker. Each piece is kept
// while what it was drawn from is unchanged (docs/sketch-studio-drawing-
// table.md §3.2 item 3; the sketcher hands an overlay on every pointer move):
// the drawn entities are ONE LineSegments batch, the selection its own line
// (one entity) or batch (several), rebuilt for a new entity array, selection
// array or frame; the construction entities one dashed batch on the same key
// plus the dash size (docs/sketch-studio-hand-drawing.md §5.4); the grid and
// axes for new bounds or step; the model edges and mark points for a new array
// or marker size; the zero's marker for a new zero or size step and Check's
// markers for a new problems array, focused row or size step (HD-2, §6.1,
// §6.5); an Edit tool's red cut for a new array (HD-4, §8.1); preview,
// dimensions, the selection box and cursor on every call.
// What is replaced is disposed; on null everything is.
const sameKey = (a, b) => a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
function drawSketchOverlay(layer, overlay) {
  if (!overlay) {
    layer.traverse((obj) => {
      if (obj === layer) return;
      obj.geometry?.dispose();
      obj.material?.dispose();
    });
    layer.clear();
    layer.userData.slots = new Map();
    layer.userData.overlay = null;
    return;
  }
  layer.userData.overlay = overlay;
  const slots = (layer.userData.slots ||= new Map());
  // `key` null: rebuilt every call.
  const piece = (name, key, build) => {
    const slot = slots.get(name);
    if (slot && key && slot.key && sameKey(slot.key, key)) return;
    for (const obj of slot?.objects || []) {
      layer.remove(obj);
      obj.geometry?.dispose();
      obj.material?.dispose();
    }
    const objects = build().filter(Boolean);
    if (objects.length) layer.add(...objects);
    slots.set(name, { key, objects });
  };
  const { frame } = overlay;
  layer.matrix.makeBasis(
    new THREE.Vector3(...frame.x),
    new THREE.Vector3(...frame.y),
    new THREE.Vector3(...frame.normal),
  );
  layer.matrix.setPosition(...frame.origin);
  layer.matrixWorldNeedsUpdate = true;
  const [[u0, v0], [u1, v1]] = overlay.gridBounds;
  const step = overlay.gridStep;
  piece('grid', [u0, v0, u1, v1, step], () => {
    const objects = [];
    if (step > 0 && (u1 - u0) / step <= 400 && (v1 - v0) / step <= 400) {
      const lines = [];
      for (let u = Math.ceil(u0 / step) * step; u <= u1; u += step) lines.push([u, v0], [u, v1]);
      for (let v = Math.ceil(v0 / step) * step; v <= v1; v += step) lines.push([u0, v], [u1, v]);
      const grid = lineObject(lines, SKETCH_COLORS.grid, 0.45, true, 28);
      grid.name = 'sketch-grid';
      objects.push(grid);
    }
    const axisU = lineObject(
      [
        [u0, 0],
        [u1, 0],
      ],
      SKETCH_COLORS.axisU,
      0.7,
      false,
      29,
    );
    const axisV = lineObject(
      [
        [0, v0],
        [0, v1],
      ],
      SKETCH_COLORS.axisV,
      0.7,
      false,
      29,
    );
    axisU.name = axisV.name = 'sketch-axis';
    return [...objects, axisU, axisV];
  });
  piece('boundary', [overlay.boundary], () => {
    if (!overlay.boundary?.length) return [];
    const boundary = lineObject(overlay.boundary.flat(), SKETCH_COLORS.boundary, 0.9, true);
    boundary.name = 'sketch-boundary';
    return [boundary];
  });
  // The selection (docs/sketch-studio-hand-drawing.md §5.1): `selectedIds`, an
  // array the sketcher keeps while it does not change (`selectedId`, one id,
  // is still read). One selected entity is its own line, several one batch.
  const selection = overlay.selectedIds ?? overlay.selectedId ?? null;
  const frameKey = [...frame.origin, ...frame.x, ...frame.y, ...frame.normal];
  piece('entities', [overlay.entities, selection, ...frameKey], () => {
    const chosen = new Set(Array.isArray(selection) ? selection : selection ? [selection] : []);
    const segments = [];
    for (const entity of overlay.entities || []) {
      if (entity.construction || chosen.has(entity.id)) continue;
      const points = entityPolyline(entity);
      for (let i = 1; i < points.length; i++) segments.push(points[i - 1], points[i]);
    }
    if (!segments.length) return [];
    const batch = lineObject(segments, SKETCH_COLORS.entity, 1, true, 31);
    batch.name = 'sketch-entity';
    batch.userData.batch = true;
    return [batch];
  });
  // The selection (its own piece: a drag rebuilds it alone, offset by
  // `dragOffset`, HD-3 §7.3, while the batch of the rest is kept).
  const offset = overlay.dragOffset || null;
  piece('selected', [overlay.entities, selection, offset?.[0], offset?.[1], ...frameKey], () => {
    const chosen = new Set(Array.isArray(selection) ? selection : selection ? [selection] : []);
    if (!chosen.size) return [];
    const selected = (overlay.entities || []).filter((e) => !e.construction && chosen.has(e.id));
    const shift = (points) => (offset ? points.map(([u, v]) => [u + offset[0], v + offset[1]]) : points);
    const objects = [];
    if (selected.length === 1) {
      const line = lineObject(shift(entityPolyline(selected[0])), SKETCH_COLORS.selected, 1, false, 31);
      line.name = 'sketch-entity';
      line.userData.entityId = selected[0].id;
      objects.push(line);
    } else if (selected.length) {
      const line = lineObject(shift(polylineSegments(selected)), SKETCH_COLORS.selected, 1, true, 31);
      line.name = 'sketch-entity';
      line.userData.entityIds = selected.map((e) => e.id);
      objects.push(line);
    }
    for (const object of objects) object.userData.offset = offset;
    return objects;
  });
  // An action's ghost (HD-3, §7.3 – §7.4): the selection where the next click
  // puts it, or every copy Pattern would add, one batch in the preview colour.
  piece('ghost', [overlay.ghost, ...frameKey], () => {
    if (!overlay.ghost?.length) return [];
    const ghost = lineObject(polylineSegments(overlay.ghost), SKETCH_COLORS.preview, 0.75, true, 32);
    ghost.name = 'sketch-ghost';
    ghost.userData.count = overlay.ghost.length;
    return [ghost];
  });
  // What an Edit tool's click would take away (HD-4, §8.1): one batch in
  // Check's red, kept while the sketcher hands the same array (one per hover).
  piece('cut', [overlay.cut, ...frameKey], () => {
    if (!overlay.cut?.length) return [];
    const cut = lineObject(polylineSegments(overlay.cut), SKETCH_COLORS.problem, 1, true, 33);
    cut.name = 'sketch-cut';
    cut.userData.count = overlay.cut.length;
    return [cut];
  });
  // Construction entities (§5.4): dashed, in the model-edge colour (the
  // selected ones in the selected colour), the dash about 8 px on screen. The
  // dash steps in powers of two of the marker size, so a pointer move does not
  // rebuild them; a zoom by a factor of two does.
  const dash = 2 ** Math.round(Math.log2(Math.max(1e-6, (overlay.markerSize || 2) * 2)));
  piece('construction', [overlay.entities, selection, dash, ...frameKey], () => {
    const chosen = new Set(Array.isArray(selection) ? selection : selection ? [selection] : []);
    const marked = (overlay.entities || []).filter((e) => e.construction);
    return [
      [marked.filter((e) => !chosen.has(e.id)), SKETCH_COLORS.boundary],
      [marked.filter((e) => chosen.has(e.id)), SKETCH_COLORS.selected],
    ].flatMap(([entities, color]) => {
      if (!entities.length) return [];
      const line = dashedSegments(polylineSegments(entities), color, dash, 31);
      line.name = 'sketch-construction';
      line.userData.entityIds = entities.map((e) => e.id);
      return [line];
    });
  });
  // The box being dragged (§5.1), in the plane between its two corners: to the
  // right solid blue, taking what is inside; to the left dashed green, taking
  // what it touches; a faint fill of the same colour.
  piece('box', null, () => {
    const box = overlay.box;
    if (!box?.from || !box?.to) return [];
    const [[x0, y0], [x1, y1]] = [box.from, box.to];
    const corners = [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ];
    const inside = box.mode === 'inside';
    const color = inside ? SKETCH_COLORS.boxInside : SKETCH_COLORS.boxTouching;
    const ring = corners.flatMap((p, i) => [p, corners[(i + 1) % 4]]);
    const edge = inside ? lineObject(ring, color, 1, true, 34) : dashedSegments(ring, color, dash, 34);
    edge.name = 'sketch-box';
    edge.userData.mode = box.mode;
    const fill = new THREE.Mesh(
      new THREE.ShapeGeometry(new THREE.Shape(corners.map(([x, y]) => new THREE.Vector2(x, y)))),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.08,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    fill.name = 'sketch-box-fill';
    fill.renderOrder = 34;
    return [fill, edge];
  });
  // The zero (docs/sketch-studio-hand-drawing.md §6.1) while it is not the
  // origin: a small crossed circle in the snap colour, its size the dash's
  // power-of-two step of the marker size, so a pointer move never rebuilds it.
  const zero = overlay.zero || null;
  piece('zero', [zero?.[0], zero?.[1], dash, ...frameKey], () => {
    if (!zero) return [];
    const [u, v] = zero;
    const ring = circlePoints(zero, dash, 32);
    const cross = [
      [u - dash * 1.6, v],
      [u + dash * 1.6, v],
      [u, v - dash * 1.6],
      [u, v + dash * 1.6],
    ];
    return [lineObject(ring, SKETCH_COLORS.snap, 1, false, 33), lineObject(cross, SKETCH_COLORS.snap, 1, true, 33)].map(
      (line) => {
        line.name = 'sketch-zero';
        line.userData.at = zero;
        return line;
      },
    );
  });
  // Check's markers while its list is open (§6.5): a red ring on each
  // problem, the one under the pointer or with the focus larger. Kept for one
  // problems array, focused row and marker size step.
  piece('problems', [overlay.problems, overlay.problemFocus, dash, ...frameKey], () =>
    (overlay.problems || []).map((problem) => {
      const focus = overlay.problemFocus || {};
      const focused = problem.id === focus.pointer || problem.id === focus.focus;
      const radius = dash * (focused ? 2.6 : 1.5);
      const ring = lineObject(circlePoints(problem.at, radius, 32), SKETCH_COLORS.problem, 1, false, 35);
      ring.name = 'sketch-problem';
      Object.assign(ring.userData, { problemId: problem.id, at: problem.at, radius, focused });
      return ring;
    }),
  );
  piece('preview', null, () =>
    (overlay.preview || []).map((entity) => {
      const line = lineObject(entityPolyline(entity), SKETCH_COLORS.preview, 0.9, false, 32);
      line.name = 'sketch-preview';
      return line;
    }),
  );
  // Reference dimensions (docs/sketch-studio-sketch-dimensions.md §3.4): drawn
  // as handed over (segments in plane mm), in the mark colours, above the
  // entities; the one waiting for its place click faded.
  piece('dimensions', null, () =>
    (overlay.dimensions || []).map((dimension) => {
      const line = lineObject(
        dimension.segments.flat(),
        dimension.selected ? MARK_SELECTED_COLOR : MARK_COLOR,
        dimension.preview ? 0.6 : 1,
        true,
        32,
      );
      line.name = 'sketch-dimension';
      line.userData.dimensionId = dimension.id;
      return line;
    }),
  );
  // Measure mark points projected onto the plane: small purple diamonds.
  piece('marks', [overlay.markPoints, overlay.markerSize], () => {
    if (!overlay.markPoints?.length) return [];
    const r = overlay.markerSize || 2;
    const diamonds = overlay.markPoints.flatMap(([u, v]) => [
      [u - r, v],
      [u, v - r],
      [u, v - r],
      [u + r, v],
      [u + r, v],
      [u, v + r],
      [u, v + r],
      [u - r, v],
    ]);
    const marks = lineObject(diamonds, MARK_COLOR, 1, true, 30);
    marks.name = 'sketch-marks';
    return [marks];
  });
  piece('cursor', null, () => {
    if (!overlay.cursor) return [];
    const [u, v] = overlay.cursor,
      r = overlay.markerSize || 2;
    const marker = lineObject(
      [
        [u - r, v - r],
        [u + r, v - r],
        [u + r, v + r],
        [u - r, v + r],
        [u - r, v - r],
      ],
      overlay.snapKind && !['grid', 'free'].includes(overlay.snapKind) ? SKETCH_COLORS.snap : SKETCH_COLORS.free,
      1,
      false,
      33,
    );
    marker.name = 'sketch-cursor';
    return [marker];
  });
}
