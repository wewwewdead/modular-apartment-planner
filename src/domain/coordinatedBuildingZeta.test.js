import { describe, expect, it } from 'vitest';
import { BUILDING_COMMANDS, executeBuildingCommand } from './buildingCommands';
import { buildBuildingReport, derivePreliminaryPackage } from './documentPackage';
import { createProject, createRoom, createSlab, createWall } from './models';
import { deriveProfessionalHandoff, validateProfessionalHandoff } from './professionalHandoff';
import { resolveSheetViewportSource } from '@/sheets/sources';

function rectangle(width, depth) {
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: depth },
    { x: 0, y: depth },
  ];
}

function execute(project, command) {
  const result = executeBuildingCommand(project, command);
  expect(result.ok, result.error?.message).toBe(true);
  return result.project;
}

describe('Apartment Planner Zeta acceptance', () => {
  it('coordinates assumptions, review comments, external verification evidence, immutable revisions, change comparison, and handoff sheets', () => {
    let project = createProject('Professional handoff basis');
    const floor = project.floors[0];
    floor.walls = [{ ...createWall({ x: 0, y: 0 }, { x: 8000, y: 0 }), id: 'wall_reviewed' }];
    floor.slabs = [{ ...createSlab(floor.id, rectangle(8000, 6000), 150, 0), id: 'slab_reviewed' }];
    floor.rooms = [
      { ...createRoom('Rental unit', rectangle(8000, 6000)), id: 'room_reviewed', useCategory: 'rentable' },
    ];

    project = execute(project, {
      type: BUILDING_COMMANDS.CONFIGURE_DESIGN_ASSUMPTION,
      assumptionId: 'assumption_review_basis',
      title: 'Preliminary professional handoff basis',
      category: 'general',
      statement:
        'All modeled and checked results remain preliminary until reviewed within the stated professional scope.',
      sourceLabel: 'Owner project brief',
      sourceDate: '2026-08-01',
    });
    project = execute(project, {
      type: BUILDING_COMMANDS.CONFIGURE_REVIEW_ITEM,
      reviewItemId: 'review_structural',
      title: 'Review preliminary structural coordination',
      discipline: 'structural',
      severity: 'action',
      status: 'open',
      comment: 'Confirm the stated geometric coordination scope using signed external review documents.',
      createdBy: 'Owner',
      createdDate: '2026-08-01',
      entityRefs: [{ type: 'slab', id: 'slab_reviewed' }],
    });
    project = execute(project, {
      type: BUILDING_COMMANDS.RECORD_EXTERNAL_VERIFICATION,
      reviewItemId: 'review_structural',
      confirmedExternalReview: true,
      professionalName: 'External reviewer recorded by owner',
      profession: 'Licensed civil engineer',
      licenseId: 'OWNER-RECORDED-LICENSE-ID',
      verificationDate: '2026-08-01',
      scopeNote:
        'Owner records review of the preliminary slab-coordination scope only; signed source document controls.',
    });
    project = execute(project, {
      type: BUILDING_COMMANDS.SET_REVIEW_ITEM_STATUS,
      reviewItemId: 'review_structural',
      status: 'accepted_for_handoff',
      resolution: 'External review evidence recorded; signed source document must be checked during handoff.',
    });
    project = execute(project, {
      type: BUILDING_COMMANDS.CONFIGURE_REVIEW_ITEM,
      reviewItemId: 'review_permit',
      title: 'Confirm permitting basis',
      discipline: 'permit',
      severity: 'action',
      status: 'open',
      comment: 'Architect or permitting professional must confirm applicable requirements.',
      createdBy: 'Owner',
      createdDate: '2026-08-01',
    });
    project = execute(project, {
      type: BUILDING_COMMANDS.CAPTURE_REVIEW_REVISION,
      revisionId: 'revision_a',
      code: 'A',
      label: 'For professional review',
      date: '2026-08-01',
      author: 'Owner-builder',
      purpose: 'professional_review',
      note: 'Preliminary coordinated basis; not for construction.',
    });

    const handoff = deriveProfessionalHandoff(project);
    expect(handoff).toMatchObject({
      openReviewItems: [expect.objectContaining({ id: 'review_permit' })],
      engineerVerifiedItems: [expect.objectContaining({ id: 'review_structural' })],
      revisionComparison: { baselineRevisionId: 'revision_a', isCurrent: true, changeCount: 0 },
    });
    expect(handoff.engineerVerifiedItems[0].externalVerification).toMatchObject({
      professionalName: 'External reviewer recorded by owner',
      licenseId: 'OWNER-RECORDED-LICENSE-ID',
      verificationDate: '2026-08-01',
    });

    const manifest = derivePreliminaryPackage(project, 'zeta');
    expect(manifest.deliverables).toContainEqual(expect.objectContaining({ id: 'professional_handoff', ready: true }));
    expect(manifest.sheets.every((sheet) => sheet.revisions[0]?.code === 'A')).toBe(true);
    expect(manifest.sheets.every((sheet) => sheet.issueDate === '2026-08-01')).toBe(true);
    const registerSheet = manifest.sheets.find((sheet) => sheet.number === 'G-003');
    expect(resolveSheetViewportSource(project, registerSheet.viewports[0])).toMatchObject({
      kind: 'building_report',
      report: { title: 'Design Assumptions, Professional Review, and Revision Register' },
    });
    const report = buildBuildingReport(project, 'professional_handoff');
    expect(report.rows.map((row) => row[0])).toEqual(
      expect.arrayContaining(['Assumption', 'Review item', 'Revision basis']),
    );
    expect(report.rows.some((row) => row[3].includes('engineer_verified'))).toBe(true);
    expect(report.notes.join(' ')).toContain('user-recorded external evidence');

    project.floors[0].walls[0] = { ...project.floors[0].walls[0], thickness: 200 };
    const changedHandoff = deriveProfessionalHandoff(project);
    expect(changedHandoff.revisionComparison).toMatchObject({ isCurrent: false, changeCount: 1 });
    expect(changedHandoff.revisionComparison.changed[0]).toMatchObject({ kind: 'walls', id: 'wall_reviewed' });
    expect(validateProfessionalHandoff(project)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: 'HANDOFF.REVIEW_ITEM_OPEN' }),
        expect.objectContaining({ ruleId: 'HANDOFF.REVISION_BASIS_CHANGED' }),
      ]),
    );
  });
});
