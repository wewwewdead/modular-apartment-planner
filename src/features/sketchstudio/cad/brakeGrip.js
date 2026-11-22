// The press brake's grip (docs/sketch-studio-brake-hands-on.md §5.2): two
// handles drawn on the sheet (three since the sheet slides by hand, docs/
// sketch-studio-sheet-slide.md §6.1: Slide sheet, a straight arrow with a head
// at each end lying along the bed beside them), at a constant size on screen, where the
// operator's hands would be. Flip sheet is an open hoop with an arrowhead at
// each end, standing over the front edge about the axis the flip turns on;
// Turn sheet around is a flat ring with one arrowhead, lying just over the
// sheet about the vertical. THREE objects only: the shop layer (shopLayer.js)
// hosts them, poses them each render and asks which one is under the
// pointer; the rules live in brakeHands.js.
//
// Each handle is built in screen pixels about its own Z (the axis it turns
// about) and placed by one matrix: the anchor, the axis, and mm per pixel at
// the anchor as its scale. Meshes, not 1 px GL lines, drawn over the scene
// (no depth test) on a pale casing so they read on the sheet, the die and the
// background alike; quiet (GRIP_REST) until the pointer nears.
import * as THREE from 'three';
import { AXIS_COLORS } from './gizmoHud.js';

// Starting sizes (§5.2), judged on the screenshots: the ring's radius and its stroke, px.
export const GRIP_RADIUS_PX = 34;
export const GRIP_STROKE_PX = 3;
// The pick reaches this far either side of the drawn arc (24 px across, §4.10).
export const GRIP_PICK_PX = 12;
// Strength at rest and on approach (§4.4).
export const GRIP_REST = 0.6;
const CASING = '#ffffff';
const CASING_PX = 2.6;
const ARROW = Object.freeze({ length: 11, radius: 5.5 });
const RENDER_ORDER = 41;
// The two stand on one centre, as Rotate part's rings do: the hoop leaves a
// gap where it would pass through the sheet and the die (its foot), the ring
// one toward the operator, its arrowhead pointing across it (seen side on
// from the station's view, never end on); the ring lies a pixel over the
// sheet and a little wider, so the two read apart where they cross.
const HOOP = Object.freeze({ from: -40, to: 220, lift: 0 });
const RING = Object.freeze({ from: 310, to: 610, scale: 1.15 });
const SAMPLES = 40;
// Slide sheet (sheet slide §6.1): the arrow's half length, px, and how far from the rings' centre
// along the bed its middle stands (clear of the ring), toward the operator a little.
const SLIDE = Object.freeze({ half: 30, along: 80, front: -10 });

class LineCurve extends THREE.Curve {
  constructor(half) {
    super();
    this.half = half;
  }
  getPoint(t, target = new THREE.Vector3()) {
    return target.set(-this.half + 2 * this.half * t, 0, 0);
  }
}
// An arrowhead at the arrow's end x (px), pointing along ±X.
function lineArrowGeometry(x, sign, scale = 1) {
  const cone = new THREE.ConeGeometry(ARROW.radius * scale, ARROW.length * scale, 18);
  cone.translate(0, (ARROW.length * scale) / 2, 0);
  cone.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(sign, 0, 0)),
  );
  cone.translate(x, 0, 0);
  return cone;
}

class ArcCurve extends THREE.Curve {
  constructor(radius, from, to) {
    super();
    Object.assign(this, { radius, from: (from * Math.PI) / 180, to: (to * Math.PI) / 180 });
  }
  getPoint(t, target = new THREE.Vector3()) {
    const a = this.from + (this.to - this.from) * t;
    return target.set(Math.cos(a) * this.radius, Math.sin(a) * this.radius, 0);
  }
}

// An arrowhead at the arc's end `at` (degrees), pointing along the arc (`sign`: +1 the way θ grows).
function arrowGeometry(radius, at, sign, scale = 1) {
  const a = (at * Math.PI) / 180;
  const cone = new THREE.ConeGeometry(ARROW.radius * scale, ARROW.length * scale, 18);
  // The cone points along +Y with its middle at the origin: its base on the arc's end.
  cone.translate(0, (ARROW.length * scale) / 2, 0);
  const tangent = new THREE.Vector3(-Math.sin(a) * sign, Math.cos(a) * sign, 0);
  cone.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent));
  cone.translate(Math.cos(a) * radius, Math.sin(a) * radius, 0);
  return cone;
}

function buildHandle(kind) {
  if (kind === 'slide') return buildSlide();
  const shape = kind === 'flip' ? HOOP : RING;
  const radius = GRIP_RADIUS_PX * (shape.scale || 1);
  const ends =
    kind === 'flip'
      ? [
          [shape.from, -1],
          [shape.to, 1],
        ]
      : [[shape.to, 1]];
  const group = new THREE.Group();
  group.name = `press-brake-grip-${kind}`;
  group.matrixAutoUpdate = false;
  const stroke = new THREE.MeshBasicMaterial({
    color: AXIS_COLORS.Y,
    transparent: true,
    opacity: GRIP_REST,
    depthTest: false,
    depthWrite: false,
  });
  const casing = new THREE.MeshBasicMaterial({
    color: CASING,
    transparent: true,
    opacity: GRIP_REST * 0.85,
    depthTest: false,
    depthWrite: false,
  });
  const curve = new ArcCurve(radius, shape.from, shape.to);
  const parts = [
    [new THREE.TubeGeometry(curve, 64, CASING_PX, 8, false), casing, RENDER_ORDER],
    [new THREE.TubeGeometry(curve, 64, GRIP_STROKE_PX / 2, 8, false), stroke, RENDER_ORDER + 1],
    ...ends.flatMap(([at, sign]) => [
      [arrowGeometry(radius, at, sign, 1.35), casing, RENDER_ORDER],
      [arrowGeometry(radius, at, sign), stroke, RENDER_ORDER + 1],
    ]),
  ];
  for (const [geometry, material, order] of parts) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = order;
    mesh.frustumCulled = false;
    // Picked in screen space (brakeHands.js polylineDistance), never by a ray.
    mesh.raycast = () => {};
    group.add(mesh);
  }
  // The arc's centre line in handle pixels, for the pick and the chip.
  const samples = Array.from({ length: SAMPLES + 1 }, (_, i) => curve.getPoint(i / SAMPLES));
  return { kind, group, stroke, casing, samples, radius, lift: shape.lift || 0 };
}

// Slide sheet (sheet slide §6.1): the same stroke, casing and rest strength as the rings.
function buildSlide() {
  const group = new THREE.Group();
  group.name = 'press-brake-grip-slide';
  group.matrixAutoUpdate = false;
  const material = (color, opacity) =>
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false });
  const stroke = material(AXIS_COLORS.X, GRIP_REST),
    casing = material(CASING, GRIP_REST * 0.85);
  const curve = new LineCurve(SLIDE.half);
  const parts = [
    [new THREE.TubeGeometry(curve, 8, CASING_PX, 8, false), casing, RENDER_ORDER],
    [new THREE.TubeGeometry(curve, 8, GRIP_STROKE_PX / 2, 8, false), stroke, RENDER_ORDER + 1],
    ...[-1, 1].flatMap((sign) => [
      [lineArrowGeometry(sign * SLIDE.half, sign, 1.35), casing, RENDER_ORDER],
      [lineArrowGeometry(sign * SLIDE.half, sign), stroke, RENDER_ORDER + 1],
    ]),
  ];
  for (const [geometry, mat, order] of parts) {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.renderOrder = order;
    mesh.frustumCulled = false;
    mesh.raycast = () => {};
    group.add(mesh);
  }
  const samples = Array.from({ length: SAMPLES + 1 }, (_, i) =>
    curve.getPoint(i / SAMPLES).multiplyScalar((SLIDE.half + ARROW.length) / SLIDE.half),
  );
  return { kind: 'slide', group, stroke, casing, samples, radius: SLIDE.half, lift: 0 };
}

/**
 * The grip's objects: `group` (add it to the station's root, machine
 * frame), `place(kind, { anchor, axis, up, scale })` (the handle about
 * `axis` at the anchor, its local up `up` ⟂ axis, `scale` mm per px),
 * `show(kind, shown)`, `colour(kind, axisName)`, `hot(kind | null)`,
 * `arc(kind)` (the arc's centre line, machine mm), `centre(kind)`.
 */
export function createBrakeGrip() {
  const group = new THREE.Group();
  group.name = 'press-brake-grip';
  // Built on first use (a station set up), never with the viewport itself.
  const handles = {};
  const handleOf = (kind) => {
    if (!handles[kind]) {
      handles[kind] = buildHandle(kind);
      handles[kind].group.visible = false;
      group.add(handles[kind].group);
      strength(handles[kind]);
    }
    return handles[kind];
  };
  const basis = new THREE.Matrix4();
  const x = new THREE.Vector3(),
    y = new THREE.Vector3(),
    z = new THREE.Vector3();
  let hot = null;
  const strength = (handle) => {
    const on = hot === handle.kind;
    handle.stroke.opacity = on ? 1 : GRIP_REST;
    handle.casing.opacity = on ? 0.95 : GRIP_REST * 0.85;
  };
  return {
    group,
    place(kind, { anchor, axis, up, scale }) {
      const handle = handleOf(kind);
      z.set(...axis).normalize();
      y.set(...up);
      y.addScaledVector(z, -y.dot(z));
      if (y.lengthSq() < 1e-12) y.set(0, 0, 1).addScaledVector(z, -z.z);
      if (y.lengthSq() < 1e-12) y.set(0, 1, 0);
      y.normalize();
      x.crossVectors(y, z);
      basis.makeBasis(
        x.clone().multiplyScalar(scale),
        y.clone().multiplyScalar(scale),
        z.clone().multiplyScalar(scale),
      );
      // The hoop stands above its anchor, the ring lies a pixel over the sheet; the arrow
      // beside them along the bed (its local X), a little toward the operator, a pixel over the sheet.
      if (kind === 'slide') {
        const at = [0, 1, 2].map(
          (i) =>
            anchor[i] + (x.getComponent(i) * SLIDE.along + y.getComponent(i) * SLIDE.front + z.getComponent(i)) * scale,
        );
        basis.setPosition(at[0], at[1], at[2]);
      } else {
        const lift = kind === 'flip' ? handle.radius * handle.lift * scale : scale;
        const along = kind === 'flip' ? y : z;
        basis.setPosition(anchor[0] + along.x * lift, anchor[1] + along.y * lift, anchor[2] + along.z * lift);
      }
      handle.group.matrix.copy(basis);
      handle.group.matrixWorldNeedsUpdate = true;
    },
    show(kind, shown) {
      if (shown || handles[kind]) handleOf(kind).group.visible = Boolean(shown);
    },
    shown: (kind) => Boolean(handles[kind]?.group.visible),
    colour(kind, axisName) {
      handleOf(kind).stroke.color.set(AXIS_COLORS[axisName] || AXIS_COLORS.Z);
    },
    hot(kind) {
      hot = kind || null;
      for (const handle of Object.values(handles)) strength(handle);
    },
    hotKind: () => hot,
    /** The arc's centre line in the station's frame (machine mm, the root's local frame). */
    arc(kind) {
      const handle = handleOf(kind);
      return handle.samples.map((p) => p.clone().applyMatrix4(handle.group.matrix));
    },
    /** The handle's centre and axis in the station's frame. */
    centre(kind) {
      return new THREE.Vector3().setFromMatrixPosition(handleOf(kind).group.matrix);
    },
    /** The ring's radius in the station's frame (mm), at the scale last placed. */
    radius(kind) {
      const handle = handleOf(kind);
      return handle.radius * new THREE.Vector3().setFromMatrixColumn(handle.group.matrix, 0).length();
    },
    dispose() {
      for (const handle of Object.values(handles)) {
        handle.group.traverse((o) => o.geometry?.dispose());
        handle.stroke.dispose();
        handle.casing.dispose();
      }
      group.removeFromParent();
    },
  };
}
