/**
 * Stop three re-deriving the transform of a building that is not moving.
 *
 * ## What it was costing
 *
 * `WebGLRenderer.render` begins with `scene.updateMatrixWorld()`, which walks
 * the whole graph and, for every node whose `matrixAutoUpdate` is set, composes
 * its local matrix out of position/quaternion/scale and then multiplies it by
 * its parent's world matrix. Nothing in the preview's world root ever moves
 * after it is built — a wall that changed was rebuilt, not animated — so all of
 * that is arithmetic producing the same numbers it produced last frame.
 *
 * It is not a small graph either. Batching leaves every source mesh standing on
 * `SOURCE_ONLY_LAYER` so the picker and the walk collider can still find it, and
 * the edge overlay hangs a `LineSegments` child off most of them, so the node
 * count runs to something over twice the number of things actually drawn.
 *
 * ## Why the scene itself has to be frozen too
 *
 * `updateMatrix()` ends with `matrixWorldNeedsUpdate = true`, and
 * `updateMatrixWorld` turns that into `force = true` for the entire subtree. A
 * Scene with `matrixAutoUpdate` left on therefore forces every descendant every
 * frame no matter what its children say, and freezing the world root would save
 * nothing at all. Freezing the scene is safe for exactly the reason freezing the
 * world root is: it sits at the origin and is never transformed. Its children
 * that *do* move — the sun and its sky, the ground, the grid — keep their own
 * flag set and go on forcing their own subtrees, which is all they need.
 *
 * ## The contract this puts on everyone else
 *
 * A frozen node's `position`/`rotation`/`scale` are no longer read by the
 * renderer. Anything that writes one after the freeze must call
 * `node.updateMatrix()` (local change) or `node.updateMatrixWorld(true)` (it or
 * its parent moved) itself, or hand the node back by setting `matrixAutoUpdate`
 * to `true` again. Re-parenting is the same story: `Object3D.add` does not mark
 * the child's world matrix stale, so a group moved between parents whose world
 * transforms differ has to be updated by hand. In this preview both roots are
 * only ever parented to the scene, which is fixed at the origin, and the cache
 * re-runs `freezeStaticMatrices` at the end of every build — so re-attaching a
 * carried-over floor group already updates it once, in the right order.
 */

/**
 * Compose every matrix under `root` once, then stop three from doing it again.
 *
 * Idempotent, and cheap on a graph that is already frozen: the forced update
 * skips `compose` for every node whose flag is already down and only re-derives
 * world matrices, which is what a re-parented carry-over needs anyway.
 */
export function freezeStaticMatrices(root) {
  if (!root) return;
  // Forced, because the point is to make the world matrices right *now*, while
  // the local ones are still being derived automatically. After this line they
  // are frozen and nothing will derive them again.
  root.updateMatrixWorld(true);
  root.traverse((node) => {
    node.matrixAutoUpdate = false;
  });
}
