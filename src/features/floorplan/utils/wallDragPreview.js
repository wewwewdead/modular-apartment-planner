/**
 * Overlay live drag-preview geometry onto a floor for rendering.
 *
 * During a wall drag the committed floor never changes (preview-then-commit);
 * the select handler publishes proposed wall geometries — the dragged wall
 * plus its one-hop healed neighbors — in editor toolState. Swapping them into
 * the walls array here means every downstream renderer (walls, doors/windows
 * hosted by wallId, selection grips, 3D) follows the drag for free.
 */
export function applyWallDragPreview(floor, wallDragPreview) {
  if (!floor || !wallDragPreview) return floor;
  const edits = wallDragPreview.edits;
  const sectionCutEdits = wallDragPreview.sectionCutEdits;
  let nextFloor = floor;

  if (edits?.length) {
    const editById = new Map(edits.map((edit) => [edit.id, edit]));
    let changed = false;
    const walls = floor.walls.map((wall) => {
      const edit = editById.get(wall.id);
      if (!edit) return wall;
      changed = true;
      return {
        ...wall,
        ...(edit.start ? { start: { ...edit.start } } : {}),
        ...(edit.end ? { end: { ...edit.end } } : {}),
        ...(edit.controlPoint ? { controlPoint: { ...edit.controlPoint } } : {}),
      };
    });
    if (changed) nextFloor = { ...nextFloor, walls };
  }

  if (sectionCutEdits?.length) {
    const editById = new Map(sectionCutEdits.map((edit) => [edit.id, edit]));
    let changed = false;
    const sectionCuts = (floor.sectionCuts || []).map((sectionCut) => {
      const edit = editById.get(sectionCut.id);
      if (!edit) return sectionCut;
      changed = true;
      return {
        ...sectionCut,
        ...(edit.startPoint ? { startPoint: { ...edit.startPoint } } : {}),
        ...(edit.endPoint ? { endPoint: { ...edit.endPoint } } : {}),
      };
    });
    if (changed) nextFloor = { ...nextFloor, sectionCuts };
  }

  return nextFloor;
}
