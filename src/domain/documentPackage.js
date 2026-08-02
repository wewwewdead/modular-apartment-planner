import { createSheet, createSheetViewport } from './sheetModels';
import { validateBuildingCoordination } from './buildingGraph';
import { deriveQuantityTakeoff } from './quantityTakeoff';
import { deriveFeasibilityComparison, deriveFeasibilityEconomics } from './feasibilityEconomics';
import { deriveProfessionalHandoff } from './professionalHandoff';
import { deriveDocumentModelSignature } from './documentSignature';
import { beamLength } from '@/geometry/beamGeometry';
import { polygonArea } from '@/geometry/polygon';
import { deriveApartmentDesignCoordination } from './apartmentDesign';
import { deriveSpatialCoordination } from './spatialValidation';
import { deriveStructuralRealization } from './structuralRealization';
import { deriveServicesRealization } from './servicesRealization';
import { deriveCostRealization } from './costRealization';

export { deriveDocumentModelSignature } from './documentSignature';

export const PRELIMINARY_PACKAGE_KIND = 'apartment_alpha_preliminary';

function stableId(project, packageId, kind, suffix) {
  return `${project.id}_${packageId}_${kind}_${suffix}`;
}

function reportRow(...cells) {
  return cells.map((cell) => String(cell ?? ''));
}

function areaM2(value) {
  return ((Number(value) || 0) / 1_000_000).toFixed(2);
}

function quantityValue(item) {
  return `${item.quantity.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${item.unit}`;
}

function issuedSheetMatchesSnapshot(sheet, snapshot) {
  if (!sheet || !snapshot) return false;
  return (
    JSON.stringify({
      id: sheet.id,
      number: sheet.number,
      title: sheet.title,
      paperSize: sheet.paperSize,
      issueDate: sheet.issueDate,
      drawnBy: sheet.titleBlock?.drawnBy || '',
      revisionCodes: (sheet.revisions || []).map((entry) => entry.code),
      viewportSnapshots: (sheet.viewports || []).map((entry) => ({
        id: entry.id,
        sourceView: entry.sourceView,
        sourceFloorId: entry.sourceFloorId,
        sourceRefId: entry.sourceRefId,
        scale: entry.scale,
        role: entry.role,
      })),
      generatedFromModelSignature: sheet.generatedFromModelSignature,
    }) === JSON.stringify(snapshot)
  );
}

function decimalValue(value, suffix = '') {
  return value == null
    ? 'Withheld'
    : `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}${suffix}`;
}

export function buildBuildingReport(project, reportType) {
  if (reportType === 'professional_exchange_register') {
    const state = project.building?.professionalExchange || {};
    const active = (state.exchanges || []).find((entry) => entry.id === state.activeExchangeId) || null;
    const rows = [
      reportRow(
        'Active exchange',
        active?.id || 'none',
        active?.label || 'Not published',
        active?.publishedDate || '',
        active?.publishedBy || '',
        active?.manifestFingerprint || '',
      ),
      ...(state.exchanges || []).map((entry) =>
        reportRow(
          'Published issue',
          entry.id,
          entry.label,
          `${entry.manifest?.sheets?.length || 0} sheets`,
          `${entry.manifest?.files?.dxf?.length || 0} DXFs`,
          entry.manifestFingerprint,
        ),
      ),
      ...(state.reviewerMarkups || []).map((entry) =>
        reportRow(
          'Reviewer markup',
          entry.id,
          entry.sheetNumber || 'General',
          entry.discipline,
          entry.status,
          entry.comment,
        ),
      ),
      ...(state.externalResponses || []).map((entry) =>
        reportRow(
          'External response',
          entry.id,
          entry.markupId,
          entry.responderName,
          entry.responseDate,
          entry.response,
        ),
      ),
    ];
    return {
      title: 'Xi Professional Interoperability and Review Exchange Register',
      columns: ['Record', 'ID', 'Issue / sheet', 'Source / discipline', 'Status / date', 'Fingerprint / response'],
      rows,
      notes: [
        `${state.exchanges?.length || 0} immutable exchange manifests, ${state.reviewerMarkups?.length || 0} reviewer markups, and ${state.externalResponses?.length || 0} external responses are retained.`,
        'External responses are preserved as evidence; they do not automatically verify, approve, seal, or accept the design.',
        'Exchange output is not IFC-certified, a permit acceptance, professional approval, or construction authorization.',
      ],
    };
  }
  if (reportType === 'documentation_realization_basis') {
    const state = project.building?.documentationRealization || {};
    const currentModelSignature = deriveDocumentModelSignature(project);
    const rows = [
      reportRow(
        'Issue',
        `${state.issueCode || 'none'} · ${state.issueLabel || 'Unissued'}`,
        state.issueDate,
        state.preparedBy,
        state.status,
        state.packageId,
      ),
      reportRow(
        'Model basis',
        state.sourceTestFitId || 'none',
        state.sourceRevisionId || 'none',
        state.sourceCostRealizationSignature || 'none',
        state.sourceModelSignature === currentModelSignature ? 'Current' : 'Outdated',
        state.sourceModelSignature || 'none',
      ),
      ...(state.sheetSnapshots || []).map((entry) =>
        reportRow(
          'Issued sheet',
          entry.number,
          entry.title,
          `${entry.viewportSnapshots?.length || 0} viewports`,
          entry.issueDate,
          entry.generatedFromModelSignature,
        ),
      ),
      ...(state.unresolvedFindingSnapshots || []).map((entry) =>
        reportRow(
          'Disclosed finding',
          entry.ruleId,
          entry.category,
          entry.severity,
          'Professional review required',
          entry.message,
        ),
      ),
    ];
    return {
      title: 'Nu Professional-Review Documentation Issue Register',
      columns: ['Record', 'Number / rule', 'Title / category', 'Views / severity', 'Status / date', 'Basis / finding'],
      rows,
      notes: [
        `${state.sheetSnapshots?.length || 0} sheets and ${state.deliverableSnapshots?.length || 0} deliverables are frozen in this issue record.`,
        `${state.unresolvedFindingSnapshots?.length || 0} deterministic findings were disclosed at issue time; inclusion does not resolve or approve them.`,
        'Derived dimensions and tags use the canonical drawing policy and remain subject to professional checking.',
        'Preliminary professional-review issue only—not a permit submission, sealed professional document, construction authorization, or as-built record.',
      ],
    };
  }
  if (reportType === 'cost_realization_basis') {
    const realization = deriveCostRealization(project);
    const metrics = realization.state.realizedMetrics;
    const rows = [
      reportRow(
        'Baseline',
        metrics.name || realization.state.baselineScenarioId || 'none',
        'Accepted scenario',
        realization.state.status,
        realization.state.currency,
        decimalValue(metrics.totalProjectCost),
      ),
      reportRow(
        'Budget',
        'Owner target',
        'Configured brief',
        metrics.budgetVariance == null ? 'Not comparable' : 'Compared',
        realization.state.currency,
        decimalValue(metrics.targetBudget),
      ),
      reportRow(
        'Rental economics',
        'Annual NOI',
        'Configured rent and operating allowance',
        decimalValue(metrics.netYieldPercent, '% net yield'),
        decimalValue(metrics.simplePaybackYears, ' years'),
        decimalValue(metrics.annualNetOperatingIncome),
      ),
      ...realization.state.lineItemSnapshots.map((item) =>
        reportRow(
          'Assembly quantity',
          item.label,
          `${item.quantity.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${item.unit}`,
          item.provenance,
          item.assemblyId || 'Assembly missing',
          decimalValue(item.estimatedCost),
        ),
      ),
      ...realization.state.valueEngineeringOpportunities.map((entry) =>
        reportRow(
          'Value engineering',
          entry.label,
          `${entry.baselineScenarioId} → ${entry.alternativeScenarioId}`,
          entry.status,
          'Professional review required',
          decimalValue(entry.savings),
        ),
      ),
    ];
    return {
      title: 'Accepted Quantity and Cost Realization Basis',
      columns: ['Record', 'Item / scenario', 'Quantity / basis', 'Status / provenance', 'Assembly / review', 'Amount'],
      rows,
      notes: [
        `${realization.lineItemCount} accepted line-item snapshots across ${realization.scenarioCount} configured scenario${realization.scenarioCount === 1 ? '' : 's'}.`,
        `Price basis: ${metrics.priceSource?.label || 'Source missing'} · ${metrics.priceSource?.region || 'Region missing'} · ${metrics.priceSource?.date || 'Date missing'}.`,
        realization.outOfDate
          ? 'OUTDATED: model, assemblies, prices, budget, rent, or scenarios changed after acceptance.'
          : 'Input signature matches the current coordinated model and feasibility configuration.',
        'Owner feasibility estimate only—not a bid, appraisal, lending recommendation, accepted substitution, or professional cost certification.',
      ],
    };
  }
  if (reportType === 'services_realization_basis') {
    const realization = deriveServicesRealization(project);
    const counts = realization.actualEntityCounts;
    return {
      title: 'Coordinated Building Systems Realization Basis',
      columns: ['Basis item', 'Modeled / checked result', 'Relationship / limitation'],
      rows: [
        reportRow('Status', realization.state.status, 'Checked coordination state'),
        reportRow('Source test fit', realization.state.sourceTestFitId || 'none', 'Stable relationship'),
        reportRow(
          'Fixture drainage branches',
          counts.drainageRoutes,
          `${decimalValue(realization.totalDrainagePlanningLength / 1000, ' m')} straight-line planning length`,
        ),
        reportRow(
          'Electrical riser / penetrations',
          `${counts.electricalRisers} / ${counts.slabOpenings}`,
          'Structurally clear modeled reservations',
        ),
        reportRow(
          'Panels / electrical points',
          `${counts.panelZones} / ${counts.electricalPoints}`,
          `${realization.profile.electricalPointsPerUnit} configured points per unit`,
        ),
        reportRow(
          'Water equipment reservations',
          counts.waterEquipmentZones,
          'Tank and pump zones—not sized equipment',
        ),
        reportRow('AC outdoor reservations', counts.outdoorUnitZones, 'Floor-by-floor aggregate zones'),
        reportRow(
          'Unresolved coordination items',
          realization.unresolvedItems.length,
          'Professional resolution required',
        ),
      ],
      notes: [
        'Routes, risers, panels, points, equipment footprints, and slab penetrations are deterministic coordination geometry from the accepted apartment and structural basis.',
        'Drainage paths and electrical distances are plan-intent relationships, not installed routing.',
        'No pipe sizing, hydraulic calculation, vent design, electrical load or circuit design, conductor sizing, equipment selection, fire protection design, code compliance, or professional approval is included.',
      ],
    };
  }
  if (reportType === 'structural_realization_basis') {
    const realization = deriveStructuralRealization(project);
    const summaryRows = [
      reportRow('Status', realization.state.status, 'Checked coordination state'),
      reportRow('Source test fit', realization.state.sourceTestFitId || 'none', 'Stable relationship'),
      reportRow(
        'Modeled column section',
        `${realization.profile.columnWidth} × ${realization.profile.columnDepth} mm`,
        realization.profile.source,
      ),
      reportRow(
        'Modeled beam section',
        `${realization.profile.beamWidth} × ${realization.profile.beamDepth} mm`,
        realization.profile.source,
      ),
      reportRow(
        'Column stacks',
        `${realization.continuousStackCount}/${realization.generatedStackCount} continuous`,
        `${realization.generatedColumnCount} modeled columns`,
      ),
      reportRow(
        'Beams',
        `${realization.supportedBeamCount}/${realization.generatedBeamCount} supported`,
        'Two same-level column references required',
      ),
      reportRow(
        'Slabs',
        `${realization.coordinatedSlabCount}/${realization.slabCount} coordinated`,
        realization.profile.slabSupportMode,
      ),
      reportRow(
        'Conceptual load path',
        `${realization.loadPath.summary.relationshipCount} relationships`,
        `${realization.loadPath.summary.unsupportedNodeCount} unsupported slab/beam nodes`,
      ),
      reportRow('Foundations', realization.foundationStatus, realization.profile.foundationBasis),
    ];
    const bypassRows = realization.skippedBeamSegments.map((entry) =>
      reportRow(
        `Opening bypass · ${entry.floorId}`,
        `${entry.orientation.toUpperCase()} grid segment`,
        `${entry.openingIds.join(', ')} · engineer framing resolution required`,
      ),
    );
    return {
      title: 'Coordinated Structural Realization Basis',
      columns: ['Basis item', 'Modeled / checked result', 'Relationship / limitation'],
      rows: [...summaryRows, ...bypassRows],
      notes: [
        'Columns, beams, slab supports, opening bypasses, and load-path arrows are deterministic model relationships.',
        'Member dimensions are geometric planning assumptions, not sizing or capacity results.',
        'No loads, reactions, moments, shear, deflection, reinforcement, foundations, soil, seismic, wind, code compliance, structural safety, or engineer approval is included.',
      ],
    };
  }
  if (reportType === 'apartment_design_quality') {
    const design = deriveApartmentDesignCoordination(project);
    const spatial = deriveSpatialCoordination(project);
    const environmentByRoom = new Map(design.roomEnvironmental.map((entry) => [entry.roomId, entry]));
    const spatialByRoom = new Map(spatial.rooms.map((entry) => [entry.roomId, entry]));
    return {
      title: 'Apartment Design Quality and Tropical Coordination',
      columns: [
        'Unit / level',
        'Rooms',
        'Required adjacency',
        'Fixture clearance',
        'Daylight / orientation',
        'Circulation path',
      ],
      rows: design.units.map((unit) => {
        const floorName = project.floors.find((floor) => floor.id === unit.floorId)?.name || unit.floorId;
        const roomIds =
          project.floors
            .find((floor) => floor.id === unit.floorId)
            ?.rooms?.filter((room) => room.unitInstanceId === unit.instanceId)
            .map((room) => room.id) || [];
        const environmental = roomIds
          .map((id) => {
            const environment = environmentByRoom.get(id);
            const spatialRoom = spatialByRoom.get(id);
            return environment
              ? { ...environment, crossVentilationPotential: spatialRoom?.crossVentilationPotential }
              : null;
          })
          .filter(Boolean);
        const fixtureChecks = design.fixtures.filter((entry) => roomIds.includes(entry.roomId));
        return reportRow(
          `${unit.instanceId} / ${floorName}`,
          unit.roomCount,
          `${unit.adjacencyRequirements.filter((entry) => entry.satisfied).length}/${unit.adjacencyRequirements.length} configured pairs`,
          `${fixtureChecks.filter((entry) => entry.clearanceInsideRoom).length}/${fixtureChecks.length} probes`,
          environmental
            .map(
              (entry) =>
                `${entry.spaceType}: ${(entry.glazingRatio * 100).toFixed(1)}% · ${entry.orientations.join('/') || 'no exterior orientation'} · cross-flow ${entry.crossVentilationPotential ? 'candidate' : 'not shown'}`,
            )
            .join(' | '),
          unit.hasModeledEgress ? 'Modeled unit-to-stair/exit path' : 'Path missing',
        );
      }),
      notes: [
        `Apartment design status: ${design.state.status}; source test fit: ${design.state.sourceTestFitId || 'none'}.`,
        'Furniture and fixture objects are deterministic clearance probes, not furnishing recommendations.',
        'Glazing ratio and facade orientation indicate geometric daylight and solar potential only; no climate, glare, heat-gain, energy, or code simulation is included.',
        'Adjacency, circulation, egress, and stair results are configured early-planning checks—not accessibility, fire-code, architectural, engineering, or permit approval.',
      ],
    };
  }
  if (reportType === 'test_fit_comparison') {
    const options = project.building?.testFitOptions || [];
    const selectedId = project.building?.selectedTestFitId;
    const acceptedId = project.building?.acceptedTestFitId;
    return {
      title: 'Deterministic Apartment Test-Fit Comparison',
      columns: [
        'Alternative',
        'Strategy / status',
        'Units / levels',
        'Gross / net area',
        'Efficiency',
        'Planning cost / budget',
        'Deterministic findings',
      ],
      rows: options.map((option) =>
        reportRow(
          `${option.name} · score ${option.score}`,
          `${option.strategy} · ${option.id === acceptedId ? 'accepted' : option.id === selectedId ? 'selected' : 'alternative'}`,
          `${option.metrics?.unitCount ?? 0} / ${option.metrics?.storeys ?? 0}`,
          `${areaM2(option.metrics?.grossFloorArea)} / ${areaM2(option.metrics?.netRentableArea)} m²`,
          `${Math.round((option.metrics?.efficiencyRatio || 0) * 100)}%`,
          option.metrics?.estimatedCost == null
            ? 'Withheld—no explicit planning rate'
            : `${option.metrics.currency || 'PHP'} ${Number(option.metrics.estimatedCost).toLocaleString()} / variance ${Number(option.metrics.budgetVariance || 0).toLocaleString()}`,
          (option.findings || []).length
            ? (option.findings || []).map((finding) => `${finding.severity}: ${finding.message}`).join(' | ')
            : 'No deterministic conflicts found',
        ),
      ),
      notes: [
        'Alternatives are deterministic early-planning test fits generated from the checked site envelope, apartment program, storeys, parking target, budget, and recorded profile assumptions.',
        'Scores compare configured geometric and feasibility criteria; they are not architectural approval, code compliance, structural design, or engineer verification.',
        'Planning cost is a rule-of-thumb allowance and is withheld until the user supplies an explicit cost-per-square-meter input.',
      ],
    };
  }
  if (reportType === 'site_access_schedule') {
    const parking = project.building?.site?.parkingPlan || {};
    const rows = [
      ...(parking.bays || []).map((bay) =>
        reportRow(
          'Parking bay',
          bay.name || bay.id,
          `${bay.width} × ${bay.length} mm`,
          bay.location,
          bay.accessible ? 'Accessible intent' : 'Standard intent',
        ),
      ),
      ...(parking.accessRoutes || []).map((route) =>
        reportRow(
          'Vehicle access',
          route.name || route.id,
          `${route.clearWidth} mm clear`,
          `Road edge ${route.roadEdgeIndex + 1}`,
          `${(route.servedBayIds || []).length} served bays`,
        ),
      ),
    ];
    return {
      title: 'Site Access and Parking Coordination Schedule',
      columns: ['Element', 'ID / name', 'Geometry', 'Location / frontage', 'Relationship / intent'],
      rows,
      notes: [
        'Parking bays and access centerlines are geometric early-planning checks only.',
        'No swept-path analysis, traffic engineering, accessibility approval, or parking-code determination is included.',
      ],
    };
  }
  if (reportType === 'services_schedule') {
    const plumbing = project.building?.systems?.plumbing || {};
    const electrical = project.building?.systems?.electrical || {};
    const water = project.building?.systems?.water || {};
    const mechanical = project.building?.systems?.mechanical || {};
    const egress = project.building?.systems?.egress || {};
    const rows = [
      ...(plumbing.shafts || []).map((shaft) =>
        reportRow(
          'Plumbing shaft',
          shaft.name || shaft.id,
          `${shaft.width} × ${shaft.depth} mm`,
          `${(shaft.servedFloorIds || []).length} levels`,
          `${(shaft.fixtureRefs || []).length} fixtures`,
        ),
      ),
      ...(electrical.riserZones || []).map((riser) =>
        reportRow(
          'Electrical riser',
          riser.name || riser.id,
          `${riser.width} × ${riser.depth} mm`,
          `${(riser.servedFloorIds || []).length} levels`,
          'Zone only',
        ),
      ),
      ...(electrical.panelZones || []).map((zone) =>
        reportRow(
          'Electrical panel zone',
          zone.name || zone.id,
          `${zone.width} × ${zone.depth} mm`,
          zone.floorId || zone.location,
          `${zone.clearance} mm planning clearance`,
        ),
      ),
      ...(electrical.points || []).map((point) =>
        reportRow('Electrical point', point.name || point.id, point.kind, point.floorId, `Panel ${point.panelZoneId}`),
      ),
      ...(water.equipmentZones || []).map((zone) =>
        reportRow(
          zone.kind === 'water_pump' ? 'Water pump zone' : 'Water tank zone',
          zone.name || zone.id,
          `${zone.width} × ${zone.depth} mm`,
          zone.floorId || zone.location,
          `${zone.clearance} mm planning clearance`,
        ),
      ),
      ...(mechanical.outdoorUnitZones || []).map((zone) =>
        reportRow(
          'AC outdoor-unit zone',
          zone.name || zone.id,
          `${zone.width} × ${zone.depth} mm`,
          zone.floorId || zone.location,
          `${zone.unitCount ?? 'Unspecified'} units`,
        ),
      ),
      ...(project.roofSystem?.drains || []).map((drain) =>
        reportRow(
          'Roof drain path',
          drain.name || drain.id,
          `Ø ${drain.diameter} mm · ${(drain.routePoints || []).length} points`,
          'Roof',
          `${drain.outletRef?.kind || 'Outlet missing'} ${drain.outletRef?.id || ''}`,
        ),
      ),
      ...(plumbing.drainageRoutes || []).map((route) =>
        reportRow(
          'Drainage route',
          route.name || route.id,
          `${(route.points || []).length} plan points`,
          route.floorId,
          `Min ${route.minimumSlopePercent}%`,
        ),
      ),
      ...(egress.routes || []).map((route) =>
        reportRow(
          'Egress route',
          route.name || route.id,
          `${(route.points || []).length} plan points`,
          route.floorId,
          `Room ${route.fromRoomId} → exit ${route.exitId}`,
        ),
      ),
    ];
    return {
      title: 'Services and Egress Coordination Schedule',
      columns: ['System', 'ID / name', 'Geometry', 'Levels', 'Relationship / assumption'],
      rows,
      notes: [
        'Routes, zones, slopes, openings, and travel distances are preliminary coordination intent.',
        'No hydraulic sizing, electrical load design, equipment sizing, fire-code approval, or permit determination is included.',
      ],
    };
  }
  if (reportType === 'structural_schedule') {
    const rows = (project.floors || []).flatMap((floor) => [
      ...(floor.beams || []).map((beam) =>
        reportRow(
          floor.name,
          beam.id,
          'Beam',
          `${Math.round(beamLength(beam, floor.columns || []))} mm`,
          beam.coordination?.condition || 'typical',
          `${beam.startRef?.kind || 'missing'} / ${beam.endRef?.kind || 'missing'}`,
        ),
      ),
      ...(floor.slabs || []).map((slab) => {
        const grossArea = polygonArea(slab.boundaryPoints || []);
        const openingArea = (slab.openings || []).reduce(
          (total, opening) => total + polygonArea(opening.boundaryPoints || []),
          0,
        );
        return reportRow(
          floor.name,
          slab.id,
          'Slab zone',
          `${areaM2(Math.max(0, grossArea - openingArea))} m² net`,
          `${(slab.supportRefs || []).length} supports`,
          `${(slab.openings || []).length} openings`,
        );
      }),
    ]);
    return {
      title: 'Structural Coordination Schedule',
      columns: ['Level', 'ID', 'Element', 'Geometry', 'Intent', 'Relationships'],
      rows,
      notes: [
        'Spans, supports, and openings are model-coordination results only.',
        'No loads, reinforcement, capacity, deflection, wind, seismic, soil, or foundation design is included.',
      ],
    };
  }
  if (reportType === 'area_schedule') {
    const rows = (project.floors || []).flatMap((floor) =>
      (floor.rooms || []).map((room) =>
        reportRow(
          floor.name,
          room.name,
          room.spaceType || 'Unclassified',
          room.useCategory || 'Unclassified',
          areaM2(room.area),
        ),
      ),
    );
    return {
      title: 'Room and Area Schedule',
      columns: ['Level', 'Room', 'Space type', 'Use', 'Area m²'],
      rows,
      notes: ['Areas are derived from modeled room polygons.'],
    };
  }
  if (reportType === 'opening_schedule') {
    const rows = (project.floors || []).flatMap((floor) => [
      ...(floor.doors || []).map((door) =>
        reportRow(floor.name, door.id, 'Door', door.width, door.height, door.wallId),
      ),
      ...(floor.windows || []).map((window) =>
        reportRow(floor.name, window.id, 'Window', window.width, window.height, window.wallId),
      ),
    ]);
    return {
      title: 'Door and Window Schedule',
      columns: ['Level', 'ID', 'Type', 'Width mm', 'Height mm', 'Host wall'],
      rows,
      notes: ['Dimensions are modeled sizes and require professional specification.'],
    };
  }
  if (reportType === 'quantity_summary') {
    const takeoff = deriveQuantityTakeoff(project);
    return {
      title: 'Preliminary Quantity and Cost Summary',
      columns: ['Item', 'Quantity', 'Derivation', 'Pricing basis', 'Unit rate', 'Estimated cost', 'Price source'],
      rows: takeoff.items.map((item) =>
        reportRow(
          item.label,
          quantityValue(item),
          item.provenance,
          item.pricingBasis,
          item.unitRate == null ? 'Not priced' : item.unitRate.toFixed(2),
          item.estimatedCost == null ? 'Not priced' : item.estimatedCost.toFixed(2),
          item.priceSource
            ? `${item.priceSource.label || 'Unnamed'} · ${item.priceSource.region || 'Region unset'} · ${item.priceSource.date || 'Date unset'}`
            : 'No source-dated profile',
        ),
      ),
      notes: [
        `${takeoff.pricedItemCount}/${takeoff.items.length} takeoff items priced in ${takeoff.currency}.`,
        ...takeoff.warnings,
        'Feasibility estimate only—not a bid or purchase order.',
      ],
    };
  }
  if (reportType === 'feasibility_summary') {
    const active = deriveFeasibilityEconomics(project);
    const comparison = deriveFeasibilityComparison(project);
    return {
      title: 'Owner Feasibility Scenario Summary',
      columns: [
        'Scenario',
        'Status',
        'Project cost',
        'Cost / gross m²',
        'Budget balance',
        'Annual NOI',
        'Net yield',
        'Simple payback',
      ],
      rows: comparison.scenarios.map((entry) =>
        reportRow(
          entry.name,
          entry.pricingComplete ? 'Complete configured pricing' : 'Incomplete pricing',
          decimalValue(entry.totalProjectCost),
          decimalValue(entry.costPerGrossFloorAreaM2),
          decimalValue(entry.budgetVariance),
          decimalValue(entry.annualNetOperatingIncome),
          decimalValue(entry.netYieldPercent, '%'),
          decimalValue(entry.simplePaybackYears, ' years'),
        ),
      ),
      notes: [
        active.priceProfile
          ? `Active price source: ${active.priceProfile.sourceLabel} · ${active.priceProfile.region}${active.priceProfile.locality ? ` / ${active.priceProfile.locality}` : ''} · ${active.priceProfile.sourceDate}.`
          : 'Active scenario has no valid source-dated Philippine price profile.',
        `${active.requiredUnpricedItemCount} non-zero takeoff item${active.requiredUnpricedItemCount === 1 ? '' : 's'} remain unpriced in the active scenario.`,
        ...active.costDrivers
          .slice(0, 3)
          .map(
            (entry) =>
              `Cost driver: ${entry.label} · ${decimalValue(entry.estimatedCost)} (${decimalValue(entry.sharePercent, '%')} of direct cost).`,
          ),
        ...comparison.opportunities
          .slice(0, 3)
          .map(
            (entry) =>
              `Configured-rate comparison: ${entry.label} could reduce estimated cost by ${decimalValue(entry.savings)} in ${entry.alternativeScenarioId}; design and supplier review required.`,
          ),
        'Feasibility estimate only—not a bid, appraisal, lending recommendation, investment advice, or professional cost certification.',
      ],
    };
  }
  if (reportType === 'professional_handoff') {
    const handoff = deriveProfessionalHandoff(project);
    const revision = handoff.revisionComparison.baseline;
    const rows = [
      ...handoff.assumptions.map((entry) =>
        reportRow(
          'Assumption',
          entry.title,
          entry.category,
          entry.status,
          `${entry.sourceLabel} · ${entry.sourceDate}`,
          entry.statement,
        ),
      ),
      ...handoff.documentation.reviewItems.map((entry) =>
        reportRow(
          'Review item',
          entry.title,
          entry.discipline,
          `${entry.status} · ${entry.confidence}`,
          entry.externalVerification
            ? `${entry.externalVerification.professionalName} · ${entry.externalVerification.profession} · ${entry.externalVerification.licenseId} · ${entry.externalVerification.verificationDate}`
            : `${entry.createdBy || 'Author unset'} · ${entry.createdDate || 'Date unset'}`,
          entry.resolution || entry.comment,
        ),
      ),
      ...(revision
        ? [
            reportRow(
              'Revision basis',
              `${revision.code} · ${revision.label}`,
              revision.purpose,
              handoff.revisionComparison.isCurrent
                ? 'current'
                : `${handoff.revisionComparison.changeCount} model changes`,
              `${revision.author} · ${revision.date}`,
              `Added ${handoff.revisionComparison.added.length}; removed ${handoff.revisionComparison.removed.length}; changed ${handoff.revisionComparison.changed.length}`,
            ),
          ]
        : []),
    ];
    return {
      title: 'Design Assumptions, Professional Review, and Revision Register',
      columns: [
        'Record',
        'Title / revision',
        'Category / discipline',
        'Status / confidence',
        'Source / verifier',
        'Statement / resolution / delta',
      ],
      rows,
      notes: [
        `${handoff.openReviewItems.length} open professional-review item${handoff.openReviewItems.length === 1 ? '' : 's'}.`,
        `${handoff.engineerVerifiedItems.length} item${handoff.engineerVerifiedItems.length === 1 ? '' : 's'} carry explicit external engineer-verified evidence.`,
        'Modeled and checked records are not professional approval. Engineer-verified labels reproduce user-recorded external evidence and must be confirmed against signed professional documents.',
      ],
    };
  }
  if (reportType === 'validation') {
    const issues = validateBuildingCoordination(project);
    return {
      title: 'Coordination Validation Report',
      columns: ['Severity', 'Category', 'Rule', 'Finding'],
      rows: issues.slice(0, 30).map((entry) => reportRow(entry.severity, entry.category, entry.ruleId, entry.message)),
      notes: [
        `${issues.length} current deterministic finding${issues.length === 1 ? '' : 's'}.`,
        ...(issues.length > 30 ? [`${issues.length - 30} additional findings remain in the live model.`] : []),
        'Checked does not mean engineer-verified or structurally safe.',
      ],
    };
  }

  const brief = project.building?.brief || {};
  const structural = project.building?.systems?.structural || {};
  const site = project.building?.site || {};
  return {
    title: 'Project Basis and Design Assumptions',
    columns: ['Topic', 'Configured basis'],
    rows: [
      reportRow('Jurisdiction', `${project.building?.jurisdiction?.countryName || 'Philippines'} · metric`),
      reportRow('Building use', project.building?.use || 'residential_apartment'),
      reportRow('Target storeys', brief.targetStoreys ?? 'Not set'),
      reportRow('Target units', brief.targetUnitCount ?? 'Not set'),
      reportRow(
        'Target budget',
        brief.targetBudget == null ? 'Not set' : `${brief.currency || 'PHP'} ${brief.targetBudget}`,
      ),
      reportRow('Structural strategy', structural.strategy || 'Not set'),
      reportRow('Roof type', brief.roofType || project.roofSystem?.roofType || 'Not set'),
      reportRow('North angle', `${site.northAngle || 0}°`),
      reportRow('Structural status', 'Modeled / deterministic coordination checks only'),
    ],
    notes: [
      'This package is a preliminary design basis for licensed-professional review.',
      'It is not construction approval, a permit set, or a structural-safety determination.',
    ],
  };
}

function viewport(project, packageId, sheetCode, sourceView, floorId, options = {}) {
  return createSheetViewport(sourceView, floorId, {
    ...options,
    id: stableId(project, packageId, 'viewport', `${sheetCode}_${options.sourceRefId || sourceView}`),
  });
}

function sheet(project, packageId, code, title, viewports, options = {}) {
  const documentation = project.building?.documentation || {};
  const activeRevision =
    (documentation.revisionSnapshots || []).find((entry) => entry.id === documentation.activeRevisionId) || null;
  return {
    ...createSheet(title, {
      id: stableId(project, packageId, 'sheet', code.replaceAll('-', '')),
      number: code,
      drawingName: title,
      scaleMode: 'per_viewport',
      layoutTemplate: 'auto',
      viewports,
      issueDate: activeRevision?.date || '',
      titleBlock: activeRevision ? { drawnBy: activeRevision.author } : undefined,
      revisions: activeRevision
        ? [
            {
              id: stableId(project, packageId, 'sheet_revision', `${code}_${activeRevision.id}`),
              code: activeRevision.code,
              date: activeRevision.date,
              description: activeRevision.label,
            },
          ]
        : [],
      notes: [
        'PRELIMINARY — FOR PROFESSIONAL REVIEW',
        'Not for permit, construction, or structural-safety certification.',
        ...(options.notes || []),
      ],
    }),
    packageKind: PRELIMINARY_PACKAGE_KIND,
    packageId,
    generatedFromProjectVersion: project.version,
    generatedFromModelSignature: deriveDocumentModelSignature(project),
  };
}

function hasModeledGeometry(project) {
  return (project.floors || []).some((floor) =>
    ['walls', 'rooms', 'columns', 'beams', 'slabs', 'stairs'].some((key) => (floor[key] || []).length > 0),
  );
}

export function derivePreliminaryPackage(project, packageId = 'alpha', options = {}) {
  const floors = project.floors || [];
  const ground = floors[0] || null;
  const section = floors.flatMap((floor) => (floor.sectionCuts || []).map((cut) => ({ floor, cut })))[0] || null;
  const takeoff = deriveQuantityTakeoff(project);
  const issues = options.validationIssues || (options.skipValidation ? [] : validateBuildingCoordination(project));
  const hasRooms = floors.some((floor) => (floor.rooms || []).length > 0);
  const hasOpenings = floors.some((floor) => (floor.doors || []).length + (floor.windows || []).length > 0);
  const hasStructure = floors.some(
    (floor) => (floor.columns || []).length + (floor.beams || []).length + (floor.slabs || []).length > 0,
  );
  const systems = project.building?.systems || {};
  const hasParking =
    (project.building?.site?.parkingPlan?.bays || []).length > 0 ||
    (project.building?.site?.parkingPlan?.accessRoutes || []).length > 0;
  const hasEquipment =
    (systems.electrical?.panelZones || []).length > 0 ||
    (systems.electrical?.points || []).length > 0 ||
    (systems.water?.equipmentZones || []).length > 0 ||
    (systems.mechanical?.outdoorUnitZones || []).length > 0;
  const hasRoofDrainage = (project.roofSystem?.drains || []).some((drain) => (drain.routePoints || []).length >= 2);
  const hasServices =
    (systems.plumbing?.shafts || []).length > 0 ||
    (systems.plumbing?.drainageRoutes || []).length > 0 ||
    (systems.electrical?.riserZones || []).length > 0 ||
    (systems.egress?.exits || []).length > 0 ||
    (systems.egress?.routes || []).length > 0 ||
    hasEquipment ||
    hasRoofDrainage;
  const hasFeasibility = (project.building?.quantityProfile?.scenarios || []).length > 0;
  const hasProfessionalHandoff =
    (project.building?.assumptions || []).length > 0 ||
    (project.building?.documentation?.reviewItems || []).length > 0 ||
    (project.building?.documentation?.revisionSnapshots || []).length > 0;
  const hasTestFits = (project.building?.testFitOptions || []).length > 0;
  const hasApartmentDesign = project.building?.apartmentDesign?.status === 'detailed';
  const hasStructuralRealization = project.building?.systems?.structural?.realization?.status === 'realized';
  const hasServicesRealization = project.building?.systems?.realization?.status === 'realized';
  const costRealization = deriveCostRealization(project);
  const hasCostRealization = costRealization.state.status === 'realized';
  const documentationRealization = project.building?.documentationRealization || {};
  const hasDocumentationRealization = documentationRealization.status === 'issued';
  const hasProfessionalExchange = (project.building?.professionalExchange?.exchanges || []).length > 0;
  const documentationRealizationOutOfDate =
    hasDocumentationRealization &&
    (documentationRealization.sourceModelSignature !== deriveDocumentModelSignature(project) ||
      (documentationRealization.sheetSnapshots || []).some(
        (snapshot) =>
          !issuedSheetMatchesSnapshot(
            (project.sheets || []).find((sheet) => sheet.id === snapshot.id),
            snapshot,
          ),
      ));
  const deliverables = [
    { id: 'project_basis', label: 'Project basis and assumptions', ready: Boolean(project.building) },
    { id: 'site_plan', label: 'Site development plan', ready: (project.building?.site?.boundary || []).length >= 3 },
    { id: 'site_access', label: 'Parking and vehicle-access coordination', ready: hasParking },
    { id: 'floor_plans', label: 'Floor plans', ready: floors.length > 0 && hasModeledGeometry(project) },
    { id: 'roof_plan', label: 'Roof plan', ready: Boolean(project.roofSystem) },
    { id: 'roof_drainage', label: 'Roof-drainage coordination', ready: hasRoofDrainage },
    { id: 'elevations', label: 'Building elevations', ready: hasModeledGeometry(project) },
    { id: 'section', label: 'Building section', ready: Boolean(section) },
    { id: 'structural_layout', label: 'Column / beam / slab layouts', ready: hasStructure },
    { id: 'opening_schedule', label: 'Door and window schedule', ready: hasOpenings },
    { id: 'area_schedule', label: 'Room and area schedule', ready: hasRooms },
    { id: 'quantity_summary', label: 'Quantity summary', ready: takeoff.items.length > 0 },
    { id: 'validation_report', label: 'Validation report', ready: true },
    { id: 'coordinated_3d', label: 'Coordinated 3D view', ready: hasModeledGeometry(project) },
  ];
  if (hasTestFits) {
    deliverables.splice(3, 0, {
      id: 'test_fit_comparison',
      label: 'Deterministic apartment test-fit comparison',
      ready: true,
    });
  }
  if (hasApartmentDesign) {
    deliverables.splice(4, 0, {
      id: 'apartment_design_quality',
      label: 'Apartment adjacency, clearance, daylight, and circulation report',
      ready: true,
    });
  }
  if (hasStructuralRealization) {
    deliverables.splice(5, 0, {
      id: 'structural_realization_basis',
      label: 'Coordinated column, beam, slab-support, and conceptual load-path basis',
      ready: true,
    });
  }
  if (hasServicesRealization) {
    deliverables.splice(6, 0, {
      id: 'services_realization_basis',
      label: 'Coordinated routes, risers, equipment reservations, points, and penetrations basis',
      ready: true,
    });
  }
  if (hasCostRealization) {
    deliverables.splice(deliverables.length - 2, 0, {
      id: 'cost_realization_basis',
      label: 'Accepted assembly quantities, price basis, owner economics, and value-engineering register',
      ready: !costRealization.outOfDate && costRealization.state.pricingComplete,
    });
  }
  if (hasDocumentationRealization) {
    deliverables.splice(deliverables.length - 1, 0, {
      id: 'documentation_realization_basis',
      label: 'Frozen professional-review sheet, finding, annotation, and revision issue register',
      ready: !documentationRealizationOutOfDate,
    });
  }
  if (hasServices) {
    deliverables.splice(8, 0, { id: 'services_layout', label: 'Services and egress coordination plans', ready: true });
  }
  if (hasFeasibility) {
    const activeEconomics = deriveFeasibilityEconomics(project);
    deliverables.splice(deliverables.length - 2, 0, {
      id: 'feasibility_summary',
      label: 'Budget, rent, yield, and payback scenario summary',
      ready: activeEconomics.pricingComplete,
    });
  }
  if (hasProfessionalHandoff) {
    deliverables.splice(deliverables.length - 1, 0, {
      id: 'professional_handoff',
      label: 'Design assumptions, professional review, and revision register',
      ready: true,
    });
  }

  const modelSignature = deriveDocumentModelSignature(project);
  const generatedSheets = (project.sheets || []).filter(
    (entry) => entry.packageKind === PRELIMINARY_PACKAGE_KIND && entry.packageId === packageId,
  );

  const sheets = [];
  sheets.push(
    sheet(project, packageId, 'G-001', 'Project Basis and Assumptions', [
      viewport(project, packageId, 'G001', 'building_report', ground?.id, { sourceRefId: 'assumptions', scale: 100 }),
    ]),
  );
  if (hasProfessionalHandoff) {
    sheets.push(
      sheet(project, packageId, 'G-003', 'Professional Review and Revision Register', [
        viewport(project, packageId, 'G003', 'building_report', ground?.id, { sourceRefId: 'professional_handoff' }),
      ]),
    );
  }
  if (deliverables.find((entry) => entry.id === 'site_plan').ready) {
    sheets.push(
      sheet(project, packageId, 'A-001', 'Site Development Plan', [
        viewport(project, packageId, 'A001', 'site_plan', ground?.id, { scale: 100 }),
      ]),
    );
  }
  floors.forEach((floor, index) => {
    const code = `A-${String(101 + index).padStart(3, '0')}`;
    sheets.push(
      sheet(project, packageId, code, `${floor.name} Plan`, [
        viewport(project, packageId, code, 'plan', floor.id, { scale: 100 }),
      ]),
    );
  });
  if (project.roofSystem) {
    sheets.push(
      sheet(project, packageId, 'A-201', 'Roof Plan', [
        viewport(project, packageId, 'A201', 'roof_plan', ground?.id, { scale: 100 }),
      ]),
    );
    if (hasRoofDrainage) {
      sheets.push(
        sheet(
          project,
          packageId,
          'A-202',
          'Roof Drainage Coordination',
          [viewport(project, packageId, 'A202', 'roof_plan', ground?.id, { scale: 100 })],
          {
            notes: [
              'Drain locations and routes are coordination intent—not hydraulic sizing or drainage-code approval.',
            ],
          },
        ),
      );
    }
  }
  if (hasModeledGeometry(project)) {
    sheets.push(
      sheet(project, packageId, 'A-301', 'Building Elevations', [
        viewport(project, packageId, 'A301', 'elevation_front', ground?.id, { role: 'primary', scale: 100 }),
        viewport(project, packageId, 'A301R', 'elevation_rear', ground?.id, { role: 'secondary', scale: 100 }),
        viewport(project, packageId, 'A301L', 'elevation_left', ground?.id, { role: 'secondary', scale: 100 }),
        viewport(project, packageId, 'A301RT', 'elevation_right', ground?.id, { role: 'secondary', scale: 100 }),
      ]),
    );
    sheets.push(
      sheet(project, packageId, 'A-501', 'Coordinated 3D View', [
        viewport(project, packageId, 'A501', '3d_preview', ground?.id, { role: 'supplemental', scale: 100 }),
      ]),
    );
  }
  if (section) {
    sheets.push(
      sheet(project, packageId, 'A-401', 'Building Section', [
        viewport(project, packageId, 'A401', 'section', section.floor.id, { sourceRefId: section.cut.id, scale: 100 }),
      ]),
    );
  }
  if (hasStructure) {
    floors.forEach((floor, index) => {
      const code = `S-${String(101 + index).padStart(3, '0')}`;
      sheets.push(
        sheet(
          project,
          packageId,
          code,
          `${floor.name} Structural Layout`,
          [viewport(project, packageId, code, 'structural_plan', floor.id, { scale: 100 })],
          { notes: ['Conceptual load paths and structural geometry are coordination aids—not capacity design.'] },
        ),
      );
    });
  }
  if (hasServices) {
    floors.forEach((floor, index) => {
      const code = `M-${String(101 + index).padStart(3, '0')}`;
      sheets.push(
        sheet(
          project,
          packageId,
          code,
          `${floor.name} Services and Egress Coordination`,
          [viewport(project, packageId, code, 'services_plan', floor.id, { scale: 100 })],
          {
            notes: [
              'Services zones and egress routes are preliminary coordination intent—not trade or fire-code design.',
            ],
          },
        ),
      );
    });
  }
  const reportViewports = [];
  if (hasTestFits)
    reportViewports.push(
      viewport(project, packageId, 'Q001T', 'building_report', ground?.id, {
        sourceRefId: 'test_fit_comparison',
        role: 'primary',
      }),
    );
  if (hasApartmentDesign)
    reportViewports.push(
      viewport(project, packageId, 'Q001D', 'building_report', ground?.id, {
        sourceRefId: 'apartment_design_quality',
        role: 'primary',
      }),
    );
  if (hasStructuralRealization)
    reportViewports.push(
      viewport(project, packageId, 'Q001K', 'building_report', ground?.id, {
        sourceRefId: 'structural_realization_basis',
        role: 'primary',
      }),
    );
  if (hasServicesRealization)
    reportViewports.push(
      viewport(project, packageId, 'Q001L', 'building_report', ground?.id, {
        sourceRefId: 'services_realization_basis',
        role: 'primary',
      }),
    );
  if (hasCostRealization)
    reportViewports.push(
      viewport(project, packageId, 'Q001MU', 'building_report', ground?.id, {
        sourceRefId: 'cost_realization_basis',
        role: 'primary',
      }),
    );
  if (hasDocumentationRealization)
    reportViewports.push(
      viewport(project, packageId, 'Q001NU', 'building_report', ground?.id, {
        sourceRefId: 'documentation_realization_basis',
        role: 'primary',
      }),
    );
  if (hasProfessionalExchange)
    reportViewports.push(
      viewport(project, packageId, 'Q001XI', 'building_report', ground?.id, {
        sourceRefId: 'professional_exchange_register',
        role: 'primary',
      }),
    );
  if (hasParking)
    reportViewports.push(
      viewport(project, packageId, 'Q001P', 'building_report', ground?.id, {
        sourceRefId: 'site_access_schedule',
        role: 'secondary',
      }),
    );
  if (hasRooms)
    reportViewports.push(
      viewport(project, packageId, 'Q001A', 'building_report', ground?.id, {
        sourceRefId: 'area_schedule',
        role: 'primary',
      }),
    );
  if (hasOpenings)
    reportViewports.push(
      viewport(project, packageId, 'Q001B', 'building_report', ground?.id, {
        sourceRefId: 'opening_schedule',
        role: 'secondary',
      }),
    );
  if (hasStructure)
    reportViewports.push(
      viewport(project, packageId, 'Q001S', 'building_report', ground?.id, {
        sourceRefId: 'structural_schedule',
        role: 'secondary',
      }),
    );
  if (hasServices)
    reportViewports.push(
      viewport(project, packageId, 'Q001M', 'building_report', ground?.id, {
        sourceRefId: 'services_schedule',
        role: 'secondary',
      }),
    );
  if (takeoff.items.length)
    reportViewports.push(
      viewport(project, packageId, 'Q001C', 'building_report', ground?.id, {
        sourceRefId: 'quantity_summary',
        role: 'secondary',
      }),
    );
  if (hasFeasibility)
    reportViewports.push(
      viewport(project, packageId, 'Q001F', 'building_report', ground?.id, {
        sourceRefId: 'feasibility_summary',
        role: 'secondary',
      }),
    );
  if (reportViewports.length)
    sheets.push(sheet(project, packageId, 'Q-001', 'Schedules, Quantities, and Feasibility', reportViewports));
  sheets.push(
    sheet(project, packageId, 'G-002', 'Coordination Validation Report', [
      viewport(project, packageId, 'G002', 'building_report', ground?.id, { sourceRefId: 'validation' }),
    ]),
  );

  return {
    packageId,
    kind: PRELIMINARY_PACKAGE_KIND,
    deliverables,
    readyDeliverableCount: deliverables.filter((entry) => entry.ready).length,
    totalDeliverableCount: deliverables.length,
    missingDeliverables: deliverables.filter((entry) => !entry.ready),
    sheets,
    modelSignature,
    generatedSheetCount: generatedSheets.length,
    currentGeneratedSheetCount: generatedSheets.filter((entry) => entry.generatedFromModelSignature === modelSignature)
      .length,
    outOfDate:
      generatedSheets.length > 0 &&
      generatedSheets.some((entry) => entry.generatedFromModelSignature !== modelSignature),
    issueCount: issues.length,
    hasParking,
    hasEquipment,
    hasRoofDrainage,
    hasTestFits,
    hasApartmentDesign,
    hasStructuralRealization,
    hasServicesRealization,
    hasCostRealization,
    hasDocumentationRealization,
    hasProfessionalExchange,
    documentationRealizationOutOfDate,
    professionalReviewRequired: true,
  };
}
