import { resolveAllEntities } from './parametricEngine';
import { normalizeSketchDocument } from './sketchDocumentUtils';
import { resolveSketchJoinery } from './sketchJoineryUtils';

// Single-entry memoization cache for undo/redo optimization.
// When restoring a snapshot that was already resolved, we skip re-resolution.
let _lastInput = null;
let _lastResult = null;

export function resolveSketchDocument(document) {
  if (document === _lastInput && _lastResult) return _lastResult;

  const normalizedDocument = normalizeSketchDocument(document);
  const resolvedEntities = resolveAllEntities(normalizedDocument.entities, normalizedDocument.variables || []);
  const joineryResolution = resolveSketchJoinery(resolvedEntities, normalizedDocument.joints || []);

  const result = {
    document: {
      ...normalizedDocument,
      entities: resolvedEntities,
      joints: joineryResolution.joints,
    },
    jointDiagnostics: joineryResolution.diagnostics,
    manufacturingPreviewEntities: joineryResolution.previewEntities,
    manufacturingExportEntities: joineryResolution.exportEntities,
  };

  _lastInput = document;
  _lastResult = result;
  return result;
}

/**
 * Lightweight resolution for drag operations — only normalizes and resolves
 * parametric expressions. Skips joinery resolution, which is the expensive half
 * of the pipeline. Full resolution should be run on drag-end.
 */
export function resolveSketchDocumentLightweight(document) {
  const normalizedDocument = normalizeSketchDocument(document);
  const resolvedEntities = resolveAllEntities(normalizedDocument.entities, normalizedDocument.variables || []);
  return {
    ...normalizedDocument,
    entities: resolvedEntities,
  };
}
