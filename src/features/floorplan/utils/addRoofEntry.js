import { createRoofSystemForProject } from '@/domain/roofModels';

/**
 * Give one truss system its roof (docs/multi-roof.md §5.3), for every control
 * that offers it: the truss panel's Add roof and the sidebar's "Add roof to …"
 * rows and Roof "+".
 *
 * The roof goes on THAT system or nowhere: `createRoofSystemForProject` refuses
 * a system that already carries a roof or cannot carry one, and so does the
 * reducer, so a second roof can never land on, or replace, another system's.
 *
 * `open` is where the user is left. From the truss panel the panel stays on the
 * truss (the new roof only becomes the active one, ready for the roof
 * workspace); from the sidebar's Roof section the roof workspace opens on it.
 * The status line goes last: SET_MODEL_TARGET clears it.
 */
export function addRoofToTrussSystem({ project, trussSystem, phaseId = null, dispatch, editorDispatch, open = false }) {
  if (!trussSystem?.id) return null;
  const roofSystem = createRoofSystemForProject(project, {
    phaseId: phaseId || null,
    trussAttachmentId: trussSystem.id,
  });
  if (!roofSystem) return null;

  dispatch({ type: 'ROOF_CREATE', roofSystem });
  if (open) {
    editorDispatch({ type: 'SET_MODEL_TARGET', modelTarget: 'roof' });
    editorDispatch({ type: 'SELECT_OBJECT', id: roofSystem.id, objectType: 'roofSystem' });
  } else {
    editorDispatch({ type: 'SET_ACTIVE_ROOF', roofId: roofSystem.id });
  }
  editorDispatch({ type: 'SET_STATUS_MESSAGE', message: `Roof added to ${trussSystem.name || 'Truss System'}.` });
  return roofSystem;
}

/** Open one roof in the roof workspace: roof target, active, selected. */
export function openRoof({ roofSystem, editorDispatch }) {
  if (!roofSystem?.id) return;
  editorDispatch({ type: 'SET_MODEL_TARGET', modelTarget: 'roof' });
  editorDispatch({ type: 'SELECT_OBJECT', id: roofSystem.id, objectType: 'roofSystem' });
}
