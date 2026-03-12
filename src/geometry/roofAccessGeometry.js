import { getFloorElevation } from '@/domain/floorModels';
import { buildRoofPlaneGeometry } from './roofPlaneGeometry';
import { getStairRenderData, stairTotalRise } from './stairGeometry';
import { projectPointToSectionCut, sectionCutLength } from './sectionCutGeometry';
import { findRoofOpeningById, getRoofOpeningCenter } from '@/roof/openings';

const EPSILON = 1e-6;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function resolveStairBaseElevation(stair, floor, landingElevationMap) {
  const floorElevation = getFloorElevation(floor);
  if (!stair.startLandingAttachment) return floorElevation;

  const landingElevation = landingElevationMap?.get(stair.startLandingAttachment.landingId);
  return landingElevation != null
    ? floorElevation + landingElevation
    : floorElevation;
}

export function buildStairRoofAccessSectionElement({
  stair,
  floor,
  roofSystem,
  sectionCut,
  landingElevationMap,
}) {
  const roofOpeningId = stair?.roofAccess?.roofOpeningId || null;
  if (!roofSystem || !sectionCut || !roofOpeningId) return null;

  const roofOpening = findRoofOpeningById(roofSystem, roofOpeningId);
  if (!roofOpening) return null;

  const renderData = getStairRenderData(stair);
  if (!renderData) return null;

  const roofGeometry = buildRoofPlaneGeometry(roofSystem);
  const stairTopPoint = renderData.endPoint;
  const roofOpeningCenter = getRoofOpeningCenter(roofOpening);
  const stairProjection = projectPointToSectionCut(sectionCut, stairTopPoint);
  const roofOpeningProjection = projectPointToSectionCut(sectionCut, roofOpeningCenter);

  if (stairProjection.offset < -EPSILON || stairProjection.offset > sectionCut.depth + EPSILON) return null;
  if (roofOpeningProjection.offset < -EPSILON || roofOpeningProjection.offset > sectionCut.depth + EPSILON) return null;

  const stairTopElevation = resolveStairBaseElevation(stair, floor, landingElevationMap) + stairTotalRise(stair);
  const accessTopElevation = roofGeometry.getSurfaceElevation(roofOpeningCenter, 'top')
    + Math.max(0, Number(roofOpening.curbHeight) || 0);
  const stairAlong = clamp(stairProjection.along, 0, sectionCutLength(sectionCut));
  const roofOpeningAlong = clamp(roofOpeningProjection.along, 0, sectionCutLength(sectionCut));

  const points = [{ x: stairAlong, z: stairTopElevation }];
  if (Math.abs(accessTopElevation - stairTopElevation) > EPSILON) {
    points.push({ x: stairAlong, z: accessTopElevation });
  }
  if (Math.abs(roofOpeningAlong - stairAlong) > EPSILON) {
    points.push({ x: roofOpeningAlong, z: accessTopElevation });
  }

  if (points.length < 2) return null;

  return {
    id: `roof-access-${stair.id}-${roofOpening.id}`,
    category: 'stair',
    renderMode: (Math.abs(stairProjection.offset) < EPSILON && Math.abs(roofOpeningProjection.offset) < EPSILON)
      ? 'cut'
      : 'projection',
    points,
    depth: Math.max(0, (Math.max(0, stairProjection.offset) + Math.max(0, roofOpeningProjection.offset)) / 2),
    sourceId: stair.id,
  };
}
