// measureCandidates' screen-box prefilter (docs/perf-pass-3.md §5 B1.4):
// the function as it was before the prefilter is kept here as the oracle, and
// random scenes (perspective and orthographic, segments crossing behind the
// eye, hits, marks, extras) must give exactly what it gives.
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { Vector3 } from 'three';
import { MIDPOINT_MIN_PX, SNAP_PX, anchorAt, measureCandidates, mmPerPixelAt } from './marks.js';

const OCCLUSION_PX = 16;
const RANK = { vertex: 0, midpoint: 1, 'face centre': 1.5, mark: 2 };
const DEPTH_EPS = 1e-4;

// The oracle: measureCandidates as of 2026-11-22, before the prefilter.
function oracle({
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

// A seeded generator, so a failure names its case.
function random(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = 640,
  H = 480;
function scene(seed) {
  const rnd = random(seed);
  const span = (lo, hi) => lo + (hi - lo) * rnd();
  const perspective = rnd() < 0.6;
  const camera = perspective
    ? new THREE.PerspectiveCamera(span(25, 60), W / H, 0.1, 1e7)
    : new THREE.OrthographicCamera(-400, 400, 300, -300, 0.1, 1e7);
  if (!perspective) camera.zoom = span(0.5, 3);
  camera.updateProjectionMatrix();
  camera.up.set(0, 0, 1);
  camera.position.set(span(-900, 900), span(-900, 900), span(-300, 900));
  camera.lookAt(span(-100, 100), span(-100, 100), span(-50, 50));
  camera.updateMatrixWorld();
  const projected = new Vector3();
  const project = (v) => {
    projected.copy(v).project(camera);
    return [((projected.x + 1) / 2) * W, ((1 - projected.y) / 2) * H];
  };
  const groups = [];
  for (let g = 0; g < 4; g++) {
    const min = [span(-400, 200), span(-400, 200), span(-200, 100)];
    const max = min.map((v) => v + span(5, 300));
    const positions = [];
    // Box edges, plus loose segments (some long ones that pass the eye).
    for (let s = 0; s < 40; s++) {
      const p = () => [span(min[0], max[0]), span(min[1], max[1]), span(min[2], max[2])];
      positions.push(...p(), ...p());
    }
    for (let s = 0; s < 6; s++)
      positions.push(
        ...camera.position.toArray().map((c) => c + span(-50, 50)),
        span(-500, 500),
        span(-500, 500),
        span(-200, 200),
      );
    const matrix = new THREE.Matrix4().compose(
      new Vector3(span(-50, 50), span(-50, 50), span(-20, 20)),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(span(0, 0.3), span(0, 0.3), span(0, 6.28))),
      new Vector3(1, 1, 1),
    );
    groups.push({
      instanceId: `g${g}`,
      matrix,
      placement: [],
      // A missing box on some, so the group cull passes them all.
      bounds: rnd() < 0.7 ? [min, max] : null,
      visible: rnd() < 0.9,
      positions: rnd() < 0.5 ? Float32Array.from(positions) : positions,
    });
  }
  // Aim near a segment end now and then, so snaps are found as well as missed.
  const pointer =
    rnd() < 0.5
      ? [span(0, W), span(0, H)]
      : (() => {
          const group = groups[Math.floor(rnd() * groups.length)];
          const i = Math.floor(rnd() * (group.positions.length / 3)) * 3;
          const end = new Vector3(group.positions[i], group.positions[i + 1], group.positions[i + 2]).applyMatrix4(
            group.matrix,
          );
          const [x, y] = project(end);
          return [x + span(-12, 12), y + span(-12, 12)];
        })();
  const caster = new THREE.Raycaster();
  caster.setFromCamera(new THREE.Vector2((pointer[0] / W) * 2 - 1, 1 - (pointer[1] / H) * 2), camera);
  const hit = rnd() < 0.4 ? { point: [span(-200, 200), span(-200, 200), span(-50, 50)], instanceId: 'g0' } : null;
  const marks =
    rnd() < 0.5
      ? [{ point: [span(-200, 200), span(-200, 200), 0], anchor: { instanceId: null, local: [0, 0, 0] } }]
      : [];
  const extra =
    rnd() < 0.3 ? [{ point: [span(-200, 200), span(-200, 200), 0], kind: 'face centre', instanceId: 'g1' }] : [];
  return { pointer, groups, marks, ray: caster.ray, camera, project, hit, height: H, extra };
}

describe('measureCandidates with the screen-box prefilter', () => {
  it('gives what the function before it gave, over 3000 random scenes', () => {
    let found = 0;
    for (let seed = 1; seed <= 3000; seed++) {
      const options = scene(seed);
      const expected = oracle(options);
      const actual = measureCandidates(options);
      if (expected) found++;
      expect(actual, `seed ${seed}`).toEqual(expected);
    }
    // The scenes do exercise snaps, not only misses.
    expect(found).toBeGreaterThan(1000);
  });

  it('skips the ray test for segments whose screen box is out of reach', () => {
    const spy = vi.spyOn(THREE.Ray.prototype, 'distanceSqToSegment');
    let before = 0,
      after = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const options = scene(seed);
      spy.mockClear();
      oracle(options);
      before += spy.mock.calls.length;
      spy.mockClear();
      measureCandidates(options);
      after += spy.mock.calls.length;
    }
    spy.mockRestore();
    expect(after).toBeLessThan(before / 2);
  });
});
