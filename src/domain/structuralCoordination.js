import { getBeamRenderData } from '@/geometry/beamGeometry';
import { columnOutline } from '@/geometry/columnGeometry';
import { BEAM_SUPPORT_PROXIMITY_MM, beamSupportsOverhang, computeFloorOverhangs } from '@/geometry/floorOverhang';
import { distanceToSegment, segmentIntersection } from '@/geometry/line';
import { distance, dot, midpoint, normalize, subtract } from '@/geometry/point';
import { pointInPolygon, polygonArea, polygonCentroid } from '@/geometry/polygon';
import { intersectionArea } from '@/geometry/polygonBoolean';
import { getWallRenderData } from '@/geometry/wallColumnGeometry';
import { positionOnWall } from '@/geometry/wallGeometry';
import { getFloorElevation, getOrderedFloors } from './floorModels';
import { DESIGN_CONFIDENCE } from './trustModels';
import { resolveWallBaseBearing, WALL_FRAMING_MODES, normalizeWallFramingMode, wallOutboardOffset } from './wallFit';

export const DEFAULT_STRUCTURAL_COORDINATION_PROFILE = Object.freeze({
  id: 'gamma_small_rc_apartment_coordination_v1',
  maxBeamPlanningSpan: 6000,
  maxSlabPlanningSpan: 4500,
  maxCantileverPlanningLength: 1500,
  minCantileverBackSpanRatio: 3,
  minOpeningClearanceFromColumn: 300,
  source: 'configured_product_assumption_not_structural_design',
});

/** A back-span has to run on roughly the way the cantilever came in. */
const BACKSPAN_ALIGNMENT_DEGREES = 15;

/** Under this a projecting edge is a nib or a rebate, not a cantilever. */
const OVERHANG_SUPPORT_REVIEW_DEPTH_MM = 300;

/** How far below a slab soffit a beam top can sit and still be carrying it. */
export const OVERHANG_BEAM_DROP_MM = 600;

/** A beam top fractionally above the soffit is rounding, not a clash. */
export const OVERHANG_BEAM_RISE_MM = 25;

/**
 * Mirrors STRUCTURAL_ALIGNMENT_TOLERANCE in `@/domain/buildingGraph`, kept local
 * for the reason `floorOverhang` keeps its own copy: buildingGraph imports this
 * module, so reading the constant back out of it would close the ring.
 */
const STACK_ALIGNMENT_TOLERANCE_MM = 25;

/**
 * How much of a bypass wall's run may hang with nothing under it before the
 * model says so. Half is deliberately loose: a facade running past its deck is
 * SUPPOSED to overhang the plate edge, and the case worth reporting is the wall
 * that missed the building rather than the one that oversails it.
 */
const BYPASS_WALL_BEARING_SHARE = 0.5;

/** ...and the hanging stretch has to be a gap rather than a corner detail. */
const BYPASS_WALL_UNSUPPORTED_RUN_MM = 300;

function issue(ruleId, severity, message, entityRefs, inputs, resultKind = 'configured_rule_check') {
  return {
    id: `${ruleId}:${entityRefs.map((ref) => `${ref.type}:${ref.id}`).join('|')}`,
    ruleId,
    category: 'structural_coordination',
    severity,
    message,
    entityRefs,
    evidence: {
      resultKind,
      confidence: DESIGN_CONFIDENCE.CHECKED,
      inputs,
    },
    professionalReviewRequired: true,
  };
}

function projectedWidth(points, angleDegrees) {
  if (!points?.length) return null;
  const angle = (Number(angleDegrees || 0) * Math.PI) / 180;
  const axis = { x: Math.cos(angle), y: Math.sin(angle) };
  const values = points.map((point) => point.x * axis.x + point.y * axis.y);
  return Math.max(...values) - Math.min(...values);
}

function minimumProjectedWidth(points) {
  if (!points || points.length < 3) return null;
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    const angle = (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI + 90;
    minimum = Math.min(minimum, projectedWidth(points, angle));
  }
  return Number.isFinite(minimum) ? minimum : null;
}

function segmentTouchesPolygon(start, end, polygon) {
  if (pointInPolygon(start, polygon) || pointInPolygon(end, polygon) || pointInPolygon(midpoint(start, end), polygon)) {
    return true;
  }
  const samples = [start, end, midpoint(start, end)];
  if (
    samples.some((sample) =>
      polygon.some((point, index) => distanceToSegment(sample, point, polygon[(index + 1) % polygon.length]) <= 1),
    )
  ) {
    return true;
  }
  for (let index = 0; index < polygon.length; index += 1) {
    if (segmentIntersection(start, end, polygon[index], polygon[(index + 1) % polygon.length])) return true;
  }
  return false;
}

function collectSupportCandidates(source, boundary, inference, refs) {
  for (const beam of source.beams || []) {
    const renderData = getBeamRenderData(beam, source.columns || []);
    if (!renderData || !segmentTouchesPolygon(renderData.start, renderData.end, boundary)) continue;
    refs.push({ kind: 'beam', id: beam.id, role: 'internal_or_edge', inference });
  }
  for (const wall of source.walls || []) {
    if (wall.structuralRole !== 'loadbearing') continue;
    if (!segmentTouchesPolygon(wall.start, wall.end, boundary)) continue;
    refs.push({ kind: 'wall', id: wall.id, role: 'loadbearing', inference });
  }
}

/**
 * Infer candidates once, then persist them as explicit slab support references.
 *
 * The storey below counts. A floor's beams frame the TOP of their own storey,
 * so the members actually under a slab are the ones filed one level down — and
 * a slab that cantilevers past its own frame has no other support to name.
 */
export function inferSlabSupportRefs(floor, slab, floorBelow = null) {
  const boundary = slab.boundaryPoints || [];
  if (boundary.length < 3) return [];
  const refs = [];
  collectSupportCandidates(floor, boundary, 'axis_intersects_slab', refs);
  if (floorBelow) {
    collectSupportCandidates(floorBelow, boundary, 'axis_intersects_slab_from_floor_below', refs);
  }
  return refs;
}

/**
 * Resolve a support reference against a slab's own level and the level below,
 * returning the floor it was found on — a below-floor beam has to be measured
 * with that floor's columns, not the slab's.
 */
function resolveSupport(floors, ref) {
  for (const floor of floors) {
    if (!floor) continue;
    const collection =
      ref?.kind === 'beam'
        ? floor.beams
        : ref?.kind === 'wall'
          ? floor.walls
          : ref?.kind === 'column'
            ? floor.columns
            : null;
    if (!collection) return null;
    const entity = (collection || []).find((entry) => entry.id === ref.id);
    if (entity) return { entity, floor };
  }
  return null;
}

/** Previous floor in stacking order — where a cantilevered slab's supports live. */
function floorBelowIndex(project) {
  const ordered = getOrderedFloors(project);
  const index = new Map();
  ordered.forEach((floor, position) => {
    if (position > 0) index.set(floor.id, ordered[position - 1]);
  });
  return index;
}

function beamAxis(beam, floor) {
  const data = getBeamRenderData(beam, floor.columns || []);
  return data
    ? { start: data.start, end: data.end, midpoint: data.midpoint, length: data.length, outline: data.outline }
    : null;
}

function polygonClearance(first, second) {
  if (intersectionArea(first, second) > 0) return 0;
  let minimum = Number.POSITIVE_INFINITY;
  for (const point of first) {
    for (let index = 0; index < second.length; index += 1) {
      minimum = Math.min(minimum, distanceToSegment(point, second[index], second[(index + 1) % second.length]));
    }
  }
  for (const point of second) {
    for (let index = 0; index < first.length; index += 1) {
      minimum = Math.min(minimum, distanceToSegment(point, first[index], first[(index + 1) % first.length]));
    }
  }
  return minimum;
}

function openingPlanSegment(wall, opening) {
  const half = (opening.width || 0) / 2;
  return [positionOnWall(wall, opening.offset - half), positionOnWall(wall, opening.offset + half)];
}

function openingClearanceToColumn(wall, opening, column) {
  const segment = openingPlanSegment(wall, opening);
  const thinOpening = [
    segment[0],
    segment[1],
    { x: segment[1].x + 0.1, y: segment[1].y + 0.1 },
    { x: segment[0].x + 0.1, y: segment[0].y + 0.1 },
  ];
  return polygonClearance(thinOpening, columnOutline(column));
}

function cantileverSupportColumnId(beam) {
  if (beam.startRef?.kind === 'column') return beam.startRef.id;
  if (beam.endRef?.kind === 'column') return beam.endRef.id;
  return null;
}

/** Split a resolved beam into the end sitting on `columnId` and the far end. */
function orientToColumn(beam, data, columnId) {
  if (beam.startRef?.kind === 'column' && beam.startRef.id === columnId) return { at: data.start, away: data.end };
  if (beam.endRef?.kind === 'column' && beam.endRef.id === columnId) return { at: data.end, away: data.start };
  return null;
}

function directionBetween(from, to) {
  const direction = normalize(subtract(to, from));
  return direction.x === 0 && direction.y === 0 ? null : direction;
}

function angleBetweenDegrees(first, second) {
  return (Math.acos(Math.max(-1, Math.min(1, dot(first, second)))) * 180) / Math.PI;
}

/**
 * The member that takes the cantilever's tail back into the frame: another beam
 * on the same column, carrying on from the support in the direction the
 * cantilever arrived from. Where several qualify the longest one governs —
 * one adequate back-span is enough, so reporting the shortest would be a
 * warning about a member that is not the one doing the work.
 */
function findCantileverBackSpan(floor, beam, data, columnId) {
  const oriented = orientToColumn(beam, data, columnId);
  if (!oriented) return null;
  const inward = directionBetween(oriented.away, oriented.at);
  if (!inward) return null;

  let best = null;
  for (const candidate of floor.beams || []) {
    if (candidate.id === beam.id) continue;
    const candidateData = beamAxis(candidate, floor);
    if (!candidateData) continue;
    const ends = orientToColumn(candidate, candidateData, columnId);
    if (!ends) continue;
    const outward = directionBetween(ends.at, ends.away);
    if (!outward) continue;
    const deviation = angleBetweenDegrees(inward, outward);
    if (deviation > BACKSPAN_ALIGNMENT_DEGREES) continue;
    if (!best || candidateData.length > best.length) {
      best = { beam: candidate, length: candidateData.length, deviationDegrees: deviation };
    }
  }
  return best;
}

function configuredProfile(project, override) {
  return {
    ...DEFAULT_STRUCTURAL_COORDINATION_PROFILE,
    ...(project.building?.systems?.structural?.coordinationProfile || {}),
    ...(override || {}),
  };
}

function validateBeamCoordination(floor, beam, profile) {
  const issues = [];
  const data = beamAxis(beam, floor);
  if (!data) return issues;
  const condition = beam.coordination?.condition || 'typical';
  const configuredMaximum = beam.coordination?.maxPlanningSpan ?? profile.maxBeamPlanningSpan;
  const columnEndCount = [beam.startRef, beam.endRef].filter((ref) => ref?.kind === 'column').length;
  const pointEndCount = [beam.startRef, beam.endRef].filter((ref) => ref?.kind === 'point').length;
  const baseInputs = { profileId: profile.id, profileSource: profile.source, floorId: floor.id, condition };

  if (condition === 'cantilever') {
    if (columnEndCount !== 1 || pointEndCount !== 1) {
      issues.push(
        issue(
          'STRUCT.CANTILEVER_INTENT_INVALID',
          'error',
          'Cantilever intent requires exactly one column support and one free point end.',
          [{ type: 'beam', id: beam.id }],
          { ...baseInputs, columnEndCount, pointEndCount },
          'verified_relationship',
        ),
      );
    }
    if (data.length > profile.maxCantileverPlanningLength) {
      issues.push(
        issue(
          'STRUCT.CANTILEVER_EXCEEDS_ASSUMPTION',
          'warning',
          'Cantilever length exceeds the configured early-planning assumption.',
          [{ type: 'beam', id: beam.id }],
          { ...baseInputs, measuredLength: data.length, configuredMaximum: profile.maxCantileverPlanningLength },
        ),
      );
    }

    const supportColumnId = columnEndCount === 1 && pointEndCount === 1 ? cantileverSupportColumnId(beam) : null;
    if (supportColumnId) {
      const backSpan = findCantileverBackSpan(floor, beam, data, supportColumnId);
      const requiredRatio = profile.minCantileverBackSpanRatio;
      if (!backSpan) {
        issues.push(
          issue(
            'STRUCT.CANTILEVER_NO_BACKSPAN',
            'warning',
            'No continuous back-span member is modeled at this cantilever support; verify how the tail is held down during engineering design.',
            [
              { type: 'beam', id: beam.id },
              { type: 'column', id: supportColumnId },
            ],
            {
              ...baseInputs,
              cantileverLength: data.length,
              alignmentToleranceDegrees: BACKSPAN_ALIGNMENT_DEGREES,
            },
            'verified_relationship',
          ),
        );
      } else if (requiredRatio != null && backSpan.length < requiredRatio * data.length) {
        issues.push(
          issue(
            'STRUCT.CANTILEVER_BACKSPAN_INSUFFICIENT',
            'warning',
            `Back-span is shorter than the configured planning assumption of ${requiredRatio}x the cantilever length.`,
            [
              { type: 'beam', id: beam.id },
              { type: 'beam', id: backSpan.beam.id },
            ],
            {
              ...baseInputs,
              cantileverLength: data.length,
              backSpanLength: backSpan.length,
              measuredRatio: data.length > 0 ? backSpan.length / data.length : null,
              configuredMinimumRatio: requiredRatio,
              alignmentDeviationDegrees: backSpan.deviationDegrees,
            },
          ),
        );
      }
    }
  }

  if (condition === 'transfer') {
    issues.push(
      issue(
        'STRUCT.TRANSFER_CONDITION_REQUIRES_ENGINEER',
        'warning',
        'Transfer-beam intent is modeled and requires explicit structural-engineer design.',
        [{ type: 'beam', id: beam.id }],
        {
          ...baseInputs,
          transferReason: beam.coordination?.transferReason || '',
          supportedElementRefs: beam.coordination?.supportedElementRefs || [],
        },
        'modeled_engineering_intent',
      ),
    );
    if (!beam.coordination?.transferReason?.trim()) {
      issues.push(
        issue(
          'STRUCT.TRANSFER_REASON_MISSING',
          'error',
          'Transfer-beam intent requires a traceable reason.',
          [{ type: 'beam', id: beam.id }],
          { ...baseInputs },
          'verified_relationship',
        ),
      );
    }
  }

  if (condition !== 'cantilever' && configuredMaximum != null && data.length > configuredMaximum) {
    issues.push(
      issue(
        'STRUCT.BEAM_SPAN_EXCEEDS_ASSUMPTION',
        'warning',
        'Beam span exceeds the configured early-planning assumption.',
        [{ type: 'beam', id: beam.id }],
        { ...baseInputs, measuredSpan: data.length, configuredMaximum },
      ),
    );
  }
  return issues;
}

function validateSlabCoordination(floor, slab, profile, floorBelow = null) {
  const issues = [];
  const refs = [{ type: 'slab', id: slab.id }];
  const baseInputs = { profileId: profile.id, profileSource: profile.source, floorId: floor.id };
  const supportRefs = slab.supportRefs || [];
  if (supportRefs.length < 2) {
    issues.push(
      issue(
        'STRUCT.SLAB_SUPPORTS_INCOMPLETE',
        'warning',
        'Slab zone has fewer than two explicit support references.',
        refs,
        { ...baseInputs, supportCount: supportRefs.length, requiredMinimum: 2 },
        'verified_relationship',
      ),
    );
  }
  for (const supportRef of supportRefs) {
    if (resolveSupport([floor, floorBelow], supportRef)) continue;
    issues.push(
      issue(
        'STRUCT.SLAB_SUPPORT_REFERENCE_BROKEN',
        'error',
        'Slab zone references a support that does not exist on its level or the level below.',
        [...refs, { type: supportRef.kind || 'support', id: supportRef.id || 'missing' }],
        { ...baseInputs, supportRef },
        'verified_relationship',
      ),
    );
  }

  const measuredSpan =
    slab.coordination?.spanDirection == null
      ? minimumProjectedWidth(slab.boundaryPoints || [])
      : projectedWidth(slab.boundaryPoints || [], slab.coordination.spanDirection);
  const configuredMaximum = slab.coordination?.maxPlanningSpan ?? profile.maxSlabPlanningSpan;
  if (measuredSpan != null && configuredMaximum != null && measuredSpan > configuredMaximum) {
    issues.push(
      issue(
        'STRUCT.SLAB_SPAN_EXCEEDS_ASSUMPTION',
        'warning',
        'Slab-zone planning span exceeds the configured early-coordination assumption.',
        refs,
        {
          ...baseInputs,
          measuredSpan,
          configuredMaximum,
          spanDirection: slab.coordination?.spanDirection ?? 'minimum_projected_width',
        },
      ),
    );
  }

  for (const opening of slab.openings || []) {
    const openingRefs = [...refs, { type: 'slabOpening', id: opening.id }];
    const openingArea = polygonArea(opening.boundaryPoints || []);
    const withinArea = intersectionArea(slab.boundaryPoints || [], opening.boundaryPoints || []);
    if (openingArea <= 0 || openingArea - withinArea > 1) {
      issues.push(
        issue(
          'STRUCT.SLAB_OPENING_OUTSIDE_ZONE',
          'error',
          'Slab opening is not fully contained by its host slab zone.',
          openingRefs,
          { ...baseInputs, openingArea, withinArea },
          'verified_geometry',
        ),
      );
    }
    for (const beam of floor.beams || []) {
      const data = beamAxis(beam, floor);
      if (!data) continue;
      const overlapArea = intersectionArea(opening.boundaryPoints || [], data.outline);
      if (overlapArea <= 1) continue;
      issues.push(
        issue(
          'STRUCT.SLAB_OPENING_INTERSECTS_BEAM',
          'error',
          'Slab opening intersects a modeled beam in plan.',
          [...openingRefs, { type: 'beam', id: beam.id }],
          { ...baseInputs, overlapArea, units: 'mm²' },
          'verified_geometry',
        ),
      );
    }
  }
  return issues;
}

function validateOpeningsNearColumns(floor, profile) {
  const issues = [];
  const walls = new Map((floor.walls || []).map((wall) => [wall.id, wall]));
  const openings = [
    ...(floor.doors || []).map((entry) => ({ ...entry, kind: 'door' })),
    ...(floor.windows || []).map((entry) => ({ ...entry, kind: 'window' })),
  ];
  for (const opening of openings) {
    const wall = walls.get(opening.wallId);
    if (!wall) continue;
    for (const column of floor.columns || []) {
      const clearance = openingClearanceToColumn(wall, opening, column);
      if (clearance === 0) {
        issues.push(
          issue(
            'STRUCT.OPENING_INTERSECTS_COLUMN',
            'error',
            `${opening.kind === 'door' ? 'Door' : 'Window'} intersects a modeled column.`,
            [
              { type: opening.kind, id: opening.id },
              { type: 'column', id: column.id },
            ],
            {
              profileId: profile.id,
              profileSource: profile.source,
              floorId: floor.id,
              measuredClearance: 0,
              configuredMinimum: profile.minOpeningClearanceFromColumn,
            },
            'verified_geometry',
          ),
        );
        continue;
      }
      if (clearance >= profile.minOpeningClearanceFromColumn) continue;
      issues.push(
        issue(
          'STRUCT.OPENING_NEAR_COLUMN',
          'warning',
          `${opening.kind === 'door' ? 'Door' : 'Window'} is close to a modeled column.`,
          [
            { type: opening.kind, id: opening.id },
            { type: 'column', id: column.id },
          ],
          {
            profileId: profile.id,
            profileSource: profile.source,
            floorId: floor.id,
            measuredClearance: clearance,
            configuredMinimum: profile.minOpeningClearanceFromColumn,
          },
        ),
      );
    }
  }
  return issues;
}

function validateLoadbearingWalls(project) {
  const issues = [];
  for (const floor of project.floors || []) {
    for (const wall of floor.walls || []) {
      if (wall.structuralRole !== 'loadbearing') continue;
      if (!wall.supportRef) {
        issues.push(
          issue(
            'STRUCT.LOADBEARING_WALL_SUPPORT_MISSING',
            'warning',
            'Loadbearing wall has no explicit supporting member or foundation relationship.',
            [{ type: 'wall', id: wall.id }],
            { floorId: floor.id, structuralRole: wall.structuralRole },
            'verified_relationship',
          ),
        );
      }
    }
  }
  return issues;
}

/* ── Walls, and what is under them ───────────────────────────────────────
 *
 * Two questions about the same body, asked in one pass because resolving that
 * body is the expensive part and this runs on every settled edit: does the wall
 * land on anything at all, and does it hang off the edge of what it lands on.
 */

function planBounds(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  }
  return { minX, minY, maxX, maxY };
}

function boundsIntersect(a, b) {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

/**
 * How far the wall's body reaches past every plate on its floor, and whether any
 * of it is on one at all.
 *
 * Measured at the corners of the built body: a rectangle that has left a convex
 * plate has left it at a corner first, and the four of them are what a wall
 * costs to check. A corner outside every plate is reported at its distance to
 * the nearest plate edge, which is the overrun a setback would be measured
 * against.
 */
function wallPlateOverrun(outline, plates) {
  let overrunMm = 0;
  let cornersOnPlate = 0;

  for (const corner of outline) {
    let nearest = Number.POSITIVE_INFINITY;
    let onPlate = false;
    for (const plate of plates) {
      if (pointInPolygon(corner, plate)) {
        onPlate = true;
        break;
      }
      for (let index = 0; index < plate.length; index += 1) {
        nearest = Math.min(nearest, distanceToSegment(corner, plate[index], plate[(index + 1) % plate.length]));
      }
    }
    if (onPlate) {
      cornersOnPlate += 1;
      continue;
    }
    if (Number.isFinite(nearest) && nearest > overrunMm) overrunMm = nearest;
  }

  return { overrunMm, cornersOnPlate };
}

function validateWallBearing(floor, profile) {
  const walls = floor.walls || [];
  if (!walls.length) return [];

  const plates = [];
  const plateBounds = [];
  for (const slab of floor.slabs || []) {
    const boundary = slab.boundaryPoints || [];
    if (boundary.length < 3) continue;
    plates.push(boundary);
    plateBounds.push(planBounds(boundary));
  }

  const bypassWalls = walls.filter((wall) => normalizeWallFramingMode(wall.framingMode) === WALL_FRAMING_MODES.BYPASS);
  // A floor with no plate has nothing for a wall to slide off, and a floor with
  // no bypass wall has nothing to check the bearing of. Most floors are both.
  if (!plates.length && !bypassWalls.length) return [];

  const baseInputs = { profileId: profile.id, profileSource: profile.source, floorId: floor.id };
  const issues = [];

  for (const wall of walls) {
    const outline = plates.length ? getWallRenderData(wall, floor.columns || [])?.outline : null;
    if (!outline || outline.length < 3) continue;
    const bounds = planBounds(outline);
    if (!plateBounds.some((entry) => boundsIntersect(bounds, entry))) continue;

    const { overrunMm, cornersOnPlate } = wallPlateOverrun(outline, plates);
    // Nothing of the wall is on a plate: it is not a wall that slid off its
    // plate, it is a wall somewhere else, and the bypass check below is the one
    // with something to say about it.
    if (!cornersOnPlate) continue;
    // A slab traced to the wall CENTRELINE is a legitimate drawing — the app's
    // own test-fit generator produces exactly that — and half the body then
    // hangs past the edge of every perimeter plate. What this check is for is a
    // wall whose bearing line left the plate, so the allowance is half the
    // built thickness plus the alignment tolerance: an overrun beyond that
    // means the centreline itself is off the slab.
    const allowanceMm = (Number(wall.thickness) || 0) / 2 + STACK_ALIGNMENT_TOLERANCE_MM;
    if (overrunMm <= allowanceMm) continue;

    issues.push(
      issue(
        'STRUCT.WALL_OFF_SLAB_EDGE',
        'warning',
        `Wall body reaches ${Math.round(overrunMm)} mm past the edge of the slab it bears on.`,
        [{ type: 'wall', id: wall.id }],
        {
          ...baseInputs,
          overrun: overrunMm,
          tolerance: STACK_ALIGNMENT_TOLERANCE_MM,
          allowance: allowanceMm,
          outboardOffset: wallOutboardOffset(wall),
          framingMode: normalizeWallFramingMode(wall.framingMode),
        },
        'verified_geometry',
      ),
    );
  }

  for (const wall of bypassWalls) {
    const bearing = resolveWallBaseBearing(wall, floor);
    if (!bearing) continue;
    if (bearing.unsupportedRatio <= BYPASS_WALL_BEARING_SHARE) continue;
    if (bearing.unsupportedRunMm <= BYPASS_WALL_UNSUPPORTED_RUN_MM) continue;

    issues.push(
      issue(
        'STRUCT.BYPASS_WALL_UNSUPPORTED',
        'warning',
        `Bypass wall runs ${Math.round(bearing.unsupportedRunMm)} mm with no slab or beam under it on its own floor.`,
        [{ type: 'wall', id: wall.id }],
        {
          ...baseInputs,
          runLength: bearing.runMm,
          unsupportedRun: bearing.unsupportedRunMm,
          unsupportedRatio: bearing.unsupportedRatio,
          configuredMaximumUnsupportedRatio: BYPASS_WALL_BEARING_SHARE,
          configuredMinimumUnsupportedRun: BYPASS_WALL_UNSUPPORTED_RUN_MM,
          bearingSourceCount: bearing.bearingSourceCount,
          sampleCount: bearing.sampleCount,
        },
        'verified_geometry',
      ),
    );
  }

  return issues;
}

/* ── Bays across storeys ─────────────────────────────────────────────────
 *
 * A `stackId` on a wall says which facade it belongs to, the way a column's
 * says which line it stands on. Unlike a column stack, one storey's share of a
 * wall stack is SEVERAL walls — a bay is a face and two returns — so the checks
 * compare a storey's group against the group below rather than one wall against
 * one wall.
 */

/**
 * How far this wall sits from the one it stacks on. Both pairings of the
 * endpoints are tried because a bay drawn on the storey above is routinely
 * traced the other way round, and a wall drawn end-for-end is in the same place.
 */
function wallAxisDeviationMm(wall, other) {
  const direct = Math.max(distance(wall.start, other.start), distance(wall.end, other.end));
  const reversed = Math.max(distance(wall.start, other.end), distance(wall.end, other.start));
  return Math.min(direct, reversed);
}

/** The wall of the storey below this one lines up with: nearest by midpoint. */
function nearestStackMember(wall, candidates) {
  const centre = midpoint(wall.start, wall.end);
  let best = null;
  for (const candidate of candidates) {
    const gap = distance(centre, midpoint(candidate.wall.start, candidate.wall.end));
    if (!best || gap < best.gap) best = { ...candidate, gap };
  }
  return best;
}

function validateWallStacks(project) {
  const orderedFloors = getOrderedFloors(project);
  const orderedFloorIds = orderedFloors.map((floor) => floor.id);
  const stacks = new Map();

  orderedFloors.forEach((floor, floorIndex) => {
    for (const wall of floor.walls || []) {
      if (!wall.stackId) continue;
      const entry = stacks.get(wall.stackId) || { members: [], floorIndices: new Set() };
      entry.members.push({ wall, floorId: floor.id, floorIndex });
      entry.floorIndices.add(floorIndex);
      stacks.set(wall.stackId, entry);
    }
  });

  const issues = [];
  for (const [stackId, { members, floorIndices }] of stacks) {
    // A bay one storey tall is a bay, not a broken stack. Everything below
    // compares storeys, and there is nothing to compare against.
    if (floorIndices.size < 2) continue;

    const baseIndex = Math.min(...floorIndices);
    const reference = members.filter((member) => member.floorIndex === baseIndex);

    for (const member of members) {
      if (member.floorIndex === baseIndex) continue;
      const partner = nearestStackMember(member.wall, reference);
      if (!partner) continue;

      const axisOffsetMm = wallAxisDeviationMm(member.wall, partner.wall);
      const outboardDeltaMm = Math.abs(wallOutboardOffset(member.wall) - wallOutboardOffset(partner.wall));
      // Either one puts the storeys out of line, so the worse of the two is
      // what the bay is out by — a facade built 200 further out is as misaligned
      // as one drawn 200 further out.
      const offset = Math.max(axisOffsetMm, outboardDeltaMm);
      if (offset <= STACK_ALIGNMENT_TOLERANCE_MM) continue;

      issues.push(
        issue(
          'STRUCT.BAY_STACK_MISALIGNED',
          'warning',
          `Wall is ${Math.round(offset)} mm from the bay stack axis below it.`,
          [
            { type: 'wallStack', id: stackId },
            { type: 'wall', id: member.wall.id },
          ],
          {
            floorId: member.floorId,
            referenceFloorId: partner.floorId,
            referenceWallId: partner.wall.id,
            axisOffset: axisOffsetMm,
            outboardOffsetDelta: outboardDeltaMm,
            offset,
            tolerance: STACK_ALIGNMENT_TOLERANCE_MM,
          },
          'verified_geometry',
        ),
      );
    }

    const lowest = baseIndex;
    const highest = Math.max(...floorIndices);
    for (let index = lowest; index <= highest; index += 1) {
      if (floorIndices.has(index)) continue;
      issues.push(
        issue(
          'STRUCT.BAY_STACK_DISCONTINUITY',
          'warning',
          `Bay stack ${stackId} skips an intermediate level.`,
          [
            { type: 'wallStack', id: stackId },
            { type: 'floor', id: orderedFloorIds[index] },
          ],
          { missingFloorId: orderedFloorIds[index], presentFloorCount: floorIndices.size },
          'verified_geometry',
        ),
      );
    }
  }

  return issues;
}

function slabSoffitLevel(slab, floor) {
  const top = Number.isFinite(slab?.elevation) ? slab.elevation : getFloorElevation(floor);
  const thickness = Number.isFinite(slab?.thickness) ? slab.thickness : 0;
  return top - thickness;
}

/**
 * Every resolvable beam axis in the project, whichever floor it is filed on.
 * Beam levels are absolute, and the beam carrying an upper slab's overhang is
 * normally recorded one storey down — restricting the search to the slab's own
 * floor would report every real cantilever as unsupported.
 */
function projectBeamAxes(project) {
  const axes = [];
  for (const floor of project.floors || []) {
    for (const beam of floor.beams || []) {
      const data = beamAxis(beam, floor);
      if (!data) continue;
      axes.push({ beam, floorId: floor.id, start: data.start, end: data.end });
    }
  }
  return axes;
}

/**
 * Which of a floor's walls stand on these projecting runs.
 *
 * The same plan proximity `beamSupportsOverhang` applies to a beam, applied to
 * the wall's BUILT body: an outboard facade is drawn on the grid line and stands
 * somewhere else, and it is where it stands that the plate feels.
 */
function wallsStandingOnRuns(floor, runs) {
  const columns = floor.columns || [];
  const standing = [];
  for (const wall of floor.walls || []) {
    const rendered = getWallRenderData(wall, columns);
    if (!rendered?.trimStart || !rendered?.trimEnd) continue;
    if (!beamSupportsOverhang({ start: rendered.trimStart, end: rendered.trimEnd }, runs)) continue;
    standing.push(wall);
  }
  return standing;
}

/**
 * Slabs that reach past the storey below them. Planning assumptions only — the
 * depth is measured plan geometry, and what a given depth can actually carry is
 * an engineering question this never answers.
 */
function validateSlabOverhangs(project, profile) {
  const overhangs = computeFloorOverhangs(project);
  if (!overhangs.length) return [];

  const floorsById = new Map((project.floors || []).map((floor) => [floor.id, floor]));
  const beamAxes = projectBeamAxes(project);
  const issues = [];

  for (const overhang of overhangs) {
    const floor = floorsById.get(overhang.floorId);
    const slab = (floor?.slabs || []).find((entry) => entry.id === overhang.slabId);
    if (!slab) continue;

    const refs = [{ type: 'slab', id: slab.id }];
    const baseInputs = {
      profileId: profile.id,
      profileSource: profile.source,
      floorId: overhang.floorId,
      belowFloorId: overhang.belowFloorId,
      measuredOverhang: overhang.maxDepthMm,
    };

    if (overhang.maxDepthMm > profile.maxCantileverPlanningLength) {
      issues.push(
        issue(
          'STRUCT.SLAB_OVERHANG_EXCEEDS_ASSUMPTION',
          'warning',
          'Slab reaches past the floor below by more than the configured early-planning cantilever assumption.',
          refs,
          { ...baseInputs, configuredMaximum: profile.maxCantileverPlanningLength },
          'verified_geometry',
        ),
      );
    }

    if (overhang.maxDepthMm <= OVERHANG_SUPPORT_REVIEW_DEPTH_MM) continue;

    // Runs deep enough to be a cantilever rather than a nib — the same line the
    // support review is drawn at, and the only runs a wall on the tip changes
    // the load case of.
    const deepRuns = (overhang.overhangEdges || []).filter((run) => run.depthMm > OVERHANG_SUPPORT_REVIEW_DEPTH_MM);
    const standing = deepRuns.length ? wallsStandingOnRuns(floor, deepRuns) : [];
    if (standing.length) {
      issues.push(
        issue(
          'STRUCT.CANTILEVER_CARRIES_WALL',
          // Not a fault. A bay is meant to carry its own facade, and the model
          // saying so is the difference between a cantilever checked as a bare
          // plate and one checked as what it is — see the tip line load in
          // `analysis/cantileverStructural`.
          'info',
          `${standing.length} wall(s) stand on this projecting slab edge, so the cantilever carries a line load at its tip.`,
          [...refs, ...standing.map((wall) => ({ type: 'wall', id: wall.id }))],
          {
            ...baseInputs,
            wallIds: standing.map((wall) => wall.id),
            reviewDepthThreshold: OVERHANG_SUPPORT_REVIEW_DEPTH_MM,
            wallProximityAllowance: BEAM_SUPPORT_PROXIMITY_MM,
          },
          'verified_geometry',
        ),
      );
    }

    const soffitLevel = slabSoffitLevel(slab, floor);
    const carried = beamAxes.some(
      (entry) =>
        Number.isFinite(entry.beam.floorLevel) &&
        entry.beam.floorLevel >= soffitLevel - OVERHANG_BEAM_DROP_MM &&
        entry.beam.floorLevel <= soffitLevel + OVERHANG_BEAM_RISE_MM &&
        beamSupportsOverhang(entry, overhang.overhangEdges),
    );
    if (carried) continue;

    issues.push(
      issue(
        'STRUCT.SLAB_OVERHANG_UNSUPPORTED',
        'warning',
        'No modeled beam sits under this projecting slab edge; the overhang has no coordinated support in the model.',
        refs,
        {
          ...baseInputs,
          slabSoffitLevel: soffitLevel,
          reviewDepthThreshold: OVERHANG_SUPPORT_REVIEW_DEPTH_MM,
          beamTopSearchBand: [soffitLevel - OVERHANG_BEAM_DROP_MM, soffitLevel + OVERHANG_BEAM_RISE_MM],
          beamProximityAllowance: BEAM_SUPPORT_PROXIMITY_MM,
        },
        'verified_relationship',
      ),
    );
  }

  return issues;
}

export function validateStructuralCoordination(project, profileOverride = null) {
  const profile = configuredProfile(project, profileOverride);
  const below = floorBelowIndex(project);
  return [
    ...(project.floors || []).flatMap((floor) => [
      ...(floor.beams || []).flatMap((beam) => validateBeamCoordination(floor, beam, profile)),
      ...(floor.slabs || []).flatMap((slab) =>
        validateSlabCoordination(floor, slab, profile, below.get(floor.id) || null),
      ),
      ...validateOpeningsNearColumns(floor, profile),
      ...validateWallBearing(floor, profile),
    ]),
    ...validateLoadbearingWalls(project),
    ...validateWallStacks(project),
    ...validateSlabOverhangs(project, profile),
  ];
}

function nodeId(kind, id) {
  return `${kind}:${id}`;
}

/**
 * Relationship diagram only: no loads, reactions, capacity, or safety result.
 */
export function deriveConceptualLoadPath(project) {
  const nodes = [];
  const edges = [];
  const nodeIds = new Set();
  const below = floorBelowIndex(project);
  const addNode = (node) => {
    if (nodeIds.has(node.id)) return;
    nodeIds.add(node.id);
    nodes.push(node);
  };
  const addEdge = (edge) => edges.push({ id: `${edge.from}->${edge.to}:${edge.kind}`, ...edge });
  const floorIndex = new Map((project.floors || []).map((floor, index) => [floor.id, index]));

  for (const floor of project.floors || []) {
    for (const column of floor.columns || []) {
      addNode({
        id: nodeId('column', column.id),
        kind: 'column',
        entityId: column.id,
        floorId: floor.id,
        point: { x: column.x, y: column.y },
      });
    }
    for (const beam of floor.beams || []) {
      const data = beamAxis(beam, floor);
      if (!data) continue;
      addNode({
        id: nodeId('beam', beam.id),
        kind: 'beam',
        entityId: beam.id,
        floorId: floor.id,
        point: data.midpoint,
        condition: beam.coordination?.condition || 'typical',
      });
      for (const ref of [beam.startRef, beam.endRef]) {
        if (ref?.kind !== 'column') continue;
        addEdge({
          from: nodeId('beam', beam.id),
          to: nodeId('column', ref.id),
          kind: 'beam_to_column',
          floorId: floor.id,
          fromPoint: data.midpoint,
          toPoint: (floor.columns || []).find((column) => column.id === ref.id) || null,
        });
      }
    }
    for (const slab of floor.slabs || []) {
      const center = polygonCentroid(slab.boundaryPoints || []);
      addNode({ id: nodeId('slab', slab.id), kind: 'slab', entityId: slab.id, floorId: floor.id, point: center });
      for (const ref of slab.supportRefs || []) {
        // A cantilevered slab is carried by members filed one storey down, so
        // the level below is part of the search — otherwise the slab reads as
        // unsupported in the graph while standing on a real beam.
        const resolved = resolveSupport([floor, below.get(floor.id) || null], ref);
        if (!resolved) continue;
        const { entity: support, floor: supportFloor } = resolved;
        const supportPoint =
          ref.kind === 'beam'
            ? beamAxis(support, supportFloor)?.midpoint
            : ref.kind === 'wall'
              ? midpoint(support.start, support.end)
              : { x: support.x, y: support.y };
        addEdge({
          from: nodeId('slab', slab.id),
          to: nodeId(ref.kind, ref.id),
          kind: `slab_to_${ref.kind}`,
          floorId: floor.id,
          supportFloorId: supportFloor.id,
          fromPoint: center,
          toPoint: supportPoint,
        });
      }
    }
  }

  for (const stack of project.building?.systems?.structural?.columnStacks || []) {
    const refs = [...(stack.columnRefs || [])].sort(
      (a, b) => (floorIndex.get(b.floorId) || 0) - (floorIndex.get(a.floorId) || 0),
    );
    for (let index = 0; index < refs.length - 1; index += 1) {
      const upper = refs[index];
      const lower = refs[index + 1];
      addEdge({
        from: nodeId('column', upper.columnId),
        to: nodeId('column', lower.columnId),
        kind: 'column_to_column_below',
        floorId: upper.floorId,
        fromPoint: stack.origin,
        toPoint: stack.origin,
      });
    }
  }

  const outgoing = new Map();
  for (const edge of edges) outgoing.set(edge.from, (outgoing.get(edge.from) || 0) + 1);
  const unsupportedNodeIds = nodes
    .filter((node) => ['slab', 'beam'].includes(node.kind) && !outgoing.has(node.id))
    .map((node) => node.id);
  return {
    nodes,
    edges,
    unsupportedNodeIds,
    transferNodeIds: nodes.filter((node) => node.condition === 'transfer').map((node) => node.id),
    summary: {
      nodeCount: nodes.length,
      relationshipCount: edges.length,
      unsupportedNodeCount: unsupportedNodeIds.length,
      transferConditionCount: nodes.filter((node) => node.condition === 'transfer').length,
    },
    resultKind: 'conceptual_relationship_diagram',
    confidence: DESIGN_CONFIDENCE.CHECKED,
    professionalReviewRequired: true,
  };
}

export function structuralProfile(project) {
  return configuredProfile(project);
}
