import { useState } from 'react';
import { BUILDING_COMMANDS } from '@/domain/buildingCommands';
import { formatBearing, isValidTraverseLine, traverseBoundary } from '@/domain/surveyTraverse';
import styles from './ProjectLifecyclePanel.module.css';

export const LIFECYCLE_STAGES = Object.freeze([
  { id: 'brief', index: 1, label: 'Brief' },
  { id: 'site', index: 2, label: 'Site' },
  { id: 'spaces', index: 3, label: 'Spaces' },
  { id: 'structure', index: 4, label: 'Structure' },
  { id: 'systems', index: 5, label: 'Systems' },
  { id: 'validate', index: 6, label: 'Validate' },
  { id: 'quantities', index: 7, label: 'Quantities' },
  { id: 'documents', index: 8, label: 'Documents' },
]);

function valueOrBlank(value) {
  return value == null ? '' : String(value);
}

function optionalNumber(value) {
  if (value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// An empty field is missing input, not zero: Number('') would quietly commit 0.
function requiredNumber(value) {
  const text = String(value ?? '').trim();
  return text === '' ? Number.NaN : Number(text);
}

function millimetersFromMeters(value) {
  if (value === '') return Number.NaN;
  return Number(value) * 1000;
}

function metersDraft(value) {
  return value == null ? '' : String(value / 1000);
}

function squareMillimetersFromSquareMeters(value) {
  if (value === '') return Number.NaN;
  return Number(value) * 1_000_000;
}

function squareMetersDraft(value) {
  return value == null ? '' : String(value / 1_000_000);
}

function typicalRequirements(typeId, category) {
  const spaces =
    category === 'studio'
      ? [
          ['living_sleeping', 'Living / sleeping area', 1],
          ['bathroom', 'Bathroom', 1],
          ['kitchen', 'Kitchen', 1],
        ]
      : [
          ['living', 'Living area', 1],
          ['bedroom', 'Bedroom', category === 'two_bedroom' ? 2 : 1],
          ['bathroom', 'Bathroom', 1],
          ['kitchen', 'Kitchen', 1],
        ];
  return spaces.map(([spaceType, name, count]) => ({
    id: `${typeId}_${spaceType}`,
    spaceType,
    name,
    minCount: count,
    maxCount: count,
  }));
}

function formatArea(metric) {
  if (metric?.value == null) return 'Not available';
  return `${(metric.value / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 })} m²`;
}

function formatMoney(value, currency = 'PHP') {
  if (value == null) return 'Not set';
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function humanize(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function issueCount(issues, category) {
  return issues.filter((issue) => issue.category === category).length;
}

const QUANTITY_RATE_FIELDS = Object.freeze([
  ['concrete', 'Concrete / m³'],
  ['reinforcement', 'Rebar / kg'],
  ['masonry', 'Masonry / m²'],
  ['fiberCementBoard', 'HardieFlex / fiber-cement board / m²'],
  ['plywoodBoard', 'Plywood wall board / m²'],
  ['wallFraming', 'Wall framing / linear m'],
  ['formwork', 'Formwork / m²'],
  ['floorFinish', 'Floor finish / m²'],
  ['paint', 'Paint / m²'],
  ['roofing', 'Roofing / m²'],
  ['door', 'Door / each'],
  ['window', 'Window / each'],
  ['plumbingFixture', 'Plumbing fixture / each'],
  ['electricalPoint', 'Electrical point / each'],
  ['excavation', 'Excavation / m³'],
]);

function provenanceLabel(provenance) {
  switch (provenance) {
    case 'exact_from_geometry':
      return 'Exact from geometry';
    case 'derived_from_configured_assembly':
      return 'Configured assembly';
    case 'rule_of_thumb_allowance':
      return 'Rule-of-thumb allowance';
    case 'manually_entered':
      return 'Manual';
    default:
      return humanize(provenance);
  }
}

function TestFitPreview({ option }) {
  const blocks = option?.floorPlans?.[0]?.blocks || [];
  const footprint = option?.footprint || [];
  if (!blocks.length || !footprint.length) return null;
  const xs = footprint.map((point) => point.x);
  const ys = footprint.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const width = Math.max(1, Math.max(...xs) - minX);
  const height = Math.max(1, Math.max(...ys) - minY);
  const padding = Math.max(width, height) * 0.04;
  return (
    <svg
      className={styles.testFitPreview}
      viewBox={`${minX - padding} ${minY - padding} ${width + padding * 2} ${height + padding * 2}`}
      role="img"
      aria-label={`${option.name} ground-floor preview`}
    >
      {blocks.map((block) => {
        const [first, , third] = block.polygon;
        return (
          <rect
            key={block.id}
            className={styles[`testFitBlock_${block.kind}`]}
            x={first.x}
            y={first.y}
            width={third.x - first.x}
            height={third.y - first.y}
          />
        );
      })}
    </svg>
  );
}

export function deriveLifecycleStatus(project, derived = {}) {
  const building = project?.building || {};
  const brief = building.brief || {};
  const site = building.site || {};
  const structural = building.systems?.structural || {};
  const program = derived.apartmentProgram || {};
  const issues = derived.validationIssues || [];
  const ledger = derived.siteFeasibility?.areaLedger || {};
  const briefComplete = brief.targetStoreys != null && brief.targetUnitCount != null && brief.targetBudget != null;
  const siteComplete = (site.boundary || []).length >= 3 && ledger.buildableArea?.value != null;
  const testFits = derived.testFitCoordination || {};
  const apartmentDesign = derived.apartmentDesignCoordination || {};
  const structuralRealization = derived.structuralRealization || {};
  const servicesRealization = derived.servicesRealization || {};
  const costRealization = derived.costRealization || {};
  const spacesComplete =
    Boolean(program.configured) && (program.totalUnitInstances > 0 || Boolean(testFits.acceptedOption));
  const structureComplete = structuralRealization.state?.status === 'realized';
  const systemsModeled =
    (building.systems?.plumbing?.shafts || []).length > 0 ||
    (building.systems?.electrical?.riserZones || []).length > 0 ||
    (building.systems?.electrical?.panelZones || []).length > 0 ||
    (building.systems?.electrical?.points || []).length > 0 ||
    (building.systems?.water?.equipmentZones || []).length > 0 ||
    (building.systems?.mechanical?.outdoorUnitZones || []).length > 0 ||
    (building.systems?.plumbing?.drainageRoutes || []).length > 0 ||
    (project?.roofSystem?.drains || []).length > 0 ||
    (building.systems?.egress?.routes || []).length > 0 ||
    (building.systems?.envelope?.ventilationZones || []).length > 0;

  return {
    brief: { state: briefComplete ? 'ready' : 'incomplete', value: briefComplete ? 'Ready' : 'Needs input' },
    site: {
      state: siteComplete ? 'ready' : 'incomplete',
      value: siteComplete ? `${building.site?.parkingPlan?.bays?.length || 0} parking` : 'Not defined',
    },
    spaces: {
      state: spacesComplete ? 'ready' : 'incomplete',
      value:
        apartmentDesign.state?.status === 'detailed'
          ? `${program.totalUnitInstances || 0} units · detailed`
          : testFits.acceptedOption
            ? `${program.totalUnitInstances || 0} units · fit accepted`
            : `${program.totalUnitInstances || 0} units`,
    },
    structure: {
      state: structureComplete ? 'ready' : 'incomplete',
      value: structureComplete
        ? `${structuralRealization.generatedStackCount || 0} stacks · realized`
        : `${(structural.gridSystems || []).length} grids · proposed`,
    },
    systems: {
      state: servicesRealization.state?.status === 'realized' ? 'ready' : systemsModeled ? 'attention' : 'incomplete',
      value:
        servicesRealization.state?.status === 'realized'
          ? `${servicesRealization.actualEntityCounts?.electricalPoints || 0} points · realized`
          : systemsModeled
            ? 'Partial model'
            : 'Not planned',
    },
    validate: {
      state: issues.length ? 'attention' : 'ready',
      value: issues.length ? `${issues.length} issue${issues.length === 1 ? '' : 's'}` : 'Coordinated',
    },
    quantities:
      costRealization.state?.status === 'realized'
        ? {
            state: costRealization.outOfDate ? 'attention' : 'ready',
            value: costRealization.outOfDate
              ? 'Baseline outdated'
              : `${costRealization.lineItemCount || 0} items · realized`,
          }
        : derived.quantityTakeoff?.items?.length
          ? {
              state: derived.quantityTakeoff.unpricedItemCount ? 'attention' : 'ready',
              value: derived.quantityTakeoff.unpricedItemCount
                ? `${derived.quantityTakeoff.unpricedItemCount} unpriced`
                : 'Baseline needed',
            }
          : {
              state: ledger.grossFloorArea?.value > 0 ? 'ready' : 'incomplete',
              value: ledger.grossFloorArea?.value > 0 ? formatArea(ledger.grossFloorArea) : 'No quantities',
            },
    documents: derived.professionalExchange?.activeExchange
      ? {
          state: derived.professionalExchange.outOfDate ? 'attention' : 'ready',
          value: derived.professionalExchange.outOfDate
            ? 'Exchange outdated'
            : `${derived.professionalExchange.activeExchange.manifest?.sheets?.length || 0} sheets · exchanged`,
        }
      : derived.documentPackage?.generatedSheetCount
        ? {
            state:
              derived.documentationRealization?.state?.status === 'issued'
                ? derived.documentationRealization.outOfDate
                  ? 'attention'
                  : 'ready'
                : derived.documentPackage.outOfDate
                  ? 'attention'
                  : 'incomplete',
            value:
              derived.documentationRealization?.state?.status === 'issued'
                ? derived.documentationRealization.outOfDate
                  ? 'Issue outdated'
                  : `${derived.documentationRealization.issuedSheetCount || 0} sheets · issued`
                : derived.documentPackage.outOfDate
                  ? 'Update needed'
                  : 'Issue needed',
          }
        : derived.documentationRealization?.state?.status === 'issued'
          ? {
              state: derived.documentationRealization.outOfDate ? 'attention' : 'ready',
              value: derived.documentationRealization.outOfDate
                ? 'Issue outdated'
                : `${derived.documentationRealization.issuedSheetCount || 0} sheets · issued`,
            }
          : { state: 'incomplete', value: 'Not issued' },
  };
}

function Metric({ label, value, note }) {
  return (
    <div className={styles.metric}>
      <span className={styles.metricLabel}>{label}</span>
      <strong className={styles.metricValue}>{value}</strong>
      {note && <span className={styles.metricNote}>{note}</span>}
    </div>
  );
}

function EmptyState({ children }) {
  return <p className={styles.emptyState}>{children}</p>;
}

function UnitPlacementRow({ instance, floorName, onExecuteCommand }) {
  const [draft, setDraft] = useState(() => ({
    x: metersDraft(instance.placement?.origin?.x),
    y: metersDraft(instance.placement?.origin?.y),
    rotation: valueOrBlank(instance.placement?.rotation ?? 0),
  }));
  const save = () =>
    onExecuteCommand({
      type: BUILDING_COMMANDS.SET_UNIT_INSTANCE_PLACEMENT,
      instanceId: instance.id,
      placement: {
        origin: { x: millimetersFromMeters(draft.x), y: millimetersFromMeters(draft.y) },
        rotation: Number(draft.rotation),
      },
    });
  return (
    <div className={styles.placementRow}>
      <span>
        <strong>{instance.name || instance.id}</strong>
        <small>
          {floorName}
          {instance.detached ? ' · Detached' : ''}
        </small>
      </span>
      <input
        aria-label={`X placement for ${instance.name || instance.id}`}
        type="number"
        step="0.1"
        placeholder="X m"
        value={draft.x}
        onChange={(event) => setDraft((current) => ({ ...current, x: event.target.value }))}
      />
      <input
        aria-label={`Y placement for ${instance.name || instance.id}`}
        type="number"
        step="0.1"
        placeholder="Y m"
        value={draft.y}
        onChange={(event) => setDraft((current) => ({ ...current, y: event.target.value }))}
      />
      <input
        aria-label={`Rotation for ${instance.name || instance.id}`}
        type="number"
        step="1"
        placeholder="°"
        value={draft.rotation}
        onChange={(event) => setDraft((current) => ({ ...current, rotation: event.target.value }))}
      />
      <button type="button" disabled={instance.detached} onClick={save}>
        Set
      </button>
    </div>
  );
}

function BeamIntentRow({ beam, floor, onExecuteCommand }) {
  const [draft, setDraft] = useState(() => ({
    condition: beam.coordination?.condition || 'typical',
    maxPlanningSpan: metersDraft(beam.coordination?.maxPlanningSpan),
    transferReason: beam.coordination?.transferReason || '',
  }));
  const save = () =>
    onExecuteCommand({
      type: BUILDING_COMMANDS.SET_BEAM_COORDINATION_INTENT,
      floorId: floor.id,
      beamId: beam.id,
      condition: draft.condition,
      maxPlanningSpan: draft.maxPlanningSpan === '' ? null : millimetersFromMeters(draft.maxPlanningSpan),
      transferReason: draft.transferReason,
    });
  return (
    <div className={styles.structuralIntentRow}>
      <span>
        <strong>{beam.id}</strong>
        <small>{floor.name}</small>
      </span>
      <select
        aria-label={`Structural condition for ${beam.id}`}
        value={draft.condition}
        onChange={(event) => setDraft((current) => ({ ...current, condition: event.target.value }))}
      >
        <option value="typical">Typical</option>
        <option value="cantilever">Cantilever</option>
        <option value="transfer">Transfer</option>
      </select>
      <input
        aria-label={`Planning span for ${beam.id}`}
        type="number"
        min="0.1"
        step="0.1"
        placeholder="Max m"
        value={draft.maxPlanningSpan}
        onChange={(event) => setDraft((current) => ({ ...current, maxPlanningSpan: event.target.value }))}
      />
      <input
        aria-label={`Transfer reason for ${beam.id}`}
        placeholder="Transfer reason"
        value={draft.transferReason}
        disabled={draft.condition !== 'transfer'}
        onChange={(event) => setDraft((current) => ({ ...current, transferReason: event.target.value }))}
      />
      <button type="button" onClick={save}>
        Set
      </button>
    </div>
  );
}

function BriefStage({ brief, lastCommand, onExecuteCommand }) {
  const [draft, setDraft] = useState(() => ({
    targetStoreys: valueOrBlank(brief.targetStoreys),
    targetUnitCount: valueOrBlank(brief.targetUnitCount),
    targetBudget: valueOrBlank(brief.targetBudget),
    parkingRequirement: valueOrBlank(brief.parkingRequirement),
    targetRentalIncome: valueOrBlank(brief.targetRentalIncome),
    preferredStructuralSystem: brief.preferredStructuralSystem || 'reinforced_concrete_frame',
    accessibilityRequirements: brief.accessibilityRequirements || '',
    roofType: brief.roofType || '',
  }));

  const setField = (field, value) => setDraft((current) => ({ ...current, [field]: value }));
  const apply = () =>
    onExecuteCommand({
      type: BUILDING_COMMANDS.UPDATE_PROJECT_BRIEF,
      updates: {
        targetStoreys: optionalNumber(draft.targetStoreys),
        targetUnitCount: optionalNumber(draft.targetUnitCount),
        targetBudget: optionalNumber(draft.targetBudget),
        parkingRequirement: optionalNumber(draft.parkingRequirement),
        targetRentalIncome: optionalNumber(draft.targetRentalIncome),
        preferredStructuralSystem: draft.preferredStructuralSystem,
        accessibilityRequirements: draft.accessibilityRequirements,
        roofType: draft.roofType,
      },
    });

  return (
    <div className={styles.stageContent}>
      <div className={styles.stageIntro}>
        <strong>Project brief</strong>
        <span>Set feasibility targets before detailed drawing.</span>
      </div>
      <div className={styles.formGrid}>
        <label>
          <span>Storeys</span>
          <input
            aria-label="Target storeys"
            type="number"
            min="0"
            step="1"
            value={draft.targetStoreys}
            onChange={(event) => setField('targetStoreys', event.target.value)}
          />
        </label>
        <label>
          <span>Apartment units</span>
          <input
            aria-label="Target apartment units"
            type="number"
            min="0"
            step="1"
            value={draft.targetUnitCount}
            onChange={(event) => setField('targetUnitCount', event.target.value)}
          />
        </label>
        <label className={styles.wideField}>
          <span>Construction budget (PHP)</span>
          <input
            aria-label="Construction budget"
            type="number"
            min="0"
            step="10000"
            value={draft.targetBudget}
            onChange={(event) => setField('targetBudget', event.target.value)}
          />
        </label>
        <label>
          <span>Parking spaces</span>
          <input
            aria-label="Parking spaces"
            type="number"
            min="0"
            step="1"
            value={draft.parkingRequirement}
            onChange={(event) => setField('parkingRequirement', event.target.value)}
          />
        </label>
        <label>
          <span>Monthly rent target</span>
          <input
            aria-label="Monthly rent target"
            type="number"
            min="0"
            step="1000"
            value={draft.targetRentalIncome}
            onChange={(event) => setField('targetRentalIncome', event.target.value)}
          />
        </label>
        <label className={styles.wideField}>
          <span>Structural strategy</span>
          <select
            aria-label="Structural strategy"
            value={draft.preferredStructuralSystem}
            onChange={(event) => setField('preferredStructuralSystem', event.target.value)}
          >
            <option value="reinforced_concrete_frame">Reinforced-concrete frame</option>
            <option value="confined_masonry">Confined masonry</option>
          </select>
        </label>
        <label className={styles.wideField}>
          <span>Roof intent</span>
          <input
            aria-label="Roof intent"
            value={draft.roofType}
            placeholder="e.g. hip roof"
            onChange={(event) => setField('roofType', event.target.value)}
          />
        </label>
        <label className={styles.wideField}>
          <span>Accessibility requirements</span>
          <textarea
            aria-label="Accessibility requirements"
            rows="2"
            value={draft.accessibilityRequirements}
            onChange={(event) => setField('accessibilityRequirements', event.target.value)}
          />
        </label>
      </div>
      <button type="button" className={styles.primaryAction} onClick={apply}>
        Apply brief
      </button>
      {lastCommand?.commandType === BUILDING_COMMANDS.UPDATE_PROJECT_BRIEF && (
        <span className={lastCommand.ok ? styles.commandSuccess : styles.commandError}>
          {lastCommand.ok ? 'Brief updated and checks rerun.' : lastCommand.error?.message}
        </span>
      )}
    </div>
  );
}

function RectangularLotForm({ site, lastCommand, onExecuteCommand }) {
  const setup = site.lotSetup?.kind === 'rectangle' ? site.lotSetup : null;
  const setbackByRole = new Map((site.edgeSetbacks || []).map((entry) => [entry.classification, entry.distance]));
  const [draft, setDraft] = useState(() => ({
    width: metersDraft(setup?.width),
    depth: metersDraft(setup?.depth),
    northAngle: valueOrBlank(site.northAngle ?? 0),
    frontEdgeIndex: valueOrBlank(setup?.frontEdgeIndex ?? 0),
    roadName: setup?.roadName || site.roadEdges?.[0]?.roadName || 'Road',
    frontSetback: metersDraft(setbackByRole.get('front')),
    rearSetback: metersDraft(setbackByRole.get('rear')),
    leftSetback: metersDraft(setbackByRole.get('left')),
    rightSetback: metersDraft(setbackByRole.get('right')),
  }));
  const setField = (field, value) => setDraft((current) => ({ ...current, [field]: value }));
  const apply = () =>
    onExecuteCommand({
      type: BUILDING_COMMANDS.CONFIGURE_RECTANGULAR_SITE,
      boundaryId: site.boundaryId,
      width: millimetersFromMeters(draft.width),
      depth: millimetersFromMeters(draft.depth),
      origin: setup?.origin || { x: 0, y: 0 },
      northAngle: Number(draft.northAngle),
      frontEdgeIndex: Number(draft.frontEdgeIndex),
      roadName: draft.roadName,
      setbacks: {
        front: millimetersFromMeters(draft.frontSetback),
        rear: millimetersFromMeters(draft.rearSetback),
        left: millimetersFromMeters(draft.leftSetback),
        right: millimetersFromMeters(draft.rightSetback),
      },
    });

  return (
    <div className={styles.formSection}>
      <strong>Rectangular lot setup</strong>
      <div className={styles.formGrid}>
        <label>
          <span>Lot width (m)</span>
          <input
            aria-label="Lot width"
            type="number"
            min="0.1"
            step="0.1"
            value={draft.width}
            onChange={(event) => setField('width', event.target.value)}
          />
        </label>
        <label>
          <span>Lot depth (m)</span>
          <input
            aria-label="Lot depth"
            type="number"
            min="0.1"
            step="0.1"
            value={draft.depth}
            onChange={(event) => setField('depth', event.target.value)}
          />
        </label>
        <label>
          <span>North angle (°)</span>
          <input
            aria-label="North angle"
            type="number"
            step="1"
            value={draft.northAngle}
            onChange={(event) => setField('northAngle', event.target.value)}
          />
        </label>
        <label>
          <span>Road frontage</span>
          <select
            aria-label="Road frontage edge"
            value={draft.frontEdgeIndex}
            onChange={(event) => setField('frontEdgeIndex', event.target.value)}
          >
            <option value="0">Bottom edge</option>
            <option value="1">Right edge</option>
            <option value="2">Top edge</option>
            <option value="3">Left edge</option>
          </select>
        </label>
        <label className={styles.wideField}>
          <span>Road name</span>
          <input
            aria-label="Road name"
            value={draft.roadName}
            onChange={(event) => setField('roadName', event.target.value)}
          />
        </label>
        <label>
          <span>Front setback (m)</span>
          <input
            aria-label="Front setback"
            type="number"
            min="0"
            step="0.1"
            value={draft.frontSetback}
            onChange={(event) => setField('frontSetback', event.target.value)}
          />
        </label>
        <label>
          <span>Rear setback (m)</span>
          <input
            aria-label="Rear setback"
            type="number"
            min="0"
            step="0.1"
            value={draft.rearSetback}
            onChange={(event) => setField('rearSetback', event.target.value)}
          />
        </label>
        <label>
          <span>Left setback (m)</span>
          <input
            aria-label="Left setback"
            type="number"
            min="0"
            step="0.1"
            value={draft.leftSetback}
            onChange={(event) => setField('leftSetback', event.target.value)}
          />
        </label>
        <label>
          <span>Right setback (m)</span>
          <input
            aria-label="Right setback"
            type="number"
            min="0"
            step="0.1"
            value={draft.rightSetback}
            onChange={(event) => setField('rightSetback', event.target.value)}
          />
        </label>
      </div>
      <button type="button" className={styles.primaryAction} onClick={apply}>
        Apply site constraints
      </button>
      {lastCommand?.commandType === BUILDING_COMMANDS.CONFIGURE_RECTANGULAR_SITE && (
        <span className={lastCommand.ok ? styles.commandSuccess : styles.commandError}>
          {lastCommand.ok ? 'Site envelope updated and checked.' : lastCommand.error?.message}
        </span>
      )}
    </div>
  );
}

function TraversePreview({ points, frontEdgeIndex }) {
  if (!points || points.length < 3) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const width = Math.max(1, Math.max(...xs) - minX);
  const height = Math.max(1, Math.max(...ys) - minY);
  const padding = Math.max(width, height) * 0.1;
  const labelSize = Math.max(width, height) * 0.07;
  const frontStart = points[frontEdgeIndex] || points[0];
  const frontEnd = points[(frontEdgeIndex + 1) % points.length] || points[0];
  return (
    <svg
      className={styles.traversePreview}
      viewBox={`${minX - padding} ${minY - padding} ${width + padding * 2} ${height + padding * 2}`}
      role="img"
      aria-label="Surveyed boundary preview"
    >
      <polygon
        className={styles.traversePolygon}
        points={points.map((point) => `${point.x},${point.y}`).join(' ')}
        vectorEffect="non-scaling-stroke"
      />
      <line
        className={styles.traverseFrontEdge}
        x1={frontStart.x}
        y1={frontStart.y}
        x2={frontEnd.x}
        y2={frontEnd.y}
        vectorEffect="non-scaling-stroke"
      />
      {points.map((point, index) => (
        <text key={index} className={styles.traverseCorner} x={point.x} y={point.y} fontSize={labelSize}>
          {index + 1}
        </text>
      ))}
    </svg>
  );
}

const BLANK_TRAVERSE_ROW = Object.freeze({ ns: 'N', degrees: '', minutes: '0', ew: 'E', distance: '', setback: '' });

function SurveyedLotForm({ site, lastCommand, onExecuteCommand }) {
  const setup = site.lotSetup?.kind === 'surveyed' ? site.lotSetup : null;
  const setbackByIndex = new Map((site.edgeSetbacks || []).map((entry) => [entry.edgeIndex, entry.distance]));
  const [rows, setRows] = useState(() =>
    setup
      ? setup.lines.map((entry, index) => ({
          ns: entry.ns,
          degrees: valueOrBlank(entry.degrees),
          minutes: valueOrBlank(entry.minutes ?? 0),
          ew: entry.ew,
          distance: metersDraft(entry.distance),
          setback: metersDraft(setbackByIndex.get(index)),
        }))
      : Array.from({ length: 4 }, () => ({ ...BLANK_TRAVERSE_ROW })),
  );
  const [meta, setMeta] = useState(() => ({
    northAngle: valueOrBlank(site.northAngle ?? 0),
    frontEdgeIndex: valueOrBlank(setup?.frontEdgeIndex ?? 0),
    roadName: setup?.roadName || site.roadEdges?.[0]?.roadName || 'Road',
  }));
  const setMetaField = (field, value) => setMeta((current) => ({ ...current, [field]: value }));
  const setRow = (index, field, value) =>
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row)));
  const addRow = () => setRows((current) => [...current, { ...BLANK_TRAVERSE_ROW }]);
  const removeRow = (index) => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index));

  const draftLines = rows.map((row) => ({
    ns: row.ns,
    ew: row.ew,
    degrees: row.degrees === '' ? Number.NaN : Number(row.degrees),
    minutes: row.minutes === '' ? 0 : Number(row.minutes),
    distance: millimetersFromMeters(row.distance),
  }));
  const frontEdgeIndex = Math.min(Math.max(0, Number(meta.frontEdgeIndex) || 0), rows.length - 1);
  const traverse = traverseBoundary(draftLines, { northAngle: Number(meta.northAngle) || 0 });
  const closureLabel = traverse
    ? traverse.misclosure < 1
      ? 'Closes exactly'
      : `${Math.round(traverse.misclosure)} mm (1:${Math.max(
          1,
          Math.round(traverse.perimeter / traverse.misclosure),
        ).toLocaleString()})`
    : 'Not available';
  const cornerAfter = (index) => (index + 1 >= rows.length ? 1 : index + 2);

  const apply = () =>
    onExecuteCommand({
      type: BUILDING_COMMANDS.CONFIGURE_SURVEYED_SITE,
      boundaryId: site.boundaryId,
      lines: draftLines,
      origin: setup?.origin || { x: 0, y: 0 },
      northAngle: Number(meta.northAngle),
      frontEdgeIndex,
      roadName: meta.roadName,
      edgeSetbacks: rows.map((row, index) => ({ edgeIndex: index, distance: millimetersFromMeters(row.setback) })),
    });

  return (
    <div className={styles.formSection}>
      <strong>Surveyed lot boundary</strong>
      <span className={styles.formHint}>
        Copy the technical description from the surveyor&apos;s plan: one bearing and distance per boundary line. Corner
        numbers match the plan.
      </span>
      <div className={styles.traverseTable}>
        {rows.map((row, index) => (
          <div className={styles.traverseRow} key={index}>
            <div className={styles.traverseBearing}>
              <span className={styles.traverseLineLabel}>
                {index + 1}–{cornerAfter(index)}
              </span>
              <select
                aria-label={`Line ${index + 1} north or south`}
                value={row.ns}
                onChange={(event) => setRow(index, 'ns', event.target.value)}
              >
                <option value="N">N</option>
                <option value="S">S</option>
              </select>
              <input
                aria-label={`Line ${index + 1} bearing degrees`}
                type="number"
                min="0"
                max="90"
                step="1"
                placeholder="°"
                value={row.degrees}
                onChange={(event) => setRow(index, 'degrees', event.target.value)}
              />
              <input
                aria-label={`Line ${index + 1} bearing minutes`}
                type="number"
                min="0"
                max="59"
                step="1"
                placeholder="′"
                value={row.minutes}
                onChange={(event) => setRow(index, 'minutes', event.target.value)}
              />
              <select
                aria-label={`Line ${index + 1} east or west`}
                value={row.ew}
                onChange={(event) => setRow(index, 'ew', event.target.value)}
              >
                <option value="E">E</option>
                <option value="W">W</option>
              </select>
              <button
                type="button"
                className={styles.traverseRemove}
                aria-label={`Remove line ${index + 1}`}
                onClick={() => removeRow(index)}
                disabled={rows.length <= 3}
              >
                ×
              </button>
            </div>
            <div className={styles.traverseMeasures}>
              <label>
                <span>Distance (m)</span>
                <input
                  aria-label={`Line ${index + 1} distance`}
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={row.distance}
                  onChange={(event) => setRow(index, 'distance', event.target.value)}
                />
              </label>
              <label>
                <span>Setback (m)</span>
                <input
                  aria-label={`Line ${index + 1} setback`}
                  type="number"
                  min="0"
                  step="0.1"
                  value={row.setback}
                  onChange={(event) => setRow(index, 'setback', event.target.value)}
                />
              </label>
            </div>
          </div>
        ))}
      </div>
      <button type="button" className={styles.secondaryAction} onClick={addRow}>
        Add boundary line
      </button>
      <div className={styles.formGrid}>
        <label>
          <span>North angle (°)</span>
          <input
            aria-label="North angle"
            type="number"
            step="1"
            value={meta.northAngle}
            onChange={(event) => setMetaField('northAngle', event.target.value)}
          />
        </label>
        <label>
          <span>Road frontage</span>
          <select
            aria-label="Road frontage edge"
            value={meta.frontEdgeIndex}
            onChange={(event) => setMetaField('frontEdgeIndex', event.target.value)}
          >
            {rows.map((row, index) => (
              <option key={index} value={index}>
                {`Line ${index + 1}–${cornerAfter(index)}${
                  isValidTraverseLine(draftLines[index])
                    ? ` (${formatBearing(draftLines[index])}, ${row.distance} m)`
                    : ''
                }`}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.wideField}>
          <span>Road name</span>
          <input
            aria-label="Road name"
            value={meta.roadName}
            onChange={(event) => setMetaField('roadName', event.target.value)}
          />
        </label>
      </div>
      {traverse && (
        <>
          <div className={styles.metricsGrid}>
            <Metric
              label="Computed area"
              value={`${(traverse.area / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })} m²`}
              note="Compare with the titled area"
            />
            <Metric
              label="Perimeter"
              value={`${(traverse.perimeter / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} m`}
            />
            <Metric label="Closure error" value={closureLabel} note="Rounding on the plan leaves a small gap" />
          </div>
          <TraversePreview points={traverse.points} frontEdgeIndex={frontEdgeIndex} />
        </>
      )}
      <button type="button" className={styles.primaryAction} onClick={apply} disabled={!traverse}>
        Apply surveyed boundary
      </button>
      {lastCommand?.commandType === BUILDING_COMMANDS.CONFIGURE_SURVEYED_SITE && (
        <span className={lastCommand.ok ? styles.commandSuccess : styles.commandError}>
          {lastCommand.ok ? 'Surveyed boundary applied and checked.' : lastCommand.error?.message}
        </span>
      )}
    </div>
  );
}

function SiteStage({ building, ledger, parking, lastCommand, onExecuteCommand }) {
  const site = building.site || {};
  const setup = site.lotSetup;
  const [lotMode, setLotMode] = useState(() => (setup?.kind === 'surveyed' ? 'surveyed' : 'rectangle'));
  const firstBay = site.parkingPlan?.bays?.[0];
  const accessRoute = site.parkingPlan?.accessRoutes?.[0];
  const frontageIndex = setup?.frontEdgeIndex ?? 0;
  const frontageStart = site.boundary?.[frontageIndex] || { x: 0, y: 0 };
  const frontageEnd = site.boundary?.[(frontageIndex + 1) % (site.boundary?.length || 1)] || { x: 0, y: 0 };
  const [parkingDraft, setParkingDraft] = useState(() => ({
    bayCount: valueOrBlank(site.parkingPlan?.bays?.length ?? parking?.targetCount ?? 0),
    bayWidth: metersDraft(firstBay?.width ?? 2500),
    bayLength: metersDraft(firstBay?.length ?? 5000),
    bayGap: '0',
    firstBayX: metersDraft(firstBay?.origin?.x ?? (setup?.origin?.x || 0) + 2500),
    firstBayY: metersDraft(firstBay?.origin?.y ?? (setup?.origin?.y || 0) + 2500),
    angle: valueOrBlank(firstBay?.angle ?? 0),
    accessWidth: metersDraft(accessRoute?.clearWidth ?? 3000),
    routeStartX: metersDraft(accessRoute?.points?.[0]?.x ?? (frontageStart.x + frontageEnd.x) / 2),
    routeStartY: metersDraft(accessRoute?.points?.[0]?.y ?? (frontageStart.y + frontageEnd.y) / 2),
    routeEndX: metersDraft(accessRoute?.points?.at(-1)?.x ?? firstBay?.origin?.x ?? (setup?.origin?.x || 0) + 2500),
    routeEndY: metersDraft(accessRoute?.points?.at(-1)?.y ?? firstBay?.origin?.y ?? (setup?.origin?.y || 0) + 2500),
  }));
  const applyParking = () =>
    onExecuteCommand({
      type: BUILDING_COMMANDS.CONFIGURE_REGULAR_PARKING_PLAN,
      planId: `${building.id}_parking`,
      bayCount: Number(parkingDraft.bayCount),
      bayWidth: millimetersFromMeters(parkingDraft.bayWidth),
      bayLength: millimetersFromMeters(parkingDraft.bayLength),
      bayGap: millimetersFromMeters(parkingDraft.bayGap),
      firstBayOrigin: {
        x: millimetersFromMeters(parkingDraft.firstBayX),
        y: millimetersFromMeters(parkingDraft.firstBayY),
      },
      angle: Number(parkingDraft.angle),
      location: 'open_site',
      roadEdgeIndex: frontageIndex,
      accessWidth: millimetersFromMeters(parkingDraft.accessWidth),
      routePoints: [
        { x: millimetersFromMeters(parkingDraft.routeStartX), y: millimetersFromMeters(parkingDraft.routeStartY) },
        { x: millimetersFromMeters(parkingDraft.routeEndX), y: millimetersFromMeters(parkingDraft.routeEndY) },
      ],
    });

  return (
    <div className={styles.stageContent}>
      <div className={styles.stageIntro}>
        <strong>Site feasibility</strong>
        <span>Geometry and configured setback assumptions.</span>
      </div>
      <div className={styles.metricsGrid}>
        <Metric label="Lot area" value={formatArea(ledger.lotArea)} note={humanize(ledger.lotArea?.provenance)} />
        <Metric
          label="Buildable area"
          value={formatArea(ledger.buildableArea)}
          note={humanize(ledger.buildableArea?.provenance)}
        />
        <Metric label="Open space" value={formatArea(ledger.openSpaceArea)} />
        <Metric
          label="Boundary"
          value={(site.boundary || []).length >= 3 ? `${site.boundary.length} points` : 'Not defined'}
        />
        <Metric
          label="Parking"
          value={`${parking?.modeledBayCount || 0}/${parking?.targetCount || 0} bays`}
          note="Modeled / target"
        />
        <Metric
          label="Vehicle access"
          value={`${parking?.accessRouteCount || 0} routes`}
          note={`${parking?.explicitlyServedBayCount || 0} bays related`}
        />
      </div>
      <div className={styles.lotModeToggle} role="group" aria-label="Lot input mode">
        <button type="button" aria-pressed={lotMode === 'rectangle'} onClick={() => setLotMode('rectangle')}>
          Rectangular lot
        </button>
        <button type="button" aria-pressed={lotMode === 'surveyed'} onClick={() => setLotMode('surveyed')}>
          Surveyed boundary
        </button>
      </div>
      {lotMode === 'rectangle' ? (
        <RectangularLotForm site={site} lastCommand={lastCommand} onExecuteCommand={onExecuteCommand} />
      ) : (
        <SurveyedLotForm site={site} lastCommand={lastCommand} onExecuteCommand={onExecuteCommand} />
      )}
      {(site.boundary || []).length >= 3 && (
        <div className={styles.formSection}>
          <strong>Regular parking and road access</strong>
          <div className={styles.formGrid}>
            <label>
              <span>Bay count</span>
              <input
                aria-label="Parking bay count"
                type="number"
                min="0"
                step="1"
                value={parkingDraft.bayCount}
                onChange={(event) => setParkingDraft((current) => ({ ...current, bayCount: event.target.value }))}
              />
            </label>
            <label>
              <span>Bay width (m)</span>
              <input
                aria-label="Parking bay width"
                type="number"
                min="0.1"
                step="0.1"
                value={parkingDraft.bayWidth}
                onChange={(event) => setParkingDraft((current) => ({ ...current, bayWidth: event.target.value }))}
              />
            </label>
            <label>
              <span>Bay length (m)</span>
              <input
                aria-label="Parking bay length"
                type="number"
                min="0.1"
                step="0.1"
                value={parkingDraft.bayLength}
                onChange={(event) => setParkingDraft((current) => ({ ...current, bayLength: event.target.value }))}
              />
            </label>
            <label>
              <span>Bay gap (m)</span>
              <input
                aria-label="Parking bay gap"
                type="number"
                min="0"
                step="0.1"
                value={parkingDraft.bayGap}
                onChange={(event) => setParkingDraft((current) => ({ ...current, bayGap: event.target.value }))}
              />
            </label>
            <label>
              <span>First bay X (m)</span>
              <input
                aria-label="First parking bay X"
                type="number"
                step="0.1"
                value={parkingDraft.firstBayX}
                onChange={(event) => setParkingDraft((current) => ({ ...current, firstBayX: event.target.value }))}
              />
            </label>
            <label>
              <span>First bay Y (m)</span>
              <input
                aria-label="First parking bay Y"
                type="number"
                step="0.1"
                value={parkingDraft.firstBayY}
                onChange={(event) => setParkingDraft((current) => ({ ...current, firstBayY: event.target.value }))}
              />
            </label>
            <label>
              <span>Row angle (°)</span>
              <input
                aria-label="Parking row angle"
                type="number"
                step="1"
                value={parkingDraft.angle}
                onChange={(event) => setParkingDraft((current) => ({ ...current, angle: event.target.value }))}
              />
            </label>
            <label>
              <span>Access width (m)</span>
              <input
                aria-label="Vehicle access width"
                type="number"
                min="0.1"
                step="0.1"
                value={parkingDraft.accessWidth}
                onChange={(event) => setParkingDraft((current) => ({ ...current, accessWidth: event.target.value }))}
              />
            </label>
            <label>
              <span>Road start X (m)</span>
              <input
                aria-label="Vehicle route start X"
                type="number"
                step="0.1"
                value={parkingDraft.routeStartX}
                onChange={(event) => setParkingDraft((current) => ({ ...current, routeStartX: event.target.value }))}
              />
            </label>
            <label>
              <span>Road start Y (m)</span>
              <input
                aria-label="Vehicle route start Y"
                type="number"
                step="0.1"
                value={parkingDraft.routeStartY}
                onChange={(event) => setParkingDraft((current) => ({ ...current, routeStartY: event.target.value }))}
              />
            </label>
            <label>
              <span>Access end X (m)</span>
              <input
                aria-label="Vehicle route end X"
                type="number"
                step="0.1"
                value={parkingDraft.routeEndX}
                onChange={(event) => setParkingDraft((current) => ({ ...current, routeEndX: event.target.value }))}
              />
            </label>
            <label>
              <span>Access end Y (m)</span>
              <input
                aria-label="Vehicle route end Y"
                type="number"
                step="0.1"
                value={parkingDraft.routeEndY}
                onChange={(event) => setParkingDraft((current) => ({ ...current, routeEndY: event.target.value }))}
              />
            </label>
          </div>
          <button type="button" className={styles.primaryAction} onClick={applyParking}>
            Apply parking and access
          </button>
          <p className={styles.disclaimer}>
            Geometric access screening only—no swept-path, traffic, accessibility, or parking-code approval.
          </p>
        </div>
      )}
      <p className={styles.disclaimer}>Configured setbacks require confirmation by the permitting professionals.</p>
    </div>
  );
}

function SpacesStage({ project, building, program, ledger, testFits, apartmentDesign, lastCommand, onExecuteCommand }) {
  const primaryType = (building.unitTypes || [])[0] || null;
  const target = building.spaceProgram?.unitTargets?.find((entry) => entry.unitTypeId === primaryType?.id);
  const [draft, setDraft] = useState(() => ({
    name: primaryType?.name || 'Typical Studio',
    category: primaryType?.category || 'studio',
    targetCount: valueOrBlank(target?.count ?? building.brief?.targetUnitCount ?? 4),
    minArea: squareMetersDraft(primaryType?.targetArea?.min ?? 20_000_000),
    preferredArea: squareMetersDraft(primaryType?.targetArea?.preferred ?? 25_000_000),
    maxArea: squareMetersDraft(primaryType?.targetArea?.max ?? 30_000_000),
    parkingRequirement: valueOrBlank(
      building.spaceProgram?.parkingRequirement ?? building.brief?.parkingRequirement ?? 0,
    ),
  }));
  const [testFitDraft, setTestFitDraft] = useState(() => ({
    unitDepth: metersDraft(testFits.profile?.unitDepth ?? 5500),
    corridorWidth: metersDraft(testFits.profile?.corridorWidth ?? 1500),
    stairWidth: metersDraft(testFits.profile?.stairWidth ?? 2400),
    stairDepth: metersDraft(testFits.profile?.stairDepth ?? 4500),
    wetCoreWidth: metersDraft(testFits.profile?.wetCoreWidth ?? 1200),
    wetCoreDepth: metersDraft(testFits.profile?.wetCoreDepth ?? 1800),
    structuralBayTarget: metersDraft(testFits.profile?.structuralBayTarget ?? 4000),
    floorToFloorHeight: metersDraft(testFits.profile?.floorToFloorHeight ?? 3000),
    planningCostPerSquareMeter: valueOrBlank(testFits.profile?.planningCostPerSquareMeter),
  }));
  const [designDraft, setDesignDraft] = useState(() => ({
    bathroomWidth: metersDraft(apartmentDesign.profile?.bathroomWidth ?? 1400),
    serviceBandDepth: metersDraft(apartmentDesign.profile?.serviceBandDepth ?? 2000),
    entryDoorWidth: metersDraft(apartmentDesign.profile?.entryDoorWidth ?? 900),
    internalDoorWidth: metersDraft(apartmentDesign.profile?.internalDoorWidth ?? 800),
    exteriorWindowWidth: metersDraft(apartmentDesign.profile?.exteriorWindowWidth ?? 1200),
    minimumSharedBoundary: metersDraft(apartmentDesign.profile?.minimumSharedBoundary ?? 300),
    minimumDaylightGlazingRatio: valueOrBlank(apartmentDesign.profile?.minimumDaylightGlazingRatio ?? 0.08),
    accessibleEntryDoorWidth: metersDraft(apartmentDesign.profile?.accessibleEntryDoorWidth ?? 900),
    accessibleCirculationWidth: metersDraft(apartmentDesign.profile?.accessibleCirculationWidth ?? 1200),
    solarExposureWatchOrientations: (apartmentDesign.profile?.solarExposureWatchOrientations || ['west']).join(','),
    bedClearance: metersDraft(apartmentDesign.profile?.fixtureClearances?.bed ?? 450),
    kitchenClearance: metersDraft(apartmentDesign.profile?.fixtureClearances?.kitchenTop ?? 600),
    plumbingFixtureClearance: metersDraft(apartmentDesign.profile?.fixtureClearances?.toilet ?? 250),
    stairWidth: metersDraft(apartmentDesign.profile?.stairWidth ?? 1000),
    targetRiserHeight: metersDraft(apartmentDesign.profile?.targetRiserHeight ?? 175),
    treadDepth: metersDraft(apartmentDesign.profile?.treadDepth ?? 250),
    minimumHeadroom: metersDraft(apartmentDesign.profile?.minimumHeadroom ?? 2000),
    maximumEgressTravelDistance: metersDraft(apartmentDesign.profile?.maximumEgressTravelDistance ?? 30_000),
  }));
  const setField = (field, value) => setDraft((current) => ({ ...current, [field]: value }));
  const typeId = primaryType?.id || `${building.id}_typical_unit`;
  const requirements = typicalRequirements(typeId, draft.category);
  const sourceInstance = (building.unitInstances || []).find(
    (instance) => instance.typeId === primaryType?.id && !instance.detached && (instance.roomIds || []).length > 0,
  );
  const propagationTargets = (building.unitInstances || []).filter(
    (instance) =>
      instance.typeId === primaryType?.id &&
      !instance.detached &&
      instance.id !== primaryType?.geometryTemplate?.capturedFromInstanceId,
  );
  const configure = () =>
    onExecuteCommand({
      type: BUILDING_COMMANDS.CONFIGURE_TYPICAL_UNIT_PROGRAM,
      unitType: {
        id: typeId,
        name: draft.name,
        category: draft.category,
        targetArea: {
          min: squareMillimetersFromSquareMeters(draft.minArea),
          preferred: squareMillimetersFromSquareMeters(draft.preferredArea),
          max: squareMillimetersFromSquareMeters(draft.maxArea),
        },
        spaceRequirements: requirements,
      },
      targetCount: Number(draft.targetCount),
      parkingRequirement: Number(draft.parkingRequirement),
    });
  const generateInstances = () =>
    onExecuteCommand({
      type: BUILDING_COMMANDS.GENERATE_UNIT_INSTANCES,
      typeId: primaryType.id,
      count: target?.count || Number(draft.targetCount),
      floorIds: (project.floors || []).map((floor) => floor.id),
    });
  const assignRoom = (floor, room, value) => {
    if (!value) {
      if (room.unitInstanceId) {
        onExecuteCommand({
          type: BUILDING_COMMANDS.UNASSIGN_ROOM_FROM_UNIT,
          floorId: floor.id,
          roomId: room.id,
        });
      }
      return;
    }
    const [instanceId, spaceType] = value.split('|');
    onExecuteCommand({
      type: BUILDING_COMMANDS.ASSIGN_ROOM_TO_UNIT,
      floorId: floor.id,
      roomId: room.id,
      instanceId,
      spaceType,
      reassign: Boolean(room.unitInstanceId && room.unitInstanceId !== instanceId),
    });
  };
  const classifyRoom = (floor, room, useCategory) => {
    if (!useCategory) return;
    onExecuteCommand({
      type: BUILDING_COMMANDS.CLASSIFY_ROOM,
      floorId: floor.id,
      roomId: room.id,
      useCategory,
      spaceType:
        useCategory === 'circulation'
          ? 'shared_corridor'
          : useCategory === 'rentable'
            ? room.spaceType || 'rentable_space'
            : useCategory,
      detachFromUnit: Boolean(room.unitInstanceId),
    });
  };
  const captureGeometry = () =>
    onExecuteCommand({
      type: BUILDING_COMMANDS.CAPTURE_UNIT_TYPE_GEOMETRY,
      sourceInstanceId: sourceInstance.id,
    });
  const propagateGeometry = () =>
    onExecuteCommand({
      type: BUILDING_COMMANDS.PROPAGATE_UNIT_TYPE_GEOMETRY,
      unitTypeId: primaryType.id,
      targetInstanceIds: propagationTargets.map((instance) => instance.id),
    });
  const configureTestFit = () =>
    onExecuteCommand({
      type: BUILDING_COMMANDS.CONFIGURE_TEST_FIT_PROFILE,
      unitDepth: millimetersFromMeters(testFitDraft.unitDepth),
      corridorWidth: millimetersFromMeters(testFitDraft.corridorWidth),
      stairWidth: millimetersFromMeters(testFitDraft.stairWidth),
      stairDepth: millimetersFromMeters(testFitDraft.stairDepth),
      wetCoreWidth: millimetersFromMeters(testFitDraft.wetCoreWidth),
      wetCoreDepth: millimetersFromMeters(testFitDraft.wetCoreDepth),
      structuralBayTarget: millimetersFromMeters(testFitDraft.structuralBayTarget),
      floorToFloorHeight: millimetersFromMeters(testFitDraft.floorToFloorHeight),
      planningCostPerSquareMeter: optionalNumber(testFitDraft.planningCostPerSquareMeter),
    });
  const generateTestFits = () => onExecuteCommand({ type: BUILDING_COMMANDS.GENERATE_TEST_FIT_OPTIONS });
  const selectTestFit = (optionId) => onExecuteCommand({ type: BUILDING_COMMANDS.SELECT_TEST_FIT_OPTION, optionId });
  const acceptTestFit = (optionId) => onExecuteCommand({ type: BUILDING_COMMANDS.ACCEPT_TEST_FIT_OPTION, optionId });
  const configureApartmentDesign = () =>
    onExecuteCommand({
      type: BUILDING_COMMANDS.CONFIGURE_APARTMENT_DESIGN_PROFILE,
      bathroomWidth: millimetersFromMeters(designDraft.bathroomWidth),
      serviceBandDepth: millimetersFromMeters(designDraft.serviceBandDepth),
      entryDoorWidth: millimetersFromMeters(designDraft.entryDoorWidth),
      internalDoorWidth: millimetersFromMeters(designDraft.internalDoorWidth),
      exteriorWindowWidth: millimetersFromMeters(designDraft.exteriorWindowWidth),
      minimumSharedBoundary: millimetersFromMeters(designDraft.minimumSharedBoundary),
      minimumDaylightGlazingRatio: Number(designDraft.minimumDaylightGlazingRatio),
      accessibleEntryDoorWidth: millimetersFromMeters(designDraft.accessibleEntryDoorWidth),
      accessibleCirculationWidth: millimetersFromMeters(designDraft.accessibleCirculationWidth),
      solarExposureWatchOrientations: designDraft.solarExposureWatchOrientations
        .split(',')
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean),
      fixtureClearances: {
        bed: millimetersFromMeters(designDraft.bedClearance),
        sofa: millimetersFromMeters(designDraft.bedClearance),
        kitchenTop: millimetersFromMeters(designDraft.kitchenClearance),
        toilet: millimetersFromMeters(designDraft.plumbingFixtureClearance),
        lavatory: millimetersFromMeters(designDraft.plumbingFixtureClearance),
      },
      stairWidth: millimetersFromMeters(designDraft.stairWidth),
      targetRiserHeight: millimetersFromMeters(designDraft.targetRiserHeight),
      treadDepth: millimetersFromMeters(designDraft.treadDepth),
      minimumHeadroom: millimetersFromMeters(designDraft.minimumHeadroom),
      maximumEgressTravelDistance: millimetersFromMeters(designDraft.maximumEgressTravelDistance),
    });
  const detailAcceptedTestFit = () => onExecuteCommand({ type: BUILDING_COMMANDS.DETAIL_ACCEPTED_TEST_FIT });

  return (
    <div className={styles.stageContent}>
      <div className={styles.stageIntro}>
        <strong>Apartment program</strong>
        <span>Linked types, instances, and classified room areas.</span>
      </div>
      <div className={styles.metricsGrid}>
        <Metric label="Unit types" value={(building.unitTypes || []).length} />
        <Metric label="Instances" value={program.totalUnitInstances || 0} />
        <Metric
          label="Typical geometry"
          value={primaryType?.geometryTemplate?.rooms?.length ? `Revision ${primaryType.revision}` : 'Not captured'}
          note={
            primaryType?.geometryTemplate?.rooms?.length
              ? `${primaryType.geometryTemplate.rooms.length} rooms · ${primaryType.geometryTemplate.walls.length} walls`
              : 'Map a source unit first'
          }
        />
        <Metric
          label="Apartment design"
          value={
            apartmentDesign.state?.status === 'detailed'
              ? `${apartmentDesign.detailedUnitCount || 0} detailed`
              : 'Block layout'
          }
          note={
            apartmentDesign.outOfDate
              ? 'Update required'
              : `${apartmentDesign.adjacencyCompleteUnitCount || 0} adjacency-complete`
          }
        />
        <Metric label="Rentable" value={formatArea(ledger.netRentableArea)} />
        <Metric
          label="Efficiency"
          value={
            ledger.efficiencyRatio?.value == null
              ? 'Not available'
              : `${Math.round(ledger.efficiencyRatio.value * 100)}%`
          }
        />
        <Metric
          label="Test fits"
          value={`${testFits.options?.length || 0} alternatives`}
          note={
            testFits.acceptedOption
              ? `${testFits.acceptedOption.name} accepted`
              : `${testFits.readyOptionCount || 0} ready`
          }
        />
      </div>
      <div className={styles.formSection}>
        <strong>Apartment design closure</strong>
        <p className={styles.disclaimer}>
          Convert the accepted block layout into deterministic apartment rooms, partitions, openings, representative
          furniture and wet fixtures, stair geometry, headroom openings, and room-to-stair circulation paths.
        </p>
        <div className={styles.metricsGrid}>
          <Metric
            label="Detailed units"
            value={`${apartmentDesign.detailedUnitCount || 0}/${program.totalUnitInstances || 0}`}
          />
          <Metric
            label="Adjacency"
            value={`${apartmentDesign.adjacencyCompleteUnitCount || 0}/${program.totalUnitInstances || 0}`}
          />
          <Metric
            label="Fixture clearance"
            value={`${apartmentDesign.fixtureClearancePassCount || 0}/${apartmentDesign.fixtures?.length || 0}`}
          />
          <Metric
            label="Unit egress paths"
            value={`${apartmentDesign.egressCompleteUnitCount || 0}/${program.totalUnitInstances || 0}`}
          />
          <Metric
            label="Daylight potential"
            value={`${apartmentDesign.daylightReadyRoomCount || 0}/${apartmentDesign.roomEnvironmental?.length || 0} rooms`}
          />
          <Metric label="Actual stairs" value={apartmentDesign.actualStairCount || 0} />
        </div>
        <div className={styles.formGrid}>
          <label>
            <span>Bathroom width (m)</span>
            <input
              aria-label="Apartment bathroom width"
              type="number"
              min="0.1"
              step="0.1"
              value={designDraft.bathroomWidth}
              onChange={(event) => setDesignDraft((current) => ({ ...current, bathroomWidth: event.target.value }))}
            />
          </label>
          <label>
            <span>Service-band depth (m)</span>
            <input
              aria-label="Apartment service band depth"
              type="number"
              min="0.1"
              step="0.1"
              value={designDraft.serviceBandDepth}
              onChange={(event) => setDesignDraft((current) => ({ ...current, serviceBandDepth: event.target.value }))}
            />
          </label>
          <label>
            <span>Entry door width (m)</span>
            <input
              aria-label="Apartment entry door width"
              type="number"
              min="0.1"
              step="0.05"
              value={designDraft.entryDoorWidth}
              onChange={(event) => setDesignDraft((current) => ({ ...current, entryDoorWidth: event.target.value }))}
            />
          </label>
          <label>
            <span>Internal door width (m)</span>
            <input
              aria-label="Apartment internal door width"
              type="number"
              min="0.1"
              step="0.05"
              value={designDraft.internalDoorWidth}
              onChange={(event) => setDesignDraft((current) => ({ ...current, internalDoorWidth: event.target.value }))}
            />
          </label>
          <label>
            <span>Exterior window width (m)</span>
            <input
              aria-label="Apartment exterior window width"
              type="number"
              min="0.1"
              step="0.1"
              value={designDraft.exteriorWindowWidth}
              onChange={(event) =>
                setDesignDraft((current) => ({ ...current, exteriorWindowWidth: event.target.value }))
              }
            />
          </label>
          <label>
            <span>Adjacency boundary (m)</span>
            <input
              aria-label="Apartment minimum shared boundary"
              type="number"
              min="0.05"
              step="0.05"
              value={designDraft.minimumSharedBoundary}
              onChange={(event) =>
                setDesignDraft((current) => ({ ...current, minimumSharedBoundary: event.target.value }))
              }
            />
          </label>
          <label>
            <span>Glazing / room ratio</span>
            <input
              aria-label="Apartment daylight glazing ratio"
              type="number"
              min="0.01"
              max="1"
              step="0.01"
              value={designDraft.minimumDaylightGlazingRatio}
              onChange={(event) =>
                setDesignDraft((current) => ({ ...current, minimumDaylightGlazingRatio: event.target.value }))
              }
            />
          </label>
          <label>
            <span>Accessible entry intent (m)</span>
            <input
              aria-label="Apartment accessible entry width"
              type="number"
              min="0.1"
              step="0.05"
              value={designDraft.accessibleEntryDoorWidth}
              onChange={(event) =>
                setDesignDraft((current) => ({ ...current, accessibleEntryDoorWidth: event.target.value }))
              }
            />
          </label>
          <label>
            <span>Accessible circulation intent (m)</span>
            <input
              aria-label="Apartment accessible circulation width"
              type="number"
              min="0.1"
              step="0.05"
              value={designDraft.accessibleCirculationWidth}
              onChange={(event) =>
                setDesignDraft((current) => ({ ...current, accessibleCirculationWidth: event.target.value }))
              }
            />
          </label>
          <label>
            <span>Solar review orientations</span>
            <input
              aria-label="Apartment solar review orientations"
              value={designDraft.solarExposureWatchOrientations}
              onChange={(event) =>
                setDesignDraft((current) => ({ ...current, solarExposureWatchOrientations: event.target.value }))
              }
            />
          </label>
          <label>
            <span>Bed / sofa clearance (m)</span>
            <input
              aria-label="Apartment bed clearance"
              type="number"
              min="0"
              step="0.05"
              value={designDraft.bedClearance}
              onChange={(event) => setDesignDraft((current) => ({ ...current, bedClearance: event.target.value }))}
            />
          </label>
          <label>
            <span>Kitchen clearance (m)</span>
            <input
              aria-label="Apartment kitchen clearance"
              type="number"
              min="0"
              step="0.05"
              value={designDraft.kitchenClearance}
              onChange={(event) => setDesignDraft((current) => ({ ...current, kitchenClearance: event.target.value }))}
            />
          </label>
          <label>
            <span>Plumbing fixture clearance (m)</span>
            <input
              aria-label="Apartment plumbing fixture clearance"
              type="number"
              min="0"
              step="0.05"
              value={designDraft.plumbingFixtureClearance}
              onChange={(event) =>
                setDesignDraft((current) => ({ ...current, plumbingFixtureClearance: event.target.value }))
              }
            />
          </label>
          <label>
            <span>Stair width (m)</span>
            <input
              aria-label="Apartment actual stair width"
              type="number"
              min="0.1"
              step="0.05"
              value={designDraft.stairWidth}
              onChange={(event) => setDesignDraft((current) => ({ ...current, stairWidth: event.target.value }))}
            />
          </label>
          <label>
            <span>Target riser (m)</span>
            <input
              aria-label="Apartment target riser height"
              type="number"
              min="0.05"
              step="0.005"
              value={designDraft.targetRiserHeight}
              onChange={(event) => setDesignDraft((current) => ({ ...current, targetRiserHeight: event.target.value }))}
            />
          </label>
          <label>
            <span>Tread depth (m)</span>
            <input
              aria-label="Apartment tread depth"
              type="number"
              min="0.1"
              step="0.01"
              value={designDraft.treadDepth}
              onChange={(event) => setDesignDraft((current) => ({ ...current, treadDepth: event.target.value }))}
            />
          </label>
          <label>
            <span>Headroom (m)</span>
            <input
              aria-label="Apartment stair headroom"
              type="number"
              min="0.1"
              step="0.05"
              value={designDraft.minimumHeadroom}
              onChange={(event) => setDesignDraft((current) => ({ ...current, minimumHeadroom: event.target.value }))}
            />
          </label>
          <label className={styles.wideField}>
            <span>Unit-to-stair planning distance (m)</span>
            <input
              aria-label="Apartment egress planning distance"
              type="number"
              min="0.1"
              step="0.5"
              value={designDraft.maximumEgressTravelDistance}
              onChange={(event) =>
                setDesignDraft((current) => ({ ...current, maximumEgressTravelDistance: event.target.value }))
              }
            />
          </label>
        </div>
        <button type="button" className={styles.secondaryAction} onClick={configureApartmentDesign}>
          Save apartment design assumptions
        </button>
        <button
          type="button"
          className={styles.primaryAction}
          disabled={!testFits.acceptedOption}
          onClick={detailAcceptedTestFit}
        >
          {apartmentDesign.state?.status === 'detailed'
            ? 'Regenerate deterministic apartment details'
            : 'Detail accepted test fit'}
        </button>
        <p className={styles.disclaimer}>
          Generated furniture and fixtures are clearance probes, not a furnishing recommendation. Daylight and solar
          orientation are geometric potential only. Circulation paths do not prove accessibility, fire-code compliance,
          or safe evacuation; licensed professionals must review and finalize every result.
        </p>
      </div>
      <div className={styles.formSection}>
        <strong>Program-to-test-fit composer</strong>
        <p className={styles.disclaimer}>
          Deterministic early-planning alternatives from the checked buildable envelope, apartment program, storeys,
          parking target, budget, and explicit planning assumptions.
        </p>
        <div className={styles.formGrid}>
          <label>
            <span>Unit depth (m)</span>
            <input
              aria-label="Test fit unit depth"
              type="number"
              min="0.1"
              step="0.1"
              value={testFitDraft.unitDepth}
              onChange={(event) => setTestFitDraft((current) => ({ ...current, unitDepth: event.target.value }))}
            />
          </label>
          <label>
            <span>Corridor width (m)</span>
            <input
              aria-label="Test fit corridor width"
              type="number"
              min="0.1"
              step="0.1"
              value={testFitDraft.corridorWidth}
              onChange={(event) => setTestFitDraft((current) => ({ ...current, corridorWidth: event.target.value }))}
            />
          </label>
          <label>
            <span>Stair width (m)</span>
            <input
              aria-label="Test fit stair width"
              type="number"
              min="0.1"
              step="0.1"
              value={testFitDraft.stairWidth}
              onChange={(event) => setTestFitDraft((current) => ({ ...current, stairWidth: event.target.value }))}
            />
          </label>
          <label>
            <span>Stair depth (m)</span>
            <input
              aria-label="Test fit stair depth"
              type="number"
              min="0.1"
              step="0.1"
              value={testFitDraft.stairDepth}
              onChange={(event) => setTestFitDraft((current) => ({ ...current, stairDepth: event.target.value }))}
            />
          </label>
          <label>
            <span>Wet-core width (m)</span>
            <input
              aria-label="Test fit wet core width"
              type="number"
              min="0.1"
              step="0.1"
              value={testFitDraft.wetCoreWidth}
              onChange={(event) => setTestFitDraft((current) => ({ ...current, wetCoreWidth: event.target.value }))}
            />
          </label>
          <label>
            <span>Wet-core depth (m)</span>
            <input
              aria-label="Test fit wet core depth"
              type="number"
              min="0.1"
              step="0.1"
              value={testFitDraft.wetCoreDepth}
              onChange={(event) => setTestFitDraft((current) => ({ ...current, wetCoreDepth: event.target.value }))}
            />
          </label>
          <label>
            <span>Structural bay target (m)</span>
            <input
              aria-label="Test fit structural bay target"
              type="number"
              min="0.1"
              step="0.1"
              value={testFitDraft.structuralBayTarget}
              onChange={(event) =>
                setTestFitDraft((current) => ({ ...current, structuralBayTarget: event.target.value }))
              }
            />
          </label>
          <label>
            <span>Floor-to-floor (m)</span>
            <input
              aria-label="Test fit floor to floor height"
              type="number"
              min="0.1"
              step="0.1"
              value={testFitDraft.floorToFloorHeight}
              onChange={(event) =>
                setTestFitDraft((current) => ({ ...current, floorToFloorHeight: event.target.value }))
              }
            />
          </label>
          <label className={styles.wideField}>
            <span>Planning cost (PHP/m², optional)</span>
            <input
              aria-label="Test fit planning cost per square meter"
              type="number"
              min="0"
              step="100"
              value={testFitDraft.planningCostPerSquareMeter}
              onChange={(event) =>
                setTestFitDraft((current) => ({ ...current, planningCostPerSquareMeter: event.target.value }))
              }
            />
          </label>
        </div>
        <button type="button" className={styles.secondaryAction} onClick={configureTestFit}>
          Save test-fit assumptions
        </button>
        <button type="button" className={styles.primaryAction} onClick={generateTestFits}>
          Generate deterministic alternatives
        </button>
        {(testFits.options || []).length > 0 && (
          <div className={styles.testFitList}>
            {testFits.options.map((option) => {
              const selected = testFits.selectedOption?.id === option.id;
              const accepted = testFits.acceptedOption?.id === option.id;
              const errorCount = option.findings.filter((finding) => finding.severity === 'error').length;
              return (
                <article
                  key={option.id}
                  className={`${styles.testFitCard} ${selected ? styles.testFitCardSelected : ''}`}
                >
                  <div className={styles.testFitTitle}>
                    <strong>{option.name}</strong>
                    <span>Score {option.score}</span>
                  </div>
                  <TestFitPreview option={option} />
                  <div className={styles.testFitMetrics}>
                    <span>
                      {option.metrics.unitCount} units · {option.metrics.storeys} levels
                    </span>
                    <span>{formatArea({ value: option.metrics.grossFloorArea })} GFA</span>
                    <span>{Math.round(option.metrics.efficiencyRatio * 100)}% rentable efficiency</span>
                    <span>
                      {option.metrics.estimatedCost == null
                        ? 'Cost withheld—set an explicit rate'
                        : `${formatMoney(option.metrics.estimatedCost, option.metrics.currency)} planning allowance`}
                    </span>
                  </div>
                  <small>
                    {option.findings.length
                      ? `${option.findings.length} finding${option.findings.length === 1 ? '' : 's'} · ${errorCount} blocking`
                      : 'No deterministic conflicts found'}
                  </small>
                  <button type="button" className={styles.secondaryAction} onClick={() => selectTestFit(option.id)}>
                    {selected ? 'Selected' : 'Compare this option'}
                  </button>
                  <button
                    type="button"
                    className={styles.primaryAction}
                    disabled={errorCount > 0 || accepted}
                    onClick={() => acceptTestFit(option.id)}
                  >
                    {accepted ? 'Accepted into model' : 'Accept as provisional model'}
                  </button>
                </article>
              );
            })}
          </div>
        )}
        <p className={styles.disclaimer}>
          Acceptance creates provisional rooms, walls, slabs, a proposed grid, linked units, and a wet shaft. It refuses
          to overwrite authored geometry. Test fits are not code approval, structural design, or professional
          verification.
        </p>
      </div>
      {(program.unitTypeSummaries || []).length ? (
        <div className={styles.detailList}>
          {program.unitTypeSummaries.map((summary) => {
            const unitType = (building.unitTypes || []).find((entry) => entry.id === summary.unitTypeId);
            return (
              <div key={summary.unitTypeId} className={styles.detailRow}>
                <span>{unitType?.name || summary.unitTypeId}</span>
                <strong>
                  {summary.linkedInstanceCount}/{summary.targetCount ?? '—'} linked
                </strong>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState>No unit types have been defined.</EmptyState>
      )}
      <div className={styles.formSection}>
        <strong>Typical apartment definition</strong>
        <div className={styles.formGrid}>
          <label className={styles.wideField}>
            <span>Type name</span>
            <input
              aria-label="Unit type name"
              value={draft.name}
              onChange={(event) => setField('name', event.target.value)}
            />
          </label>
          <label>
            <span>Unit category</span>
            <select value={draft.category} onChange={(event) => setField('category', event.target.value)}>
              <option value="studio">Studio</option>
              <option value="one_bedroom">One bedroom</option>
              <option value="two_bedroom">Two bedroom</option>
            </select>
          </label>
          <label>
            <span>Planned units</span>
            <input
              type="number"
              min="1"
              step="1"
              value={draft.targetCount}
              onChange={(event) => setField('targetCount', event.target.value)}
            />
          </label>
          <label>
            <span>Minimum area (m²)</span>
            <input
              type="number"
              min="1"
              step="0.5"
              value={draft.minArea}
              onChange={(event) => setField('minArea', event.target.value)}
            />
          </label>
          <label>
            <span>Preferred area (m²)</span>
            <input
              type="number"
              min="1"
              step="0.5"
              value={draft.preferredArea}
              onChange={(event) => setField('preferredArea', event.target.value)}
            />
          </label>
          <label>
            <span>Maximum area (m²)</span>
            <input
              type="number"
              min="1"
              step="0.5"
              value={draft.maxArea}
              onChange={(event) => setField('maxArea', event.target.value)}
            />
          </label>
          <label>
            <span>Parking target</span>
            <input
              type="number"
              min="0"
              step="1"
              value={draft.parkingRequirement}
              onChange={(event) => setField('parkingRequirement', event.target.value)}
            />
          </label>
        </div>
        <div className={styles.requirementChips}>
          {requirements.map((requirement) => (
            <span key={requirement.id}>
              {requirement.minCount}× {requirement.name}
            </span>
          ))}
        </div>
        <button type="button" className={styles.primaryAction} onClick={configure}>
          {primaryType ? 'Update typical unit program' : 'Create typical unit program'}
        </button>
      </div>
      {primaryType && (
        <button type="button" className={styles.secondaryAction} onClick={generateInstances}>
          Generate {target?.count || draft.targetCount} linked units across {(project.floors || []).length} levels
        </button>
      )}
      {primaryType && (building.unitInstances || []).length > 0 && (
        <div className={styles.formSection}>
          <strong>Linked unit geometry</strong>
          <p className={styles.disclaimer}>
            Capture one mapped unit as the type definition, set each target origin, then propagate. Detached units and
            manually mapped targets are never overwritten.
          </p>
          <div className={styles.placementList}>
            {(building.unitInstances || [])
              .filter((instance) => instance.typeId === primaryType.id)
              .map((instance) => (
                <UnitPlacementRow
                  key={instance.id}
                  instance={instance}
                  floorName={
                    (project.floors || []).find((floor) => floor.id === instance.floorId)?.name || instance.floorId
                  }
                  onExecuteCommand={onExecuteCommand}
                />
              ))}
          </div>
          <button type="button" className={styles.secondaryAction} disabled={!sourceInstance} onClick={captureGeometry}>
            {primaryType.geometryTemplate ? 'Recapture type from mapped source' : 'Capture type from mapped source'}
          </button>
          <button
            type="button"
            className={styles.primaryAction}
            disabled={!primaryType.geometryTemplate || propagationTargets.length === 0}
            onClick={propagateGeometry}
          >
            Update {propagationTargets.length} linked unit{propagationTargets.length === 1 ? '' : 's'}
          </button>
        </div>
      )}
      {lastCommand &&
        [
          BUILDING_COMMANDS.CONFIGURE_TYPICAL_UNIT_PROGRAM,
          BUILDING_COMMANDS.GENERATE_UNIT_INSTANCES,
          BUILDING_COMMANDS.ASSIGN_ROOM_TO_UNIT,
          BUILDING_COMMANDS.UNASSIGN_ROOM_FROM_UNIT,
          BUILDING_COMMANDS.CLASSIFY_ROOM,
          BUILDING_COMMANDS.SET_UNIT_INSTANCE_PLACEMENT,
          BUILDING_COMMANDS.CAPTURE_UNIT_TYPE_GEOMETRY,
          BUILDING_COMMANDS.PROPAGATE_UNIT_TYPE_GEOMETRY,
          BUILDING_COMMANDS.CONFIGURE_TEST_FIT_PROFILE,
          BUILDING_COMMANDS.GENERATE_TEST_FIT_OPTIONS,
          BUILDING_COMMANDS.SELECT_TEST_FIT_OPTION,
          BUILDING_COMMANDS.ACCEPT_TEST_FIT_OPTION,
          BUILDING_COMMANDS.CONFIGURE_APARTMENT_DESIGN_PROFILE,
          BUILDING_COMMANDS.DETAIL_ACCEPTED_TEST_FIT,
        ].includes(lastCommand.commandType) && (
          <span className={lastCommand.ok ? styles.commandSuccess : styles.commandError}>
            {lastCommand.ok
              ? 'Apartment program, linked geometry, and checks were updated.'
              : lastCommand.error?.message}
          </span>
        )}
      {(building.unitInstances || []).length > 0 && (
        <div className={styles.formSection}>
          <strong>Room-to-unit mapping</strong>
          {(project.floors || []).map((floor) => {
            const floorInstances = (building.unitInstances || []).filter((instance) => instance.floorId === floor.id);
            return (
              <div key={floor.id} className={styles.mappingFloor}>
                <span className={styles.mappingFloorTitle}>{floor.name}</span>
                {(floor.rooms || []).length ? (
                  floor.rooms.map((room) => (
                    <div key={room.id} className={styles.mappingRow}>
                      <span>{room.name}</span>
                      <select
                        aria-label={`Unit assignment for ${room.name}`}
                        value={room.unitInstanceId ? `${room.unitInstanceId}|${room.spaceType || ''}` : ''}
                        onChange={(event) => assignRoom(floor, room, event.target.value)}
                      >
                        <option value="">Not assigned</option>
                        {floorInstances.flatMap((instance) => {
                          const unitType = (building.unitTypes || []).find((entry) => entry.id === instance.typeId);
                          return (unitType?.spaceRequirements || []).map((requirement) => (
                            <option
                              key={`${instance.id}|${requirement.spaceType}`}
                              value={`${instance.id}|${requirement.spaceType}`}
                            >
                              {instance.name} · {requirement.name}
                            </option>
                          ));
                        })}
                      </select>
                      <select
                        aria-label={`Area classification for ${room.name}`}
                        value={room.useCategory || ''}
                        onChange={(event) => classifyRoom(floor, room, event.target.value)}
                      >
                        <option value="">Unclassified</option>
                        <option value="rentable">Rentable</option>
                        <option value="circulation">Circulation</option>
                        <option value="service">Service</option>
                        <option value="shared">Shared</option>
                        <option value="parking">Parking</option>
                      </select>
                    </div>
                  ))
                ) : (
                  <EmptyState>Draw or detect rooms on this level before mapping the unit program.</EmptyState>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StructureStage({ project, building, issues, loadPath, realization, lastCommand, onExecuteCommand }) {
  const structural = building.systems?.structural || {};
  const primaryGrid = (structural.gridSystems || [])[0] || null;
  const regularSetup = primaryGrid?.setup?.kind === 'regular' ? primaryGrid.setup : null;
  // The grid fields are live once a grid exists, so they read from the grid
  // itself rather than from a seeded draft: a canvas drag or a rotation typed
  // in the properties panel shows up here without this panel being remounted —
  // which it no longer can be, because remounting mid-keystroke would take the
  // focus and the half-typed number with it. Raw keystrokes are held per field
  // until the field is left, so a partial entry survives long enough to finish.
  const gridModel = {
    name: primaryGrid?.name || 'Primary Grid',
    xAxisCount: valueOrBlank(regularSetup?.xAxisCount ?? 3),
    yAxisCount: valueOrBlank(regularSetup?.yAxisCount ?? 3),
    xSpacing: metersDraft(regularSetup?.xSpacing ?? 4000),
    ySpacing: metersDraft(regularSetup?.ySpacing ?? 4000),
    originX: metersDraft(primaryGrid?.origin?.x ?? 0),
    originY: metersDraft(primaryGrid?.origin?.y ?? 0),
    rotation: valueOrBlank(primaryGrid?.rotation ?? 0),
  };
  const [gridDraft, setGridDraft] = useState({});
  const [draft, setDraft] = useState(() => ({
    columnWidth: metersDraft(realization?.profile?.columnWidth ?? 300),
    columnDepth: metersDraft(realization?.profile?.columnDepth ?? 300),
    beamWidth: metersDraft(realization?.profile?.beamWidth ?? 250),
    beamDepth: metersDraft(realization?.profile?.beamDepth ?? 400),
    maxBeamPlanningSpan: metersDraft(structural.coordinationProfile?.maxBeamPlanningSpan ?? 6000),
    maxSlabPlanningSpan: metersDraft(structural.coordinationProfile?.maxSlabPlanningSpan ?? 4500),
    maxCantileverPlanningLength: metersDraft(structural.coordinationProfile?.maxCantileverPlanningLength ?? 1500),
    minOpeningClearanceFromColumn: metersDraft(structural.coordinationProfile?.minOpeningClearanceFromColumn ?? 300),
  }));
  const slabs = (project.floors || []).flatMap((floor) => (floor.slabs || []).map((slab) => ({ floor, slab })));
  const beams = (project.floors || []).flatMap((floor) => (floor.beams || []).map((beam) => ({ floor, beam })));
  const [openingDraft, setOpeningDraft] = useState(() => ({
    slabRef: slabs[0] ? `${slabs[0].floor.id}|${slabs[0].slab.id}` : '',
    x: '0',
    y: '0',
    width: '0.6',
    depth: '0.8',
    purpose: 'services',
  }));
  const setField = (field, value) => setDraft((current) => ({ ...current, [field]: value }));

  const gridField = (field) => gridDraft[field] ?? gridModel[field];
  const gridCommandFrom = (values) => ({
    type: BUILDING_COMMANDS.CONFIGURE_REGULAR_STRUCTURAL_GRID,
    gridId: primaryGrid?.id || `${building.id}_primary_grid`,
    name: String(values.name).trim() || 'Primary Grid',
    xAxisCount: requiredNumber(values.xAxisCount),
    yAxisCount: requiredNumber(values.yAxisCount),
    xSpacing: millimetersFromMeters(values.xSpacing),
    ySpacing: millimetersFromMeters(values.ySpacing),
    origin: {
      x: millimetersFromMeters(values.originX),
      y: millimetersFromMeters(values.originY),
    },
    rotation: requiredNumber(values.rotation),
  });
  // The same completeness test the command applies, asked before dispatching:
  // a half-typed grid must not be sent only to be rejected.
  const isCompleteGrid = (command) =>
    Number.isInteger(command.xAxisCount) &&
    command.xAxisCount >= 2 &&
    Number.isInteger(command.yAxisCount) &&
    command.yAxisCount >= 2 &&
    Number.isFinite(command.xSpacing) &&
    command.xSpacing > 0 &&
    Number.isFinite(command.ySpacing) &&
    command.ySpacing > 0 &&
    Number.isFinite(command.origin.x) &&
    Number.isFinite(command.origin.y) &&
    Number.isFinite(command.rotation);

  const editGridField = (field, value) => {
    setGridDraft((current) => ({ ...current, [field]: value }));
    if (!primaryGrid) return;
    const command = gridCommandFrom({ ...gridModel, ...gridDraft, [field]: value });
    if (isCompleteGrid(command)) onExecuteCommand(command);
  };
  // Leaving a field hands it back to the committed grid. With no grid yet the
  // draft is the only record of what was typed, so it stays until Create runs.
  const releaseGridField = (field) => {
    if (!primaryGrid) return;
    setGridDraft((current) => {
      if (!(field in current)) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };
  const createGrid = () => onExecuteCommand(gridCommandFrom({ ...gridModel, ...gridDraft }));
  const populateStacks = () =>
    onExecuteCommand({
      type: BUILDING_COMMANDS.POPULATE_GRID_COLUMN_STACKS,
      gridId: primaryGrid.id,
      floorIds: (project.floors || []).map((floor) => floor.id),
      columnWidth: millimetersFromMeters(draft.columnWidth),
      columnDepth: millimetersFromMeters(draft.columnDepth),
    });
  const configureCoordination = () =>
    onExecuteCommand({
      type: BUILDING_COMMANDS.CONFIGURE_STRUCTURAL_COORDINATION,
      maxBeamPlanningSpan: millimetersFromMeters(draft.maxBeamPlanningSpan),
      maxSlabPlanningSpan: millimetersFromMeters(draft.maxSlabPlanningSpan),
      maxCantileverPlanningLength: millimetersFromMeters(draft.maxCantileverPlanningLength),
      minOpeningClearanceFromColumn: millimetersFromMeters(draft.minOpeningClearanceFromColumn),
    });
  const configureRealization = () =>
    onExecuteCommand({
      type: BUILDING_COMMANDS.CONFIGURE_STRUCTURAL_REALIZATION_PROFILE,
      columnWidth: millimetersFromMeters(draft.columnWidth),
      columnDepth: millimetersFromMeters(draft.columnDepth),
      beamWidth: millimetersFromMeters(draft.beamWidth),
      beamDepth: millimetersFromMeters(draft.beamDepth),
    });
  const realizeAcceptedBasis = () => onExecuteCommand({ type: BUILDING_COMMANDS.REALIZE_ACCEPTED_STRUCTURAL_BASIS });
  const coordinateSlabs = () =>
    onExecuteCommand({
      type: BUILDING_COMMANDS.COORDINATE_SLAB_SUPPORTS,
      maxPlanningSpan: millimetersFromMeters(draft.maxSlabPlanningSpan),
    });
  const addOpening = () => {
    const [floorId, slabId] = openingDraft.slabRef.split('|');
    const selected = slabs.find((entry) => entry.floor.id === floorId && entry.slab.id === slabId);
    if (!selected) return;
    onExecuteCommand({
      type: BUILDING_COMMANDS.ADD_SLAB_OPENING,
      floorId,
      slabId,
      openingId: `${slabId}_opening_${(selected.slab.openings || []).length + 1}`,
      origin: { x: millimetersFromMeters(openingDraft.x), y: millimetersFromMeters(openingDraft.y) },
      width: millimetersFromMeters(openingDraft.width),
      depth: millimetersFromMeters(openingDraft.depth),
      purpose: openingDraft.purpose,
    });
  };

  return (
    <div className={styles.stageContent}>
      <div className={styles.stageIntro}>
        <strong>Structural coordination</strong>
        <span>Modeled relationships—not structural capacity.</span>
      </div>
      <div className={styles.metricsGrid}>
        <Metric label="Strategy" value={humanize(structural.strategy)} />
        <Metric label="Grids" value={(structural.gridSystems || []).length} />
        <Metric label="Column stacks" value={(structural.columnStacks || []).length} />
        <Metric label="Beams / slabs" value={`${beams.length} / ${slabs.length}`} />
        <Metric label="Load-path links" value={loadPath?.summary?.relationshipCount || 0} note="Conceptual only" />
        <Metric label="Coordination issues" value={issueCount(issues, 'structural_coordination')} />
      </div>
      <div className={styles.formSection}>
        <strong>Accepted-grid structural realization</strong>
        <p className={styles.disclaimer}>
          Convert the accepted test-fit grid into continuous modeled columns, opening-aware supported beams, persisted
          slab supports, and a conceptual relationship-only load path.
        </p>
        <div className={styles.metricsGrid}>
          <Metric
            label="Realization"
            value={realization?.state?.status === 'realized' ? 'Realized' : 'Proposed grid only'}
            note={realization?.outOfDate ? 'Regeneration required' : 'Checked relationship state'}
          />
          <Metric
            label="Continuous stacks"
            value={`${realization?.continuousStackCount || 0}/${realization?.generatedStackCount || 0}`}
          />
          <Metric
            label="Supported beams"
            value={`${realization?.supportedBeamCount || 0}/${realization?.generatedBeamCount || 0}`}
          />
          <Metric
            label="Supported slabs"
            value={`${realization?.coordinatedSlabCount || 0}/${realization?.slabCount || slabs.length}`}
          />
          <Metric
            label="Opening bypasses"
            value={realization?.skippedBeamSegments?.length || 0}
            note="Engineer framing resolution"
          />
          <Metric label="Foundation" value="Not modeled" note="Soil and footing design required" />
        </div>
        <div className={styles.formGrid}>
          <label>
            <span>Modeled column width (m)</span>
            <input
              aria-label="Realized column width"
              type="number"
              min="0.1"
              step="0.05"
              value={draft.columnWidth}
              onChange={(event) => setField('columnWidth', event.target.value)}
            />
          </label>
          <label>
            <span>Modeled column depth (m)</span>
            <input
              aria-label="Realized column depth"
              type="number"
              min="0.1"
              step="0.05"
              value={draft.columnDepth}
              onChange={(event) => setField('columnDepth', event.target.value)}
            />
          </label>
          <label>
            <span>Modeled beam width (m)</span>
            <input
              aria-label="Realized beam width"
              type="number"
              min="0.1"
              step="0.05"
              value={draft.beamWidth}
              onChange={(event) => setField('beamWidth', event.target.value)}
            />
          </label>
          <label>
            <span>Modeled beam depth (m)</span>
            <input
              aria-label="Realized beam depth"
              type="number"
              min="0.1"
              step="0.05"
              value={draft.beamDepth}
              onChange={(event) => setField('beamDepth', event.target.value)}
            />
          </label>
        </div>
        <button type="button" className={styles.secondaryAction} onClick={configureRealization}>
          Save modeled member assumptions
        </button>
        <button
          type="button"
          className={styles.primaryAction}
          disabled={building.apartmentDesign?.status !== 'detailed' || !building.acceptedTestFitId}
          onClick={realizeAcceptedBasis}
        >
          {realization?.state?.status === 'realized'
            ? 'Regenerate coordinated structural basis'
            : 'Realize accepted structural basis'}
        </button>
        <p className={styles.disclaimer}>
          Member dimensions are geometric assumptions. No loads, reactions, capacity, reinforcement, foundations,
          seismic or wind analysis, soil verification, structural safety, or engineer approval is produced.
        </p>
      </div>
      <div className={styles.formSection}>
        <strong>Regular structural grid</strong>
        <div className={styles.formGrid}>
          <label className={styles.wideField}>
            <span>Grid name</span>
            <input
              aria-label="Grid name"
              value={gridField('name')}
              onChange={(event) => editGridField('name', event.target.value)}
              onBlur={() => releaseGridField('name')}
            />
          </label>
          <label>
            <span>Numbered axes</span>
            <input
              aria-label="Numbered axis count"
              type="number"
              min="2"
              step="1"
              value={gridField('xAxisCount')}
              onChange={(event) => editGridField('xAxisCount', event.target.value)}
              onBlur={() => releaseGridField('xAxisCount')}
            />
          </label>
          <label>
            <span>Lettered axes</span>
            <input
              aria-label="Lettered axis count"
              type="number"
              min="2"
              step="1"
              value={gridField('yAxisCount')}
              onChange={(event) => editGridField('yAxisCount', event.target.value)}
              onBlur={() => releaseGridField('yAxisCount')}
            />
          </label>
          <label>
            <span>Numbered spacing (m)</span>
            <input
              aria-label="Numbered axis spacing"
              type="number"
              min="0.1"
              step="0.1"
              value={gridField('xSpacing')}
              onChange={(event) => editGridField('xSpacing', event.target.value)}
              onBlur={() => releaseGridField('xSpacing')}
            />
          </label>
          <label>
            <span>Lettered spacing (m)</span>
            <input
              aria-label="Lettered axis spacing"
              type="number"
              min="0.1"
              step="0.1"
              value={gridField('ySpacing')}
              onChange={(event) => editGridField('ySpacing', event.target.value)}
              onBlur={() => releaseGridField('ySpacing')}
            />
          </label>
          <label>
            <span>Origin X (m)</span>
            <input
              aria-label="Grid origin X"
              type="number"
              step="0.1"
              value={gridField('originX')}
              onChange={(event) => editGridField('originX', event.target.value)}
              onBlur={() => releaseGridField('originX')}
            />
          </label>
          <label>
            <span>Origin Y (m)</span>
            <input
              aria-label="Grid origin Y"
              type="number"
              step="0.1"
              value={gridField('originY')}
              onChange={(event) => editGridField('originY', event.target.value)}
              onBlur={() => releaseGridField('originY')}
            />
          </label>
          <label className={styles.wideField}>
            <span>Rotation (°)</span>
            <input
              aria-label="Grid rotation"
              type="number"
              step="1"
              value={gridField('rotation')}
              onChange={(event) => editGridField('rotation', event.target.value)}
              onBlur={() => releaseGridField('rotation')}
            />
          </label>
        </div>
        {primaryGrid ? (
          <p className={styles.disclaimer}>
            Grid edits apply as you type. Drag or rotate the grid on the plan and these figures follow.
          </p>
        ) : (
          <button type="button" className={styles.primaryAction} onClick={createGrid}>
            Create structural grid
          </button>
        )}
        {lastCommand?.commandType === BUILDING_COMMANDS.CONFIGURE_REGULAR_STRUCTURAL_GRID && (
          <span className={lastCommand.ok ? styles.commandSuccess : styles.commandError}>
            {lastCommand.ok
              ? 'Grid intent updated; linked stacks and alignment checks were refreshed.'
              : lastCommand.error?.message}
          </span>
        )}
      </div>
      {primaryGrid && (
        <div className={styles.formSection}>
          <strong>Column stacks at intersections</strong>
          <div className={styles.formGrid}>
            <label>
              <span>Modeled width (m)</span>
              <input
                aria-label="Modeled column width"
                type="number"
                min="0.1"
                step="0.05"
                value={draft.columnWidth}
                onChange={(event) => setField('columnWidth', event.target.value)}
              />
            </label>
            <label>
              <span>Modeled depth (m)</span>
              <input
                aria-label="Modeled column depth"
                type="number"
                min="0.1"
                step="0.05"
                value={draft.columnDepth}
                onChange={(event) => setField('columnDepth', event.target.value)}
              />
            </label>
          </div>
          <button type="button" className={styles.secondaryAction} onClick={populateStacks}>
            Populate stacks on all {(project.floors || []).length} levels
          </button>
          {lastCommand?.commandType === BUILDING_COMMANDS.POPULATE_GRID_COLUMN_STACKS && (
            <span className={lastCommand.ok ? styles.commandSuccess : styles.commandError}>
              {lastCommand.ok
                ? 'Column geometry and vertical stack relationships were synchronized.'
                : lastCommand.error?.message}
            </span>
          )}
          <p className={styles.disclaimer}>Section dimensions are modeled assumptions, not capacity calculations.</p>
        </div>
      )}
      <div className={styles.formSection}>
        <strong>Early structural coordination assumptions</strong>
        <div className={styles.formGrid}>
          <label>
            <span>Maximum beam span (m)</span>
            <input
              type="number"
              min="0.1"
              step="0.1"
              value={draft.maxBeamPlanningSpan}
              onChange={(event) => setField('maxBeamPlanningSpan', event.target.value)}
            />
          </label>
          <label>
            <span>Maximum slab span (m)</span>
            <input
              type="number"
              min="0.1"
              step="0.1"
              value={draft.maxSlabPlanningSpan}
              onChange={(event) => setField('maxSlabPlanningSpan', event.target.value)}
            />
          </label>
          <label>
            <span>Maximum cantilever (m)</span>
            <input
              type="number"
              min="0.1"
              step="0.1"
              value={draft.maxCantileverPlanningLength}
              onChange={(event) => setField('maxCantileverPlanningLength', event.target.value)}
            />
          </label>
          <label>
            <span>Opening-column clearance (m)</span>
            <input
              type="number"
              min="0.05"
              step="0.05"
              value={draft.minOpeningClearanceFromColumn}
              onChange={(event) => setField('minOpeningClearanceFromColumn', event.target.value)}
            />
          </label>
        </div>
        <button type="button" className={styles.primaryAction} onClick={configureCoordination}>
          Apply structural assumptions
        </button>
        <p className={styles.disclaimer}>
          These are screening limits for early coordination, not member sizing or code checks.
        </p>
      </div>
      {beams.length > 0 && (
        <div className={styles.formSection}>
          <strong>Beam intent</strong>
          <div className={styles.structuralIntentList}>
            {beams.map(({ floor, beam }) => (
              <BeamIntentRow
                key={`${floor.id}|${beam.id}`}
                floor={floor}
                beam={beam}
                onExecuteCommand={onExecuteCommand}
              />
            ))}
          </div>
        </div>
      )}
      {slabs.length > 0 && (
        <div className={styles.formSection}>
          <strong>Slab supports and openings</strong>
          <button type="button" className={styles.secondaryAction} onClick={coordinateSlabs}>
            Infer and persist supports for all slab zones
          </button>
          <p className={styles.disclaimer}>
            Inferred beam/wall relationships remain visible and require professional review.
          </p>
          <div className={styles.formGrid}>
            <label className={styles.wideField}>
              <span>Host slab</span>
              <select
                value={openingDraft.slabRef}
                onChange={(event) => setOpeningDraft((current) => ({ ...current, slabRef: event.target.value }))}
              >
                {slabs.map(({ floor, slab }) => (
                  <option key={`${floor.id}|${slab.id}`} value={`${floor.id}|${slab.id}`}>
                    {floor.name} · {slab.name || slab.id}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Opening X (m)</span>
              <input
                type="number"
                step="0.1"
                value={openingDraft.x}
                onChange={(event) => setOpeningDraft((current) => ({ ...current, x: event.target.value }))}
              />
            </label>
            <label>
              <span>Opening Y (m)</span>
              <input
                type="number"
                step="0.1"
                value={openingDraft.y}
                onChange={(event) => setOpeningDraft((current) => ({ ...current, y: event.target.value }))}
              />
            </label>
            <label>
              <span>Width (m)</span>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={openingDraft.width}
                onChange={(event) => setOpeningDraft((current) => ({ ...current, width: event.target.value }))}
              />
            </label>
            <label>
              <span>Depth (m)</span>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={openingDraft.depth}
                onChange={(event) => setOpeningDraft((current) => ({ ...current, depth: event.target.value }))}
              />
            </label>
            <label className={styles.wideField}>
              <span>Purpose</span>
              <select
                value={openingDraft.purpose}
                onChange={(event) => setOpeningDraft((current) => ({ ...current, purpose: event.target.value }))}
              >
                <option value="services">Services</option>
                <option value="plumbing_shaft">Plumbing shaft</option>
                <option value="stair">Stair</option>
                <option value="access">Access</option>
              </select>
            </label>
          </div>
          <button type="button" className={styles.primaryAction} onClick={addOpening}>
            Add coordinated slab opening
          </button>
        </div>
      )}
      {lastCommand &&
        [
          BUILDING_COMMANDS.CONFIGURE_STRUCTURAL_COORDINATION,
          BUILDING_COMMANDS.CONFIGURE_STRUCTURAL_REALIZATION_PROFILE,
          BUILDING_COMMANDS.REALIZE_ACCEPTED_STRUCTURAL_BASIS,
          BUILDING_COMMANDS.COORDINATE_SLAB_SUPPORTS,
          BUILDING_COMMANDS.ADD_SLAB_OPENING,
          BUILDING_COMMANDS.SET_BEAM_COORDINATION_INTENT,
          BUILDING_COMMANDS.CREATE_CANTILEVER_BEAM,
        ].includes(lastCommand.commandType) && (
          <span className={lastCommand.ok ? styles.commandSuccess : styles.commandError}>
            {lastCommand.ok
              ? 'Structural relationships, load paths, and findings were recomputed.'
              : lastCommand.error?.message}
          </span>
        )}
      <p className={styles.disclaimer}>Modeled and checked do not mean engineer-verified or structurally safe.</p>
    </div>
  );
}

function SystemsStage({
  project,
  building,
  wetCore,
  services,
  realization,
  equipment,
  roofDrainage,
  lastCommand,
  onExecuteCommand,
}) {
  const systems = building.systems || {};
  const primaryShaft = (systems.plumbing?.shafts || [])[0] || null;
  const primaryRiser = (systems.electrical?.riserZones || [])[0] || null;
  const primaryPanel = (systems.electrical?.panelZones || [])[0] || null;
  const primaryElectricalPoint = (systems.electrical?.points || [])[0] || null;
  const primaryRoofDrain = (project.roofSystem?.drains || [])[0] || null;
  const primaryDrainage = (systems.plumbing?.drainageRoutes || [])[0] || null;
  const primaryExit = (systems.egress?.exits || [])[0] || null;
  const primaryRoute = (systems.egress?.routes || [])[0] || null;
  const profile = services?.profile || {};
  const defaultFloor = (project.floors || [])[0] || null;
  const [draft, setDraft] = useState(() => ({
    name: primaryShaft?.name || 'Primary wet-service shaft',
    originX: metersDraft(primaryShaft?.origin?.x ?? 0),
    originY: metersDraft(primaryShaft?.origin?.y ?? 0),
    width: metersDraft(primaryShaft?.width ?? 600),
    depth: metersDraft(primaryShaft?.depth ?? 800),
    maxFixtureDistance: metersDraft(primaryShaft?.maxFixtureDistance ?? 3000),
  }));
  const [profileDraft, setProfileDraft] = useState(() => ({
    minimumDrainSlopePercent: valueOrBlank(profile.minimumDrainSlopePercent ?? 1),
    maximumEgressTravelDistance: metersDraft(profile.maximumEgressTravelDistance ?? 30_000),
    routeEndpointTolerance: metersDraft(profile.routeEndpointTolerance ?? 150),
    doorPassageTolerance: metersDraft(profile.doorPassageTolerance ?? 75),
    minimumVerticalOpeningOverlapCm2: valueOrBlank((profile.minimumVerticalOpeningOverlap ?? 10_000) / 100),
  }));
  const [realizationDraft, setRealizationDraft] = useState(() => ({
    electricalRiserWidth: metersDraft(realization?.profile?.electricalRiserWidth ?? 450),
    electricalRiserDepth: metersDraft(realization?.profile?.electricalRiserDepth ?? 450),
    panelWidth: metersDraft(realization?.profile?.panelWidth ?? 800),
    panelDepth: metersDraft(realization?.profile?.panelDepth ?? 300),
    equipmentClearance: metersDraft(realization?.profile?.equipmentClearance ?? 600),
    minimumDrainSlopePercent: valueOrBlank(realization?.profile?.minimumDrainSlopePercent ?? 1),
    electricalPointsPerUnit: valueOrBlank(realization?.profile?.electricalPointsPerUnit ?? 3),
  }));
  const [riserDraft, setRiserDraft] = useState(() => ({
    name: primaryRiser?.name || 'Primary electrical riser',
    originX: metersDraft(primaryRiser?.origin?.x ?? 2000),
    originY: metersDraft(primaryRiser?.origin?.y ?? 1000),
    width: metersDraft(primaryRiser?.width ?? 400),
    depth: metersDraft(primaryRiser?.depth ?? 400),
    openingClearance: metersDraft(primaryRiser?.openingClearance ?? 100),
  }));
  const [drainageDraft, setDrainageDraft] = useState(() => ({
    dischargeX: metersDraft(primaryDrainage?.points?.at(-1)?.x ?? 6000),
    dischargeY: metersDraft(primaryDrainage?.points?.at(-1)?.y ?? 1000),
    startInvert: metersDraft(primaryDrainage?.startInvertElevation ?? -300),
    endInvert: metersDraft(primaryDrainage?.endInvertElevation ?? -400),
    minimumSlopePercent: valueOrBlank(primaryDrainage?.minimumSlopePercent ?? profile.minimumDrainSlopePercent ?? 1),
  }));
  const [egressDraft, setEgressDraft] = useState(() => ({
    floorId: primaryExit?.floorId || defaultFloor?.id || '',
    exitX: metersDraft(primaryExit?.point?.x ?? 0),
    exitY: metersDraft(primaryExit?.point?.y ?? 0),
    roomId: primaryRoute?.fromRoomId || defaultFloor?.rooms?.[0]?.id || '',
    waypointX: '',
    waypointY: '',
    maximumTravelDistance: metersDraft(
      primaryRoute?.maximumTravelDistance ?? profile.maximumEgressTravelDistance ?? 30_000,
    ),
  }));
  const [equipmentProfileDraft, setEquipmentProfileDraft] = useState(() => ({
    maximumElectricalPointDistance: metersDraft(equipment?.profile?.maximumElectricalPointDistance ?? 20_000),
    minimumEquipmentClearance: metersDraft(equipment?.profile?.minimumEquipmentClearance ?? 600),
  }));
  const [equipmentDraft, setEquipmentDraft] = useState(() => ({
    kind: primaryPanel?.kind || 'electrical_panel',
    name: primaryPanel?.name || 'Ground-floor electrical panel',
    floorId: primaryPanel?.floorId || defaultFloor?.id || '',
    location: primaryPanel?.location || 'floor',
    originX: metersDraft(primaryPanel?.origin?.x ?? 1500),
    originY: metersDraft(primaryPanel?.origin?.y ?? 1500),
    width: metersDraft(primaryPanel?.width ?? 600),
    depth: metersDraft(primaryPanel?.depth ?? 600),
    clearance: metersDraft(primaryPanel?.clearance ?? 600),
    capacity: valueOrBlank(primaryPanel?.capacity),
    unitCount: valueOrBlank(primaryPanel?.unitCount),
  }));
  const [electricalPointDraft, setElectricalPointDraft] = useState(() => ({
    kind: primaryElectricalPoint?.kind || 'outlet',
    name: primaryElectricalPoint?.name || 'Typical electrical point',
    floorId: primaryElectricalPoint?.floorId || defaultFloor?.id || '',
    positionX: metersDraft(primaryElectricalPoint?.position?.x ?? 2500),
    positionY: metersDraft(primaryElectricalPoint?.position?.y ?? 2500),
    panelZoneId: primaryElectricalPoint?.panelZoneId || primaryPanel?.id || '',
  }));
  const [roofDrainDraft, setRoofDrainDraft] = useState(() => ({
    name: primaryRoofDrain?.name || 'Primary roof drain',
    positionX: metersDraft(primaryRoofDrain?.position?.x ?? 2000),
    positionY: metersDraft(primaryRoofDrain?.position?.y ?? 2000),
    diameter: metersDraft(primaryRoofDrain?.diameter ?? 100),
    outletKind:
      primaryRoofDrain?.outletRef?.kind ||
      ((systems.plumbing?.shafts || []).length ? 'plumbing_shaft' : 'site_discharge'),
    outletId: primaryRoofDrain?.outletRef?.id || primaryShaft?.id || `${building.id}_roof_discharge`,
    routeEndX: metersDraft(primaryRoofDrain?.routePoints?.at(-1)?.x ?? primaryShaft?.origin?.x ?? 0),
    routeEndY: metersDraft(primaryRoofDrain?.routePoints?.at(-1)?.y ?? primaryShaft?.origin?.y ?? 0),
    minimumFinishSlopePercent: valueOrBlank(roofDrainage?.profile?.minimumFinishSlopePercent ?? 1),
  }));
  const stairEntries = (project.floors || []).flatMap((floor) =>
    (floor.stairs || []).map((stair) => ({ floor, stair })),
  );
  const [selectedStairId, setSelectedStairId] = useState(stairEntries[0]?.stair.id || '');
  const selectedStairEntry = stairEntries.find((entry) => entry.stair.id === selectedStairId) || null;
  const stairTargetFloor = (project.floors || []).find(
    (floor) => floor.id === selectedStairEntry?.stair.floorRelation?.toFloorId,
  );
  const stairOpenings = (stairTargetFloor?.slabs || []).flatMap((slab) =>
    (slab.openings || []).map((opening) => ({ slab, opening })),
  );
  const existingClearanceRef = selectedStairEntry?.stair.coordination?.clearanceOpeningRef;
  const [selectedOpeningId, setSelectedOpeningId] = useState(
    existingClearanceRef?.openingId || stairOpenings[0]?.opening.id || '',
  );
  const [headroomDraft, setHeadroomDraft] = useState(
    metersDraft(selectedStairEntry?.stair.coordination?.minimumHeadroom ?? 2000),
  );
  const setField = (field, value) => setDraft((current) => ({ ...current, [field]: value }));
  const configure = () =>
    onExecuteCommand({
      type: BUILDING_COMMANDS.CONFIGURE_PLUMBING_SHAFT,
      shaftId: primaryShaft?.id || `${building.id}_primary_plumbing_shaft`,
      name: draft.name,
      origin: { x: millimetersFromMeters(draft.originX), y: millimetersFromMeters(draft.originY) },
      width: millimetersFromMeters(draft.width),
      depth: millimetersFromMeters(draft.depth),
      maxFixtureDistance: millimetersFromMeters(draft.maxFixtureDistance),
      servedFloorIds: (project.floors || []).map((floor) => floor.id),
    });
  const assignNearby = () =>
    onExecuteCommand({
      type: BUILDING_COMMANDS.ASSIGN_NEARBY_WET_FIXTURES,
      shaftId: primaryShaft.id,
    });
  const configureProfile = () =>
    onExecuteCommand({
      type: BUILDING_COMMANDS.CONFIGURE_SERVICES_COORDINATION,
      minimumDrainSlopePercent: Number(profileDraft.minimumDrainSlopePercent),
      maximumEgressTravelDistance: millimetersFromMeters(profileDraft.maximumEgressTravelDistance),
      routeEndpointTolerance: millimetersFromMeters(profileDraft.routeEndpointTolerance),
      doorPassageTolerance: millimetersFromMeters(profileDraft.doorPassageTolerance),
      minimumVerticalOpeningOverlap: Number(profileDraft.minimumVerticalOpeningOverlapCm2) * 100,
    });
  const configureRiser = () =>
    onExecuteCommand({
      type: BUILDING_COMMANDS.CONFIGURE_ELECTRICAL_RISER,
      riserId: primaryRiser?.id || `${building.id}_primary_electrical_riser`,
      name: riserDraft.name,
      origin: { x: millimetersFromMeters(riserDraft.originX), y: millimetersFromMeters(riserDraft.originY) },
      width: millimetersFromMeters(riserDraft.width),
      depth: millimetersFromMeters(riserDraft.depth),
      openingClearance: millimetersFromMeters(riserDraft.openingClearance),
      servedFloorIds: (project.floors || []).map((floor) => floor.id),
    });
  const coordinateOpenings = (serviceKind, serviceId) =>
    onExecuteCommand({
      type: BUILDING_COMMANDS.COORDINATE_VERTICAL_SERVICE_OPENINGS,
      serviceKind,
      serviceId,
    });
  const configureDrainage = () =>
    onExecuteCommand({
      type: BUILDING_COMMANDS.CONFIGURE_DRAINAGE_ROUTE,
      routeId: primaryDrainage?.id || `${building.id}_primary_drainage_route`,
      sourceShaftId: primaryShaft.id,
      floorId: defaultFloor.id,
      points: [
        { ...primaryShaft.origin },
        { x: millimetersFromMeters(drainageDraft.dischargeX), y: millimetersFromMeters(drainageDraft.dischargeY) },
      ],
      startInvertElevation: millimetersFromMeters(drainageDraft.startInvert),
      endInvertElevation: millimetersFromMeters(drainageDraft.endInvert),
      minimumSlopePercent: Number(drainageDraft.minimumSlopePercent),
    });
  const egressFloor = (project.floors || []).find((floor) => floor.id === egressDraft.floorId) || defaultFloor;
  const configureExit = () =>
    onExecuteCommand({
      type: BUILDING_COMMANDS.CONFIGURE_EGRESS_EXIT,
      exitId: primaryExit?.id || `${building.id}_primary_egress_exit`,
      name: 'Primary modeled exit',
      floorId: egressFloor.id,
      point: { x: millimetersFromMeters(egressDraft.exitX), y: millimetersFromMeters(egressDraft.exitY) },
    });
  const configureEgressRoute = () => {
    const waypoints =
      egressDraft.waypointX !== '' && egressDraft.waypointY !== ''
        ? [{ x: millimetersFromMeters(egressDraft.waypointX), y: millimetersFromMeters(egressDraft.waypointY) }]
        : [];
    onExecuteCommand({
      type: BUILDING_COMMANDS.CONFIGURE_EGRESS_ROUTE,
      routeId: primaryRoute?.id || `${building.id}_${egressDraft.roomId}_egress_route`,
      floorId: egressFloor.id,
      fromRoomId: egressDraft.roomId,
      exitId: primaryExit.id,
      waypoints,
      maximumTravelDistance: millimetersFromMeters(egressDraft.maximumTravelDistance),
    });
  };
  const linkStairOpening = () => {
    const selection = stairOpenings.find((entry) => entry.opening.id === selectedOpeningId);
    if (!selection || !selectedStairEntry) return;
    onExecuteCommand({
      type: BUILDING_COMMANDS.LINK_STAIR_CLEARANCE_OPENING,
      floorId: selectedStairEntry.floor.id,
      stairId: selectedStairEntry.stair.id,
      openingFloorId: stairTargetFloor.id,
      slabId: selection.slab.id,
      openingId: selection.opening.id,
      minimumHeadroom: millimetersFromMeters(headroomDraft),
    });
  };
  const configureEquipmentProfile = () =>
    onExecuteCommand({
      type: BUILDING_COMMANDS.CONFIGURE_EQUIPMENT_COORDINATION,
      maximumElectricalPointDistance: millimetersFromMeters(equipmentProfileDraft.maximumElectricalPointDistance),
      minimumEquipmentClearance: millimetersFromMeters(equipmentProfileDraft.minimumEquipmentClearance),
    });
  const configureEquipmentZone = () =>
    onExecuteCommand({
      type: BUILDING_COMMANDS.CONFIGURE_EQUIPMENT_ZONE,
      zoneId: primaryPanel?.kind === equipmentDraft.kind ? primaryPanel.id : `${building.id}_${equipmentDraft.kind}`,
      name: equipmentDraft.name,
      kind: equipmentDraft.kind,
      floorId: equipmentDraft.location === 'floor' ? equipmentDraft.floorId : null,
      location: equipmentDraft.location,
      origin: { x: millimetersFromMeters(equipmentDraft.originX), y: millimetersFromMeters(equipmentDraft.originY) },
      width: millimetersFromMeters(equipmentDraft.width),
      depth: millimetersFromMeters(equipmentDraft.depth),
      clearance: millimetersFromMeters(equipmentDraft.clearance),
      capacity: optionalNumber(equipmentDraft.capacity),
      unitCount: equipmentDraft.unitCount === '' ? null : Number(equipmentDraft.unitCount),
      servedFloorIds: (project.floors || []).map((floor) => floor.id),
    });
  const configureElectricalPoint = () =>
    onExecuteCommand({
      type: BUILDING_COMMANDS.CONFIGURE_ELECTRICAL_POINT,
      pointId: primaryElectricalPoint?.id || `${building.id}_electrical_point_1`,
      name: electricalPointDraft.name,
      kind: electricalPointDraft.kind,
      floorId: electricalPointDraft.floorId,
      position: {
        x: millimetersFromMeters(electricalPointDraft.positionX),
        y: millimetersFromMeters(electricalPointDraft.positionY),
      },
      panelZoneId: electricalPointDraft.panelZoneId,
    });
  const configureRoofDrain = () =>
    onExecuteCommand({
      type: BUILDING_COMMANDS.CONFIGURE_ROOF_DRAINAGE_PATH,
      drainId: primaryRoofDrain?.id || `${building.id}_roof_drain_1`,
      name: roofDrainDraft.name,
      position: {
        x: millimetersFromMeters(roofDrainDraft.positionX),
        y: millimetersFromMeters(roofDrainDraft.positionY),
      },
      diameter: millimetersFromMeters(roofDrainDraft.diameter),
      catchmentPlaneIds: (project.roofSystem?.roofPlanes || []).map((plane) => plane.id),
      outletRef:
        roofDrainDraft.outletKind === 'plumbing_shaft'
          ? { kind: 'plumbing_shaft', id: roofDrainDraft.outletId }
          : roofDrainDraft.outletKind === 'downspout'
            ? {
                kind: 'downspout',
                id: roofDrainDraft.outletId,
                position: {
                  x: millimetersFromMeters(roofDrainDraft.routeEndX),
                  y: millimetersFromMeters(roofDrainDraft.routeEndY),
                },
              }
            : {
                kind: 'site_discharge',
                id: roofDrainDraft.outletId,
                point: {
                  x: millimetersFromMeters(roofDrainDraft.routeEndX),
                  y: millimetersFromMeters(roofDrainDraft.routeEndY),
                },
              },
      routePoints: [
        { x: millimetersFromMeters(roofDrainDraft.positionX), y: millimetersFromMeters(roofDrainDraft.positionY) },
        { x: millimetersFromMeters(roofDrainDraft.routeEndX), y: millimetersFromMeters(roofDrainDraft.routeEndY) },
      ],
      profile: { minimumFinishSlopePercent: Number(roofDrainDraft.minimumFinishSlopePercent) },
    });
  const configureRealization = () =>
    onExecuteCommand({
      type: BUILDING_COMMANDS.CONFIGURE_SERVICES_REALIZATION_PROFILE,
      electricalRiserWidth: millimetersFromMeters(realizationDraft.electricalRiserWidth),
      electricalRiserDepth: millimetersFromMeters(realizationDraft.electricalRiserDepth),
      panelWidth: millimetersFromMeters(realizationDraft.panelWidth),
      panelDepth: millimetersFromMeters(realizationDraft.panelDepth),
      equipmentClearance: millimetersFromMeters(realizationDraft.equipmentClearance),
      minimumDrainSlopePercent: Number(realizationDraft.minimumDrainSlopePercent),
      electricalPointsPerUnit: Number(realizationDraft.electricalPointsPerUnit),
    });
  const realizeSystems = () => onExecuteCommand({ type: BUILDING_COMMANDS.REALIZE_ACCEPTED_BUILDING_SYSTEMS });

  return (
    <div className={styles.stageContent}>
      <div className={styles.stageIntro}>
        <strong>Building systems</strong>
        <span>Accepted-model routes, risers, equipment reservations, points, and penetrations.</span>
      </div>
      <div className={styles.formSection}>
        <strong>Lambda · coordinated systems realization</strong>
        <div className={styles.metricsGrid}>
          <Metric
            label="Realization"
            value={realization?.state?.status === 'realized' ? 'Realized' : 'Not realized'}
            note={realization?.outOfDate ? 'Regeneration required' : 'Planning intent only'}
          />
          <Metric label="Drainage branches" value={realization?.actualEntityCounts?.drainageRoutes || 0} />
          <Metric
            label="Electrical riser / openings"
            value={`${realization?.actualEntityCounts?.electricalRisers || 0} / ${realization?.actualEntityCounts?.slabOpenings || 0}`}
          />
          <Metric
            label="Panels / points"
            value={`${realization?.actualEntityCounts?.panelZones || 0} / ${realization?.actualEntityCounts?.electricalPoints || 0}`}
          />
          <Metric
            label="Water / AC zones"
            value={`${realization?.actualEntityCounts?.waterEquipmentZones || 0} / ${realization?.actualEntityCounts?.outdoorUnitZones || 0}`}
          />
          <Metric label="Unresolved" value={realization?.unresolvedItems?.length || 0} note="Professional resolution" />
        </div>
        <div className={styles.formGrid}>
          <label>
            <span>Electrical riser width (m)</span>
            <input
              aria-label="Lambda electrical riser width"
              type="number"
              min="0.1"
              step="0.05"
              value={realizationDraft.electricalRiserWidth}
              onChange={(event) =>
                setRealizationDraft((current) => ({ ...current, electricalRiserWidth: event.target.value }))
              }
            />
          </label>
          <label>
            <span>Electrical riser depth (m)</span>
            <input
              aria-label="Lambda electrical riser depth"
              type="number"
              min="0.1"
              step="0.05"
              value={realizationDraft.electricalRiserDepth}
              onChange={(event) =>
                setRealizationDraft((current) => ({ ...current, electricalRiserDepth: event.target.value }))
              }
            />
          </label>
          <label>
            <span>Panel width (m)</span>
            <input
              aria-label="Lambda panel width"
              type="number"
              min="0.1"
              step="0.05"
              value={realizationDraft.panelWidth}
              onChange={(event) => setRealizationDraft((current) => ({ ...current, panelWidth: event.target.value }))}
            />
          </label>
          <label>
            <span>Panel depth (m)</span>
            <input
              aria-label="Lambda panel depth"
              type="number"
              min="0.1"
              step="0.05"
              value={realizationDraft.panelDepth}
              onChange={(event) => setRealizationDraft((current) => ({ ...current, panelDepth: event.target.value }))}
            />
          </label>
          <label>
            <span>Equipment clearance (m)</span>
            <input
              aria-label="Lambda equipment clearance"
              type="number"
              min="0.1"
              step="0.05"
              value={realizationDraft.equipmentClearance}
              onChange={(event) =>
                setRealizationDraft((current) => ({ ...current, equipmentClearance: event.target.value }))
              }
            />
          </label>
          <label>
            <span>Drain slope intent (%)</span>
            <input
              aria-label="Lambda drain slope"
              type="number"
              min="0.1"
              step="0.1"
              value={realizationDraft.minimumDrainSlopePercent}
              onChange={(event) =>
                setRealizationDraft((current) => ({ ...current, minimumDrainSlopePercent: event.target.value }))
              }
            />
          </label>
          <label>
            <span>Electrical points / unit</span>
            <input
              aria-label="Lambda electrical points per unit"
              type="number"
              min="1"
              step="1"
              value={realizationDraft.electricalPointsPerUnit}
              onChange={(event) =>
                setRealizationDraft((current) => ({ ...current, electricalPointsPerUnit: event.target.value }))
              }
            />
          </label>
        </div>
        <button type="button" className={styles.secondaryAction} onClick={configureRealization}>
          Save realization assumptions
        </button>
        <button type="button" className={styles.primaryAction} onClick={realizeSystems}>
          {realization?.state?.status === 'realized'
            ? 'Regenerate coordinated building systems'
            : 'Realize accepted building systems'}
        </button>
      </div>
      <div className={styles.metricsGrid}>
        <Metric label="Plumbing shafts" value={(systems.plumbing?.shafts || []).length} />
        <Metric label="Wet zones" value={(systems.plumbing?.wetZones || []).length} />
        <Metric label="Electrical risers" value={(systems.electrical?.riserZones || []).length} />
        <Metric label="Ventilation zones" value={(systems.envelope?.ventilationZones || []).length} />
        <Metric label="Wet fixtures" value={wetCore.wetFixtureCount || 0} />
        <Metric label="Assigned" value={`${wetCore.assignedFixtureCount || 0}/${wetCore.wetFixtureCount || 0}`} />
        <Metric label="Drainage routes" value={services?.drainageRouteCount || 0} />
        <Metric
          label="Egress routes"
          value={`${services?.egressRouteCount || 0}/${services?.routedRoomCount || 0} rooms`}
        />
        <Metric
          label="Electrical panels / points"
          value={`${equipment?.panelCount || 0} / ${equipment?.electricalPointCount || 0}`}
        />
        <Metric
          label="Water tank / pump zones"
          value={`${equipment?.waterTankCount || 0} / ${equipment?.waterPumpCount || 0}`}
        />
        <Metric label="AC outdoor zones" value={equipment?.acOutdoorZoneCount || 0} />
        <Metric
          label="Roof drain paths"
          value={roofDrainage?.routedDrainCount || 0}
          note={`${roofDrainage?.drainCount || 0} drains modeled`}
        />
      </div>
      <div className={styles.formSection}>
        <strong>Named coordination assumptions</strong>
        <div className={styles.formGrid}>
          <label>
            <span>Minimum drain slope (%)</span>
            <input
              aria-label="Minimum drain slope"
              type="number"
              min="0"
              step="0.1"
              value={profileDraft.minimumDrainSlopePercent}
              onChange={(event) =>
                setProfileDraft((current) => ({ ...current, minimumDrainSlopePercent: event.target.value }))
              }
            />
          </label>
          <label>
            <span>Maximum egress route (m)</span>
            <input
              aria-label="Maximum egress route"
              type="number"
              min="0.1"
              step="0.5"
              value={profileDraft.maximumEgressTravelDistance}
              onChange={(event) =>
                setProfileDraft((current) => ({ ...current, maximumEgressTravelDistance: event.target.value }))
              }
            />
          </label>
          <label>
            <span>Exit endpoint tolerance (m)</span>
            <input
              aria-label="Exit endpoint tolerance"
              type="number"
              min="0"
              step="0.01"
              value={profileDraft.routeEndpointTolerance}
              onChange={(event) =>
                setProfileDraft((current) => ({ ...current, routeEndpointTolerance: event.target.value }))
              }
            />
          </label>
          <label>
            <span>Door passage tolerance (m)</span>
            <input
              aria-label="Door passage tolerance"
              type="number"
              min="0"
              step="0.01"
              value={profileDraft.doorPassageTolerance}
              onChange={(event) =>
                setProfileDraft((current) => ({ ...current, doorPassageTolerance: event.target.value }))
              }
            />
          </label>
          <label>
            <span>Opening overlap (cm²)</span>
            <input
              aria-label="Minimum vertical opening overlap"
              type="number"
              min="0"
              step="10"
              value={profileDraft.minimumVerticalOpeningOverlapCm2}
              onChange={(event) =>
                setProfileDraft((current) => ({ ...current, minimumVerticalOpeningOverlapCm2: event.target.value }))
              }
            />
          </label>
        </div>
        <button type="button" className={styles.secondaryAction} onClick={configureProfile}>
          Save services assumptions
        </button>
      </div>
      <div className={styles.formSection}>
        <strong>Vertical wet-service shaft</strong>
        <div className={styles.formGrid}>
          <label className={styles.wideField}>
            <span>Shaft name</span>
            <input
              aria-label="Shaft name"
              value={draft.name}
              onChange={(event) => setField('name', event.target.value)}
            />
          </label>
          <label>
            <span>Center X (m)</span>
            <input
              aria-label="Shaft center X"
              type="number"
              step="0.1"
              value={draft.originX}
              onChange={(event) => setField('originX', event.target.value)}
            />
          </label>
          <label>
            <span>Center Y (m)</span>
            <input
              aria-label="Shaft center Y"
              type="number"
              step="0.1"
              value={draft.originY}
              onChange={(event) => setField('originY', event.target.value)}
            />
          </label>
          <label>
            <span>Width (m)</span>
            <input
              aria-label="Shaft width"
              type="number"
              min="0.1"
              step="0.05"
              value={draft.width}
              onChange={(event) => setField('width', event.target.value)}
            />
          </label>
          <label>
            <span>Depth (m)</span>
            <input
              aria-label="Shaft depth"
              type="number"
              min="0.1"
              step="0.05"
              value={draft.depth}
              onChange={(event) => setField('depth', event.target.value)}
            />
          </label>
          <label className={styles.wideField}>
            <span>Fixture planning distance (m)</span>
            <input
              aria-label="Fixture planning distance"
              type="number"
              min="0"
              step="0.1"
              value={draft.maxFixtureDistance}
              onChange={(event) => setField('maxFixtureDistance', event.target.value)}
            />
          </label>
        </div>
        <button type="button" className={styles.primaryAction} onClick={configure}>
          {primaryShaft ? 'Update wet-service shaft' : 'Create wet-service shaft'}
        </button>
        {lastCommand?.commandType === BUILDING_COMMANDS.CONFIGURE_PLUMBING_SHAFT && (
          <span className={lastCommand.ok ? styles.commandSuccess : styles.commandError}>
            {lastCommand.ok ? 'Shaft geometry and vertical continuity were checked.' : lastCommand.error?.message}
          </span>
        )}
      </div>
      {primaryShaft && (
        <button type="button" className={styles.secondaryAction} onClick={assignNearby}>
          Assign nearby unassigned wet fixtures
        </button>
      )}
      {lastCommand?.commandType === BUILDING_COMMANDS.ASSIGN_NEARBY_WET_FIXTURES && (
        <span className={lastCommand.ok ? styles.commandSuccess : styles.commandError}>
          {lastCommand.ok ? 'Eligible wet fixtures were linked and rechecked.' : lastCommand.error?.message}
        </span>
      )}
      {primaryShaft && (project.floors || []).length > 1 && (
        <button
          type="button"
          className={styles.secondaryAction}
          onClick={() => coordinateOpenings('plumbing', primaryShaft.id)}
        >
          Coordinate wet-shaft slab openings
        </button>
      )}
      <div className={styles.formSection}>
        <strong>Electrical riser zone</strong>
        <div className={styles.formGrid}>
          <label className={styles.wideField}>
            <span>Riser name</span>
            <input
              aria-label="Electrical riser name"
              value={riserDraft.name}
              onChange={(event) => setRiserDraft((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
          <label>
            <span>Center X (m)</span>
            <input
              aria-label="Electrical riser center X"
              type="number"
              step="0.1"
              value={riserDraft.originX}
              onChange={(event) => setRiserDraft((current) => ({ ...current, originX: event.target.value }))}
            />
          </label>
          <label>
            <span>Center Y (m)</span>
            <input
              aria-label="Electrical riser center Y"
              type="number"
              step="0.1"
              value={riserDraft.originY}
              onChange={(event) => setRiserDraft((current) => ({ ...current, originY: event.target.value }))}
            />
          </label>
          <label>
            <span>Width (m)</span>
            <input
              aria-label="Electrical riser width"
              type="number"
              min="0.1"
              step="0.05"
              value={riserDraft.width}
              onChange={(event) => setRiserDraft((current) => ({ ...current, width: event.target.value }))}
            />
          </label>
          <label>
            <span>Depth (m)</span>
            <input
              aria-label="Electrical riser depth"
              type="number"
              min="0.1"
              step="0.05"
              value={riserDraft.depth}
              onChange={(event) => setRiserDraft((current) => ({ ...current, depth: event.target.value }))}
            />
          </label>
          <label>
            <span>Opening clearance (m)</span>
            <input
              aria-label="Electrical opening clearance"
              type="number"
              min="0"
              step="0.05"
              value={riserDraft.openingClearance}
              onChange={(event) => setRiserDraft((current) => ({ ...current, openingClearance: event.target.value }))}
            />
          </label>
        </div>
        <button type="button" className={styles.primaryAction} onClick={configureRiser}>
          {primaryRiser ? 'Update electrical riser' : 'Create electrical riser'}
        </button>
        {primaryRiser && (project.floors || []).length > 1 && (
          <button
            type="button"
            className={styles.secondaryAction}
            onClick={() => coordinateOpenings('electrical', primaryRiser.id)}
          >
            Coordinate electrical slab openings
          </button>
        )}
      </div>
      <div className={styles.formSection}>
        <strong>Equipment coordination assumptions</strong>
        <div className={styles.formGrid}>
          <label>
            <span>Maximum point-to-panel distance (m)</span>
            <input
              aria-label="Maximum electrical point distance"
              type="number"
              min="0.1"
              step="0.5"
              value={equipmentProfileDraft.maximumElectricalPointDistance}
              onChange={(event) =>
                setEquipmentProfileDraft((current) => ({
                  ...current,
                  maximumElectricalPointDistance: event.target.value,
                }))
              }
            />
          </label>
          <label>
            <span>Minimum equipment clearance (m)</span>
            <input
              aria-label="Minimum equipment clearance"
              type="number"
              min="0.01"
              step="0.1"
              value={equipmentProfileDraft.minimumEquipmentClearance}
              onChange={(event) =>
                setEquipmentProfileDraft((current) => ({ ...current, minimumEquipmentClearance: event.target.value }))
              }
            />
          </label>
        </div>
        <button type="button" className={styles.secondaryAction} onClick={configureEquipmentProfile}>
          Save equipment assumptions
        </button>
      </div>
      <div className={styles.formSection}>
        <strong>Equipment reservation zone</strong>
        <div className={styles.formGrid}>
          <label className={styles.wideField}>
            <span>Equipment kind</span>
            <select
              aria-label="Equipment kind"
              value={equipmentDraft.kind}
              onChange={(event) => setEquipmentDraft((current) => ({ ...current, kind: event.target.value }))}
            >
              <option value="electrical_panel">Electrical panel</option>
              <option value="water_tank">Water tank</option>
              <option value="water_pump">Water pump</option>
              <option value="ac_outdoor_zone">AC outdoor-unit zone</option>
            </select>
          </label>
          <label className={styles.wideField}>
            <span>Name</span>
            <input
              aria-label="Equipment zone name"
              value={equipmentDraft.name}
              onChange={(event) => setEquipmentDraft((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
          <label>
            <span>Host</span>
            <select
              aria-label="Equipment host location"
              value={equipmentDraft.location}
              onChange={(event) => setEquipmentDraft((current) => ({ ...current, location: event.target.value }))}
            >
              <option value="floor">Floor slab</option>
              <option value="ground">Site / ground</option>
              <option value="roof">Roof</option>
            </select>
          </label>
          <label>
            <span>Level</span>
            <select
              aria-label="Equipment floor"
              value={equipmentDraft.floorId}
              onChange={(event) => setEquipmentDraft((current) => ({ ...current, floorId: event.target.value }))}
            >
              {(project.floors || []).map((floor) => (
                <option key={floor.id} value={floor.id}>
                  {floor.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Center X (m)</span>
            <input
              aria-label="Equipment center X"
              type="number"
              step="0.1"
              value={equipmentDraft.originX}
              onChange={(event) => setEquipmentDraft((current) => ({ ...current, originX: event.target.value }))}
            />
          </label>
          <label>
            <span>Center Y (m)</span>
            <input
              aria-label="Equipment center Y"
              type="number"
              step="0.1"
              value={equipmentDraft.originY}
              onChange={(event) => setEquipmentDraft((current) => ({ ...current, originY: event.target.value }))}
            />
          </label>
          <label>
            <span>Width (m)</span>
            <input
              aria-label="Equipment width"
              type="number"
              min="0.1"
              step="0.1"
              value={equipmentDraft.width}
              onChange={(event) => setEquipmentDraft((current) => ({ ...current, width: event.target.value }))}
            />
          </label>
          <label>
            <span>Depth (m)</span>
            <input
              aria-label="Equipment depth"
              type="number"
              min="0.1"
              step="0.1"
              value={equipmentDraft.depth}
              onChange={(event) => setEquipmentDraft((current) => ({ ...current, depth: event.target.value }))}
            />
          </label>
          <label>
            <span>Clearance (m)</span>
            <input
              aria-label="Equipment clearance"
              type="number"
              min="0"
              step="0.1"
              value={equipmentDraft.clearance}
              onChange={(event) => setEquipmentDraft((current) => ({ ...current, clearance: event.target.value }))}
            />
          </label>
          <label>
            <span>Capacity (optional)</span>
            <input
              aria-label="Equipment capacity"
              type="number"
              min="0"
              step="1"
              value={equipmentDraft.capacity}
              onChange={(event) => setEquipmentDraft((current) => ({ ...current, capacity: event.target.value }))}
            />
          </label>
          <label>
            <span>Unit count (optional)</span>
            <input
              aria-label="Equipment unit count"
              type="number"
              min="0"
              step="1"
              value={equipmentDraft.unitCount}
              onChange={(event) => setEquipmentDraft((current) => ({ ...current, unitCount: event.target.value }))}
            />
          </label>
        </div>
        <button type="button" className={styles.primaryAction} onClick={configureEquipmentZone}>
          Create or update equipment zone
        </button>
      </div>
      {(systems.electrical?.panelZones || []).length > 0 && defaultFloor && (
        <div className={styles.formSection}>
          <strong>Electrical point relationship</strong>
          <div className={styles.formGrid}>
            <label>
              <span>Point kind</span>
              <select
                aria-label="Electrical point kind"
                value={electricalPointDraft.kind}
                onChange={(event) => setElectricalPointDraft((current) => ({ ...current, kind: event.target.value }))}
              >
                <option value="outlet">Outlet</option>
                <option value="light">Light</option>
                <option value="switch">Switch</option>
                <option value="dedicated_outlet">Dedicated outlet</option>
              </select>
            </label>
            <label className={styles.wideField}>
              <span>Name</span>
              <input
                aria-label="Electrical point name"
                value={electricalPointDraft.name}
                onChange={(event) => setElectricalPointDraft((current) => ({ ...current, name: event.target.value }))}
              />
            </label>
            <label>
              <span>Level</span>
              <select
                aria-label="Electrical point floor"
                value={electricalPointDraft.floorId}
                onChange={(event) =>
                  setElectricalPointDraft((current) => ({ ...current, floorId: event.target.value }))
                }
              >
                {(project.floors || []).map((floor) => (
                  <option key={floor.id} value={floor.id}>
                    {floor.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Panel</span>
              <select
                aria-label="Electrical point panel"
                value={electricalPointDraft.panelZoneId}
                onChange={(event) =>
                  setElectricalPointDraft((current) => ({ ...current, panelZoneId: event.target.value }))
                }
              >
                {(systems.electrical?.panelZones || []).map((zone) => (
                  <option key={zone.id} value={zone.id}>
                    {zone.name || zone.id}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>X (m)</span>
              <input
                aria-label="Electrical point X"
                type="number"
                step="0.1"
                value={electricalPointDraft.positionX}
                onChange={(event) =>
                  setElectricalPointDraft((current) => ({ ...current, positionX: event.target.value }))
                }
              />
            </label>
            <label>
              <span>Y (m)</span>
              <input
                aria-label="Electrical point Y"
                type="number"
                step="0.1"
                value={electricalPointDraft.positionY}
                onChange={(event) =>
                  setElectricalPointDraft((current) => ({ ...current, positionY: event.target.value }))
                }
              />
            </label>
          </div>
          <button type="button" className={styles.primaryAction} onClick={configureElectricalPoint}>
            Create or update electrical point
          </button>
        </div>
      )}
      {project.roofSystem && (
        <div className={styles.formSection}>
          <strong>Roof drainage path</strong>
          <div className={styles.formGrid}>
            <label className={styles.wideField}>
              <span>Name</span>
              <input
                aria-label="Roof drain name"
                value={roofDrainDraft.name}
                onChange={(event) => setRoofDrainDraft((current) => ({ ...current, name: event.target.value }))}
              />
            </label>
            <label>
              <span>Drain X (m)</span>
              <input
                aria-label="Roof drain X"
                type="number"
                step="0.1"
                value={roofDrainDraft.positionX}
                onChange={(event) => setRoofDrainDraft((current) => ({ ...current, positionX: event.target.value }))}
              />
            </label>
            <label>
              <span>Drain Y (m)</span>
              <input
                aria-label="Roof drain Y"
                type="number"
                step="0.1"
                value={roofDrainDraft.positionY}
                onChange={(event) => setRoofDrainDraft((current) => ({ ...current, positionY: event.target.value }))}
              />
            </label>
            <label>
              <span>Diameter (m)</span>
              <input
                aria-label="Roof drain diameter"
                type="number"
                min="0.01"
                step="0.01"
                value={roofDrainDraft.diameter}
                onChange={(event) => setRoofDrainDraft((current) => ({ ...current, diameter: event.target.value }))}
              />
            </label>
            <label>
              <span>Outlet</span>
              <select
                aria-label="Roof drain outlet kind"
                value={roofDrainDraft.outletKind}
                onChange={(event) => setRoofDrainDraft((current) => ({ ...current, outletKind: event.target.value }))}
              >
                <option value="plumbing_shaft">Plumbing shaft</option>
                <option value="site_discharge">Site discharge</option>
                <option value="downspout">Downspout</option>
              </select>
            </label>
            <label className={styles.wideField}>
              <span>Outlet ID</span>
              <input
                aria-label="Roof drain outlet ID"
                value={roofDrainDraft.outletId}
                onChange={(event) => setRoofDrainDraft((current) => ({ ...current, outletId: event.target.value }))}
              />
            </label>
            <label>
              <span>Route end X (m)</span>
              <input
                aria-label="Roof drain route end X"
                type="number"
                step="0.1"
                value={roofDrainDraft.routeEndX}
                onChange={(event) => setRoofDrainDraft((current) => ({ ...current, routeEndX: event.target.value }))}
              />
            </label>
            <label>
              <span>Route end Y (m)</span>
              <input
                aria-label="Roof drain route end Y"
                type="number"
                step="0.1"
                value={roofDrainDraft.routeEndY}
                onChange={(event) => setRoofDrainDraft((current) => ({ ...current, routeEndY: event.target.value }))}
              />
            </label>
            <label>
              <span>Minimum finish slope (%)</span>
              <input
                aria-label="Roof minimum finish slope"
                type="number"
                min="0"
                step="0.1"
                value={roofDrainDraft.minimumFinishSlopePercent}
                onChange={(event) =>
                  setRoofDrainDraft((current) => ({ ...current, minimumFinishSlopePercent: event.target.value }))
                }
              />
            </label>
          </div>
          <button type="button" className={styles.primaryAction} onClick={configureRoofDrain}>
            Create or update roof drainage path
          </button>
          <p className={styles.disclaimer}>
            Drain position, slope intent, and outlet route require plumbing and architectural confirmation; no hydraulic
            sizing is performed.
          </p>
        </div>
      )}
      {primaryShaft && defaultFloor && (
        <div className={styles.formSection}>
          <strong>Drainage planning route</strong>
          <div className={styles.formGrid}>
            <label>
              <span>Discharge X (m)</span>
              <input
                aria-label="Drainage discharge X"
                type="number"
                step="0.1"
                value={drainageDraft.dischargeX}
                onChange={(event) => setDrainageDraft((current) => ({ ...current, dischargeX: event.target.value }))}
              />
            </label>
            <label>
              <span>Discharge Y (m)</span>
              <input
                aria-label="Drainage discharge Y"
                type="number"
                step="0.1"
                value={drainageDraft.dischargeY}
                onChange={(event) => setDrainageDraft((current) => ({ ...current, dischargeY: event.target.value }))}
              />
            </label>
            <label>
              <span>Start invert (m)</span>
              <input
                aria-label="Drainage start invert"
                type="number"
                step="0.05"
                value={drainageDraft.startInvert}
                onChange={(event) => setDrainageDraft((current) => ({ ...current, startInvert: event.target.value }))}
              />
            </label>
            <label>
              <span>End invert (m)</span>
              <input
                aria-label="Drainage end invert"
                type="number"
                step="0.05"
                value={drainageDraft.endInvert}
                onChange={(event) => setDrainageDraft((current) => ({ ...current, endInvert: event.target.value }))}
              />
            </label>
            <label>
              <span>Minimum slope (%)</span>
              <input
                aria-label="Drainage route slope"
                type="number"
                min="0"
                step="0.1"
                value={drainageDraft.minimumSlopePercent}
                onChange={(event) =>
                  setDrainageDraft((current) => ({ ...current, minimumSlopePercent: event.target.value }))
                }
              />
            </label>
          </div>
          <button type="button" className={styles.primaryAction} onClick={configureDrainage}>
            {primaryDrainage ? 'Update drainage route' : 'Create drainage route'}
          </button>
        </div>
      )}
      {defaultFloor && (
        <div className={styles.formSection}>
          <strong>Room-to-exit path</strong>
          <div className={styles.formGrid}>
            <label className={styles.wideField}>
              <span>Level</span>
              <select
                aria-label="Egress floor"
                value={egressDraft.floorId}
                onChange={(event) =>
                  setEgressDraft((current) => ({
                    ...current,
                    floorId: event.target.value,
                    roomId: project.floors.find((floor) => floor.id === event.target.value)?.rooms?.[0]?.id || '',
                  }))
                }
              >
                {project.floors.map((floor) => (
                  <option key={floor.id} value={floor.id}>
                    {floor.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Exit X (m)</span>
              <input
                aria-label="Egress exit X"
                type="number"
                step="0.1"
                value={egressDraft.exitX}
                onChange={(event) => setEgressDraft((current) => ({ ...current, exitX: event.target.value }))}
              />
            </label>
            <label>
              <span>Exit Y (m)</span>
              <input
                aria-label="Egress exit Y"
                type="number"
                step="0.1"
                value={egressDraft.exitY}
                onChange={(event) => setEgressDraft((current) => ({ ...current, exitY: event.target.value }))}
              />
            </label>
            <label className={styles.wideField}>
              <span>Starting room</span>
              <select
                aria-label="Egress starting room"
                value={egressDraft.roomId}
                onChange={(event) => setEgressDraft((current) => ({ ...current, roomId: event.target.value }))}
              >
                <option value="">Select room</option>
                {(egressFloor?.rooms || []).map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name || room.id}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Waypoint X (m, optional)</span>
              <input
                aria-label="Egress waypoint X"
                type="number"
                step="0.1"
                value={egressDraft.waypointX}
                onChange={(event) => setEgressDraft((current) => ({ ...current, waypointX: event.target.value }))}
              />
            </label>
            <label>
              <span>Waypoint Y (m, optional)</span>
              <input
                aria-label="Egress waypoint Y"
                type="number"
                step="0.1"
                value={egressDraft.waypointY}
                onChange={(event) => setEgressDraft((current) => ({ ...current, waypointY: event.target.value }))}
              />
            </label>
            <label>
              <span>Planning distance (m)</span>
              <input
                aria-label="Egress planning distance"
                type="number"
                min="0.1"
                step="0.5"
                value={egressDraft.maximumTravelDistance}
                onChange={(event) =>
                  setEgressDraft((current) => ({ ...current, maximumTravelDistance: event.target.value }))
                }
              />
            </label>
          </div>
          <button type="button" className={styles.secondaryAction} onClick={configureExit}>
            {primaryExit ? 'Update modeled exit' : 'Create modeled exit'}
          </button>
          {primaryExit && egressDraft.roomId && (
            <button type="button" className={styles.primaryAction} onClick={configureEgressRoute}>
              {primaryRoute ? 'Update room-to-exit route' : 'Create room-to-exit route'}
            </button>
          )}
        </div>
      )}
      {stairEntries.length > 0 && (
        <div className={styles.formSection}>
          <strong>Stair headroom opening relationship</strong>
          <div className={styles.formGrid}>
            <label className={styles.wideField}>
              <span>Stair</span>
              <select
                aria-label="Headroom stair"
                value={selectedStairId}
                onChange={(event) => setSelectedStairId(event.target.value)}
              >
                {stairEntries.map(({ floor, stair }) => (
                  <option key={stair.id} value={stair.id}>
                    {floor.name} · {stair.name || stair.id}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.wideField}>
              <span>Destination slab opening</span>
              <select
                aria-label="Headroom slab opening"
                value={selectedOpeningId}
                onChange={(event) => setSelectedOpeningId(event.target.value)}
              >
                <option value="">Select opening</option>
                {stairOpenings.map(({ slab, opening }) => (
                  <option key={opening.id} value={opening.id}>
                    {slab.name || slab.id} · {opening.name || opening.id}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Minimum headroom (m)</span>
              <input
                aria-label="Minimum stair headroom"
                type="number"
                min="0.1"
                step="0.05"
                value={headroomDraft}
                onChange={(event) => setHeadroomDraft(event.target.value)}
              />
            </label>
          </div>
          <button
            type="button"
            className={styles.primaryAction}
            disabled={!selectedOpeningId}
            onClick={linkStairOpening}
          >
            Link and check headroom opening
          </button>
        </div>
      )}
      {lastCommand &&
        [
          BUILDING_COMMANDS.CONFIGURE_SERVICES_REALIZATION_PROFILE,
          BUILDING_COMMANDS.REALIZE_ACCEPTED_BUILDING_SYSTEMS,
          BUILDING_COMMANDS.CONFIGURE_SERVICES_COORDINATION,
          BUILDING_COMMANDS.CONFIGURE_ELECTRICAL_RISER,
          BUILDING_COMMANDS.CONFIGURE_EQUIPMENT_COORDINATION,
          BUILDING_COMMANDS.CONFIGURE_EQUIPMENT_ZONE,
          BUILDING_COMMANDS.CONFIGURE_ELECTRICAL_POINT,
          BUILDING_COMMANDS.CONFIGURE_ROOF_DRAINAGE_PATH,
          BUILDING_COMMANDS.CONFIGURE_DRAINAGE_ROUTE,
          BUILDING_COMMANDS.CONFIGURE_EGRESS_EXIT,
          BUILDING_COMMANDS.CONFIGURE_EGRESS_ROUTE,
          BUILDING_COMMANDS.COORDINATE_VERTICAL_SERVICE_OPENINGS,
          BUILDING_COMMANDS.LINK_STAIR_CLEARANCE_OPENING,
        ].includes(lastCommand.commandType) && (
          <span className={lastCommand.ok ? styles.commandSuccess : styles.commandError}>
            {lastCommand.ok
              ? 'Services relationships saved and deterministic checks recomputed.'
              : lastCommand.error?.message}
          </span>
        )}
      <p className={styles.disclaimer}>
        Planning routes, slopes, openings, and travel distances are coordination checks, not hydraulic design,
        electrical design, fire-code approval, or permit design.
      </p>
    </div>
  );
}

function ValidateStage({ issues, spatial, services }) {
  const errors = issues.filter((issue) => issue.severity === 'error').length;
  const warnings = issues.filter((issue) => issue.severity === 'warning').length;
  return (
    <div className={styles.stageContent}>
      <div className={styles.stageIntro}>
        <strong>Coordination report</strong>
        <span>Deterministic checks with traceable assumptions.</span>
      </div>
      <div className={styles.metricsGrid}>
        <Metric label="Errors" value={errors} />
        <Metric label="Warnings" value={warnings} />
        <Metric label="Structural" value={issueCount(issues, 'structural_coordination')} />
        <Metric label="Spatial" value={issueCount(issues, 'spatial_coordination')} />
        <Metric label="Environmental" value={issueCount(issues, 'environmental_coordination')} />
        <Metric label="Vertical / stairs" value={issueCount(issues, 'vertical_coordination')} />
        <Metric label="Building systems" value={issueCount(issues, 'building_systems')} />
        <Metric label="Egress" value={issueCount(issues, 'egress_coordination')} />
        <Metric label="Rooms with egress routes" value={services?.routedRoomCount || 0} note="Explicit modeled paths" />
        <Metric
          label="Natural ventilation"
          value={`${spatial?.naturallyVentilatedRoomCount || 0}/${spatial?.ventilationRequiredRoomCount || 0} rooms`}
          note="Modeled exterior-window routes"
        />
        <Metric
          label="Cross ventilation"
          value={`${spatial?.crossVentilatedRoomCount || 0}/${spatial?.crossVentilationCandidateCount || 0} candidates`}
          note="Geometric potential only"
        />
      </div>
      {issues.length ? (
        <div className={styles.issueList}>
          {issues.slice(0, 5).map((issue) => (
            <div key={issue.id} className={styles.issueCard} data-severity={issue.severity}>
              <span className={styles.issueRule}>{issue.ruleId}</span>
              <span>{issue.message}</span>
              <small>Checked · professional confirmation required</small>
            </div>
          ))}
          {issues.length > 5 && <span className={styles.moreIssues}>+ {issues.length - 5} more findings</span>}
        </div>
      ) : (
        <EmptyState>No current coordination findings. Professional verification is still required.</EmptyState>
      )}
      <p className={styles.disclaimer}>
        Corridor and ventilation results use the named Alpha assumption profile; they are not Philippine code or permit
        determinations.
      </p>
    </div>
  );
}

function QuantitiesStage({
  brief,
  ledger,
  takeoff,
  economics,
  comparison,
  realization,
  lastCommand,
  onExecuteCommand,
}) {
  const profile = takeoff?.profile || {};
  const activeScenario =
    (profile.scenarios || []).find((entry) => entry.id === profile.activeScenarioId) ||
    (profile.scenarios || [])[0] ||
    null;
  const activePriceProfile =
    (profile.priceProfiles || []).find((entry) => entry.id === activeScenario?.priceProfileId) ||
    (profile.priceProfiles || [])[0] ||
    null;
  const [draft, setDraft] = useState(() => ({
    reinforcementAllowanceKgPerM3: valueOrBlank(profile.reinforcementAllowanceKgPerM3),
    excavationDepth: metersDraft(profile.excavationDepth),
    unitRates: Object.fromEntries(QUANTITY_RATE_FIELDS.map(([key]) => [key, valueOrBlank(profile.unitRates?.[key])])),
  }));
  const buildRateDraft = (priceProfile) =>
    Object.fromEntries(
      QUANTITY_RATE_FIELDS.map(([key]) => [
        key,
        {
          material: valueOrBlank(priceProfile?.rates?.[key]?.material),
          labor: valueOrBlank(priceProfile?.rates?.[key]?.labor),
          equipment: valueOrBlank(priceProfile?.rates?.[key]?.equipment),
        },
      ]),
    );
  const [selectedPriceProfileId, setSelectedPriceProfileId] = useState(
    activePriceProfile?.id || `ph_price_profile_${(profile.priceProfiles || []).length + 1}`,
  );
  const [priceDraft, setPriceDraft] = useState(() => ({
    name: activePriceProfile?.name || 'Philippine owner pricing basis',
    region: activePriceProfile?.region || '',
    locality: activePriceProfile?.locality || '',
    sourceLabel: activePriceProfile?.sourceLabel || '',
    sourceDate: activePriceProfile?.sourceDate || '',
    rates: buildRateDraft(activePriceProfile),
  }));
  const [assemblyDraft, setAssemblyDraft] = useState(() =>
    Object.fromEntries(
      QUANTITY_RATE_FIELDS.map(([rateKey, label]) => {
        const assembly = (profile.assemblies || []).find((entry) => entry.rateKey === rateKey);
        return [
          rateKey,
          {
            id: assembly?.id || `assembly_${rateKey}`,
            name: assembly?.name || label,
            wastePercent: valueOrBlank(assembly?.wastePercent ?? 0),
            materialFactor: valueOrBlank(assembly?.materialFactor ?? 1),
            laborFactor: valueOrBlank(assembly?.laborFactor ?? 1),
            equipmentFactor: valueOrBlank(assembly?.equipmentFactor ?? 1),
          },
        ];
      }),
    ),
  );
  const [selectedScenarioId, setSelectedScenarioId] = useState(
    activeScenario?.id || `feasibility_scenario_${(profile.scenarios || []).length + 1}`,
  );
  const [scenarioDraft, setScenarioDraft] = useState(() => ({
    name: activeScenario?.name || 'Base feasibility',
    priceProfileId: activeScenario?.priceProfileId || activePriceProfile?.id || '',
    contingencyPercent: valueOrBlank(activeScenario?.contingencyPercent ?? 10),
    professionalFeesPercent: valueOrBlank(activeScenario?.professionalFeesPercent ?? 5),
    permitAllowance: valueOrBlank(activeScenario?.permitAllowance ?? 0),
    otherAllowance: valueOrBlank(activeScenario?.otherAllowance ?? 0),
    monthlyGrossRent: valueOrBlank(activeScenario?.monthlyGrossRent ?? brief.targetRentalIncome),
    vacancyPercent: valueOrBlank(activeScenario?.vacancyPercent ?? 5),
    operatingExpensePercent: valueOrBlank(activeScenario?.operatingExpensePercent ?? 20),
  }));
  const total = economics?.scenario ? economics.totalProjectCost : takeoff?.totalEstimatedCost || 0;
  const budgetVariance = economics?.scenario
    ? economics.budgetVariance
    : brief.targetBudget == null
      ? null
      : brief.targetBudget - total;
  const realizedState = realization?.state || {};

  const submit = (event) => {
    event.preventDefault();
    onExecuteCommand({
      type: BUILDING_COMMANDS.CONFIGURE_QUANTITY_PROFILE,
      currency: brief.currency || 'PHP',
      reinforcementAllowanceKgPerM3: optionalNumber(draft.reinforcementAllowanceKgPerM3),
      excavationDepth: draft.excavationDepth === '' ? null : millimetersFromMeters(draft.excavationDepth),
      unitRates: Object.fromEntries(QUANTITY_RATE_FIELDS.map(([key]) => [key, optionalNumber(draft.unitRates[key])])),
    });
  };
  const choosePriceProfile = (profileId) => {
    const selected = (profile.priceProfiles || []).find((entry) => entry.id === profileId);
    setSelectedPriceProfileId(profileId);
    setPriceDraft({
      name: selected?.name || '',
      region: selected?.region || '',
      locality: selected?.locality || '',
      sourceLabel: selected?.sourceLabel || '',
      sourceDate: selected?.sourceDate || '',
      rates: buildRateDraft(selected),
    });
  };
  const newPriceProfile = () => {
    const nextId = `ph_price_profile_${(profile.priceProfiles || []).length + 1}`;
    setSelectedPriceProfileId(nextId);
    setPriceDraft({
      name: 'Alternative Philippine pricing basis',
      region: '',
      locality: '',
      sourceLabel: '',
      sourceDate: '',
      rates: buildRateDraft(null),
    });
  };
  const savePriceProfile = () =>
    onExecuteCommand({
      type: BUILDING_COMMANDS.CONFIGURE_PRICE_PROFILE,
      profileId: selectedPriceProfileId,
      name: priceDraft.name,
      region: priceDraft.region,
      locality: priceDraft.locality,
      sourceLabel: priceDraft.sourceLabel,
      sourceDate: priceDraft.sourceDate,
      currency: 'PHP',
      rates: Object.fromEntries(
        QUANTITY_RATE_FIELDS.map(([key]) => [
          key,
          {
            material: optionalNumber(priceDraft.rates[key].material),
            labor: optionalNumber(priceDraft.rates[key].labor),
            equipment: optionalNumber(priceDraft.rates[key].equipment),
          },
        ]),
      ),
    });
  const saveAssemblies = () =>
    onExecuteCommand({
      type: BUILDING_COMMANDS.CONFIGURE_ASSEMBLY_CATALOG,
      assemblies: QUANTITY_RATE_FIELDS.map(([rateKey, label]) => ({
        id: assemblyDraft[rateKey].id,
        name: assemblyDraft[rateKey].name || label,
        rateKey,
        wastePercent: Number(assemblyDraft[rateKey].wastePercent),
        materialFactor: Number(assemblyDraft[rateKey].materialFactor),
        laborFactor: Number(assemblyDraft[rateKey].laborFactor),
        equipmentFactor: Number(assemblyDraft[rateKey].equipmentFactor),
      })),
    });
  const chooseScenario = (scenarioId) => {
    const selected = (profile.scenarios || []).find((entry) => entry.id === scenarioId);
    setSelectedScenarioId(scenarioId);
    setScenarioDraft({
      name: selected?.name || '',
      priceProfileId: selected?.priceProfileId || activePriceProfile?.id || '',
      contingencyPercent: valueOrBlank(selected?.contingencyPercent ?? 10),
      professionalFeesPercent: valueOrBlank(selected?.professionalFeesPercent ?? 5),
      permitAllowance: valueOrBlank(selected?.permitAllowance ?? 0),
      otherAllowance: valueOrBlank(selected?.otherAllowance ?? 0),
      monthlyGrossRent: valueOrBlank(selected?.monthlyGrossRent ?? brief.targetRentalIncome),
      vacancyPercent: valueOrBlank(selected?.vacancyPercent ?? 5),
      operatingExpensePercent: valueOrBlank(selected?.operatingExpensePercent ?? 20),
    });
  };
  const newScenario = () => {
    const nextId = `feasibility_scenario_${(profile.scenarios || []).length + 1}`;
    setSelectedScenarioId(nextId);
    setScenarioDraft({
      name: 'Alternative feasibility',
      priceProfileId: (profile.priceProfiles || [])[0]?.id || '',
      contingencyPercent: '10',
      professionalFeesPercent: '5',
      permitAllowance: '0',
      otherAllowance: '0',
      monthlyGrossRent: valueOrBlank(brief.targetRentalIncome),
      vacancyPercent: '5',
      operatingExpensePercent: '20',
    });
  };
  const saveScenario = () =>
    onExecuteCommand({
      type: BUILDING_COMMANDS.CONFIGURE_FEASIBILITY_SCENARIO,
      scenarioId: selectedScenarioId,
      name: scenarioDraft.name,
      priceProfileId: scenarioDraft.priceProfileId,
      contingencyPercent: Number(scenarioDraft.contingencyPercent),
      professionalFeesPercent: Number(scenarioDraft.professionalFeesPercent),
      permitAllowance: Number(scenarioDraft.permitAllowance),
      otherAllowance: Number(scenarioDraft.otherAllowance),
      monthlyGrossRent: optionalNumber(scenarioDraft.monthlyGrossRent),
      vacancyPercent: Number(scenarioDraft.vacancyPercent),
      operatingExpensePercent: Number(scenarioDraft.operatingExpensePercent),
      setActive: true,
    });

  return (
    <div className={styles.stageContent}>
      <div className={styles.stageIntro}>
        <strong>Feasibility quantities</strong>
        <span>Live quantities with explicit derivation and user-supplied PHP rates.</span>
      </div>
      <div className={styles.metricsGrid}>
        <Metric label="Gross floor area" value={formatArea(ledger.grossFloorArea)} />
        <Metric label="Rentable area" value={formatArea(ledger.netRentableArea)} />
        <Metric
          label={
            economics?.scenario && !economics?.pricingComplete
              ? 'Partial direct cost'
              : takeoff?.unpricedItemCount
                ? 'Partial estimate'
                : 'Estimated project cost'
          }
          value={
            total == null
              ? 'Pricing incomplete'
              : formatMoney(total, economics?.currency || takeoff?.currency || brief.currency)
          }
          note={`${takeoff?.pricedItemCount || 0}/${takeoff?.items?.length || 0} takeoff rows priced`}
        />
        <Metric
          label="Cost / gross m²"
          value={
            economics?.costPerGrossFloorAreaM2 == null
              ? 'Complete pricing needed'
              : formatMoney(economics.costPerGrossFloorAreaM2, economics.currency)
          }
        />
        <Metric
          label="Annual NOI"
          value={
            economics?.annualNetOperatingIncome == null
              ? 'Rent assumptions needed'
              : formatMoney(economics.annualNetOperatingIncome, economics.currency)
          }
        />
        <Metric
          label="Net yield"
          value={
            economics?.netYieldPercent == null ? 'Complete pricing needed' : `${economics.netYieldPercent.toFixed(2)}%`
          }
        />
        <Metric
          label="Simple payback"
          value={
            economics?.simplePaybackYears == null
              ? 'Complete pricing needed'
              : `${economics.simplePaybackYears.toFixed(1)} years`
          }
        />
        <Metric
          label="Budget balance"
          value={budgetVariance == null ? 'Budget not set' : formatMoney(budgetVariance, brief.currency)}
          note={budgetVariance == null ? null : budgetVariance >= 0 ? 'Below current budget' : 'Above current budget'}
        />
      </div>
      <div className={styles.formSection}>
        <strong>Mu · coordinated quantity and cost realization</strong>
        <span>
          {realizedState.status === 'realized'
            ? realization.outOfDate
              ? 'The accepted baseline is outdated because its coordinated inputs changed.'
              : `Current accepted baseline: ${realizedState.baselineScenarioId}`
            : 'Accept a signature-bound baseline after Lambda services, complete pricing, and explicit assemblies are current.'}
        </span>
        <div className={styles.metricsGrid}>
          <Metric
            label="Baseline status"
            value={
              realizedState.status === 'realized' ? (realization.outOfDate ? 'Outdated' : 'Current') : 'Not realized'
            }
          />
          <Metric label="Accepted line items" value={realization?.lineItemCount || 0} />
          <Metric label="Scenario snapshots" value={realization?.scenarioCount || 0} />
          <Metric label="VE candidates" value={realization?.opportunityCount || 0} />
          <Metric
            label="Assembly coverage"
            value={`${realization?.assemblyCoverage?.explicitRateKeys?.length || 0}/${realization?.assemblyCoverage?.requiredRateKeys?.length || 0}`}
            note={
              (realization?.assemblyCoverage?.missingRateKeys || []).length
                ? `Missing: ${realization.assemblyCoverage.missingRateKeys.join(', ')}`
                : 'All non-zero categories explicit'
            }
          />
          <Metric
            label="Accepted project cost"
            value={
              realizedState.realizedMetrics?.totalProjectCost == null
                ? 'Not accepted'
                : formatMoney(realizedState.realizedMetrics.totalProjectCost, realizedState.currency)
            }
          />
        </div>
        <button
          type="button"
          className={styles.primaryAction}
          onClick={() => onExecuteCommand({ type: BUILDING_COMMANDS.REALIZE_QUANTITY_COST_BASELINE })}
        >
          {realizedState.status === 'realized'
            ? 'Regenerate accepted cost baseline'
            : 'Accept coordinated cost baseline'}
        </button>
        {(realizedState.valueEngineeringOpportunities || []).slice(0, 5).map((entry) => (
          <div key={entry.id} className={styles.issueCard}>
            <span className={styles.issueRule}>{entry.label}</span>
            <span>
              {formatMoney(entry.savings, realizedState.currency)} potential saving · {entry.alternativeScenarioId}
            </span>
            <small>{entry.status} · substitution is not accepted · professional review required</small>
            <button
              type="button"
              className={styles.secondaryAction}
              onClick={() =>
                onExecuteCommand({
                  type: BUILDING_COMMANDS.SET_VALUE_ENGINEERING_OPPORTUNITY_STATUS,
                  opportunityId: entry.id,
                  status: 'shortlisted_for_professional_review',
                })
              }
            >
              Shortlist
            </button>
            <button
              type="button"
              className={styles.secondaryAction}
              onClick={() =>
                onExecuteCommand({
                  type: BUILDING_COMMANDS.SET_VALUE_ENGINEERING_OPPORTUNITY_STATUS,
                  opportunityId: entry.id,
                  status: 'rejected',
                })
              }
            >
              Reject
            </button>
          </div>
        ))}
        {[
          BUILDING_COMMANDS.REALIZE_QUANTITY_COST_BASELINE,
          BUILDING_COMMANDS.SET_VALUE_ENGINEERING_OPPORTUNITY_STATUS,
        ].includes(lastCommand?.commandType) && (
          <span className={lastCommand.ok ? styles.commandSuccess : styles.commandError}>
            {lastCommand.ok ? 'Mu cost decision recorded against the coordinated model.' : lastCommand.error?.message}
          </span>
        )}
      </div>
      {takeoff?.items?.length ? (
        <div className={styles.quantityList}>
          {takeoff.items.map((entry) => (
            <div key={entry.id} className={styles.quantityRow}>
              <span>
                <strong>{entry.label}</strong>
                <small>{provenanceLabel(entry.provenance)}</small>
              </span>
              <span className={styles.quantityValue}>
                {entry.quantity.toLocaleString(undefined, { maximumFractionDigits: 2 })} {entry.unit}
              </span>
              <span className={styles.quantityCost}>
                {entry.estimatedCost == null ? 'Rate needed' : formatMoney(entry.estimatedCost, takeoff.currency)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState>
          Add modeled walls, slabs, structural members, openings, or fixtures to generate quantities.
        </EmptyState>
      )}
      <div className={styles.formSection}>
        <strong>Philippine source-dated price profile</strong>
        <div className={styles.formGrid}>
          <label className={styles.wideField}>
            <span>Existing profile</span>
            <select
              aria-label="Price profile"
              value={
                (profile.priceProfiles || []).some((entry) => entry.id === selectedPriceProfileId)
                  ? selectedPriceProfileId
                  : ''
              }
              onChange={(event) => choosePriceProfile(event.target.value)}
            >
              <option value="">New unsaved profile</option>
              {(profile.priceProfiles || []).map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.wideField}>
            <span>Stable profile ID</span>
            <input
              aria-label="Price profile ID"
              value={selectedPriceProfileId}
              onChange={(event) => setSelectedPriceProfileId(event.target.value)}
            />
          </label>
          <label className={styles.wideField}>
            <span>Profile name</span>
            <input
              aria-label="Price profile name"
              value={priceDraft.name}
              onChange={(event) => setPriceDraft((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
          <label>
            <span>Region</span>
            <input
              aria-label="Price region"
              value={priceDraft.region}
              onChange={(event) => setPriceDraft((current) => ({ ...current, region: event.target.value }))}
              placeholder="e.g. NCR, Region IV-A"
            />
          </label>
          <label>
            <span>Locality</span>
            <input
              aria-label="Price locality"
              value={priceDraft.locality}
              onChange={(event) => setPriceDraft((current) => ({ ...current, locality: event.target.value }))}
            />
          </label>
          <label>
            <span>Source</span>
            <input
              aria-label="Price source"
              value={priceDraft.sourceLabel}
              onChange={(event) => setPriceDraft((current) => ({ ...current, sourceLabel: event.target.value }))}
              placeholder="Supplier canvass / estimator"
            />
          </label>
          <label>
            <span>Source date</span>
            <input
              aria-label="Price source date"
              type="date"
              value={priceDraft.sourceDate}
              onChange={(event) => setPriceDraft((current) => ({ ...current, sourceDate: event.target.value }))}
            />
          </label>
        </div>
        <div className={styles.detailList}>
          {QUANTITY_RATE_FIELDS.map(([key, label]) => (
            <div key={key} className={styles.formSection}>
              <strong>{label} · per takeoff unit</strong>
              <div className={styles.formGrid}>
                {['material', 'labor', 'equipment'].map((component) => (
                  <label key={component}>
                    <span>{humanize(component)} (PHP)</span>
                    <input
                      aria-label={`${label} ${component} rate`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={priceDraft.rates[key][component]}
                      onChange={(event) =>
                        setPriceDraft((current) => ({
                          ...current,
                          rates: {
                            ...current.rates,
                            [key]: { ...current.rates[key], [component]: event.target.value },
                          },
                        }))
                      }
                      placeholder="Unpriced"
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        <button type="button" className={styles.secondaryAction} onClick={newPriceProfile}>
          Start alternative price profile
        </button>
        <button type="button" className={styles.primaryAction} onClick={savePriceProfile}>
          Save traceable price profile
        </button>
      </div>
      <div className={styles.formSection}>
        <strong>Configured assembly factors</strong>
        <span>Waste applies to material only; labor and equipment factors remain explicit.</span>
        <div className={styles.detailList}>
          {QUANTITY_RATE_FIELDS.map(([rateKey, label]) => (
            <div key={rateKey} className={styles.formSection}>
              <strong>{label}</strong>
              <div className={styles.formGrid}>
                <label>
                  <span>Waste (%)</span>
                  <input
                    aria-label={`${label} waste percent`}
                    type="number"
                    min="0"
                    step="0.5"
                    value={assemblyDraft[rateKey].wastePercent}
                    onChange={(event) =>
                      setAssemblyDraft((current) => ({
                        ...current,
                        [rateKey]: { ...current[rateKey], wastePercent: event.target.value },
                      }))
                    }
                  />
                </label>
                <label>
                  <span>Material factor</span>
                  <input
                    aria-label={`${label} material factor`}
                    type="number"
                    min="0"
                    step="0.05"
                    value={assemblyDraft[rateKey].materialFactor}
                    onChange={(event) =>
                      setAssemblyDraft((current) => ({
                        ...current,
                        [rateKey]: { ...current[rateKey], materialFactor: event.target.value },
                      }))
                    }
                  />
                </label>
                <label>
                  <span>Labor factor</span>
                  <input
                    aria-label={`${label} labor factor`}
                    type="number"
                    min="0"
                    step="0.05"
                    value={assemblyDraft[rateKey].laborFactor}
                    onChange={(event) =>
                      setAssemblyDraft((current) => ({
                        ...current,
                        [rateKey]: { ...current[rateKey], laborFactor: event.target.value },
                      }))
                    }
                  />
                </label>
                <label>
                  <span>Equipment factor</span>
                  <input
                    aria-label={`${label} equipment factor`}
                    type="number"
                    min="0"
                    step="0.05"
                    value={assemblyDraft[rateKey].equipmentFactor}
                    onChange={(event) =>
                      setAssemblyDraft((current) => ({
                        ...current,
                        [rateKey]: { ...current[rateKey], equipmentFactor: event.target.value },
                      }))
                    }
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
        <button type="button" className={styles.primaryAction} onClick={saveAssemblies}>
          Save assembly catalog
        </button>
      </div>
      <div className={styles.formSection}>
        <strong>Budget and rental scenario</strong>
        <div className={styles.formGrid}>
          <label className={styles.wideField}>
            <span>Existing scenario</span>
            <select
              aria-label="Feasibility scenario"
              value={
                (profile.scenarios || []).some((entry) => entry.id === selectedScenarioId) ? selectedScenarioId : ''
              }
              onChange={(event) => chooseScenario(event.target.value)}
            >
              <option value="">New unsaved scenario</option>
              {(profile.scenarios || []).map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.wideField}>
            <span>Stable scenario ID</span>
            <input
              aria-label="Feasibility scenario ID"
              value={selectedScenarioId}
              onChange={(event) => setSelectedScenarioId(event.target.value)}
            />
          </label>
          <label className={styles.wideField}>
            <span>Scenario name</span>
            <input
              aria-label="Feasibility scenario name"
              value={scenarioDraft.name}
              onChange={(event) => setScenarioDraft((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
          <label className={styles.wideField}>
            <span>Price profile</span>
            <select
              aria-label="Scenario price profile"
              value={scenarioDraft.priceProfileId}
              onChange={(event) => setScenarioDraft((current) => ({ ...current, priceProfileId: event.target.value }))}
            >
              <option value="">Select profile</option>
              {(profile.priceProfiles || []).map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Contingency (%)</span>
            <input
              aria-label="Scenario contingency"
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={scenarioDraft.contingencyPercent}
              onChange={(event) =>
                setScenarioDraft((current) => ({ ...current, contingencyPercent: event.target.value }))
              }
            />
          </label>
          <label>
            <span>Professional fees (%)</span>
            <input
              aria-label="Scenario professional fees"
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={scenarioDraft.professionalFeesPercent}
              onChange={(event) =>
                setScenarioDraft((current) => ({ ...current, professionalFeesPercent: event.target.value }))
              }
            />
          </label>
          <label>
            <span>Permit allowance (PHP)</span>
            <input
              aria-label="Scenario permit allowance"
              type="number"
              min="0"
              step="1000"
              value={scenarioDraft.permitAllowance}
              onChange={(event) => setScenarioDraft((current) => ({ ...current, permitAllowance: event.target.value }))}
            />
          </label>
          <label>
            <span>Other allowance (PHP)</span>
            <input
              aria-label="Scenario other allowance"
              type="number"
              min="0"
              step="1000"
              value={scenarioDraft.otherAllowance}
              onChange={(event) => setScenarioDraft((current) => ({ ...current, otherAllowance: event.target.value }))}
            />
          </label>
          <label>
            <span>Monthly gross rent (PHP)</span>
            <input
              aria-label="Scenario monthly gross rent"
              type="number"
              min="0"
              step="1000"
              value={scenarioDraft.monthlyGrossRent}
              onChange={(event) =>
                setScenarioDraft((current) => ({ ...current, monthlyGrossRent: event.target.value }))
              }
            />
          </label>
          <label>
            <span>Vacancy (%)</span>
            <input
              aria-label="Scenario vacancy"
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={scenarioDraft.vacancyPercent}
              onChange={(event) => setScenarioDraft((current) => ({ ...current, vacancyPercent: event.target.value }))}
            />
          </label>
          <label>
            <span>Operating expense (%)</span>
            <input
              aria-label="Scenario operating expense"
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={scenarioDraft.operatingExpensePercent}
              onChange={(event) =>
                setScenarioDraft((current) => ({ ...current, operatingExpensePercent: event.target.value }))
              }
            />
          </label>
        </div>
        <button type="button" className={styles.secondaryAction} onClick={newScenario}>
          Start alternative scenario
        </button>
        <button
          type="button"
          className={styles.primaryAction}
          disabled={!scenarioDraft.priceProfileId}
          onClick={saveScenario}
        >
          Save and activate scenario
        </button>
        {activeScenario &&
          selectedScenarioId !== activeScenario.id &&
          (profile.scenarios || []).some((entry) => entry.id === selectedScenarioId) && (
            <button
              type="button"
              className={styles.secondaryAction}
              onClick={() =>
                onExecuteCommand({
                  type: BUILDING_COMMANDS.SET_ACTIVE_FEASIBILITY_SCENARIO,
                  scenarioId: selectedScenarioId,
                })
              }
            >
              Set selected scenario active
            </button>
          )}
      </div>
      {(comparison?.scenarios || []).length > 0 && (
        <div className={styles.formSection}>
          <strong>Scenario comparison</strong>
          <div className={styles.detailList}>
            {comparison.scenarios.map((entry) => (
              <div key={entry.scenarioId} className={styles.detailRow}>
                <span>
                  <strong>{entry.name}</strong>
                  <small>
                    {entry.scenarioId === comparison.baselineScenarioId
                      ? 'Active baseline'
                      : entry.deltaFromBaseline == null
                        ? 'Incomplete pricing'
                        : `${formatMoney(entry.deltaFromBaseline, economics?.currency)} vs baseline`}
                  </small>
                </span>
                <strong>
                  {entry.totalProjectCost == null
                    ? 'Incomplete'
                    : formatMoney(entry.totalProjectCost, economics?.currency)}
                </strong>
              </div>
            ))}
          </div>
          {(comparison.opportunities || []).slice(0, 5).map((entry) => (
            <div key={`${entry.alternativeScenarioId}_${entry.itemId}`} className={styles.issueCard}>
              <span className={styles.issueRule}>{entry.label}</span>
              <span>
                {formatMoney(entry.savings, economics?.currency)} configured-rate saving in{' '}
                {entry.alternativeScenarioId}
              </span>
              <small>Comparison only · design and supplier review required</small>
            </div>
          ))}
        </div>
      )}
      <form className={styles.formGrid} onSubmit={submit}>
        <strong className={styles.wideField}>Legacy flat-rate input for projects without feasibility scenarios</strong>
        <label>
          Rebar allowance (kg/m³ concrete)
          <input
            type="number"
            min="0"
            step="1"
            value={draft.reinforcementAllowanceKgPerM3}
            onChange={(event) => setDraft({ ...draft, reinforcementAllowanceKgPerM3: event.target.value })}
            placeholder="Engineer / estimator input"
          />
        </label>
        <label>
          Excavation planning depth (m)
          <input
            aria-label="Excavation planning depth"
            type="number"
            min="0"
            step="0.1"
            value={draft.excavationDepth}
            onChange={(event) => setDraft({ ...draft, excavationDepth: event.target.value })}
            placeholder="Estimator / geotechnical input"
          />
        </label>
        {QUANTITY_RATE_FIELDS.map(([key, label]) => (
          <label key={key}>
            {label} (PHP)
            <input
              type="number"
              min="0"
              step="0.01"
              value={draft.unitRates[key]}
              onChange={(event) => setDraft({ ...draft, unitRates: { ...draft.unitRates, [key]: event.target.value } })}
              placeholder="Not priced"
            />
          </label>
        ))}
        <button className={`${styles.primaryAction} ${styles.wideField}`} type="submit">
          Apply estimating assumptions
        </button>
        {lastCommand?.commandType === BUILDING_COMMANDS.CONFIGURE_QUANTITY_PROFILE && (
          <span className={lastCommand.ok ? styles.commandSuccess : styles.commandError}>
            {lastCommand.ok ? 'Rates applied and takeoff recalculated.' : lastCommand.error?.message}
          </span>
        )}
      </form>
      {(takeoff?.warnings || []).map((warning) => (
        <p key={warning} className={styles.disclaimer}>
          {warning}
        </p>
      ))}
      {(economics?.warnings || []).map((warning) => (
        <p key={warning} className={styles.disclaimer}>
          {warning}
        </p>
      ))}
      <p className={styles.disclaimer}>
        Owner feasibility estimates are not bids, appraisals, lending advice, purchase orders, or professional cost
        certifications. Assemblies, rents, allowances, and dated prices require estimator, supplier, and professional
        confirmation.
      </p>
    </div>
  );
}

function DocumentsStage({
  project,
  documentPackage,
  documentationRealization,
  professionalExchange,
  handoff,
  lastCommand,
  onExecuteCommand,
}) {
  const generated = documentPackage?.generatedSheetCount || 0;
  const ready = documentPackage?.readyDeliverableCount || 0;
  const total = documentPackage?.totalDeliverableCount || 0;
  const assumptions = handoff?.assumptions || [];
  const documentation = handoff?.documentation || { reviewItems: [], revisionSnapshots: [] };
  const comparison = handoff?.revisionComparison || {};
  const issuedState = documentationRealization?.state || {};
  const completeness = documentationRealization?.completeness || {};
  const exchangeState = professionalExchange?.state || { exchanges: [], reviewerMarkups: [], externalResponses: [] };
  const activeExchange = professionalExchange?.activeExchange || null;
  const [assumptionDraft, setAssumptionDraft] = useState({
    id: `assumption_${assumptions.length + 1}`,
    title: '',
    category: 'general',
    statement: '',
    sourceLabel: '',
    sourceDate: '',
  });
  const [reviewDraft, setReviewDraft] = useState({
    id: `review_item_${documentation.reviewItems.length + 1}`,
    title: '',
    discipline: 'architectural',
    severity: 'action',
    comment: '',
    createdBy: '',
    createdDate: '',
  });
  const [resolutions, setResolutions] = useState({});
  const [verificationDraft, setVerificationDraft] = useState({
    reviewItemId: documentation.reviewItems[0]?.id || '',
    professionalName: '',
    profession: '',
    licenseId: '',
    verificationDate: '',
    scopeNote: '',
    confirmedExternalReview: false,
  });
  const [revisionDraft, setRevisionDraft] = useState({
    id: `review_revision_${documentation.revisionSnapshots.length + 1}`,
    code: String.fromCharCode(65 + Math.min(documentation.revisionSnapshots.length, 25)),
    label: 'For professional review',
    date: '',
    author: '',
    purpose: 'professional_review',
    note: '',
  });
  const [exchangeDraft, setExchangeDraft] = useState({
    exchangeId: `xi_exchange_${exchangeState.exchanges.length + 1}`,
    label: issuedState.issueCode
      ? `${issuedState.issueCode} professional review exchange`
      : 'Professional review exchange',
    publishedDate: issuedState.issueDate || '',
    publishedBy: issuedState.preparedBy || '',
  });
  const [markupDraft, setMarkupDraft] = useState({
    id: `markup_${exchangeState.reviewerMarkups.length + 1}`,
    sheetId: activeExchange?.manifest?.sheets?.[0]?.id || '',
    title: '',
    comment: '',
    discipline: 'general',
    priority: 'action',
    author: '',
    organization: '',
    createdDate: '',
    sourceFileName: '',
  });
  const [responseDraft, setResponseDraft] = useState({
    id: `response_${exchangeState.externalResponses.length + 1}`,
    markupId: exchangeState.reviewerMarkups[0]?.id || '',
    responderName: '',
    profession: '',
    organization: '',
    licenseId: '',
    responseDate: '',
    response: '',
    disposition: 'noted',
    sourceFileName: '',
  });
  const [exchangeDownload, setExchangeDownload] = useState({ running: false, error: '' });
  return (
    <div className={styles.stageContent}>
      <div className={styles.stageIntro}>
        <strong>Preliminary documents</strong>
        <span>Views and sheets generated from the coordinated model.</span>
      </div>
      <div className={styles.metricsGrid}>
        <Metric label="Sheets" value={(project.sheets || []).length} />
        <Metric
          label="Generated package"
          value={`${generated} sheets`}
          note={documentPackage?.outOfDate ? 'Out of date' : 'Current model basis'}
        />
        <Metric label="Deliverables ready" value={`${ready}/${total}`} />
        <Metric
          label="Section cuts"
          value={(project.floors || []).reduce((total, floor) => total + (floor.sectionCuts || []).length, 0)}
        />
        <Metric label="Floors" value={(project.floors || []).length} />
        <Metric label="Coordination findings" value={documentPackage?.issueCount || 0} />
        <Metric label="Open review items" value={handoff?.openReviewItems?.length || 0} />
        <Metric
          label="Engineer-verified records"
          value={handoff?.engineerVerifiedItems?.length || 0}
          note="External evidence only"
        />
        <Metric label="Review revisions" value={documentation.revisionSnapshots.length} />
        <Metric
          label="Changes from review basis"
          value={comparison.baseline ? comparison.changeCount : 'No baseline'}
          note={comparison.baseline ? (comparison.isCurrent ? 'Current' : 'Recapture after review') : null}
        />
      </div>
      <div className={styles.detailList}>
        {(documentPackage?.deliverables || []).map((deliverable) => (
          <div key={deliverable.id} className={styles.detailRow}>
            <span>{deliverable.label}</span>
            <strong>{deliverable.ready ? 'Ready' : 'Missing basis'}</strong>
          </div>
        ))}
      </div>
      <div className={styles.formSection}>
        <strong>Nu · coordinated professional documentation realization</strong>
        <span>
          {issuedState.status === 'issued'
            ? documentationRealization.outOfDate
              ? 'The issued professional-review package is outdated because its coordinated basis changed.'
              : `${issuedState.issueCode} · ${issuedState.issueLabel} is current with its Mu and review-revision basis.`
            : 'Issue a frozen professional-review package after Mu, a current review revision, and all required sheets, schedules, dimensions, and tags are complete.'}
        </span>
        <div className={styles.metricsGrid}>
          <Metric
            label="Issue status"
            value={
              issuedState.status === 'issued'
                ? documentationRealization.outOfDate
                  ? 'Outdated'
                  : 'Current'
                : 'Not issued'
            }
          />
          <Metric label="Issued sheets" value={documentationRealization?.issuedSheetCount || 0} />
          <Metric label="Issued deliverables" value={documentationRealization?.issuedDeliverableCount || 0} />
          <Metric
            label="Disclosed findings"
            value={documentationRealization?.unresolvedFindingCount || 0}
            note="Included—not resolved"
          />
          <Metric label="Derived annotations" value={documentationRealization?.annotationCount || 0} />
          <Metric
            label="Completeness"
            value={completeness.complete ? 'Ready to issue' : 'Incomplete'}
            note={`${completeness.missingDeliverables?.length || 0} deliverables · ${completeness.sheetFaults?.length || 0} sheet faults · ${completeness.annotationFaults?.length || 0} annotation faults`}
          />
        </div>
        {(completeness.missingDeliverables || []).map((entry) => (
          <div key={entry.id} className={styles.issueCard}>
            <span className={styles.issueRule}>{entry.id}</span>
            <span>{entry.label || 'Required deliverable'} is missing its coordinated basis.</span>
          </div>
        ))}
        {(completeness.sheetFaults || []).slice(0, 8).map((entry, index) => (
          <div
            key={`${entry.code}_${entry.sheetId || entry.sheetNumber || entry.reportId || index}`}
            className={styles.issueCard}
          >
            <span className={styles.issueRule}>{humanize(entry.code)}</span>
            <span>{entry.sheetNumber || entry.reportId || entry.sheetId || 'Package output'}</span>
          </div>
        ))}
        <button
          type="button"
          className={styles.primaryAction}
          onClick={() => onExecuteCommand({ type: BUILDING_COMMANDS.ISSUE_COORDINATED_REVIEW_PACKAGE })}
        >
          {issuedState.status === 'issued'
            ? 'Reissue coordinated professional-review package'
            : 'Issue coordinated professional-review package'}
        </button>
        {lastCommand?.commandType === BUILDING_COMMANDS.ISSUE_COORDINATED_REVIEW_PACKAGE && (
          <span className={lastCommand.ok ? styles.commandSuccess : styles.commandError}>
            {lastCommand.ok
              ? 'Nu review issue frozen with sheets, findings, annotations, and revision basis.'
              : lastCommand.error?.message}
          </span>
        )}
        <p className={styles.disclaimer}>
          Issued sheets remain preliminary and unsealed. They are not a permit submission, construction authorization,
          tender guarantee, or as-built record.
        </p>
      </div>
      <div className={styles.formSection}>
        <strong>Xi · professional interoperability and review exchange</strong>
        <span>
          Freeze a portable exchange from the current Nu issue, then carry reviewer markups and external responses
          against that exact issue.
        </span>
        <div className={styles.metricsGrid}>
          <Metric label="Published exchanges" value={professionalExchange?.exchangeCount || 0} />
          <Metric
            label="Active exchange"
            value={activeExchange?.label || 'None'}
            note={
              professionalExchange?.outOfDate ? 'Outdated against Nu' : activeExchange ? 'Current issue basis' : null
            }
          />
          <Metric label="PDF pages" value={activeExchange?.manifest?.files?.multiSheetPdf?.pageCount || 0} />
          <Metric label="DXF files" value={activeExchange?.manifest?.files?.dxf?.length || 0} />
          <Metric
            label="Reviewer markups"
            value={professionalExchange?.markupCount || 0}
            note={`${professionalExchange?.openMarkupCount || 0} open`}
          />
          <Metric
            label="External responses"
            value={professionalExchange?.externalResponseCount || 0}
            note="Preserved evidence"
          />
        </div>
        <div className={styles.formGrid}>
          <label>
            <span>Exchange ID</span>
            <input
              aria-label="Exchange ID"
              value={exchangeDraft.exchangeId}
              onChange={(event) => setExchangeDraft({ ...exchangeDraft, exchangeId: event.target.value })}
            />
          </label>
          <label>
            <span>Published date</span>
            <input
              aria-label="Exchange published date"
              type="date"
              value={exchangeDraft.publishedDate}
              onChange={(event) => setExchangeDraft({ ...exchangeDraft, publishedDate: event.target.value })}
            />
          </label>
          <label className={styles.wideField}>
            <span>Exchange label</span>
            <input
              aria-label="Exchange label"
              value={exchangeDraft.label}
              onChange={(event) => setExchangeDraft({ ...exchangeDraft, label: event.target.value })}
            />
          </label>
          <label>
            <span>Published by</span>
            <input
              aria-label="Exchange publisher"
              value={exchangeDraft.publishedBy}
              onChange={(event) => setExchangeDraft({ ...exchangeDraft, publishedBy: event.target.value })}
            />
          </label>
        </div>
        <button
          type="button"
          className={styles.primaryAction}
          onClick={() => onExecuteCommand({ type: BUILDING_COMMANDS.PUBLISH_PROFESSIONAL_EXCHANGE, ...exchangeDraft })}
        >
          Publish immutable Xi exchange
        </button>
        {activeExchange && (
          <button
            type="button"
            className={styles.secondaryAction}
            disabled={exchangeDownload.running}
            onClick={async () => {
              setExchangeDownload({ running: true, error: '' });
              try {
                const { downloadProfessionalExchangeArchive } = await import('@/export/professionalExchangeExport');
                await downloadProfessionalExchangeArchive(project, { exchangeId: activeExchange.id });
                setExchangeDownload({ running: false, error: '' });
              } catch (error) {
                setExchangeDownload({ running: false, error: error.message || 'Exchange export failed.' });
              }
            }}
          >
            {exchangeDownload.running
              ? 'Rendering complete PDF and DXFs…'
              : 'Download PDF / DXF / manifest exchange ZIP'}
          </button>
        )}
        {exchangeDownload.error && <span className={styles.commandError}>{exchangeDownload.error}</span>}
        {lastCommand?.commandType === BUILDING_COMMANDS.PUBLISH_PROFESSIONAL_EXCHANGE && (
          <span className={lastCommand.ok ? styles.commandSuccess : styles.commandError}>
            {lastCommand.ok
              ? 'Xi exchange manifest and artifact plan published from the complete Nu issue.'
              : lastCommand.error?.message}
          </span>
        )}
        {activeExchange && (
          <div className={styles.formGrid}>
            <label className={styles.wideField}>
              <span>Portable reviewer-markup JSON</span>
              <input
                aria-label="Reviewer markup exchange file"
                type="file"
                accept="application/json,.json"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  onExecuteCommand({
                    type: BUILDING_COMMANDS.IMPORT_REVIEWER_MARKUP_EXCHANGE,
                    exchangeId: activeExchange.id,
                    sourceFileName: file.name,
                    payload: await file.text(),
                  });
                  event.target.value = '';
                }}
              />
            </label>
            <label>
              <span>Markup ID</span>
              <input
                aria-label="Markup ID"
                value={markupDraft.id}
                onChange={(event) => setMarkupDraft({ ...markupDraft, id: event.target.value })}
              />
            </label>
            <label>
              <span>Issued sheet</span>
              <select
                aria-label="Markup sheet"
                value={markupDraft.sheetId}
                onChange={(event) => setMarkupDraft({ ...markupDraft, sheetId: event.target.value })}
              >
                {activeExchange.manifest.sheets.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.number} · {entry.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Discipline</span>
              <select
                aria-label="Markup discipline"
                value={markupDraft.discipline}
                onChange={(event) => setMarkupDraft({ ...markupDraft, discipline: event.target.value })}
              >
                {['architectural', 'structural', 'plumbing', 'electrical', 'cost', 'permit', 'general'].map((entry) => (
                  <option key={entry} value={entry}>
                    {humanize(entry)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Reviewer</span>
              <input
                aria-label="Markup author"
                value={markupDraft.author}
                onChange={(event) => setMarkupDraft({ ...markupDraft, author: event.target.value })}
              />
            </label>
            <label>
              <span>Review date</span>
              <input
                aria-label="Markup date"
                type="date"
                value={markupDraft.createdDate}
                onChange={(event) => setMarkupDraft({ ...markupDraft, createdDate: event.target.value })}
              />
            </label>
            <label>
              <span>Source file</span>
              <input
                aria-label="Markup source file"
                value={markupDraft.sourceFileName}
                onChange={(event) => setMarkupDraft({ ...markupDraft, sourceFileName: event.target.value })}
              />
            </label>
            <label className={styles.wideField}>
              <span>Markup title</span>
              <input
                aria-label="Markup title"
                value={markupDraft.title}
                onChange={(event) => setMarkupDraft({ ...markupDraft, title: event.target.value })}
              />
            </label>
            <label className={styles.wideField}>
              <span>Reviewer comment</span>
              <textarea
                aria-label="Markup comment"
                value={markupDraft.comment}
                onChange={(event) => setMarkupDraft({ ...markupDraft, comment: event.target.value })}
              />
            </label>
            <button
              type="button"
              className={`${styles.primaryAction} ${styles.wideField}`}
              onClick={() =>
                onExecuteCommand({
                  type: BUILDING_COMMANDS.IMPORT_REVIEWER_MARKUP,
                  exchangeId: activeExchange.id,
                  ...markupDraft,
                })
              }
            >
              Import reviewer markup record
            </button>
          </div>
        )}
        {exchangeState.reviewerMarkups.length > 0 && (
          <div className={styles.formGrid}>
            <label>
              <span>Response ID</span>
              <input
                aria-label="External response ID"
                value={responseDraft.id}
                onChange={(event) => setResponseDraft({ ...responseDraft, id: event.target.value })}
              />
            </label>
            <label>
              <span>Markup</span>
              <select
                aria-label="Response markup"
                value={responseDraft.markupId}
                onChange={(event) => setResponseDraft({ ...responseDraft, markupId: event.target.value })}
              >
                {exchangeState.reviewerMarkups.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.sheetNumber || 'General'} · {entry.title || entry.id}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Responder</span>
              <input
                aria-label="Response professional"
                value={responseDraft.responderName}
                onChange={(event) => setResponseDraft({ ...responseDraft, responderName: event.target.value })}
              />
            </label>
            <label>
              <span>Profession</span>
              <input
                aria-label="Response profession"
                value={responseDraft.profession}
                onChange={(event) => setResponseDraft({ ...responseDraft, profession: event.target.value })}
              />
            </label>
            <label>
              <span>Response date</span>
              <input
                aria-label="Response date"
                type="date"
                value={responseDraft.responseDate}
                onChange={(event) => setResponseDraft({ ...responseDraft, responseDate: event.target.value })}
              />
            </label>
            <label>
              <span>Disposition</span>
              <select
                aria-label="Response disposition"
                value={responseDraft.disposition}
                onChange={(event) => setResponseDraft({ ...responseDraft, disposition: event.target.value })}
              >
                {['noted', 'revise', 'accepted_for_design_basis', 'rejected'].map((entry) => (
                  <option key={entry} value={entry}>
                    {humanize(entry)}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.wideField}>
              <span>External response</span>
              <textarea
                aria-label="External response"
                value={responseDraft.response}
                onChange={(event) => setResponseDraft({ ...responseDraft, response: event.target.value })}
              />
            </label>
            <button
              type="button"
              className={`${styles.primaryAction} ${styles.wideField}`}
              onClick={() =>
                onExecuteCommand({ type: BUILDING_COMMANDS.RECORD_EXTERNAL_PROFESSIONAL_RESPONSE, ...responseDraft })
              }
            >
              Preserve external response
            </button>
          </div>
        )}
        {professionalExchange?.comparison && (
          <p className={styles.disclaimer}>
            Latest issue comparison: {professionalExchange.comparison.changeCount} sheet/finding changes;{' '}
            {professionalExchange.comparison.addedSheets.length} sheets added,{' '}
            {professionalExchange.comparison.removedSheets.length} removed,{' '}
            {professionalExchange.comparison.changedSheets.length} changed.
          </p>
        )}
        <p className={styles.disclaimer}>
          Xi is a review exchange, not certified IFC, permit acceptance, a professional seal, professional approval, or
          construction authorization.
        </p>
      </div>
      <div className={styles.formSection}>
        <strong>Traceable design assumption</strong>
        <div className={styles.formGrid}>
          <label>
            <span>Stable ID</span>
            <input
              aria-label="Assumption ID"
              value={assumptionDraft.id}
              onChange={(event) => setAssumptionDraft({ ...assumptionDraft, id: event.target.value })}
            />
          </label>
          <label>
            <span>Category</span>
            <input
              aria-label="Assumption category"
              value={assumptionDraft.category}
              onChange={(event) => setAssumptionDraft({ ...assumptionDraft, category: event.target.value })}
            />
          </label>
          <label className={styles.wideField}>
            <span>Title</span>
            <input
              aria-label="Assumption title"
              value={assumptionDraft.title}
              onChange={(event) => setAssumptionDraft({ ...assumptionDraft, title: event.target.value })}
            />
          </label>
          <label className={styles.wideField}>
            <span>Statement</span>
            <textarea
              aria-label="Assumption statement"
              value={assumptionDraft.statement}
              onChange={(event) => setAssumptionDraft({ ...assumptionDraft, statement: event.target.value })}
            />
          </label>
          <label>
            <span>Source</span>
            <input
              aria-label="Assumption source"
              value={assumptionDraft.sourceLabel}
              onChange={(event) => setAssumptionDraft({ ...assumptionDraft, sourceLabel: event.target.value })}
            />
          </label>
          <label>
            <span>Source date</span>
            <input
              aria-label="Assumption source date"
              type="date"
              value={assumptionDraft.sourceDate}
              onChange={(event) => setAssumptionDraft({ ...assumptionDraft, sourceDate: event.target.value })}
            />
          </label>
        </div>
        <button
          type="button"
          className={styles.primaryAction}
          onClick={() =>
            onExecuteCommand({
              type: BUILDING_COMMANDS.CONFIGURE_DESIGN_ASSUMPTION,
              assumptionId: assumptionDraft.id,
              title: assumptionDraft.title,
              category: assumptionDraft.category,
              statement: assumptionDraft.statement,
              sourceLabel: assumptionDraft.sourceLabel,
              sourceDate: assumptionDraft.sourceDate,
            })
          }
        >
          Save assumption
        </button>
      </div>
      <div className={styles.formSection}>
        <strong>Professional review register</strong>
        <div className={styles.formGrid}>
          <label>
            <span>Stable ID</span>
            <input
              aria-label="Review item ID"
              value={reviewDraft.id}
              onChange={(event) => setReviewDraft({ ...reviewDraft, id: event.target.value })}
            />
          </label>
          <label>
            <span>Discipline</span>
            <select
              aria-label="Review discipline"
              value={reviewDraft.discipline}
              onChange={(event) => setReviewDraft({ ...reviewDraft, discipline: event.target.value })}
            >
              {['architectural', 'structural', 'plumbing', 'electrical', 'cost', 'permit', 'general'].map((entry) => (
                <option key={entry} value={entry}>
                  {humanize(entry)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Priority</span>
            <select
              aria-label="Review severity"
              value={reviewDraft.severity}
              onChange={(event) => setReviewDraft({ ...reviewDraft, severity: event.target.value })}
            >
              {['information', 'warning', 'action'].map((entry) => (
                <option key={entry} value={entry}>
                  {humanize(entry)}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.wideField}>
            <span>Title</span>
            <input
              aria-label="Review title"
              value={reviewDraft.title}
              onChange={(event) => setReviewDraft({ ...reviewDraft, title: event.target.value })}
            />
          </label>
          <label className={styles.wideField}>
            <span>Review request / comment</span>
            <textarea
              aria-label="Review comment"
              value={reviewDraft.comment}
              onChange={(event) => setReviewDraft({ ...reviewDraft, comment: event.target.value })}
            />
          </label>
          <label>
            <span>Created by</span>
            <input
              aria-label="Review author"
              value={reviewDraft.createdBy}
              onChange={(event) => setReviewDraft({ ...reviewDraft, createdBy: event.target.value })}
            />
          </label>
          <label>
            <span>Created date</span>
            <input
              aria-label="Review created date"
              type="date"
              value={reviewDraft.createdDate}
              onChange={(event) => setReviewDraft({ ...reviewDraft, createdDate: event.target.value })}
            />
          </label>
        </div>
        <button
          type="button"
          className={styles.primaryAction}
          onClick={() =>
            onExecuteCommand({
              type: BUILDING_COMMANDS.CONFIGURE_REVIEW_ITEM,
              reviewItemId: reviewDraft.id,
              title: reviewDraft.title,
              discipline: reviewDraft.discipline,
              severity: reviewDraft.severity,
              status: 'open',
              comment: reviewDraft.comment,
              createdBy: reviewDraft.createdBy,
              createdDate: reviewDraft.createdDate,
            })
          }
        >
          Add open review item
        </button>
        <div className={styles.detailList}>
          {documentation.reviewItems.map((entry) => (
            <div key={entry.id} className={styles.formSection}>
              <div className={styles.detailRow}>
                <span>
                  <strong>{entry.title}</strong>
                  <small>
                    {humanize(entry.discipline)} · {humanize(entry.status)} · {humanize(entry.confidence)}
                  </small>
                </span>
                <strong>{humanize(entry.severity)}</strong>
              </div>
              {entry.status === 'open' && (
                <div className={styles.formGrid}>
                  <label className={styles.wideField}>
                    <span>Resolution</span>
                    <input
                      aria-label={`${entry.title} resolution`}
                      value={resolutions[entry.id] || ''}
                      onChange={(event) => setResolutions({ ...resolutions, [entry.id]: event.target.value })}
                    />
                  </label>
                  <button
                    type="button"
                    className={styles.secondaryAction}
                    onClick={() =>
                      onExecuteCommand({
                        type: BUILDING_COMMANDS.SET_REVIEW_ITEM_STATUS,
                        reviewItemId: entry.id,
                        status: 'resolved',
                        resolution: resolutions[entry.id] || '',
                      })
                    }
                  >
                    Record resolution
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      {documentation.reviewItems.length > 0 && (
        <div className={styles.formSection}>
          <strong>External professional verification evidence</strong>
          <span>
            This form records a review that occurred outside the application; it does not perform or grant approval.
          </span>
          <div className={styles.formGrid}>
            <label className={styles.wideField}>
              <span>Review item</span>
              <select
                aria-label="Verification review item"
                value={verificationDraft.reviewItemId}
                onChange={(event) => setVerificationDraft({ ...verificationDraft, reviewItemId: event.target.value })}
              >
                {documentation.reviewItems.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Professional name</span>
              <input
                aria-label="Verifier name"
                value={verificationDraft.professionalName}
                onChange={(event) =>
                  setVerificationDraft({ ...verificationDraft, professionalName: event.target.value })
                }
              />
            </label>
            <label>
              <span>Profession</span>
              <input
                aria-label="Verifier profession"
                value={verificationDraft.profession}
                onChange={(event) => setVerificationDraft({ ...verificationDraft, profession: event.target.value })}
              />
            </label>
            <label>
              <span>License / registration</span>
              <input
                aria-label="Verifier license"
                value={verificationDraft.licenseId}
                onChange={(event) => setVerificationDraft({ ...verificationDraft, licenseId: event.target.value })}
              />
            </label>
            <label>
              <span>Verification date</span>
              <input
                aria-label="Verification date"
                type="date"
                value={verificationDraft.verificationDate}
                onChange={(event) =>
                  setVerificationDraft({ ...verificationDraft, verificationDate: event.target.value })
                }
              />
            </label>
            <label className={styles.wideField}>
              <span>Verified scope</span>
              <textarea
                aria-label="Verification scope"
                value={verificationDraft.scopeNote}
                onChange={(event) => setVerificationDraft({ ...verificationDraft, scopeNote: event.target.value })}
              />
            </label>
            <label className={styles.wideField}>
              <input
                aria-label="Confirm external review"
                type="checkbox"
                checked={verificationDraft.confirmedExternalReview}
                onChange={(event) =>
                  setVerificationDraft({ ...verificationDraft, confirmedExternalReview: event.target.checked })
                }
              />{' '}
              I confirm this evidence describes an external licensed-professional review.
            </label>
          </div>
          <button
            type="button"
            className={styles.primaryAction}
            disabled={!verificationDraft.confirmedExternalReview}
            onClick={() =>
              onExecuteCommand({ type: BUILDING_COMMANDS.RECORD_EXTERNAL_VERIFICATION, ...verificationDraft })
            }
          >
            Record external engineer-verified evidence
          </button>
        </div>
      )}
      <div className={styles.formSection}>
        <strong>Immutable review revision</strong>
        <div className={styles.formGrid}>
          <label>
            <span>Stable ID</span>
            <input
              aria-label="Review revision ID"
              value={revisionDraft.id}
              onChange={(event) => setRevisionDraft({ ...revisionDraft, id: event.target.value })}
            />
          </label>
          <label>
            <span>Revision code</span>
            <input
              aria-label="Review revision code"
              value={revisionDraft.code}
              onChange={(event) => setRevisionDraft({ ...revisionDraft, code: event.target.value })}
            />
          </label>
          <label className={styles.wideField}>
            <span>Issue label</span>
            <input
              aria-label="Review revision label"
              value={revisionDraft.label}
              onChange={(event) => setRevisionDraft({ ...revisionDraft, label: event.target.value })}
            />
          </label>
          <label>
            <span>Issue date</span>
            <input
              aria-label="Review revision date"
              type="date"
              value={revisionDraft.date}
              onChange={(event) => setRevisionDraft({ ...revisionDraft, date: event.target.value })}
            />
          </label>
          <label>
            <span>Prepared by</span>
            <input
              aria-label="Review revision author"
              value={revisionDraft.author}
              onChange={(event) => setRevisionDraft({ ...revisionDraft, author: event.target.value })}
            />
          </label>
          <label className={styles.wideField}>
            <span>Note</span>
            <input
              aria-label="Review revision note"
              value={revisionDraft.note}
              onChange={(event) => setRevisionDraft({ ...revisionDraft, note: event.target.value })}
            />
          </label>
        </div>
        <button
          type="button"
          className={styles.primaryAction}
          onClick={() =>
            onExecuteCommand({
              type: BUILDING_COMMANDS.CAPTURE_REVIEW_REVISION,
              revisionId: revisionDraft.id,
              code: revisionDraft.code,
              label: revisionDraft.label,
              date: revisionDraft.date,
              author: revisionDraft.author,
              purpose: revisionDraft.purpose,
              note: revisionDraft.note,
            })
          }
        >
          Capture current model as review revision
        </button>
        {comparison.baseline && (
          <p className={styles.disclaimer}>
            Active basis {comparison.baseline.code} · {comparison.baseline.label}:{' '}
            {comparison.isCurrent
              ? 'current model matches'
              : `${comparison.added.length} added, ${comparison.removed.length} removed, ${comparison.changed.length} changed`}
            . Snapshots record differences; they do not approve them.
          </p>
        )}
      </div>
      <button
        type="button"
        className={styles.primaryAction}
        onClick={() =>
          onExecuteCommand({ type: BUILDING_COMMANDS.GENERATE_PRELIMINARY_DRAWING_PACKAGE, packageId: 'alpha' })
        }
      >
        {generated ? 'Regenerate preliminary package' : 'Generate preliminary package'}
      </button>
      {lastCommand?.commandType === BUILDING_COMMANDS.GENERATE_PRELIMINARY_DRAWING_PACKAGE && (
        <span className={lastCommand.ok ? styles.commandSuccess : styles.commandError}>
          {lastCommand.ok
            ? 'Preliminary sheets and reports regenerated from the coordinated model.'
            : lastCommand.error?.message}
        </span>
      )}
      <p className={styles.disclaimer}>Exports are a design basis for review, not permit or construction approval.</p>
    </div>
  );
}

export default function ProjectLifecyclePanel({
  project,
  derived,
  activeStage = 'brief',
  onStageChange,
  onExecuteCommand,
}) {
  const building = project.building || {};
  const brief = building.brief || {};
  const issues = derived?.validationIssues || [];
  const program = derived?.apartmentProgram || {};
  const ledger = derived?.siteFeasibility?.areaLedger || {};
  const status = deriveLifecycleStatus(project, derived);
  const briefFormKey = [
    brief.targetStoreys,
    brief.targetUnitCount,
    brief.targetBudget,
    brief.parkingRequirement,
    brief.targetRentalIncome,
    brief.preferredStructuralSystem,
    brief.accessibilityRequirements,
    brief.roofType,
  ].join('|');
  const siteFormKey = JSON.stringify([
    building.site?.lotSetup,
    building.site?.edgeSetbacks,
    building.site?.parkingPlan,
  ]);
  // Deliberately without gridSystems: the grid fields are live, and a remount
  // on every accepted edit would pull the focus out of the field being typed
  // in. Nothing else in the stage seeds a draft from the grids — the stack and
  // member sizes come from the realization profile, the slab opening from the
  // floors — so those still reseed on an external change, as they should.
  const structuralFormKey = JSON.stringify([
    building.systems?.structural?.coordinationProfile || {},
    building.systems?.structural?.realizationProfile || {},
    building.systems?.structural?.realization || {},
    (project.floors || []).map((floor) => [floor.id, floor.beams || [], floor.slabs || []]),
  ]);
  const systemsFormKey = JSON.stringify([
    building.systems || {},
    project.roofSystem || null,
    (project.floors || []).map((floor) => [floor.id, floor.rooms || [], floor.stairs || [], floor.slabs || []]),
  ]);
  const spacesFormKey = JSON.stringify([
    building.unitTypes || [],
    building.spaceProgram || {},
    building.unitInstances || [],
    building.testFitProfile || {},
    building.testFitOptions || [],
    building.selectedTestFitId || null,
    building.acceptedTestFitId || null,
    building.apartmentDesignProfile || {},
    building.apartmentDesign || {},
  ]);
  const quantityFormKey = JSON.stringify([
    building.quantityProfile || {},
    building.costRealizationProfile || {},
    building.costRealization || {},
  ]);
  const documentsFormKey = JSON.stringify([
    building.assumptions || [],
    building.documentation || {},
    building.documentationRealizationProfile || {},
    building.documentationRealization || {},
    building.professionalExchangeProfile || {},
    building.professionalExchange || {},
  ]);

  return (
    <section className={styles.lifecycle} aria-label="Project lifecycle">
      <div className={styles.lifecycleHeader}>
        <span>Apartment Design Engineer</span>
        <small>Coordinated Building Core</small>
      </div>
      <nav className={styles.stageNav} aria-label="Building lifecycle stages">
        {LIFECYCLE_STAGES.map((stage) => (
          <button
            key={stage.id}
            type="button"
            className={`${styles.stageButton} ${activeStage === stage.id ? styles.stageButtonActive : ''}`}
            aria-current={activeStage === stage.id ? 'step' : undefined}
            onClick={() => onStageChange(stage.id)}
          >
            <span className={styles.stageIndex}>{stage.index}</span>
            <span className={styles.stageLabel}>{stage.label}</span>
            <span className={styles.stageStatus} data-state={status[stage.id].state}>
              {status[stage.id].value}
            </span>
          </button>
        ))}
      </nav>

      {activeStage === 'brief' && (
        <BriefStage
          key={briefFormKey}
          brief={brief}
          lastCommand={derived?.lastCommand}
          onExecuteCommand={onExecuteCommand}
        />
      )}
      {activeStage === 'site' && (
        <SiteStage
          key={siteFormKey}
          building={building}
          ledger={ledger}
          parking={derived?.parkingCoordination || {}}
          lastCommand={derived?.lastCommand}
          onExecuteCommand={onExecuteCommand}
        />
      )}
      {activeStage === 'spaces' && (
        <SpacesStage
          key={spacesFormKey}
          project={project}
          building={building}
          program={program}
          ledger={ledger}
          testFits={derived?.testFitCoordination || { profile: {}, options: [] }}
          apartmentDesign={
            derived?.apartmentDesignCoordination || {
              profile: {},
              state: {},
              units: [],
              fixtures: [],
              roomEnvironmental: [],
            }
          }
          lastCommand={derived?.lastCommand}
          onExecuteCommand={onExecuteCommand}
        />
      )}
      {activeStage === 'structure' && (
        <StructureStage
          key={structuralFormKey}
          project={project}
          building={building}
          issues={issues}
          loadPath={derived?.structuralLoadPath || { summary: {} }}
          realization={derived?.structuralRealization || { profile: {}, state: {}, skippedBeamSegments: [] }}
          lastCommand={derived?.lastCommand}
          onExecuteCommand={onExecuteCommand}
        />
      )}
      {activeStage === 'systems' && (
        <SystemsStage
          key={systemsFormKey}
          project={project}
          building={building}
          wetCore={derived?.wetCore || {}}
          services={derived?.servicesCoordination || {}}
          realization={
            derived?.servicesRealization || { profile: {}, state: {}, actualEntityCounts: {}, unresolvedItems: [] }
          }
          equipment={derived?.equipmentCoordination || {}}
          roofDrainage={derived?.roofDrainageCoordination || {}}
          lastCommand={derived?.lastCommand}
          onExecuteCommand={onExecuteCommand}
        />
      )}
      {activeStage === 'validate' && (
        <ValidateStage
          issues={issues}
          spatial={derived?.spatialCoordination || {}}
          services={derived?.servicesCoordination || {}}
        />
      )}
      {activeStage === 'quantities' && (
        <QuantitiesStage
          key={quantityFormKey}
          brief={brief}
          ledger={ledger}
          takeoff={derived?.quantityTakeoff || { items: [], profile: building.quantityProfile || {} }}
          economics={derived?.feasibilityEconomics || {}}
          comparison={derived?.feasibilityComparison || {}}
          realization={derived?.costRealization || { state: {}, assemblyCoverage: {} }}
          lastCommand={derived?.lastCommand}
          onExecuteCommand={onExecuteCommand}
        />
      )}
      {activeStage === 'documents' && (
        <DocumentsStage
          key={documentsFormKey}
          project={project}
          documentPackage={derived?.documentPackage || { deliverables: [] }}
          documentationRealization={derived?.documentationRealization || { state: {}, completeness: {} }}
          professionalExchange={
            derived?.professionalExchange || { state: { exchanges: [], reviewerMarkups: [], externalResponses: [] } }
          }
          handoff={derived?.professionalHandoff || {}}
          lastCommand={derived?.lastCommand}
          onExecuteCommand={onExecuteCommand}
        />
      )}
    </section>
  );
}
