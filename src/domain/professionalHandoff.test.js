import { describe, expect, it } from 'vitest';
import { BUILDING_COMMANDS, executeBuildingCommand } from './buildingCommands';
import { createProject, createWall } from './models';
import {
  createDocumentationModel,
  createProfessionalReviewItem,
  deriveProfessionalHandoff,
  deriveRevisionComparison,
  validateProfessionalHandoff,
} from './professionalHandoff';

function run(project, command) {
  const result = executeBuildingCommand(project, command);
  expect(result.ok, result.error?.message).toBe(true);
  return result.project;
}

describe('professional handoff and revision traceability', () => {
  it('records traceable assumptions and review items without inventing external verification', () => {
    let project = createProject('Review basis');
    project = run(project, {
      type: BUILDING_COMMANDS.CONFIGURE_DESIGN_ASSUMPTION,
      assumptionId: 'assumption_corridor',
      title: 'Owner corridor planning width',
      category: 'spatial',
      statement: 'Use 1200 mm as the owner planning target.',
      sourceLabel: 'Owner brief',
      sourceDate: '2026-08-01',
    });
    project = run(project, {
      type: BUILDING_COMMANDS.CONFIGURE_REVIEW_ITEM,
      reviewItemId: 'review_structure',
      title: 'Confirm structural member sizes',
      discipline: 'structural',
      severity: 'action',
      status: 'open',
      comment: 'Geometric members require independent capacity design.',
      createdBy: 'Owner',
      createdDate: '2026-08-01',
    });
    const handoff = deriveProfessionalHandoff(project);
    expect(handoff.assumptions).toContainEqual(
      expect.objectContaining({ id: 'assumption_corridor', confidence: 'checked' }),
    );
    expect(handoff.openReviewItems).toContainEqual(
      expect.objectContaining({ id: 'review_structure', confidence: 'modeled', externalVerification: null }),
    );
    expect(validateProfessionalHandoff(project)).toContainEqual(
      expect.objectContaining({ ruleId: 'HANDOFF.REVIEW_ITEM_OPEN', professionalReviewRequired: true }),
    );
  });

  it('requires explicit licensed-professional evidence before engineer-verified status', () => {
    let project = createProject('External verification');
    project = run(project, {
      type: BUILDING_COMMANDS.CONFIGURE_REVIEW_ITEM,
      reviewItemId: 'review_1',
      title: 'External structural review',
      discipline: 'structural',
      severity: 'action',
      comment: 'Review the preliminary structural coordination basis.',
    });
    expect(
      executeBuildingCommand(project, {
        type: BUILDING_COMMANDS.RECORD_EXTERNAL_VERIFICATION,
        reviewItemId: 'review_1',
        confirmedExternalReview: false,
        professionalName: 'Professional',
        profession: 'Civil engineer',
        licenseId: 'LICENSE',
        verificationDate: '2026-08-01',
        scopeNote: 'Reviewed coordination basis only.',
      }),
    ).toMatchObject({ ok: false, error: { code: 'external-verification-evidence-required' } });

    project = run(project, {
      type: BUILDING_COMMANDS.RECORD_EXTERNAL_VERIFICATION,
      reviewItemId: 'review_1',
      confirmedExternalReview: true,
      professionalName: 'Professional',
      profession: 'Civil engineer',
      licenseId: 'LICENSE',
      verificationDate: '2026-08-01',
      scopeNote: 'Reviewed coordination basis only; no permit approval represented.',
    });
    expect(project.building.documentation.reviewItems[0]).toMatchObject({
      confidence: 'engineer_verified',
      professionalReviewRequired: false,
      externalVerification: { professionalName: 'Professional', licenseId: 'LICENSE' },
    });
  });

  it('captures an immutable model basis and reports added, removed, and changed entities', () => {
    let project = createProject('Revision comparison');
    const floor = project.floors[0];
    floor.walls = [
      { ...createWall({ x: 0, y: 0 }, { x: 5000, y: 0 }), id: 'wall_changed' },
      { ...createWall({ x: 0, y: 1000 }, { x: 5000, y: 1000 }), id: 'wall_removed' },
    ];
    project = run(project, {
      type: BUILDING_COMMANDS.CAPTURE_REVIEW_REVISION,
      revisionId: 'revision_a',
      code: 'A',
      label: 'For professional review',
      date: '2026-08-01',
      author: 'Owner',
      purpose: 'professional_review',
    });
    expect(deriveRevisionComparison(project)).toMatchObject({ isCurrent: true, changeCount: 0 });

    project.floors[0].walls = [
      { ...project.floors[0].walls[0], thickness: 200 },
      { ...createWall({ x: 0, y: 2000 }, { x: 5000, y: 2000 }), id: 'wall_added' },
    ];
    const comparison = deriveRevisionComparison(project);
    expect(comparison.isCurrent).toBe(false);
    expect(comparison.changed.map((entry) => entry.id)).toContain('wall_changed');
    expect(comparison.removed.map((entry) => entry.id)).toContain('wall_removed');
    expect(comparison.added.map((entry) => entry.id)).toContain('wall_added');
    expect(validateProfessionalHandoff(project)).toContainEqual(
      expect.objectContaining({ ruleId: 'HANDOFF.REVISION_BASIS_CHANGED' }),
    );
  });

  it('detects incomplete external verification loaded from an external file', () => {
    const project = createProject('Invalid verification');
    project.building.documentation = createDocumentationModel({
      reviewItems: [
        createProfessionalReviewItem({
          id: 'review_bad',
          title: 'Bad external verification',
          discipline: 'structural',
          comment: 'Imported record',
          confidence: 'engineer_verified',
          externalVerification: { professionalName: 'Name' },
        }),
      ],
    });
    expect(validateProfessionalHandoff(project)).toContainEqual(
      expect.objectContaining({ ruleId: 'HANDOFF.EXTERNAL_VERIFICATION_INCOMPLETE', severity: 'error' }),
    );
  });
});
