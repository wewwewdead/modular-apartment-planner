import { getFloorStackBounds } from '@/domain/floorModels';
import {
  getProjectTrussSystem,
  getTrussProfileOptions,
  getTrussTypeAttachedRoofType,
  resolveTrussType,
} from '@/domain/trussModels';
import { isConvexPolygon } from '@/geometry/polygon';
import { buildTrussSystemGeometry } from '@/geometry/trussGeometry';
import { buildTrussProfile, buildTrussRoofSupportOutline, resolveTrussMetrics, sampleTrussOutlineZ } from './profile';
import {
  buildSystemBoundary,
  collectSystemCopyPlanPoints,
  projectPointOntoAxis,
  resolveSystemLayoutRange,
  resolveSystemPlanAxes,
  resolveSystemSupportLayoutRange,
} from './systemPlanAxes';

const EPSILON = 1e-6;

function resolvePurlinDepth(trussSystem) {
  return trussSystem?.purlinSystem?.enabled ? Math.max(Number(trussSystem?.purlinSystem?.depth || 0), 0) : 0;
}

/**
 * Where an attached roof's underside meets the trusses (spec §7.2): the top
 * chord's top face plus the purlins, at the start heel (x = 0):
 * `baseElevation + bc + h_r + tc / cos θ + purlinDepth / cos θ`. The profile-
 * driven roof measures its signed rises from this datum.
 *
 * A HIP roof is still the preset formula, which measures its rise from the
 * ROOF OUTLINE edge (rise 0 there). That edge is the truss tail tip pushed a
 * further `roofOverhang` out when the roof's own overhang is applied (RT-3.1,
 * spec §7.8.1), so the hip datum is the support line extrapolated down the
 * tail to x = −(overhangStart + roofOverhang). Every other type ignores
 * `roofOverhang`.
 */
export function getTrussRoofAttachmentElevation(trussSystem, { roofOverhang = 0 } = {}) {
  const baseElevation = Number.isFinite(trussSystem?.baseElevation) ? trussSystem.baseElevation : 0;
  return baseElevation + resolveTrussSystemRoofSupportOffset(trussSystem, undefined, roofOverhang);
}

/**
 * The roof's own overhang as `buildRoofPlaneGeometry` applies it
 * (`ensureRoofOutline`): only on a convex boundary, never on flat/custom.
 */
function resolveAppliedRoofOverhang(roofSystem, boundaryPolygon) {
  const overhang = Number(roofSystem?.pitch?.overhang);
  if (!Number.isFinite(overhang) || overhang <= EPSILON) return 0;
  if (roofSystem?.roofType === 'flat' || roofSystem?.roofType === 'custom') return 0;
  return isConvexPolygon(boundaryPolygon || []) ? overhang : 0;
}

/** Only a hip roof's datum reads the roof overhang; skip the boundary build otherwise. */
function trussSystemDatumReadsRoofOverhang(trussSystem, catalog) {
  const firstInstance = trussSystem?.trussInstances?.[0] || null;
  return Boolean(firstInstance) && resolveTrussType(firstInstance.trussTypeId, catalog)?.shape === 'hip';
}

export function getRoofAttachmentElevation(project, roofSystem = project?.roofSystem || null) {
  if (getAttachedTrussSystem(project, roofSystem)) {
    // One rule with the normalizer (syncRoofSystemAttachment), so an offset the
    // reducer stores against this elevation re-derives the same base.
    return resolveRoofAttachmentContext(project, roofSystem).attachmentElevation;
  }

  return getFloorStackBounds(project).maxElevation;
}

export function getAttachedTrussSystem(project, roofSystem = project?.roofSystem || null) {
  if (!project || !roofSystem?.trussAttachmentId) return null;
  return getProjectTrussSystem(project, roofSystem.trussAttachmentId);
}

/**
 * z of a support line at x; before its first point the first segment is
 * extrapolated (a hip datum past the tail tip — the tail continues the run,
 * so the extension is exact). `sampleTrussOutlineZ` clamps at the ends.
 */
function sampleSupportLineZ(support, x) {
  const ordered = (support || [])
    .filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.z))
    .sort((a, b) => a.x - b.x);
  const first = ordered[0];
  const second = ordered.find((point) => point.x > (first?.x ?? 0) + EPSILON);
  if (first && second && x < first.x - EPSILON) {
    return first.z + ((second.z - first.z) * (x - first.x)) / (second.x - first.x);
  }
  return sampleTrussOutlineZ(support, x);
}

function resolveTrussSystemRoofSupportOffset(trussSystem, catalog, roofOverhang = 0) {
  const firstInstance = trussSystem?.trussInstances?.[0] || null;
  if (!firstInstance) return 0;
  const profile = buildTrussProfile(firstInstance, catalog, getTrussProfileOptions(trussSystem));
  const support = buildTrussRoofSupportOutline(profile, resolvePurlinDepth(trussSystem));
  const datumX =
    profile?.trussType?.shape === 'hip'
      ? -((profile.metrics?.overhangStart || 0) + Math.max(0, Number(roofOverhang) || 0))
      : 0;
  return sampleSupportLineZ(support, datumX);
}

/** Drop interior points that lie on the straight line through their neighbours. */
function dropCollinear(points) {
  if (points.length <= 2) return points;
  const result = [points[0]];
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = result[result.length - 1];
    const point = points[index];
    const next = points[index + 1];
    const run = next.x - previous.x;
    const expected =
      Math.abs(run) <= EPSILON ? previous.z : previous.z + ((next.z - previous.z) * (point.x - previous.x)) / run;
    if (Math.abs(point.z - expected) > 1e-6) result.push(point);
  }
  result.push(points[points.length - 1]);
  return result;
}

/**
 * The attached roof's underside across the span (spec §7.2): the chord top
 * face + purlins, tails included, as SIGNED rises from the start-heel datum
 * (`getTrussRoofAttachmentElevation`). A tail below the heel is a negative rise.
 */
function buildAttachedRoofShapeProfile(trussInstance, catalog, trussSystem = null) {
  if (!trussInstance) return null;

  const profile = buildTrussProfile(trussInstance, catalog, getTrussProfileOptions(trussSystem));
  const support = dropCollinear(
    buildTrussRoofSupportOutline(profile, resolvePurlinDepth(trussSystem)).filter(
      (point) => Number.isFinite(point?.x) && Number.isFinite(point?.z),
    ),
  );
  if (support.length < 2) return null;

  const minX = Math.min(...support.map((point) => point.x));
  const maxX = Math.max(...support.map((point) => point.x));
  const totalSpan = Math.max(maxX - minX, EPSILON);
  const datum = sampleTrussOutlineZ(support, 0);
  const points = support.map((point) => ({
    position: (point.x - minX) / totalSpan,
    rise: point.z - datum,
  }));
  const pitchPercent = Number(profile?.metrics?.pitch);

  return {
    // The ROOF shape (a scissor truss carries a plain gable roof).
    shape: profile?.trussType?.attachedRoofType || profile?.trussType?.shape || null,
    points,
    totalSpan,
    maxRise: Math.max(...points.map((point) => point.rise)),
    // RT-3.1 (spec §7.8.2): the underside run slope as a ratio, the reference
    // a manual roof slope scales these rises against.
    slope: Number.isFinite(pitchPercent) ? Math.max(0, pitchPercent) / 100 : null,
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

/**
 * RT-4 (spec §7.9.3.1): a hip roof's layout range is the trusses' SUPPORT
 * line (where the step-down slices measure their station from) plus the first
 * instance's start tail at BOTH ends, so the end eaves are level with the side
 * eaves and the end planes pass through the heel support line.
 */
function resolveHipLayoutRange(systemGeometry, planAxes) {
  const supportRange = resolveSystemSupportLayoutRange(systemGeometry, planAxes);
  if (!supportRange) return null;
  const tail = Math.max(0, Number(systemGeometry?.instances?.[0]?.metrics?.overhangStart) || 0);
  return { min: supportRange.min - tail, max: supportRange.max + tail };
}

// The roof covers what the top chords cover, overhangs included. A hip roof
// reads the support line in the layout direction (RT-4); every other type the
// first/last copy.
export function deriveRoofBoundaryFromTrussSystem(
  trussSystem,
  sourceSystemGeometry = null,
  attachmentType = resolveTrussSystemRoofAttachmentType(trussSystem),
) {
  const systemGeometry = sourceSystemGeometry || (trussSystem ? buildTrussSystemGeometry(trussSystem) : null);
  const planAxes = resolveSystemPlanAxes(systemGeometry);
  const copyPlanPoints = collectSystemCopyPlanPoints(systemGeometry);
  if (!planAxes || !copyPlanPoints.length) return null;

  const spanValues = copyPlanPoints.map((point) => projectPointOntoAxis(point, planAxes.origin, planAxes.spanAxis));

  return buildSystemBoundary(
    planAxes,
    { min: Math.min(...spanValues), max: Math.max(...spanValues) },
    attachmentType === 'hip'
      ? resolveHipLayoutRange(systemGeometry, planAxes)
      : resolveSystemLayoutRange(systemGeometry, planAxes),
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
    attachedShapeProfile: buildAttachedRoofShapeProfile(trussInstance, catalog, trussSystem),
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
    const derivedBoundaryPolygon = derivedRoofState
      ? deriveRoofBoundaryFromTrussSystem(attachedTrussSystem, systemGeometry, derivedRoofState.roofType)
      : null;
    // RT-3.1: a hip datum sits at the ROOF outline edge (see
    // getTrussRoofAttachmentElevation), so it reads the roof's applied overhang.
    const roofOverhang =
      derivedRoofState && trussSystemDatumReadsRoofOverhang(attachedTrussSystem, catalog)
        ? resolveAppliedRoofOverhang({ ...roofSystem, roofType: 'hip' }, derivedBoundaryPolygon)
        : 0;
    return {
      attachmentElevation: getTrussRoofAttachmentElevation(attachedTrussSystem, { roofOverhang }),
      attachedTrussSystem,
      derivedRoofState,
      derivedBoundaryPolygon,
    };
  }

  return {
    attachmentElevation: getRoofAttachmentElevation(project, roofSystem),
    attachedTrussSystem: null,
    derivedRoofState: null,
    derivedBoundaryPolygon: null,
  };
}
