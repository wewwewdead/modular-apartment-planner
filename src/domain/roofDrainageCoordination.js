import { DESIGN_CONFIDENCE } from './trustModels';
import { getProjectRoofs } from './projectRoofs';
import { distance } from '@/geometry/point';
import { pointInPolygon, polygonArea } from '@/geometry/polygon';
import { buildDerivedRoofDrainage } from '@/roof/drainage';

export const DEFAULT_ROOF_DRAINAGE_PROFILE = Object.freeze({
  id: 'owner_roof_drainage_planning_v1',
  source: 'configured_early_planning_assumption_not_hydraulic_or_code_design',
  minimumFinishSlopePercent: 1,
  routeEndpointTolerance: 250,
});

function issue(ruleId, severity, message, entityRefs, inputs, resultKind = 'verified_geometry') {
  return {
    id: `${ruleId}:${entityRefs.map((entry) => `${entry.type}:${entry.id}`).join('|')}`,
    ruleId,
    category: 'roof_drainage_coordination',
    severity,
    message,
    entityRefs,
    evidence: { resultKind, confidence: DESIGN_CONFIDENCE.CHECKED, inputs },
    professionalReviewRequired: true,
  };
}

function outletTarget(project, outletRef) {
  if (outletRef?.kind === 'plumbing_shaft') {
    return (
      (project.building?.systems?.plumbing?.shafts || []).find((entry) => entry.id === outletRef.id)?.origin || null
    );
  }
  if (
    outletRef?.kind === 'site_discharge' &&
    Number.isFinite(outletRef.point?.x) &&
    Number.isFinite(outletRef.point?.y)
  ) {
    return outletRef.point;
  }
  if (
    outletRef?.kind === 'downspout' &&
    Number.isFinite(outletRef.position?.x) &&
    Number.isFinite(outletRef.position?.y)
  ) {
    return outletRef.position;
  }
  return null;
}

/**
 * The building's roof drainage: counts summed over every roof. The planning
 * profile is the first roof's (the lifecycle panel edits that one); the roof
 * type lists each modelled type once.
 */
export function deriveRoofDrainageCoordination(project) {
  const roofSystems = getProjectRoofs(project);
  const profile = { ...DEFAULT_ROOF_DRAINAGE_PROFILE, ...(roofSystems[0]?.drainageProfile || {}) };
  let gutterCount = 0;
  let downspoutCount = 0;
  for (const roofSystem of roofSystems) {
    const derived = buildDerivedRoofDrainage(roofSystem);
    gutterCount += derived.gutters.length;
    downspoutCount += derived.downspouts.length;
  }
  const drains = roofSystems.flatMap((roofSystem) => roofSystem.drains || []);
  const roofTypes = [...new Set(roofSystems.map((roofSystem) => roofSystem.roofType).filter(Boolean))];
  return {
    profile,
    roofType: roofTypes.join(', ') || null,
    drainCount: drains.length,
    gutterCount,
    downspoutCount,
    routedDrainCount: drains.filter((entry) => entry.outletRef && (entry.routePoints || []).length >= 2).length,
    professionalReviewRequired: true,
  };
}

/** Every roof is checked on its own: its boundary, its slope, its drains, refs naming that roof. */
export function validateRoofDrainageCoordination(project) {
  return getProjectRoofs(project).flatMap((roof) => validateRoofDrainage(project, roof));
}

function validateRoofDrainage(project, roof) {
  const boundary = roof.boundaryPolygon || [];
  const refs = [{ type: 'roofSystem', id: roof.id }];
  const profile = { ...DEFAULT_ROOF_DRAINAGE_PROFILE, ...(roof.drainageProfile || {}) };
  const issues = [];
  if (boundary.length < 3 || polygonArea(boundary) <= 0) {
    return [
      issue(
        'ROOF_DRAINAGE.BOUNDARY_INVALID',
        'error',
        'Roof drainage cannot be checked without a valid roof boundary.',
        refs,
        { boundaryPointCount: boundary.length },
      ),
    ];
  }
  if (roof.roofType === 'flat') {
    if ((Number(roof.finishSlope) || 0) < profile.minimumFinishSlopePercent) {
      issues.push(
        issue(
          'ROOF_DRAINAGE.SLOPE_BELOW_ASSUMPTION',
          'warning',
          'Flat-roof finish slope is below the configured drainage-planning assumption.',
          refs,
          {
            finishSlopePercent: Number(roof.finishSlope) || 0,
            minimumFinishSlopePercent: profile.minimumFinishSlopePercent,
            profileId: profile.id,
          },
          'configured_rule_check',
        ),
      );
    }
    if (!(roof.drains || []).length) {
      issues.push(
        issue('ROOF_DRAINAGE.NO_DRAIN', 'error', 'Flat roof has no modeled drain or valid discharge path.', refs, {
          drainCount: 0,
        }),
      );
    }
  } else {
    const derived = buildDerivedRoofDrainage(roof);
    if (!derived.gutters.length || !derived.downspouts.length) {
      issues.push(
        issue(
          'ROOF_DRAINAGE.EDGE_COLLECTION_PATH_MISSING',
          'warning',
          'Sloped roof has no derived gutter/downspout collection path for its current edge roles.',
          refs,
          { roofType: roof.roofType, gutterCount: derived.gutters.length, downspoutCount: derived.downspouts.length },
        ),
      );
    }
  }
  const planeIds = new Set((roof.roofPlanes || []).map((entry) => entry.id));
  for (const drain of roof.drains || []) {
    const drainRefs = [...refs, { type: 'roofDrain', id: drain.id }];
    if (!pointInPolygon(drain.position, boundary)) {
      issues.push(
        issue(
          'ROOF_DRAINAGE.DRAIN_OUTSIDE_BOUNDARY',
          'error',
          `${drain.name || drain.id} lies outside the roof boundary.`,
          drainRefs,
          { position: drain.position },
        ),
      );
    }
    const brokenCatchment = (drain.catchmentPlaneIds || []).find((id) => !planeIds.has(id));
    if (brokenCatchment)
      issues.push(
        issue(
          'ROOF_DRAINAGE.CATCHMENT_REFERENCE_BROKEN',
          'error',
          `${drain.name || drain.id} references a missing roof plane.`,
          drainRefs,
          { catchmentPlaneId: brokenCatchment },
        ),
      );
    const target = outletTarget(project, drain.outletRef);
    if (!target) {
      issues.push(
        issue(
          'ROOF_DRAINAGE.OUTLET_REFERENCE_MISSING',
          'error',
          `${drain.name || drain.id} has no valid modeled discharge destination.`,
          drainRefs,
          { outletRef: drain.outletRef },
        ),
      );
      continue;
    }
    if ((drain.routePoints || []).length < 2) {
      issues.push(
        issue(
          'ROOF_DRAINAGE.ROUTE_INCOMPLETE',
          'error',
          `${drain.name || drain.id} needs a modeled route to its discharge destination.`,
          drainRefs,
          { routePointCount: drain.routePoints?.length || 0 },
        ),
      );
      continue;
    }
    const startDistance = distance(drain.routePoints[0], drain.position);
    const endDistance = distance(drain.routePoints.at(-1), target);
    if (startDistance > profile.routeEndpointTolerance || endDistance > profile.routeEndpointTolerance) {
      issues.push(
        issue(
          'ROOF_DRAINAGE.ROUTE_ENDPOINT_MISMATCH',
          'error',
          `${drain.name || drain.id} route does not connect its drain and discharge destination.`,
          drainRefs,
          { startDistance, endDistance, tolerance: profile.routeEndpointTolerance },
        ),
      );
    }
  }
  return issues;
}
