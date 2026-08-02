import { describe, expect, it } from 'vitest';
import { deserializeProject } from '@/persistence/deserialize';
import { serializeProject } from '@/persistence/serialize';
import { BUILDING_COMMANDS, executeBuildingCommand } from './buildingCommands';
import { validateBuildingCoordination } from './buildingGraph';
import { deriveDocumentationRealization } from './documentationRealization';
import { buildBuildingReport, derivePreliminaryPackage } from './documentPackage';
import { createProject, createSectionCut } from './models';
import { deriveProfessionalHandoff } from './professionalHandoff';
import { QUANTITY_RATE_KEYS } from './quantityTakeoff';
import { compareProfessionalExchanges, deriveProfessionalExchange } from './professionalExchange';
import { buildArchitecturalSheetDxf, buildProfessionalExchangeArchive } from '@/export/professionalExchangeExport';
import JSZip from 'jszip';

function run(project, command) {
  const result = executeBuildingCommand(project, command);
  expect(result.ok, result.error?.message).toBe(true);
  return result.project;
}

function completeRates(materialMultiplier = 1) {
  return Object.fromEntries(
    QUANTITY_RATE_KEYS.map((rateKey, index) => [
      rateKey,
      {
        material: Math.round((1200 + index * 110) * materialMultiplier),
        labor: 450 + index * 35,
        equipment: 100 + index * 10,
      },
    ]),
  );
}

function buildMuBasis() {
  let project = createProject('Nu professional-review apartment');
  project = run(project, {
    type: BUILDING_COMMANDS.CONFIGURE_RECTANGULAR_SITE,
    width: 16_000,
    depth: 24_000,
    northAngle: 0,
    frontEdgeIndex: 0,
    roadName: 'Municipal road',
    setbacks: { front: 1000, rear: 1000, left: 1000, right: 1000 },
  });
  project = run(project, {
    type: BUILDING_COMMANDS.UPDATE_PROJECT_BRIEF,
    updates: {
      targetStoreys: 2,
      targetUnitCount: 4,
      targetBudget: 10_000_000,
      targetRentalIncome: 80_000,
      currency: 'PHP',
      preferredStructuralSystem: 'reinforced_concrete_frame',
    },
  });
  project = run(project, {
    type: BUILDING_COMMANDS.CONFIGURE_TYPICAL_UNIT_PROGRAM,
    unitType: {
      id: 'nu_studio',
      name: 'Typical Studio',
      category: 'studio',
      targetArea: { min: 20_000_000, preferred: 24_000_000, max: 30_000_000 },
      spaceRequirements: [],
    },
    targetCount: 4,
    parkingRequirement: 0,
  });
  project = run(project, {
    type: BUILDING_COMMANDS.CONFIGURE_TEST_FIT_PROFILE,
    unitDepth: 5000,
    corridorWidth: 1500,
    stairWidth: 2400,
    stairDepth: 4500,
    wetCoreWidth: 1200,
    wetCoreDepth: 1800,
    structuralBayTarget: 5500,
    floorToFloorHeight: 3000,
    planningCostPerSquareMeter: 25_000,
    currency: 'PHP',
  });
  project = run(project, { type: BUILDING_COMMANDS.GENERATE_TEST_FIT_OPTIONS });
  const option = project.building.testFitOptions.find(
    (entry) => !entry.findings.some((finding) => finding.severity === 'error'),
  );
  project = run(project, { type: BUILDING_COMMANDS.ACCEPT_TEST_FIT_OPTION, optionId: option.id });
  project = run(project, { type: BUILDING_COMMANDS.DETAIL_ACCEPTED_TEST_FIT });
  project = run(project, { type: BUILDING_COMMANDS.REALIZE_ACCEPTED_STRUCTURAL_BASIS });
  project = run(project, { type: BUILDING_COMMANDS.REALIZE_ACCEPTED_BUILDING_SYSTEMS });
  project = run(project, {
    type: BUILDING_COMMANDS.CONFIGURE_QUANTITY_PROFILE,
    currency: 'PHP',
    reinforcementAllowanceKgPerM3: 100,
    excavationDepth: 500,
    unitRates: {},
  });
  for (const profile of [
    { id: 'nu_owner_prices', name: 'Owner canvass', sourceLabel: 'Owner supplier canvass', rates: completeRates(1) },
    {
      id: 'nu_alternative_prices',
      name: 'Alternative canvass',
      sourceLabel: 'Alternative supplier canvass',
      rates: completeRates(0.9),
    },
  ]) {
    project = run(project, {
      type: BUILDING_COMMANDS.CONFIGURE_PRICE_PROFILE,
      profileId: profile.id,
      name: profile.name,
      region: 'Region IV-A',
      locality: 'Owner project locality',
      sourceLabel: profile.sourceLabel,
      sourceDate: '2026-08-01',
      currency: 'PHP',
      rates: profile.rates,
    });
  }
  project = run(project, {
    type: BUILDING_COMMANDS.CONFIGURE_ASSEMBLY_CATALOG,
    assemblies: QUANTITY_RATE_KEYS.map((rateKey) => ({
      id: `nu_assembly_${rateKey}`,
      name: `${rateKey} owner assembly`,
      rateKey,
      wastePercent: 5,
      materialFactor: 1,
      laborFactor: 1,
      equipmentFactor: 1,
    })),
  });
  const scenario = {
    contingencyPercent: 10,
    professionalFeesPercent: 7,
    permitAllowance: 100_000,
    otherAllowance: 50_000,
    monthlyGrossRent: 80_000,
    vacancyPercent: 8,
    operatingExpensePercent: 22,
  };
  project = run(project, {
    type: BUILDING_COMMANDS.CONFIGURE_FEASIBILITY_SCENARIO,
    scenarioId: 'nu_owner_baseline',
    name: 'Owner baseline',
    priceProfileId: 'nu_owner_prices',
    ...scenario,
    setActive: true,
  });
  project = run(project, {
    type: BUILDING_COMMANDS.CONFIGURE_FEASIBILITY_SCENARIO,
    scenarioId: 'nu_alternative',
    name: 'Alternative supplier',
    priceProfileId: 'nu_alternative_prices',
    ...scenario,
    setActive: false,
  });
  project = run(project, { type: BUILDING_COMMANDS.REALIZE_QUANTITY_COST_BASELINE });
  return { project, option };
}

function addRequiredSection(project) {
  const floorId = project.floors[0].id;
  return {
    ...project,
    floors: project.floors.map((floor) =>
      floor.id === floorId
        ? {
            ...floor,
            sectionCuts: [
              {
                ...createSectionCut({ x: -1000, y: 4000 }, { x: 15_000, y: 4000 }),
                id: 'nu_section_a',
                label: 'Section A-A',
              },
            ],
          }
        : floor,
    ),
  };
}

function captureIssueRevision(project) {
  return run(project, {
    type: BUILDING_COMMANDS.CAPTURE_REVIEW_REVISION,
    revisionId: 'nu_revision_a',
    code: 'A',
    label: 'For coordinated professional review',
    date: '2026-08-01',
    author: 'Owner-builder',
    purpose: 'professional_review',
    note: 'Preliminary coordinated basis for licensed-professional review.',
  });
}

describe('Apartment Planner Nu acceptance', () => {
  it('issues one current review package with complete sheets, schedules, annotations, findings, revision, and persistence', () => {
    let { project, option } = buildMuBasis();
    project = addRequiredSection(project);
    project = captureIssueRevision(project);
    project = run(project, { type: BUILDING_COMMANDS.ISSUE_COORDINATED_REVIEW_PACKAGE });

    const realization = deriveDocumentationRealization(project);
    expect(realization).toMatchObject({
      state: expect.objectContaining({
        status: 'issued',
        packageId: 'nu_review',
        sourceTestFitId: option.id,
        sourceRevisionId: 'nu_revision_a',
        issueCode: 'A',
        issueDate: '2026-08-01',
        preparedBy: 'Owner-builder',
        permitStatus: 'not_a_permit_submission',
        constructionStatus: 'not_for_construction',
        professionalSealStatus: 'not_provided',
      }),
      outOfDate: false,
      completeness: expect.objectContaining({
        complete: true,
        missingDeliverables: [],
        sheetFaults: [],
        annotationFaults: [],
      }),
      professionalReviewRequired: true,
    });
    expect(realization.issuedSheetCount).toBeGreaterThan(10);
    expect(realization.issuedDeliverableCount).toBeGreaterThan(15);
    expect(realization.annotationCount).toBeGreaterThan(0);
    expect(realization.state.sheetSnapshots.every((entry) => entry.issueDate === '2026-08-01')).toBe(true);
    expect(realization.state.sheetSnapshots.every((entry) => entry.revisionCodes.includes('A'))).toBe(true);
    expect(
      realization.state.sheetSnapshots.flatMap((entry) => entry.viewportSnapshots).map((entry) => entry.sourceView),
    ).toEqual(
      expect.arrayContaining([
        'plan',
        'elevation_front',
        'section',
        'structural_plan',
        'services_plan',
        'building_report',
        '3d_preview',
      ]),
    );

    const packageManifest = derivePreliminaryPackage(project, 'nu_review');
    expect(packageManifest).toMatchObject({
      hasDocumentationRealization: true,
      documentationRealizationOutOfDate: false,
      generatedSheetCount: realization.issuedSheetCount,
      currentGeneratedSheetCount: realization.issuedSheetCount,
      outOfDate: false,
    });
    expect(packageManifest.deliverables).toContainEqual(
      expect.objectContaining({ id: 'documentation_realization_basis', ready: true }),
    );
    expect(packageManifest.sheets.find((entry) => entry.number === 'Q-001').viewports).toContainEqual(
      expect.objectContaining({ sourceRefId: 'documentation_realization_basis' }),
    );
    const report = buildBuildingReport(project, 'documentation_realization_basis');
    expect(report.title).toBe('Nu Professional-Review Documentation Issue Register');
    expect(report.rows.flat().join(' ')).toContain('For coordinated professional review');
    expect(report.notes.join(' ')).toContain('not a permit submission');

    expect(deriveProfessionalHandoff(project)).toMatchObject({
      documentationRealizationState: expect.objectContaining({ status: 'issued', sourceRevisionId: 'nu_revision_a' }),
    });
    expect(
      validateBuildingCoordination(project).filter(
        (entry) => entry.ruleId.startsWith('DOC.REALIZATION_') && entry.severity === 'error',
      ),
    ).toEqual([]);

    const restored = deserializeProject(serializeProject(project)).project;
    expect(restored.building.documentationRealization).toEqual(project.building.documentationRealization);
    expect(deriveDocumentationRealization(restored)).toMatchObject({
      outOfDate: false,
      issuedSheetCount: realization.issuedSheetCount,
    });
  });

  it('guards revision and section completeness, then marks an issued package stale after a model change', () => {
    let { project } = buildMuBasis();
    project = addRequiredSection(project);
    expect(executeBuildingCommand(project, { type: BUILDING_COMMANDS.ISSUE_COORDINATED_REVIEW_PACKAGE })).toMatchObject(
      {
        ok: false,
        error: { code: 'current-review-revision-required' },
      },
    );

    let missingSection = buildMuBasis().project;
    missingSection = captureIssueRevision(missingSection);
    expect(
      executeBuildingCommand(missingSection, { type: BUILDING_COMMANDS.ISSUE_COORDINATED_REVIEW_PACKAGE }),
    ).toMatchObject({
      ok: false,
      error: {
        code: 'documentation-package-incomplete',
        details: { missingDeliverableIds: expect.arrayContaining(['section']) },
      },
    });

    project = captureIssueRevision(project);
    project = run(project, { type: BUILDING_COMMANDS.ISSUE_COORDINATED_REVIEW_PACKAGE });
    const alteredOutput = {
      ...project,
      sheets: project.sheets.map((sheet, index) =>
        index === 0 ? { ...sheet, title: `${sheet.title} altered` } : sheet,
      ),
    };
    expect(deriveDocumentationRealization(alteredOutput)).toMatchObject({ outputAltered: true, outOfDate: true });
    expect(validateBuildingCoordination(alteredOutput)).toContainEqual(
      expect.objectContaining({ ruleId: 'DOC.REALIZATION_OUTPUT_ALTERED' }),
    );
    const firstWall = project.floors[0].walls[0];
    project = {
      ...project,
      floors: project.floors.map((floor, index) =>
        index === 0
          ? {
              ...floor,
              walls: floor.walls.map((wall) =>
                wall.id === firstWall.id ? { ...wall, end: { ...wall.end, x: wall.end.x + 100 } } : wall,
              ),
            }
          : floor,
      ),
    };
    expect(deriveDocumentationRealization(project).outOfDate).toBe(true);
    expect(validateBuildingCoordination(project)).toContainEqual(
      expect.objectContaining({ ruleId: 'DOC.REALIZATION_OUTDATED' }),
    );
    expect(derivePreliminaryPackage(project, 'nu_review').deliverables).toContainEqual(
      expect.objectContaining({ id: 'documentation_realization_basis', ready: false }),
    );
  }, 15_000);
});

describe('Apartment Planner Xi acceptance', () => {
  it('publishes complete Nu artifacts, exchanges markups, preserves responses, compares issues, and persists trust boundaries', async () => {
    let { project } = buildMuBasis();
    project = addRequiredSection(project);
    project = captureIssueRevision(project);
    project = run(project, { type: BUILDING_COMMANDS.ISSUE_COORDINATED_REVIEW_PACKAGE });
    project = run(project, {
      type: BUILDING_COMMANDS.PUBLISH_PROFESSIONAL_EXCHANGE,
      exchangeId: 'xi_issue_a',
      label: 'Issue A review exchange',
      publishedDate: '2026-08-01',
      publishedBy: 'Owner-builder',
    });

    let exchange = deriveProfessionalExchange(project);
    expect(exchange).toMatchObject({
      exchangeCount: 1,
      outOfDate: false,
      activeExchange: expect.objectContaining({
        id: 'xi_issue_a',
        sourceRevisionId: 'nu_revision_a',
        artifactStatus: 'ready_for_user_download',
        manifest: expect.objectContaining({
          format: 'apartment-design-engineer/professional-review-exchange',
          formatVersion: 1,
          boundaries: {
            purpose: 'external_professional_review_exchange',
            ifcCertificationStatus: 'not_ifc_certified',
            permitAcceptanceStatus: 'not_accepted_or_submitted',
            professionalApprovalStatus: 'not_claimed',
            constructionStatus: 'not_for_construction',
            statement: expect.stringContaining('do not grant approval'),
          },
        }),
      }),
    });
    expect(exchange.activeExchange.manifest.sheets.length).toBeGreaterThan(10);
    expect(exchange.activeExchange.manifest.files.multiSheetPdf).toMatchObject({
      mediaType: 'application/pdf',
      pageCount: exchange.activeExchange.manifest.sheets.length,
      mode: 'single_multi_sheet_vector_pdf',
    });
    expect(exchange.activeExchange.manifest.files.dxf).toHaveLength(exchange.activeExchange.manifest.sheets.length);

    const planSheet = project.sheets.find((entry) => entry.number === 'A-101');
    const dxf = buildArchitecturalSheetDxf(project, planSheet);
    expect(dxf).toContain('AC1009');
    expect(dxf).toContain('$INSUNITS');
    expect(dxf).toContain('A-WALL');

    project = run(project, {
      type: BUILDING_COMMANDS.IMPORT_REVIEWER_MARKUP,
      id: 'markup_a_01',
      exchangeId: 'xi_issue_a',
      sheetId: planSheet.id,
      title: 'Coordinate stair landing',
      comment: 'Please confirm the landing and beam clearance.',
      discipline: 'structural',
      author: 'External reviewer',
      organization: 'Review office',
      createdDate: '2026-08-02',
      sourceFileName: 'Issue-A-markups.pdf',
    });
    project = run(project, {
      type: BUILDING_COMMANDS.RECORD_EXTERNAL_PROFESSIONAL_RESPONSE,
      id: 'response_a_01',
      markupId: 'markup_a_01',
      responderName: 'Engineer Reviewer',
      profession: 'Civil Engineer',
      licenseId: 'external-record-001',
      responseDate: '2026-08-03',
      response: 'Revise the landing edge before the next issue.',
      disposition: 'revise',
      sourceFileName: 'response-letter.pdf',
    });
    project = run(project, {
      type: BUILDING_COMMANDS.IMPORT_REVIEWER_MARKUP_EXCHANGE,
      exchangeId: 'xi_issue_a',
      sourceFileName: 'reviewer-markups.json',
      payload: JSON.stringify({
        format: 'apartment-design-engineer/reviewer-markups-v1',
        exchangeId: 'xi_issue_a',
        markups: [
          {
            id: 'markup_a_02',
            sheetId: planSheet.id,
            title: 'Review window alignment',
            comment: 'Coordinate the window with the adjacent column.',
            discipline: 'architectural',
            author: 'External reviewer',
            createdDate: '2026-08-02',
          },
        ],
      }),
    });
    exchange = deriveProfessionalExchange(project);
    expect(exchange).toMatchObject({ markupCount: 2, openMarkupCount: 1, externalResponseCount: 1 });
    expect(exchange.state.externalResponses[0]).toMatchObject({
      preservedAsExternalRecord: true,
      professionalApprovalStatus: 'not_claimed',
      permitAcceptanceStatus: 'not_claimed',
      confidence: 'modeled',
    });

    project = run(project, {
      type: BUILDING_COMMANDS.PUBLISH_PROFESSIONAL_EXCHANGE,
      exchangeId: 'xi_issue_a_copy',
      label: 'Issue A transfer copy',
    });
    expect(compareProfessionalExchanges(project, 'xi_issue_a', 'xi_issue_a_copy')).toMatchObject({
      changeCount: 0,
      modelChanged: false,
      revisionChanged: false,
    });

    const archive = await buildProfessionalExchangeArchive(project, {
      exchangeId: 'xi_issue_a',
      pdfBlob: new Blob(['%PDF-1.4\n%%EOF'], { type: 'application/pdf' }),
    });
    const zip = await JSZip.loadAsync(await archive.arrayBuffer());
    const paths = Object.keys(zip.files);
    expect(paths).toContain(exchange.state.exchanges[0].manifest.files.manifest.path);
    expect(paths).toContain(exchange.state.exchanges[0].manifest.files.multiSheetPdf.path);
    expect(paths.filter((path) => path.endsWith('.dxf'))).toHaveLength(project.sheets.length);
    expect(paths).toContain(exchange.state.exchanges[0].manifest.files.markups.path);
    expect(paths).toContain(exchange.state.exchanges[0].manifest.files.responses.path);

    const report = buildBuildingReport(project, 'professional_exchange_register');
    expect(report.title).toContain('Xi Professional Interoperability');
    expect(report.notes.join(' ')).toContain('not IFC-certified');
    expect(deriveProfessionalHandoff(project)).toMatchObject({
      professionalExchangeState: expect.objectContaining({ status: 'published', activeExchangeId: 'xi_issue_a_copy' }),
    });
    expect(
      validateBuildingCoordination(project).filter(
        (entry) => entry.ruleId.startsWith('EXCHANGE.') && entry.severity === 'error',
      ),
    ).toEqual([]);

    const restored = deserializeProject(serializeProject(project)).project;
    expect(restored.building.professionalExchange).toEqual(project.building.professionalExchange);
    expect(deriveProfessionalExchange(restored)).toMatchObject({
      exchangeCount: 2,
      markupCount: 2,
      externalResponseCount: 1,
    });
  });

  it('guards publication and broken review exchange relationships', () => {
    const empty = createProject('Xi guard project');
    expect(executeBuildingCommand(empty, { type: BUILDING_COMMANDS.PUBLISH_PROFESSIONAL_EXCHANGE })).toMatchObject({
      ok: false,
      error: { code: 'current-documentation-issue-required' },
    });
    expect(
      executeBuildingCommand(empty, { type: BUILDING_COMMANDS.IMPORT_REVIEWER_MARKUP, id: 'm1', comment: 'Review' }),
    ).toMatchObject({
      ok: false,
      error: { code: 'exchange-not-found' },
    });
  });
});
