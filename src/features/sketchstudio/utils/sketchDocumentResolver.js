import { resolveAllEntities } from './parametricEngine';
import { normalizeSketchDocument } from './sketchDocumentUtils';
import { resolveSketchConstraints } from './sketchConstraintUtils';
import { resolveSketchJoinery } from './sketchJoineryUtils';

// Single-entry memoization cache for undo/redo optimization.
// When restoring a snapshot that was already resolved, we skip re-resolution.
let _lastInput = null;
let _lastResult = null;

export function resolveSketchDocument(document) {
  if (document === _lastInput && _lastResult) return _lastResult;

  const normalizedDocument = normalizeSketchDocument(document);
  const resolvedEntities = resolveAllEntities(normalizedDocument.entities, normalizedDocument.variables || []);
  const constraintResolution = resolveSketchConstraints(
    resolvedEntities,
    normalizedDocument.constraints || [],
    normalizedDocument.variables || [],
  );
  const joineryResolution = resolveSketchJoinery(constraintResolution.entities, normalizedDocument.joints || []);

  const result = {
    document: {
      ...normalizedDocument,
      entities: constraintResolution.entities,
      constraints: constraintResolution.constraints,
      joints: joineryResolution.joints,
    },
    constraintDiagnostics: constraintResolution.diagnostics,
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
 * parametric expressions. Skips the constraint solver (1271 lines) and joinery
 * resolution. Full resolution should be run on drag-end.
 */
export function resolveSketchDocumentLightweight(document) {
  const normalizedDocument = normalizeSketchDocument(document);
  const resolvedEntities = resolveAllEntities(normalizedDocument.entities, normalizedDocument.variables || []);
  return {
    ...normalizedDocument,
    entities: resolvedEntities,
  };
}
