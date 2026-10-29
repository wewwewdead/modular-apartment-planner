import { createAnnotationSettings } from '@/domain/models';
import {
  buildManualDimensionFigures,
  buildOverallDimensionFigures,
  buildRoomDimensionFigures,
  buildWallDimensionFigures,
  hitTestDimensionFigure,
} from './dimensions';
import { buildAnnotationTags } from './tags';

export function resolveAnnotationSettings(floor) {
  return createAnnotationSettings(floor?.annotationSettings || {});
}

/**
 * `settingsOverrides` lets a view opt out of annotation classes the floor's own
 * settings would draw, without touching those settings: they are project data
 * shared by every consumer of this scene — the sheets, the documentation
 * counts — while what the working canvas suppresses is a property of that
 * canvas, not of the floor.
 */
export function buildAnnotationScene(floor, settingsOverrides = null) {
  if (!floor) {
    return {
      dimensions: [],
      manualDimensions: [],
      tags: [],
    };
  }

  const settings = settingsOverrides
    ? { ...resolveAnnotationSettings(floor), ...settingsOverrides }
    : resolveAnnotationSettings(floor);
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
