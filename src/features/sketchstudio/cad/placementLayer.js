// The viewport side of direct placement (Phase H): the placementLayer
// overlay (ghosts, handles, snap marker, the boolean tool ghost), hover and
// handle drags at frame rate without React renders, and the clicks and
// completed drags handed to the workspace through ref-held callbacks
// (onPlace, onPlacementDrag, onPlacementCancelDrag, onPlacementFinish).
// CadViewport creates one per mount and forwards its pointer, key and
// TransformControls events; the maths lives in placementTool.js and
// placementHandles.js.
import * as THREE from 'three';
import { SNAP_PX, displayedInstanceMatrix, markSnapPoints, measureCandidates, mmPerPixelAt } from './marks.js';
import { instanceMatrix, placementMatrix } from './movement.js';
import { snapPoint } from './sketchSnap.js';
import { rotationReadout, translationReadout, typeKey, typedHtml } from './gizmoHud.js';
import { gizmoAxes, snapBoxDelta, snapThreshold } from './boxSnap.js';
import { toPlane, toWorld } from './sketchPlane.js';
import {
  ARROW_HEAD_PX,
  ARROW_RADIUS_PX,
  GRIP_PX,
  SQUARE_PX,
  arrowPoints,
  axisDragValue,
  clampMagnitude,
  gridPoint,
  nearestSegment,
  pickHandle,
  planeDragPoint,
  projectToPlane,
  screenAxisValue,
  snapValue,
} from './placementHandles.js';
import {
  GROUND_FRAME,
  IN_PLANE_TOLERANCE,
  PLACEMENT_BLUE,
  PLACEMENT_RED,
  axisSegments,
  dragReadout,
  dragView,
  faceLabel,
  ghostSegments,
  gripValue,
  hoverShape,
  toolPoseAfterMove,
  toolPoseAfterTurn,
} from './placementTool.js';
import { curvedHoverText } from './placementCuts.js';
import { rowHover } from './placementRows.js';

const ORANGE = '#e0861a';
const MARKER = '#8a3fc6';
const MARKER_PX = 6;
// Kinds that are real snap targets (a plain face / ground point is not).
const FEATURE_KINDS = ['vertex', 'midpoint', 'face centre', 'mark', 'hole centre'];
// Existing hole / pocket centres on the hovered face snap within this of its plane (mm).
const HOLE_CENTRE_PLANE = 0.05;
const fmt = (value) => String(Number(Number(value).toFixed(2)));
const escape = (text) =>
  String(text).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);

function clear(layer) {
  for (const object of [...layer.children]) {
    object.traverse((o) => {
      if (!o.userData.sharedGeometry) o.geometry?.dispose();
      o.material?.dispose();
    });
  }
  layer.clear();
}
function segmentsObject(segments, color, name, opacity = 0.95, order = 44) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(segments.flat(2), 3));
  const line = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false }),
  );
  line.name = name;
  line.renderOrder = order;
  line.frustumCulled = false;
  return line;
}
const basicMaterial = (color, opacity = 1) =>
  new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

/**
 * @param {object} deps
 * @param {object} deps.ctx        CadViewport's scene context (camera, group, controls, transform, pivot, …).
 * @param {HTMLElement} deps.hud   The placement readout box.
 * @param {{current: object}} deps.callbacks  Ref-held workspace callbacks.
 * @param {Function} deps.rayAt    (event) → THREE.Raycaster.
 * @param {Function} deps.pickedFace  (hit) → face info (CadViewport.pickedFace).
 * @param {Function} deps.placeBox (node) → position a readout by the cursor.
 */
export function createPlacementLayer({ ctx, renderer, hud, callbacks, rayAt, pickedFace, placeBox }) {
  const layer = new THREE.Group();
  layer.name = 'placement';
  layer.renderOrder = 37;
  ctx.scene.add(layer);
  let view = null,
    live = null,
    hover = null,
    pathHover = null,
    edgeHover = null,
    drag = null,
    toolDrag = null,
    ghost = null,
    faceCache = null,
    pending = null,
    // Digits typed in a hole row's direction stage: the spacing (Phase K §3.2).
    rowTyped = '';
  if (hud) hud.hidden = true;
  // The "axis" tag beside Revolve's dashed axis (an HTML label like the marks').
  const axisLabel = document.createElement('div');
  axisLabel.className = 'cad-placement-label';
  axisLabel.textContent = 'axis';
  axisLabel.hidden = true;
  hud?.parentElement?.appendChild(axisLabel);
  const showAxisLabel = (axis) => {
    const [x, y] = projectPx(axis.a.map((v, i) => (v + axis.b[i]) / 2));
    axisLabel.style.left = `${x}px`;
    axisLabel.style.top = `${y}px`;
    axisLabel.hidden = false;
  };

  const rect = () => renderer.domElement.getBoundingClientRect();
  const projectPx = (point) => {
    const r = rect();
    const v = new THREE.Vector3(...point).project(ctx.camera);
    return [((v.x + 1) / 2) * r.width, ((1 - v.y) / 2) * r.height];
  };
  const mmPx = (point) => mmPerPixelAt(ctx.camera, point, rect().height);
  const pointerOf = (event) => {
    const r = rect();
    return [event.clientX - r.left, event.clientY - r.top];
  };
  const rayOf = (event) => {
    const { ray } = rayAt(event);
    return { origin: ray.origin.toArray(), direction: ray.direction.toArray(), three: ray };
  };
  const snapStep = (event) => (event?.altKey || ctx.altDown ? 0 : Number(ctx.snap) || 0);

  // ------------------------------------------------------------ drawing
  const marker = (point, name) => {
    ctx.camera.updateMatrixWorld();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(ctx.camera.quaternion),
      up = new THREE.Vector3(0, 1, 0).applyQuaternion(ctx.camera.quaternion);
    const r = MARKER_PX * mmPx(point);
    const c = new THREE.Vector3(...point);
    const corner = (u, v) =>
      c
        .clone()
        .addScaledVector(right, u * r)
        .addScaledVector(up, v * r)
        .toArray();
    const ring = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
    return segmentsObject(
      ring.map((p, i) => [p, ring[(i + 1) % 4]]),
      MARKER,
      name,
      1,
      46,
    );
  };
  const drawArrow = (handle, color) => {
    const head = ARROW_HEAD_PX * mmPx(handle.origin);
    const { tip, sign } = arrowPoints(handle, head);
    layer.add(segmentsObject([[handle.origin, tip]], color, `placement-arrow-${handle.id}`, 1, 45));
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(ARROW_RADIUS_PX * mmPx(handle.origin), head, 16),
      basicMaterial(color, drag?.handle.id === handle.id ? 1 : 0.9),
    );
    const direction = new THREE.Vector3(...handle.direction).multiplyScalar(sign);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    cone.position.set(...tip).addScaledVector(direction, head / 2);
    cone.name = `placement-head-${handle.id}`;
    cone.renderOrder = 46;
    cone.frustumCulled = false;
    layer.add(cone);
  };
  const drawSquare = (handle, color) => {
    const half = SQUARE_PX * mmPx(handle.at);
    const f = handle.frame;
    const ring = [
      [-half, -half],
      [half, -half],
      [half, half],
      [-half, half],
    ].map(([u, v]) => toWorld({ ...f, origin: handle.at }, [u, v]));
    layer.add(
      segmentsObject(
        ring.map((p, i) => [p, ring[(i + 1) % 4]]),
        color,
        'placement-square',
        1,
        46,
      ),
    );
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(2 * half, 2 * half), basicMaterial(color, 0.35));
    fill.matrixAutoUpdate = false;
    fill.matrix.makeBasis(new THREE.Vector3(...f.x), new THREE.Vector3(...f.y), new THREE.Vector3(...f.normal));
    fill.matrix.setPosition(...handle.at);
    fill.name = 'placement-square-fill';
    fill.renderOrder = 45;
    fill.frustumCulled = false;
    layer.add(fill);
  };
  const drawGrip = (handle, color) => {
    const dot = new THREE.Mesh(new THREE.SphereGeometry(GRIP_PX * mmPx(handle.at), 12, 8), basicMaterial(color, 1));
    dot.position.set(...handle.at);
    dot.name = `placement-grip-${handle.id}`;
    dot.renderOrder = 47;
    dot.frustumCulled = false;
    layer.add(dot);
  };
  const redraw = () => {
    clear(layer);
    axisLabel.hidden = true;
    try {
      draw();
    } catch (error) {
      // An overlay must never take the viewport down; the panel reports problems.
      console.error('Placement overlay:', error);
    }
    ctx.render();
  };
  const draw = () => {
    const v = live || view;
    if (v) {
      ctx.camera.updateMatrixWorld();
      const color = v.cut ? PLACEMENT_RED : PLACEMENT_BLUE;
      const shape = ghostSegments(v.shape);
      if (shape.length) layer.add(segmentsObject(shape, color, 'placement-ghost', 0.9));
      if (v.shape?.kind === 'plane') {
        const [a, b, c, d] = v.shape.corners;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute([a, b, c, a, c, d].flat(), 3));
        const fill = new THREE.Mesh(geometry, basicMaterial(color, 0.15));
        fill.name = 'placement-plane';
        fill.renderOrder = 43;
        fill.frustumCulled = false;
        layer.add(fill);
      }
      for (const extra of v.extras || []) {
        // A hole row's line and ticks (Phase K) are part of the cut: red, no tag.
        if (extra.kind === 'axis') {
          const name = extra.row ? 'placement-row-line' : 'placement-axis';
          layer.add(segmentsObject(axisSegments(extra), extra.row ? color : ORANGE, name, 1));
          if (!extra.row) showAxisLabel(extra);
        }
        if (extra.kind === 'outline' && extra.segments.length) {
          const name = extra.row ? 'placement-row-ticks' : 'placement-picked';
          layer.add(segmentsObject(extra.segments, extra.row ? color : ORANGE, name, 1));
        }
      }
      if (v.path && v.row?.seed) {
        // A hole row's direction stage: the rubber row from the seed to the cursor.
        const rubber = pathHover ? rowHover(v, pathHover) : null;
        if (rubber?.segments.length) layer.add(segmentsObject(rubber.segments, color, 'placement-row', 0.95));
        if (pathHover) layer.add(marker(pathHover.point, 'placement-cursor'));
      } else if (v.path) {
        const points = v.path.points;
        if (points.length > 1)
          layer.add(
            segmentsObject(
              points.slice(1).map((p, i) => [points[i], p]),
              color,
              'placement-path',
              1,
            ),
          );
        if (pathHover) {
          layer.add(segmentsObject([[points.at(-1), pathHover.point]], color, 'placement-band', 0.6));
          layer.add(marker(pathHover.point, 'placement-cursor'));
        }
        const tube = ghostSegments({
          kind: 'tube',
          frame: v.path.frame,
          path: pathHover ? [...points, pathHover.point] : points,
          radius: v.path.radius,
        });
        if (tube.length) layer.add(segmentsObject(tube, color, 'placement-tube', 0.45));
      } else if (v.pick && hover) {
        const ghostShape = hoverShape(v, hover);
        const segments = ghostSegments(ghostShape);
        if (ghostShape?.axis) showAxisLabel(ghostShape.axis);
        if (segments.length)
          layer.add(
            segmentsObject(
              segments,
              v.pick === 'reference' || v.pick === 'plane' ? ORANGE : color,
              'placement-hover',
              0.95,
            ),
          );
        if (hover.planar !== false && v.pick !== 'reference' && v.pick !== 'plane')
          layer.add(marker(hover.point, 'placement-cursor'));
      }
      if (edgeHover) layer.add(segmentsObject([[edgeHover.a, edgeHover.b]], ORANGE, 'placement-edge', 1, 46));
      for (const handle of v.handles || []) {
        if (handle.kind === 'arrow') drawArrow(handle, color);
        else if (handle.kind === 'square') drawSquare(handle, color);
        else if (handle.kind === 'grip') drawGrip(handle, color);
      }
    }
  };

  // ------------------------------------------------------------ readout
  const showHud = (html) => {
    if (!hud) return;
    if (!html) {
      hud.hidden = true;
      hud.innerHTML = '';
      return;
    }
    hud.innerHTML = html;
    hud.hidden = false;
    placeBox(hud);
  };
  const coordinates = (point) =>
    ['X', 'Y', 'Z']
      .map((name, i) => `<span class="cad-axis-${name.toLowerCase()}">${name}</span> ${fmt(point[i])}`)
      .join(' · ');
  const hoverHud = () => {
    const v = view;
    if (!v?.pick) return showHud('');
    if (v.pick === 'path' && v.row?.seed && (pathHover || rowTyped)) {
      const rubber = pathHover ? rowHover(v, pathHover) : null;
      const typed = rowTyped
        ? `<div class="cad-gizmo-typed">Spacing ${escape(rowTyped)} mm · Enter applies · Esc clears</div>`
        : '';
      return showHud(`<span class="cad-gizmo-value">${escape(rubber?.text || `${v.row.count} holes`)}</span>${typed}`);
    }
    if (v.pick === 'path' && pathHover) {
      return showHud(
        `<span class="cad-gizmo-value">${fmt(pathHover.length)} mm</span> · <span class="cad-gizmo-snap">${escape(pathHover.kind)}</span>`,
      );
    }
    if (v.pick === 'edge')
      return showHud(
        edgeHover ? '<span class="cad-gizmo-snap">edge</span> · click to use as the axis' : 'Point at an edge',
      );
    if (!hover) return showHud(v.allowGround ? '' : 'Point at a face of the part');
    if (hover.planar === false) return showHud(escape(curvedHoverText(v, hover)));
    const where =
      hover.kind === 'ground'
        ? 'ground'
        : `${v.names?.[hover.instanceId] || 'Part'} ${faceLabel(hover.normal).replace(' face', '')}`;
    // Hardware (Phase J) names what is being seated: "Threaded standoff M3 · …".
    const what = v.tool === 'hardware' && v.place?.name ? `${v.place.name} · ` : '';
    // Over a hole it can go in (Phase M): whether a click adds or removes it.
    const choice =
      v.tool === 'hardware' && hover.snapKind === 'hole centre' && hover.holeAttachable
        ? v.place?.chosen?.[`${hover.instanceId}/${hover.holeFeatureId}/${hover.holeIndex || 0}`]
          ? ' · chosen · click to remove'
          : ' · click to add'
        : '';
    showHud(
      `<span class="cad-gizmo-snap">${escape(hover.snapKind)}</span> · ${escape(what + where + choice)}<div class="cad-gizmo-typed">${coordinates(hover.point)}</div>`,
    );
  };
  const dragHud = () => {
    if (!drag) return;
    const readout = dragReadout(view, drag.handle.id, drag.value, dragMeta());
    const typing = drag.handle.typing || (drag.handle.kind === 'grip' && drag.handle.mode === 'circle');
    showHud(readout.html + (typing ? typedHtml(drag.typed, 'translate') : ''));
  };

  // ------------------------------------------------------------ hover
  const groupsForSnap = () =>
    ctx.group.children.map((g) => ({
      instanceId: g.userData.instanceId,
      matrix: g.matrix,
      placement: g.userData.placement,
      bounds: g.userData.bounds,
      visible: g.visible,
      positions: g.children[1]?.geometry.getAttribute('position')?.array,
    }));
  // The snap candidate near the pointer (measureCandidates + the face centre).
  const candidateAt = (event, caster, hit, face) => {
    const r = rect();
    ctx.group.updateMatrixWorld(true);
    const projected = new THREE.Vector3();
    return measureCandidates({
      pointer: pointerOf(event),
      groups: groupsForSnap(),
      marks: markSnapPoints(ctx.drawnMarks || []),
      ray: caster.ray,
      camera: ctx.camera,
      project: (v) => {
        projected.copy(v).project(ctx.camera);
        return [((projected.x + 1) / 2) * r.width, ((1 - projected.y) / 2) * r.height];
      },
      hit: hit ? { point: hit.point.toArray(), instanceId: hit.object.userData.instanceId } : null,
      height: r.height,
      extra: [
        ...(face?.centre ? [{ point: face.centre, kind: 'face centre', instanceId: face.instanceId }] : []),
        ...holeCentresOn(face, hit),
      ],
    });
  };
  // Hole / pocket centres (Phase J) lying in the hovered face's plane.
  const holeCentresOn = (face, hit) => {
    if (!face?.planar || !hit || !view?.holeCentres?.length) return [];
    const at = hit.point.toArray();
    return view.holeCentres
      .filter(
        (h) =>
          h.instanceId === face.instanceId &&
          Math.abs(h.point.reduce((sum, v, i) => sum + (v - at[i]) * face.normal[i], 0)) <= HOLE_CENTRE_PLANE,
      )
      .map((h) => ({ point: h.point, kind: 'hole centre', instanceId: h.instanceId }));
  };
  // The candidate's hole, on the hovered instance (coincident centres of
  // another part never answer for it).
  const holeAt = (point, instanceId) => {
    let best = null;
    for (const h of view?.holeCentres || []) {
      if (instanceId && h.instanceId !== instanceId) continue;
      const d = Math.hypot(...h.point.map((v, i) => v - point[i]));
      if (!best || d < best.d) best = { d, h };
    }
    return best && best.d < 1e-3 ? best.h : null;
  };
  // Hardware (Phase M): a hole is picked by pointing anywhere over its
  // opening — within its rim plus SNAP_PX on screen. The ordinary candidates
  // cannot do it: outside the rim the rim's own vertices are always nearer
  // the pointer than the centre, and inside it a through hole has no face
  // under the pointer at all. The hole's face must look at the camera and
  // nothing may stand in front of it. Returns the click info, or null.
  const holeOpeningAt = (event, hit) => {
    if (view?.tool !== 'hardware' || view.stage !== 'place' || !view.holeCentres?.length) return null;
    const pointer = pointerOf(event);
    ctx.camera.updateMatrixWorld();
    const eye = new THREE.Vector3().setFromMatrixPosition(ctx.camera.matrixWorld);
    const forward = ctx.camera.getWorldDirection(new THREE.Vector3());
    const depthOf = (p) => (p[0] - eye.x) * forward.x + (p[1] - eye.y) * forward.y + (p[2] - eye.z) * forward.z;
    const face = hit ? faceOf(hit) : null;
    const hitPoint = hit ? hit.point.toArray() : null;
    let best = null;
    for (const h of view.holeCentres) {
      if (!(h.radius > 0)) continue;
      const group = ctx.group.children.find((g) => g.userData.instanceId === h.instanceId);
      if (!group?.visible || (view.pickInstanceId && h.instanceId !== view.pickInstanceId)) continue;
      // Facing the camera (an orthographic view looks along `forward`).
      const toEye = ctx.camera.isOrthographicCamera
        ? [-forward.x, -forward.y, -forward.z]
        : [eye.x - h.point[0], eye.y - h.point[1], eye.z - h.point[2]];
      if (h.normal.reduce((sum, v, i) => sum + v * toEye[i], 0) <= 0) continue;
      const depth = depthOf(h.point);
      if (depth <= 0) continue;
      const [x, y] = projectPx(h.point);
      const distance = Math.hypot(x - pointer[0], y - pointer[1]);
      const reach = h.radius / mmPx(h.point) + SNAP_PX;
      if (distance > reach || (best && distance >= best.distance)) continue;
      // Something in front: a hit on another part, or on this part off the
      // hole's face plane and nearer the camera than the hole's rim.
      if (hit) {
        const own = hit.object.userData.instanceId === h.instanceId;
        const inPlane =
          face?.planar &&
          Math.abs(h.point.reduce((sum, v, i) => sum + (v - hitPoint[i]) * face.normal[i], 0)) <= HOLE_CENTRE_PLANE;
        if (!(own && (inPlane || !face?.planar)) && depthOf(hitPoint) < depth - h.radius - 1) continue;
      }
      best = { h, distance, onFace: Boolean(hit && face?.planar && face.instanceId === h.instanceId) };
    }
    if (!best) return null;
    const { h, onFace } = best;
    return {
      kind: 'face',
      planar: true,
      instanceId: h.instanceId,
      partId: ctx.group.children.find((g) => g.userData.instanceId === h.instanceId)?.userData.partId || null,
      normal: [...h.normal],
      faceFrame: onFace ? face.frame : null,
      outline: onFace ? face.outline : null,
      outlineWorld: onFace ? face.outlineWorld : null,
      point: [...h.point],
      snapKind: 'hole centre',
      holeFeatureId: h.featureId,
      holeAttachable: h.attachable,
      holeIndex: h.index || 0,
    };
  };
  const faceOf = (hit) => {
    if (faceCache && faceCache.mesh === hit.object && faceCache.triangles?.has(hit.faceIndex)) return faceCache.info;
    const info = pickedFace(hit);
    faceCache = { mesh: hit.object, triangles: new Set(info.triangles || []), info };
    return info;
  };
  // What a click here would place: { kind: 'face' | 'ground', point, normal,
  // planar, instanceId, partId, faceFrame, outline, outlineWorld, snapKind }.
  const hoverAt = (event) => {
    const caster = rayAt(event);
    let hit = caster.intersectObjects(ctx.group.children, true).find((h) => h.object.isMesh && h.object.parent.visible);
    if (view.pickInstanceId && hit && hit.object.userData.instanceId !== view.pickInstanceId) hit = null;
    const snap = snapStep(event);
    // Hardware (Phase M): pointing over a hole picks its centre.
    const opening = !(event.altKey || ctx.altDown) ? holeOpeningAt(event, hit) : null;
    if (opening) return opening;
    if (hit) {
      const face = faceOf(hit);
      if (!face.planar)
        return {
          kind: 'face',
          planar: false,
          instanceId: face.instanceId,
          partId: face.partId,
          normal: face.normal,
          point: hit.point.toArray(),
        };
      const info = {
        kind: 'face',
        planar: true,
        instanceId: face.instanceId,
        partId: face.partId,
        normal: face.normal,
        faceFrame: face.frame,
        outline: face.outline,
        outlineWorld: face.outlineWorld,
        point: hit.point.toArray(),
        snapKind: 'face',
      };
      // Alt places freely: no snap points, no grid.
      if (view.pick === 'reference' || view.pick === 'plane' || event.altKey || ctx.altDown) return info;
      const candidate = candidateAt(event, caster, hit, face);
      if (candidate && FEATURE_KINDS.includes(candidate.kind)) {
        info.point = projectToPlane(candidate.point, hit.point.toArray(), face.normal);
        info.snapKind = candidate.kind;
        // Seating hardware in an existing hole: which hole (spec §3.4).
        const hole = candidate.kind === 'hole centre' ? holeAt(candidate.point, face.instanceId) : null;
        if (hole)
          Object.assign(info, {
            holeFeatureId: hole.featureId,
            holeAttachable: hole.attachable,
            holeIndex: hole.index || 0,
          });
      } else if (candidate?.kind === 'edge') {
        info.point = projectToPlane(candidate.point, hit.point.toArray(), face.normal);
        info.snapKind = 'edge';
      } else if (snap > 0) {
        info.point = gridPoint(hit.point.toArray(), face.frame, snap);
        info.snapKind = 'grid';
      }
      return info;
    }
    if (!view.allowGround) return null;
    const ray = rayOf(event);
    const ground = planeDragPoint(ray, [0, 0, 0], [0, 0, 1]);
    if (!ground) return null;
    return {
      kind: 'ground',
      planar: true,
      normal: [0, 0, 1],
      point: snap > 0 ? gridPoint(ground, GROUND_FRAME, snap) : ground,
      snapKind: snap > 0 ? 'grid' : 'ground',
    };
  };
  // Sweep corners: on the path plane, snapped like the sketcher (3D snap
  // points projected into the plane, path points, grid; Shift = ortho).
  const pathAt = (event) => {
    const { frame, points } = view.path;
    const ray = rayOf(event);
    const raw = planeDragPoint(ray, frame.origin, frame.normal);
    if (!raw) return null;
    const caster = rayAt(event);
    const hit = caster
      .intersectObjects(ctx.group.children, true)
      .find((h) => h.object.isMesh && h.object.parent.visible);
    const face = hit ? faceOf(hit) : null;
    const free = event.altKey || ctx.altDown;
    const candidate = free ? null : candidateAt(event, caster, hit, face?.planar ? face : null);
    const local = points.map((p) => toPlane(frame, p).slice(0, 2));
    const targets = {
      points: [
        { point: [0, 0], kind: 'start' },
        ...local.slice(1).map((point) => ({ point, kind: 'path point' })),
        ...(candidate && FEATURE_KINDS.includes(candidate.kind)
          ? [{ point: toPlane(frame, candidate.point).slice(0, 2), kind: candidate.kind }]
          : []),
      ],
      curves: [],
    };
    const snapped = snapPoint(toPlane(frame, raw).slice(0, 2), {
      targets,
      grid: snapStep(event),
      tolerance: free ? 0 : SNAP_PX * mmPx(raw),
      ortho: event.shiftKey,
      from: local.at(-1),
    });
    const point = toWorld(frame, snapped.point);
    const last = points.at(-1);
    // step / free: how the point was snapped (a hole row rounds its spacing with them).
    return {
      point,
      kind: snapped.kind,
      length: Math.hypot(...point.map((v, i) => v - last[i])),
      step: snapStep(event),
      free: Boolean(free),
    };
  };
  const edgeAt = (event) => {
    const segments = [];
    ctx.group.updateMatrixWorld(true);
    const a = new THREE.Vector3(),
      b = new THREE.Vector3();
    for (const g of ctx.group.children) {
      if (!g.visible) continue;
      const positions = g.children[1]?.geometry.getAttribute('position');
      if (!positions) continue;
      for (let i = 0; i + 1 < positions.count; i += 2) {
        a.fromBufferAttribute(positions, i).applyMatrix4(g.matrix);
        b.fromBufferAttribute(positions, i + 1).applyMatrix4(g.matrix);
        segments.push([a.toArray(), b.toArray()]);
      }
    }
    // Edges in the profile plane first (one seen end-on can hide behind another).
    const frame = view.shape?.frame;
    const inPlane = frame
      ? segments.filter((segment) => segment.every((p) => Math.abs(toPlane(frame, p)[2]) <= IN_PLANE_TOLERANCE))
      : [];
    const pointer = pointerOf(event);
    return (
      nearestSegment(inPlane, pointer, projectPx, SNAP_PX) || nearestSegment(segments, pointer, projectPx, SNAP_PX)
    );
  };
  const updateHover = (event) => {
    hover = pathHover = edgeHover = null;
    if (!view?.pick) return;
    if (view.pick === 'edge') edgeHover = edgeAt(event);
    else if (view.pick === 'path' && view.path) pathHover = pathAt(event);
    else hover = hoverAt(event);
  };

  // ------------------------------------------------------------ drags
  const startDrag = (event, handle) => {
    const ray = rayOf(event);
    const pointer = pointerOf(event);
    drag = { handle, start: null, value: null, typed: '', pointer };
    if (handle.kind === 'arrow') {
      drag.start = handle.value;
      drag.value = handle.value;
      drag.t0 = axisDragValue(ray, handle.origin, handle.direction);
      drag.mmPx = mmPx(handle.origin);
      const eye = ctx.camera.isOrthographicCamera
        ? ctx.camera.getWorldDirection(new THREE.Vector3()).negate()
        : ctx.camera.position
            .clone()
            .sub(new THREE.Vector3(...handle.origin))
            .normalize();
      drag.toward = eye.dot(new THREE.Vector3(...handle.direction));
    } else if (handle.kind === 'square') {
      const hitPoint = planeDragPoint(ray, handle.at, handle.frame.normal) || handle.at;
      drag.offset = handle.at.map((v, i) => v - hitPoint[i]);
      drag.value = [...handle.at];
    } else drag.value = gripValue(handle, handle.at);
  };
  const dragValueAt = (event) => {
    const { handle } = drag;
    const ray = rayOf(event);
    const step = snapStep(event);
    if (handle.kind === 'arrow') {
      const t = drag.t0 == null ? null : axisDragValue(ray, handle.origin, handle.direction);
      const raw =
        t == null
          ? screenAxisValue(drag.start, pointerOf(event)[1] - drag.pointer[1], drag.mmPx, drag.toward)
          : drag.start + (t - drag.t0);
      const value = snapValue(raw, step);
      // A cut's depth arrow has no outward side: it stops at its minimum.
      if (handle.min != null) return Math.max(handle.min, value);
      return handle.minAbs ? clampMagnitude(value, handle.minAbs) : value;
    }
    if (handle.kind === 'square') {
      const hit = planeDragPoint(ray, handle.at, handle.frame.normal);
      if (!hit) return drag.value;
      drag.step = step;
      drag.free = Boolean(event.altKey || ctx.altDown);
      const point = squareValue(
        event,
        hit.map((v, i) => v + drag.offset[i]),
        step,
      );
      // Shift: ortho, along whichever grid axis the move is longer on —
      // measured from orthoFrom when the handle has one (a hole row's end
      // square locks to the face axes through the first hole).
      if (!event.shiftKey) return point;
      const grid = handle.grid || handle.frame;
      const from = handle.orthoFrom || handle.at;
      const d = point.map((v, i) => v - from[i]);
      const u = d[0] * grid.x[0] + d[1] * grid.x[1] + d[2] * grid.x[2],
        v = d[0] * grid.y[0] + d[1] * grid.y[1] + d[2] * grid.y[2];
      drag.snapKind = 'ortho';
      return from.map((c, i) => c + (Math.abs(u) >= Math.abs(v) ? u * grid.x[i] : v * grid.y[i]));
    }
    const point = planeDragPoint(ray, handle.frame.origin, handle.frame.normal);
    if (!point) return drag.value;
    return gripValue(handle, point, { snap: step, free: step === 0 });
  };
  // The slide square's point: a snap point projected into the plane, else the grid.
  const squareValue = (event, point, step) => {
    const { handle } = drag;
    if (!(step > 0) && (event.altKey || ctx.altDown)) return point;
    const caster = rayAt(event);
    const mesh = caster
      .intersectObjects(ctx.group.children, true)
      .find((h) => h.object.isMesh && h.object.parent.visible);
    const face = mesh ? faceOf(mesh) : null;
    const candidate = candidateAt(event, caster, mesh, face?.planar ? face : null);
    if (candidate && FEATURE_KINDS.includes(candidate.kind) && !(event.altKey || ctx.altDown)) {
      drag.snapKind = candidate.kind;
      return projectToPlane(candidate.point, handle.at, handle.frame.normal);
    }
    drag.snapKind = step > 0 ? 'grid' : null;
    return step > 0 ? gridPoint(point, handle.grid || handle.frame, step) : point;
  };
  // The drag's snap, for a hole row's end square (dragView / dragReadout).
  const dragMeta = () => ({ snapKind: drag?.snapKind || null, step: drag?.step || 0, free: Boolean(drag?.free) });
  const applyLive = () => {
    live = dragView(view, drag.handle.id, drag.value, dragMeta());
    redraw();
    dragHud();
  };
  const finishDrag = (value) => {
    const completed = drag;
    drag = null;
    ctx.controls.enabled = true;
    showHud('');
    if (value == null || JSON.stringify(value) === JSON.stringify(completed.handle.value ?? completed.handle.at)) {
      live = null;
      redraw();
      return;
    }
    // Keep the dragged ghost until the workspace sends the new view; drop it
    // if none arrives (the change was refused).
    const before = view;
    clearTimeout(pending);
    pending = setTimeout(() => {
      if (view === before && live) {
        live = null;
        redraw();
      }
    }, 400);
    callbacks.current.onPlacementDrag?.({
      id: completed.handle.id,
      value,
      from: completed.handle.at || completed.handle.origin,
      // How the point was snapped (a hole row's end square rounds with it).
      snapKind: completed.snapKind || null,
      step: completed.step || 0,
      free: Boolean(completed.free),
    });
  };
  const cancelDrag = () => {
    if (!drag && !toolDrag) return false;
    if (toolDrag) cancelTool();
    drag = null;
    live = null;
    ctx.controls.enabled = true;
    showHud('');
    redraw();
    callbacks.current.onPlacementCancelDrag?.();
    return true;
  };

  // ------------------------------------------------------------ tool gizmo
  const toolMatrix = (tool) => {
    const host = ctx.group.children.find((g) => g.userData.instanceId === tool.hostInstanceId);
    const hostMatrix = host
      ? (host.updateMatrix(), displayedInstanceMatrix(host.matrix, host.userData.placement))
      : placementMatrix(tool.hostOps);
    return hostMatrix.multiply(instanceMatrix({ position: tool.position, rotation: tool.rotation }));
  };
  const detachTool = () => {
    // A tool drag in progress keeps its ghost (a preview finishing mid-drag
    // re-runs the viewport's attach effect).
    if (toolDrag) return;
    if (ghost) {
      ghost.geometry.dispose();
      ghost.material.dispose();
      ctx.scene.remove(ghost);
      ghost = null;
    }
    ctx.toolGizmo = null;
  };
  const attachTool = (mode) => {
    if (toolDrag) return true;
    detachTool();
    const tool = view?.toolGizmo;
    if (!tool) return false;
    // Transform (Phase J): the ghost is the part itself, its displayed mesh
    // taken back from the pose it was built with (basePose) to the part.
    const source = ctx.group.children.find((g) =>
      tool.self ? g.userData.instanceId === tool.hostInstanceId : g.userData.partId === tool.partId,
    );
    let geometry, local;
    if (source?.children[0]?.geometry) {
      geometry = source.children[0].geometry.clone();
      local = placementMatrix(source.userData.placement || []).invert();
      if (tool.self && tool.basePose) local = instanceMatrix(tool.basePose).invert().multiply(local);
    } else if (tool.bounds) {
      const [min, max] = tool.bounds;
      geometry = new THREE.BoxGeometry(...max.map((v, i) => Math.max(v - min[i], 1e-3)));
      local = new THREE.Matrix4().makeTranslation(...min.map((v, i) => (v + max[i]) / 2));
    } else return false;
    ghost = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: view.cut ? PLACEMENT_RED : PLACEMENT_BLUE,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      }),
    );
    ghost.name = 'placement-tool-ghost';
    ghost.renderOrder = 38;
    ghost.matrixAutoUpdate = false;
    ghost.userData.local = local;
    ghost.matrix.copy(toolMatrix(tool).multiply(local));
    ghost.matrixWorldNeedsUpdate = true;
    ctx.scene.add(ghost);
    const box = new THREE.Box3().setFromObject(ghost);
    ctx.pivot.position.copy(box.getCenter(new THREE.Vector3()));
    ctx.pivot.quaternion.identity();
    ctx.transform.setSpace('world');
    ctx.transform.setMode(mode === 'rotate' ? 'rotate' : 'translate');
    ctx.transform.setSize(mode === 'rotate' ? 1.2 : 0.85);
    ctx.transform.attach(ctx.pivot);
    ctx.toolGizmo = { mode: mode === 'rotate' ? 'rotate' : 'translate' };
    return true;
  };
  const toolDown = () => {
    if (!ghost) return;
    ctx.group.updateMatrixWorld(true);
    const host = ctx.group.children.find((g) => g.userData.instanceId === view.toolGizmo.hostInstanceId);
    const toBox = (object) => {
      const box = new THREE.Box3().setFromObject(object);
      return box.isEmpty() ? null : { min: box.min.toArray(), max: box.max.toArray() };
    };
    const scene = new THREE.Box3().setFromObject(ctx.group);
    toolDrag = {
      mode: ctx.toolGizmo.mode,
      axis: ctx.transform.axis,
      start: ctx.pivot.position.clone(),
      startQuat: ctx.pivot.quaternion.clone(),
      ghostStart: ghost.matrix.clone(),
      box: toBox(ghost),
      // A part's own ghost (Transform) snaps to the other parts, a tool to its target.
      others: view.toolGizmo.self
        ? ctx.group.children
            .filter((g) => g !== host && g.visible)
            .map(toBox)
            .filter(Boolean)
        : host
          ? [toBox(host)].filter(Boolean)
          : [],
      threshold: snapThreshold(scene.isEmpty() ? 0 : scene.getSize(new THREE.Vector3()).length()),
      delta: [0, 0, 0],
      turn: [0, 0, 0, 1],
    };
  };
  const toolChange = () => {
    if (!toolDrag || !ghost) return;
    if (toolDrag.mode === 'rotate') {
      const turn = ctx.pivot.quaternion.clone().multiply(toolDrag.startQuat.clone().invert());
      const angle = 2 * Math.acos(Math.min(1, Math.abs(turn.w)));
      const snapDeg = ctx.altDown ? 0 : Number(ctx.rotateSnap) || 0;
      if (angle > 1e-9 && snapDeg > 0) {
        const axis = new THREE.Vector3(turn.x, turn.y, turn.z).normalize().multiplyScalar(Math.sign(turn.w) || 1);
        const snapped = THREE.MathUtils.degToRad(Math.round(THREE.MathUtils.radToDeg(angle) / snapDeg) * snapDeg);
        turn.setFromAxisAngle(axis, snapped);
        ctx.pivot.quaternion.copy(turn).multiply(toolDrag.startQuat);
      }
      toolDrag.turn = turn.toArray();
      const c = toolDrag.start;
      ghost.matrix
        .makeTranslation(c.x, c.y, c.z)
        .multiply(new THREE.Matrix4().makeRotationFromQuaternion(turn))
        .multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z))
        .multiply(toolDrag.ghostStart);
      showHud(rotationReadout(toolDrag.turn, ctx.transform.axis).html + expressionNote());
    } else {
      const delta = ctx.pivot.position.clone().sub(toolDrag.start);
      const step = ctx.altDown ? 0 : Number(ctx.snap) || 0;
      if (step > 0) delta.set(...delta.toArray().map((n) => Math.round(n / step) * step));
      let snaps = [];
      if (step > 0 && toolDrag.box) {
        const result = snapBoxDelta(toolDrag.box, delta.toArray(), toolDrag.others, {
          threshold: toolDrag.threshold,
          axes: gizmoAxes(ctx.transform.axis),
        });
        delta.set(...result.delta);
        snaps = result.snaps;
      }
      ctx.pivot.position.copy(toolDrag.start).add(delta);
      toolDrag.delta = delta.toArray();
      ghost.matrix.copy(new THREE.Matrix4().makeTranslation(delta.x, delta.y, delta.z).multiply(toolDrag.ghostStart));
      showHud(translationReadout(toolDrag.delta, snaps).html + expressionNote());
    }
    ghost.matrixWorldNeedsUpdate = true;
    ctx.render();
  };
  // A dragged pose replaces typed expressions with numbers (Phase H §8).
  const expressionNote = () =>
    view?.toolGizmo?.expression ? '<div class="cad-gizmo-typed">replaces the typed expressions with numbers</div>' : '';
  const toolUp = () => {
    if (!toolDrag) return;
    const completed = toolDrag;
    toolDrag = null;
    showHud('');
    const tool = view.toolGizmo;
    const pose = { position: tool.position, rotation: tool.rotation };
    let value = null;
    if (completed.mode === 'rotate') {
      if (2 * Math.acos(Math.min(1, Math.abs(completed.turn[3]))) > 1e-6)
        value = toolPoseAfterTurn(pose, completed.turn, completed.start.toArray(), tool.hostOps);
    } else if (completed.delta.some((v) => Math.abs(v) > 1e-6))
      value = toolPoseAfterMove(pose, completed.delta, tool.hostOps);
    if (value) callbacks.current.onPlacementDrag?.({ id: 'tool', value });
  };
  const cancelTool = () => {
    if (!toolDrag) return;
    ctx.pivot.position.copy(toolDrag.start);
    ctx.pivot.quaternion.copy(toolDrag.startQuat);
    if (ghost) {
      ghost.matrix.copy(toolDrag.ghostStart);
      ghost.matrixWorldNeedsUpdate = true;
    }
    toolDrag = null;
    ctx.transform.dragging = false;
  };

  const rowKey = (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return false;
    if (event.target instanceof HTMLElement && event.target.closest('input, select, textarea, [contenteditable]'))
      return false;
    if (event.key === 'Escape' && rowTyped) {
      event.preventDefault();
      rowTyped = '';
      hoverHud();
      return true;
    }
    if (event.key === 'Enter' && rowTyped) {
      const along = Math.abs(Number(rowTyped));
      if (!Number.isFinite(along) || !(along > 0)) return false;
      event.preventDefault();
      const rubber = pathHover ? rowHover(view, pathHover) : null;
      const direction = rubber?.row.direction || view.row.grid.x;
      rowTyped = '';
      callbacks.current.onPlace?.({ kind: 'path', along, direction: [...direction], snapKind: 'typed' });
      return true;
    }
    if (event.key === 'Backspace' && !rowTyped) return false;
    const next = typeKey(rowTyped, event.key);
    if (next == null) return false;
    event.preventDefault();
    rowTyped = next;
    hoverHud();
    return true;
  };
  const rowState = (v) => {
    if (!v?.row) return null;
    if (v.row.seed) {
      const rubber = pathHover ? rowHover(v, pathHover) : null;
      return {
        seed: true,
        count: v.row.count,
        pitch: rubber?.row.pitch ?? null,
        length: rubber?.row.length ?? null,
        text: rubber?.text || '',
        typed: rowTyped,
      };
    }
    return { seed: false, count: v.row.count, pitch: v.row.pitch, length: v.row.length };
  };

  // ------------------------------------------------------------ events
  const api = {
    layer,
    active: () => Boolean(view),
    isDragging: () => Boolean(drag || toolDrag),
    setView(next) {
      clearTimeout(pending);
      if (!next?.row?.seed) rowTyped = '';
      if (drag && next?.handles?.every((h) => h.id !== drag.handle.id)) cancelDrag();
      view = next || null;
      live = null;
      if (!view?.pick) hover = pathHover = edgeHover = null;
      if (!view?.pick && !drag && !toolDrag) showHud('');
      redraw();
      // A hole row's count changed by ↑ / ↓: the readout follows at once.
      if (view?.row?.seed && (pathHover || rowTyped)) hoverHud();
      // A hole chosen or removed for hardware (Phase M): "chosen" follows at once.
      else if (view?.tool === 'hardware' && view.stage === 'place' && hover) hoverHud();
    },
    redraw,
    // Pointer move (no buttons, or a drag in progress).
    move(event) {
      if (drag) {
        drag.value = dragValueAt(event);
        applyLive();
        return true;
      }
      if (!view || event.buttons) return false;
      if (view.pick) {
        updateHover(event);
        redraw();
        hoverHud();
        return false;
      }
      const handle = pickHandle(view.handles, pointerOf(event), projectPx, (p) => ARROW_HEAD_PX * mmPx(p));
      renderer.domElement.style.cursor = handle ? 'grab' : '';
      return false;
    },
    // Pointer down: grab a handle (true = consumed, orbiting stays off).
    down(event) {
      if (!view || event.button !== 0 || view.pick === 'path' || view.stage === 'place') return false;
      const handle = pickHandle((live || view).handles, pointerOf(event), projectPx, (p) => ARROW_HEAD_PX * mmPx(p));
      if (!handle) return false;
      startDrag(event, handle);
      ctx.controls.enabled = false;
      dragHud();
      return true;
    },
    up() {
      if (!drag) return false;
      finishDrag(drag.value);
      return true;
    },
    // A click (no drag): place / pick. True when placement owns clicks.
    click(event) {
      if (!view) return false;
      if (!view.pick) return true;
      updateHover(event);
      const place = callbacks.current.onPlace;
      if (view.pick === 'edge') {
        if (edgeHover) place?.({ kind: 'edge', a: edgeHover.a, b: edgeHover.b });
      } else if (view.pick === 'path' && view.path) {
        if (pathHover)
          place?.({
            kind: 'path',
            point: pathHover.point,
            snapKind: pathHover.kind,
            step: pathHover.step,
            free: pathHover.free,
          });
      } else if (hover)
        // Hardware (Phase M): Shift+click picks a whole hole row.
        place?.(view.tool === 'hardware' ? { ...hover, shift: Boolean(event.shiftKey) } : hover);
      redraw();
      hoverHud();
      return true;
    },
    doubleClick() {
      if (view?.pick === 'path' && view.path?.points.length >= 2) callbacks.current.onPlacementFinish?.();
      // Hardware (Phase M): a double-click on a hole centre chooses it (when
      // the click pair left it off) and seats the hardware in the chosen holes.
      else if (
        view?.tool === 'hardware' &&
        view.stage === 'place' &&
        hover?.snapKind === 'hole centre' &&
        hover.holeAttachable
      )
        callbacks.current.onPlacementFinish?.({ ...hover });
    },
    // Keys during a drag: Esc cancels it; digits + Enter set an exact value.
    // A hole row's direction stage (no drag): digits + Enter set the spacing
    // along the hovered direction (the face's +X when nothing is hovered).
    key(event) {
      if (event.key === 'Escape' && (drag || toolDrag)) {
        event.preventDefault();
        cancelDrag();
        return true;
      }
      if (!drag && !toolDrag && view?.row?.seed && rowKey(event)) return true;
      if (!drag || event.ctrlKey || event.metaKey || event.altKey) return false;
      const typing = drag.handle.typing || (drag.handle.kind === 'grip' && drag.handle.mode === 'circle');
      if (!typing) return false;
      if (event.key === 'Enter') {
        const typed = Number(drag.typed);
        if (!drag.typed || !Number.isFinite(typed)) return false;
        event.preventDefault();
        let value;
        if (drag.handle.kind === 'grip') value = { radius: Math.max(0.05, Math.abs(typed) / 2) };
        // A typing square (a hole row's end): the value along its direction.
        else if (drag.handle.kind === 'square') value = { along: typed };
        else if (drag.handle.min != null) value = Math.max(drag.handle.min, typed);
        else if (drag.handle.id === 'distance') {
          const sign = typed < 0 ? 1 : drag.value < 0 ? -1 : 1;
          value = clampMagnitude(sign * typed, drag.handle.minAbs || 0.1);
        } else value = typed;
        drag.value = value;
        live = dragView(view, drag.handle.id, value, dragMeta());
        finishDrag(value);
        return true;
      }
      const next = typeKey(drag.typed, event.key);
      if (next == null) return false;
      event.preventDefault();
      drag.typed = next;
      dragHud();
      return true;
    },
    cancelDrag,
    attachTool,
    detachTool,
    toolDown,
    toolChange,
    toolUp,
    // Browser checks: stage, hover snap and where each handle sits (client px).
    state() {
      const r = rect();
      ctx.camera.updateMatrixWorld();
      const v = live || view;
      const spot = (point) => {
        const [x, y] = projectPx(point);
        return [r.left + x, r.top + y];
      };
      return {
        active: Boolean(view),
        tool: view?.tool || null,
        stage: view?.stage || null,
        pick: view?.pick || null,
        cut: Boolean(v?.cut),
        throughAll: Boolean(v?.throughAll),
        snapKind: hover?.snapKind || pathHover?.kind || null,
        hover: hover ? { kind: hover.kind, point: hover.point, instanceId: hover.instanceId || null } : null,
        dragging: drag?.handle.id || (toolDrag ? 'tool' : null),
        value: drag?.value ?? null,
        points: view?.path?.points.length || 0,
        // Hardware (Phase M): how many holes are chosen.
        chosen: v?.place?.chosenCount || 0,
        // A hole row (Phase K): the hovered rubber row in the direction stage, else the shaped one.
        row: rowState(v),
        handles: (v?.handles || []).map((h) => {
          let at = h.at;
          if (h.kind === 'arrow') {
            // The middle of the arrow head: where a drag grabs it.
            const head = ARROW_HEAD_PX * mmPx(h.origin);
            const { tip, sign } = arrowPoints(h, head);
            at = tip.map((c, i) => c + (sign * h.direction[i] * head) / 2);
          }
          const [x, y] = spot(at);
          return {
            id: h.id,
            kind: h.kind,
            value: h.value ?? null,
            x,
            y,
            at,
            ...(h.orthoFrom ? { orthoFrom: h.orthoFrom } : {}),
          };
        }),
        tool3d: ghost ? { pivot: ctx.pivot.position.toArray(), mode: ctx.toolGizmo?.mode } : null,
        // What the overlay draws now (placement-ghost, placement-hover, …).
        layers: [...layer.children.map((c) => c.name), ...(axisLabel.hidden ? [] : ['placement-axis-label'])],
        orbit: ctx.controls.enabled !== false,
      };
    },
    // Screen position (client px) where a world point would be.
    spot(point) {
      const r = rect();
      const [x, y] = projectPx(point);
      return [r.left + x, r.top + y];
    },
    dispose() {
      clearTimeout(pending);
      axisLabel.remove();
      detachTool();
      clear(layer);
      ctx.scene.remove(layer);
    },
  };
  // Handles keep their on-screen size while orbiting and zooming.
  ctx.controls.addEventListener('change', () => {
    if (view?.handles?.length || view?.extras?.length) redraw();
  });
  return api;
}
