/**
 * Eraser tool. Click to delete the part under cursor.
 * Hover shows a red-tinted highlight via toolState.eraserHoverPartId.
 */
export function createEraserHandler3d({ dispatch, editorDispatch, project }) {
  return {
    onPointerDown(intersection, e, toolState) {
      if (e.button !== 0) return;

      if (!intersection || !intersection.partId) return;

      const part = project.parts.find((p) => p.id === intersection.partId);
      if (!part) return;

      dispatch({ type: 'PART_DELETE', partId: part.id });
      editorDispatch({ type: 'DESELECT' });
      editorDispatch({
        type: 'SET_STATUS_MESSAGE',
        message: `Deleted ${part.name || part.type}`,
      });
      editorDispatch({
        type: 'UPDATE_TOOL_STATE',
        payload: { eraserHoverPartId: null },
      });
    },

    onPointerMove() {},

    onHover(intersection, e, toolState) {
      if (intersection?.partId) {
        if (toolState.eraserHoverPartId !== intersection.partId) {
          editorDispatch({
            type: 'UPDATE_TOOL_STATE',
            payload: { eraserHoverPartId: intersection.partId },
          });
        }
      } else if (toolState.eraserHoverPartId) {
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: { eraserHoverPartId: null },
        });
      }
    },

    onPointerUp() {},
    onDoubleClick() {},

    onKeyDown(e) {
      if (e.key === 'Escape') {
        editorDispatch({
          type: 'UPDATE_TOOL_STATE',
          payload: { eraserHoverPartId: null },
        });
      }
    },

    getCursor(toolState) {
      if (toolState?.eraserHoverPartId) return 'pointer';
      return 'crosshair';
    },
  };
}
