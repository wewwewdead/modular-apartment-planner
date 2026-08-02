import { DESIGN_CONFIDENCE } from './trustModels';
import { deriveDocumentModelSignature } from './documentSignature';

function issue(ruleId, severity, message, entityRefs, inputs) {
  return {
    id: `${ruleId}:${entityRefs.map((ref) => `${ref.type}:${ref.id}`).join('|')}`,
    ruleId,
    category: 'documentation_coordination',
    severity,
    message,
    entityRefs,
    evidence: {
      resultKind: 'verified_relationship',
      confidence: DESIGN_CONFIDENCE.CHECKED,
      inputs,
    },
    professionalReviewRequired: true,
  };
}

export function validateDocumentCoordination(project) {
  const issues = [];
  const floorIds = new Set((project.floors || []).map((floor) => floor.id));
  const sectionsByFloor = new Map(
    (project.floors || []).map((floor) => [floor.id, new Set((floor.sectionCuts || []).map((cut) => cut.id))]),
  );
  const modelSignature = deriveDocumentModelSignature(project);
  const generatedSheets = (project.sheets || []).filter((sheet) => sheet.generatedFromModelSignature);
  const staleSheets = generatedSheets.filter((sheet) => sheet.generatedFromModelSignature !== modelSignature);
  if (staleSheets.length) {
    issues.push(
      issue(
        'DOC.GENERATED_PACKAGE_OUTDATED',
        'warning',
        `${staleSheets.length} generated sheet${staleSheets.length === 1 ? ' is' : 's are'} older than the current model.`,
        staleSheets.map((sheet) => ({ type: 'sheet', id: sheet.id })),
        { modelSignature, sheetSignatures: staleSheets.map((sheet) => sheet.generatedFromModelSignature) },
      ),
    );
  }

  for (const sheet of project.sheets || []) {
    if (!(sheet.viewports || []).length) {
      issues.push(
        issue('DOC.SHEET_EMPTY', 'warning', 'Sheet has no viewports.', [{ type: 'sheet', id: sheet.id }], {
          sheetNumber: sheet.number || null,
        }),
      );
    }
    for (const viewport of sheet.viewports || []) {
      if (viewport.sourceFloorId && !floorIds.has(viewport.sourceFloorId)) {
        issues.push(
          issue(
            'DOC.VIEWPORT_FLOOR_REFERENCE_BROKEN',
            'error',
            'Sheet viewport references a floor that does not exist.',
            [
              { type: 'sheet', id: sheet.id },
              { type: 'sheetViewport', id: viewport.id },
            ],
            { sourceFloorId: viewport.sourceFloorId },
          ),
        );
      }
      if (
        viewport.sourceView === 'section' &&
        viewport.sourceRefId &&
        !sectionsByFloor.get(viewport.sourceFloorId)?.has(viewport.sourceRefId)
      ) {
        issues.push(
          issue(
            'DOC.VIEWPORT_SECTION_REFERENCE_BROKEN',
            'error',
            'Section viewport references a section cut that does not exist on its source floor.',
            [
              { type: 'sheet', id: sheet.id },
              { type: 'sheetViewport', id: viewport.id },
            ],
            { sourceFloorId: viewport.sourceFloorId, sourceRefId: viewport.sourceRefId },
          ),
        );
      }
    }
  }
  return issues;
}
