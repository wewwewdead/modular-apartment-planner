import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createProject } from '@/domain/models';
import { BUILDING_COMMANDS, executeBuildingCommand } from '@/domain/buildingCommands';
import ProjectLifecyclePanel, { deriveLifecycleStatus } from './ProjectLifecyclePanel';
import { deriveTestFitCoordination } from '@/domain/testFitModels';

function derivedFixture(overrides = {}) {
  return {
    validationIssues: [],
    apartmentProgram: {
      configured: false,
      totalUnitInstances: 0,
      unitTypeSummaries: [],
    },
    siteFeasibility: {
      areaLedger: {
        lotArea: { value: null, provenance: 'unavailable' },
        buildableArea: { value: null, provenance: 'unavailable' },
        grossFloorArea: { value: 0, provenance: 'exact_from_geometry' },
        netRentableArea: { value: null, provenance: 'unavailable' },
        circulationArea: { value: null, provenance: 'unavailable' },
        openSpaceArea: { value: null, provenance: 'unavailable' },
        efficiencyRatio: { value: null, provenance: 'unavailable' },
      },
    },
    lastCommand: null,
    testFitCoordination: { profile: {}, options: [], selectedOption: null, acceptedOption: null, readyOptionCount: 0 },
    structuralRealization: {
      profile: {},
      state: { status: 'not_realized' },
      generatedStackCount: 0,
      generatedBeamCount: 0,
      continuousStackCount: 0,
      supportedBeamCount: 0,
      coordinatedSlabCount: 0,
      slabCount: 0,
      skippedBeamSegments: [],
    },
    quantityTakeoff: {
      currency: 'PHP',
      profile: { reinforcementAllowanceKgPerM3: null, unitRates: {} },
      items: [],
      totalEstimatedCost: 0,
      pricedItemCount: 0,
      unpricedItemCount: 0,
      warnings: [],
    },
    costRealization: {
      state: {
        status: 'not_realized',
        lineItemSnapshots: [],
        scenarioSnapshots: [],
        valueEngineeringOpportunities: [],
        realizedMetrics: {},
      },
      assemblyCoverage: { requiredRateKeys: [], explicitRateKeys: [], missingRateKeys: [] },
      lineItemCount: 0,
      scenarioCount: 0,
      opportunityCount: 0,
      outOfDate: false,
    },
    spatialCoordination: {
      ventilationRequiredRoomCount: 0,
      naturallyVentilatedRoomCount: 0,
      crossVentilationCandidateCount: 0,
      crossVentilatedRoomCount: 0,
    },
    documentPackage: {
      deliverables: [],
      readyDeliverableCount: 0,
      totalDeliverableCount: 0,
      generatedSheetCount: 0,
      currentGeneratedSheetCount: 0,
      outOfDate: false,
      issueCount: 0,
    },
    documentationRealization: {
      state: {
        status: 'not_issued',
        sheetSnapshots: [],
        deliverableSnapshots: [],
        unresolvedFindingSnapshots: [],
        annotationSnapshots: [],
      },
      completeness: { complete: false, missingDeliverables: [], sheetFaults: [], annotationFaults: [] },
      issuedSheetCount: 0,
      issuedDeliverableCount: 0,
      unresolvedFindingCount: 0,
      annotationCount: 0,
      outOfDate: false,
    },
    ...overrides,
  };
}

describe('ProjectLifecyclePanel', () => {
  it('derives lifecycle readiness from canonical model data', () => {
    const project = createProject();
    const initial = deriveLifecycleStatus(project, derivedFixture());
    expect(initial.brief.state).toBe('incomplete');
    expect(initial.site.state).toBe('incomplete');
    expect(initial.validate.state).toBe('ready');

    const configured = {
      ...project,
      building: {
        ...project.building,
        brief: {
          ...project.building.brief,
          targetStoreys: 2,
          targetUnitCount: 4,
          targetBudget: 8_000_000,
        },
      },
    };
    const status = deriveLifecycleStatus(
      configured,
      derivedFixture({
        validationIssues: [{ id: 'issue-1' }],
        apartmentProgram: { configured: true, totalUnitInstances: 4, unitTypeSummaries: [] },
      }),
    );
    expect(status.brief.state).toBe('ready');
    expect(status.spaces.state).toBe('ready');
    expect(status.validate).toMatchObject({ state: 'attention', value: '1 issue' });
  });

  it('renders all lifecycle stages and the editable brief', () => {
    const html = renderToStaticMarkup(
      <ProjectLifecyclePanel
        project={createProject()}
        derived={derivedFixture()}
        activeStage="brief"
        onStageChange={() => {}}
        onExecuteCommand={() => {}}
      />,
    );

    for (const label of ['Brief', 'Site', 'Spaces', 'Structure', 'Systems', 'Validate', 'Quantities', 'Documents']) {
      expect(html).toContain(label);
    }
    expect(html).toContain('Construction budget (PHP)');
    expect(html).toContain('Apply brief');
  });

  it('keeps the structural trust boundary visible', () => {
    const html = renderToStaticMarkup(
      <ProjectLifecyclePanel
        project={createProject()}
        derived={derivedFixture()}
        activeStage="structure"
        onStageChange={() => {}}
        onExecuteCommand={() => {}}
      />,
    );

    expect(html).toContain('Modeled relationships—not structural capacity.');
    expect(html).toContain('Accepted-grid structural realization');
    expect(html).toContain('Realized column width');
    expect(html).toContain('Realized beam depth');
    expect(html).toContain('Realize accepted structural basis');
    expect(html).toContain('No loads, reactions, capacity, reinforcement, foundations');
    expect(html).toContain('do not mean engineer-verified or structurally safe');
  });

  it('marks Structure ready only when the coordinated structural basis is realized', () => {
    const project = createProject();
    project.building.systems.structural.gridSystems = [{ id: 'proposed_grid', axes: [] }];
    expect(deriveLifecycleStatus(project, derivedFixture()).structure).toMatchObject({ state: 'incomplete' });
    expect(
      deriveLifecycleStatus(
        project,
        derivedFixture({
          structuralRealization: { state: { status: 'realized' }, generatedStackCount: 12 },
        }),
      ).structure,
    ).toMatchObject({ state: 'ready', value: '12 stacks · realized' });
  });

  it('renders metric lot, orientation, frontage, and setback controls for the site stage', () => {
    const html = renderToStaticMarkup(
      <ProjectLifecyclePanel
        project={createProject()}
        derived={derivedFixture()}
        activeStage="site"
        onStageChange={() => {}}
        onExecuteCommand={() => {}}
      />,
    );

    expect(html).toContain('Rectangular lot setup');
    expect(html).toContain('Lot width (m)');
    expect(html).toContain('North angle (°)');
    expect(html).toContain('Road frontage');
    expect(html).toContain('Front setback (m)');
    expect(html).toContain('Apply site constraints');
  });

  it('renders parametric structural grid controls without claiming analysis', () => {
    const html = renderToStaticMarkup(
      <ProjectLifecyclePanel
        project={createProject()}
        derived={derivedFixture()}
        activeStage="structure"
        onStageChange={() => {}}
        onExecuteCommand={() => {}}
      />,
    );

    expect(html).toContain('Regular structural grid');
    expect(html).toContain('Numbered axes');
    expect(html).toContain('Lettered spacing (m)');
    expect(html).toContain('Create structural grid');
    expect(html).toContain('Modeled and checked do not mean engineer-verified or structurally safe.');
    expect(html).toContain('Early structural coordination assumptions');
    expect(html).toContain('Maximum beam span (m)');
    expect(html).toContain('screening limits for early coordination');
  });

  it('offers explicit all-level stack population after a grid exists', () => {
    const project = createProject();
    const configured = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.CONFIGURE_REGULAR_STRUCTURAL_GRID,
      gridId: 'grid_ui',
      xAxisCount: 2,
      yAxisCount: 2,
      xSpacing: 4000,
      ySpacing: 4000,
    }).project;
    const html = renderToStaticMarkup(
      <ProjectLifecyclePanel
        project={configured}
        derived={derivedFixture()}
        activeStage="structure"
        onStageChange={() => {}}
        onExecuteCommand={() => {}}
      />,
    );

    expect(html).toContain('Column stacks at intersections');
    expect(html).toContain('Populate stacks on all 1 levels');
    expect(html).toContain('Section dimensions are modeled assumptions, not capacity calculations.');
  });

  it('renders explicit wet-service shaft controls and hydraulic-design disclaimer', () => {
    const html = renderToStaticMarkup(
      <ProjectLifecyclePanel
        project={createProject()}
        derived={{ ...derivedFixture(), wetCore: { wetFixtureCount: 2, assignedFixtureCount: 0 } }}
        activeStage="systems"
        onStageChange={() => {}}
        onExecuteCommand={() => {}}
      />,
    );
    expect(html).toContain('Vertical wet-service shaft');
    expect(html).toContain('Fixture planning distance (m)');
    expect(html).toContain('Create wet-service shaft');
    expect(html).toContain('not hydraulic design');
    expect(html).toContain('Named coordination assumptions');
    expect(html).toContain('Electrical riser zone');
    expect(html).toContain('Room-to-exit path');
    expect(html).toContain('Maximum egress route (m)');
  });

  it('renders guided typical-unit and four-unit program authoring controls', () => {
    const html = renderToStaticMarkup(
      <ProjectLifecyclePanel
        project={createProject()}
        derived={derivedFixture()}
        activeStage="spaces"
        onStageChange={() => {}}
        onExecuteCommand={() => {}}
      />,
    );
    expect(html).toContain('Typical apartment definition');
    expect(html).toContain('Planned units');
    expect(html).toContain('Preferred area (m²)');
    expect(html).toContain('1× Living / sleeping area');
    expect(html).toContain('Create typical unit program');
  });

  it('renders deterministic test-fit assumptions, alternatives, and guarded acceptance', () => {
    let project = createProject();
    project = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.CONFIGURE_RECTANGULAR_SITE,
      width: 16_000,
      depth: 24_000,
      northAngle: 0,
      frontEdgeIndex: 0,
      roadName: 'Road',
      setbacks: { front: 1000, rear: 1000, left: 1000, right: 1000 },
    }).project;
    project = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.UPDATE_PROJECT_BRIEF,
      updates: { targetStoreys: 2, targetUnitCount: 4, targetBudget: 10_000_000 },
    }).project;
    project = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.CONFIGURE_TYPICAL_UNIT_PROGRAM,
      unitType: {
        id: 'fit_studio',
        name: 'Test Studio',
        category: 'studio',
        targetArea: { min: 20_000_000, preferred: 24_000_000, max: 30_000_000 },
        spaceRequirements: [],
      },
      targetCount: 4,
      parkingRequirement: 0,
    }).project;
    project = executeBuildingCommand(project, { type: BUILDING_COMMANDS.GENERATE_TEST_FIT_OPTIONS }).project;
    const html = renderToStaticMarkup(
      <ProjectLifecyclePanel
        project={project}
        derived={derivedFixture({ testFitCoordination: deriveTestFitCoordination(project) })}
        activeStage="spaces"
        onStageChange={() => {}}
        onExecuteCommand={() => {}}
      />,
    );
    expect(html).toContain('Program-to-test-fit composer');
    expect(html).toContain('Single-loaded tropical scheme');
    expect(html).toContain('Double-loaded compact scheme');
    expect(html).toContain('Generate deterministic alternatives');
    expect(html).toContain('Accept as provisional model');
    expect(html).toContain('not code approval, structural design, or professional verification');
  });

  it('exposes guarded type capture, instance placement, and linked propagation controls', () => {
    let project = createProject();
    project = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.CREATE_UNIT_TYPE,
      unitType: {
        id: 'studio_ui',
        name: 'Typical Studio',
        category: 'studio',
        spaceRequirements: [{ id: 'studio_ui_living', spaceType: 'living_sleeping' }],
      },
    }).project;
    project = executeBuildingCommand(project, {
      type: BUILDING_COMMANDS.CREATE_UNIT_INSTANCE,
      instanceId: 'studio_ui_1',
      typeId: 'studio_ui',
      floorId: project.floors[0].id,
      name: 'Studio 1',
    }).project;
    const html = renderToStaticMarkup(
      <ProjectLifecyclePanel
        project={project}
        derived={derivedFixture({
          apartmentProgram: {
            configured: true,
            totalUnitInstances: 1,
            unitTypeSummaries: [
              { unitTypeId: 'studio_ui', linkedInstanceCount: 1, targetCount: 1, geometryTemplateReady: false },
            ],
          },
        })}
        activeStage="spaces"
        onStageChange={() => {}}
        onExecuteCommand={() => {}}
      />,
    );
    expect(html).toContain('Linked unit geometry');
    expect(html).toContain('X placement for Studio 1');
    expect(html).toContain('Capture type from mapped source');
    expect(html).toContain('Update 1 linked unit');
    expect(html).toContain('manually mapped targets are never overwritten');
  });

  it('exposes deterministic apartment-detail assumptions and their professional-review boundary', () => {
    const html = renderToStaticMarkup(
      <ProjectLifecyclePanel
        project={createProject()}
        derived={derivedFixture()}
        activeStage="spaces"
        onStageChange={() => {}}
        onExecuteCommand={() => {}}
      />,
    );
    expect(html).toContain('Apartment design closure');
    expect(html).toContain('Apartment accessible entry width');
    expect(html).toContain('Apartment accessible circulation width');
    expect(html).toContain('Apartment solar review orientations');
    expect(html).toContain('Detail accepted test fit');
    expect(html).toContain('do not prove accessibility, fire-code compliance');
  });

  it('exposes guarded Lambda systems realization with explicit trade-design limits', () => {
    const html = renderToStaticMarkup(
      <ProjectLifecyclePanel
        project={createProject()}
        derived={derivedFixture({
          servicesRealization: {
            profile: {
              electricalRiserWidth: 450,
              electricalRiserDepth: 450,
              panelWidth: 800,
              panelDepth: 300,
              equipmentClearance: 600,
              minimumDrainSlopePercent: 1,
              electricalPointsPerUnit: 3,
            },
            state: { status: 'realized' },
            actualEntityCounts: {
              drainageRoutes: 12,
              electricalRisers: 1,
              slabOpenings: 1,
              panelZones: 2,
              electricalPoints: 12,
              waterEquipmentZones: 2,
              outdoorUnitZones: 2,
            },
            unresolvedItems: [],
          },
        })}
        activeStage="systems"
        onStageChange={() => {}}
        onExecuteCommand={() => {}}
      />,
    );
    expect(html).toContain('Lambda · coordinated systems realization');
    expect(html).toContain('Drainage branches');
    expect(html).toContain('Electrical riser / openings');
    expect(html).toContain('Regenerate coordinated building systems');
    expect(html).toContain('not hydraulic design, electrical design');
  });

  it('renders traceable takeoff rows, partial pricing, and editable estimating assumptions', () => {
    const html = renderToStaticMarkup(
      <ProjectLifecyclePanel
        project={createProject()}
        derived={derivedFixture({
          quantityTakeoff: {
            currency: 'PHP',
            profile: { reinforcementAllowanceKgPerM3: null, unitRates: {} },
            items: [
              {
                id: 'concrete',
                label: 'Structural concrete',
                quantity: 12.5,
                unit: 'm³',
                provenance: 'exact_from_geometry',
                estimatedCost: null,
              },
            ],
            totalEstimatedCost: 0,
            pricedItemCount: 0,
            unpricedItemCount: 1,
            warnings: ['Reinforcement needs an explicit allowance.'],
          },
        })}
        activeStage="quantities"
        onStageChange={() => {}}
        onExecuteCommand={() => {}}
      />,
    );

    expect(html).toContain('Structural concrete');
    expect(html).toContain('Exact from geometry');
    expect(html).toContain('Rate needed');
    expect(html).toContain('Rebar allowance (kg/m³ concrete)');
    expect(html).toContain('Apply estimating assumptions');
    expect(html).toContain('Philippine source-dated price profile');
    expect(html).toContain('Configured assembly factors');
    expect(html).toContain('Budget and rental scenario');
    expect(html).toContain('Mu · coordinated quantity and cost realization');
    expect(html).toContain('Accept coordinated cost baseline');
    expect(html).toContain('Owner feasibility estimate');
    expect(html).toContain('not bids, appraisals, lending advice, purchase orders');
  });

  it('shows spatial and tropical ventilation coordination without claiming code approval', () => {
    const html = renderToStaticMarkup(
      <ProjectLifecyclePanel
        project={createProject()}
        derived={derivedFixture({
          spatialCoordination: {
            ventilationRequiredRoomCount: 4,
            naturallyVentilatedRoomCount: 3,
            crossVentilationCandidateCount: 3,
            crossVentilatedRoomCount: 1,
          },
        })}
        activeStage="validate"
        onStageChange={() => {}}
        onExecuteCommand={() => {}}
      />,
    );
    expect(html).toContain('Natural ventilation');
    expect(html).toContain('3/4 rooms');
    expect(html).toContain('1/3 candidates');
    expect(html).toContain('not Philippine code or permit determinations');
  });

  it('shows document-package readiness and a guarded generation action', () => {
    const html = renderToStaticMarkup(
      <ProjectLifecyclePanel
        project={createProject()}
        derived={derivedFixture({
          documentPackage: {
            deliverables: [
              { id: 'site_plan', label: 'Site development plan', ready: true },
              { id: 'section', label: 'Building section', ready: false },
            ],
            readyDeliverableCount: 1,
            totalDeliverableCount: 2,
            generatedSheetCount: 0,
            currentGeneratedSheetCount: 0,
            outOfDate: false,
            issueCount: 3,
          },
          professionalHandoff: {
            assumptions: [],
            openReviewItems: [{ id: 'review_1' }],
            engineerVerifiedItems: [],
            documentation: {
              reviewItems: [
                {
                  id: 'review_1',
                  title: 'Confirm member sizes',
                  discipline: 'structural',
                  severity: 'action',
                  status: 'open',
                  confidence: 'modeled',
                },
              ],
              revisionSnapshots: [],
            },
            revisionComparison: { baseline: null },
          },
        })}
        activeStage="documents"
        onStageChange={() => {}}
        onExecuteCommand={() => {}}
      />,
    );
    expect(html).toContain('Site development plan');
    expect(html).toContain('Building section');
    expect(html).toContain('Missing basis');
    expect(html).toContain('Generate preliminary package');
    expect(html).toContain('Traceable design assumption');
    expect(html).toContain('Professional review register');
    expect(html).toContain('External professional verification evidence');
    expect(html).toContain('Immutable review revision');
    expect(html).toContain('Nu · coordinated professional documentation realization');
    expect(html).toContain('Issue coordinated professional-review package');
    expect(html).toContain('not a permit submission, construction authorization');
    expect(html).toContain('does not perform or grant approval');
    expect(html).toContain('not permit or construction approval');
  });
});
