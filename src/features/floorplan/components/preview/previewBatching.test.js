import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildFloorObjectGroup, buildSelectionOverlay, readAssemblyPart } from './buildPreviewObjects';
import { SOURCE_ONLY_LAYER } from './previewBatching';
import { createCollisionIndex } from './previewCollisionIndex';
import { createPreviewSceneCache } from './previewSceneCache';
import { createMaterialPalette } from './materials';
import { buildPreviewScene } from '@/three/scene/buildPreviewScene';
import { deserializeProject } from '@/persistence/deserialize';
import { createProject, createWall } from '@/domain/models';
import { WALL_ASSEMBLY_PRESETS } from '@/domain/wallAssemblies';
import { createWallDetailing } from '@/domain/wallDetailing';
import { CEILING_BOUNDARY_SOURCES, createCeiling } from '@/domain/ceilingModels';
import { createWallDetailPreviewProject } from '@/features/floorplan/components/wall-detail/wallDetailPreviewProject';
import { createCeilingDetailPreviewProject } from '@/features/floorplan/components/ceiling-detail/ceilingDetailPreviewProject';
import demoData from '@/pages/playground-demo.json';

/**
 * These run against real THREE rather than the stub the other preview tests use.
 * Batching is a claim about matrices and world positions, and a mock that
 * answers "yes" to `multiplyMatrices` would prove nothing.
 */

function boxDescriptor(id, overrides = {}) {
  return {
    id,
    kind: 'wall',
    geometry: 'box',
    materialKey: 'wall',
    metadata: { sourceId: id },
    center: { x: 0, y: 0 },
    size: { x: 2000, y: 3000, z: 150 },
    rotation: 0,
    baseElevation: 0,
    ...overrides,
  };
}

function floorDescriptor(objects, floorId = 'f1') {
  return { floorId, name: floorId, elevation: 0, visible: true, objects };
}

function worldBoxOf(mesh) {
  const box = new THREE.Box3();
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  box.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
  return box;
}

/**
 * The bucket a mesh or a batch belongs to.
 *
 * Mirrors the key `buildFloorBatchGroup` groups by, which is what lets the
 * comparison below pair instance `n` of a batch with the `n`th mesh that went
 * into it — rather than sorting two lists of boxes and hoping, which on a floor
 * of identical truss members is exactly as reliable as it sounds.
 */
function bucketKeyOfMesh(mesh) {
  const unit = mesh.geometry.userData.batchUnit;
  return `${unit.key}|${mesh.material.uuid}|${mesh.castShadow ? 1 : 0}|${mesh.receiveShadow ? 1 : 0}`;
}

function bucketKeyOfBatch(batch) {
  return `${batch.userData.unitKey}|${batch.material.uuid}|${batch.castShadow ? 1 : 0}|${batch.receiveShadow ? 1 : 0}`;
}

/** Every instance of every batch, as a world box, keyed by bucket. */
function batchInstanceBoxesByBucket(batchGroup) {
  batchGroup.updateMatrixWorld(true);
  const byBucket = new Map();
  const matrix = new THREE.Matrix4();
  const instance = new THREE.Matrix4();
  batchGroup.traverse((node) => {
    if (!node.isInstancedMesh) return;
    if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
    const boxes = [];
    for (let index = 0; index < node.count; index += 1) {
      node.getMatrixAt(index, instance);
      matrix.multiplyMatrices(node.matrixWorld, instance);
      boxes.push(new THREE.Box3().copy(node.geometry.boundingBox).applyMatrix4(matrix));
    }
    byBucket.set(bucketKeyOfBatch(node), boxes);
  });
  return byBucket;
}

/** Every instance of every batch, as a world box. */
function batchInstanceBoxes(batchGroup) {
  return [...batchInstanceBoxesByBucket(batchGroup).values()].flat();
}

/** Whether the batcher moved this node off the layer the camera looks at. */
function isFolded(node) {
  return node.layers.isEnabled(SOURCE_ONLY_LAYER) && !node.layers.isEnabled(0);
}

/** The meshes the batcher took out of the render list, as world boxes. */
function foldedSourceBoxesByBucket(floorGroup) {
  floorGroup.updateMatrixWorld(true);
  const byBucket = new Map();
  floorGroup.traverse((node) => {
    if (!node.isMesh || node.isInstancedMesh) return;
    if (!isFolded(node)) return;
    const key = bucketKeyOfMesh(node);
    if (!byBucket.has(key)) byBucket.set(key, []);
    byBucket.get(key).push(worldBoxOf(node));
  });
  return byBucket;
}

function foldedSourceBoxes(floorGroup) {
  return [...foldedSourceBoxesByBucket(floorGroup).values()].flat();
}

/** What `pickObjectAt` does, minus the DOM: hit the world, resolve, dedup. */
function pickTargets(root, origin, direction) {
  const raycaster = new THREE.Raycaster();
  raycaster.layers.enable(SOURCE_ONLY_LAYER);
  raycaster.near = 0;
  raycaster.far = 1e6;
  raycaster.set(origin, direction);
  root.updateMatrixWorld(true);

  const seen = new Set();
  const targets = [];
  for (const hit of raycaster.intersectObject(root, true)) {
    let target = null;
    for (let node = hit.object; node; node = node.parent) {
      if (node.userData?.previewTarget) {
        target = node.userData.previewTarget;
        break;
      }
    }
    if (!target) continue;
    const part = target.part ? `${target.part.side || ''}:${target.part.kind}:${target.part.id}` : '';
    const key = `${target.floorId || ''}:${target.kind}:${target.sourceId}:${part}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push(key);
  }
  return targets;
}

function playgroundScene(options = {}) {
  const { project } = deserializeProject(demoData);
  return buildPreviewScene(project, options);
}

describe('preview batching — transform parity', () => {
  it('puts every instance exactly where the mesh it replaced stands', () => {
    const palette = createMaterialPalette();
    const scene = playgroundScene();
    let compared = 0;

    for (const floor of scene.floors) {
      const { floorGroup, batchGroup } = buildFloorObjectGroup(floor, palette, null, { batch: true });
      if (!batchGroup) continue;

      const folded = foldedSourceBoxesByBucket(floorGroup);
      const instances = batchInstanceBoxesByBucket(batchGroup);

      expect([...instances.keys()].sort()).toEqual([...folded.keys()].sort());
      for (const [key, sourceBoxes] of folded) {
        const instanceBoxes = instances.get(key);
        expect(instanceBoxes).toHaveLength(sourceBoxes.length);
        sourceBoxes.forEach((source, index) => {
          // A micron, on a model measured in millimetres. The two paths differ
          // only in whether a member's size is quantised into its vertices
          // (`BoxGeometry(w, h, d)` in float32) or into its instance matrix, so
          // what is left is one float32 rounding either way — about 1e-8 of the
          // coordinate. Anything above this is a real displacement.
          expect(instanceBoxes[index].min.distanceTo(source.min)).toBeLessThan(1e-3);
          expect(instanceBoxes[index].max.distanceTo(source.max)).toBeLessThan(1e-3);
          compared += 1;
        });
      }
    }

    expect(compared).toBeGreaterThan(400);
  });

  it('covers every descriptor family the playground draws', () => {
    const palette = createMaterialPalette();
    const scene = playgroundScene();
    const kinds = new Set();
    for (const floor of scene.floors) {
      const { batchGroup } = buildFloorObjectGroup(floor, palette, null, { batch: true });
      if (!batchGroup) continue;
      floor.objects.forEach((descriptor) => kinds.add(descriptor.geometry || 'box'));
    }
    // The two that carry the model's bulk, plus the grouped builders.
    expect(kinds.has('box')).toBe(true);
    expect(kinds.has('segment3d')).toBe(true);
    expect(kinds.has('fixture')).toBe(true);
    expect(kinds.has('window')).toBe(true);
  });

  it('keeps a rotated member rotated', () => {
    const palette = createMaterialPalette();
    const rotated = boxDescriptor('w1', { rotation: Math.PI / 6, center: { x: 1200, y: -700 }, baseElevation: 250 });
    const { floorGroup, batchGroup } = buildFloorObjectGroup(floorDescriptor([rotated]), palette, null, {
      batch: true,
    });

    const source = foldedSourceBoxes(floorGroup);
    const instances = batchInstanceBoxes(batchGroup);
    expect(instances).toHaveLength(1);
    expect(instances[0].min.distanceTo(source[0].min)).toBeLessThan(1e-3);
    expect(instances[0].max.distanceTo(source[0].max)).toBeLessThan(1e-3);
  });

  it('draws the same number of triangles it folded', () => {
    const palette = createMaterialPalette();
    const scene = playgroundScene();

    let foldedTriangles = 0;
    let batchedTriangles = 0;

    for (const floor of scene.floors) {
      const { floorGroup, batchGroup } = buildFloorObjectGroup(floor, palette, null, { batch: true });
      if (!batchGroup) continue;
      floorGroup.traverse((node) => {
        if (!node.isMesh || !isFolded(node)) return;
        foldedTriangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3;
      });
      batchGroup.traverse((node) => {
        if (!node.isInstancedMesh) return;
        batchedTriangles += ((node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3) * node.count;
      });
    }

    expect(foldedTriangles).toBeGreaterThan(0);
    expect(batchedTriangles).toBe(foldedTriangles);
  });
});

describe('preview batching — picking', () => {
  it('resolves the same targets, in the same order, as an unbatched world', () => {
    const palette = createMaterialPalette();
    const scene = playgroundScene();

    const plain = new THREE.Group();
    const batched = new THREE.Group();
    for (const floor of scene.floors) {
      plain.add(buildFloorObjectGroup(floor, palette, null).floorGroup);
      batched.add(buildFloorObjectGroup(floor, palette, null, { batch: true }).floorGroup);
    }

    let compared = 0;
    for (let index = 0; index < 200; index += 1) {
      // A deterministic fan through the model from above and from the side.
      const angle = (index / 200) * Math.PI * 2;
      const origin = new THREE.Vector3(
        2000 + Math.cos(angle) * 14000,
        1200 + (index % 7) * 400,
        4000 + Math.sin(angle) * 14000,
      );
      const direction = new THREE.Vector3(2000 - origin.x, 1500 - origin.y, 4000 - origin.z).normalize();

      const expected = pickTargets(plain, origin, direction);
      const actual = pickTargets(batched, origin, direction);
      expect(actual).toEqual(expected);
      if (expected.length) compared += 1;
    }
    expect(compared).toBeGreaterThan(50);
  });

  it('never puts a batch where a click could find one', () => {
    const cache = createPreviewSceneCache();
    const { root, batchRoot } = cache.build(playgroundScene(), createMaterialPalette());

    let batchesInWorld = 0;
    root.traverse((node) => {
      if (node.isInstancedMesh || node.isBatchedMesh || node.userData?.previewBatch) batchesInWorld += 1;
    });
    let batchesInBatchRoot = 0;
    batchRoot.traverse((node) => {
      if (node.isInstancedMesh) batchesInBatchRoot += 1;
    });

    expect(batchesInWorld).toBe(0);
    expect(batchesInBatchRoot).toBeGreaterThan(0);
    cache.dispose();
  });
});

describe('preview batching — walking', () => {
  it('indexes exactly the meshes it indexed before batching', () => {
    const palette = createMaterialPalette();
    const scene = playgroundScene();

    const plain = new THREE.Group();
    const batched = new THREE.Group();
    for (const floor of scene.floors) {
      plain.add(buildFloorObjectGroup(floor, palette, null).floorGroup);
      batched.add(buildFloorObjectGroup(floor, palette, null, { batch: true }).floorGroup);
    }

    const plainIndex = createCollisionIndex();
    const batchedIndex = createCollisionIndex();
    plainIndex.sync([plain]);
    batchedIndex.sync([batched]);

    expect(batchedIndex.getStats().meshes).toBe(plainIndex.getStats().meshes);
    expect(plainIndex.getStats().meshes).toBeGreaterThan(100);

    for (let index = 0; index < 150; index += 1) {
      const angle = (index / 150) * Math.PI * 2;
      const origin = new THREE.Vector3(1000 + ((index * 331) % 6000), 1500, 3000 + ((index * 517) % 6000));
      const direction = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));

      const raycaster = new THREE.Raycaster();
      raycaster.near = 0;
      raycaster.set(origin, direction);
      raycaster.far = 8000;
      const expected = plainIndex.raycastNearest(raycaster);

      raycaster.set(origin, direction);
      raycaster.far = 8000;
      const actual = batchedIndex.raycastNearest(raycaster);

      expect(Boolean(actual)).toBe(Boolean(expected));
      if (expected) expect(actual.distance).toBeCloseTo(expected.distance, 6);
    }
  });

  it('gives a rotated wall the slide normal it really has', () => {
    const palette = createMaterialPalette();
    const angle = Math.PI / 6;
    // A wall running along the plan's rotated X axis, so its faces point at
    // ±(sin, 0, cos) of the world rotation — nothing like the unit box's own.
    const wall = boxDescriptor('w1', { rotation: angle, center: { x: 0, y: 0 }, size: { x: 6000, y: 3000, z: 200 } });
    const { floorGroup } = buildFloorObjectGroup(floorDescriptor([wall]), palette, null, { batch: true });

    const root = new THREE.Group();
    root.add(floorGroup);
    const index = createCollisionIndex();
    index.sync([root]);

    const raycaster = new THREE.Raycaster();
    raycaster.near = 0;
    raycaster.set(new THREE.Vector3(0, 1500, 3000), new THREE.Vector3(0, 0, -1));
    raycaster.far = 8000;
    const hit = index.raycastNearest(raycaster);

    expect(hit).toBeTruthy();
    // Exactly what `advanceBudget` does with it.
    const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    // The plan angle turns into a world rotation of -angle about Y, so the face
    // normal of the +z side is (sin(-angle)... ) — read off the geometry rather
    // than restated, because the point is that the instance transform is in it.
    const expected = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), -angle);
    expect(normal.angleTo(expected)).toBeLessThan(1e-6);
    // And, for the avoidance of doubt, not the un-rotated normal a batched hit
    // would have handed back.
    expect(normal.angleTo(new THREE.Vector3(0, 0, 1))).toBeCloseTo(angle, 6);
  });
});

describe('preview batching — outlines, styles and disposal', () => {
  it('merges every outline into one line object the style toggle still finds', () => {
    const palette = createMaterialPalette();
    const scene = playgroundScene();
    const floor = scene.floors.find((entry) => entry.objects.length > 50);
    const { floorGroup, batchGroup } = buildFloorObjectGroup(floor, palette, null, { batch: true });

    const sourceLines = [];
    floorGroup.traverse((node) => {
      if (node.isLineSegments) sourceLines.push(node);
    });
    const merged = batchGroup.children.filter((child) => child.isLineSegments);

    expect(sourceLines.length).toBeGreaterThan(50);
    expect(merged).toHaveLength(1);
    expect(merged[0].material).toBe(palette.outline);

    const sourceVertices = sourceLines.reduce((total, line) => total + line.geometry.attributes.position.count, 0);
    expect(merged[0].geometry.attributes.position.count).toBe(sourceVertices);

    // What `applyOutlineVisibility` does.
    batchGroup.traverse((node) => {
      if (node.isLineSegments) node.visible = false;
    });
    expect(merged[0].visible).toBe(false);
  });

  it('refills the batch it already has when a drag only moves things', () => {
    const palette = createMaterialPalette();
    const cache = createPreviewSceneCache();
    const { project } = deserializeProject(demoData);

    const first = cache.build(buildPreviewScene(project, {}), palette);
    const groupsBefore = first.batchRoot.children.slice();
    const snapshot = () =>
      groupsBefore[0].children
        .filter((child) => child.isInstancedMesh)
        .flatMap((child) => Array.from(child.instanceMatrix.array));
    const before = snapshot();
    const disposed = [];
    groupsBefore.forEach((group) =>
      group.children.forEach((child) => child.addEventListener?.('dispose', () => disposed.push(child))),
    );

    const moved = {
      ...project,
      floors: project.floors.map((floor, index) =>
        index === 0
          ? {
              ...floor,
              walls: floor.walls.map((wall, wallIndex) =>
                wallIndex === 0 ? { ...wall, start: { ...wall.start, x: wall.start.x + 400 } } : wall,
              ),
            }
          : floor,
      ),
    };
    const second = cache.build(buildPreviewScene(moved, {}), palette);

    // Same objects, refilled — nothing allocated, nothing freed.
    expect(second.batchRoot.children).toEqual(groupsBefore);
    expect(disposed).toEqual([]);

    // And genuinely refilled: the wall that moved moved, and the merged
    // outline was told its buffer changed.
    const after = snapshot();
    expect(after).toHaveLength(before.length);
    expect(after.some((value, index) => value !== before[index])).toBe(true);

    const outline = groupsBefore[0].children.find((child) => child.isLineSegments);
    expect(outline.geometry.attributes.position.version).toBeGreaterThan(0);
    cache.dispose();
  });

  it('builds a plain world when the caller says it has nothing to instance with', () => {
    const palette = createMaterialPalette();
    const cache = createPreviewSceneCache({ batch: false });
    const { root, batchRoot } = cache.build(playgroundScene(), palette);

    let hidden = 0;
    let instanced = 0;
    root.traverse((node) => {
      if (node.isMesh && isFolded(node)) hidden += 1;
    });
    batchRoot.traverse((node) => {
      if (node.isInstancedMesh) instanced += 1;
    });

    expect(hidden).toBe(0);
    expect(instanced).toBe(0);
    cache.dispose();
  });

  it('disposes a rebuilt batch once and never the shared unit geometry', () => {
    const palette = createMaterialPalette();
    const cache = createPreviewSceneCache();
    const { project } = deserializeProject(demoData);

    const { batchRoot } = cache.build(buildPreviewScene(project, {}), palette);
    const disposals = new Map();
    const unitGeometries = new Set();
    batchRoot.traverse((node) => {
      if (!node.isInstancedMesh) return;
      unitGeometries.add(node.geometry);
      disposals.set(node, 0);
      node.addEventListener('dispose', () => disposals.set(node, disposals.get(node) + 1));
    });
    const geometryDisposals = new Set();
    for (const geometry of unitGeometries) {
      geometry.addEventListener('dispose', () => geometryDisposals.add(geometry));
    }
    expect(disposals.size).toBeGreaterThan(10);

    // Move a wall: every floor's batch is rebuilt, so every batch above is
    // replaced exactly once.
    const moved = {
      ...project,
      floors: project.floors.map((floor, index) =>
        index === 0
          ? {
              ...floor,
              walls: floor.walls.map((wall, wallIndex) =>
                wallIndex === 0 ? { ...wall, start: { ...wall.start, x: wall.start.x + 500 } } : wall,
              ),
            }
          : floor,
      ),
    };
    cache.build(buildPreviewScene(moved, {}), palette);
    cache.dispose();

    expect(geometryDisposals.size).toBe(0);
    for (const [, count] of disposals) expect(count).toBe(1);
  });
});

describe('preview batching — draw call budget', () => {
  it('collapses the playground scene to a fraction of its renderables', () => {
    const palette = createMaterialPalette();
    const scene = playgroundScene();

    const countRenderables = (root) => {
      let count = 0;
      const cameraLayers = new THREE.Layers();
      root.traverse((node) => {
        if (!(node.isMesh || node.isLine || node.isPoints)) return;
        if (!node.layers.test(cameraLayers)) return;
        count += 1;
      });
      return count;
    };

    const plain = new THREE.Group();
    const batched = new THREE.Group();
    for (const floor of scene.floors) {
      plain.add(buildFloorObjectGroup(floor, palette, null).floorGroup);
      const built = buildFloorObjectGroup(floor, palette, null, { batch: true });
      batched.add(built.floorGroup);
      if (built.batchGroup) batched.add(built.batchGroup);
    }

    const before = countRenderables(plain);
    const after = countRenderables(batched);
    expect(before).toBeGreaterThan(1000);
    expect(after * 5).toBeLessThan(before);
  });
});

/**
 * The wall and ceiling detail editors' own 3D panes.
 *
 * They are the scenes batching helps most and the ones it was originally held
 * back from: a wall face is a few hundred boards, studs, noggins and screw
 * heads, and a ceiling is that plus a screw every 300 mm across the whole
 * soffit. What made holding back look prudent is that both panes are pickable
 * to the part — click a screw and the editor selects that screw — and both
 * drive an accent overlay off the selection. Neither reads the meshes that get
 * folded: the pick raycaster has `SOURCE_ONLY_LAYER` enabled and finds the
 * source meshes exactly where they always were, and the overlay is built from
 * descriptors. The tests below are those two contracts, stated against a real
 * assembly rather than against the argument.
 */
function wallAssemblyScene() {
  const project = createProject('Wall detail');
  const floor = project.floors[0];
  const wall = createWall({ x: 0, y: 0 }, { x: 6000, y: 0 }, 150, {
    assembly: { preset: WALL_ASSEMBLY_PRESETS.MIXED_BOARD },
  });
  wall.assembly = {
    ...wall.assembly,
    detailing: createWallDetailing({
      enabled: true,
      sides: { interior: { enabled: true }, exterior: { enabled: true } },
    }),
  };
  floor.walls = [wall];
  floor.slabs = [];

  return {
    scene: buildPreviewScene(createWallDetailPreviewProject(project, floor.id, wall.id), { assemblyDetail: true }),
    partKind: 'panel',
  };
}

function ceilingAssemblyScene() {
  const project = createProject('Ceiling detail');
  const floor = project.floors[0];
  floor.walls = [];
  floor.slabs = [];
  project.ceilings = [
    createCeiling('Ceiling', {
      floorId: floor.id,
      baseElevation: 2700,
      boundaryPolygon: [
        { x: 0, y: 0 },
        { x: 6000, y: 0 },
        { x: 6000, y: 4000 },
        { x: 0, y: 4000 },
      ],
      boundarySource: CEILING_BOUNDARY_SOURCES.DRAWN,
    }),
  ];

  return {
    scene: buildPreviewScene(createCeilingDetailPreviewProject(project, project.ceilings[0].id), {
      assemblyDetail: true,
    }),
    partKind: 'fastener',
  };
}

/** Every part the pane offers, in build order. */
function assemblyPartsOf(scene) {
  const parts = [];
  for (const floor of scene.floors) {
    for (const descriptor of floor.objects) {
      const part = readAssemblyPart(descriptor);
      if (part) parts.push(part);
    }
  }
  return parts;
}

/**
 * A deterministic fan of rays that actually meets the model.
 *
 * Derived from the scene's own bounds rather than written out, because a wall
 * stands in a 100 mm slice of plan and a ceiling lies in a 60 mm slice of
 * elevation — one set of hand-picked coordinates cannot hit both, and a fan
 * that misses proves the two builds agree about nothing.
 */
function raysThroughBounds(bounds, count) {
  const span = (low, high, t) => low + (high - low) * t;
  const rays = [];
  for (let index = 0; index < count; index += 1) {
    const target = new THREE.Vector3(
      span(bounds.minX, bounds.maxX, ((index * 37) % 100) / 100),
      span(bounds.minElevation, bounds.maxElevation, ((index * 53) % 100) / 100),
      span(bounds.minY, bounds.maxY, ((index * 71) % 100) / 100),
    );
    const angle = (index / count) * Math.PI * 2;
    const radius = 12000;
    const origin = new THREE.Vector3(
      span(bounds.minX, bounds.maxX, 0.5) + Math.cos(angle) * radius,
      span(bounds.minElevation, bounds.maxElevation, 0.5) + ((index % 5) - 2) * 900,
      span(bounds.minY, bounds.maxY, 0.5) + Math.sin(angle) * radius,
    );
    rays.push({ origin, direction: target.clone().sub(origin).normalize() });
  }
  return rays;
}

describe('preview batching — assembly editor panes', () => {
  for (const [label, makeScene] of [
    ['wall', wallAssemblyScene],
    ['ceiling', ceilingAssemblyScene],
  ]) {
    it(`folds the ${label} editor's pane into a fraction of its draw calls`, () => {
      const palette = createMaterialPalette();
      const { scene } = makeScene();
      // Guard against a fixture that quietly stopped producing an assembly:
      // every claim in this block would pass on an empty scene.
      expect(assemblyPartsOf(scene).length).toBeGreaterThan(50);

      const countRenderables = (root) => {
        let count = 0;
        const cameraLayers = new THREE.Layers();
        root.traverse((node) => {
          if (!(node.isMesh || node.isLine || node.isPoints)) return;
          if (!node.layers.test(cameraLayers)) return;
          count += 1;
        });
        return count;
      };

      const plain = new THREE.Group();
      const batched = new THREE.Group();
      for (const floor of scene.floors) {
        plain.add(buildFloorObjectGroup(floor, palette, null).floorGroup);
        const built = buildFloorObjectGroup(floor, palette, null, { batch: true });
        batched.add(built.floorGroup);
        if (built.batchGroup) batched.add(built.batchGroup);
      }

      const before = countRenderables(plain);
      const after = countRenderables(batched);
      expect(before).toBeGreaterThan(100);
      // Twenty to one is the loose end of it — the wall pane measures 1,390 to 6
      // and the ceiling 818 to 13 — but a bound that tight would fail the day
      // someone adds a material to the palette.
      expect(after * 20).toBeLessThan(before);
    });

    it(`resolves the same ${label} part from the same ray after batching`, () => {
      const palette = createMaterialPalette();
      const { scene } = makeScene();

      const plain = new THREE.Group();
      const batched = new THREE.Group();
      for (const floor of scene.floors) {
        plain.add(buildFloorObjectGroup(floor, palette, null).floorGroup);
        batched.add(buildFloorObjectGroup(floor, palette, null, { batch: true }).floorGroup);
      }

      let compared = 0;
      let partsSeen = 0;
      for (const { origin, direction } of raysThroughBounds(scene.bounds, 200)) {
        const expected = pickTargets(plain, origin, direction);
        const actual = pickTargets(batched, origin, direction);
        expect(actual).toEqual(expected);
        if (expected.length) compared += 1;
        // The keys carry the part, so a run that only ever resolved whole
        // objects would prove nothing about per-part identity.
        partsSeen += expected.filter((key) => !key.endsWith(':')).length;
      }
      expect(compared).toBeGreaterThan(40);
      expect(partsSeen).toBeGreaterThan(40);
    });

    it(`highlights the same ${label} part whether or not the pane is batched`, () => {
      const palette = createMaterialPalette();
      const { scene, partKind } = makeScene();
      const part = assemblyPartsOf(scene).find((candidate) => candidate.kind === partKind);
      expect(part).toBeDefined();

      const describeOverlay = (batch) => {
        const cache = createPreviewSceneCache({ batch });
        const { meshMap } = cache.build(scene, palette);
        const overlay = buildSelectionOverlay(meshMap, { part }, palette, 'assembly');
        expect(overlay).not.toBeNull();
        overlay.updateMatrixWorld(true);

        const boxes = [];
        const cameraLayers = new THREE.Layers();
        overlay.traverse((node) => {
          if (!node.isMesh) return;
          // An overlay the camera cannot see is not a highlight. Nothing folds
          // it — it is built fresh from descriptors — but that is the claim.
          expect(node.layers.test(cameraLayers)).toBe(true);
          const box = worldBoxOf(node);
          boxes.push([...box.min.toArray(), ...box.max.toArray()].map((value) => Math.round(value)));
        });
        cache.dispose();
        return boxes;
      };

      const unbatched = describeOverlay(false);
      expect(unbatched.length).toBeGreaterThan(0);
      expect(describeOverlay(true)).toEqual(unbatched);
    });
  }
});

describe('preview batching — the screw that had its turn baked in', () => {
  /** A wall screw head: a disc of radius `wide`, `depth` thick, lying on its side. */
  function wallFastener(rotation) {
    const palette = createMaterialPalette();
    const descriptor = {
      id: 'screw',
      kind: 'wall',
      geometry: 'fastener',
      materialKey: 'wall',
      metadata: { sourceId: 'w1' },
      center: { x: 0, y: 0 },
      size: { x: 16, y: 16, z: 3 },
      radius: 8,
      depth: 3,
      rotation,
      baseElevation: 1000,
    };
    const { floorGroup } = buildFloorObjectGroup(floorDescriptor([descriptor]), palette, null, { batch: true });
    floorGroup.updateMatrixWorld(true);
    let mesh = null;
    floorGroup.traverse((node) => {
      if (node.isMesh && !mesh) mesh = node;
    });
    return { mesh, box: worldBoxOf(mesh) };
  }

  it('still lies flat against the wall face now that the turn is on the mesh', () => {
    // Rotation 0: the wall runs along X, so the head is thin through Z and a
    // full 16 mm across in X and Y. This is the orientation the baked
    // `geometry.rotateX` produced, and the whole point of moving the turn onto
    // the mesh is that it produced it identically.
    const flat = wallFastener(0).box.getSize(new THREE.Vector3());
    expect(flat.x).toBeCloseTo(16, 1);
    expect(flat.y).toBeCloseTo(16, 1);
    expect(flat.z).toBeCloseTo(3, 1);

    // A quarter turn in plan swaps which horizontal axis the disc is thin
    // through, and leaves the vertical one alone.
    const turned = wallFastener(Math.PI / 2).box.getSize(new THREE.Vector3());
    expect(turned.x).toBeCloseTo(3, 1);
    expect(turned.y).toBeCloseTo(16, 1);
    expect(turned.z).toBeCloseTo(16, 1);
  });

  it('folds into the batch it used to be excluded from', () => {
    expect(isFolded(wallFastener(0.4).mesh)).toBe(true);
  });
});
