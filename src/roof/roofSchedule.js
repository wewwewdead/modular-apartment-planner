import { dot, normalize, perpendicular, subtract } from '@/geometry/point';
import { polygonArea, polygonCentroid } from '@/geometry/polygon';
import { buildRoofPlaneGeometry } from '@/geometry/roofPlaneGeometry';
import { getParapetRenderData } from '@/geometry/roofPlanGeometry';
import { buildDerivedRoofDrainage } from './drainage';
import { isRoofAccessOpening, isSkylightRoofOpening, normalizeRoofOpeningType } from './openings';

const EPSILON = 1e-6;

function slopeRatio(roofSystem) {
  return Math.max(0, Number(roofSystem?.pitch?.slope ?? 0)) / 100;
}

function surfaceAreaFactorFromSlope(slope = 0) {
  const ratio = Math.max(0, Number(slope || 0)) / 100;
  return Math.sqrt(1 + (ratio * ratio));
}

function firstNonZeroEdge(points = []) {
  if (points.length < 2) return null;

  for (let index = 0; index < points.length; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    const vector = subtract(end, start);
    if (Math.hypot(vector.x, vector.y) > EPSILON) {
      return { start, end, vector };
    }
  }

  return null;
}

function measureOpeningPlanSize(points = []) {
  if (!points.length) return { length: 0, width: 0 };

  const basisEdge = firstNonZeroEdge(points);
  const axisX = basisEdge
    ? normalize(basisEdge.vector)
    : { x: 1, y: 0 };
  const axisY = perpendicular(axisX);
  const origin = polygonCentroid(points);
  const xValues = points.map((point) => dot(subtract(point, origin), axisX));
  const yValues = points.map((point) => dot(subtract(point, origin), axisY));
  const sizeA = Math.max(0, Math.max(...xValues) - Math.min(...xValues));
  const sizeB = Math.max(0, Math.max(...yValues) - Math.min(...yValues));

  return {
    length: Math.max(sizeA, sizeB),
    width: Math.min(sizeA, sizeB),
  };
}

function buildParapetRows(roofSystem) {
  return (roofSystem?.parapets || [])
    .map((parapet) => {
      const renderData = getParapetRenderData(parapet, roofSystem);
      if (!renderData) return null;

      return {
        id: parapet.id,
        name: parapet.name || `Parapet ${(roofSystem?.parapets || []).findIndex((entry) => entry.id === parapet.id) + 1}`,
        length: renderData.length,
      };
    })
    .filter(Boolean);
}

function buildOpeningRows(roofSystem, roofGeometry) {
  return (roofSystem?.roofOpenings || [])
    .map((opening, index) => {
      const boundaryPoints = opening.boundaryPoints || [];
      const planArea = polygonArea(boundaryPoints);
      const centroid = boundaryPoints.length >= 3 ? polygonCentroid(boundaryPoints) : { x: 0, y: 0 };
      const hostPlane = roofGeometry?.findPlaneAtPoint?.(centroid) || null;
      const surfaceFactor = hostPlane
        ? (hostPlane.surfaceFactor || surfaceAreaFactorFromSlope(hostPlane.slope))
        : surfaceAreaFactorFromSlope(roofSystem?.pitch?.slope || 0);
      const surfaceArea = planArea * surfaceFactor;
      const dimensions = measureOpeningPlanSize(boundaryPoints);
      const type = normalizeRoofOpeningType(opening.type);
      const category = isSkylightRoofOpening(type)
        ? 'skylight'
        : (isRoofAccessOpening(type) ? 'access' : 'opening');

      return {
        id: opening.id,
        name: opening.name || `${category === 'skylight' ? 'Skylight' : 'Opening'} ${index + 1}`,
        type,
        category,
        length: dimensions.length,
        width: dimensions.width,
        planArea,
        surfaceArea,
        curbHeight: Math.max(0, Number(opening.curbHeight) || 0),
      };
    })
    .filter((opening) => opening.planArea > EPSILON || opening.length > EPSILON || opening.width > EPSILON);
}

export function buildRoofScheduleSummary(roofSystem) {
  if (!roofSystem || (roofSystem.boundaryPolygon || []).length < 3) {
    return {
      roofId: roofSystem?.id || null,
      roofName: roofSystem?.name || 'Roof',
      roofType: roofSystem?.roofType || 'flat',
      title: 'Roof Schedule',
      grossPlanArea: 0,
      grossSurfaceArea: 0,
      openingPlanArea: 0,
      openingSurfaceArea: 0,
      netPlanArea: 0,
      netSurfaceArea: 0,
      parapetCount: 0,
      parapetLengthTotal: 0,
      gutterRunCount: 0,
      gutterLengthTotal: 0,
      gutterSource: 'derived_roof_edges',
      downspoutCount: 0,
      downspoutSource: 'derived_from_gutters',
      drainCount: 0,
      openingCount: 0,
      skylightCount: 0,
      roofOpeningCount: 0,
      accessOpeningCount: 0,
      parapets: [],
      gutters: [],
      openings: [],
      notes: ['No roof geometry is available for scheduling.'],
    };
  }

  const roofGeometry = buildRoofPlaneGeometry(roofSystem);
  const roofOutline = roofGeometry.roofOutline || roofSystem.boundaryPolygon || [];
  const grossPlanArea = polygonArea(roofOutline);
  const grossSurfaceArea = (roofGeometry.planes || []).length
    ? (roofGeometry.planes || []).reduce((sum, plane) => (
        sum + (polygonArea(plane.outline || []) * (plane.surfaceFactor || surfaceAreaFactorFromSlope(plane.slope)))
      ), 0)
    : (grossPlanArea * surfaceAreaFactorFromSlope(roofSystem?.pitch?.slope || 0));
  const parapets = buildParapetRows(roofSystem);
  const { gutters, downspouts } = buildDerivedRoofDrainage(roofSystem);
  const openings = buildOpeningRows(roofSystem, roofGeometry);
  const openingPlanArea = openings.reduce((sum, opening) => sum + opening.planArea, 0);
  const openingSurfaceArea = openings.reduce((sum, opening) => sum + opening.surfaceArea, 0);
  const skylightCount = openings.filter((opening) => opening.category === 'skylight').length;
  const accessOpeningCount = openings.filter((opening) => opening.category === 'access').length;
  const roofOpeningCount = openings.filter((opening) => opening.category === 'opening').length;
  const notes = [];

  if ((roofSystem.roofType || 'flat') === 'flat') {
    notes.push('Gutter and downspout quantities are zero for flat roofs until explicit gutter objects are added.');
  } else {
    notes.push('Gutter lengths and downspout counts are derived from eave edges for the current roof type.');
  }
  if ((roofSystem?.trussAttachmentId || null) && roofSystem?.attachedShapeProfile?.points?.length >= 2) {
    notes.push('Attached roof surface area is derived from the truss-driven roof shape profile, not a single generic pitch factor.');
  }

  if ((roofSystem?.roofOpenings || []).some((opening) => !opening.type || normalizeRoofOpeningType(opening.type) === 'opening')) {
    notes.push('Roof openings with type "skylight" are counted as skylights; all other roof openings remain general openings.');
  }
  if (accessOpeningCount > 0) {
    notes.push('Roof openings with type "hatch" or "access" remain part of the opening schedule and can be linked to top-level stairs.');
  }

  return {
    roofId: roofSystem.id,
    roofName: roofSystem.name || 'Roof',
    roofType: roofSystem.roofType || 'flat',
    title: roofSystem.name ? `${roofSystem.name} Schedule` : 'Roof Schedule',
    grossPlanArea,
    grossSurfaceArea,
    openingPlanArea,
    openingSurfaceArea,
    netPlanArea: Math.max(0, grossPlanArea - openingPlanArea),
    netSurfaceArea: Math.max(0, grossSurfaceArea - openingSurfaceArea),
    parapetCount: parapets.length,
    parapetLengthTotal: parapets.reduce((sum, parapet) => sum + parapet.length, 0),
    gutterRunCount: gutters.length,
    gutterLengthTotal: gutters.reduce((sum, gutter) => sum + gutter.length, 0),
    gutterSource: 'derived_roof_edges',
    downspoutCount: downspouts.length,
    downspoutSource: 'derived_from_gutters',
    drainCount: (roofSystem.drains || []).length,
    openingCount: openings.length,
    skylightCount,
    accessOpeningCount,
    roofOpeningCount,
    parapets,
    gutters,
    openings,
    notes,
  };
}
