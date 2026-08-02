import { stairRun, stairTotalRise } from '@/geometry/stairGeometry';
import { add, perpendicular, scale } from '@/geometry/point';
import { polygonArea } from '@/geometry/polygon';
import { intersectionArea } from '@/geometry/polygonBoolean';
import { stairDirectionVector } from '@/geometry/stairGeometry';
import { DESIGN_CONFIDENCE } from './trustModels';

export const DEFAULT_STAIR_RULE_PROFILE = Object.freeze({
  id: 'alpha_residential_stair_assumptions_v1',
  minWidth: 900,
  minRiserHeight: 125,
  maxRiserHeight: 200,
  minTreadDepth: 250,
  comfortMin: 550,
  comfortMax: 700,
  riseTolerance: 15,
  source: 'configured_product_assumption_not_code_approval',
});

export function deriveStairMetrics(stair, fromFloor, toFloor) {
  const totalRise = stairTotalRise(stair);
  const totalRun = stairRun(stair);
  const levelRise = fromFloor && toFloor ? (toFloor.elevation || 0) - (fromFloor.elevation || 0) : null;
  return {
    totalRise,
    totalRun,
    levelRise,
    riseDifference: levelRise == null ? null : totalRise - levelRise,
    comfortValue: 2 * (stair.riserHeight || 0) + (stair.treadDepth || 0),
  };
}

function issue(stair, ruleId, severity, message, inputs, resultKind = 'configured_rule_check') {
  return {
    id: `${ruleId}:stair:${stair.id}`,
    ruleId,
    category: 'vertical_coordination',
    severity,
    message,
    entityRefs: [{ type: 'stair', id: stair.id }],
    evidence: {
      resultKind,
      confidence: DESIGN_CONFIDENCE.CHECKED,
      inputs,
    },
    professionalReviewRequired: true,
  };
}

export function deriveStairClearanceEnvelope(stair, fromFloor, targetSlab, minimumHeadroom = 2000) {
  const totalRise = stairTotalRise(stair);
  const run = stairRun(stair);
  if (!fromFloor || !targetSlab || totalRise <= 0 || run <= 0 || stair.width <= 0) return [];
  const slabUnderside = (targetSlab.elevation || 0) - (targetSlab.thickness || 0);
  const thresholdRatio = Math.max(
    0,
    Math.min(1, (slabUnderside - minimumHeadroom - (fromFloor.elevation || 0)) / totalRise),
  );
  const direction = stairDirectionVector(stair);
  const normal = perpendicular(direction);
  const halfWidth = stair.width / 2;
  const envelopeStart = add(stair.startPoint, scale(direction, run * thresholdRatio));
  const envelopeEnd = add(stair.startPoint, scale(direction, run));
  return [
    add(envelopeStart, scale(normal, halfWidth)),
    add(envelopeEnd, scale(normal, halfWidth)),
    add(envelopeEnd, scale(normal, -halfWidth)),
    add(envelopeStart, scale(normal, -halfWidth)),
  ];
}

function validateHeadroomOpening(stair, fromFloor, toFloor, floors, profile, issues) {
  const reference = stair.coordination?.clearanceOpeningRef;
  const minimumHeadroom = stair.coordination?.minimumHeadroom ?? 2000;
  const baseInputs = { profileId: profile.id, profileSource: profile.source, minimumHeadroom };
  if (!reference) {
    issues.push(
      issue(
        stair,
        'STAIR.HEADROOM_NOT_VERIFIED',
        'warning',
        'Stair headroom has not been verified against slabs, beams, and openings.',
        { ...baseInputs, requiredClearanceEnvelopeModeled: false },
        'missing_coordination_geometry',
      ),
    );
    return;
  }
  const hostFloor = floors.get(reference.floorId);
  const slab = (hostFloor?.slabs || []).find((entry) => entry.id === reference.slabId);
  const opening = (slab?.openings || []).find((entry) => entry.id === reference.openingId);
  if (!hostFloor || hostFloor.id !== toFloor?.id || !slab || !opening) {
    issues.push(
      issue(
        stair,
        'STAIR.CLEARANCE_OPENING_REFERENCE_BROKEN',
        'error',
        'Stair clearance relationship must reference an opening in the destination-level slab.',
        { ...baseInputs, clearanceOpeningRef: reference, destinationFloorId: toFloor?.id || null },
        'relationship_check',
      ),
    );
    return;
  }
  const envelope = deriveStairClearanceEnvelope(stair, fromFloor, slab, minimumHeadroom);
  const requiredArea = polygonArea(envelope);
  const coveredArea = intersectionArea(envelope, opening.boundaryPoints || []);
  const uncoveredArea = Math.max(0, requiredArea - coveredArea);
  if (requiredArea <= 0 || uncoveredArea > 100) {
    issues.push(
      issue(
        stair,
        'STAIR.CLEARANCE_OPENING_INCOMPLETE',
        'error',
        'Linked slab opening does not cover the configured stair headroom envelope.',
        {
          ...baseInputs,
          clearanceOpeningRef: reference,
          envelope,
          requiredArea,
          coveredArea,
          uncoveredArea,
          units: 'mm²',
        },
        'verified_geometry',
      ),
    );
  }
}

export function validateStairCoordination(project, profile = DEFAULT_STAIR_RULE_PROFILE) {
  const issues = [];
  const floors = new Map((project.floors || []).map((floor) => [floor.id, floor]));
  for (const ownerFloor of project.floors || []) {
    for (const stair of ownerFloor.stairs || []) {
      const fromId = stair.floorRelation?.fromFloorId;
      const toId = stair.floorRelation?.toFloorId;
      const fromFloor = floors.get(fromId);
      const toFloor = floors.get(toId);
      const baseInputs = { profileId: profile.id, profileSource: profile.source };

      if (!fromId || !toId || !fromFloor || !toFloor) {
        issues.push(
          issue(
            stair,
            'STAIR.FLOOR_RELATION_MISSING',
            'error',
            'Stair must reference valid start and destination levels.',
            {
              ...baseInputs,
              ownerFloorId: ownerFloor.id,
              fromFloorId: fromId || null,
              toFloorId: toId || null,
            },
          ),
        );
      } else {
        const metrics = deriveStairMetrics(stair, fromFloor, toFloor);
        if (fromFloor.id !== ownerFloor.id) {
          issues.push(
            issue(
              stair,
              'STAIR.OWNER_LEVEL_MISMATCH',
              'warning',
              'Stair is stored on a different level than its start level.',
              {
                ...baseInputs,
                ownerFloorId: ownerFloor.id,
                fromFloorId: fromFloor.id,
              },
            ),
          );
        }
        if (metrics.levelRise <= 0) {
          issues.push(
            issue(stair, 'STAIR.NON_ASCENDING_RELATION', 'error', 'Stair destination must be above its start level.', {
              ...baseInputs,
              fromElevation: fromFloor.elevation,
              toElevation: toFloor.elevation,
            }),
          );
        } else if (Math.abs(metrics.riseDifference) > profile.riseTolerance) {
          issues.push(
            issue(
              stair,
              'STAIR.RISE_LEVEL_MISMATCH',
              'error',
              `Stair rise differs from the referenced level rise by ${Math.round(Math.abs(metrics.riseDifference))} mm.`,
              { ...baseInputs, ...metrics, tolerance: profile.riseTolerance },
              'verified_geometry',
            ),
          );
        }
      }

      if ((stair.width || 0) < profile.minWidth) {
        issues.push(
          issue(
            stair,
            'STAIR.WIDTH_BELOW_ASSUMPTION',
            'warning',
            'Stair width is below the configured project assumption.',
            {
              ...baseInputs,
              width: stair.width,
              configuredMinimum: profile.minWidth,
            },
          ),
        );
      }
      if ((stair.riserHeight || 0) < profile.minRiserHeight || stair.riserHeight > profile.maxRiserHeight) {
        issues.push(
          issue(
            stair,
            'STAIR.RISER_OUTSIDE_ASSUMPTION',
            'warning',
            'Riser height is outside the configured comfort range.',
            {
              ...baseInputs,
              riserHeight: stair.riserHeight,
              configuredRange: [profile.minRiserHeight, profile.maxRiserHeight],
            },
          ),
        );
      }
      if ((stair.treadDepth || 0) < profile.minTreadDepth) {
        issues.push(
          issue(
            stair,
            'STAIR.TREAD_BELOW_ASSUMPTION',
            'warning',
            'Tread depth is below the configured comfort assumption.',
            {
              ...baseInputs,
              treadDepth: stair.treadDepth,
              configuredMinimum: profile.minTreadDepth,
            },
          ),
        );
      }
      const comfortValue = 2 * (stair.riserHeight || 0) + (stair.treadDepth || 0);
      if (comfortValue < profile.comfortMin || comfortValue > profile.comfortMax) {
        issues.push(
          issue(
            stair,
            'STAIR.COMFORT_RELATION_OUTSIDE_ASSUMPTION',
            'warning',
            'The 2R + T relationship is outside the configured comfort range.',
            {
              ...baseInputs,
              comfortValue,
              configuredRange: [profile.comfortMin, profile.comfortMax],
            },
          ),
        );
      }
      validateHeadroomOpening(stair, fromFloor, toFloor, floors, profile, issues);
    }
  }
  return issues;
}
