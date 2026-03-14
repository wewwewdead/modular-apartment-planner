import { getFloorElevation } from '@/domain/floorModels';
import { projectPlanPoints } from '@/elevations/projection';
import { getRailingRenderData } from './railingGeometry';

const EPSILON = 1e-6;
const HANDRAIL_BAND_HEIGHT = 38;

function createSceneRect(id, category, projection, bottom, top, options = {}) {
  if (!projection) return null;
  if (Math.abs(projection.right - projection.left) < EPSILON) return null;
  if (Math.abs(top - bottom) < EPSILON) return null;

  return {
    id,
    category,
    left: projection.left,
    right: projection.right,
    bottom,
    top,
    depth: projection.depth,
    style: options.style || category,
    sourceId: options.sourceId || null,
  };
}

function createSceneLine(id, category, projection, elevation, options = {}) {
  if (!projection) return null;
  if (Math.abs(projection.right - projection.left) < EPSILON) return null;

  return {
    id,
    category,
    depth: projection.depth,
    style: options.style || category,
    sourceId: options.sourceId || null,
    start: { x: projection.left, z: elevation },
    end: { x: projection.right, z: elevation },
  };
}

export function buildRailingElevationElements(floor, view) {
  if (!floor || !view) {
    return {
      elements: [],
      lineElements: [],
    };
  }

  const floorElevation = getFloorElevation(floor);
  const elements = [];
  const lineElements = [];

  for (const railing of floor.railings || []) {
    const renderData = getRailingRenderData(railing);
    if (!renderData) continue;

    const projection = projectPlanPoints(view, renderData.outline || []);
    if (!projection) continue;

    const topElevation = floorElevation + Math.max(0, railing.height ?? 0);

    if (railing.type === 'handrail') {
      const line = createSceneLine(
        `railing-elev-${railing.id}`,
        'railing',
        projection,
        topElevation,
        {
          style: 'railingHandrail',
          sourceId: railing.id,
        }
      );
      if (line) lineElements.push(line);

      const band = createSceneRect(
        `railing-elev-band-${railing.id}`,
        'railing',
        projection,
        Math.max(floorElevation, topElevation - HANDRAIL_BAND_HEIGHT),
        topElevation,
        {
          style: 'railingHandrailBand',
          sourceId: railing.id,
        }
      );
      if (band) elements.push(band);
      continue;
    }

    const element = createSceneRect(
      `railing-elev-${railing.id}`,
      'railing',
      projection,
      floorElevation,
      topElevation,
      {
        style: railing.type === 'glass' ? 'railingGlass' : 'railingGuardrail',
        sourceId: railing.id,
      }
    );
    if (element) elements.push(element);
  }

  return {
    elements,
    lineElements,
  };
}
