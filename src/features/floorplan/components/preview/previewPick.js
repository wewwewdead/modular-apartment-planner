/**
 * What a click in an assembly pane hit, in the plan's terms.
 *
 * The preview builds every descriptor with `planPointToWorld(point, elevation)
 * = (point.x, elevation, point.y)` (`buildPreviewObjects.js`), so the inverse
 * is plan x = world x, plan y = world z, elevation = world y. `hit.point` is
 * the raycast hit in the world root's frame (`createPreviewViewport`'s
 * `pickObjectAt`). The target's `kind` and `sourceId` say whose mesh it was —
 * a ceiling's boards carry `kind: 'ceiling'` and the ceiling's id — so an
 * editor can tell a hit on its own assembly from one on the context around it.
 *
 * Returns null for a miss or a hit with no point.
 */
export function previewPickHit(target, hit) {
  const point = hit?.point;
  if (!target || !point || ![point.x, point.y, point.z].every(Number.isFinite)) return null;
  return {
    plan: { x: point.x, y: point.z },
    elevation: point.y,
    kind: target.kind ?? null,
    sourceId: target.sourceId ?? null,
  };
}
