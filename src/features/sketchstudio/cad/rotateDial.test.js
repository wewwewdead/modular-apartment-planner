import { describe, expect, it } from 'vitest';
import { Object3D, OrthographicCamera, PerspectiveCamera, Quaternion, Scene, Vector3 } from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import {
  EDGE_ON,
  gizmoRingRadius,
  localToWorldTurn,
  ringBasis,
  ringHandlesOnly,
  startDial,
  worldToLocalTurn,
  worldTurn,
  wrapAngle,
} from './rotateDial.js';
import { instanceAxis, instanceOrientation, rotateInstance, turnInstance } from './movement.js';
import { rotationReadout } from './gizmoHud.js';

const RAD = Math.PI / 180;
const W = 800,
  H = 600;

// An orthographic screen (px, y down) looking along -eye with `up` on top,
// s px per world unit: the camera basis three.js lookAt builds.
function ortho(eye, up, s = 1) {
  const z = new Vector3(...eye).normalize();
  const x = new Vector3(...up).cross(z).normalize();
  const y = z.clone().cross(x);
  const project = (p) => {
    const v = new Vector3(...p);
    return [W / 2 + s * v.dot(x), H / 2 - s * v.dot(y)];
  };
  return { project, eye: z.toArray() };
}
// A pinhole camera at `position` looking at the origin, focal length f px.
function perspective(position, up, f = 900) {
  const c = new Vector3(...position);
  const z = c.clone().normalize();
  const x = new Vector3(...up).cross(z).normalize();
  const y = z.clone().cross(x);
  const project = (p) => {
    const d = new Vector3(...p).sub(c);
    const depth = -d.dot(z);
    return [W / 2 + (f * d.dot(x)) / depth, H / 2 - (f * d.dot(y)) / depth];
  };
  return {
    project,
    eye: (pivot) =>
      c
        .clone()
        .sub(new Vector3(...pivot))
        .normalize()
        .toArray(),
  };
}
const TOP = ortho([0, 0, 1], [0, 1, 0]);
const BOTTOM = ortho([0, 0, -1], [0, 1, 0]);
const ISO = ortho([1, -1, 0.8], [0, 0, 1]);

// World point on the ring (radius r about `axis` through the origin) at
// in-plane angle t from the ring basis u toward v.
function ringPoint(axis, eye, t, r = 100) {
  const { u, v } = ringBasis(axis, eye);
  return u
    .clone()
    .multiplyScalar(r * Math.cos(t))
    .addScaledVector(v, r * Math.sin(t))
    .toArray();
}
const turned = (quaternion, point) => new Vector3(...point).applyQuaternion(new Quaternion(...quaternion)).toArray();
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const dial = (view, axis, grab, extra = {}) =>
  startDial({
    pivot: [0, 0, 0],
    pointer: view.project(grab),
    axis,
    eye: view.eye,
    radius: 100,
    project: view.project,
    ...extra,
  });

describe('rotate dial', () => {
  it('wraps successive angles into (-π, π]', () => {
    expect(wrapAngle(Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(wrapAngle(-Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(wrapAngle(1.5 * Math.PI)).toBeCloseTo(-0.5 * Math.PI, 12);
    expect(wrapAngle(-1.5 * Math.PI)).toBeCloseTo(0.5 * Math.PI, 12);
    expect(wrapAngle(5 * Math.PI)).toBeCloseTo(Math.PI, 12);
  });

  it('follows the cursor around the pivot in all four quadrants (top view, Z ring)', () => {
    const axis = [0, 0, 1];
    for (const grabDeg of [30, 120, 210, 300]) {
      for (const sweep of [40, -40]) {
        // Ring points measured from world +X (counter-clockwise from above).
        const world = (deg) => [100 * Math.cos(deg * RAD), 100 * Math.sin(deg * RAD), 0];
        const d = dial(TOP, axis, world(grabDeg));
        let result;
        for (let t = 5; t <= Math.abs(sweep); t += 5)
          result = d.update(TOP.project(world(grabDeg + Math.sign(sweep) * t)));
        expect(result.mode).toBe('dial');
        expect(result.degrees).toBeCloseTo(sweep, 9);
        // The grabbed point lands under the cursor.
        const cursor = TOP.project(world(grabDeg + sweep));
        expect(dist(TOP.project(turned(result.quaternion, world(grabDeg))), cursor)).toBeLessThan(1e-9);
      }
    }
    // Counter-clockwise on screen, seen from above, is a positive turn about +Z.
    const d = dial(TOP, axis, [100, 0, 0]);
    expect(d.update([W / 2, H / 2 - 100]).degrees).toBeCloseTo(90, 9); // screen up = world +Y
  });

  it('turns the grabbed point toward the cursor whether the axis faces the viewer or not', () => {
    // Same screen motion (counter-clockwise from right to up) against rings
    // whose axis points toward (+Z from the top, facing +1) and away from the
    // viewer (-Z from the top, +Z from the bottom: facing -1).
    const cases = [
      [TOP, [0, 0, 1], 1],
      [TOP, [0, 0, -1], -1],
      [BOTTOM, [0, 0, 1], -1],
      [BOTTOM, [0, 0, -1], 1],
    ];
    const signs = [];
    for (const [view, axis, facing] of cases) {
      const grab = [view.project([100, 0, 0])[0] > W / 2 ? 100 : -100, 0, 0]; // the point at screen right
      const grabPx = view.project(grab);
      const d = dial(view, axis, grab);
      expect(Math.sign(d.facing)).toBe(facing);
      // Cursor 30° counter-clockwise on screen (y down: subtract the sine).
      const cursor = [W / 2 + 100 * Math.cos(30 * RAD), H / 2 - 100 * Math.sin(30 * RAD)];
      const result = d.update(cursor);
      // The expected sign is not assumed: rotate the grab point with the
      // returned quaternion and check that it moved onto the cursor.
      const moved = view.project(turned(result.quaternion, grab));
      expect(dist(moved, cursor)).toBeLessThan(1e-9);
      expect(dist(moved, cursor)).toBeLessThan(dist(grabPx, cursor));
      signs.push(Math.sign(result.degrees));
    }
    // Screen counter-clockwise is positive about an axis toward the viewer
    // and negative about one pointing away.
    expect(signs).toEqual([1, -1, -1, 1]);
  });

  it('tracks oblique rings exactly in an orthographic isometric view', () => {
    for (const axis of [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]) {
      const grab = ringPoint(axis, ISO.eye, -1.1);
      const d = dial(ISO, axis, grab);
      expect(d.mode).toBe('dial');
      let result;
      for (let deg = 10; deg <= 150; deg += 10) {
        const target = turned(new Quaternion().setFromAxisAngle(new Vector3(...axis), deg * RAD).toArray(), grab);
        result = d.update(ISO.project(target));
        expect(result.degrees).toBeCloseTo(deg, 6);
      }
      for (let deg = 140; deg >= -120; deg -= 10) {
        const target = turned(new Quaternion().setFromAxisAngle(new Vector3(...axis), deg * RAD).toArray(), grab);
        result = d.update(ISO.project(target));
      }
      expect(result.degrees).toBeCloseTo(-120, 6);
    }
  });

  it('stays close to the cursor in perspective and keeps the sign', () => {
    const camera = perspective([1500, -1800, 1400], [0, 0, 1]);
    const pivot = [0, 0, 0];
    const eye = camera.eye(pivot);
    for (const axis of [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]) {
      const radius = 200;
      const grab = ringPoint(axis, eye, -0.7, radius);
      const d = startDial({ pivot, pointer: camera.project(grab), axis, eye, radius, project: camera.project });
      let result;
      for (let deg = 10; deg <= 90; deg += 10) {
        const target = turned(new Quaternion().setFromAxisAngle(new Vector3(...axis), deg * RAD).toArray(), grab);
        result = d.update(camera.project(target));
      }
      // The affine fit is a secant at the ring radius: a few degrees at most.
      expect(Math.abs(result.degrees - 90)).toBeLessThan(6);
    }
  });

  it('unwraps past ±180° in both directions', () => {
    const world = (deg) => [100 * Math.cos(deg * RAD), 100 * Math.sin(deg * RAD), 0];
    const axisAngle = (deg) => new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), deg * RAD).toArray();
    let d = dial(TOP, [0, 0, 1], world(0));
    let result;
    for (let t = 10; t <= 540; t += 10) result = d.update(TOP.project(world(t)));
    expect(result.degrees).toBeCloseTo(540, 9);
    // The readout counts with the dial: the turn's angle nearest the sweep.
    expect(rotationReadout(result.quaternion, 'Z', { near: result.snapped }).text).toBe('+540.0° about Z');
    expect(rotationReadout(result.quaternion, 'Z').text).toBe('+180.0° about Z');
    for (const sweep of [-375, -270, 270, 375, 450, 705])
      expect(rotationReadout(axisAngle(sweep), 'Z', { near: sweep }).degrees).toBeCloseTo(sweep, 9);
    d = dial(TOP, [0, 0, 1], world(0));
    for (let t = -10; t >= -540; t -= 10) result = d.update(TOP.project(world(t)));
    expect(result.degrees).toBeCloseTo(-540, 9);
    // Across the ±180° seam: 170° → 190° is +20°, not a jump to -170°.
    d = dial(TOP, [0, 0, 1], world(0));
    for (let t = 10; t <= 170; t += 10) d.update(TOP.project(world(t)));
    expect(d.update(TOP.project(world(190))).degrees).toBeCloseTo(190, 9);
    d = dial(TOP, [0, 0, 1], world(0));
    for (let t = -10; t >= -170; t -= 10) d.update(TOP.project(world(t)));
    expect(d.update(TOP.project(world(-190))).degrees).toBeCloseTo(-190, 9);
    // A full circle back to the start is 360°, a turn that changes nothing.
    d = dial(TOP, [0, 0, 1], world(0));
    for (let t = 10; t <= 360; t += 10) result = d.update(TOP.project(world(t)));
    expect(result.snapped).toBeCloseTo(360, 9);
    expect(Math.abs(result.quaternion[3])).toBeCloseTo(1, 12);
  });

  it('snaps the accumulated angle, and Alt or snap 0 turns freely', () => {
    const world = (deg) => [100 * Math.cos(deg * RAD), 100 * Math.sin(deg * RAD), 0];
    const at = (deg, options) => dial(TOP, [0, 0, 1], world(0)).update(TOP.project(world(deg)), options).snapped;
    expect(at(7, { snap: 15 })).toBe(0);
    expect(at(8, { snap: 15 })).toBeCloseTo(15, 12);
    expect(at(22, { snap: 15 })).toBeCloseTo(15, 12);
    expect(at(23, { snap: 15 })).toBeCloseTo(30, 12);
    expect(at(-8, { snap: 15 })).toBeCloseTo(-15, 12);
    expect(at(-7, { snap: 15 })).toBe(0);
    expect(Object.is(at(-7, { snap: 15 }), -0)).toBe(false);
    expect(at(23, { snap: 15, free: true })).toBeCloseTo(23, 9);
    expect(at(23, { snap: 0 })).toBeCloseTo(23, 9);
    expect(at(46, { snap: 45 })).toBeCloseTo(45, 12);
    // Holding or releasing Alt re-evaluates at the same cursor.
    const d = dial(TOP, [0, 0, 1], world(0));
    expect(d.update(TOP.project(world(37)), { snap: 15 }).snapped).toBeCloseTo(30, 12);
    expect(d.refresh({ snap: 15, free: true }).snapped).toBeCloseTo(37, 9);
    expect(d.refresh({ snap: 15 }).snapped).toBeCloseTo(30, 12);
    const quarter = d.update(TOP.project(world(88)), { snap: 15 });
    expect(quarter.free).toBe(false);
    new Quaternion(...quarter.quaternion)
      .toArray()
      .forEach((v, i) =>
        expect(v).toBeCloseTo(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 90 * RAD).toArray()[i], 12),
      );
  });

  it('maps pointer travel to arc length when the ring is seen edge-on', () => {
    // Top view, X ring: the ring is the vertical screen line through the
    // pivot (axis · eye = 0). Its front point (nearest the viewer) is +Z.
    const axis = [1, 0, 0];
    const d = dial(TOP, axis, [0, 0, 100]);
    expect(d.mode).toBe('edge');
    // u = axis × eye = -Y, which is screen down: the front point moves down
    // under a positive turn. 50 px over a 100 px ring radius = 0.5 rad.
    const cursor = [W / 2, H / 2 + 50];
    const result = d.update(cursor);
    expect(result.degrees).toBeCloseTo(0.5 / RAD, 9);
    const moved = TOP.project(turned(result.quaternion, [0, 0, 100]));
    expect(moved[1]).toBeGreaterThan(H / 2); // toward the cursor
    expect(dist(moved, cursor)).toBeLessThan(dist(TOP.project([0, 0, 100]), cursor));
    // Upward travel turns the other way.
    expect(d.update([W / 2, H / 2 - 50]).degrees).toBeCloseTo(-0.5 / RAD, 9);
    // Zoom-independent: twice the zoom, a ring of half the world radius (the
    // gizmo keeps its screen size), the same pixels give the same angle.
    const zoomed = ortho([0, 0, 1], [0, 1, 0], 2);
    const z = startDial({
      pivot: [0, 0, 0],
      pointer: zoomed.project([0, 0, 50]),
      axis,
      eye: zoomed.eye,
      radius: 50,
      project: zoomed.project,
    });
    expect(z.update([W / 2, H / 2 + 50]).degrees).toBeCloseTo(0.5 / RAD, 9);
    // A grab off the ring's middle still moves with the cursor.
    const off = dial(TOP, axis, [0, -60, 80]);
    const r = off.update([W / 2, TOP.project([0, -60, 80])[1] + 20]);
    expect(r.degrees).toBeGreaterThan(0);
    expect(r.start[1]).toBeCloseTo(-0.6, 9); // start radial at the grab, front half
    expect(r.start[2]).toBeCloseTo(0.8, 9);
  });

  it('switches to the edge-on fallback below the threshold only', () => {
    const tilted = (facing) => ortho([Math.sqrt(1 - facing * facing), 0, facing], [0, 0, 1]);
    for (const [facing, mode] of [
      [0.1, 'edge'],
      [EDGE_ON - 0.01, 'edge'],
      [EDGE_ON + 0.01, 'dial'],
      [0.2, 'dial'],
    ]) {
      const view = tilted(facing);
      expect(dial(view, [0, 0, 1], ringPoint([0, 0, 1], view.eye, -1)).mode).toBe(mode);
    }
  });

  it('holds the angle while the cursor sits on the pivot', () => {
    const world = (deg) => [100 * Math.cos(deg * RAD), 100 * Math.sin(deg * RAD), 0];
    const d = dial(TOP, [0, 0, 1], world(0));
    d.update(TOP.project(world(40)));
    const held = d.update([W / 2, H / 2]);
    expect(held.degrees).toBeCloseTo(40, 9);
    expect(held.quaternion.every(Number.isFinite)).toBe(true);
    expect(d.update([W / 2 + 1, H / 2 + 2]).degrees).toBeCloseTo(40, 9); // inside the dead zone
    expect(d.update(TOP.project(world(60))).degrees).toBeCloseTo(60, 9);
    // A grab on the pivot itself starts from the first usable point.
    const centred = startDial({
      pivot: [0, 0, 0],
      pointer: [W / 2, H / 2],
      axis: [0, 0, 1],
      eye: TOP.eye,
      radius: 100,
      project: TOP.project,
    });
    expect(centred.update(TOP.project(world(90))).degrees).toBe(0);
    expect(centred.update(TOP.project(world(120))).degrees).toBeCloseTo(30, 9);
    // No projection at all (an unlaid-out canvas): no turn, no NaN.
    const flat = startDial({
      pivot: [0, 0, 0],
      pointer: [0, 0],
      axis: [0, 0, 1],
      eye: TOP.eye,
      radius: 100,
      project: () => [0, 0],
    });
    expect(flat.mode).toBe('none');
    expect(flat.update([30, 40]).quaternion).toEqual([0, 0, 0, 1]);
  });
});

describe('local rotation space', () => {
  const instance = { id: 'item', partId: 'part', position: [100, 0, 0], rotation: [0, 0, 90] };
  const model = { parts: [{ id: 'part', features: [] }], instances: [instance], connections: [] };
  const same = (a, b) => expect(Math.abs(new Quaternion(...a).dot(new Quaternion(...b)))).toBeCloseTo(1, 12);
  const axisAngle = (axis, degrees) => new Quaternion().setFromAxisAngle(new Vector3(...axis), degrees * RAD).toArray();

  it('reads the instance axes in world coordinates', () => {
    expect(instanceAxis(instance, 'X')).toEqual([expect.closeTo(0, 12), expect.closeTo(1, 12), 0]);
    expect(instanceAxis(instance, 'Y')).toEqual([expect.closeTo(-1, 12), expect.closeTo(0, 12), 0]);
    expect(instanceAxis(instance, 'Z')).toEqual([0, 0, 1]);
    expect(instanceAxis({ rotation: [90, 0, 0] }, 'Y')).toEqual([0, 0, expect.closeTo(1, 12)]);
  });

  it('turns about local X as a world turn about +Y for rotation [0, 0, 90]', () => {
    const attach = instanceOrientation(instance).toArray();
    // TransformControls in local space post-multiplies the ring's turn.
    const pivot = new Quaternion(...attach).multiply(new Quaternion(...axisAngle([1, 0, 0], 90))).toArray();
    const turn = worldTurn(pivot, attach);
    same(turn, axisAngle([0, 1, 0], 90));
    same(localToWorldTurn(axisAngle([1, 0, 0], 90), attach), turn);
    same(worldToLocalTurn(turn, attach), axisAngle([1, 0, 0], 90));
    // Committing it turns the part about its own X: X stays, local Y → +Z.
    const next = turnInstance(model, 'item', turn, [100, 0, 0]).instances[0];
    instanceAxis(next, 'X').forEach((v, i) => expect(v).toBeCloseTo([0, 1, 0][i], 9));
    instanceAxis(next, 'Y').forEach((v, i) => expect(v).toBeCloseTo([0, 0, 1][i], 9));
    expect(next.position).toEqual([100, 0, 0]);
    // The 90° button in Local turns about the same world axis.
    const bounds = [
      [90, -10, -10],
      [110, 10, 10],
    ];
    const button = rotateInstance(model, 'item', instanceAxis(instance, 'X'), 90, bounds).instances[0];
    button.rotation.forEach((v, i) => expect(v).toBeCloseTo(next.rotation[i], 9));
  });

  it('a world dial turn is untouched by the World attach (identity)', () => {
    const turn = axisAngle([0, 0, 1], 45);
    same(worldTurn(turn, [0, 0, 0, 1]), turn);
    same(localToWorldTurn(turn, [0, 0, 0, 1]), turn);
  });
});

describe('TransformControls rotate gizmo', () => {
  function rig(camera) {
    const scene = new Scene();
    const transform = new TransformControls(camera);
    const target = new Object3D();
    scene.add(target, transform.getHelper(), camera);
    transform.setMode('rotate');
    transform.attach(target);
    return { transform, helper: transform.getHelper() };
  }
  const names = (group) => group.children.map((c) => c.name).sort();

  it('ring radius matches the gizmo handle scale', () => {
    const ortho = new OrthographicCamera(-300, 300, 200, -200, 0.1, 1e5);
    ortho.position.set(0, 0, 1000);
    const persp = new PerspectiveCamera(40, 1.5, 0.1, 1e5);
    persp.position.set(800, -900, 700);
    persp.lookAt(0, 0, 0);
    for (const camera of [ortho, persp])
      for (const size of [0.85, 1]) {
        const { transform, helper } = rig(camera);
        transform.setSize(size);
        helper.updateMatrixWorld(true);
        const ring = transform._gizmo.picker.rotate.children.find((c) => c.name === 'Z');
        // The picker torus has radius 0.5 before scaling.
        expect(gizmoRingRadius(camera, [0, 0, 0], size)).toBeCloseTo(0.5 * ring.scale.x, 9);
      }
  });

  it('keeps only the X/Y/Z rings, so the screen ring can no longer be grabbed', () => {
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    camera.position.set(0, 0, 10);
    const { transform, helper } = rig(camera);
    transform.setSize(1);
    helper.updateMatrixWorld(true);
    // On the screen ring (radius 0.75 · 0.5), clear of the X/Y/Z rings.
    const pointer = { x: 0.375 * Math.SQRT1_2, y: 0.375 * Math.SQRT1_2 };
    transform.pointerHover(pointer);
    expect(transform.axis).toBe('E');
    expect(ringHandlesOnly(transform).sort()).toEqual(['E', 'E', 'XYZE', 'XYZE']);
    expect(names(transform._gizmo.picker.rotate)).toEqual(['X', 'Y', 'Z']);
    expect(names(transform._gizmo.gizmo.rotate)).toEqual(['X', 'Y', 'Z']);
    expect(names(transform._gizmo.helper.rotate)).toEqual(['AXIS']);
    helper.updateMatrixWorld(true);
    transform.pointerHover(pointer);
    expect(transform.axis).toBeNull();
    // A ring is still picked.
    transform.pointerHover({ x: 0.25 * Math.SQRT1_2, y: 0.25 * Math.SQRT1_2 });
    expect(transform.axis).toBe('Z');
    // A stand-in without the gizmo groups (the dom tests' mock) is left alone.
    expect(ringHandlesOnly({ getHelper: () => new Object3D() })).toEqual([]);
    expect(ringHandlesOnly(null)).toEqual([]);
  });
});
