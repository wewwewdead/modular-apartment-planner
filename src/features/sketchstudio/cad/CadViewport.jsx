import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { mapPlacement } from './placement.js';
import { instanceMatrix, instanceOrientation, placementMatrix } from './movement.js';
import {
  RING_SIZE,
  gizmoRingRadius,
  localToWorldTurn,
  ringHandlesOnly,
  startDial,
  worldToLocalTurn,
  worldTurn,
} from './rotateDial.js';
import { faceFrame, faceOutline, segmentsInPlane, toPlane } from './sketchPlane.js';
import { createPlacementLayer } from './placementLayer.js';
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
  formatMm,
  markGeometry,
  markOffset,
  markSnapPoints,
  measureCandidates,
  mmPerPixelAt,
} from './marks.js';
import {
  rotationReadout,
  snapLabel,
  translationReadout,
  typeKey,
  typedHtml,
  typedRotation,
  typedTranslation,
  typingSupported,
} from './gizmoHud.js';

export default function CadViewport({
  ref,
  snapshot,
  model,
  selectedId,
  onSelect,
  isolated,
  view,
  perspective,
  exploded,
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
}) {
  const host = useRef(null),
    hudRef = useRef(null),
    measureHudRef = useRef(null),
    placementHudRef = useRef(null),
    labelsRef = useRef(null),
    planeLabelsRef = useRef(null),
    sceneRef = useRef(null),
    selectionCallback = useRef(onSelect),
    moveCallback = useRef(onMove),
    rotateCallback = useRef(onRotate);
  // The committed model has parts (a model opened with parts gets the
  // one-time first-geometry fit; an empty one never does).
  const hasInstances = Boolean(model?.instances?.length);
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
      getCanvas: () => sceneRef.current?.renderer.domElement || null,
      // A gizmo drag is in progress (keyboard shortcuts wait for it to end).
      isDragging: () =>
        Boolean(
          sceneRef.current?.drag ||
          sceneRef.current?.transform.dragging ||
          sceneRef.current?.placementLayer?.isDragging(),
        ),
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
        ctx.render();
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
  const [error, setError] = useState(null);
  const placing = Boolean(placement);
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
      renderer = new THREE.WebGLRenderer({ antialias: true });
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
      planes: { visible: false, size: 0, offset: 0, tiles: {}, hovered: null, key: '' },
      drawnMarks: [],
      rotateSnap: 15,
      rotateSpace: 'world',
      hasFitted: false,
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
    const render = () => {
      renderer.render(scene, ctx.camera);
      placeLabels();
      ctx.placePlaneLabels?.();
    };
    ctx.render = render;
    controls.addEventListener('change', render);
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
    const placeBox = (node) => {
      if (!node || !ctx.pointer) return;
      const [px, py] = ctx.pointer;
      let x = px + HUD_OFFSET,
        y = py + HUD_OFFSET;
      const width = element.clientWidth,
        height = element.clientHeight;
      if (width && height) {
        const w = node.offsetWidth,
          h = node.offsetHeight;
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
    };
    ctx.updateMarks = updateMarks;
    // Measure tool: the snapped point under the pointer, a marker there, and
    // after the first click a rubber band plus a preview of the mark.
    const measureHud = measureHudRef.current,
      labels = labelsRef.current;
    if (measureHud) measureHud.hidden = true;
    const measureAt = (event) => {
      const caster = rayAt(event);
      const hit = caster
        .intersectObjects(group.children, true)
        .find((hit) => hit.object.isMesh && hit.object.parent.visible);
      const rect = renderer.domElement.getBoundingClientRect();
      group.updateMatrixWorld(true);
      const projected = new THREE.Vector3();
      return measureCandidates({
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
    // Show drag.turn: the gizmo at turn · attach and the displayed mesh spun
    // about the gizmo center; the kernel rebuild follows on release.
    const showTurn = () => {
      const turn = new THREE.Quaternion(...drag.turn);
      pivot.quaternion.multiplyQuaternions(turn, drag.attach);
      const c = drag.start;
      new THREE.Matrix4()
        .makeTranslation(c.x, c.y, c.z)
        .multiply(new THREE.Matrix4().makeRotationFromQuaternion(turn))
        .multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z))
        .multiply(drag.groupStart)
        .decompose(drag.group.position, drag.group.quaternion, drag.group.scale);
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
    const cancelDrag = () => {
      drawSnapHighlights(snapLayer, null);
      endRotateFeedback();
      hideHud();
      if (!drag) return;
      pivot.position.copy(drag.start);
      pivot.quaternion.copy(drag.attach);
      drag.groupStart.decompose(drag.group.position, drag.group.quaternion, drag.group.scale);
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
      const selected = ctx.group.children.find((g) => g.userData.instanceId === ctx.movingId);
      if (!selected) return;
      consumedPointer = true;
      selected.updateMatrix();
      typed = '';
      ctx.lastSnaps = [];
      drag = {
        group: selected,
        id: ctx.movingId,
        mode: ctx.transformMode,
        start: pivot.position.clone(),
        groupStart: selected.matrix.clone(),
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
        drag.feedback = createRotateFeedback(rotateLayer, selected, drag.groupStart, AXIS_COLORS[transform.axis]);
        renderer.domElement.addEventListener('pointermove', dialMove);
        // Readout and start radial from the moment of the grab.
        applyDial(drag.dial.refresh(dialOptions()));
      }
      if (drag.mode !== 'rotate') {
        // World boxes at drag start: the moving part and every other visible part.
        ctx.group.updateMatrixWorld(true);
        const toBox = (object) => {
          const box = new THREE.Box3().setFromObject(object);
          return box.isEmpty() ? null : { min: box.min.toArray(), max: box.max.toArray() };
        };
        drag.box = toBox(selected);
        drag.others = ctx.group.children
          .filter((g) => g !== selected && g.visible)
          .map(toBox)
          .filter(Boolean);
        // Drawn mark points (not those riding on this part) pull a face or the centre.
        drag.markPoints = markSnapPoints(ctx.drawnMarks, { exclude: ctx.movingId }).map((p) => p.point);
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
        new THREE.Matrix4()
          .makeTranslation(delta.x, delta.y, delta.z)
          .multiply(drag.groupStart)
          .decompose(drag.group.position, drag.group.quaternion, drag.group.scale);
        updateMarks();
      }
      updateHud();
      render();
    });
    // During a ring drag dialMove renders each move; TransformControls'
    // change in between would only draw its own, discarded angle.
    transform.addEventListener('change', () => {
      if (!drag?.dial) render();
    });
    transform.addEventListener('mouseUp', () => {
      if (ctx.toolGizmo) return ctx.placementLayer.toolUp();
      drawSnapHighlights(snapLayer, null);
      endRotateFeedback();
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
          completed.groupStart.decompose(completed.group.position, completed.group.quaternion, completed.group.scale);
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
    const cancelHoleDrag = () => {
      if (holeDrag) holeDrag.handle.position.copy(holeDrag.start);
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
      if (event.key === 'Alt' && drag) event.preventDefault(); // keep the menu bar out of a drag
      if (changed && drag?.dial) applyDial(drag.dial.refresh(dialOptions()));
    };
    const releaseAlt = () => {
      ctx.altDown = false;
    };
    window.addEventListener('keyup', trackAlt);
    window.addEventListener('blur', releaseAlt);
    const keyDown = (event) => {
      trackAlt(event);
      // A placement handle drag: Esc cancels it, digits + Enter set a value.
      if (ctx.placementLayer?.key(event)) return;
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
    const observer = new ResizeObserver(resize);
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
    const placementCancel = () => placementLayer.cancelDrag();
    renderer.domElement.addEventListener('pointerdown', placementDown, true);
    renderer.domElement.addEventListener('pointermove', placementMove, true);
    renderer.domElement.addEventListener('pointerup', placementUp, true);
    renderer.domElement.addEventListener('dblclick', placementDouble);
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
      if (consumedPointer) {
        consumedPointer = false;
        if (!ringClick) {
          down = null;
          return;
        }
      }
      if (!down || Math.hypot(event.clientX - down[0], event.clientY - down[1]) > 4 || event.button !== 0) return;
      // Measuring: clicks pick points, never the selection.
      if (ctx.measureMode) {
        measureClick(event);
        return;
      }
      // Placing an operation: clicks place or pick, never select.
      if (ctx.placementLayer.click(event)) return;
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
      selectionCallback.current(hit?.object.userData.instanceId || null);
    };
    // A bounding-box corner of the selected part within PIVOT_SNAP_PX of the
    // click, else the exact surface point under it. A corner snaps even when
    // the ray just misses the part (the open end of a tube). Corners that
    // line up on screen (a box seen square-on) resolve to the one nearest the
    // clicked surface, or nearest the viewer: the visible one. Returns
    // whether a pivot was picked.
    const pickPivot = (hit, screen) => {
      const { instance, parameters } = ctx.movingInstance || {};
      const selected = ctx.group.children.find((g) => g.userData.instanceId === ctx.movingId);
      if (!instance || !selected) return false;
      const onPart = hit?.object.userData.instanceId === ctx.movingId;
      const reference = onPart ? hit.point : ctx.camera.position;
      selected.updateMatrix();
      const [min, max] = selected.userData.bounds;
      let best = null,
        bestDepth = Infinity;
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
      observer.disconnect();
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', trackAlt);
      window.removeEventListener('blur', releaseAlt);
      delete element.cadProject;
      delete element.cadGizmo;
      delete element.cadMarks;
      delete element.cadPlacement;
      delete element.cadHoleHandles;
      delete element.cadPlanes;
      if (hoverFrame) cancelAnimationFrame(hoverFrame);
      renderer.domElement.removeEventListener('pointermove', planeMove);
      renderer.domElement.removeEventListener('pointerleave', planeLeave);
      clearLayer(planeLayer);
      clearLayer(pickLayer);
      planeLabels?.replaceChildren();
      renderer.domElement.removeEventListener('pointerdown', placementDown, true);
      renderer.domElement.removeEventListener('pointermove', placementMove, true);
      renderer.domElement.removeEventListener('pointerup', placementUp, true);
      renderer.domElement.removeEventListener('dblclick', placementDouble);
      renderer.domElement.removeEventListener('pointercancel', placementCancel);
      window.removeEventListener('blur', placementCancel);
      placementLayer.dispose();
      renderer.domElement.removeEventListener('pointermove', trackPointer);
      renderer.domElement.removeEventListener('pointermove', measureMove);
      clearLayer(markLayer);
      clearLayer(measureLayer);
      labels?.replaceChildren();
      renderer.domElement.removeEventListener('pointerdown', trackPointer, true);
      drawSnapHighlights(snapLayer, null);
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
      scene.traverse((obj) => {
        obj.geometry?.dispose();
        if (obj.material) (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((m) => m.dispose());
      });
      renderer.domElement.remove();
      sceneRef.current = null;
    };
  }, []);
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
    ctx.render();
  }, [holeMode, ready, selectedId, snapshot, model]);
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    ctx.group.traverse((obj) => {
      obj.geometry?.dispose();
      obj.material?.dispose();
    });
    ctx.group.clear();
    for (const item of snapshot?.instances || []) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(item.mesh.vertices, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(item.mesh.normals, 3));
      geometry.setIndex(item.mesh.triangles);
      const material = new THREE.MeshStandardMaterial({
        color: 0x8795a4,
        roughness: 0.55,
        metalness: 0.15,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData.instanceId = item.id;
      const lineGeometry = new THREE.BufferGeometry();
      lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(item.edges.lines, 3));
      const edges = new THREE.LineSegments(
        lineGeometry,
        new THREE.LineBasicMaterial({ color: 0x3e4e5f, transparent: true, opacity: 0.65 }),
      );
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
    ctx.render();
  }, [snapshot]);
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    const plane = section == null ? null : new THREE.Plane(new THREE.Vector3(0, 0, -1), section);
    ctx.group.children.forEach((group, index) => {
      const instance = model.instances.find((i) => i.id === group.userData.instanceId);
      const part = model.parts.find((p) => p.id === group.userData.partId);
      group.visible = instance?.visible !== false && (!isolated || group.userData.instanceId === selectedId);
      // The model commits before the worker rebuilds, so show the committed
      // placement at once by moving the old mesh by (new pose) · (meshed pose)⁻¹.
      if (ctx.drag?.group !== group) {
        placementDelta(group.userData, instance, model, snapshot?.parameters).decompose(
          group.position,
          group.quaternion,
          group.scale,
        );
        if (exploded) group.position.z += index * 85;
      }
      group.children[0].material.color.set(
        // While placing an operation the part keeps its own colour, so the
        // blue ghost and handles read against it.
        group.userData.instanceId === selectedId && !sketchMode && !placing
          ? '#3687bd'
          : /wood|ply|oak|pine/i.test(part?.material || '')
            ? '#bd956b'
            : '#8795a4',
      );
      // While drawing a sketch the model stays visible but dimmed; the part
      // being sketched on is a little stronger than the rest.
      const [mesh, edges] = group.children;
      const dim = sketchMode === 'draw' ? (group.userData.instanceId === sketchSupportId ? 0.5 : 0.28) : 1;
      if (mesh.material.opacity !== dim) {
        mesh.material.transparent = dim < 1;
        mesh.material.opacity = dim;
        mesh.material.depthWrite = dim === 1;
        mesh.material.needsUpdate = true;
      }
      edges.material.opacity = dim < 1 ? 0.35 : 0.65;
      group.children.forEach((obj) => {
        obj.material.clippingPlanes = plane ? [plane] : [];
      });
    });
    // Marks ride on the poses just shown.
    ctx.updateMarks();
    ctx.render();
  }, [snapshot, model, selectedId, isolated, exploded, section, sketchMode, sketchSupportId, placing]);
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    ctx.marks = marks || [];
    ctx.selectedMarkId = selectedMarkId;
    ctx.hideMarks = hideMarks;
    ctx.updateMarks();
    ctx.render();
  }, [marks, snapshot, model, selectedMarkId, hideMarks, isolated, exploded]);
  // Origin plane tiles, after the poses above so the size follows the
  // displayed model; a new mesh drops the cached hovered face.
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    ctx.model = model;
    ctx.syncPlanes(planesVisible, planesOffset);
  }, [planesVisible, planesOffset, snapshot, model, selectedId, isolated, exploded]);
  useEffect(() => {
    sceneRef.current?.clearPlaneHover();
  }, [snapshot]);
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
  }, [selectedId, pivotPick]);
  useEffect(() => {
    sceneRef.current?.placementLayer.setView(placement);
  }, [placement]);
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    // A boolean tool drag keeps the gizmo until it ends (the next view re-runs this).
    if (ctx.toolGizmo && ctx.placementLayer.isDragging()) return;
    ctx.cancelDrag();
    ctx.transform.detach();
    ctx.placementLayer.detachTool();
    ctx.movingId = null;
    ctx.movingInstance = null;
    const selected = ctx.group.children.find((g) => g.userData.instanceId === selectedId && g.visible);
    if (moveEnabled && selected && !exploded) {
      const [min, max] = selected.userData.bounds;
      selected.updateMatrix();
      ctx.pivot.position.set(...min.map((value, i) => (value + max[i]) / 2)).applyMatrix4(selected.matrix);
      const instance = model.instances.find((i) => i.id === selectedId);
      const rotating = transformMode === 'rotate';
      // A picked pivot is kept in the part's own frame, so it stays on the
      // same spot of the part through later moves and turns.
      const picked = rotating && pivotPick && ctx.pickedPivot?.id === selectedId && instance;
      if (picked)
        ctx.pivot.position
          .set(...ctx.pickedPivot.local)
          .applyMatrix4(instanceMatrix(instance, snapshot?.parameters || {}));
      // Local space: the rings follow the part's current orientation.
      const local = rotating && rotateSpace === 'local' && instance;
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
      ctx.movingId = selectedId;
      ctx.movingInstance = instance ? { instance, parameters: snapshot?.parameters || {} } : null;
    } else if (placement?.toolGizmo && !exploded) ctx.placementLayer.attachTool(transformMode);
    ctx.render();
  }, [snapshot, model, selectedId, moveEnabled, exploded, isolated, transformMode, rotateSpace, pivotPick, placement]);
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
    if (!ready) return;
    const viewChanged = ctx.lastView !== view || ctx.lastPerspective !== perspective || ctx.lastFitKey !== fitKey;
    // The one-time fit frames committed geometry only, never an operation
    // preview: a first preview on an empty model must not move the camera.
    const committedGeometry = !previewShown && Boolean(snapshot?.instances.length);
    const firstGeometry = !ctx.hasFitted && committedGeometry;
    if (!viewChanged && !firstGeometry) return;
    ctx.lastView = view;
    ctx.lastPerspective = perspective;
    ctx.lastFitKey = fitKey;
    ctx.hasFitted ||= committedGeometry;
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
    const directions = {
      top: [0, 0, 1],
      bottom: [0, 0, -1],
      front: [0, -1, 0],
      rear: [0, 1, 0],
      left: [-1, 0, 0],
      right: [1, 0, 0],
      isometric: [1, -1, 0.8],
    };
    const dir = new THREE.Vector3(...(directions[view] || directions.isometric)).normalize();
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
    // An explicit up (a sketch's +v axis) makes the view square to the sketch.
    if (focusTarget.up) ctx.camera.up.set(...focusTarget.up);
    else ctx.camera.up.set(0, Math.abs(normal.z) > 0.999 ? 1 : 0, Math.abs(normal.z) > 0.999 ? 0 : 1);
    ctx.camera.position.copy(target).addScaledVector(normal, ctx.span * 1.7);
    ctx.controls.target.copy(target);
    ctx.camera.lookAt(target);
    ctx.controls.update();
    ctx.resize();
  }, [focusTarget]);
  return (
    <div ref={host} className="cad-viewport" aria-label="Solid model viewport">
      <div ref={hudRef} className="cad-gizmo-hud" aria-label="Gizmo readout" />
      <div ref={measureHudRef} className="cad-measure-hud" aria-label="Measure readout" />
      <div ref={placementHudRef} className="cad-placement-hud" aria-label="Placement readout" />
      <div ref={labelsRef} className="cad-mark-labels" aria-label="Dimension marks" />
      <div ref={planeLabelsRef} className="cad-plane-labels" aria-label="Origin planes" />
      {error && <p role="alert">3D display unavailable: {error}</p>}
      <div className="cad-viewport-hint">
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
          <div>Click a point on the selected part to turn about it · corners snap</div>
        )}
        {moveEnabled && transformMode === 'rotate'
          ? `Drag a red/green/blue ring around the centre to turn about ${rotateSpace === 'local' ? "the part's own " : ''}X/Y/Z · Alt turns freely · type an angle + Enter · [ ] turn about Z, Shift+[ ] about X · M move · Esc cancels · `
          : moveEnabled
            ? 'Drag the center freely, a plane square, or X/Y/Z arrows · R rotate · Esc cancels · '
            : ''}
        {measureMode
          ? 'Drag background to orbit · Right drag to pan · Scroll to zoom'
          : !sketchMode &&
            (placement
              ? 'Drag background to orbit · Right drag to pan · Scroll to zoom'
              : 'Drag background to orbit · Right drag to pan · Scroll to zoom · Click a part to select')}
        {moveHint && <div>{moveHint}</div>}
      </div>
    </div>
  );
}

// Move gizmo size (the rotate rings use RING_SIZE: a larger dial is easier
// to grab and finer to turn).
const MOVE_SIZE = 0.85;
// HUD: offset from the cursor and the gap kept to the viewport edge (px).
const HUD_OFFSET = 18;
const HUD_MARGIN = 6;
// A picked pivot snaps to a bounding-box corner this close on screen (px).
const PIVOT_SNAP_PX = 8;
// Pointer travel (px) below which a press and release is a click, not a drag.
const CLICK_PX = 4;
const AXIS_UNITS = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };
// The toolbar/HUD axis colours (cad.css .cad-axis-x/y/z).
const AXIS_COLORS = { X: '#c62f2f', Y: '#2f8f2f', Z: '#2f5fc6' };
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
// a ghost of the part's edges at the start pose (sharing the edge geometry),
// the swept sector, its arc, and radials to the start and current angle.
function createRotateFeedback(layer, group, startMatrix, color) {
  clearRotateFeedback(layer);
  const edges = group.children[1];
  const overlay = (object, name, order) => {
    object.name = name;
    object.renderOrder = order;
    object.frustumCulled = false;
    layer.add(object);
    return object;
  };
  if (edges?.geometry) {
    const ghost = new THREE.LineSegments(
      edges.geometry,
      new THREE.LineBasicMaterial({ color: '#3e4e5f', transparent: true, opacity: 0.3, depthTest: false }),
    );
    ghost.userData.sharedGeometry = true;
    ghost.matrixAutoUpdate = false;
    ghost.matrix.copy(startMatrix);
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

const IDENTITY = new THREE.Matrix4();
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

// How far the committed placement is from the one the worker meshed. Attached
// parts follow their parent in the kernel, so they wait for the rebuild.
function placementDelta(meshed, instance, model, parameters) {
  if (!instance || !meshed.placement) return IDENTITY.clone();
  if (model.connections?.some((c) => c.from === instance.id && c.type !== 'weld')) return IDENTITY.clone();
  try {
    return instanceMatrix(instance, parameters || {}).multiply(placementMatrix(meshed.placement).invert());
  } catch {
    return IDENTITY.clone();
  }
}

const planeOf = (frame) =>
  new THREE.Plane().setFromNormalAndCoplanarPoint(
    new THREE.Vector3(...frame.normal),
    new THREE.Vector3(...frame.origin),
  );

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
  const source = geometry.getAttribute('position');
  const world = new Float64Array(source.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < source.count; i++) {
    v.fromBufferAttribute(source, i).applyMatrix4(mesh.matrixWorld);
    world[i * 3] = v.x;
    world[i * 3 + 1] = v.y;
    world[i * 3 + 2] = v.z;
  }
  const index = geometry.index ? geometry.index.array : Array.from({ length: source.count }, (_, i) => i);
  const outline = faceOutline(world, index, hit.faceIndex, normal);
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
function drawSnapHighlights(layer, state) {
  layer.traverse((obj) => {
    if (obj === layer) return;
    obj.geometry?.dispose();
    obj.material?.dispose();
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
    const line = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({ color: SNAP_COLORS[snap.kind] || SNAP_COLORS.aligned, depthTest: false }),
    );
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
};
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

// Rebuild the sketch overlay: grid, plane axes, snappable model edges, the
// drawn entities, the rubber-band preview and the snap marker.
function drawSketchOverlay(layer, overlay) {
  layer.traverse((obj) => {
    if (obj === layer) return;
    obj.geometry?.dispose();
    obj.material?.dispose();
  });
  layer.clear();
  layer.userData.overlay = overlay || null;
  if (!overlay) return;
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
  if (step > 0 && (u1 - u0) / step <= 400 && (v1 - v0) / step <= 400) {
    const lines = [];
    for (let u = Math.ceil(u0 / step) * step; u <= u1; u += step) lines.push([u, v0], [u, v1]);
    for (let v = Math.ceil(v0 / step) * step; v <= v1; v += step) lines.push([u0, v], [u1, v]);
    const grid = lineObject(lines, SKETCH_COLORS.grid, 0.45, true, 28);
    grid.name = 'sketch-grid';
    layer.add(grid);
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
  layer.add(axisU, axisV);
  if (overlay.boundary?.length) {
    const boundary = lineObject(overlay.boundary.flat(), SKETCH_COLORS.boundary, 0.9, true);
    boundary.name = 'sketch-boundary';
    layer.add(boundary);
  }
  for (const entity of overlay.entities || []) {
    const line = lineObject(
      entityPolyline(entity),
      entity.id === overlay.selectedId ? SKETCH_COLORS.selected : SKETCH_COLORS.entity,
      1,
      false,
      31,
    );
    line.name = 'sketch-entity';
    line.userData.entityId = entity.id;
    layer.add(line);
  }
  for (const entity of overlay.preview || []) {
    const line = lineObject(entityPolyline(entity), SKETCH_COLORS.preview, 0.9, false, 32);
    line.name = 'sketch-preview';
    layer.add(line);
  }
  // Measure mark points projected onto the plane: small purple diamonds.
  if (overlay.markPoints?.length) {
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
    layer.add(marks);
  }
  if (overlay.cursor) {
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
    layer.add(marker);
  }
}
