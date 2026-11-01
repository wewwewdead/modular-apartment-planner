// Measure tool and dimension marks in the 3D workstation. A mark joins two
// points, each anchored to the part it was picked on in that part's own frame
// ({ instanceId, local }), so it follows the part through moves, turns and an
// optimistic gizmo drag; instanceId null means a world-fixed point. Pure:
// plain arrays in and out, three.js math inside.
import { MathUtils, Matrix4, Vector3 } from 'three';
import { instanceMatrix, placementMatrix } from './movement.js';
import { MARK_ALONG } from './model.js';

export { MARK_ALONG };
// Screen tolerances (px): snap radius, the depth slack behind a surface, and
// the shortest edge whose midpoint snaps (tessellated arcs are noise).
export const SNAP_PX = 8;
export const OCCLUSION_PX = 16;
export const MIDPOINT_MIN_PX = 24;

const AXIS = { X: 0, Y: 1, Z: 2 };
const UNITS = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const scale = (a, s) => a.map((v) => v * s);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a, eps = 1e-12) => {
  const n = length(a);
  return n > eps ? scale(a, 1 / n) : null;
};
const midpoint = (a, b) => scale(add(a, b), 0.5);

// The live pose of a displayed part: its group matrix (identity, the pending
// placement delta, or delta · start mid-drag) times the pose the kernel meshed
// it at. Part-local → world; its inverse takes a picked world point local.
export function displayedInstanceMatrix(groupMatrix, meshedPlacement = []) {
  return groupMatrix.clone().multiply(placementMatrix(meshedPlacement || []));
}

// Poses as the viewport shows them once the committed model is on screen:
// each meshed instance moved by committed · meshed⁻¹ (CadViewport's
// placementDelta), attached parts where the kernel meshed them. For reading
// mark coordinates outside the viewport (the Marks panel); a drag in
// progress is not included.
export function modelPoses(model, snapshot) {
  const poses = new Map();
  const parameters = snapshot?.parameters || {};
  for (const item of snapshot?.instances || []) {
    const instance = model.instances.find((i) => i.id === item.id);
    const attached = model.connections?.some((c) => c.from === item.id && c.type !== 'weld');
    let matrix = new Matrix4();
    if (instance && item.placement && !attached) {
      try {
        matrix = instanceMatrix(instance, parameters).multiply(placementMatrix(item.placement).invert());
      } catch {
        matrix = new Matrix4();
      }
    }
    poses.set(item.id, { matrix, placement: item.placement, visible: Boolean(instance) && instance.visible !== false });
  }
  return poses;
}

// Anchor a world point to a part pose ({ matrix, placement }), or world-fixed.
export function anchorAt(world, instanceId, pose) {
  if (!instanceId || !pose) return { instanceId: null, local: [...world] };
  const inverse = displayedInstanceMatrix(pose.matrix, pose.placement).invert();
  return { instanceId, local: new Vector3(...world).applyMatrix4(inverse).toArray() };
}

// World position of an anchor through the live poses (Map instanceId →
// { matrix, placement, visible }); null when its part is missing or hidden.
export function anchorWorld(anchor, groups) {
  if (!anchor || !Array.isArray(anchor.local)) return null;
  if (anchor.instanceId == null) return [...anchor.local];
  const pose = groups?.get(anchor.instanceId);
  if (!pose || pose.visible === false) return null;
  return new Vector3(...anchor.local).applyMatrix4(displayedInstanceMatrix(pose.matrix, pose.placement)).toArray();
}

// The measured value: the straight distance, or the distance along one axis.
export function markValue(mark, A, B) {
  const k = AXIS[mark?.along];
  return k == null ? length(sub(B, A)) : Math.abs(B[k] - A[k]);
}

// The dimension drawing: the dimension line A'B' at the mark's offset,
// extension lines from the measured points overshooting it by one tick, and
// 45° ticks at both ends. An axis mark projects B onto the line through A'
// along that axis (the usual projected-dimension look).
export function markGeometry(mark, A, B) {
  const offset = mark.offset || [0, 0, 0];
  const k = AXIS[mark.along];
  const a1 = add(A, offset);
  let b1;
  if (k == null) b1 = add(B, offset);
  else {
    b1 = [...a1];
    b1[k] += B[k] - A[k];
  }
  const tick = Math.max(2, 0.1 * length(offset));
  const extension = (from, to) => {
    const d = unit(sub(to, from), 1e-9);
    return [from, d ? add(to, scale(d, tick)) : [...to]];
  };
  const along = unit(sub(b1, a1), 1e-9) || (k != null ? UNITS[k] : unit(sub(B, A))) || UNITS[0];
  // The side the line stands off to, square to it; any square direction when
  // there is no offset.
  const side =
    unit(sub(offset, scale(along, dot(offset, along))), 1e-9) ||
    unit(cross(UNITS[2], along)) ||
    unit(cross(UNITS[0], along));
  const t = scale(unit(add(along, side)), tick);
  return {
    value: markValue(mark, A, B),
    dimension: [a1, b1],
    extensions: [extension(A, a1), extension(B, b1)],
    ticks: [
      [sub(a1, t), add(a1, t)],
      [sub(b1, t), add(b1, t)],
    ],
    labelAt: midpoint(a1, b1),
  };
}

// Where a new dimension line stands off: away from the measured parts' centre,
// square to the measured direction (the segment, or the axis), at a length
// that reads at the scene's scale.
export function defaultOffset({ A, B, along = 'aligned', centre = null, span = 0 }) {
  const k = AXIS[along];
  const d = k == null ? unit(sub(B, A)) || UNITS[0] : UNITS[k];
  const raw = centre ? sub(midpoint(A, B), centre) : [0, 0, 0];
  let dir = sub(raw, scale(d, dot(raw, d)));
  if (length(dir) < 1e-6) dir = cross(UNITS[2], d);
  if (length(dir) < 1e-6) dir = cross(UNITS[0], d);
  if (length(dir) < 1e-6) dir = [0, 0, 1];
  return scale(unit(dir), Math.max(10, 0.04 * (span || 0)));
}

// Centre of the union of world boxes (each [min, max]), or null.
function boxesCentre(boxes) {
  const valid = boxes.filter((b) => Array.isArray(b) && b.length === 2);
  if (!valid.length) return null;
  const min = [0, 1, 2].map((i) => Math.min(...valid.map((b) => b[0][i])));
  const max = [0, 1, 2].map((i) => Math.max(...valid.map((b) => b[1][i])));
  return midpoint(min, max);
}

// defaultOffset for a mark between two anchors, with `centre` taken from the
// anchored parts' world boxes (poses: Map instanceId → { bounds, visible }),
// or the scene's visible boxes when neither point is on a part.
export function markOffset({ from, to, A, B, along = 'aligned', poses, span = 0 }) {
  const all = [...(poses?.values() || [])];
  const ids = new Set([from?.instanceId, to?.instanceId].filter(Boolean));
  const anchored = [...(poses?.entries() || [])].filter(([id]) => ids.has(id)).map(([, pose]) => pose.bounds);
  const centre = boxesCentre(anchored) || boxesCentre(all.filter((p) => p.visible !== false).map((p) => p.bounds));
  return defaultOffset({ A, B, along, centre, span });
}

export const formatMm = (value) => Number(value.toFixed(2)).toString();

// Snap points of drawn marks (entries { mark, A, B }): both measured points
// and their midpoint, each with the anchor a new point copies. The midpoint
// keeps a part anchor only when both ends are on the same part. `exclude`
// leaves out points that ride on that part (a part never snaps to itself).
export function markSnapPoints(entries, { exclude = null } = {}) {
  const points = [];
  for (const { mark, A, B } of entries) {
    const fromId = mark.from?.instanceId ?? null,
      toId = mark.to?.instanceId ?? null;
    if (!exclude || fromId !== exclude) points.push({ point: A, anchor: mark.from, markId: mark.id, role: 'from' });
    if (!exclude || toId !== exclude) points.push({ point: B, anchor: mark.to, markId: mark.id, role: 'to' });
    if (exclude && (fromId === exclude || toId === exclude)) continue;
    const mid = midpoint(A, B);
    const anchor =
      fromId && fromId === toId
        ? { instanceId: fromId, local: midpoint(mark.from.local, mark.to.local) }
        : { instanceId: null, local: mid };
    points.push({ point: mid, anchor, markId: mark.id, role: 'mid' });
  }
  return points;
}

// World millimetres per screen pixel at a point (canvas `height` px).
export function mmPerPixelAt(camera, point, height) {
  if (!height) return 1;
  const zoom = camera.zoom || 1;
  if (camera.isOrthographicCamera) return (camera.top - camera.bottom) / zoom / height;
  const eye = new Vector3().setFromMatrixPosition(camera.matrixWorld);
  const depth = new Vector3(...point).sub(eye).dot(camera.getWorldDirection(new Vector3()));
  return (2 * Math.max(depth, 1e-6) * Math.tan(MathUtils.degToRad(camera.fov / 2))) / zoom / height;
}

const RANK = { vertex: 0, midpoint: 1, 'face centre': 1.5, mark: 2 };
const DEPTH_EPS = 1e-4;

// The point a Measure click takes. Candidates within snapPx of the pointer:
// edge-segment ends (vertex), midpoints of segments at least 24 px long on
// screen, mark points, then the point of an edge nearest the pick ray, then
// the surface hit. Among the first three the nearest on screen wins; ones
// within 1 px of it go to the one nearest the camera (then vertex > midpoint
// > mark); edge points tie-break the same way. With a surface hit, candidates
// more than occlusionPx (in mm at the hit) behind it are hidden; with none,
// silhouette corners stay pickable.
//   pointer  [x, y] canvas px          project(Vector3) → [x, y] canvas px
//   groups   [{ instanceId, matrix, placement, bounds, visible, positions }]
//            positions: edge LineSegments xyz pairs, world as meshed
//   marks    markSnapPoints(...)       ray  THREE.Ray (world)
//   hit      { point, instanceId } | null   height  canvas height px
//   extra    [{ point, kind, instanceId }]  more point candidates (direct
//            placement's 'face centre', ranked between midpoint and mark)
export function measureCandidates({
  pointer,
  groups = [],
  marks = [],
  ray,
  camera,
  project,
  hit = null,
  height = 0,
  snapPx = SNAP_PX,
  occlusionPx = OCCLUSION_PX,
  extra = [],
}) {
  camera.updateMatrixWorld();
  const eye = new Vector3().setFromMatrixPosition(camera.matrixWorld);
  const forward = camera.getWorldDirection(new Vector3());
  const depthOf = (v) => (v.x - eye.x) * forward.x + (v.y - eye.y) * forward.y + (v.z - eye.z) * forward.z;
  const hitPoint = hit ? new Vector3(...hit.point) : null;
  const limit = hitPoint ? depthOf(hitPoint) + occlusionPx * mmPerPixelAt(camera, hit.point, height) : Infinity;
  const screenDistance = (s) => Math.hypot(s[0] - pointer[0], s[1] - pointer[1]);
  const points = [],
    edges = [];
  // Depth first: a point behind the eye projects to a mirrored spot.
  const visible = (v) => {
    const depth = depthOf(v);
    return depth > 0 && depth <= limit ? depth : null;
  };
  const consider = (v, screen, kind, source) => {
    const depth = visible(v);
    if (depth == null) return;
    const distance = screenDistance(screen);
    if (distance <= snapPx) points.push({ point: v.toArray(), kind, distance, depth, ...source });
  };
  // Groups whose projected world box (grown by snapPx) misses the pointer are
  // skipped; a box reaching behind the eye cannot be culled on screen.
  const near = (group) => {
    if (!group.bounds) return true;
    const [min, max] = group.bounds;
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    const corner = new Vector3();
    for (const x of [min[0], max[0]])
      for (const y of [min[1], max[1]])
        for (const z of [min[2], max[2]]) {
          corner.set(x, y, z).applyMatrix4(group.matrix);
          if (depthOf(corner) <= 0) return true;
          const [sx, sy] = project(corner);
          x0 = Math.min(x0, sx);
          y0 = Math.min(y0, sy);
          x1 = Math.max(x1, sx);
          y1 = Math.max(y1, sy);
        }
    return (
      pointer[0] >= x0 - snapPx && pointer[0] <= x1 + snapPx && pointer[1] >= y0 - snapPx && pointer[1] <= y1 + snapPx
    );
  };
  const a = new Vector3(),
    b = new Vector3(),
    m = new Vector3(),
    onRay = new Vector3(),
    onSegment = new Vector3();
  for (const group of groups) {
    const positions = group.positions;
    if (group.visible === false || !positions?.length || !near(group)) continue;
    const source = { instanceId: group.instanceId, group };
    for (let i = 0; i + 5 < positions.length; i += 6) {
      a.set(positions[i], positions[i + 1], positions[i + 2]).applyMatrix4(group.matrix);
      b.set(positions[i + 3], positions[i + 4], positions[i + 5]).applyMatrix4(group.matrix);
      const sa = project(a),
        sb = project(b);
      consider(a, sa, 'vertex', source);
      consider(b, sb, 'vertex', source);
      if (Math.hypot(sa[0] - sb[0], sa[1] - sb[1]) >= MIDPOINT_MIN_PX) {
        m.addVectors(a, b).multiplyScalar(0.5);
        consider(m, project(m), 'midpoint', source);
      }
      if (ray) {
        ray.distanceSqToSegment(a, b, onRay, onSegment);
        const depth = visible(onSegment);
        if (depth == null) continue;
        const distance = screenDistance(project(onSegment));
        if (distance <= snapPx) edges.push({ point: onSegment.toArray(), kind: 'edge', distance, depth, ...source });
      }
    }
  }
  for (const mark of marks) {
    const v = new Vector3(...mark.point);
    consider(v, project(v), 'mark', { anchor: mark.anchor });
  }
  for (const candidate of extra) {
    const v = new Vector3(...candidate.point);
    consider(v, project(v), candidate.kind, { instanceId: candidate.instanceId ?? null });
  }
  const poseOf = (id) => groups.find((g) => g.instanceId === id);
  const anchored = (candidate) => ({
    point: candidate.point,
    kind: candidate.kind,
    anchor: candidate.anchor || anchorAt(candidate.point, candidate.instanceId, poseOf(candidate.instanceId)),
  });
  // Nearest on screen; within 1 px of that, nearest the camera; then by kind.
  const choose = (list) => {
    const nearest = Math.min(...list.map((p) => p.distance));
    const close = list.filter((p) => p.distance <= nearest + 1);
    const front = Math.min(...close.map((p) => p.depth));
    return close
      .filter((p) => p.depth <= front + DEPTH_EPS)
      .sort((p, q) => (RANK[p.kind] ?? 3) - (RANK[q.kind] ?? 3) || p.distance - q.distance)[0];
  };
  if (points.length) return anchored(choose(points));
  if (edges.length) return anchored(choose(edges));
  if (hit) return anchored({ point: [...hit.point], kind: 'face', instanceId: hit.instanceId });
  return null;
}
