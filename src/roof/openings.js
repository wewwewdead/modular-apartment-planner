import { polygonCentroid } from '@/geometry/polygon';

export function normalizeRoofOpeningType(type = 'opening') {
  return String(type || 'opening').trim().toLowerCase();
}

export function isSkylightRoofOpening(type = 'opening') {
  const normalized = normalizeRoofOpeningType(type);
  return normalized === 'skylight' || normalized.includes('sky');
}

export function isRoofAccessOpening(type = 'opening') {
  const normalized = normalizeRoofOpeningType(type);
  return normalized === 'hatch' || normalized.includes('access');
}

export function getRoofOpeningCenter(opening = null) {
  const boundaryPoints = opening?.boundaryPoints || [];
  if (boundaryPoints.length >= 3) {
    return polygonCentroid(boundaryPoints);
  }
  if (boundaryPoints.length) {
    return { x: boundaryPoints[0].x, y: boundaryPoints[0].y };
  }
  return { x: 0, y: 0 };
}

export function findRoofOpeningById(roofSystem, roofOpeningId) {
  if (!roofSystem || !roofOpeningId) return null;
  return (roofSystem.roofOpenings || []).find((opening) => opening.id === roofOpeningId) || null;
}

export function listRoofAccessOpenings(roofSystem) {
  return (roofSystem?.roofOpenings || []).filter((opening) => isRoofAccessOpening(opening.type));
}
