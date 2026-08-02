import { DESIGN_CONFIDENCE } from './trustModels';
import { polygonArea, signedPolygonArea } from '@/geometry/polygon';
import { intersectionArea } from '@/geometry/polygonBoolean';

const EPSILON = 1e-6;

export const AREA_PROVENANCE = Object.freeze({
  EXACT_GEOMETRY: 'exact_from_geometry',
  CONFIGURED_DERIVATION: 'derived_from_configured_assumption',
  UNAVAILABLE: 'unavailable',
});

function clonePoints(points = []) {
  const cloned = points.map((point) => ({ x: point.x, y: point.y }));
  if (cloned.length > 1 && cloned[0].x === cloned[cloned.length - 1].x && cloned[0].y === cloned[cloned.length - 1].y) {
    cloned.pop();
  }
  return cloned;
}

function orientation(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function pointOnSegment(point, start, end) {
  return (
    Math.abs(orientation(start, end, point)) <= EPSILON &&
    point.x >= Math.min(start.x, end.x) - EPSILON &&
    point.x <= Math.max(start.x, end.x) + EPSILON &&
    point.y >= Math.min(start.y, end.y) - EPSILON &&
    point.y <= Math.max(start.y, end.y) + EPSILON
  );
}

function segmentsIntersect(a, b, c, d) {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  if (
    ((abC > EPSILON && abD < -EPSILON) || (abC < -EPSILON && abD > EPSILON)) &&
    ((cdA > EPSILON && cdB < -EPSILON) || (cdA < -EPSILON && cdB > EPSILON))
  ) {
    return true;
  }
  return (
    (Math.abs(abC) <= EPSILON && pointOnSegment(c, a, b)) ||
    (Math.abs(abD) <= EPSILON && pointOnSegment(d, a, b)) ||
    (Math.abs(cdA) <= EPSILON && pointOnSegment(a, c, d)) ||
    (Math.abs(cdB) <= EPSILON && pointOnSegment(b, c, d))
  );
}

export function isSimplePolygon(points = []) {
  const polygon = clonePoints(points);
  if (polygon.length < 3 || polygonArea(polygon) <= EPSILON) return false;
  for (let first = 0; first < polygon.length; first += 1) {
    const firstNext = (first + 1) % polygon.length;
    for (let second = first + 1; second < polygon.length; second += 1) {
      const secondNext = (second + 1) % polygon.length;
      const adjacent = first === second || firstNext === second || secondNext === first;
      if (adjacent) continue;
      if (segmentsIntersect(polygon[first], polygon[firstNext], polygon[second], polygon[secondNext])) return false;
    }
  }
  return true;
}

export function isConvexPolygon(points = []) {
  const polygon = clonePoints(points);
  if (!isSimplePolygon(polygon)) return false;
  let sign = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const cross = orientation(
      polygon[index],
      polygon[(index + 1) % polygon.length],
      polygon[(index + 2) % polygon.length],
    );
    if (Math.abs(cross) <= EPSILON) continue;
    const nextSign = Math.sign(cross);
    if (sign && sign !== nextSign) return false;
    sign = nextSign;
  }
  return Boolean(sign);
}

function clipToHalfPlane(points, linePoint, inwardNormal) {
  if (!points.length) return [];
  const result = [];
  const signedDistance = (point) => (point.x - linePoint.x) * inwardNormal.x + (point.y - linePoint.y) * inwardNormal.y;

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const previous = points[(index + points.length - 1) % points.length];
    const currentDistance = signedDistance(current);
    const previousDistance = signedDistance(previous);
    const currentInside = currentDistance >= -EPSILON;
    const previousInside = previousDistance >= -EPSILON;

    if (currentInside !== previousInside) {
      const denominator = previousDistance - currentDistance;
      const t = Math.abs(denominator) <= EPSILON ? 0 : previousDistance / denominator;
      result.push({
        x: previous.x + (current.x - previous.x) * t,
        y: previous.y + (current.y - previous.y) * t,
      });
    }
    if (currentInside) result.push({ ...current });
  }
  return result;
}

export function deriveBuildableEnvelope(site = {}) {
  const boundary = clonePoints(site.boundary || []);
  if (!isSimplePolygon(boundary)) {
    return { status: 'invalid_boundary', points: [], inputs: { boundary, edgeSetbacks: site.edgeSetbacks || [] } };
  }
  if (!isConvexPolygon(boundary)) {
    return { status: 'manual_required', points: [], inputs: { boundary, edgeSetbacks: site.edgeSetbacks || [] } };
  }

  const setbacks = new Map((site.edgeSetbacks || []).map((entry) => [entry.edgeIndex, entry.distance]));
  const complete = boundary.every((_, index) => Number.isFinite(setbacks.get(index)) && setbacks.get(index) >= 0);
  let points = clonePoints(boundary);
  const counterClockwise = signedPolygonArea(boundary) > 0;

  for (let index = 0; index < boundary.length; index += 1) {
    const start = boundary[index];
    const end = boundary[(index + 1) % boundary.length];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length <= EPSILON) {
      return { status: 'invalid_boundary', points: [], inputs: { boundary, edgeSetbacks: site.edgeSetbacks || [] } };
    }
    const normal = counterClockwise ? { x: -dy / length, y: dx / length } : { x: dy / length, y: -dx / length };
    const distance = setbacks.get(index) ?? 0;
    const shiftedPoint = { x: start.x + normal.x * distance, y: start.y + normal.y * distance };
    points = clipToHalfPlane(points, shiftedPoint, normal);
    if (points.length < 3 || polygonArea(points) <= EPSILON) {
      return {
        status: 'empty',
        points: [],
        inputs: { boundary, edgeSetbacks: site.edgeSetbacks || [] },
      };
    }
  }

  return {
    status: complete ? 'checked' : 'incomplete_setbacks',
    points,
    inputs: { boundary, edgeSetbacks: site.edgeSetbacks || [] },
  };
}

function areaMetric(value, provenance, inputs = {}) {
  return { value, unit: 'mm2', provenance, inputs };
}

function ratioMetric(value, provenance, inputs = {}) {
  return { value, unit: 'ratio', provenance, inputs };
}

export function deriveAreaLedger(project) {
  const site = project?.building?.site || {};
  const boundary = clonePoints(site.boundary || []);
  const envelope = deriveBuildableEnvelope(site);
  const lotArea = isSimplePolygon(boundary) ? polygonArea(boundary) : null;
  const buildableArea = envelope.points.length >= 3 ? polygonArea(envelope.points) : null;
  const orderedFloors = project?.floors || [];
  const slabAreaByFloor = orderedFloors.map((floor) =>
    (floor.slabs || []).reduce((sum, slab) => sum + polygonArea(slab.boundaryPoints || []), 0),
  );
  const grossFloorArea = slabAreaByFloor.reduce((sum, area) => sum + area, 0);
  const groundCoverage = slabAreaByFloor[0] || 0;
  const rentableRooms = orderedFloors
    .flatMap((floor) => floor.rooms || [])
    .filter((room) => room.useCategory === 'rentable');
  const roomsByCategory = new Map();
  for (const room of orderedFloors.flatMap((floor) => floor.rooms || [])) {
    if (!room.useCategory) continue;
    roomsByCategory.set(
      room.useCategory,
      (roomsByCategory.get(room.useCategory) || 0) + (room.area || polygonArea(room.points || [])),
    );
  }
  const netRentableArea = rentableRooms.length
    ? rentableRooms.reduce((sum, room) => sum + (room.area || polygonArea(room.points || [])), 0)
    : null;

  return {
    lotArea: areaMetric(lotArea, lotArea == null ? AREA_PROVENANCE.UNAVAILABLE : AREA_PROVENANCE.EXACT_GEOMETRY, {
      boundaryPointCount: boundary.length,
    }),
    buildableArea: areaMetric(
      buildableArea,
      buildableArea == null ? AREA_PROVENANCE.UNAVAILABLE : AREA_PROVENANCE.CONFIGURED_DERIVATION,
      { envelopeStatus: envelope.status },
    ),
    grossFloorArea: areaMetric(grossFloorArea, AREA_PROVENANCE.EXACT_GEOMETRY, {
      source: 'modeled_slab_boundaries',
      floorAreas: slabAreaByFloor,
    }),
    netRentableArea: areaMetric(
      netRentableArea,
      netRentableArea == null ? AREA_PROVENANCE.UNAVAILABLE : AREA_PROVENANCE.EXACT_GEOMETRY,
      { classifiedRoomCount: rentableRooms.length },
    ),
    circulationArea: areaMetric(
      roomsByCategory.get('circulation') ?? null,
      roomsByCategory.has('circulation') ? AREA_PROVENANCE.EXACT_GEOMETRY : AREA_PROVENANCE.UNAVAILABLE,
      { source: 'rooms_classified_as_circulation' },
    ),
    serviceArea: areaMetric(
      roomsByCategory.get('service') ?? null,
      roomsByCategory.has('service') ? AREA_PROVENANCE.EXACT_GEOMETRY : AREA_PROVENANCE.UNAVAILABLE,
      { source: 'rooms_classified_as_service' },
    ),
    sharedArea: areaMetric(
      roomsByCategory.get('shared') ?? null,
      roomsByCategory.has('shared') ? AREA_PROVENANCE.EXACT_GEOMETRY : AREA_PROVENANCE.UNAVAILABLE,
      { source: 'rooms_classified_as_shared' },
    ),
    parkingArea: areaMetric(
      roomsByCategory.get('parking') ?? null,
      roomsByCategory.has('parking') ? AREA_PROVENANCE.EXACT_GEOMETRY : AREA_PROVENANCE.UNAVAILABLE,
      { source: 'rooms_classified_as_parking' },
    ),
    openSpaceArea: areaMetric(
      lotArea == null ? null : Math.max(0, lotArea - groundCoverage),
      lotArea == null ? AREA_PROVENANCE.UNAVAILABLE : AREA_PROVENANCE.EXACT_GEOMETRY,
      { lotArea, groundCoverage },
    ),
    siteCoverageRatio: ratioMetric(
      lotArea > 0 ? groundCoverage / lotArea : null,
      lotArea > 0 ? AREA_PROVENANCE.EXACT_GEOMETRY : AREA_PROVENANCE.UNAVAILABLE,
      { groundCoverage, lotArea },
    ),
    efficiencyRatio: ratioMetric(
      grossFloorArea > 0 && netRentableArea != null ? netRentableArea / grossFloorArea : null,
      grossFloorArea > 0 && netRentableArea != null ? AREA_PROVENANCE.EXACT_GEOMETRY : AREA_PROVENANCE.UNAVAILABLE,
      { netRentableArea, grossFloorArea },
    ),
  };
}

function siteIssue(ruleId, severity, message, entityRefs, inputs, resultKind = 'verified_geometry') {
  return {
    id: `${ruleId}:${entityRefs.map((ref) => `${ref.type}:${ref.id}`).join('|')}`,
    ruleId,
    category: 'site_feasibility',
    severity,
    message,
    entityRefs,
    evidence: { resultKind, confidence: DESIGN_CONFIDENCE.CHECKED, inputs },
    professionalReviewRequired: true,
  };
}

export function validateSiteCoordination(project) {
  const site = project?.building?.site;
  if (!site?.boundary?.length) return [];
  const refs = [{ type: 'site', id: site.boundaryId || `${project.building.id}_site` }];
  if (!isSimplePolygon(site.boundary)) {
    return [
      siteIssue(
        'SITE.PROPERTY_BOUNDARY_INVALID',
        'error',
        'Property boundary must be a simple non-zero-area polygon.',
        refs,
        {
          boundary: site.boundary,
        },
      ),
    ];
  }

  const issues = [];
  const envelope = deriveBuildableEnvelope(site);
  if (envelope.status === 'manual_required') {
    issues.push(
      siteIssue(
        'SITE.CONCAVE_SETBACK_MANUAL_REQUIRED',
        'warning',
        'Automatic setback generation supports convex lots; this concave lot requires a confirmed manual envelope.',
        refs,
        envelope.inputs,
        'configured_rule_check',
      ),
    );
    return issues;
  }
  if (envelope.status === 'incomplete_setbacks') {
    issues.push(
      siteIssue(
        'SITE.SETBACKS_INCOMPLETE',
        'warning',
        'Every property edge needs an explicit configured setback before the buildable envelope is complete.',
        refs,
        envelope.inputs,
        'configured_rule_check',
      ),
    );
  }
  if (envelope.status === 'empty') {
    issues.push(
      siteIssue(
        'SITE.BUILDABLE_ENVELOPE_EMPTY',
        'error',
        'Configured setbacks leave no buildable area.',
        refs,
        envelope.inputs,
      ),
    );
    return issues;
  }

  if (envelope.points.length >= 3) {
    const groundFloor = project.floors?.[0];
    for (const slab of groundFloor?.slabs || []) {
      const slabArea = polygonArea(slab.boundaryPoints || []);
      const overlap = intersectionArea(slab.boundaryPoints || [], envelope.points);
      if (slabArea - overlap > 1) {
        issues.push(
          siteIssue(
            'SITE.GROUND_SLAB_OUTSIDE_BUILDABLE_ENVELOPE',
            'error',
            'A ground-floor slab extends outside the configured buildable envelope.',
            [...refs, { type: 'slab', id: slab.id }],
            { slabArea, overlapArea: overlap, outsideArea: slabArea - overlap, envelopeStatus: envelope.status },
          ),
        );
      }
    }
  }
  return issues;
}

export function deriveSiteFeasibility(project) {
  const site = project?.building?.site || {};
  return {
    buildableEnvelope: deriveBuildableEnvelope(site),
    areaLedger: deriveAreaLedger(project),
  };
}
