import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { COLLISION_INDEX_CONSTANTS, createCollisionIndex } from './previewCollisionIndex';

function box(x, y, z, size = 400) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size));
  mesh.position.set(x, y, z);
  return mesh;
}

/** What the physics used to do: every hit, filtered for collidability. */
function legacyNearest(raycaster, sources) {
  const hits = raycaster.intersectObjects(sources, true, []);
  for (const hit of hits) {
    const object = hit.object;
    if (!object.isMesh) continue;
    if (object.userData?.previewTarget?.kind === 'door') continue;
    let hidden = false;
    for (let node = object; node; node = node.parent) {
      if (node.visible === false) hidden = true;
    }
    if (hidden) continue;
    return hit;
  }
  return null;
}

describe('createCollisionIndex', () => {
  it('collects only visible, non-door meshes', () => {
    const root = new THREE.Group();
    root.add(box(0, 0, 0));

    const door = box(1000, 0, 0);
    door.userData.previewTarget = { kind: 'door' };
    root.add(door);

    const hiddenFloor = new THREE.Group();
    hiddenFloor.visible = false;
    hiddenFloor.add(box(2000, 0, 0));
    hiddenFloor.add(box(2500, 0, 0));
    root.add(hiddenFloor);

    root.add(new THREE.LineSegments(new THREE.BoxGeometry(100, 100, 100)));

    const index = createCollisionIndex();
    index.sync([root]);

    expect(index.getStats().meshes).toBe(1);
  });

  it('finds the same nearest hit as a full-graph raycast, hierarchy or not', () => {
    // Either side of the hierarchy threshold, so both traversals are covered.
    for (const count of [COLLISION_INDEX_CONSTANTS.BVH_MIN_MESHES - 4, COLLISION_INDEX_CONSTANTS.BVH_MIN_MESHES * 4]) {
      const root = new THREE.Group();
      for (let i = 0; i < count; i += 1) {
        // A deterministic scatter — a fixed lattice would let a ray miss
        // everything or hit a whole row at once.
        const x = ((i * 977) % 5000) - 2500;
        const y = ((i * 613) % 3000) - 1500;
        const z = ((i * 419) % 5000) - 2500;
        root.add(box(x, y, z, 300));
      }
      root.updateMatrixWorld(true);

      const index = createCollisionIndex();
      index.sync([root]);
      expect(index.getStats().meshes).toBe(count);

      const raycaster = new THREE.Raycaster();
      raycaster.near = 0;

      for (let i = 0; i < 120; i += 1) {
        const angle = (i / 120) * Math.PI * 2;
        const origin = new THREE.Vector3(((i * 131) % 4000) - 2000, ((i * 271) % 2000) - 1000, -6000);
        const direction = new THREE.Vector3(Math.cos(angle) * 0.4, Math.sin(angle) * 0.2, 1).normalize();
        const far = 1000 + ((i * 337) % 9000);

        raycaster.set(origin, direction);
        raycaster.far = far;
        const expected = legacyNearest(raycaster, [root]);

        raycaster.set(origin, direction);
        raycaster.far = far;
        const actual = index.raycastNearest(raycaster);

        expect(Boolean(actual)).toBe(Boolean(expected));
        if (expected) {
          expect(actual.object).toBe(expected.object);
          expect(actual.distance).toBeCloseTo(expected.distance, 6);
        }
      }
    }
  });

  it('leaves the raycaster reach as it found it', () => {
    const root = new THREE.Group();
    root.add(box(0, 0, 1000));
    root.updateMatrixWorld(true);

    const index = createCollisionIndex();
    index.sync([root]);

    const raycaster = new THREE.Raycaster();
    raycaster.set(new THREE.Vector3(0, 0, -2000), new THREE.Vector3(0, 0, 1));
    raycaster.far = 9000;
    expect(index.raycastNearest(raycaster)).toBeTruthy();
    expect(raycaster.far).toBe(9000);
  });

  it('rebuilds when the source root is swapped', () => {
    const first = new THREE.Group();
    first.add(box(0, 0, 0));
    const second = new THREE.Group();
    second.add(box(0, 0, 0));
    second.add(box(500, 0, 0));

    const index = createCollisionIndex();
    index.sync([first]);
    expect(index.getStats().meshes).toBe(1);

    index.sync([second]);
    expect(index.getStats().meshes).toBe(2);
  });

  it('rebuilds when a floor group inside the same root is replaced', () => {
    // The scene cache's contract: the root object is reused, and only the floor
    // groups under it are swapped out.
    const root = new THREE.Group();
    const floor = new THREE.Group();
    floor.add(box(0, 0, 0));
    root.add(floor);

    const index = createCollisionIndex();
    index.sync([root]);
    expect(index.getStats().builds).toBe(1);
    expect(index.getStats().meshes).toBe(1);

    index.sync([root]);
    expect(index.getStats().builds).toBe(1);

    const rebuilt = new THREE.Group();
    rebuilt.add(box(0, 0, 0));
    rebuilt.add(box(0, 0, 900));
    root.clear();
    root.add(rebuilt);

    index.sync([root]);
    expect(index.getStats().builds).toBe(2);
    expect(index.getStats().meshes).toBe(2);
  });

  it('rebuilds when a floor group is hidden in place', () => {
    const root = new THREE.Group();
    const upper = new THREE.Group();
    upper.add(box(0, 3000, 0));
    const lower = new THREE.Group();
    lower.add(box(0, 0, 0));
    root.add(upper);
    root.add(lower);

    const index = createCollisionIndex();
    index.sync([root]);
    expect(index.getStats().meshes).toBe(2);

    upper.visible = false;
    index.sync([root]);
    expect(index.getStats().meshes).toBe(1);
  });

  it('invalidate forces a rebuild and releases what it held', () => {
    const root = new THREE.Group();
    root.add(box(0, 0, 0));

    const index = createCollisionIndex();
    index.sync([root]);
    index.invalidate();
    expect(index.getStats().meshes).toBe(0);

    index.sync([root]);
    expect(index.getStats().meshes).toBe(1);
    expect(index.getStats().builds).toBe(2);
  });
});
