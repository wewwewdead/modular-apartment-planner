import * as THREE from 'three';

/**
 * One draw call per material per floor, instead of one per stud.
 *
 * ## The problem
 *
 * The preview builds one `THREE.Mesh` per descriptor and hangs an
 * `EdgesGeometry` outline off each of them. On the playground project that is
 * 1,202 draw calls for 24,726 triangles — about twenty triangles a call, which
 * is a driver doing paperwork rather than a GPU doing work. Nothing about the
 * picture needs that: a floor's walls, beams, columns, truss members, window
 * frames and furniture are all boxes and cylinders sharing a handful of palette
 * materials, and every one of them is a `THREE.InstancedMesh` waiting to happen.
 *
 * ## The shape of the fix
 *
 * A box of any size is the unit box scaled, and a cylinder of any radius and
 * height is a unit cylinder of the same taper scaled — so the whole family
 * collapses onto one shared geometry plus a per-instance matrix. The geometry
 * builders tag what they make (`taggedBoxGeometry` / `taggedCylinderGeometry`)
 * with the unit it came from and the scale that gets it back; this module reads
 * those tags off a finished floor group and folds every tagged mesh into an
 * instanced batch, keyed by (unit shape, material, shadow flags).
 *
 * Outlines get the same treatment in one step further: every `LineSegments`
 * under the floor is concatenated into a single merged one, so a floor's edge
 * overlay is one call however many members it draws.
 *
 * Together that is 1,202 draw calls down to 186 on the playground scene — and
 * 1,771 down to 247 on the frames where the shadow map is re-rendered — for the
 * same 24,726 triangles and the same picture.
 *
 * ## Why the individual meshes stay in the graph
 *
 * They are not drawn — each batched mesh is moved to `SOURCE_ONLY_LAYER`, a
 * layer the camera never looks at, which takes it out of both the render list
 * and the shadow pass (three tests `object.layers` against `camera.layers` in
 * `projectObject` and in `WebGLShadowMap.renderObject`, and recurses into
 * children either way). But they stay exactly where they were, still visible,
 * still carrying their `previewTarget`, and that is what makes this change
 * invisible to everything that reads the world rather than draws it:
 *
 *  - **Walk physics.** `previewCollisionIndex` collects meshes out of
 *    `[worldRoot, ground]` and calls `Mesh.raycast` on them directly, which
 *    ignores layers. It therefore sees the same set of meshes, with the same
 *    world boxes, as before this change — and it never sees a batch, because
 *    batches live in a second root that is not one of its sources. That matters
 *    more than it looks: `advanceBudget` turns a hit's face normal by
 *    `hit.object.matrixWorld`, and for a batched hit that matrix leaves out the
 *    instance transform, so a rotated wall would slide the body along a normal
 *    pointing somewhere else entirely.
 *  - **Picking.** `pickObjectAt` raycasts `worldRoot` with a raycaster that has
 *    this layer enabled, so it hits the individual meshes and resolves exactly
 *    the targets it always did — no instance table, no id mapping, no new way
 *    for a click to land on the wrong board.
 *
 * The individual meshes cost geometry memory they already cost, and they cost
 * nothing on the GPU: a geometry that is never rendered is never uploaded.
 */

/**
 * The layer the render camera does not include, and the pick raycaster does.
 *
 * Layer 1 rather than a high one for no reason beyond legibility — nothing else
 * in this app uses layers, so the choice is free.
 */
export const SOURCE_ONLY_LAYER = 1;

/**
 * Unit shapes, shared by every batch in every scene for the life of the page.
 *
 * Marked `shared` so `disposeScene` leaves them alone: a floor rebuild disposes
 * the batch it replaced, and freeing the unit box out from under the forty other
 * batches still drawing from it is the kind of bug that shows up as an empty
 * screen three interactions later.
 */
const UNIT_GEOMETRIES = new Map();
const UNIT_OUTLINE_GEOMETRIES = new Map();

/** Ratios are float divisions, so they are keyed at a resolution that closes. */
function quantise(value) {
  return Math.round(value * 1e6) / 1e6;
}

function markShared(geometry) {
  geometry.userData = { ...geometry.userData, shared: true };
  return geometry;
}

function unitGeometry(unitKey) {
  const cached = UNIT_GEOMETRIES.get(unitKey);
  if (cached) return cached;

  let geometry;
  if (unitKey === 'box') {
    geometry = new THREE.BoxGeometry(1, 1, 1);
  } else {
    const [, top, bottom, segments] = unitKey.split(':');
    geometry = new THREE.CylinderGeometry(Number(top), Number(bottom), 1, Number(segments));
  }
  markShared(geometry);
  UNIT_GEOMETRIES.set(unitKey, geometry);
  return geometry;
}

/**
 * The edge overlay for a unit shape.
 *
 * Only offered for boxes, and deliberately: `EdgesGeometry` keeps an edge when
 * the angle between the two faces meeting at it exceeds a threshold, and a
 * non-uniform scale does not preserve angles. A box is the one shape where it
 * does not matter — every dihedral is a right angle at any size — so the twelve
 * lines of the unit box, scaled, are exactly the lines the sized box would have
 * produced. A tapered cylinder is not, so those still measure their own.
 */
export function unitOutlineGeometry(unitKey) {
  const cached = UNIT_OUTLINE_GEOMETRIES.get(unitKey);
  if (cached) return cached;
  const geometry = markShared(new THREE.EdgesGeometry(unitGeometry(unitKey), 20));
  UNIT_OUTLINE_GEOMETRIES.set(unitKey, geometry);
  return geometry;
}

/**
 * A box, and a note of the unit box it is a scaled copy of.
 *
 * Every box in the preview goes through here rather than `new THREE.BoxGeometry`
 * so that the tag is a property of how the geometry was made. Sniffing
 * `geometry.type` afterwards would be wrong: a builder is free to bake a
 * rotation or a translation into its geometry (the horizontal screw head does),
 * and `geometry.parameters` still reports the shape it was before that.
 */
export function taggedBoxGeometry(width, height, depth) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  geometry.userData = {
    ...geometry.userData,
    batchUnit: { key: 'box', scaleX: width, scaleY: height, scaleZ: depth },
  };
  return geometry;
}

/**
 * A cylinder, and the unit cylinder of the same taper it is a scaled copy of.
 *
 * Taper is what survives the scale and radius is what does not, so the unit is
 * normalised on the wider end: a cylinder `(rTop, rBottom, height)` is the unit
 * `(rTop/r, rBottom/r, 1)` scaled by `(r, height, r)` where `r` is the larger
 * radius. Straight cylinders — most of them — all land on the same unit.
 */
export function taggedCylinderGeometry(radiusTop, radiusBottom, height, segments) {
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments);
  const radius = Math.max(radiusTop, radiusBottom);
  if (radius > 0) {
    const key = `cyl:${quantise(radiusTop / radius)}:${quantise(radiusBottom / radius)}:${segments}`;
    geometry.userData = {
      ...geometry.userData,
      batchUnit: { key, scaleX: radius, scaleY: height, scaleZ: radius },
    };
  }
  return geometry;
}

/**
 * Which materials may share a draw call.
 *
 * Transparent surfaces are out because one batch is one depth-sorted item, and
 * glass that used to sort per pane would start sorting per floor. A material a
 * single object owns — a luminaire's lens, coloured to its own lamp and swung
 * between lit and unlit at runtime — is out because batching it would either
 * light every lamp on the floor at once or none of them.
 */
function isBatchableMaterial(material) {
  if (!material || Array.isArray(material)) return false;
  if (material.transparent) return false;
  if (material.userData?.ownedByPreviewObject) return false;
  if (material.userData?.fixtureLens) return false;
  return true;
}

function isBatchableMesh(node) {
  if (!node.isMesh || node.isInstancedMesh || node.isBatchedMesh) return false;
  if (node.visible === false) return false;
  if (!node.geometry?.userData?.batchUnit) return false;
  if (!isBatchableMaterial(node.material)) return false;
  // A door leaf is the one thing the walk is allowed through and the one thing
  // a click on a wall must not resolve to, so it keeps its own mesh and its own
  // draw call rather than being one instance among five hundred.
  if (node.userData?.previewTarget?.kind === 'door') return false;
  return true;
}

/** Concatenate every outline in the floor into `positions`, in floor space. */
function writeMergedOutline(lines, toFloorSpace, positions) {
  const matrix = new THREE.Matrix4();
  const vertex = new THREE.Vector3();
  let offset = 0;

  for (const line of lines) {
    const attribute = line.geometry?.attributes?.position;
    if (!attribute) continue;
    matrix.multiplyMatrices(toFloorSpace, line.matrixWorld);

    // Written out rather than `Vector3.applyMatrix4` per vertex: this runs over
    // every edge of every object on a floor on every rebuild — fourteen thousand
    // vertices for the whole playground model — and the perspective divide the
    // general method pays for is meaningless on an affine transform.
    const source = attribute.array;
    if (!attribute.isInterleavedBufferAttribute && attribute.itemSize === 3) {
      const e = matrix.elements;
      for (let index = 0, read = 0; index < attribute.count; index += 1, read += 3) {
        const x = source[read];
        const y = source[read + 1];
        const z = source[read + 2];
        positions[offset] = e[0] * x + e[4] * y + e[8] * z + e[12];
        positions[offset + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
        positions[offset + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        offset += 3;
      }
      continue;
    }

    for (let index = 0; index < attribute.count; index += 1) {
      vertex.fromBufferAttribute(attribute, index).applyMatrix4(matrix);
      positions[offset] = vertex.x;
      positions[offset + 1] = vertex.y;
      positions[offset + 2] = vertex.z;
      offset += 3;
    }
  }
}

/**
 * Whether last rebuild's batches still describe this one.
 *
 * The case this exists for is a drag: the floor is rebuilt fifteen times a
 * second and every time it holds the same objects, of the same shapes, in the
 * same materials — one of them has simply moved. Rebuilding the batches for
 * that allocates and then frees forty instance buffers a second for no change
 * in structure at all; writing the matrices into the buffers that are already
 * there halves what batching adds to a rebuild (0.47 ms to 0.20 ms on the
 * playground's busiest floor) and leaves the GPU's own buffers alone.
 *
 * Deliberately structural rather than clever: same batches, in the same order,
 * with the same shape, material, shadow flags and instance count, and an
 * outline of the same length. Anything else — an object added, a material
 * changed, a board hidden — builds fresh.
 */
function batchesStillFit(previousBatchGroup, buckets, outlineVertexCount) {
  if (!previousBatchGroup) return false;

  const children = previousBatchGroup.children;
  const bucketList = [...buckets.values()];
  const expectedChildren = bucketList.length + (outlineVertexCount > 0 ? 1 : 0);
  if (children.length !== expectedChildren) return false;

  for (let index = 0; index < bucketList.length; index += 1) {
    const batch = children[index];
    const bucket = bucketList[index];
    if (!batch?.isInstancedMesh) return false;
    if (batch.userData.unitKey !== bucket.unitKey) return false;
    if (batch.material !== bucket.material) return false;
    if (batch.count !== bucket.meshes.length) return false;
    if (batch.castShadow !== bucket.castShadow || batch.receiveShadow !== bucket.receiveShadow) return false;
  }

  if (outlineVertexCount > 0) {
    const outline = children[bucketList.length];
    if (!outline?.isLineSegments) return false;
    if (outline.geometry.attributes.position.count !== outlineVertexCount) return false;
  }

  return true;
}

/**
 * Fold a built floor group into a group of batched renderables.
 *
 * Returns the batch group, which the caller adds to the batch root beside the
 * world root — never inside it. The source group is left standing and only its
 * layers are touched, so the meshes the collision index and the picker read are
 * the same objects, in the same places, as before.
 *
 * `previousBatchGroup` is this floor's batch group from the last build, if it
 * has one. When it still fits, it is refilled and handed straight back — the
 * caller can tell by identity, and must not dispose what it got back.
 */
export function buildFloorBatchGroup(floorGroup, materialPalette, previousBatchGroup = null) {
  floorGroup.updateMatrixWorld(true);

  const toFloorSpace = new THREE.Matrix4().copy(floorGroup.matrixWorld).invert();
  /** @type {Map<string, { unitKey: string, material: THREE.Material, castShadow: boolean, receiveShadow: boolean, meshes: THREE.Mesh[] }>} */
  const buckets = new Map();
  const lines = [];

  floorGroup.traverse((node) => {
    if (node.isLineSegments) {
      lines.push(node);
      return;
    }
    if (!isBatchableMesh(node)) return;

    const unit = node.geometry.userData.batchUnit;
    const key = `${unit.key}|${node.material.uuid}|${node.castShadow ? 1 : 0}|${node.receiveShadow ? 1 : 0}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        unitKey: unit.key,
        material: node.material,
        castShadow: node.castShadow,
        receiveShadow: node.receiveShadow,
        meshes: [],
      };
      buckets.set(key, bucket);
    }
    bucket.meshes.push(node);
  });

  let outlineVertexCount = 0;
  for (const line of lines) {
    outlineVertexCount += line.geometry?.attributes?.position?.count || 0;
  }

  const reusing = batchesStillFit(previousBatchGroup, buckets, outlineVertexCount);
  const batchGroup = reusing ? previousBatchGroup : new THREE.Group();
  if (!reusing) {
    batchGroup.name = `${floorGroup.name}-batches`;
    batchGroup.userData = { ...floorGroup.userData, previewBatchGroup: true };
  }
  batchGroup.visible = floorGroup.visible;
  // Identity today — floor groups carry their elevation in the descriptors
  // rather than in a transform — but copied rather than assumed, because a batch
  // that silently ignored a floor transform would put a whole storey in the
  // wrong place.
  batchGroup.position.copy(floorGroup.position);
  batchGroup.quaternion.copy(floorGroup.quaternion);
  batchGroup.scale.copy(floorGroup.scale);

  const instanceMatrix = new THREE.Matrix4();
  const unitScale = new THREE.Matrix4();
  let bucketIndex = 0;

  for (const bucket of buckets.values()) {
    const batch = reusing
      ? batchGroup.children[bucketIndex]
      : new THREE.InstancedMesh(unitGeometry(bucket.unitKey), bucket.material, bucket.meshes.length);
    if (!reusing) {
      batch.castShadow = bucket.castShadow;
      batch.receiveShadow = bucket.receiveShadow;
      // `unitKey` is what shape the batch draws, which is otherwise unreadable
      // once the geometry is shared: it names the bucket for anyone comparing a
      // batch against the meshes it replaced.
      batch.userData = { previewBatch: true, unitKey: bucket.unitKey };
    }

    bucket.meshes.forEach((mesh, index) => {
      const unit = mesh.geometry.userData.batchUnit;
      unitScale.makeScale(unit.scaleX, unit.scaleY, unit.scaleZ);
      instanceMatrix.multiplyMatrices(toFloorSpace, mesh.matrixWorld).multiply(unitScale);
      batch.setMatrixAt(index, instanceMatrix);
      // Drawn by the batch from here on. Set after the matrix is read, not
      // before, so a throw halfway through cannot leave a mesh invisible and
      // un-batched.
      mesh.layers.set(SOURCE_ONLY_LAYER);
    });

    batch.instanceMatrix.needsUpdate = true;
    // Instance matrices are not part of what three invalidates when they
    // change, and a batch whose bounds still describe where it used to be is a
    // batch that culls itself out of frame or misses a ray.
    batch.boundingBox = null;
    batch.boundingSphere = null;
    if (!reusing) batchGroup.add(batch);
    bucketIndex += 1;
  }

  if (outlineVertexCount > 0) {
    // Every outline in the floor goes into one merged object, batched member or
    // not: an edge overlay is one drawing convention, so it may as well be one
    // draw call. `applyOutlineVisibility` still finds it — it is a
    // `LineSegments` like the ones it replaced.
    if (reusing) {
      const attribute = batchGroup.children[bucketIndex].geometry.attributes.position;
      writeMergedOutline(lines, toFloorSpace, attribute.array);
      attribute.needsUpdate = true;
      batchGroup.children[bucketIndex].geometry.boundingSphere = null;
      batchGroup.children[bucketIndex].geometry.boundingBox = null;
    } else {
      const positions = new Float32Array(outlineVertexCount * 3);
      writeMergedOutline(lines, toFloorSpace, positions);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const mergedOutline = new THREE.LineSegments(geometry, materialPalette.outline);
      mergedOutline.userData = { previewBatch: true };
      batchGroup.add(mergedOutline);
    }
    for (const line of lines) line.layers.set(SOURCE_ONLY_LAYER);
  }

  return batchGroup;
}
