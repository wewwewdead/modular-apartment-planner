import { resolveAllEntities } from '../craftsman/utils/parametricEngine';
import { normalizeSketchDocument } from './sketchDocumentUtils';
import { resolveSketchConstraints } from './sketchConstraintUtils';
import { resolveSketchJoinery } from './sketchJoineryUtils';

export function resolveSketchDocument(document) {
  const normalizedDocument = normalizeSketchDocument(document);
  const resolvedEntities = resolveAllEntities(normalizedDocument.entities, normalizedDocument.variables || []);
  const constraintResolution = resolveSketchConstraints(
    resolvedEntities,
    normalizedDocument.constraints || [],
    normalizedDocument.variables || [],
  );
  const joineryResolution = resolveSketchJoinery(
    constraintResolution.entities,
    normalizedDocument.joints || [],
  );

  return {
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
}
