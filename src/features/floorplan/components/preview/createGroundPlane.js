import * as THREE from 'three';

/**
 * The ground the building stands on.
 *
 * Without it the model floats: shadows fall off the bottom of the slab into
 * nothing, and there is no horizon for the eye to place the building against.
 * A grid does not solve this — a grid says "this is a drawing", which is the
 * opposite of what the realistic view is for.
 *
 * It is a disc rather than a plane so it can dissolve at its edge. The alpha
 * ramp is doing real work: an opaque ground ends in a hard circle wherever the
 * geometry stops, and a plane large enough to hide that has a horizon line so
 * far away it reads as a wall. Fading out means the ground meets the sky
 * without either of them having an edge.
 */

/** How far out the ground reaches, as a multiple of the model's own radius. */
const GROUND_RADIUS_FACTOR = 9;

/** Never smaller than this, so a single room still gets a horizon. */
const MIN_GROUND_RADIUS_MM = 60000;

function createFadeTexture() {
  if (typeof document === 'undefined') return null;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) return null;

  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  // Held solid across the middle third — that is where the building sits and
  // where the shadows land — then given a long ramp so the falloff itself is
  // never visible as a ring.
  gradient.addColorStop(0, 'rgb(255, 255, 255)');
  gradient.addColorStop(0.34, 'rgb(255, 255, 255)');
  gradient.addColorStop(0.62, 'rgb(120, 120, 120)');
  gradient.addColorStop(1, 'rgb(0, 0, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

/**
 * @param {THREE.Box3} bounds  World bounds of the model.
 * @param {number} groundLevel Elevation of the ground, in millimetres.
 */
export function createGroundPlane(bounds, groundLevel) {
  const size = bounds && !bounds.isEmpty() ? bounds.getSize(new THREE.Vector3()) : new THREE.Vector3();
  const modelRadius = Math.max(Math.hypot(size.x, size.z) / 2, 4000);
  const radius = Math.max(modelRadius * GROUND_RADIUS_FACTOR, MIN_GROUND_RADIUS_MM);

  const geometry = new THREE.CircleGeometry(radius, 96);
  geometry.rotateX(-Math.PI / 2);

  const material = new THREE.MeshStandardMaterial({
    color: 0x9a958c,
    roughness: 0.96,
    metalness: 0,
    alphaMap: createFadeTexture(),
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  // A couple of millimetres below datum: slabs are often modelled *at* ground
  // level, and a coplanar pair of surfaces is a z-fighting shimmer.
  mesh.position.y = groundLevel - 2;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.name = 'ground';
  mesh.renderOrder = -2;

  return {
    object: mesh,

    /** Match the ground to the light it is standing in. */
    setColor(color) {
      material.color.set(color);
    },

    dispose() {
      geometry.dispose();
      material.alphaMap?.dispose();
      material.dispose();
    },
  };
}
