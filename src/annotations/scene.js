import { createAnnotationSettings } from '@/domain/models';
import { buildManualDimensionFigures, buildOverallDimensionFigures, buildRoomDimensionFigures, buildWallDimensionFigures, hitTestDimensionFigure } from './dimensions';
import { buildAnnotationTags } from './tags';

export function resolveAnnotationSettings(floor) {
  return createAnnotationSettings(floor?.annotationSettings || {});
}

export function buildAnnotationScene(floor) {
  if (!floor) {
    return {
      dimensions: [],
      manualDimensions: [],
      tags: [],
    };
  }

  const settings = resolveAnnotationSettings(floor);
  const manualDimensions = buildManualDimensionFigures(floor.annotations || []);
  const derivedDimensions = [
    ...(settings.showWallDimensions ? buildWallDimensionFigures(floor.walls || [], floor.columns || []) : []),
    ...(settings.showRoomDimensions ? buildRoomDimensionFigures(floor.rooms || []) : []),
    ...(settings.showOverallDimensions ? buildOverallDimensionFigures(floor.walls || [], floor.columns || []) : []),
  ];

  return {
    dimensions: [...derivedDimensions, ...manualDimensions],
    manualDimensions,
    tags: settings.showObjectTags ? buildAnnotationTags(floor) : [],
  };
}

export function getManualAnnotationFigure(floor, annotationId) {
  return buildManualDimensionFigures(floor?.annotations || []).find((figure) => figure.id === annotationId) || null;
}

export function hitTestAnnotation(point, floor, tolerance) {
  const manualFigures = buildManualDimensionFigures(floor?.annotations || []);

  for (let index = manualFigures.length - 1; index >= 0; index -= 1) {
    const figure = manualFigures[index];
    if (hitTestDimensionFigure(point, figure, tolerance)) {
      return { id: figure.id, type: 'annotation' };
    }
  }

  return null;
}
