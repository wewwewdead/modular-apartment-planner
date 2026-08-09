import { getFloorStackBounds } from '@/domain/floorModels';
import { getProjectTrussSystem, getTrussTypeAttachedRoofType, resolveTrussType } from '@/domain/trussModels';
import { buildTrussSystemGeometry } from '@/geometry/trussGeometry';
import { buildTrussProfile, resolveTrussMetrics } from './profile';
import {
  buildSystemBoundary,
  collectSystemCopyPlanPoints,
  projectPointOntoAxis,
  resolveSystemLayoutRange,
  resolveSystemPlanAxes,
} from './systemPlanAxes';

const EPSILON = 1e-6;

export function getTrussRoofAttachmentElevation(trussSystem) {
  const baseElevation = Number.isFinite(trussSystem?.baseElevation) ? trussSystem.baseElevation : 0;
  const roofSupportOffset = resolveTrussSystemRoofSupportOffset(trussSystem);
  const purlinDepth = trussSystem?.purlinSystem?.enabled
    ? Math.max(Number(trussSystem?.purlinSystem?.depth || 0), 0)
    : 0;
  return baseElevation + roofSupportOffset + purlinDepth;
}

export function getRoofAttachmentElevation(project, roofSystem = project?.roofSystem || null) {
  const attachedTrussSystem = getAttachedTrussSystem(project, roofSystem);
  if (attachedTrussSystem) {
    return getTrussRoofAttachmentElevation(attachedTrussSystem);
  }

  return getFloorStackBounds(project).maxElevation;
}

export function getAttachedTrussSystem(project, roofSystem = project?.roofSystem || null) {
  if (!project || !roofSystem?.trussAttachmentId) return null;
  return getProjectTrussSystem(project, roofSystem.trussAttachmentId);
}

function resolveTrussSystemRoofSupportOffset(trussSystem, catalog) {
  const firstInstance = trussSystem?.trussInstances?.[0] || null;
  if (!firstInstance) return 0;
  const profile = buildTrussProfile(firstInstance, catalog);
  return Math.max(Number(profile?.roofOutline?.[0]?.z || 0), 0);
}

function buildAttachedRoofShapeProfile(trussInstance, catalog) {
  if (!trussInstance) return null;

  const profile = buildTrussProfile(trussInstance, catalog);
  const roofOutline = (profile?.roofOutline || []).filter(
    (point) => Number.isFinite(point?.x) && Number.isFinite(point?.z),
  );
  if (roofOutline.length < 2) return null;

  const minX = Math.min(...roofOutline.map((point) => point.x));
  const maxX = Math.max(...roofOutline.map((point) => point.x));
  const totalSpan = Math.max(maxX - minX, EPSILON);
  const maxRise = Math.max(...roofOutline.map((point) => Math.max(0, point.z)));

  return {
    shape: profile?.trussType?.shape || null,
    points: roofOutline.map((point) => ({
      position: (point.x - minX) / totalSpan,
      rise: Math.max(0, point.z),
    })),
    totalSpan,
    maxRise,
  };
}

export function resolveTrussSystemRoofAttachmentType(trussSystem, catalog) {
  const trussInstances = trussSystem?.trussInstances || [];
  if (!trussInstances.length) return null;

  const attachmentTypes = [
    ...new Set(
      trussInstances.map(
        (instance) => getTrussTypeAttachedRoofType(resolveTrussType(instance.trussTypeId, catalog), catalog) || null,
      ),
    ),
  ];

  return attachmentTypes.length === 1 ? attachmentTypes[0] : null;
}

// The roof covers what the top chords cover, overhangs included; a ceiling hung
// from the same system stops at the bearings instead — see
// deriveCeilingBoundaryFromTrussSystem.
export function deriveRoofBoundaryFromTrussSystem(trussSystem, sourceSystemGeometry = null) {
  const systemGeometry = sourceSystemGeometry || (trussSystem ? buildTrussSystemGeometry(trussSystem) : null);
  const planAxes = resolveSystemPlanAxes(systemGeometry);
  const copyPlanPoints = collectSystemCopyPlanPoints(systemGeometry);
  if (!planAxes || !copyPlanPoints.length) return null;

  const spanValues = copyPlanPoints.map((point) => projectPointOntoAxis(point, planAxes.origin, planAxes.spanAxis));

  return buildSystemBoundary(
    planAxes,
    { min: Math.min(...spanValues), max: Math.max(...spanValues) },
    resolveSystemLayoutRange(systemGeometry, planAxes),
  );
}

export function deriveRoofStateFromTrussSystem(trussSystem, catalog, sourceSystemGeometry = null) {
  const systemGeometry = sourceSystemGeometry || (trussSystem ? buildTrussSystemGeometry(trussSystem) : null);
  const instanceGeometry = systemGeometry?.instances?.[0] || null;
  const trussInstance = instanceGeometry?.instance || null;
  if (!trussInstance || !instanceGeometry) return null;

  const trussType = resolveTrussType(trussInstance.trussTypeId, catalog);
  const roofAttachmentType = resolveTrussSystemRoofAttachmentType(trussSystem, catalog);
  if (!roofAttachmentType) return null;

  // Drive the roof slope from the same rise-based metrics the truss profile is
  // built from, so the attached roof plane never disagrees with the rendered
  // truss geometry (this is the failure mode for legacy saves whose stored
  // rise and pitch were inconsistent).
  const metrics = resolveTrussMetrics(trussInstance, trussType);
  const pitchSlope = roofAttachmentType === 'flat' ? 0 : Math.max(0, metrics.pitch);
  const layoutX =
    Number(instanceGeometry.layoutLineEndPoint?.x || 0) - Number(instanceGeometry.layoutLineStartPoint?.x || 0);
  const layoutY =
    Number(instanceGeometry.layoutLineEndPoint?.y || 0) - Number(instanceGeometry.layoutLineStartPoint?.y || 0);
  const length = Math.hypot(-layoutY, layoutX) || 1;
  // perpendicular(layout line) is the truss span axis: profile-local x=0 (the
  // start support, where a shed truss is LOW) sits at the axis minimum. Roof
  // pitch directions point DOWNHILL everywhere else in the app (the preset
  // shed plane is highest at the axis minimum), so the shed roof must pitch
  // along the NEGATED span axis. Profile-driven types keep the span axis:
  // they map profile position 0 to the axis minimum, matching truss local x.
  const pitchSign = roofAttachmentType === 'shed' ? -1 : 1;

  return {
    roofType: roofAttachmentType,
    baseElevation: getTrussRoofAttachmentElevation(trussSystem),
    attachedShapeProfile: buildAttachedRoofShapeProfile(trussInstance, catalog),
    pitch: {
      slope: pitchSlope,
      direction: {
        x: (pitchSign * -layoutY) / length,
        y: (pitchSign * layoutX) / length,
      },
      ridgeOffset:
        roofAttachmentType === 'gable'
          ? ((trussInstance.bearingOffsets?.start || 0) - (trussInstance.bearingOffsets?.end || 0)) / 2
          : 0,
      // Attached roof extents come from the truss outline, so roof overhang stays at zero.
      overhang: 0,
    },
  };
}

export function resolveRoofAttachmentContext(project, roofSystem = null, catalog) {
  const attachedTrussSystem = getAttachedTrussSystem(project, roofSystem);
  if (attachedTrussSystem) {
    const systemGeometry = buildTrussSystemGeometry(attachedTrussSystem);
    const derivedRoofState = deriveRoofStateFromTrussSystem(attachedTrussSystem, catalog, systemGeometry);
    return {
      attachmentElevation: getTrussRoofAttachmentElevation(attachedTrussSystem),
      attachedTrussSystem,
      derivedRoofState,
      derivedBoundaryPolygon: derivedRoofState
        ? deriveRoofBoundaryFromTrussSystem(attachedTrussSystem, systemGeometry)
        : null,
    };
  }

  return {
    attachmentElevation: getRoofAttachmentElevation(project, roofSystem),
    attachedTrussSystem: null,
    derivedRoofState: null,
    derivedBoundaryPolygon: null,
  };
}
