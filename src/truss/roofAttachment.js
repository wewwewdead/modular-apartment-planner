import { getFloorStackBounds } from '@/domain/floorModels';
import { getProjectTrussSystem, getTrussTypeAttachedRoofType, resolveTrussType } from '@/domain/trussModels';
import { add, dot, perpendicular, scale, subtract } from '@/geometry/point';
import { buildTrussSystemGeometry } from '@/geometry/trussGeometry';
import { buildTrussProfile } from './profile';

const EPSILON = 1e-6;

function normalizePlanVector(vector, fallback = { x: 1, y: 0 }) {
  const x = Number(vector?.x || 0);
  const y = Number(vector?.y || 0);
  const length = Math.hypot(x, y);
  if (length <= EPSILON) {
    return { ...fallback };
  }

  return {
    x: x / length,
    y: y / length,
  };
}

function projectPointOntoAxis(point, origin, axis) {
  return dot(subtract(point, origin), axis);
}

function pointFromAxisCoordinates(origin, axisX, axisY, x, y) {
  return add(add(origin, scale(axisX, x)), scale(axisY, y));
}

function collectSystemCopyPlanPoints(systemGeometry) {
  return (systemGeometry?.instances || []).flatMap((instanceGeometry) => (
    (instanceGeometry.copies || []).flatMap((copy) => [copy.overallStartPoint, copy.overallEndPoint])
  ));
}

function collectSystemLayoutGuidePoints(systemGeometry) {
  return (systemGeometry?.instances || []).flatMap((instanceGeometry) => (
    [instanceGeometry.layoutLineStartPoint, instanceGeometry.layoutLineEndPoint].filter(Boolean)
  ));
}

function resolveSystemPlanAxes(systemGeometry) {
  const instanceGeometry = (systemGeometry?.instances || []).find((entry) => (
    (entry.copies || []).length || (entry.layoutLineStartPoint && entry.layoutLineEndPoint)
  )) || null;
  if (!instanceGeometry) return null;

  const firstCopy = instanceGeometry.copies?.[0] || null;
  const layoutAxis = normalizePlanVector(
    subtract(
      instanceGeometry.layoutLineEndPoint || instanceGeometry.layoutLineStartPoint || { x: 1, y: 0 },
      instanceGeometry.layoutLineStartPoint || { x: 0, y: 0 }
    )
  );
  let spanAxis = firstCopy
    ? normalizePlanVector(subtract(firstCopy.overallEndPoint, firstCopy.overallStartPoint), perpendicular(layoutAxis))
    : perpendicular(layoutAxis);

  if (Math.abs(dot(layoutAxis, spanAxis)) > 0.95) {
    spanAxis = perpendicular(layoutAxis);
  }

  return {
    origin: systemGeometry.transform?.pivot
      || instanceGeometry.layoutLineStartPoint
      || firstCopy?.overallStartPoint
      || { x: 0, y: 0 },
    layoutAxis,
    spanAxis,
  };
}

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
  const roofOutline = (profile?.roofOutline || []).filter((point) => (
    Number.isFinite(point?.x) && Number.isFinite(point?.z)
  ));
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

  const attachmentTypes = [...new Set(trussInstances.map((instance) => (
    getTrussTypeAttachedRoofType(resolveTrussType(instance.trussTypeId, catalog), catalog) || null
  )))];

  return attachmentTypes.length === 1 ? attachmentTypes[0] : null;
}

export function deriveRoofBoundaryFromTrussSystem(trussSystem, sourceSystemGeometry = null) {
  const systemGeometry = sourceSystemGeometry || (trussSystem ? buildTrussSystemGeometry(trussSystem) : null);
  const planAxes = resolveSystemPlanAxes(systemGeometry);
  const copyPlanPoints = collectSystemCopyPlanPoints(systemGeometry);
  if (!planAxes || !copyPlanPoints.length) return null;

  const spanValues = copyPlanPoints.map((point) => projectPointOntoAxis(point, planAxes.origin, planAxes.spanAxis));
  let layoutValues = copyPlanPoints.map((point) => projectPointOntoAxis(point, planAxes.origin, planAxes.layoutAxis));
  const layoutSpan = Math.max(...layoutValues) - Math.min(...layoutValues);

  if (layoutSpan <= EPSILON) {
    const layoutGuidePoints = collectSystemLayoutGuidePoints(systemGeometry);
    if (layoutGuidePoints.length) {
      layoutValues = layoutGuidePoints.map((point) => projectPointOntoAxis(point, planAxes.origin, planAxes.layoutAxis));
    }
  }

  const minSpan = Math.min(...spanValues);
  const maxSpan = Math.max(...spanValues);
  const minLayout = Math.min(...layoutValues);
  const maxLayout = Math.max(...layoutValues);

  if ((maxSpan - minSpan) <= EPSILON || (maxLayout - minLayout) <= EPSILON) {
    return null;
  }

  return [
    pointFromAxisCoordinates(planAxes.origin, planAxes.spanAxis, planAxes.layoutAxis, minSpan, minLayout),
    pointFromAxisCoordinates(planAxes.origin, planAxes.spanAxis, planAxes.layoutAxis, maxSpan, minLayout),
    pointFromAxisCoordinates(planAxes.origin, planAxes.spanAxis, planAxes.layoutAxis, maxSpan, maxLayout),
    pointFromAxisCoordinates(planAxes.origin, planAxes.spanAxis, planAxes.layoutAxis, minSpan, maxLayout),
  ];
}

export function deriveRoofStateFromTrussSystem(trussSystem, catalog, sourceSystemGeometry = null) {
  const systemGeometry = sourceSystemGeometry || (trussSystem ? buildTrussSystemGeometry(trussSystem) : null);
  const instanceGeometry = systemGeometry?.instances?.[0] || null;
  const trussInstance = instanceGeometry?.instance || null;
  if (!trussInstance || !instanceGeometry) return null;

  const trussType = resolveTrussType(trussInstance.trussTypeId, catalog);
  const roofAttachmentType = resolveTrussSystemRoofAttachmentType(trussSystem, catalog);
  if (!roofAttachmentType) return null;

  const run = ['gable', 'hip', 'box_gable', 'dropped_eaves', 'pyramid_hipped', 'domed'].includes(roofAttachmentType)
    ? Math.max((trussInstance.span || trussType.defaultSpan || 0) / 2, 1)
    : Math.max(trussInstance.span || trussType.defaultSpan || 0, 1);
  const pitchSlope = Number.isFinite(trussInstance.pitch)
    ? Math.max(0, roofAttachmentType === 'flat' ? 0 : trussInstance.pitch)
    : ((Number(trussInstance.rise || 0) / run) * 100);
  const layoutX = Number(instanceGeometry.layoutLineEndPoint?.x || 0) - Number(instanceGeometry.layoutLineStartPoint?.x || 0);
  const layoutY = Number(instanceGeometry.layoutLineEndPoint?.y || 0) - Number(instanceGeometry.layoutLineStartPoint?.y || 0);
  const length = Math.hypot(-layoutY, layoutX) || 1;

  return {
    roofType: roofAttachmentType,
    baseElevation: getTrussRoofAttachmentElevation(trussSystem),
    attachedShapeProfile: buildAttachedRoofShapeProfile(trussInstance, catalog),
    pitch: {
      slope: pitchSlope,
      direction: {
        x: -layoutY / length,
        y: layoutX / length,
      },
      ridgeOffset: roofAttachmentType === 'gable'
        ? (((trussInstance.bearingOffsets?.start || 0) - (trussInstance.bearingOffsets?.end || 0)) / 2)
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
