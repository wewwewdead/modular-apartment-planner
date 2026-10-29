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
import { entityPolyline } from './sketchProfile.js';
import { gizmoAxes, snapBoxDelta, snapThreshold } from './boxSnap.js';
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
}) {
  const host = useRef(null),
    hudRef = useRef(null),
    sceneRef = useRef(null),
    selectionCallback = useRef(onSelect),
    moveCallback = useRef(onMove),
    rotateCallback = useRef(onRotate);
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
      isDragging: () => Boolean(sceneRef.current?.drag || sceneRef.current?.transform.dragging),
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
    holeCallbacks.current = { onPlaceHole, onMoveHole, onCancelHole, onPickSketchFace };
  }, [onPlaceHole, onMoveHole, onCancelHole, onPickSketchFace]);
  const [error, setError] = useState(null);
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
    const render = () => renderer.render(scene, ctx.camera);
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
    const placeHud = () => {
      if (!hud || !ctx.pointer) return;
      const [px, py] = ctx.pointer;
      let x = px + HUD_OFFSET,
        y = py + HUD_OFFSET;
      const width = element.clientWidth,
        height = element.clientHeight;
      if (width && height) {
        const w = hud.offsetWidth,
          h = hud.offsetHeight;
        if (x + w > width - HUD_MARGIN) x = px - HUD_OFFSET - w;
        if (y + h > height - HUD_MARGIN) y = py - HUD_OFFSET - h;
        x = Math.max(HUD_MARGIN, Math.min(x, width - HUD_MARGIN - w));
        y = Math.max(HUD_MARGIN, Math.min(y, height - HUD_MARGIN - h));
      }
      hud.style.left = `${x}px`;
      hud.style.top = `${y}px`;
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
        const scene = new THREE.Box3().setFromObject(ctx.group);
        drag.threshold = snapThreshold(scene.isEmpty() ? 0 : scene.getSize(new THREE.Vector3()).length());
      }
      ctx.drag = drag;
    });
    transform.addEventListener('objectChange', () => {
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
    const holeDown = (event) => {
      if (ctx.holeMode !== 'move' || event.button !== 0) return;
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
        holeCallbacks.current.onMoveHole?.(completed.handle.userData.featureId, completed.point);
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
    };
    renderer.domElement.addEventListener('pointermove', trackPointer);
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
          holeCallbacks.current.onPlaceHole?.(hit.point.toArray(), normal.toArray(), planar);
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
      renderer.domElement.removeEventListener('pointermove', trackPointer);
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
        const position = mapPlacement(cut.position, instance.placement);
        const direction = mapPlacement(cut.direction, instance.placement, true);
        const radius = Math.max(Number(f.diameter) / 2 || 2, ctx.span * 0.004 || 2);
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
        handle.userData = { featureId: f.id, position, direction, locked: f.positionLocked };
        ctx.holeHandles.add(handle);
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
        group.userData.instanceId === selectedId && !sketchMode
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
    ctx.render();
  }, [snapshot, model, selectedId, isolated, exploded, section, sketchMode, sketchSupportId]);
  useEffect(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;
    ctx.sketchMode = sketchMode;
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
    const ctx = sceneRef.current;
    if (!ctx) return;
    ctx.cancelDrag();
    ctx.transform.detach();
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
    }
    ctx.render();
  }, [snapshot, model, selectedId, moveEnabled, exploded, isolated, transformMode, rotateSpace, pivotPick]);
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
    if (!ready) return;
    const viewChanged = ctx.lastView !== view || ctx.lastPerspective !== perspective || ctx.lastFitKey !== fitKey;
    const firstGeometry = !ctx.hasFitted && Boolean(snapshot?.instances.length);
    if (!viewChanged && !firstGeometry) return;
    ctx.lastView = view;
    ctx.lastPerspective = perspective;
    ctx.lastFitKey = fitKey;
    ctx.hasFitted ||= Boolean(snapshot?.instances.length);
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
  }, [view, perspective, fitKey, snapshot, ready]);
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
      {error && <p role="alert">3D display unavailable: {error}</p>}
      <div className="cad-viewport-hint">
        {sketchMode === 'pick' && (
          <div>{pickHint || 'Click a flat face of any part to sketch on it · Esc cancels'}</div>
        )}
        {sketchMode === 'draw' && (
          <div>Click to draw · Shift locks horizontal/vertical · Right-drag pans · Scroll zooms</div>
        )}
        {holeMode === 'place' && <div>Click a surface of the selected part to place a hole · Esc finishes</div>}
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
        {!sketchMode && 'Drag background to orbit · Right drag to pan · Scroll to zoom · Click a part to select'}
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
  return { ...info, frame, outline: segmentsInPlane(frame, outline.segments, 0.05) };
}

// Outline the moving box's face at each snapped plane.
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
      new THREE.LineBasicMaterial({ color: snap.kind === 'flush' ? '#e0861a' : '#2f9be6', depthTest: false }),
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
